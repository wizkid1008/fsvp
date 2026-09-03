export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  organization_name: string | null;
  legal_entity_name: string | null;
  fda_registration_number: string | null;
  position: string | null;
  phone_number: string | null;
  country: string | null;
  preferred_language: string | null;
  supplier_type: string | null;
  importer_type: string | null;
  role: "supplier" | "exporter" | "us_importer" | "reviewer" | "administrator";
  supplier_id: string | null;
  importer_id: string | null;
  user_status: "active" | "pending" | "suspended";
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Country = {
  country_code: string;
  country_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Supplier = {
  id: string;
  organization_id: string | null;
  importer_id: string | null;
  foreign_supplier_id: string | null;
  company_name: string;
  legal_entity_name: string | null;
  registration_number: string | null;
  country: string;
  address_json: Json;
  website: string | null;
  contact_json: Json;
  export_markets: string[] | null;
  product_categories: string[] | null;
  fda_registration_number: string | null;
  certification_status: string;
  approval_status: string;
  portal_status: "active" | "pending" | "suspended";
  readiness_score: number | null;
  last_reviewed_at: string | null;
  rule_version_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductVerify = {
  id: string;
  importer_id: string | null;
  supplier_id: string | null;
  facility_id: string | null;
  commodity_id: string | null;
  product_name: string;
  product_description: string | null;
  country_of_origin: string | null;
  raw_or_processed: string | null;
  intended_use: string | null;
  ingredient_list: string | null;
  product_specifications: string | null;
  shelf_life: string | null;
  packaging_information: string | null;
  allergen_information: string | null;
  /**
   * The as-packed half of an FDA product code — migration 024.
   *
   * Subclass is the container material and PIC is the process, so both belong
   * to a particular product as packed rather than to its commodity: the same
   * commodity in metal and in glass carries different subclasses. The full
   * code lives here for the same reason — it is only meaningful once packing
   * is known, and it is what appears on an ACE entry line.
   */
  fda_subclass_code: string | null;
  fda_pic_code: string | null;
  fda_product_code: string | null;
  /** Null means nobody has checked the code, which is not the same as wrong. */
  fda_product_code_verified_at: string | null;
  readiness_score: number | null;
  approval_status: "pending" | "approved" | "conditionally_approved" | "improvement_required" | "not_approved";
  rule_version_id: string | null;
  last_reviewed_at: string | null;
  reviewed_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FacilityVerify = {
  id: string;
  importer_id: string | null;
  supplier_id: string | null;
  facility_name: string;
  facility_address_json: Json;
  facility_type: string;
  fda_registration_number: string | null;
  production_capacity: string | null;
  manufacturing_processes: string | null;
  food_safety_certifications: string[] | null;
  readiness_score: number | null;
  approval_status: "pending" | "approved" | "conditionally_approved" | "improvement_required" | "not_approved" | "suspended";
  rule_version_id: string | null;
  last_reviewed_at: string | null;
  reviewed_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FacilitySupplierAccess = {
  id: string;
  facility_id: string;
  supplier_id: string;
  importer_id: string | null;
  access_level: "view" | "manage";
  created_by_profile_id: string | null;
  created_at: string;
};

export type CorrectiveAction = {
  id: string;
  importer_id: string;
  supplier_id: string;
  food_id: string | null;
  triggered_by: string;
  triggered_at: string;
  issue_description: string;
  investigation_summary: string | null;
  action_taken: string | null;
  supplier_response: string | null;
  decision: string | null;
  closed_at: string | null;
  status: "open" | "in_progress" | "closed";
  created_at: string;
  updated_at: string;
};

export type ReadinessAssessment = {
  id: string;
  importer_id: string;
  supplier_id: string;
  status: "draft" | "submitted" | "under_review" | "revision_required" | "approved";
  overall_score: number;
  gap_summary: string | null;
  recommended_actions: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  importer_id: string | null;
  actor_profile_id: string | null;
  actor_role: string | null;
  action: string;
  record_type: string | null;
  record_id: string | null;
  previous_value: Json | null;
  new_value: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type GeneratedReport = {
  id: string;
  importer_id: string;
  supplier_id: string | null;
  report_type: string;
  export_format: string;
  title: string;
  storage_path: string | null;
  generated_by_profile_id: string | null;
  generated_at: string;
};

export type Review = {
  id: string;
  importer_id: string | null;
  supplier_id: string | null;
  product_id: string | null;
  reviewer_profile_id: string | null;
  review_type: string;
  status: string;
  notes: string | null;
  created_at: string;
  completed_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      countries: {
        Row: Country;
        Insert: Partial<Country> & Pick<Country, "country_code" | "country_name">;
        Update: Partial<Country>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          importer_id: string;
          document_kind: string;
          title: string;
          description: string | null;
          storage_path: string;
          original_filename: string | null;
          mime_type: string;
          size_bytes: number;
          sha256: string;
          language: string | null;
          linked_entity_type: string | null;
          linked_entity_id: string | null;
          uploaded_via: string;
          uploaded_at: string;
          soft_deleted_at: string | null;
          approval_status: string | null;
          reviewer_profile_id: string | null;
          review_notes: string | null;
          requirement_item_id: string | null;
          expiration_date: string | null;
          created_at: string;
        };
        Insert: {
          importer_id: string;
          document_kind: string;
          title: string;
          description?: string | null;
          storage_path: string;
          original_filename?: string | null;
          mime_type: string;
          size_bytes: number;
          sha256: string;
          language?: string | null;
          linked_entity_type?: string | null;
          linked_entity_id?: string | null;
          requirement_item_id?: string | null;
          expiration_date?: string | null;
          uploaded_via?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      suppliers: {
        Row: Supplier;
        Insert: Partial<Supplier> & Pick<Supplier, "company_name" | "country">;
        Update: Partial<Supplier>;
        Relationships: [];
      };
      products_verify: {
        Row: ProductVerify;
        Insert: Partial<ProductVerify> & Pick<ProductVerify, "product_name">;
        Update: Partial<ProductVerify>;
        Relationships: [];
      };
      facilities_verify: {
        Row: FacilityVerify;
        Insert: Partial<FacilityVerify> & Pick<FacilityVerify, "facility_name" | "facility_type">;
        Update: Partial<FacilityVerify>;
        Relationships: [];
      };
      facility_supplier_access: {
        Row: FacilitySupplierAccess;
        Insert: Partial<FacilitySupplierAccess> & Pick<FacilitySupplierAccess, "facility_id" | "supplier_id">;
        Update: Partial<FacilitySupplierAccess>;
        Relationships: [];
      };
      corrective_actions: {
        Row: CorrectiveAction;
        Insert: Partial<CorrectiveAction> & Pick<CorrectiveAction, "importer_id" | "supplier_id" | "triggered_by" | "triggered_at" | "issue_description">;
        Update: Partial<CorrectiveAction>;
        Relationships: [];
      };
      readiness_assessments: {
        Row: ReadinessAssessment;
        Insert: Partial<ReadinessAssessment> & Pick<ReadinessAssessment, "importer_id" | "supplier_id" | "overall_score">;
        Update: Partial<ReadinessAssessment>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & Pick<AuditLog, "action">;
        Update: Partial<AuditLog>;
        Relationships: [];
      };
      generated_reports: {
        Row: GeneratedReport;
        Insert: Partial<GeneratedReport> & Pick<GeneratedReport, "importer_id" | "report_type" | "export_format" | "title">;
        Update: Partial<GeneratedReport>;
        Relationships: [];
      };
      reviews: {
        Row: Review;
        Insert: Partial<Review> & Pick<Review, "review_type" | "status">;
        Update: Partial<Review>;
        Relationships: [];
      };
      foreign_suppliers: {
        Row: {
          id: string;
          importer_id: string;
          supplier_name: string;
          legal_name: string | null;
          country: string;
          address_json: Json;
          contact_name: string | null;
          contact_email: string | null;
          approval_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: { importer_id: string; supplier_name: string; country: string; address_json: Json };
        Update: Partial<Database["public"]["Tables"]["foreign_suppliers"]["Insert"]>;
        Relationships: [];
      };
      foods: {
        Row: {
          id: string;
          importer_id: string;
          supplier_id: string;
          food_name: string;
          description: string | null;
          intended_use: string | null;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: { importer_id: string; supplier_id: string; food_name: string };
        Update: Partial<Database["public"]["Tables"]["foods"]["Insert"]>;
        Relationships: [];
      };
      // --- Rules engine (migration 021) ---
      rule_sets: {
        Row: RuleSet;
        Insert: Partial<RuleSet> & Pick<RuleSet, "set_name" | "applies_to">;
        Update: Partial<RuleSet>;
        Relationships: [];
      };
      rule_versions: {
        Row: RuleVersion;
        Insert: Partial<RuleVersion> & Pick<RuleVersion, "rule_set_id" | "version_number">;
        Update: Partial<RuleVersion>;
        Relationships: [];
      };
      approval_thresholds: {
        Row: ApprovalThreshold;
        Insert: Partial<ApprovalThreshold> & Pick<ApprovalThreshold, "rule_version_id" | "label" | "min_score" | "max_score" | "resulting_status">;
        Update: Partial<ApprovalThreshold>;
        Relationships: [];
      };
      requirement_sections: {
        Row: RequirementSection;
        Insert: Partial<RequirementSection> & Pick<RequirementSection, "rule_version_id" | "section_key" | "section_name" | "applies_to">;
        Update: Partial<RequirementSection>;
        Relationships: [];
      };
      scoring_category_weights: {
        Row: ScoringCategoryWeight;
        Insert: Partial<ScoringCategoryWeight> & Pick<ScoringCategoryWeight, "rule_version_id" | "section_id" | "weight_percent">;
        Update: Partial<ScoringCategoryWeight>;
        Relationships: [];
      };
      requirement_items: {
        Row: RequirementItem;
        Insert: Partial<RequirementItem> & Pick<RequirementItem, "section_id" | "item_key" | "item_name">;
        Update: Partial<RequirementItem>;
        Relationships: [];
      };
      importer_supplier_links: {
        Row: ImporterSupplierLink;
        Insert: Partial<ImporterSupplierLink> & Pick<ImporterSupplierLink, "importer_id" | "supplier_id">;
        Update: Partial<ImporterSupplierLink>;
        Relationships: [];
      };
      // --- FSVP records & scoring (migration 022) ---
      scoring_results: {
        Row: ScoringResult;
        Insert: Partial<ScoringResult> & Pick<ScoringResult, "entity_type" | "entity_id" | "rule_version_id" | "overall_score">;
        Update: Partial<ScoringResult>;
        Relationships: [];
      };
      fsvp_records: {
        Row: FsvpRecord;
        Insert: Partial<FsvpRecord> & Pick<FsvpRecord, "importer_id" | "supplier_id" | "facility_id" | "product_id" | "rule_version_id">;
        Update: Partial<FsvpRecord>;
        Relationships: [];
      };
      fsvp_record_evidence: {
        Row: FsvpRecordEvidence;
        Insert: Partial<FsvpRecordEvidence> & Pick<FsvpRecordEvidence, "fsvp_record_id" | "document_id">;
        Update: Partial<FsvpRecordEvidence>;
        Relationships: [];
      };
      approval_decisions: {
        Row: ApprovalDecision;
        Insert: Partial<ApprovalDecision> & Pick<ApprovalDecision, "fsvp_record_id" | "importer_id" | "decision" | "decided_by_profile_id" | "rule_version_id">;
        Update: Partial<ApprovalDecision>;
        Relationships: [];
      };
      reassessment_schedules: {
        Row: ReassessmentSchedule;
        Insert: Partial<ReassessmentSchedule> & Pick<ReassessmentSchedule, "fsvp_record_id" | "importer_id" | "next_due_at">;
        Update: Partial<ReassessmentSchedule>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ── Rules engine types (migration 021) ──────────────────────────────────────

export type RuleSet = {
  id: string;
  set_name: string;
  description: string | null;
  applies_to: "facility" | "product" | "fsvp_record" | "all";
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RuleVersion = {
  id: string;
  rule_set_id: string;
  version_number: number;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  archived_at: string | null;
  cloned_from_version_id: string | null;
  notes: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApprovalThreshold = {
  id: string;
  rule_version_id: string;
  label: string;
  min_score: number;
  max_score: number;
  resulting_status: string;
  created_at: string;
};

export type RequirementSection = {
  id: string;
  rule_version_id: string;
  section_key: string;
  section_name: string;
  applies_to: "facility" | "product" | "supplier";
  description: string | null;
  sort_order: number;
  created_at: string;
};

export type ScoringCategoryWeight = {
  id: string;
  rule_version_id: string;
  section_id: string;
  weight_percent: number;
  created_at: string;
};

export type RequirementItem = {
  id: string;
  section_id: string;
  item_key: string;
  item_name: string;
  description: string | null;
  evidence_type: string | null;
  is_required: boolean;
  is_critical_blocker: boolean;
  auto_accept: boolean;
  expiration_applies: boolean;
  cfr_citation: string | null;
  sort_order: number;
  /**
   * 'entity' — one document answers for everyone who reads it.
   * 'importer_relationship' — an agreement between one supplier and one
   * importer, satisfied only by a document filed for that importer.
   * See migration 028 and lib/readiness/evidence-scope.ts.
   */
  evidence_scope: "entity" | "importer_relationship";
  created_at: string;
};

export type ImporterSupplierLink = {
  id: string;
  importer_id: string;
  supplier_id: string;
  relationship_status: "active" | "paused" | "terminated";
  linked_at: string;
  linked_by_profile_id: string | null;
};

// ── FSVP records & scoring types (migration 022) ────────────────────────────

export type ScoringResult = {
  id: string;
  entity_type: "facility" | "product" | "fsvp_record";
  entity_id: string;
  rule_version_id: string;
  overall_score: number;
  section_scores: Json;
  is_stale: boolean;
  critical_blockers_present: boolean;
  calculated_at: string;
};

export type FsvpRecordStatus =
  | "draft"
  | "awaiting_supplier_evidence"
  | "supplier_evidence_submitted"
  | "supplier_evidence_accepted"
  | "importer_review_pending"
  | "importer_approved"
  | "conditionally_approved"
  | "needs_corrective_action"
  | "rejected"
  | "expired"
  | "reassessment_due";

export type FsvpRecord = {
  id: string;
  importer_id: string;
  supplier_id: string;
  facility_id: string;
  product_id: string;
  rule_version_id: string;
  status: FsvpRecordStatus;
  hazard_analysis_notes: string | null;
  supplier_evaluation_notes: string | null;
  facility_evaluation_notes: string | null;
  verification_determination: string | null;
  overall_score: number | null;
  approval_decision: "approved" | "conditionally_approved" | "rejected" | null;
  approved_by_profile_id: string | null;
  approved_at: string | null;
  reassessment_due_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FsvpRecordEvidence = {
  id: string;
  fsvp_record_id: string;
  document_id: string;
  requirement_item_id: string | null;
  attached_by_profile_id: string | null;
  attached_at: string;
  notes: string | null;
};

export type ApprovalDecision = {
  id: string;
  fsvp_record_id: string;
  importer_id: string;
  decision: "approved" | "conditionally_approved" | "rejected" | "revision_requested";
  decision_notes: string | null;
  conditions_text: string | null;
  decided_by_profile_id: string;
  decided_at: string;
  rule_version_id: string;
};

export type ReassessmentSchedule = {
  id: string;
  fsvp_record_id: string;
  importer_id: string;
  frequency_months: number;
  last_assessed_at: string | null;
  next_due_at: string;
  status: "scheduled" | "overdue" | "completed" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type FormDefinition = {
  id: string;
  rule_version_id: string;
  requirement_item_id: string;
  form_key: string;
  title: string;
  description: string | null;
  /** Validated by parseFormSchema in lib/forms/schema.ts, not by the database. */
  schema_json: Json;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type FormResponse = {
  id: string;
  form_definition_id: string;
  supplier_id: string;
  importer_id: string | null;
  requirement_item_id: string | null;
  version: number;
  answers_json: Json;
  /** Review status lives on the rendered document, not here. */
  status: "draft" | "submitted";
  document_id: string | null;
  submitted_by_profile_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QualificationBasis = "education" | "training" | "experience" | "combination";

export type QualifiedIndividual = {
  id: string;
  importer_id: string;
  /** Not null: a QI must have a login, because only they can sign. */
  profile_id: string;
  qualification_basis: QualificationBasis;
  education: string | null;
  training: string | null;
  experience: string | null;
  languages: string[] | null;
  scope: string[] | null;
  credentials_document_id: string | null;
  active_from: string;
  active_to: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AttestationType =
  | "hazard_analysis"
  | "supplier_evaluation"
  | "verification_determination"
  | "reassessment"
  | "applicability_determination";

export type EntitySizeDetermination = {
  id: string;
  importer_id: string;
  category: "very_small_importer";
  food_scope: "human" | "animal";
  three_year_average: number;
  currency: string;
  basis_notes: string | null;
  determined_at: string;
  reaffirmed_at: string | null;
  expires_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicabilityDetermination = {
  id: string;
  importer_id: string;
  supplier_id: string;
  product_id: string;
  outcome: "in_scope" | "exempt" | "modified";
  /** One of the keys in lib/fsvp/applicability.ts. */
  basis: string;
  /** Written server-side from the basis, never taken from the client. */
  citation: string;
  rationale: string;
  entity_size_determination_id: string | null;
  qualified_individual_id: string;
  determined_at: string;
  expires_at: string | null;
  superseded_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

export type QiAttestation = {
  id: string;
  importer_id: string;
  qualified_individual_id: string;
  /** Exactly one of these two is set. */
  fsvp_record_id: string | null;
  applicability_determination_id: string | null;
  attestation_type: AttestationType;
  statement: string;
  /** The narrative exactly as it stood when signed, plus its SHA-256. */
  content_snapshot: string;
  content_hash: string;
  signed_by_profile_id: string;
  signed_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
};

// ── Reference layer (migration 012) ─────────────────────────────────────────

/** Global commodity taxonomy. A fact about the world, not about one importer. */
export type Commodity = {
  id: string;
  common_name: string;
  scientific_name: string | null;
  commodity_class:
    | "fruit" | "vegetable" | "nut" | "grain" | "herb_spice"
    | "seafood" | "meat_poultry" | "dairy" | "egg"
    | "beverage" | "processed_food" | "supplement" | "other";
  /** Which part enters — APHIS rules differ sharply between fruit and leaf. */
  plant_part:
    | "fruit" | "leaf" | "root" | "seed" | "pod" | "stem" | "flower"
    | "whole_plant" | "bulb" | "tuber" | "all_including_seed" | "not_applicable" | null;
  /** Propagative material is regulated far more strictly than the same species as food. */
  is_propagative: boolean;
  /**
   * The commodity-level third of an FDA product code — migration 024.
   *
   * Subclass and PIC are absent on purpose: they encode the container material
   * and the process, so they describe a product as packed rather than a
   * commodity, and live on `products_verify`. One commodity has many valid full
   * codes, which is why there is no `fda_product_code` here any more.
   */
  fda_industry_code: string | null;
  fda_class_code: string | null;
  fda_product_group: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * An importer saying no commodity in the taxonomy describes their product.
 *
 * Exists so the alternative to an unusable dropdown is not picking the nearest
 * wrong commodity — a determination made against the wrong commodity still
 * arrives with a citation and an expiry and reads as authoritative. See
 * migration 024.
 */
export type CommodityClassificationRequest = {
  id: string;
  importer_id: string;
  product_id: string;
  requested_by_profile_id: string | null;
  described_as: string;
  commodity_class:
    | "fruit" | "vegetable" | "nut" | "grain" | "herb_spice"
    | "seafood" | "meat_poultry" | "dairy" | "egg"
    | "beverage" | "processed_food" | "supplement" | "other" | null;
  plant_part:
    | "fruit" | "leaf" | "root" | "seed" | "pod" | "stem" | "flower"
    | "whole_plant" | "bulb" | "tuber" | "all_including_seed" | "not_applicable" | null;
  is_propagative: boolean | null;
  notes: string | null;
  /** What FDA's Product Code Builder returned at request time. Evidence, not a proposal. */
  pcb_candidates: Json | null;
  status: "open" | "resolved" | "declined";
  /**
   * Resolving does NOT classify the product — the US importer still does that,
   * because that is where FSVP puts the responsibility.
   */
  resolved_commodity_id: string | null;
  resolution_note: string | null;
  resolved_by_profile_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * A curated claim about what an agency currently requires.
 *
 * `citation`, `source_url`, `reviewed_at` and `review_due_at` are all NOT NULL
 * by design: APHIS publishes no usable API, so this table is maintained by hand
 * and staleness — not absence — is the primary risk. See migration 012.
 */
export type CountryCommodityRule = {
  id: string;
  commodity_id: string;
  /**
   * Declared, never inferred from the columns below — migration 026. A
   * forgotten origin would otherwise become a rule about everywhere, and the
   * documents written that way are usually the prohibitions.
   */
  origin_scope: "country" | "region" | "global";
  /** Set according to `origin_scope`; both null when it is `global`. */
  origin_country: string | null;
  origin_region: string | null;
  /**
   * `not_for_propagation` is APHIS's own category — everything except planting
   * stock — and ranks between an exact use and `any`. Migration 026.
   */
  intended_use:
    | "any" | "consumption" | "processing" | "propagation" | "research"
    | "not_for_propagation";
  processing_state:
    | "any" | "fresh" | "fresh_cut" | "frozen" | "dried" | "cooked" | "canned" | "other";
  admissibility: "permitted" | "restricted" | "prohibited";
  /**
   * Null means the source document does not say — migration 026. It is not
   * false, and is surfaced to the importer as an open question. A document
   * that is simply silent about phyto used to be stored as "none required".
   */
  permit_required: boolean | null;
  phyto_required: boolean | null;
  treatment_required: boolean | null;
  peq_required: boolean | null;
  additional_declarations: string[] | null;
  designated_ports: string[] | null;
  conditions_text: string | null;
  citation: string;
  source_url: string;
  /** Only a verified rule may support a determination — migration 014. */
  verification_status: "draft" | "verified";
  verified_by_profile_id: string | null;
  verified_at: string | null;
  /** What was actually consulted, e.g. "ACIR, mango from Mexico, 2026-08-11". */
  verified_against: string | null;
  /** The CFR part, for eCFR change detection. Coarser than `citation`. */
  cfr_part: string | null;
  source_checksum: string | null;
  source_checked_at: string | null;
  /** Set when detection sees the source move: "the ground shifted". */
  source_changed_at: string | null;
  reviewed_at: string;
  reviewed_by_profile_id: string | null;
  review_due_at: string;
  effective_from: string;
  effective_to: string | null;
  superseded_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

/** country_commodity_rules with currency computed — see the view in 012/014. */
export type CountryCommodityRuleStatus = CountryCommodityRule & {
  /** Verified, unsuperseded, in window, in review, and unmoved at source. */
  is_current: boolean;
  /** Still in force, but nobody has re-checked it. Readable, not authoritative. */
  is_overdue: boolean;
  /** Written but never confirmed by a second person. Forces manual review. */
  is_draft: boolean;
  /** Change detection saw the underlying text move since verification. */
  source_moved: boolean;
  days_until_review: number;
};

// ── Suspension, assurances, verification (migration 010) ────────────────────

/** Per importer, never per supplier: `suppliers` is a shared global entity. */
export type SupplierSuspension = {
  id: string;
  importer_id: string;
  supplier_id: string;
  basis:
    | "verification_failure"
    | "corrective_action_open"
    | "regulatory_finding"
    | "evidence_lapsed"
    | "commercial"
    | "other";
  reason: string;
  suspended_at: string;
  suspended_by_profile_id: string;
  lifted_at: string | null;
  lifted_by_profile_id: string | null;
  lift_rationale: string | null;
  created_at: string;
  updated_at: string;
};

/** 21 CFR 1.507. Renewed at least annually; `citation` is written server-side. */
export type WrittenAssurance = {
  id: string;
  importer_id: string;
  supplier_id: string | null;
  product_id: string | null;
  fsvp_record_id: string | null;
  category:
    | "customer_preventive_controls"
    | "customer_food_safety_compliance"
    | "downstream_processing"
    | "rac_no_assurance_required"
    | "importer_controlled";
  citation: string;
  counterparty_name: string | null;
  counterparty_role: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  food_scope: string;
  hazard_description: string | null;
  assurance_text: string;
  effective_from: string;
  expires_at: string;
  document_id: string | null;
  superseded_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

/** 21 CFR 1.506(d). The SAHCODHA rule is enforced by trigger and by the API. */
export type VerificationDetermination = {
  id: string;
  importer_id: string;
  fsvp_record_id: string;
  activities: string[];
  frequency_notes: string;
  hazard_analysis_basis: string;
  supplier_performance_basis: string;
  food_and_supplier_risk_basis: string;
  storage_and_transport_basis: string | null;
  sahcodha_hazard_present: boolean;
  controlled_by_foreign_supplier: boolean;
  annual_onsite_audit_performed: boolean;
  alternative_justification: string | null;
  determined_at: string;
  qualified_individual_id: string;
  superseded_at: string | null;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

/** 21 CFR 1.508(b): reassessment prompted by an event, not just the clock. */
export type ReassessmentTrigger = {
  id: string;
  importer_id: string;
  fsvp_record_id: string;
  trigger_type:
    | "corrective_action_opened"
    | "verification_unacceptable"
    | "regulatory_finding_confirmed"
    | "supplier_suspended"
    | "assurance_expired"
    | "manual";
  source_table: string | null;
  source_id: string | null;
  detail: string;
  triggered_at: string;
  resolved_at: string | null;
  resolved_by_reassessment_id: string | null;
  created_at: string;
};

// ── Retention and the signature ledger (migration 011) ──────────────────────

/** One row per signature, across every kind of signed record. § 1.510(a)(2). */
export type FsvpSignatureLedgerRow = {
  id: string;
  importer_id: string;
  attestation_type: AttestationType;
  target_type: "fsvp_record" | "applicability_determination";
  target_id: string;
  qualified_individual_id: string;
  signer_profile_id: string | null;
  signer_name: string | null;
  signer_email: string | null;
  statement: string;
  content_hash: string;
  signed_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  is_current: boolean;
};

// ── Regulatory intelligence types (migration 009) ───────────────────────────

export type RegulatorySource =
  | "fda_food_enforcement"
  | "fda_import_refusals"
  | "fda_inspections_classifications"
  | "fda_compliance_actions";

export type RegulatoryIngestRun = {
  id: string;
  source: RegulatorySource;
  status: "running" | "succeeded" | "failed";
  window_from: string | null;
  window_to: string | null;
  records_seen: number;
  records_new: number;
  candidates_created: number;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  triggered_by_profile_id: string | null;
};

/**
 * A fact FDA published about a firm. Global and tenant-free — attribution to
 * one of our suppliers lives in SupplierComplianceHistory, never here.
 */
export type RegulatoryEvent = {
  id: string;
  source: RegulatorySource;
  /** The source's own identifier. Unique with `source`. */
  source_ref: string;
  event_type:
    | "recall"
    | "import_refusal"
    | "inspection_classification"
    | "warning_letter"
    | "seizure"
    | "injunction"
    | "other_action";
  event_date: string | null;
  /** Firm identity exactly as FDA published it, never normalised in place. */
  firm_name: string | null;
  firm_fei: string | null;
  firm_country: string | null;
  firm_address: string | null;
  product_description: string | null;
  summary: string;
  classification: string | null;
  detail_json: Json;
  source_url: string | null;
  retrieved_at: string;
  ingest_run_id: string | null;
  created_at: string;
};

/**
 * Our claim that an FDA record concerns one of our suppliers — a judgement,
 * per tenant, that a person confirms. Only `confirmed` rows count anywhere.
 */
export type SupplierComplianceHistory = {
  id: string;
  importer_id: string;
  regulatory_event_id: string;
  /** Exactly one of these two is set. */
  supplier_id: string | null;
  facility_id: string | null;
  match_status: "candidate" | "confirmed" | "rejected";
  match_method: "fei_exact" | "name_country_exact" | "name_country_fuzzy" | "manual";
  match_confidence: number;
  match_rationale: string;
  reviewed_by_profile_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

/** The § 1.505(a)(1)(iv) record that a supplier's history was considered. */
export type SupplierComplianceScreening = {
  id: string;
  importer_id: string;
  supplier_id: string;
  /** Which sources were covered, and how fresh each was at the time. */
  sources_json: Json;
  confirmed_event_count: number;
  adverse_findings: string | null;
  conclusion: "no_adverse_history" | "adverse_history_accepted" | "adverse_history_blocking";
  rationale: string;
  screened_by_profile_id: string;
  screened_at: string;
  expires_at: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
};
