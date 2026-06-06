import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileCheck2,
  FileSearch,
  Gauge,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
} from "lucide-react";
import type { ModuleConfig, NavItem } from "@/types/platform";

export const iconMap = {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileCheck2,
  FileSearch,
  Gauge,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/account", label: "Account", icon: "UserRound", matches: ["/profile", "/settings", "/notifications"] },
  { href: "/suppliers", label: "Suppliers", icon: "Building2", matches: ["/supplier"] },
  { href: "/products-facilities", label: "Products & Facilities", icon: "PackageSearch", matches: ["/products", "/commodities", "/facilities"] },
  { href: "/evidence", label: "Evidence", icon: "FileArchive", matches: ["/documents", "/requirements"] },
  { href: "/readiness", label: "Readiness", icon: "Gauge", matches: ["/assessment", "/corrective-actions"] },
  { href: "/reports", label: "Reports", icon: "FileCheck2" },
  { href: "/reviewer", label: "Review Queue", icon: "ClipboardCheck", roles: ["reviewer", "administrator"] },
  { href: "/admin", label: "Admin", icon: "ShieldCheck", roles: ["administrator"] },
  { href: "/audit-log", label: "Audit Log", icon: "ShieldCheck", roles: ["reviewer", "administrator"] }
];

export const dashboardMetrics = [
  { label: "Pending Reviews", value: "14", detail: "supplier/product pairs", tone: "info" },
  { label: "High-Risk Commodities", value: "6", detail: "need verification evidence", tone: "danger" },
  { label: "Missing Evidence", value: "22", detail: "mapped FSVP gaps", tone: "warning" },
  { label: "Ready for Import", value: "9", detail: "approved for internal use", tone: "success" }
] as const;

export const readinessCategories = [
  { category: "Supplier Identity", weight: 10, score: 9, criticalGap: "Ownership attestation is current.", nextAction: "Confirm importer-supplier relationship." },
  { category: "Product Identity", weight: 10, score: 8, criticalGap: "Ingredient statement needs final reviewer acceptance.", nextAction: "Attach signed product specification." },
  { category: "Facility Information", weight: 10, score: 8, criticalGap: "Co-packer process flow is incomplete.", nextAction: "Request facility process diagram." },
  { category: "FDA Registration", weight: 10, score: 10, criticalGap: "No critical gap.", nextAction: "Monitor renewal date." },
  { category: "Hazard Analysis", weight: 15, score: 9, criticalGap: "Chemical hazard rationale is not accepted.", nextAction: "Assign qualified individual review." },
  { category: "Verification Activities", weight: 15, score: 10, criticalGap: "Sampling plan is pending.", nextAction: "Upload testing protocol." },
  { category: "Food Safety Controls", weight: 10, score: 8, criticalGap: "Preventive control evidence is partial.", nextAction: "Map controls to commodity hazards." },
  { category: "Testing and COAs", weight: 10, score: 6, criticalGap: "Latest COA is missing.", nextAction: "Request lot-specific COA." },
  { category: "Traceability and Recall", weight: 5, score: 3, criticalGap: "Mock recall record is stale.", nextAction: "Upload mock recall report." },
  { category: "Corrective Actions", weight: 5, score: 4, criticalGap: "One corrective action remains open.", nextAction: "Document closure evidence." }
];

export const documentCategories = [
  "Food Safety Plan",
  "HACCP Plan",
  "HARPC Plan",
  "Certificate of Analysis",
  "Audit Report",
  "GMP Certification",
  "FDA Registration",
  "Recall Record",
  "Traceability Record",
  "Supplier Questionnaire",
  "Product Specification",
  "Allergen Control Program",
  "Environmental Monitoring",
  "Corrective Action Report",
  "Laboratory Testing Report",
  "Training Record"
];

export const riskSignals = [
  {
    supplier: "Pacific Valley Foods",
    commodity: "Dried mango",
    country: "Chile",
    riskLevel: "high",
    readinessStatus: "Needs Major Revision",
    score: 67,
    blockers: ["Mock recall record expired", "COA missing for latest lot", "Chemical hazard rationale under review"]
  },
  {
    supplier: "Andes Ingredients",
    commodity: "Roasted coffee",
    country: "Colombia",
    riskLevel: "medium",
    readinessStatus: "Ready for Importer Review",
    score: 84,
    blockers: ["Certificate renewal due in 43 days"]
  },
  {
    supplier: "Coastal Preserves",
    commodity: "Peanuts",
    country: "Argentina",
    riskLevel: "critical",
    readinessStatus: "Not Ready",
    score: 48,
    blockers: ["Aflatoxin control missing", "Supplier recall history unresolved", "No accepted hazard analysis"]
  }
] as const;

