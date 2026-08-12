import {
  AlertTriangle,
  BadgeCheck,
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
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
} from "lucide-react";
import type { NavItem } from "@/types/platform";

export const iconMap = {
  AlertTriangle,
  BadgeCheck,
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
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
  Warehouse
};

// supplierTypes: if set, item only shows when the logged-in supplier's
// supplier_type is in this list. "exporter" means export-eligible types
// (exporter, exporter_manufacturer, trader). "manufacturer" means non-exporters.
//
// ORDER MATTERS TWICE. Items render in array order, and AppShell prints a group
// heading whenever `group` changes between consecutive VISIBLE items — so items
// sharing a group must be adjacent, and a role's items must appear in the order
// that role actually works in.
//
// The importer order follows the data model: an exporter must exist before it
// can have a facility, and a facility before a product. It previously read
// Facilities → Products → Exporters, because importers were bolted onto the
// shared exporter/supplier block, which sits earlier in this array. That sent a
// new importer into two dead ends before reaching the thing they needed first.
// Facilities and Products are now split per side so each can sit where it
// belongs.
export const navItems: NavItem[] = [
  { href: "/dashboard",    label: "Dashboard",     icon: "LayoutDashboard", tKey: "nav.dashboard" },

  // ── Exporter / supplier nav ──────────────────────────────────
  { href: "/corporate",    label: "Company Overview", icon: "Building2", roles: ["exporter", "supplier"], matches: ["/corporate"], tKey: "nav.companyOverview" },
  // "Upstream Vendors", not "Suppliers". This page is the exporter's OWN
  // suppliers, while the importer's sidebar uses "Exporters" for the companies
  // it buys from — one word meaning two different companies depending on who is
  // signed in was the single biggest source of confusion in the nav.
  { href: "/my-suppliers", label: "Upstream Vendors", icon: "UsersRound",    roles: ["exporter"],              matches: ["/my-suppliers"], tKey: "nav.upstreamVendors" },
  { href: "/facilities",   label: "Facilities",   icon: "Warehouse",     roles: ["exporter", "supplier"], tKey: "nav.facilities" },
  { href: "/products",     label: "Products",     icon: "PackageSearch", roles: ["exporter", "supplier"], tKey: "nav.products" },
  { href: "/my-evidence",  label: "My Evidence",  icon: "FileArchive",   roles: ["exporter", "supplier"], tKey: "nav.myEvidence" },
  // /my-readiness existed, was role-gated to exporter/supplier, and was linked
  // from nowhere — the only readiness signal an exporter had was a dashboard
  // tile pointing at /corporate.
  { href: "/my-readiness", label: "My Readiness", icon: "Gauge",         roles: ["exporter", "supplier"], matches: ["/my-readiness"], tKey: "nav.myReadiness" },

  // ── Importer: supply chain ───────────────────────────────────
  // The importer owns Facilities and Products too — a managed exporter has no
  // account of its own, so someone has to create them, and that someone is the
  // importer.
  // Administrators are included deliberately. Facilities and Products already
  // listed them, so an admin got a "Supply Chain" heading with the middle of
  // the supply chain under it and no way to reach the companies themselves —
  // no exporter list, no supplier list, from any screen.
  { href: "/exporters",    label: "Exporters",    icon: "Building2",     roles: ["us_importer", "administrator", "reviewer"], matches: ["/exporters", "/suppliers"], tKey: "nav.exporters",  group: "Supply Chain", groupTKey: "nav.groupSupplyChain" },
  { href: "/importers",    label: "Importers",    icon: "UsersRound",    roles: ["administrator", "reviewer"], matches: ["/importers"], tKey: "nav.importers", group: "Supply Chain", groupTKey: "nav.groupSupplyChain" },
  { href: "/facilities",   label: "Facilities",   icon: "Warehouse",     roles: ["us_importer", "administrator"], tKey: "nav.facilities", group: "Supply Chain", groupTKey: "nav.groupSupplyChain" },
  { href: "/products",     label: "Products",     icon: "PackageSearch", roles: ["us_importer", "administrator"], tKey: "nav.products",   group: "Supply Chain", groupTKey: "nav.groupSupplyChain" },

  // ── Importer: compliance ─────────────────────────────────────
  // Reviewers are included on the first two because a tenant-scoped reviewer is
  // how an FSVP qualified individual holds a login (004_reviewer_tenancy.sql).
  // They have to reach the record to sign it, and the register to see their scope.
  // Applicability comes before FSVP Records because it decides whether a record
  // is needed at all — an exempt food never gets one.
  { href: "/setup/fsvp",           label: "Complete FSVP Setup",     icon: "ClipboardList",  roles: ["us_importer"], matches: ["/setup/fsvp"], group: "Compliance", groupTKey: "nav.groupCompliance" },
  { href: "/applicability",         label: "FSVP Applicability",     icon: "Scale",          roles: ["us_importer", "reviewer"], matches: ["/applicability"], tKey: "nav.applicability", group: "Compliance", groupTKey: "nav.groupCompliance" },
  { href: "/fsvp-records",          label: "FSVP Records",           icon: "FolderCheck",    roles: ["us_importer", "reviewer"], matches: ["/fsvp-records"], tKey: "nav.fsvpRecords", group: "Compliance", groupTKey: "nav.groupCompliance" },
  // Reviewers included for the same reason: screening a supplier's compliance
  // history is qualified-individual work under § 1.505(b).
  { href: "/compliance-history",     label: "Compliance History",     icon: "ShieldAlert",    roles: ["us_importer", "reviewer"], matches: ["/compliance-history"], tKey: "nav.complianceHistory", group: "Compliance", groupTKey: "nav.groupCompliance" },
  { href: "/qualified-individuals", label: "Qualified Individuals",  icon: "BadgeCheck",     roles: ["us_importer", "reviewer"], matches: ["/qualified-individuals"], tKey: "nav.qualifiedIndividuals", group: "Compliance", groupTKey: "nav.groupCompliance" },
  { href: "/importer-review",       label: "Exporter Submissions",   icon: "ClipboardCheck", roles: ["us_importer"], tKey: "nav.importerReview", group: "Compliance", groupTKey: "nav.groupCompliance" },
  { href: "/evidence",              label: "Document Library",       icon: "FileArchive",    roles: ["us_importer"], tKey: "nav.evidence",       group: "Compliance", groupTKey: "nav.groupCompliance" },

  // ── Importer: monitoring ─────────────────────────────────────
  { href: "/readiness",    label: "Readiness",      icon: "Gauge",         roles: ["us_importer"], matches: ["/readiness"],    tKey: "nav.readiness",   group: "Monitoring", groupTKey: "nav.groupMonitoring" },
  { href: "/shipment-readiness", label: "Shipment Readiness", icon: "PackageSearch", roles: ["us_importer"], matches: ["/shipment-readiness"], group: "Monitoring", groupTKey: "nav.groupMonitoring" },
  { href: "/gaps-actions", label: "Gaps & Actions", icon: "AlertTriangle", roles: ["us_importer"], matches: ["/gaps-actions"], tKey: "nav.gapsActions", group: "Monitoring", groupTKey: "nav.groupMonitoring" },
  { href: "/reports",      label: "Reports",        icon: "FileCheck2",    roles: ["us_importer"], matches: ["/reports"],      tKey: "nav.reports",     group: "Monitoring", groupTKey: "nav.groupMonitoring" },

  // Notifications is not a workspace — it lives in the header bell now
  // (components/layout/NotificationBell.tsx) rather than competing with real
  // destinations in the sidebar. The /notifications page still exists.

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
