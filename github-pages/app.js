const readinessCategories = [
  ["Supplier Identity", 94, "Legal registration and contact information are complete."],
  ["Product Information", 88, "Product specifications and ingredient disclosures are mostly complete."],
  ["Hazard Analysis", 71, "Chemical hazard rationale requires qualified review."],
  ["Food Safety Controls", 79, "Preventive controls evidence is partially mapped."],
  ["FDA Registration", 100, "Current FDA facility registration is on file."],
  ["Verification Activities", 73, "Audit and testing plan needs reviewer sign-off."],
  ["Traceability", 84, "Lot tracking evidence is organized."],
  ["Labeling", 77, "Allergen control review is still open."],
  ["Certifications", 86, "BRCGS certificate is active but renewal is approaching."],
  ["Recall Preparedness", 68, "Mock recall documentation remains incomplete."]
];

const documentCategories = [
  "Food Safety Plan",
  "HACCP Plan",
  "HARPC Plan",
  "Certificate of Analysis",
  "Audit Report",
  "GMP Certification",
  "FDA Registration Document",
  "Recall Record",
  "Traceability Record",
  "Supplier Questionnaire",
  "Product Specification",
  "Allergen Control Program",
  "Environmental Monitoring Record",
  "Corrective Action Report",
  "Laboratory Testing Report",
  "Training Record"
];

const state = {
  documents: [
    ["HACCP plan", "v3", "Reviewer requested CCP monitoring clarification.", "Revision", "warning"],
    ["FDA registration", "2026", "Validated against supplier profile.", "Approved", "success"],
    ["Mock recall report", "Draft", "Supplier uploaded a new version.", "Review", "info"]
  ],
  products: [
    ["Mango puree", "Ingredient", "Allergen statement complete.", "Ready", "success"],
    ["Roasted pepper strips", "RTE vegetable", "Needs updated product specification.", "Revision", "warning"],
    ["Berry preparation", "Fruit prep", "Hazard analysis pending reviewer sign-off.", "Review", "info"]
  ],
  facilities: [
    ["Santiago Plant 2", "Manufacturing", "FDA registration and BRCGS certificate on file.", "Active", "success"],
    ["Valparaiso Warehouse", "Storage", "GMP certificate expiring soon.", "Due", "warning"],
    ["Co-packer", "Thermal processing", "Awaiting process flow diagram.", "Pending", "neutral"]
  ],
  supplier: [
    ["Company", "Pacific Valley Foods Ltd.", "Legal entity and registration verified.", "Approved", "success"],
    ["Country", "Chile", "Exports fruit preparations and shelf-stable ingredients.", "Active", "info"],
    ["Certification", "BRCGS Food Safety", "Expires in 74 days.", "Renewal due", "warning"]
  ],
  reviewer: [
    ["Pacific Valley Foods", "6 items", "Two documents require revision.", "Under Review", "info"],
    ["Andes Ingredients", "Ready", "Final supplier evaluation prepared.", "Approve", "success"],
    ["Coastal Preserves", "Late", "COA and recall records missing.", "Escalate", "danger"]
  ],
  reports: [
    ["Readiness report", "PDF", "Supplier-facing summary with category scores.", "Available", "success"],
    ["Gap report", "Excel", "Action register with owners and due dates.", "Available", "success"],
    ["Audit report", "PDF", "Reviewer notes and document approvals.", "Draft", "neutral"]
  ],
  notifications: [
    ["Certification expiry", "74 days", "BRCGS certificate renewal reminder.", "Scheduled", "warning"],
    ["Review request", "Today", "Mock recall report needs reviewer action.", "New", "info"],
    ["Approval notice", "Sent", "FDA registration document approved.", "Delivered", "success"]
  ]
};

const nextActions = [
  "Upload latest mock recall evidence",
  "Resolve HACCP plan review note",
  "Renew GMP certification before expiry",
  "Generate supplier readiness report"
];

const title = document.querySelector("#view-title");
const subtitle = document.querySelector("#view-subtitle");
const toast = document.querySelector("#toast");

function statusBadge(label, tone) {
  return `<span class="status ${tone === "neutral" ? "" : tone}">${label}</span>`;
}

function recordCard([label, value, detail, status, tone]) {
  return `
    <article>
      <div>
        <div class="record-title">${label}</div>
        <div class="record-meta">${value}</div>
      </div>
      <p class="record-detail">${detail}</p>
      ${statusBadge(status, tone)}
    </article>
  `;
}

function renderRecords(targetId, records) {
  document.querySelector(targetId).innerHTML = records.map(recordCard).join("");
}

