const en = {
  // Brand
  brand: {
    name: "ThrushCross Verify",
    parent: "ThrushCross Trading & Commodities",
    tagline: "Verify · Trade · Grow",
    subtitle: "FSVP Compliance & Supplier Verification Platform",
    disclaimer: "This platform does not provide legal or regulatory advice. FSVP determinations should be reviewed by qualified regulatory professionals and/or a qualified FSVP Individual.",
  },

  // Navigation
  nav: {
    dashboard: "Dashboard",
    myEvidence: "My Evidence",
    myReadiness: "My Readiness",
    actionItems: "Action Items",
    suppliers: "Suppliers",
    products: "Products",
    facilities: "Facilities",
    evidence: "Evidence",
    gapsActions: "Gaps & Actions",
    readiness: "Readiness",
    reports: "Reports",
    reviewQueue: "Review Queue",
    auditLog: "Audit Log",
    admin: "Admin",
    account: "Account",
  },

  // Common actions
  actions: {
    save: "Save",
    cancel: "Cancel",
    edit: "Edit",
    delete: "Delete",
    add: "Add",
    upload: "Upload",
    download: "Download",
    export: "Export",
    search: "Search",
    filter: "Filter",
    submit: "Submit",
    confirm: "Confirm",
    back: "Back",
    next: "Next",
    skip: "Skip for now",
    saving: "Saving…",
    uploading: "Uploading…",
    loading: "Loading…",
    working: "Working…",
  },

  // Status labels
  status: {
    active: "Active",
    pending: "Pending",
    suspended: "Suspended",
    approved: "Approved",
    rejected: "Rejected",
    underReview: "Under Review",
    revisionRequired: "Revision Required",
    accepted: "Accepted",
    complete: "Complete",
    notStarted: "Not Started",
    missing: "Missing",
    open: "Open",
    inProgress: "In Progress",
    closed: "Closed",
    resolved: "Resolved",
    draft: "Draft",
  },

  // Roles
  roles: {
    supplier: "Supplier",
    us_importer: "US Importer",
    reviewer: "Reviewer",
    administrator: "Administrator",
  },

  // Auth pages
  auth: {
    login: {
      title: "Log in",
      button: "Log in",
      helper: "Access supplier readiness, reviewer queues, and document workflows.",
    },
    signup: {
      title: "Create account",
      button: "Create account",
      helper: "Email verification is required before protected access is granted.",
    },
    forgot: {
      title: "Reset password",
      button: "Send reset email",
      helper: "Enter your email and we will send a secure password reset link.",
    },
    reset: {
      title: "Set new password",
      button: "Update password",
      helper: "Choose a new password for your current recovery session.",
    },
    email: "Email",
    password: "Password",
    logIn: "Log in",
    getStarted: "Get started",
    dashboard: "Dashboard",
    resendVerification: "Resend verification email",
  },

  // Dashboard
  dashboard: {
    title: "Dashboard",
    subtitle: "Risk Dashboard",
    suppliers: "Suppliers",
    documents: "Documents",
    openActions: "Open Actions",
    assessments: "Assessments",
    documentsSubmitted: "Documents Submitted",
    actionItems: "Action Items",
    recentActivity: "Recent Activity",
    noActivity: "No activity yet",
    noActivityDetail: "Actions, reviews, and uploads will appear here.",
    startWithSuppliers: "Start with suppliers",
    setupProgress: "Setup Progress",
    noneYet: "None yet",
    steps: {
      completeProfile: "Complete your profile",
      addSupplier: "Add a supplier",
      addProduct: "Add a product or facility",
      uploadEvidence: "Upload evidence",
      runAssessment: "Run readiness assessment",
      uploadYourEvidence: "Upload your evidence",
      reviewActionItems: "Review action items",
    },
  },

  // Suppliers
  suppliers: {
    title: "Suppliers",
    description: "Manage your foreign supplier records, contacts, approval status, and FSVP compliance standing.",
    addSupplier: "Add supplier",
    addFirst: "Add your first supplier",
    empty: {
      title: "No suppliers yet",
      description: "Add your first foreign supplier to begin tracking FSVP compliance, evidence, and verification activities.",
    },
    form: {
      title: "Add Supplier",
      companyName: "Company Name",
      legalName: "Legal Entity Name",
      legalNamePlaceholder: "Legal name if different",
      country: "Country",
      fdaRegistration: "FDA Registration #",
      website: "Website",
      contact: "Primary Contact",
      contactName: "Contact Name",
      contactEmail: "Contact Email",
      saving: "Saving…",
    },
    table: {
      supplier: "Supplier",
      country: "Country",
      fdaRegistration: "FDA Registration",
      status: "Status",
      lastUpdated: "Last Updated",
    },
  },

  // Products
  products: {
    title: "Products",
    description: "Track every food product imported from your foreign suppliers — ingredients, allergens, intended use, and origin.",
    addProduct: "Add product",
    addFirst: "Add your first product",
    empty: {
      title: "No products yet",
      description: "Add products to link them to suppliers, map FSVP requirements, and track verification evidence.",
    },
    table: {
      product: "Product",
      supplier: "Supplier",
      origin: "Origin",
      intendedUse: "Intended Use",
      allergens: "Allergens",
    },
    noneOnFile: "None declared",
  },

  // Facilities
  facilities: {
    title: "Facilities",
    description: "Manage manufacturing facilities, FDA registrations, processes, certifications, and production capacity.",
    addFacility: "Add facility",
    addFirst: "Add your first facility",
    empty: {
      title: "No facilities recorded",
      description: "Add manufacturing and storage facilities to link them to suppliers and map their food safety certifications.",
    },
    table: {
      facility: "Facility",
      supplier: "Supplier",
      type: "Type",
      fdaRegistration: "FDA Registration",
      certifications: "Certifications",
    },
    noneOnFile: "None on file",
  },

  // Evidence
  evidence: {
    title: "Evidence",
    description: "Upload and manage FSVP evidence documents, track review status, and map each document to its regulatory requirement.",
    upload: {
      title: "Upload Evidence",
      subtitle: "PDF, Word, Excel, or image files up to 3 MB",
      dropzone: "Drop file here or click to browse",
      documentTitle: "Document Title",
      category: "Category",
      uploadButton: "Upload document",
      clear: "Clear",
    },
    table: {
      document: "Document",
      category: "Category",
      uploaded: "Uploaded",
      status: "Status",
    },
    requirements: {
      title: "FSVP Requirements",
      subtitle: "Evidence needed per 21 CFR Part 1, Subpart L",
    },
    empty: {
      title: "No documents uploaded",
      description: "Upload your first FSVP evidence document — COAs, audit reports, supplier questionnaires, hazard analyses, and more.",
    },
    uploaded: "Uploaded Documents",
  },

  // Gaps & Actions
  gapsActions: {
    title: "Gaps & Actions",
    description: "Track open corrective actions from verification findings, rejected evidence, recalls, and reassessments.",
    empty: {
      title: "No corrective actions",
      description: "Corrective actions appear here when verification evidence is rejected, a gap is identified, or a recall triggers follow-up work.",
    },
  },

  // Readiness
  readiness: {
    title: "Readiness",
    description: "Review your overall FSVP readiness score, identify critical gaps, and generate audit-ready reports.",
    overall: "Overall Readiness",
    history: "Assessment History",
    date: "Date",
    score: "Score",
    empty: {
      title: "No readiness assessment yet",
      description: "Start a readiness assessment to calculate your FSVP compliance score, surface critical gaps, and generate reports.",
    },
    startAssessment: "Start assessment",
  },

  // Reports
  reports: {
    title: "Reports",
    description: "Generate and export audit-ready FSVP reports including readiness summaries, gap registers, and evidence indexes.",
    generate: "Generate report",
    table: {
      report: "Report",
      type: "Type",
      format: "Format",
      generated: "Generated",
    },
    empty: {
      title: "No reports generated yet",
      description: "Generate a readiness report once suppliers, evidence, and an assessment are complete.",
      action: "Go to Readiness",
    },
  },

  // Review Queue
  reviewer: {
    title: "Review Queue",
    description: "Review submitted evidence, accept or request revisions, and approve supplier readiness reports.",
    empty: {
      title: "No reviews in queue",
      description: "Evidence submissions and readiness reports submitted for review will appear here.",
    },
    table: {
      supplier: "Supplier",
      reviewer: "Reviewer",
    },
  },

  // Audit Log
  auditLog: {
    title: "Audit Log",
    description: "Timestamped record of all actions taken in the platform — document reviews, role changes, supplier updates, and more.",
    export: "Export log",
    empty: {
      title: "No audit events yet",
      description: "Every action in the platform — uploads, reviews, role changes, and approvals — is recorded here automatically.",
    },
  },

  // Admin
  admin: {
    title: "Admin Command Center",
    description: "Manage users, roles, supplier queues, workflow rules, reference content, security settings, and audit visibility.",
    inviteUser: "Invite User",
    users: {
      title: "User Accounts",
      search: "Search by name, email, or org…",
      name: "Name",
      email: "Email",
      organization: "Organization",
      role: "Role",
      status: "Status",
      lastLogin: "Last Login",
      edit: "Edit",
      noName: "No name",
      never: "Never",
      noMatch: "No users match your search.",
      none: "No users found.",
    },
    rolePreview: {
      title: "View Site As Role",
      description: "Preview how the platform looks for each role. Your actual role and data access remain unchanged.",
      active: "active",
      previewing: "Previewing as",
      exitPreview: "Exit Preview",
    },
  },

  // My Evidence (supplier)
  myEvidence: {
    title: "My Evidence",
    description: "Upload and track your FSVP evidence submissions. You can see the review status and any notes from the reviewer here.",
    table: {
      document: "Document",
      category: "Category",
      submitted: "Submitted",
      reviewStatus: "Review Status",
      reviewerNotes: "Reviewer Notes",
    },
    uploaded: "Your Submitted Documents",
    empty: {
      title: "No documents uploaded yet",
      description: "Upload your evidence documents here — certificates of analysis, audit reports, food safety plans, and any other materials requested by your importer.",
    },
  },

  // My Readiness (supplier)
  myReadiness: {
    title: "My Readiness",
    description: "See how your submitted evidence tracks against FSVP requirements. Upload missing documents to improve your readiness score.",
    readinessScore: "Readiness Score",
    documentsSubmitted: "Documents submitted",
    accepted: "Accepted",
    underReview: "Under review",
    needsRevision: "Needs revision",
    checklist: {
      title: "FSVP Requirements Checklist",
      subtitle: "Each requirement needs at least one accepted document",
      required: "Required",
    },
    upload: "Upload",
  },

  // Action Items (supplier)
  actionItems: {
    title: "Action Items",
    description: "These are tasks your importer or reviewer has asked you to complete — uploading missing documents, responding to findings, or providing additional evidence.",
    needsAttention: "Needs your attention",
    resolved: "Resolved",
    reason: "Reason",
    opened: "Opened",
    whatsNeeded: "What's needed",
    uploadEvidence: "Upload evidence",
    empty: {
      title: "No action items",
      description: "You're all clear. When your importer requests additional documents, flags a finding, or needs a revision, it will appear here.",
    },
  },

  // Account / Profile
  account: {
    title: "Account",
    description: "Manage your profile, security preferences, language, and notification preferences.",
    save: "Save profile",
    saved: "Profile saved.",
    error: "Profile could not be saved",
    fields: {
      fullName: "Full Name",
      email: "Email",
      organization: "Organization Name",
      position: "Position",
      phone: "Phone Number",
      country: "Country",
      language: "Preferred Language",
      supplierType: "Supplier Type",
      importerType: "Importer Type",
      role: "Role",
      userStatus: "User Status",
    },
  },

  // Onboarding
  onboarding: {
    gettingStarted: "Getting Started",
    stepOf: "Step {step} of {total}",
    skipForNow: "Skip for now",
    importer: {
      step1: { title: "Complete your profile", description: "Add your name, organization, and contact details.", cta: "Go to Account" },
      step2: { title: "Add your first supplier", description: "Create a supplier record with company name, country, and contact information.", cta: "Add Supplier" },
      step3: { title: "Add products & facilities", description: "Link the food products your supplier exports and the facilities where they're produced.", cta: "Add Products" },
      step4: { title: "Upload FSVP evidence", description: "Upload COAs, audit reports, hazard analyses, and other required documents.", cta: "Upload Evidence" },
      step5: { title: "Run a readiness assessment", description: "Calculate your readiness score, identify gaps, and generate audit-ready reports.", cta: "Start Assessment" },
    },
    supplier: {
      step1: { title: "Complete your profile", description: "Add your company name, contact details, and country so your importer can identify you.", cta: "Go to Account" },
      step2: { title: "Upload your evidence", description: "Upload the documents your importer has requested — COAs, certifications, food safety plans.", cta: "Upload Evidence" },
      step3: { title: "Review your action items", description: "Check for any corrective actions or revision requests from your importer.", cta: "View Action Items" },
    },
  },

  // Language switcher
  language: {
    label: "Language",
    select: "Select language",
  },

  // Empty states
  empty: {
    noData: "No data yet",
  },

  // Errors
  errors: {
    generic: "Something went wrong. Please try again.",
    notFound: "Page not found.",
    unauthorized: "You are not authorized to view this page.",
    selectCountry: "Select a country from the dropdown list.",
  },
};

export default en;
export type Messages = typeof en;
