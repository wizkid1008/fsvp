import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "edge";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateToken() {
  // 32 random bytes as hex — sufficient for invite tokens
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  const supabase = createServerSupabaseClient();

  // Must be authenticated
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  // Must have a supplier record (i.e. be an exporter)
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("supplier_id, full_name, organization_name")
    .eq("id", user.id)
    .maybeSingle();

  const exporterId: string | null = profile?.supplier_id ?? null;
  if (!exporterId) {
    return NextResponse.json({ error: "Your account is not linked to an exporter record." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    company_name?: string;
    contact_email?: string;
    contact_name?: string;
    country?: string;
    notes?: string;
    supplier_type?: string;
  };

  const companyName = body.company_name?.trim() ?? "";
  const contactEmail = body.contact_email?.trim().toLowerCase() ?? "";
  const contactName  = body.contact_name?.trim() ?? "";
  const country      = body.country?.trim() ?? "US";
  const notes        = body.notes?.trim() ?? null;
  const supplierType = ["manufacturer", "trader", "broker", "exporter_manufacturer"].includes(body.supplier_type ?? "")
    ? body.supplier_type!
    : "manufacturer";

  if (!companyName) {
    return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  }
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    // 1. Find or create the supplier record for this company
    let supplierId: string | null = null;

    // Check if a suppliers row with this name already exists
    const { data: existingSupplier } = await (supabase.from("suppliers") as any)
      .select("id")
      .ilike("company_name", companyName)
      .maybeSingle();

    if (existingSupplier?.id) {
      supplierId = existingSupplier.id;
    } else {
      // Create a new suppliers row for this upstream supplier
      const { data: newSupplier, error: createError } = await (supabase.from("suppliers") as any)
        .insert({
          company_name:      companyName,
          legal_entity_name: companyName,
          country,
          contact_json:      contactName || contactEmail
            ? { name: contactName || null, email: contactEmail || null }
            : {},
          supplier_type:     supplierType,
          approval_status:   "pending_review",
          certification_status: "pending_review",
          address_json:      {},
        })
        .select("id")
        .maybeSingle();

      if (createError) throw createError;
      supplierId = newSupplier?.id ?? null;
    }

    if (!supplierId) {
      return NextResponse.json({ error: "Could not create supplier record." }, { status: 500 });
    }

    // 2. Check for an existing link
    const { data: existingLink } = await (supabase.from("exporter_supplier_links") as any)
      .select("id, status")
      .eq("exporter_id", exporterId)
      .eq("supplier_id", supplierId)
      .maybeSingle();

    if (existingLink) {
      if (existingLink.status === "active") {
        return NextResponse.json({ error: "This supplier is already linked to your account." }, { status: 409 });
      }
      // Re-activate declined/terminated link
      await (supabase.from("exporter_supplier_links") as any)
        .update({ status: "pending_invite", invite_email: contactEmail || null, invite_sent_at: new Date().toISOString() })
        .eq("id", existingLink.id);
    } else {
      // 3. Create the link record
      const token = generateToken();
      const { error: linkError } = await (supabase.from("exporter_supplier_links") as any)
        .insert({
          exporter_id:           exporterId,
          supplier_id:           supplierId,
          status:                contactEmail ? "pending_invite" : "active",
          invite_email:          contactEmail || null,
          invite_token:          contactEmail ? token : null,
          invite_sent_at:        contactEmail ? new Date().toISOString() : null,
          accepted_at:           contactEmail ? null : new Date().toISOString(),
          invited_by_profile_id: user.id,
          notes,
        });

      if (linkError) throw linkError;

      // 4. If email provided, send invite via Supabase admin
      if (contactEmail) {
        try {
          const adminSupabase = createAdminSupabaseClient();
          const acceptUrl = new URL(`/accept-invite?token=${token}`, request.url).toString();

          // Check if user already has an account
          const { data: existingProfile } = await (adminSupabase.from("profiles") as any)
            .select("id")
            .ilike("email", contactEmail)
            .maybeSingle();

          if (!existingProfile) {
            // New user — send Supabase invite email
            await adminSupabase.auth.admin.inviteUserByEmail(contactEmail, {
              data: {
                full_name: contactName || undefined,
                organization_name: companyName,
                role: "supplier",
              },
              redirectTo: acceptUrl,
            });
          }
          // If they already have an account they'll see the pending invite on their dashboard
        } catch {
          // Non-fatal — link was created, email failed silently
        }
      }
    }

    // Link the profile to the supplier record if email matches an existing account
    if (contactEmail) {
      const { data: matchedProfile } = await (supabase.from("profiles") as any)
        .select("id, supplier_id")
        .ilike("email", contactEmail)
        .maybeSingle();

      if (matchedProfile && !matchedProfile.supplier_id) {
        await (supabase.from("profiles") as any)
          .update({ supplier_id: supplierId })
          .eq("id", matchedProfile.id);
      }
    }

    return NextResponse.json({ ok: true, supplier_id: supplierId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create supplier link.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
