# Supabase Configuration

## Authentication

Enable email/password authentication, email confirmation, and password recovery in Supabase Auth.

Redirect URLs:

- `http://localhost:3000/auth/callback`
- `https://<production-domain>/auth/callback`
- `https://<production-domain>/reset-password`

## Tables

Core app tables added by migration `013_app_auth_storage_readiness.sql`:

- `profiles`
- `supplier_facilities`
- `supplier_products`
- `document_versions`
- `document_reviews`
- `reviewer_assignments`
- `readiness_assessments`
- `readiness_scores`
- `review_comments`
- `app_notifications`
- `generated_reports`
- `background_reference_documents`
- `audit_logs`

The regulatory backbone is in migrations `001` through `012`.

Risk-first product tables added by migration `014_thrushcross_verify_redesign.sql`:

- `organizations`
- `user_roles`
- `suppliers`
- `commodities`
- `products_verify`
- `facilities_verify`
- `commodity_risks`
- `fsvp_requirements`
- `requirement_evidence`
- `reviews`
- `readiness_reports`

## Storage

Buckets:

- `supplier-documents`: private supplier evidence files
- `background-documents`: private administrator-maintained reference library

Supplier document object names should begin with the importer UUID so RLS can map storage paths to tenant access.

## RLS

Policies allow:

- Users to read and update their own profiles
- Administrators to manage platform records
- Tenant users to read/write records connected to their importer
- Role-scoped users to read records for their organization or importer context
- Authenticated users to read commodity and active FSVP requirement libraries
- Authenticated users to read background references
- Administrators to maintain background documents

Review the policies before launch against final business roles and approval workflows.
