// GET ?name= — search FDA's Product Code Builder for products matching a name.
//
// Used in two places, both of them moments where somebody is trying to say what
// a product IS: an importer raising a classification request, and an
// administrator answering one. FDA's product names are the closest thing to a
// controlled vocabulary either party has, so showing them beats both sides
// inventing wording independently.
//
// What comes back is a list of FDA PRODUCT NAMES, not an admissibility answer
// and not a classification. Choosing among them is the judgement being made.

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pcbCredentialsFromEnv, searchProductsByName, PcbError } from "@/lib/regulatory/product-code-builder";

export const runtime = "edge";

const MAX_ROWS = 50;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "us_importer" && profile?.role !== "administrator") {
    return NextResponse.json({ error: "This lookup is for importers and administrators." }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (name.length < 2) {
    return NextResponse.json({ error: "Give at least two characters to search for." }, { status: 400 });
  }

  const creds = pcbCredentialsFromEnv();
  if (!creds) {
    return NextResponse.json(
      {
        error:
          "The FDA Product Code Builder integration is not configured, so product names cannot be " +
          "looked up. Describe the material in your own words instead — the request works without it.",
      },
      { status: 503 }
    );
  }

  try {
    const rows = await searchProductsByName(name, creds);
    return NextResponse.json({
      ok: true,
      searched_for: name,
      truncated: rows.length > MAX_ROWS,
      rows: rows.slice(0, MAX_ROWS),
    });
  } catch (err) {
    // A PcbError already carries a sentence written for a person. Anything else
    // is ours and should not be echoed back verbatim.
    const message = err instanceof PcbError
      ? err.message
      : "FDA's product code service could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