function renderReadiness() {
  document.querySelector("#readinessBars").innerHTML = readinessCategories
    .map(([label, score]) => `
      <div class="score-row">
        <div class="score-label"><span>${label}</span><strong>${score}%</strong></div>
        <div class="bar"><span style="width:${score}%"></span></div>
      </div>
    `)
    .join("");

  document.querySelector("#assessmentList").innerHTML = readinessCategories
    .map(([label, score, detail], index) => `
      <div class="assessment-item">
        <div>
          <div class="record-title">${label}</div>
          <div class="record-detail">${detail}</div>
        </div>
        <input type="range" min="0" max="100" value="${score}" data-score-slider="${index}" />
        <strong data-score-value="${index}">${score}%</strong>
      </div>
    `)
    .join("");

  document.querySelectorAll("[data-score-slider]").forEach((slider) => {
    slider.addEventListener("input", () => {
      const index = Number(slider.dataset.scoreSlider);
      readinessCategories[index][1] = Number(slider.value);
      document.querySelector(`[data-score-value="${index}"]`).textContent = `${slider.value}%`;
      updateOverallScore();
    });
  });

  updateOverallScore();
}

function updateOverallScore() {
  const average = Math.round(readinessCategories.reduce((sum, item) => sum + item[1], 0) / readinessCategories.length);
  document.querySelector("#overallScore").textContent = `${average}%`;
}

function renderActions() {
  document.querySelector("#nextActions").innerHTML = nextActions.map((item) => `<li>${item}</li>`).join("");
}

function renderAll() {
  renderReadiness();
  renderActions();
  renderRecords("#supplierRecords", state.supplier);
  renderRecords("#productRecords", state.products);
  renderRecords("#facilityRecords", state.facilities);
  renderRecords("#documentRecords", state.documents);
  renderRecords("#reviewerRecords", state.reviewer);
  renderRecords("#reportRecords", state.reports);
  renderRecords("#notificationRecords", state.notifications);
  document.querySelector("#documentCount").textContent = String(44 + state.documents.length);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function showView(viewId) {
  const view = document.querySelector(`#${viewId}`);
  if (!view) return;

  document.querySelectorAll(".view").forEach((item) => item.classList.remove("active"));
  view.classList.add("active");
  document.querySelectorAll("[data-view-link]").forEach((item) => {
    item.classList.toggle("active", item.dataset.viewLink === viewId);
  });
  title.textContent = view.dataset.title;
  subtitle.textContent = view.dataset.subtitle;
  window.location.hash = viewId;
}

document.querySelectorAll("[data-view-link]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    showView(button.dataset.viewLink);
  });
});

documentCategories.forEach((category) => {
  const option = document.createElement("option");
  option.textContent = category;
  document.querySelector("#documentCategory").appendChild(option);
});

document.querySelector("#queueDocumentButton").addEventListener("click", () => {
  const file = document.querySelector("#documentFile").files[0];
  const category = document.querySelector("#documentCategory").value;
  const name = file ? file.name : category;
  state.documents.unshift([name, category, "Queued locally for supplier evidence review.", "Submitted", "info"]);
  renderRecords("#documentRecords", state.documents);
  document.querySelector("#documentCount").textContent = String(44 + state.documents.length);
  showToast("Document queued for review.");
});

document.querySelector("#addProductButton").addEventListener("click", () => {
  state.products.unshift(["New product", "Draft", "Specification, ingredients, and market fields ready for completion.", "Draft", "neutral"]);
  renderRecords("#productRecords", state.products);
  showToast("Product draft added.");
});

document.querySelector("#addFacilityButton").addEventListener("click", () => {
  state.facilities.unshift(["New facility", "Draft", "Registration, process, and certification fields ready for completion.", "Draft", "neutral"]);
  renderRecords("#facilityRecords", state.facilities);
  showToast("Facility draft added.");
});

[
  ["#submitReviewButton", "Supplier package submitted for review."],
  ["#saveSupplierButton", "Supplier profile saved."],
  ["#recalculateButton", "Readiness score recalculated."],
  ["#approveSelectedButton", "Selected reviewer item approved."],
  ["#generateReportButton", "Executive summary report generated."],
  ["#markReadButton", "Notifications marked read."],
  ["#saveSettingsButton", "Settings saved."]
].forEach(([selector, message]) => {
  document.querySelector(selector).addEventListener("click", () => showToast(message));
});

renderAll();
showView(window.location.hash.replace("#", "") || "dashboard");
