const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer
} = require("docx");
const fs = require("fs");

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] });
}
function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: [new TextRun(text)]
  });
}
function spacer() {
  return new Paragraph({ children: [new TextRun("")] });
}

function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((text, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: "2E4057", type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [new TextRun({ text, bold: true, color: "FFFFFF", font: "Arial", size: 20 })] })]
      })
    )
  });
}

function dataRow(cols, widths, shade) {
  return new TableRow({
    children: cols.map((text, i) =>
      new TableCell({
        borders,
        width: { size: widths[i], type: WidthType.DXA },
        shading: { fill: shade || "FFFFFF", type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ children: [new TextRun({ text, font: "Arial", size: 20 })] })]
      })
    )
  });
}

const roleWidths = [2600, 3400, 3360];
const roleTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: roleWidths,
  rows: [
    headerRow(["Role", "Primary Purpose", "Key Capabilities"], roleWidths),
    dataRow(["Supplier", "Foreign manufacturer", "Upload documents, view readiness score, respond to action items"], roleWidths, "F7F9FC"),
    dataRow(["Exporter", "Foreign exporter managing supply chain", "Manage upstream suppliers, submit evidence, track readiness"], roleWidths, "FFFFFF"),
    dataRow(["US Importer", "U.S. company importing commodities", "Create FSVP records, review evidence, make approval decisions, generate reports"], roleWidths, "F7F9FC"),
    dataRow(["Reviewer", "FSVP consultant / qualified individual", "Evaluate submitted documents, accept/reject, create corrective actions"], roleWidths, "FFFFFF"),
    dataRow(["Administrator", "Platform operator", "Manage users, configure rules engine, maintain reference library"], roleWidths, "F7F9FC"),
  ]
});

const scoringWidths = [2500, 3430, 3430];
const scoringTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: scoringWidths,
  rows: [
    headerRow(["Score", "Status", "Meaning"], scoringWidths),
    dataRow(["90% +", "Approved", "Supplier meets all requirements; import may proceed"], scoringWidths, "E8F5E9"),
    dataRow(["75 – 89%", "Conditional", "Minor gaps present; importer may set conditions"], scoringWidths, "FFF8E1"),
    dataRow(["60 – 74%", "Needs Action", "Significant gaps; corrective actions required"], scoringWidths, "FFF3E0"),
    dataRow(["Below 60%", "Rejected", "Critical requirements unmet; import not approved"], scoringWidths, "FFEBEE"),
  ]
});

