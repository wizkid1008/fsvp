export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  organization_name: string | null;
  position: string | null;
  phone_number: string | null;
  country: string | null;
  preferred_language: string | null;
  supplier_type: string | null;
  importer_type: string | null;
  role: "supplier" | "reviewer" | "administrator";
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
  created_at: string;
  updated_at: string;
};

export type ProductVerify = {
  id: string;
  importer_id: string | null;
  supplier_id: string | null;
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
  created_at: string;
  updated_at: string;
};

export type FsvpRequirement = {
  id: string;
  requirement_key: string;
  requirement_name: string;
  requirement_description: string;
  cfr_citation: string | null;
  required_evidence: string;
  active: boolean;
  sort_order: number;
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
          related_requirement_id: string | null;
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
      fsvp_requirements: {
        Row: FsvpRequirement;
        Insert: Partial<FsvpRequirement> & Pick<FsvpRequirement, "requirement_key" | "requirement_name" | "requirement_description" | "required_evidence">;
        Update: Partial<FsvpRequirement>;
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
