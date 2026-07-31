import { allFields, flaggedAnswers, type AnswerValue, type FormAnswers, type FormSchema } from "./schema";

/**
 * Renders a submitted form response as a self-contained HTML document, which is
 * then stored as an ordinary `documents` row so the review queue, scoring,
 * expiry and the FDA inspection package all keep working unchanged.
 *
 * HTML rather than PDF on purpose: the inspection package is already HTML with
 * a Print/Save-as-PDF button (app/api/reports/generate/route.ts), the edge
 * runtime has no PDF library, and adding one would be a large dependency for no
 * gain. Same visual conventions as that package so the two read as one artifact.
 */

export type RenderMeta = {
  supplierName: string;
  formTitle: string;
  formDescription?: string | null;
  version: number;
  submittedByName: string;
  submittedAt: string;
  /** "supplier_attested" | "importer_uploaded" | "third_party" */
  evidenceSource: string;
};

const SOURCE_LABEL: Record<string, string> = {
  supplier_attested: "Completed by the supplier",
  importer_uploaded: "Completed by the importer on the supplier's behalf",
  third_party:       "Completed by a third party",
};

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** How an answer reads on the page. Unanswered is stated, never left blank. */
export function formatAnswer(value: AnswerValue | undefined, type: string): string {
  if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
    return "";
  }
  if (type === "checkbox") return value === true ? "Yes" : "No";
  if (type === "yes_no") return value === "yes" ? "Yes" : value === "no" ? "No" : String(value);
  return String(value);
}

export function renderFormResponseHtml(
  schema: FormSchema,
  answers: FormAnswers,
  meta: RenderMeta
): string {
  const flagged = flaggedAnswers(schema, answers);
  const unanswered = allFields(schema).filter(
    (f) => formatAnswer(answers[f.key], f.type) === ""
  ).length;

  const sectionsHtml = schema.sections
    .map((section) => {
      const rows = section.fields
        .map((field) => {
          const rendered = formatAnswer(answers[field.key], field.type);
          const isFlagged = field.flag_answer !== undefined && answers[field.key] === field.flag_answer;
          const answerCell = rendered === ""
            ? '<span class="unanswered">Not answered</span>'
            : esc(rendered);
          return `<tr${isFlagged ? ' class="flagged"' : ""}>
            <td class="q">${esc(field.label)}${field.help ? `<br><span class="help">${esc(field.help)}</span>` : ""}</td>
            <td class="a">${answerCell}${isFlagged ? ' <span class="flag">review</span>' : ""}</td>
          </tr>`;
        })
        .join("");

      return `<h2>${esc(section.title)}</h2>
        ${section.description ? `<p class="meta">${esc(section.description)}</p>` : ""}
        <table><tbody>${rows}</tbody></table>`;
    })
    .join("");

  const flaggedNote = flagged.length > 0
    ? `<div class="note"><strong>${flagged.length} answer${flagged.length === 1 ? "" : "s"} marked for review.</strong>
       These are answers the questionnaire flags as worth a second look. They are not automatic failures —
       the reviewer decides.
       <ul>${flagged.map((f) => `<li>${esc(f.field.label)} — ${esc(formatAnswer(f.answer, f.field.type))}</li>`).join("")}</ul></div>`
    : "";

  const unansweredNote = unanswered > 0
    ? `<div class="note">${unanswered} question${unanswered === 1 ? " was" : "s were"} left unanswered.</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(meta.formTitle)} — ${esc(meta.supplierName)}</title>
<style>body{font-family:Arial,sans-serif;padding:40px;color:#0f172a;max-width:900px;margin:0 auto;}
h1{font-size:22px;margin:0 0 4px;}h2{font-size:15px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:24px 0 6px;}
table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;margin-top:8px;}
td{padding:8px 12px;font-size:12px;border-bottom:1px solid #e2e8f0;vertical-align:top;}
td.q{width:60%;color:#0f172a;}td.a{font-weight:600;}
tr.flagged{background:#fffbeb;}
.flag{font-size:10px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.04em;}
.unanswered{color:#94a3b8;font-weight:400;}
.help{color:#64748b;font-weight:400;}
.meta{font-size:12px;color:#64748b;margin:0;}
.note{background:#fffbeb;border:1px solid #fde68a;padding:12px;font-size:12px;margin-top:16px;}
.note ul{margin:6px 0 0;padding-left:18px;}
@media print{button{display:none;}}</style></head><body>
<button onclick="window.print()" style="margin-bottom:20px;padding:8px 16px;background:#2E4057;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">Print / Save as PDF</button>
<h1>${esc(meta.formTitle)}</h1>
<p class="meta">${esc(meta.supplierName)} · Version ${esc(meta.version)} · Submitted ${esc(meta.submittedAt)} by ${esc(meta.submittedByName)}</p>
<p class="meta">${esc(SOURCE_LABEL[meta.evidenceSource] ?? meta.evidenceSource)}</p>
${meta.formDescription ? `<p class="meta" style="margin-top:8px;">${esc(meta.formDescription)}</p>` : ""}
${sectionsHtml}
${flaggedNote}
${unansweredNote}
<p class="meta" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:12px;">
This platform does not provide legal or regulatory advice.
</p>
</body></html>`;
}