export const commodityWorkflows = [
  {
    commodity: "Coffee",
    likelyRisks: ["Ochratoxin A", "Pesticide residues", "Foreign material"],
    requiredEvidence: ["Supplier questionnaire", "COA/testing records", "Roaster or processor controls", "Traceability record"],
    verificationActivities: ["Records review", "Sampling/testing", "Certification review"]
  },
  {
    commodity: "Cocoa",
    likelyRisks: ["Heavy metals", "Salmonella", "Pesticide residues"],
    requiredEvidence: ["Hazard analysis", "COA", "Supplier audit", "Product specification"],
    verificationActivities: ["COA review", "Supplier evaluation", "Periodic testing"]
  },
  {
    commodity: "Spices",
    likelyRisks: ["Salmonella", "Adulterants", "Pesticide residues", "Foreign material"],
    requiredEvidence: ["Kill-step validation", "COA", "GFSI/BRCGS/SQF certificate", "Environmental monitoring summary"],
    verificationActivities: ["Records review", "Sampling/testing", "Onsite audit when warranted"]
  },
  {
    commodity: "Peanuts",
    likelyRisks: ["Aflatoxin", "Allergen cross-contact", "Salmonella"],
    requiredEvidence: ["Aflatoxin testing", "Allergen control program", "Recall history", "Food safety plan"],
    verificationActivities: ["Lot-specific COA", "Supplier audit", "Corrective action review"]
  },
  {
    commodity: "Tree nuts",
    likelyRisks: ["Aflatoxin", "Allergen controls", "Salmonella"],
    requiredEvidence: ["Allergen program", "Pathogen controls", "COA", "Traceability records"],
    verificationActivities: ["COA review", "Sampling/testing", "Certification review"]
  },
  {
    commodity: "Grains",
    likelyRisks: ["Mycotoxins", "Pesticide residues", "Foreign material"],
    requiredEvidence: ["Mycotoxin testing", "Supplier specification", "Storage controls", "Traceability records"],
    verificationActivities: ["Sampling/testing", "Records review"]
  },
  {
    commodity: "Oils",
    likelyRisks: ["Chemical contaminants", "Allergen carryover", "Adulteration"],
    requiredEvidence: ["Product specification", "COA", "Process controls", "Supplier authenticity controls"],
    verificationActivities: ["Records review", "Testing as needed"]
  },
  {
    commodity: "Fresh produce",
    likelyRisks: ["Pathogens", "Water quality", "Field sanitation"],
    requiredEvidence: ["Produce safety records", "Audit report", "Water testing", "Recall procedure"],
    verificationActivities: ["Onsite audit", "Records review", "Recall simulation"]
  },
  {
    commodity: "Dried fruit",
    likelyRisks: ["Sulfites", "Mycotoxins", "Foreign material"],
    requiredEvidence: ["Allergen/sulfite declaration", "COA", "Hazard analysis", "Supplier audit"],
    verificationActivities: ["COA review", "Supplier evaluation", "Testing as needed"]
  },
  {
    commodity: "Seafood",
    likelyRisks: ["Histamine", "Pathogens", "Temperature abuse", "Species substitution"],
    requiredEvidence: ["HACCP plan", "Temperature records", "COA", "Traceability records"],
    verificationActivities: ["HACCP records review", "Supplier verification", "Sampling/testing"]
  }
] as const;

