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

// The nav array itself lives in ./nav-items, which imports nothing but a
// type. This module pulls in every lucide icon component, and the nav
// invariant test needs the data without dragging React into a node test
// environment. Re-exported so existing importers are unaffected.
export { navItems } from "./nav-items";


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
