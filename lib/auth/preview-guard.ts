/**
 * Previewing looks; it never writes.
 *
 * An administrator can step into a supplier or importer account to see exactly
 * what that account sees (`lib/preview-role.ts`). The pages have honoured the
 * read-only half of that from the start — `app/corporate/page.tsx` skips its
 * provisioning writes while previewing — but the API routes did not, so which
 * actions an admin could take depended on which route happened to check for a
 * `supplier_id`.
 *
 * The rule is not merely tidiness. Evidence is attributed to the supplier who
 * attested to it or to the importer acting on their behalf, and nothing else
 * (`lib/evidence/provenance.ts`). An administrator is neither, so a document
 * written while previewing carries an attribution the record cannot support.
 */

import { NextResponse } from "next/server";

/**
 * Returns a 403 to send back when an administrator attempts a write on an
 * account they are previewing, or null when the caller may proceed.
 *
 * `action` completes "cannot … on its behalf" — e.g. "upload evidence",
 * "answer its forms".
 */
export function refusePreviewWrite(
  role: string | null | undefined,
  action: string
): NextResponse | null {
  if (role !== "administrator") return null;

  return NextResponse.json(
    {
      error:
        `Administrators can view an account but cannot ${action} on its behalf. ` +
        "That has to come from the supplier, or from the importer acting for them.",
    },
    { status: 403 }
  );
}
