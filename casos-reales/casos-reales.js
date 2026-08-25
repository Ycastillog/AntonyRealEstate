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

function textValue(value, fallback = "") {
  return value == null ? fallback : String(value);
}

function escapeHtml(value) {
  return textValue(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function safeUrl(value, allowedRelativePrefixes = []) {
  const raw = textValue(value).trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  if (/^(?:javascript|data|vbscript|file|blob):/i.test(raw)) return "";

  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === "https:") return parsed.href;

    const relativeAllowed =
      allowedRelativePrefixes.some((prefix) => raw.startsWith(prefix)) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(raw) &&
      !raw.startsWith("//") &&
      !raw.includes("\\") &&
      parsed.origin === window.location.origin;
    return relativeAllowed ? raw : "";
  } catch {
    return "";
  }
}

function normalizeEvidence(item) {
  return {
    id: textValue(item?.id),
    title: textValue(item?.title),
    category: textValue(item?.category),
    city: textValue(item?.city),
    eventDate: textValue(item?.eventDate || item?.event_date),
    description: textValue(item?.description),
    mediaType: item?.mediaType === "video" || item?.media_type === "video" ? "video" : "image",
    mediaUrl: safeUrl(item?.mediaUrl || item?.media_url),
    isFeatured: Boolean(item?.isFeatured ?? item?.is_featured)
  };
}

function mediaMarkup(item) {
  const mediaUrl = safeUrl(item.mediaUrl);
  if (!mediaUrl) return "";
  if (item.mediaType === "video") {
    return `<video src="${escapeAttribute(mediaUrl)}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeAttribute(mediaUrl)}" alt="${escapeAttribute(item.title)}" loading="lazy" />`;
}

async function loadCasesEvidence() {
  if (!casesReady || !casesSection || !casesGrid) return;

  let items;
  try {
    const table = casesConfig.supabaseTable || "evidence_items";
    const url = `${casesConfig.supabaseUrl}/rest/v1/${table}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc&limit=60`;
    const response = await fetch(url, {
      headers: {
        apikey: casesConfig.supabaseAnonKey,
        Authorization: `Bearer ${casesConfig.supabaseAnonKey}`
      }
    });

    if (!response.ok) return;
    items = (await response.json()).map(normalizeEvidence).filter((item) => item.mediaUrl);
  } catch {
    return;
  }
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
  const source = safeUrl(button.dataset.caseSrc, ["../assets/", "./assets/", "/assets/"]);
  if (source) caseViewerImage.src = source;
  else caseViewerImage.removeAttribute("src");
  caseViewerImage.alt = textValue(button.dataset.caseTitle);
  caseViewerTitle.textContent = textValue(button.dataset.caseTitle);
  caseViewerText.textContent = textValue(button.dataset.caseText);
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
