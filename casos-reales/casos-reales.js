const casesConfig = window.ANTONY_MEDIA_CONFIG || {};
const casesReady = Boolean(casesConfig.supabaseUrl && casesConfig.supabaseAnonKey);
const casesSection = document.querySelector("#casesLiveEvidence");
const casesGrid = document.querySelector("#casesLiveEvidenceGrid");
const caseViewerModal = document.querySelector("#caseViewerModal");
const caseViewerImage = document.querySelector("#caseViewerImage");
const caseViewerTitle = document.querySelector("#caseViewerTitle");
const caseViewerText = document.querySelector("#caseViewerText");
const caseViewerCount = document.querySelector("#caseViewerCount");
const closeCaseViewer = document.querySelector("#closeCaseViewer");
const previousCase = document.querySelector("#previousCase");
const nextCase = document.querySelector("#nextCase");
const staticCaseButtons = Array.from(document.querySelectorAll("[data-case-src]"));
let activeCaseIndex = 0;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeEvidence(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    city: item.city,
    eventDate: item.eventDate || item.event_date,
    description: item.description,
    mediaType: item.mediaType || item.media_type,
    mediaUrl: item.mediaUrl || item.media_url,
    isFeatured: Boolean(item.isFeatured ?? item.is_featured)
  };
}

function mediaMarkup(item) {
  if (item.mediaType === "video") {
    return `<video src="${escapeHtml(item.mediaUrl)}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeHtml(item.mediaUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" />`;
}

async function loadCasesEvidence() {
  if (!casesReady || !casesSection || !casesGrid) return;

  const table = casesConfig.supabaseTable || "evidence_items";
  const url = `${casesConfig.supabaseUrl}/rest/v1/${table}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc&limit=60`;
  const response = await fetch(url, {
    headers: {
      apikey: casesConfig.supabaseAnonKey,
      Authorization: `Bearer ${casesConfig.supabaseAnonKey}`
    }
  });

  if (!response.ok) return;
  const items = (await response.json()).map(normalizeEvidence);
  if (!items.length) return;

  casesGrid.innerHTML = items
    .map((item) => `
      <article class="live-evidence-card cases-evidence-card ${item.isFeatured ? "featured" : ""}">
        <div class="live-evidence-media">
          ${mediaMarkup(item)}
          <span class="property-status disponible">${escapeHtml(item.category || "Evidencia")}</span>
        </div>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml([item.city, item.eventDate].filter(Boolean).join(" - "))}</p>
          <p>${escapeHtml(item.description || "Evidencia real del proceso con Antony.")}</p>
        </div>
      </article>
    `)
    .join("");

  casesSection.hidden = false;
  window.lucide?.createIcons();
}

function renderCase(index) {
  if (!staticCaseButtons.length) return;
  activeCaseIndex = (index + staticCaseButtons.length) % staticCaseButtons.length;
  const button = staticCaseButtons[activeCaseIndex];
  caseViewerImage.src = button.dataset.caseSrc;
  caseViewerImage.alt = button.dataset.caseTitle;
  caseViewerTitle.textContent = button.dataset.caseTitle;
  caseViewerText.textContent = button.dataset.caseText;
  caseViewerCount.textContent = `${activeCaseIndex + 1} de ${staticCaseButtons.length}`;
}

function openCase(index) {
  renderCase(index);
  caseViewerModal.showModal();
}

window.addEventListener("DOMContentLoaded", loadCasesEvidence);

staticCaseButtons.forEach((button, index) => {
  button.addEventListener("click", () => openCase(index));
});

previousCase?.addEventListener("click", () => renderCase(activeCaseIndex - 1));
nextCase?.addEventListener("click", () => renderCase(activeCaseIndex + 1));

closeCaseViewer?.addEventListener("click", () => caseViewerModal.close());
caseViewerModal?.addEventListener("click", (event) => {
  if (event.target === caseViewerModal) caseViewerModal.close();
});

window.addEventListener("keydown", (event) => {
  if (!caseViewerModal?.open) return;
  if (event.key === "ArrowLeft") renderCase(activeCaseIndex - 1);
  if (event.key === "ArrowRight") renderCase(activeCaseIndex + 1);
  if (event.key === "Escape") caseViewerModal.close();
});
