export type AppRole = "supplier" | "reviewer" | "administrator";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
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