export const fsvpRequirements = [
  {
    name: "Supplier identity and contact",
    description: "Document the foreign supplier, legal entity, contacts, ownership, and relationship to the importer.",
    requiredEvidence: "Supplier questionnaire, registration data, ownership/contact attestation",
    uploadedEvidence: "Supplier questionnaire v2",
    reviewerStatus: "Accepted",
    gapStatus: "Complete",
    correctiveAction: "None",
    finalDetermination: "Identity evidence accepted"
  },
  {
    name: "Commodity hazard analysis",
    description: "Identify known or reasonably foreseeable biological, chemical, and physical hazards for the commodity.",
    requiredEvidence: "Hazard analysis, commodity risk rationale, qualified individual review",
    uploadedEvidence: "Hazard analysis draft",
    reviewerStatus: "Revision Required",
    gapStatus: "Critical Gap",
    correctiveAction: "Add chemical hazard rationale and QI sign-off",
    finalDetermination: "Not ready"
  },
  {
    name: "Verification activities",
    description: "Define supplier verification activities appropriate to the hazard and supplier risk profile.",
    requiredEvidence: "Audit, testing, sampling plan, or records review rationale",
    uploadedEvidence: "2026 audit report, COA pending",
    reviewerStatus: "Under Review",
    gapStatus: "Open",
    correctiveAction: "Upload latest lot COA",
    finalDetermination: "Pending reviewer decision"
  },
  {
    name: "Traceability and recall readiness",
    description: "Confirm lot tracing and recall capability for the commodity/product.",
    requiredEvidence: "Traceability records, recall procedure, mock recall report",
    uploadedEvidence: "Traceability record",
    reviewerStatus: "Missing",
    gapStatus: "Major Gap",
    correctiveAction: "Upload mock recall report",
    finalDetermination: "Not ready"
  }
] as const;

export const roleWorkflows = [
  {
    role: "Foreign Supplier",
    permissions: ["Maintain supplier profile", "Upload requested evidence", "Respond to reviewer comments", "View own readiness status"],
    dashboardFocus: ["Open requests", "Missing documents", "Expiring certificates", "Revision notes"],
    primaryActions: ["Complete supplier intake", "Upload requirement evidence", "Resolve corrective actions"]
  },
  {
    role: "U.S. Importer",
    permissions: ["View assigned suppliers", "Review readiness status", "Generate reports", "Approve internal use"],
    dashboardFocus: ["High-risk commodities", "Suppliers ready/not ready", "Open gaps", "Upcoming expirations"],
    primaryActions: ["Start supplier review", "Assign reviewer", "Generate import readiness report"]
  },
  {
    role: "Reviewer / Consultant",
    permissions: ["Review evidence", "Accept/reject documents", "Request revisions", "Create corrective actions"],
    dashboardFocus: ["Assigned suppliers", "Documents under review", "Critical gaps", "Reviewer comments"],
    primaryActions: ["Map evidence", "Add review comments", "Approve readiness report"]
  },
  {
    role: "Administrator",
    permissions: ["Manage users", "Manage organizations", "Configure requirements", "Review audit logs"],
    dashboardFocus: ["User roles", "Workflow configuration", "RLS coverage", "Audit activity"],
    primaryActions: ["Invite users", "Configure roles", "Maintain requirement library"]
  }
] as const;

