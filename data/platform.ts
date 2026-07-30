import {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileCheck2,
  FileSearch,
  FolderCheck,
  Gauge,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
} from "lucide-react";
import type { NavItem } from "@/types/platform";

export const iconMap = {
  AlertTriangle,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  FileArchive,
  FileCheck2,
  FileSearch,
  FolderCheck,
  Gauge,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
};

// supplierTypes: if set, item only shows when the logged-in supplier's
// supplier_type is in this list. "exporter" means export-eligible types
// (exporter, exporter_manufacturer, trader). "manufacturer" means non-exporters.
export const navItems: NavItem[] = [
  { href: "/dashboard",    label: "Dashboard",     icon: "LayoutDashboard", tKey: "nav.dashboard" },

  // ── Exporter nav (manages supply chain) ─────────────────────
  { href: "/corporate",    label: "Company Overview", icon: "Building2", roles: ["exporter", "supplier"], matches: ["/corporate"], tKey: "nav.companyOverview" },
  { href: "/my-suppliers", label: "Suppliers",    icon: "UsersRound",    roles: ["exporter"],              matches: ["/my-suppliers"], tKey: "nav.suppliers" },

  // ── Both exporter and supplier ───────────────────────────────
  // Importers need these too: a managed exporter has no account of its own, so
  // someone has to create its facilities and products, and that someone is the
  // importer. They were previously linked from the dashboard tiles and the
  // onboarding modal but absent from the importer's nav.
  { href: "/facilities",   label: "Facilities",   icon: "Warehouse",     roles: ["exporter", "supplier", "us_importer", "administrator"], tKey: "nav.facilities" },
  { href: "/products",     label: "Products",     icon: "PackageSearch", roles: ["exporter", "supplier", "us_importer", "administrator"], tKey: "nav.products" },
  { href: "/my-evidence",  label: "My Evidence",  icon: "FileArchive",   roles: ["exporter", "supplier"], tKey: "nav.myEvidence" },

  // ── Importer nav ─────────────────────────────────────────────
  { href: "/suppliers",        label: "Exporters",       icon: "Building2",      roles: ["us_importer"], tKey: "nav.exporters" },
  { href: "/fsvp-records",     label: "FSVP Records",    icon: "FolderCheck",    roles: ["us_importer"], matches: ["/fsvp-records"], tKey: "nav.fsvpRecords" },
  { href: "/evidence",         label: "Evidence",        icon: "FileArchive",    roles: ["us_importer"], tKey: "nav.evidence" },
  { href: "/importer-review",  label: "Review Queue",    icon: "ClipboardCheck", roles: ["us_importer"], tKey: "nav.importerReview" },
  { href: "/gaps-actions",     label: "Gaps & Actions",  icon: "AlertTriangle",  roles: ["us_importer"], matches: ["/gaps-actions"], tKey: "nav.gapsActions" },
  { href: "/readiness",        label: "Readiness",       icon: "Gauge",          roles: ["us_importer"], matches: ["/readiness"], tKey: "nav.readiness" },
  { href: "/reports",          label: "Reports",         icon: "FileCheck2",     roles: ["us_importer"], matches: ["/reports"], tKey: "nav.reports" },
  { href: "/notifications",    label: "Notifications",   icon: "Bell",           roles: ["us_importer"], tKey: "nav.notifications" },

  // ── Reviewer + Admin nav ─────────────────────────────────────
  { href: "/reviewer",     label: "Review Queue",  icon: "ClipboardCheck", roles: ["reviewer", "administrator"], tKey: "nav.reviewQueue" },
  { href: "/audit-log",    label: "Audit Log",     icon: "ClipboardList",  roles: ["reviewer", "administrator"], tKey: "nav.auditLog" },
  { href: "/admin",        label: "Admin",         icon: "ShieldCheck", roles: ["administrator"], tKey: "nav.admin" },
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
