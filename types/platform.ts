export type AppRole = "supplier" | "exporter" | "us_importer" | "reviewer" | "administrator";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  matches?: string[];
  roles?: AppRole[];
  tKey?: string;
  // "exporter" = export-eligible supplier types (exporter, exporter_manufacturer, trader)
  // "manufacturer" = non-exporting types (manufacturer, broker)
  // If omitted, shown to all supplier types
  supplierTypes?: ("exporter" | "manufacturer")[];
};


export type CommodityWorkflow = {
  commodity: string;
  likelyRisks: string[];
  requiredEvidence: string[];
  verificationActivities: string[];
};

export type FsvpRequirement = {
  name: string;
  description: string;
  requiredEvidence: string;
  uploadedEvidence: string;
  reviewerStatus: string;
  gapStatus: string;
  correctiveAction: string;
  finalDetermination: string;
};

export type ReadinessScoreCategory = {
  category: string;
  weight: number;
  score: number;
  criticalGap: string;
  nextAction: string;
};

export type RoleWorkflow = {
  role: string;
  permissions: string[];
  dashboardFocus: string[];
  primaryActions: string[];
};
