export type AppRole = "supplier" | "reviewer" | "administrator";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  matches?: string[];
  roles?: AppRole[];
};

export type ModuleRecord = {
  label: string;
  value: string;
  detail: string;
  status: string;
  tone: StatusTone;
};

export type ModuleConfig = {
  title: string;
  description: string;
  primaryAction: string;
  records: ModuleRecord[];
  checklist: string[];
};

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type RiskSignal = {
  supplier: string;
  commodity: string;
  country: string;
  riskLevel: RiskLevel;
  readinessStatus: string;
  score: number;
  blockers: string[];
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
