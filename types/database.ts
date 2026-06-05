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
  role: "supplier" | "reviewer" | "administrator";
  supplier_id: string | null;
  importer_id: string | null;
  user_status: "active" | "pending" | "suspended";
  last_login_at: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
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
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id" | "email">;
        Update: Partial<Profile>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