export const moduleConfigs: Record<string, ModuleConfig> = {
  supplier: {
    title: "Supplier Intake",
    description: "Capture supplier identity, ownership, contacts, export markets, FDA registration, certifications, and importer relationship.",
    primaryAction: "Update supplier record",
    records: [
      { label: "Company", value: "Pacific Valley Foods Ltd.", detail: "Legal entity and registration verified", status: "Approved", tone: "success" },
      { label: "Country", value: "Chile", detail: "Exports fruit preparations and shelf-stable ingredients", status: "Active", tone: "info" },
      { label: "Certification", value: "BRCGS Food Safety", detail: "Expires in 74 days", status: "Renewal due", tone: "warning" }
    ],
    checklist: ["Confirm FDA facility registration", "Refresh export market list", "Validate primary contact", "Upload current ownership attestation"]
  },
  products: {
    title: "Product & Commodity Intake",
    description: "Track commodity, ingredients, processing state, intended use, origin, packaging, shelf life, and allergen risk.",
    primaryAction: "Add product",
    records: [
      { label: "Mango puree", value: "Ingredient", detail: "Allergen statement complete", status: "Ready", tone: "success" },
      { label: "Roasted pepper strips", value: "RTE vegetable", detail: "Needs updated product specification", status: "Revision", tone: "warning" },
      { label: "Berry preparation", value: "Fruit prep", detail: "Hazard analysis pending reviewer sign-off", status: "Review", tone: "info" }
    ],
    checklist: ["Capture ingredient list", "Attach specification sheet", "Confirm allergen declaration", "Map each product to a facility"]
  },
  commodities: {
    title: "Product & Commodity Risk Assessment",
    description: "Score agricultural commodity risk by commodity type, origin, processing state, intended use, hazards, certification, and recall history.",
    primaryAction: "Run risk engine",
    records: [
      { label: "Peanuts", value: "Critical", detail: "Aflatoxin, allergen, Salmonella, and recall history require stronger evidence.", status: "Not Ready", tone: "danger" },
      { label: "Roasted coffee", value: "Medium", detail: "Ochratoxin A and pesticide evidence mapped to COA review.", status: "Review", tone: "info" },
      { label: "Dried fruit", value: "High", detail: "Sulfite declaration and mock recall evidence are incomplete.", status: "Gap", tone: "warning" }
    ],
    checklist: ["Select commodity type", "Confirm country of origin", "Identify raw/processed state", "Map hazards to verification evidence"]
  },
  facilities: {
    title: "Facility Management",
    description: "Maintain manufacturing facilities, FDA registration numbers, processes, capacity, and certifications.",
    primaryAction: "Add facility",
    records: [
      { label: "Santiago Plant 2", value: "Manufacturing", detail: "FDA registration and BRCGS certificate on file", status: "Active", tone: "success" },
      { label: "Valparaiso Warehouse", value: "Storage", detail: "GMP certificate expiring soon", status: "Due", tone: "warning" },
      { label: "Co-packer", value: "Thermal processing", detail: "Awaiting process flow diagram", status: "Pending", tone: "neutral" }
    ],
    checklist: ["Verify facility address", "Upload safety certifications", "Document manufacturing processes", "Record production capacity"]
  },
  documents: {
    title: "Document-to-Requirement Mapping",
    description: "Upload evidence, connect it to supplier/product/facility records, map it to FSVP requirements, and track reviewer decisions.",
    primaryAction: "Upload document",
    records: [
      { label: "HACCP plan", value: "v3", detail: "Reviewer requested CCP monitoring clarification", status: "Revision", tone: "warning" },
      { label: "FDA registration", value: "2026", detail: "Validated against supplier profile", status: "Approved", tone: "success" },
      { label: "Mock recall report", value: "Draft", detail: "Supplier uploaded new version today", status: "Review", tone: "info" }
    ],
    checklist: ["Classify document category", "Retain prior versions", "Log downloads", "Capture review notes and approval status"]
  },
  requirements: {
    title: "FSVP Requirement Mapping",
    description: "Track each FSVP requirement, required evidence, uploaded evidence, reviewer status, gap status, corrective action, and final determination.",
    primaryAction: "Map evidence",
    records: [
      { label: "Commodity hazard analysis", value: "Revision Required", detail: "Chemical hazard rationale and QI sign-off missing.", status: "Critical Gap", tone: "danger" },
      { label: "Verification activities", value: "Under Review", detail: "Audit report accepted; latest COA still pending.", status: "Open", tone: "warning" },
      { label: "Supplier identity", value: "Accepted", detail: "Questionnaire, registration, and contact evidence accepted.", status: "Complete", tone: "success" }
    ],
    checklist: ["Review requirement description", "Attach uploaded evidence", "Capture reviewer notes", "Resolve gap and final determination"]
  },
  assessment: {
    title: "FSVP Gap Assessment",
    description: "Calculate a defensible readiness score, surface critical gaps, recommend next actions, and assign corrective actions.",
    primaryAction: "Start assessment",
    records: [
      { label: "Overall readiness", value: "82%", detail: "Supplier is close to submit-ready", status: "On track", tone: "success" },
      { label: "Recall preparedness", value: "68%", detail: "Mock recall evidence incomplete", status: "Gap", tone: "warning" },
      { label: "Hazard analysis", value: "71%", detail: "Chemical hazard rationale needs QI review", status: "Review", tone: "info" }
    ],
    checklist: ["Score each category", "Record evidence source", "Assign gap owner", "Generate readiness report"]
  },
  "corrective-actions": {
    title: "Corrective Action Tracking",
    description: "Create, assign, monitor, and close corrective actions from rejected evidence, verification findings, recalls, or reassessments.",
    primaryAction: "Create action",
    records: [
      { label: "Aflatoxin controls", value: "Peanuts", detail: "Supplier must upload lot-specific COA and control rationale.", status: "Open", tone: "danger" },
      { label: "Mock recall", value: "Dried mango", detail: "Mock recall report requested with traceability lot sample.", status: "In Progress", tone: "warning" },
      { label: "Certificate renewal", value: "Coffee", detail: "BRCGS renewal evidence due in 43 days.", status: "Scheduled", tone: "info" }
    ],
    checklist: ["Define issue", "Assign owner", "Set due date", "Attach closure evidence"]
  },
  reviewer: {
    title: "Reviewer Dashboard",
    description: "Review submissions, comment, request revisions, approve documents, and approve suppliers.",
    primaryAction: "Open review queue",
    records: [
      { label: "Pacific Valley Foods", value: "6 items", detail: "Two documents require revision", status: "Under Review", tone: "info" },
      { label: "Andes Ingredients", value: "Ready", detail: "Final supplier evaluation prepared", status: "Approve", tone: "success" },
      { label: "Coastal Preserves", value: "Late", detail: "COA and recall records missing", status: "Escalate", tone: "danger" }
    ],
    checklist: ["Review evidence", "Leave comments", "Request revisions", "Approve or reject documentation"]
  },
  admin: {
    title: "Admin Dashboard",
    description: "Manage users, roles, suppliers, workflows, background documents, and system settings.",
    primaryAction: "Manage users",
    records: [
      { label: "Users", value: "24", detail: "3 pending email verification", status: "Active", tone: "info" },
      { label: "Workflows", value: "4", detail: "Draft, Submitted, Under Review, Approved", status: "Configured", tone: "success" },
      { label: "Audit log", value: "1,248", detail: "All major actions logged", status: "Healthy", tone: "success" }
    ],
    checklist: ["Review role assignments", "Update workflow statuses", "Maintain reference library", "Monitor audit log coverage"]
  },
  reports: {
    title: "Import Readiness Report",
    description: "Generate audit-ready reports with supplier, product, facility, commodity risk, requirement mapping, comments, gaps, corrective actions, and final readiness status.",
    primaryAction: "Generate readiness report",
    records: [
      { label: "Readiness report", value: "PDF", detail: "Supplier-facing summary with category scores", status: "Available", tone: "success" },
      { label: "Gap report", value: "Excel", detail: "Action register with owners and due dates", status: "Available", tone: "success" },
      { label: "Audit report", value: "PDF", detail: "Reviewer notes and document approvals", status: "Draft", tone: "neutral" }
    ],
    checklist: ["Choose report type", "Select supplier", "Include evidence index", "Export PDF or Excel"]
  },
  notifications: {
    title: "Notifications",
    description: "Track uploads, review requests, approvals, expiring certifications, missing documents, and account events.",
    primaryAction: "Configure notifications",
    records: [
      { label: "Certification expiry", value: "74 days", detail: "BRCGS certificate renewal reminder", status: "Scheduled", tone: "warning" },
      { label: "Review request", value: "Today", detail: "Mock recall report needs reviewer action", status: "New", tone: "info" },
      { label: "Approval notice", value: "Sent", detail: "FDA registration document approved", status: "Delivered", tone: "success" }
    ],
    checklist: ["Enable in-app delivery", "Configure email templates", "Escalate overdue gaps", "Log delivery outcomes"]
  },
  settings: {
    title: "Account Settings",
    description: "Manage session preferences, language, security, password reset, and notification settings.",
    primaryAction: "Save settings",
    records: [
      { label: "Language", value: "English", detail: "Preferred language for the account", status: "Active", tone: "success" },
      { label: "Security", value: "Email verified", detail: "Password reset flow enabled through Supabase", status: "Protected", tone: "success" },
      { label: "Notifications", value: "Email + in-app", detail: "Review and expiry alerts enabled", status: "Enabled", tone: "info" }
    ],
    checklist: ["Verify email", "Update password", "Choose language", "Set notification preferences"]
  },
  "audit-log": {
    title: "Audit Log",
    description: "Review timestamped user actions, record changes, document access, previous/new values, and export activity.",
    primaryAction: "Export audit log",
    records: [
      { label: "Document review", value: "Reviewer accepted FDA registration", detail: "Changed requirement evidence status from Under Review to Accepted.", status: "Logged", tone: "success" },
      { label: "Corrective action", value: "Supplier uploaded COA", detail: "New document version attached to aflatoxin control action.", status: "Logged", tone: "info" },
      { label: "Role update", value: "Admin assigned reviewer", detail: "Reviewer gained access to Pacific Valley Foods.", status: "Logged", tone: "neutral" }
    ],
    checklist: ["Filter by user", "Filter by supplier", "Review previous/new value", "Export audit packet"]
  }
};
