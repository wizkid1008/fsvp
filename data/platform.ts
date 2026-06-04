import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardCheck,
  FileArchive,
  FileCheck2,
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
  FileArchive,
  FileCheck2,
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
  { href: "/profile", label: "Profile", icon: "UserRound" },
  { href: "/supplier", label: "Supplier", icon: "Building2" },
  { href: "/products", label: "Products", icon: "PackageSearch" },
  { href: "/facilities", label: "Facilities", icon: "Warehouse" },
  { href: "/documents", label: "Documents", icon: "FileArchive" },
  { href: "/assessment", label: "Assessment", icon: "Gauge" },
  { href: "/reviewer", label: "Reviewer", icon: "ClipboardCheck", roles: ["reviewer", "administrator"] },
  { href: "/admin", label: "Admin", icon: "ShieldCheck", roles: ["administrator"] },
  { href: "/reports", label: "Reports", icon: "FileCheck2" },
  { href: "/notifications", label: "Notifications", icon: "Bell" },
  { href: "/settings", label: "Settings", icon: "Settings" }
];

export const dashboardMetrics = [
  { label: "Readiness", value: "82%", detail: "9 point gain this month", tone: "success" },
  { label: "Documents", value: "47", detail: "6 pending review", tone: "info" },
  { label: "Open Gaps", value: "12", detail: "4 high priority", tone: "warning" },
  { label: "Upcoming", value: "8", detail: "certifications and reassessments", tone: "neutral" }
] as const;

export const readinessCategories = [
  { label: "Supplier Identity", score: 94 },
  { label: "Product Information", score: 88 },
  { label: "Hazard Analysis", score: 71 },
  { label: "Food Safety Controls", score: 79 },
  { label: "FDA Registration", score: 100 },
  { label: "Verification Activities", score: 73 },
  { label: "Traceability", score: 84 },
  { label: "Labeling", score: 77 },
  { label: "Certifications", score: 86 },
  { label: "Recall Preparedness", score: 68 }
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

export const moduleConfigs: Record<string, ModuleConfig> = {
  supplier: {
    title: "Supplier Profile",
    description: "Manage legal identity, FDA registration, export markets, contacts, and certification status.",
    primaryAction: "Update supplier record",
    records: [
      { label: "Company", value: "Pacific Valley Foods Ltd.", detail: "Legal entity and registration verified", status: "Approved", tone: "success" },
      { label: "Country", value: "Chile", detail: "Exports fruit preparations and shelf-stable ingredients", status: "Active", tone: "info" },
      { label: "Certification", value: "BRCGS Food Safety", detail: "Expires in 74 days", status: "Renewal due", tone: "warning" }
    ],
    checklist: ["Confirm FDA facility registration", "Refresh export market list", "Validate primary contact", "Upload current ownership attestation"]
  },
  products: {
    title: "Product Management",
    description: "Track ingredients, allergens, specifications, packaging, shelf life, intended U.S. market, and origin.",
    primaryAction: "Add product",
    records: [
      { label: "Mango puree", value: "Ingredient", detail: "Allergen statement complete", status: "Ready", tone: "success" },
      { label: "Roasted pepper strips", value: "RTE vegetable", detail: "Needs updated product specification", status: "Revision", tone: "warning" },
      { label: "Berry preparation", value: "Fruit prep", detail: "Hazard analysis pending reviewer sign-off", status: "Review", tone: "info" }
    ],
    checklist: ["Capture ingredient list", "Attach specification sheet", "Confirm allergen declaration", "Map each product to a facility"]
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
    title: "Document Repository",
    description: "Upload, version, search, filter, approve, and download supplier compliance evidence.",
    primaryAction: "Upload document",
    records: [
      { label: "HACCP plan", value: "v3", detail: "Reviewer requested CCP monitoring clarification", status: "Revision", tone: "warning" },
      { label: "FDA registration", value: "2026", detail: "Validated against supplier profile", status: "Approved", tone: "success" },
      { label: "Mock recall report", value: "Draft", detail: "Supplier uploaded new version today", status: "Review", tone: "info" }
    ],
    checklist: ["Classify document category", "Retain prior versions", "Log downloads", "Capture review notes and approval status"]
  },
  assessment: {
    title: "FSVP Readiness Assessment",
    description: "Score readiness categories, identify compliance gaps, and produce recommended actions.",
    primaryAction: "Start assessment",
    records: [
      { label: "Overall readiness", value: "82%", detail: "Supplier is close to submit-ready", status: "On track", tone: "success" },
      { label: "Recall preparedness", value: "68%", detail: "Mock recall evidence incomplete", status: "Gap", tone: "warning" },
      { label: "Hazard analysis", value: "71%", detail: "Chemical hazard rationale needs QI review", status: "Review", tone: "info" }
    ],
    checklist: ["Score each category", "Record evidence source", "Assign gap owner", "Generate readiness report"]
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
    title: "Reports",
    description: "Generate supplier readiness, gap, document status, audit, and executive summary reports.",
    primaryAction: "Generate report",
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
  }
};