const commodityWidths = [2340, 3510, 3510];
const commodityTable = new Table({
  width: { size: 9360, type: WidthType.DXA },
  columnWidths: commodityWidths,
  rows: [
    headerRow(["Commodity", "Key Hazards", "Core Evidence Required"], commodityWidths),
    dataRow(["Coffee", "Ochratoxin A, pesticides", "Roaster controls, COA, pesticide testing"], commodityWidths, "F7F9FC"),
    dataRow(["Cocoa", "Heavy metals, Salmonella", "Supplier audit, COA, pathogen controls"], commodityWidths, "FFFFFF"),
    dataRow(["Spices", "Salmonella, adulterants", "Kill-step validation, COA, lab results"], commodityWidths, "F7F9FC"),
    dataRow(["Peanuts", "Aflatoxin, allergens", "Aflatoxin plan, allergen cross-contact controls"], commodityWidths, "FFFFFF"),
    dataRow(["Fresh Produce", "Pathogens, water quality", "Field sanitation, water testing, GAP audit"], commodityWidths, "F7F9FC"),
    dataRow(["Seafood", "Histamine, pathogens", "Temperature controls, HACCP plan, testing records"], commodityWidths, "FFFFFF"),
  ]
});

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
      },
      {
        reference: "steps",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 80 } } } }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "2E4057" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "048A81", space: 1 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "048A81" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({ children: [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
          children: [new TextRun({ text: "ThrushCross Verify — Platform Overview", font: "Arial", size: 18, color: "888888" })]
        })
      ]})
    },
    footers: {
      default: new Footer({ children: [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 1 } },
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" }),
            new TextRun({ text: " of ", font: "Arial", size: 18, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: "888888" }),
          ]
        })
      ]})
    },
    children: [
      // Title block
      new Paragraph({
        spacing: { before: 0, after: 120 },
        children: [new TextRun({ text: "ThrushCross Verify", font: "Arial", size: 56, bold: true, color: "2E4057" })]
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: "FSVP Compliance Platform — Logic & Workflow Overview", font: "Arial", size: 28, color: "048A81" })]
      }),
      new Paragraph({
        spacing: { after: 360 },
        children: [new TextRun({ text: "Prepared: June 2026", font: "Arial", size: 20, color: "888888", italics: true })]
      }),

      // What it does
      h1("What the Platform Does"),
      body("ThrushCross Verify is a compliance platform for the FDA’s Foreign Supplier Verification Program (FSVP). It helps U.S. food importers document and prove they have done their due diligence on foreign suppliers before importing agricultural commodities."),
      spacer(),
      body("The central question it answers:", { bold: true }),
      new Paragraph({
        spacing: { before: 120, after: 240 },
        indent: { left: 720 },
        children: [new TextRun({ text: "“Can this U.S. importer reasonably rely on this foreign supplier for this specific agricultural commodity under the FDA FSVP process?”", font: "Arial", size: 22, italics: true, color: "2E4057" })]
      }),
      body("It brings together four core functions:"),
      bullet("Supplier intake and document collection"),
      bullet("Rules-based evidence tracking and gap identification"),
      bullet("Reviewer evaluation and scoring"),
      bullet("Audit-ready record keeping and reporting"),
      spacer(),

      // Roles
      h1("User Roles"),
      body("The platform has five distinct roles. Each role sees a different dashboard and can only access pages relevant to their function."),
      spacer(),
      roleTable,
      spacer(),

      // Workflow
      h1("The Core Compliance Workflow"),
      body("Every FSVP record follows the same sequence from supplier onboarding to an approved import decision."),
      spacer(),

      h2("Step 1 — Importer Invites Supplier"),
      body("The U.S. importer sends an invitation to a foreign supplier or exporter. Once accepted, a relationship is established in the system and the supplier gains access to their portal."),

      h2("Step 2 — Supplier Completes Their Profile"),
      body("The supplier fills out three areas:"),
      bullet("Corporate profile — company info, ownership, contacts, FDA registration, export markets"),
      bullet("Facilities — manufacturing locations, certifications, processes, capacity"),
      bullet("Products — commodities, ingredients, allergens, processing state, intended use"),

      h2("Step 3 — Importer Creates an FSVP Record"),
      body("The importer creates an FSVP record that ties together a specific supplier, facility, and product combination. Each record represents one verifiable import relationship."),

      h2("Step 4 — Rules Engine Generates a Checklist"),
      body("Based on the commodity type, the platform automatically generates a list of required evidence items — for example, a hazard analysis, certificates of analysis, pathogen testing records, and certifications. These requirements come from the configured rules and are specific to the commodity."),

      h2("Step 5 — Supplier Uploads Evidence"),
      body("The supplier uploads documents to satisfy each item on the checklist. Documents are tagged by type (e.g., Certificate, Audit Report, COA) and linked to the specific requirement they address."),

      h2("Step 6 — Reviewer Evaluates Documents"),
      body("A reviewer (FSVP consultant or qualified individual) works through the review queue and evaluates each submitted document:"),
      bullet("Accept — document is compliant; counts toward the readiness score"),
      bullet("Request revision — supplier is asked to resubmit with corrections"),
      bullet("Reject — document is non-conforming; a corrective action is created"),

      h2("Step 7 — Scoring Engine Calculates Readiness"),
      body("The platform calculates a readiness percentage based on how much of the required evidence has been accepted. Each section of the checklist (e.g., Hazard Analysis, Verification Activities) carries a configured weight that contributes to the overall score."),
      spacer(),
      scoringTable,
      spacer(),

      h2("Step 8 — Importer Makes an Approval Decision"),
      body("The importer reviews the score, reviewer feedback, and any open gaps, then records a formal decision: Approved, Conditionally Approved, Needs Action, or Rejected. This decision is timestamped and stored as part of the FSVP record."),

      h2("Step 9 — Reassessment is Scheduled"),
      body("Once approved, the system schedules a reassessment at a configured frequency (e.g., annually). When the reassessment is due, the cycle repeats: supplier re-submits evidence, reviewer re-evaluates, and the importer renews the decision."),
      spacer(),

      // Corrective Actions
      h1("Gap Management & Corrective Actions"),
      body("When evidence is rejected or a critical gap is identified, the platform creates a corrective action. Corrective actions are tracked through three statuses:"),
      bullet("Open — assigned to the supplier"),
      bullet("In Progress — supplier is working on a response"),
      bullet("Closed — evidence accepted; gap resolved"),
      spacer(),
      body("Suppliers see their assigned corrective actions in the Action Items section. Once they upload evidence to resolve the gap, the reviewer re-evaluates and the score recalculates automatically."),
      spacer(),

      // Navigation
      h1("Platform Sections by Role"),
      spacer(),
      h2("Supplier / Exporter"),
      bullet("Corporate — company profile and registration details"),
      bullet("Facilities — manufacturing locations"),
      bullet("Products — commodity specifications"),
      bullet("My Evidence — documents uploaded"),
      bullet("Action Items — corrective actions assigned by importer or reviewer"),
      bullet("My Readiness — current score and gap summary"),
      spacer(),
      h2("US Importer"),
      bullet("Exporters — all linked foreign suppliers"),
      bullet("FSVP Records — compliance records per supplier-commodity pair"),
      bullet("Review Queue — evidence submissions awaiting review"),
      bullet("Gaps & Actions — open corrective actions across all suppliers"),
      bullet("Reports — audit-ready PDFs and exports"),
      spacer(),
      h2("Reviewer"),
      bullet("Review Queue — all submitted documents across all suppliers"),
      bullet("Audit Log — timestamped activity across the platform"),
      spacer(),
      h2("Administrator"),
      bullet("Admin Console — user management and workflow settings"),
      bullet("Rules Engine — configure requirement checklists and scoring thresholds"),
      spacer(),

      // Commodities
      h1("Built-In Commodity Support"),
      body("The platform ships with pre-configured hazard profiles for 10 commodity types. When an importer creates a new FSVP record, the required evidence checklist is automatically populated based on the commodity."),
      spacer(),
      commodityTable,
      spacer(),

      // How everything connects
      h1("How Everything Connects"),
      body("The diagram below summarizes the data relationships that underpin every FSVP record:"),
      spacer(),
      new Paragraph({
        spacing: { before: 120, after: 120 },
        indent: { left: 360 },
        children: [new TextRun({ text: "Importer  →  links to  →  Supplier", font: "Courier New", size: 20, color: "2E4057" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 720 },
        children: [new TextRun({ text: "└─ Facilities", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 720 },
        children: [new TextRun({ text: "└─ Products", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 1080 },
        children: [new TextRun({ text: "└─ FSVP Record", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 1440 },
        children: [new TextRun({ text: "├─ Required Evidence Checklist  (from Rules Engine)", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 1440 },
        children: [new TextRun({ text: "├─ Uploaded Documents  →  Reviewer →  Accepted / Rejected", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 1440 },
        children: [new TextRun({ text: "├─ Readiness Score  →  Importer Decision", font: "Courier New", size: 20, color: "444444" })]
      }),
      new Paragraph({
        spacing: { after: 60 },
        indent: { left: 1440 },
        children: [new TextRun({ text: "└─ Reassessment Schedule  →  cycle repeats", font: "Courier New", size: 20, color: "444444" })]
      }),
      spacer(),
      body("Every action taken on the platform — document uploads, reviewer decisions, corrective actions, approval decisions, reassessments — is recorded in a timestamped audit log. This log is the foundation of the audit-ready documentation required for FDA compliance."),
      spacer(),

      // Disclaimer
      new Paragraph({
        spacing: { before: 240, after: 0 },
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
        children: [new TextRun({ text: "This document provides a general overview of platform functionality. ThrushCross Verify does not provide legal or regulatory advice.", font: "Arial", size: 18, italics: true, color: "888888" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("C:\\Users\\Sisters\\Documents\\FSVP 2\\ThrushCross_Verify_Overview.docx", buf);
  console.log("Done: ThrushCross_Verify_Overview.docx");
});
