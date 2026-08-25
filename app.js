const STORAGE_KEY = "antony-real-estate-listings";
const PROFILE_PHOTO_KEY = "antony-real-estate-profile-photo";
const EVIDENCE_META_KEY = "antony-evidence-items";
const EVIDENCE_DB_NAME = "antony-media-store";
const EVIDENCE_DB_STORE = "files";
const mediaConfig = window.ANTONY_MEDIA_CONFIG || {};
const remoteEvidenceReady = Boolean(mediaConfig.supabaseUrl && mediaConfig.supabaseAnonKey);
const trustedObjectUrls = new Set();
const safeLocalMediaTypes = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/ogg"
]);

const seedListings = [
  {
    id: "millon-penthouse",
    title: "Millon Penthouse",
    location: "El Millon, Santo Domingo",
    price: 320000,
    beds: 3,
    meters: 180,
    status: "ready",
    hook: "Millon penthouse | 3 habitaciones | 3 parqueos",
    notes: "Penthouse en El Millon con 3 habitaciones, 3 parqueos y espacios amplios para familia o inversion.",
    photos: [
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1000&q=85"
    ]
  },
  {
    id: "jacobo-majluta",
    title: "Jacobo Majluta Familiar",
    location: "Jacobo Majluta",
    price: 165000,
    beds: 3,
    meters: 115,
    status: "ready",
    hook: "Jacobo Majluta | 3 habitaciones | 2 baños",
    notes: "Apartamento familiar con buena distribucion, sala amplia, balcon y ubicacion practica para vivir.",
    photos: [
      "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1000&q=85"
    ]
  },
  {
    id: "las-praderas",
    title: "Las Praderas",
    location: "Las Praderas, Santo Domingo",
    price: 225000,
    beds: 3,
    meters: 135,
    status: "ready",
    hook: "Las Praderas | 3 habitaciones | 3 baños | 2 parqueos",
    notes: "Unidad lista en Las Praderas con 3 habitaciones, 3 baños, 2 parqueos y terminaciones modernas.",
    photos: [
      "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1000&q=85"
    ]
  },
  {
    id: "proyecto-punta-cana",
    title: "Proyecto Punta Cana",
    location: "Punta Cana",
    price: 142000,
    beds: 2,
    meters: 84,
    status: "project",
    hook: "Proyecto con respaldo real | reserva flexible",
    notes: "Proyecto para inversion con plan de pago flexible, amenidades y alto potencial de renta.",
    photos: [
      "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1000&q=85",
      "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1000&q=85"
    ]
  }
];

let listings = loadListings();
let activeFilter = "all";
let activeDetailId = "";

const grid = document.querySelector("#listingGrid");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const priceRange = document.querySelector("#priceRange");
const priceValue = document.querySelector("#priceValue");
const listingModal = document.querySelector("#listingModal");
const detailModal = document.querySelector("#detailModal");
const listingForm = document.querySelector("#listingForm");
const toast = document.querySelector("#toast");
const profilePhoto = document.querySelector("#profilePhoto");
const profileFallback = document.querySelector("#profileFallback");
const profilePhotoInput = document.querySelector("#profilePhotoInput");
const leadForm = document.querySelector("#leadForm");
const floatingWhatsapp = document.querySelector("#floatingWhatsapp");
const heroWhatsapp = document.querySelector("#heroWhatsapp");
const footerWhatsapp = document.querySelector("#footerWhatsapp");
const openVideoModalButton = document.querySelector("#openVideoModal");
const videoModal = document.querySelector("#videoModal");
const closeVideoModalButton = document.querySelector("#closeVideoModal");
const mainVideoPlayer = document.querySelector("#mainVideoPlayer");
const calcCurrency = document.querySelector("#calcCurrency");
const calcPrice = document.querySelector("#calcPrice");
const calcInitialAmount = document.querySelector("#calcInitialAmount");
const calcRate = document.querySelector("#calcRate");
const calcYears = document.querySelector("#calcYears");
const calcPriceLabel = document.querySelector("#calcPriceLabel");
const calcReserve = document.querySelector("#calcReserve");
const calcSeparation = document.querySelector("#calcSeparation");
const calcPayment = document.querySelector("#calcPayment");
const homeCaseButtons = Array.from(document.querySelectorAll("[data-home-case-src]"));
const homeCaseViewerModal = document.querySelector("#homeCaseViewerModal");
const homeCaseViewerImage = document.querySelector("#homeCaseViewerImage");
const homeCaseViewerVideo = document.querySelector("#homeCaseViewerVideo");
const homeCaseViewerTitle = document.querySelector("#homeCaseViewerTitle");
const homeCaseViewerText = document.querySelector("#homeCaseViewerText");
const homeCaseViewerCount = document.querySelector("#homeCaseViewerCount");
const closeHomeCaseViewer = document.querySelector("#closeHomeCaseViewer");
const previousHomeCase = document.querySelector("#previousHomeCase");
const nextHomeCase = document.querySelector("#nextHomeCase");
const homeCaseAlbums = new Map();
let activeHomeCaseKey = "";
let activeHomeCasePhotoIndex = 0;

function loadListings() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return seedListings;

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : seedListings;
  } catch {
    return seedListings;
  }
}

function saveListings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function moneyCompact(value, currency = "USD") {
  const prefix = currency === "DOP" ? "RD$" : "US$";
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(Math.round(value));
  return `${prefix}${amount}`;
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function statusLabel(status) {
  return status === "project" ? "Proyecto" : "Listo";
}

function whatsappUrl(message) {
  const fallback = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const candidate = window.antonyWhatsappUrl ? window.antonyWhatsappUrl(message) : fallback;
  return safeMediaUrl(candidate) || fallback;
}

function openWhatsapp(message) {
  window.open(whatsappUrl(message), "_blank", "noreferrer");
}

function fallbackPhoto(title) {
  const encoded = encodeURIComponent(title);
  return `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=85&sig=${encoded}`;
}

function listingMedia(listing) {
  const candidates = Array.isArray(listing.media) && listing.media.length
    ? listing.media
    : (Array.isArray(listing.photos) ? listing.photos : []).map((src) => ({
        type: String(src).startsWith("data:video") ? "video" : "image",
        src
      }));

  return candidates
    .map((media) => {
      const src = safeMediaUrl(media?.src, {
        allowLocalData: true,
        allowedRelativePrefixes: ["assets/", "./assets/", "../assets/", "/assets/"]
      });
      if (!src) return null;
      return {
        type: media?.type === "video" ? "video" : "image",
        src
      };
    })
    .filter(Boolean);
}

function mediaFromSrc(src) {
  const safeSrc = safeMediaUrl(src, {
    allowLocalData: true,
    allowedRelativePrefixes: ["assets/", "./assets/", "../assets/", "/assets/"]
  });
  return {
    type: String(safeSrc).startsWith("data:video") ? "video" : "image",
    src: safeSrc
  };
}

function renderMedia(media, className = "") {
  const src = safeMediaUrl(media?.src, {
    allowLocalData: true,
    allowTrustedBlob: true,
    allowedRelativePrefixes: ["assets/", "./assets/", "../assets/", "/assets/"]
  });
  if (!src) return "";
  const safeClassName = safeClassNames(className);

  if (media.type === "video") {
    return `<video class="${escapeAttribute(safeClassName)}" src="${escapeAttribute(src)}" controls playsinline preload="metadata"></video>`;
  }

  return `<img class="${escapeAttribute(safeClassName)}" src="${escapeAttribute(src)}" alt="" />`;
}

function normalizeEvidenceItem(item, isRemote = false) {
  const rawMediaUrl = item?.mediaUrl || item?.media_url;
  return {
    id: textValue(item?.id),
    title: textValue(item?.title),
    category: textValue(item?.category),
    city: textValue(item?.city),
    eventDate: textValue(item?.eventDate || item?.event_date),
    description: textValue(item?.description),
    mediaType: item?.mediaType === "video" || item?.media_type === "video" ? "video" : "image",
    mediaUrl: isRemote ? safeMediaUrl(rawMediaUrl) : "",
    localKey: textValue(item?.localKey),
    isFeatured: Boolean(item?.isFeatured ?? item?.is_featured),
    isPublished: Boolean(item?.isPublished ?? item?.is_published)
  };
}

function openEvidenceDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(EVIDENCE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(EVIDENCE_DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getEvidenceBlob(key) {
  const db = await openEvidenceDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(EVIDENCE_DB_STORE, "readonly");
    const request = tx.objectStore(EVIDENCE_DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function localEvidenceItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(EVIDENCE_META_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadEvidenceItems(limit = 6) {
  if (remoteEvidenceReady) {
    try {
      const table = mediaConfig.supabaseTable || "evidence_items";
      const url = `${mediaConfig.supabaseUrl}/rest/v1/${table}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc&limit=${limit}`;
      const response = await fetch(url, {
        headers: {
          apikey: mediaConfig.supabaseAnonKey,
          Authorization: `Bearer ${mediaConfig.supabaseAnonKey}`
        }
      });
      if (!response.ok) return [];
      const items = await response.json();
      return items.map((item) => normalizeEvidenceItem(item, true)).filter((item) => item.mediaUrl);
    } catch {
      // The public page keeps its static content if the optional live feed is unavailable.
      return [];
    }
  }

  const items = localEvidenceItems()
    .filter((item) => item.isPublished)
    .slice(0, limit);

  return Promise.all(items.map(async (item) => {
    const normalized = normalizeEvidenceItem(item);
    if (!normalized.localKey) return normalized;
    const blob = await getEvidenceBlob(normalized.localKey);
    if (!blob || !safeLocalMediaTypes.has(blob.type)) return normalized;
    const objectUrl = URL.createObjectURL(blob);
    trustedObjectUrls.add(objectUrl);
    return { ...normalized, mediaUrl: objectUrl };
  }));
}

function evidenceMediaMarkup(item) {
  const mediaUrl = safeMediaUrl(item.mediaUrl, { allowTrustedBlob: true });
  if (!mediaUrl) return "";
  if (item.mediaType === "video") {
    return `<video src="${escapeAttribute(mediaUrl)}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${escapeAttribute(mediaUrl)}" alt="${escapeAttribute(item.title)}" />`;
}

async function renderLiveEvidence() {
  const section = document.querySelector("#liveEvidence");
  const gridElement = document.querySelector("#liveEvidenceGrid");
  if (!section || !gridElement) return;

  const items = (await loadEvidenceItems()).filter((item) => item.mediaUrl);
  section.hidden = items.length === 0;
  gridElement.innerHTML = items.map((item) => `
    <article class="live-evidence-card">
      <div class="live-evidence-media">
        ${evidenceMediaMarkup(item)}
        <span class="media-chip"><i data-lucide="${item.mediaType === "video" ? "play" : "image"}"></i> ${escapeHtml(item.category || "Evidencia")}</span>
      </div>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml([item.city, item.eventDate].filter(Boolean).join(" - "))}</p>
        <p>${escapeHtml(item.description || "")}</p>
      </div>
    </article>
  `).join("");
  if (window.lucide) lucide.createIcons();
}

function loadProfilePhoto() {
  const storedPhoto = localStorage.getItem(PROFILE_PHOTO_KEY);
  const safePhoto = safeMediaUrl(storedPhoto, { allowLocalData: true });
  if (!safePhoto) return;

  profilePhoto.src = safePhoto;
  profilePhoto.hidden = false;
  profileFallback.hidden = true;
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const maxPrice = Number(priceRange.value);

  priceValue.textContent = number(maxPrice);

  const filtered = listings.filter((listing) => {
    const haystack = `${listing.title} ${listing.location} ${listing.price} ${listing.notes}`.toLowerCase();
    const matchesType = activeFilter === "all" || listing.status === activeFilter;
    return matchesType && listing.price <= maxPrice && haystack.includes(query);
  });

  grid.innerHTML = filtered.map(renderCard).join("");
  grid.querySelectorAll("[data-background-image]").forEach((element) => {
    const backgroundUrl = safeMediaUrl(element.dataset.backgroundImage, {
      allowLocalData: true,
      allowedRelativePrefixes: ["assets/", "./assets/", "../assets/", "/assets/"]
    });
    if (backgroundUrl) element.style.backgroundImage = `url(${JSON.stringify(backgroundUrl)})`;
  });
  emptyState.hidden = filtered.length !== 0;

  const totalListings = document.querySelector("#totalListings");
  const readyListings = document.querySelector("#readyListings");
  const projectListings = document.querySelector("#projectListings");

  if (totalListings) totalListings.textContent = listings.length;
  if (readyListings) readyListings.textContent = listings.filter((item) => item.status === "ready").length;
  if (projectListings) projectListings.textContent = listings.filter((item) => item.status === "project").length;

  document.querySelector("#resultsTitle").textContent = `${filtered.length} ${filtered.length === 1 ? "unidad de referencia para orientar tu solicitud" : "unidades de referencia para orientar tu solicitud"}`;

  if (window.lucide) lucide.createIcons();
}

function renderCard(listing) {
  const media = listingMedia(listing)[0] || mediaFromSrc(fallbackPhoto(listing.title));
  const mediaMarkup = media?.type === "video" && media.src
    ? `<video src="${escapeAttribute(media.src)}" controls playsinline preload="metadata"></video>`
    : "";
  const imageAttribute = media?.type === "image" && media.src
    ? `data-background-image="${escapeAttribute(media.src)}"`
    : "";
  const id = textValue(listing.id);
  const status = listing.status === "project" ? "project" : "ready";
  const beds = finiteNumber(listing.beds);
  const meters = finiteNumber(listing.meters);

  return `
    <article class="listing-card">
      <button type="button" data-open="${escapeAttribute(id)}" aria-label="Abrir ${escapeAttribute(listing.title)}">
        <div class="card-image" ${imageAttribute}>
          ${mediaMarkup}
          <span class="badge ${status}">${statusLabel(status)}</span>
          <span class="reference-badge">Confirmar con Antony</span>
          <span class="card-hook">${escapeHtml(listing.hook || listing.title)}</span>
        </div>
        <div class="card-copy">
          <h3>${escapeHtml(listing.title)}</h3>
          <span class="price">${money(listing.price)}</span>
          <div class="meta-row">
            <span>${escapeHtml(listing.location)}</span>
            <span>${escapeHtml(beds)} hab.</span>
            <span>${escapeHtml(meters)} m2</span>
          </div>
        </div>
      </button>
    </article>
  `;
}

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

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeClassNames(value) {
  return textValue(value)
    .split(/\s+/)
    .filter((name) => /^[a-z0-9_-]+$/i.test(name))
    .join(" ");
}

function safeMediaUrl(value, options = {}) {
  const raw = textValue(value).trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return "";

  if (options.allowTrustedBlob && trustedObjectUrls.has(raw)) return raw;
  if (
    options.allowLocalData &&
    /^data:(?:image\/(?:png|jpeg|gif|webp)|video\/(?:mp4|webm|ogg));base64,[a-z0-9+/]+={0,2}$/i.test(raw)
  ) {
    return raw;
  }

  if (/^(?:javascript|data|vbscript|file|blob):/i.test(raw)) return "";

  try {
    const parsed = new URL(raw, window.location.href);
    if (parsed.protocol === "https:") return parsed.href;

    const prefixes = options.allowedRelativePrefixes || [];
    const relativeAllowed =
      prefixes.some((prefix) => raw.startsWith(prefix)) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(raw) &&
      !raw.startsWith("//") &&
      !raw.includes("\\") &&
      parsed.origin === window.location.origin;
    return relativeAllowed ? raw : "";
  } catch {
    return "";
  }
}

async function fileToDataUrl(file) {
  if (!safeLocalMediaTypes.has(file.type)) {
    throw new Error("Usa una imagen JPG, PNG, GIF o WebP, o un video MP4, WebM u OGG.");
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const safeResult = safeMediaUrl(reader.result, { allowLocalData: true });
      if (safeResult) resolve(safeResult);
      else reject(new Error("El archivo no tiene un formato multimedia seguro."));
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function updateCalculator() {
  if (!calcPrice) return;

  const currency = calcCurrency?.value || "USD";
  const price = Number(calcPrice.value || 0);
  const initial = Number(calcInitialAmount?.value || 0);
  const annualRate = Number(calcRate?.value || 13.5) / 100;
  const years = Number(calcYears?.value || 20);
  const financedAmount = Math.max(price - initial, 0);
  const monthlyRate = annualRate / 12;
  const months = years * 12;
  const payment = monthlyRate
    ? financedAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
    : financedAmount / months;

  calcPriceLabel.textContent = moneyCompact(price, currency);
  calcReserve.textContent = moneyCompact(initial, currency);
  calcSeparation.textContent = moneyCompact(financedAmount, currency);
  calcPayment.textContent = moneyCompact(payment, currency);
}

function initializeHomeCaseAlbums() {
  if (!homeCaseButtons.length || !homeCaseViewerModal) return;
  homeCaseButtons.forEach((button) => {
    const source = safeMediaUrl(button.dataset.homeCaseSrc, {
      allowedRelativePrefixes: ["assets/", "./assets/", "/assets/"]
    });
    homeCaseAlbums.set(button.dataset.homeCaseKey, {
      title: textValue(button.dataset.homeCaseTitle),
      text: textValue(button.dataset.homeCaseText),
      categories: textValue(button.dataset.homeCaseCategories).split(",").map((item) => item.trim()).filter(Boolean),
      media: source ? [{
        type: "image",
        src: source,
        title: textValue(button.dataset.homeCaseTitle)
      }] : []
    });
  });
}

async function hydrateHomeCaseAlbums() {
  if (!homeCaseButtons.length) return;
  const items = (await loadEvidenceItems(80)).filter((item) => item.mediaUrl);
  items.forEach((item) => {
    const album = Array.from(homeCaseAlbums.values()).find((candidate) => candidate.categories.includes(item.category));
    if (!album) return;
    album.media.push({
      type: item.mediaType,
      src: item.mediaUrl,
      title: item.title || item.category
    });
  });
}

function renderHomeCasePhoto(index) {
  const album = homeCaseAlbums.get(activeHomeCaseKey);
  if (!album || !album.media.length) return;
  activeHomeCasePhotoIndex = (index + album.media.length) % album.media.length;
  const media = album.media[activeHomeCasePhotoIndex];
  const mediaUrl = safeMediaUrl(media.src, {
    allowTrustedBlob: true,
    allowedRelativePrefixes: ["assets/", "./assets/", "/assets/"]
  });
  if (!mediaUrl) return;

  homeCaseViewerTitle.textContent = album.title;
  homeCaseViewerText.textContent = album.text;
  homeCaseViewerCount.textContent = `${media.type === "video" ? "Video" : "Foto"} ${activeHomeCasePhotoIndex + 1} de ${album.media.length}`;

  if (media.type === "video") {
    homeCaseViewerImage.hidden = true;
    homeCaseViewerVideo.hidden = false;
    homeCaseViewerVideo.src = mediaUrl;
    homeCaseViewerVideo.setAttribute("aria-label", textValue(media.title));
    return;
  }

  homeCaseViewerVideo.pause();
  homeCaseViewerVideo.removeAttribute("src");
  homeCaseViewerVideo.hidden = true;
  homeCaseViewerImage.hidden = false;
  homeCaseViewerImage.src = mediaUrl;
  homeCaseViewerImage.alt = textValue(media.title);
}

function openHomeCase(key) {
  activeHomeCaseKey = key;
  renderHomeCasePhoto(0);
  homeCaseViewerModal.showModal();
}

function openDetail(id) {
  const listing = listings.find((item) => item.id === id);
  if (!listing) return;

  activeDetailId = id;
  location.hash = id;
  const listingItems = listingMedia(listing);
  const media = listingItems.length ? listingItems : [mediaFromSrc(fallbackPhoto(listing.title))];

  document.querySelector("#detailStatus").textContent = statusLabel(listing.status);
  document.querySelector("#detailTitle").textContent = listing.title;
  document.querySelector("#detailGallery").innerHTML = media
    .slice(0, 3)
    .map((item, index) => {
      if (item.type === "video") {
        return `<video src="${escapeAttribute(item.src)}" controls playsinline preload="metadata" aria-label="${escapeAttribute(listing.title)} video ${index + 1}"></video>`;
      }

      return `<img src="${escapeAttribute(item.src)}" alt="${escapeAttribute(listing.title)} foto ${index + 1}" />`;
    })
    .join("");
  document.querySelector("#detailMeta").innerHTML = [
    "Referencia a validar",
    money(listing.price),
    listing.location,
    `${listing.beds} hab.`,
    `${listing.meters} m2`
  ]
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
  document.querySelector("#detailNotes").textContent = listing.notes || "";

  detailModal.showModal();
}

function closeDetail() {
  detailModal.close();
  if (location.hash.slice(1) === activeDetailId) {
    history.pushState("", document.title, location.pathname + location.search);
  }
  activeDetailId = "";
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch {
    showToast(text);
  }
}

document.querySelector("#newListingButton").addEventListener("click", () => {
  listingForm.reset();
  listingModal.showModal();
});

document.querySelector("#profilePhotoButton").addEventListener("click", () => {
  profilePhotoInput.click();
});

profilePhotoInput.addEventListener("change", async () => {
  const file = profilePhotoInput.files?.[0];
  if (!file) return;

  try {
    const photo = await fileToDataUrl(file);
    if (!photo.startsWith("data:image/")) throw new Error("Selecciona un formato de imagen seguro.");
    localStorage.setItem(PROFILE_PHOTO_KEY, photo);
    loadProfilePhoto();
    showToast("Foto de perfil actualizada");
  } catch (error) {
    showToast(error.message || "No se pudo usar esa imagen");
  }
});

document.querySelector("#closeModal").addEventListener("click", () => listingModal.close());
document.querySelector("#cancelForm").addEventListener("click", () => listingModal.close());
document.querySelector("#closeDetail").addEventListener("click", closeDetail);

const shareCatalogButton = document.querySelector("#shareCatalog");
if (shareCatalogButton) {
  shareCatalogButton.addEventListener("click", () => {
    copyText(location.href.split("#")[0], "Link del catalogo copiado");
  });
}

document.querySelector("#copyListingLink").addEventListener("click", () => {
  const url = `${location.href.split("#")[0]}#${activeDetailId}`;
  copyText(url, "Link de la propiedad copiado");
});

document.querySelector("#whatsappListing").addEventListener("click", () => {
  const listing = listings.find((item) => item.id === activeDetailId);
  if (!listing) return;

  const url = `${location.href.split("#")[0]}#${activeDetailId}`;
  openWhatsapp(`Hola Antony, quiero informacion de esta propiedad: ${listing.title} (${money(listing.price)}). Link: ${url}`);
});

document.querySelector("#printListing").addEventListener("click", () => {
  const listing = listings.find((item) => item.id === activeDetailId);
  if (!listing) return;

  document.body.dataset.printTitle = listing.title;
  window.print();
});

leadForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(leadForm);
  const name = formData.get("clientName").toString().trim() || "Cliente";
  const phone = formData.get("clientPhone").toString().trim() || "No indicado";
  const budget = formData.get("clientBudget").toString().trim() || "No indicado";
  const zone = formData.get("clientZone").toString().trim() || "No indicada";
  const intent = formData.get("clientIntent").toString();
  const message = `Hola Antony, soy ${name}. Quiero asesoria inmobiliaria. Telefono: ${phone}. Presupuesto: ${budget}. Zona: ${zone}. Compra para: ${intent}.`;

  copyText(message, "Solicitud copiada para WhatsApp");
  openWhatsapp(message);
});

document.querySelector("#deleteListing").addEventListener("click", () => {
  listings = listings.filter((item) => item.id !== activeDetailId);
  saveListings();
  closeDetail();
  render();
  showToast("Propiedad eliminada");
});

document.querySelector("#resetSeed").addEventListener("click", () => {
  listings = seedListings;
  saveListings();
  render();
  showToast("Inventario restaurado");
});

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
    render();
  });
});

grid.addEventListener("click", (event) => {
  const opener = event.target.closest("[data-open]");
  if (opener) openDetail(opener.dataset.open);
});

searchInput.addEventListener("input", render);
priceRange.addEventListener("input", render);
if (calcCurrency) calcCurrency.addEventListener("change", updateCalculator);
if (calcPrice) calcPrice.addEventListener("input", updateCalculator);
if (calcInitialAmount) calcInitialAmount.addEventListener("input", updateCalculator);
if (calcRate) calcRate.addEventListener("input", updateCalculator);
if (calcYears) calcYears.addEventListener("change", updateCalculator);

initializeHomeCaseAlbums();
hydrateHomeCaseAlbums();

homeCaseButtons.forEach((button) => {
  button.addEventListener("click", () => openHomeCase(button.dataset.homeCaseKey));
});
if (previousHomeCase) previousHomeCase.addEventListener("click", () => renderHomeCasePhoto(activeHomeCasePhotoIndex - 1));
if (nextHomeCase) nextHomeCase.addEventListener("click", () => renderHomeCasePhoto(activeHomeCasePhotoIndex + 1));
if (closeHomeCaseViewer) closeHomeCaseViewer.addEventListener("click", () => {
  homeCaseViewerVideo?.pause();
  homeCaseViewerModal.close();
});
if (homeCaseViewerModal) {
  homeCaseViewerModal.addEventListener("click", (event) => {
    if (event.target === homeCaseViewerModal) {
      homeCaseViewerVideo?.pause();
      homeCaseViewerModal.close();
    }
  });
}

document.querySelectorAll("[data-chat]").forEach((link) => {
  link.href = whatsappUrl(`Hola Antony, ${link.dataset.chat}`);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.addEventListener("click", (event) => {
    link.href = whatsappUrl(`Hola Antony, ${link.dataset.chat}`);
  });
});

window.addEventListener("keydown", (event) => {
  if (!homeCaseViewerModal?.open) return;
  if (event.key === "ArrowLeft") renderHomeCasePhoto(activeHomeCasePhotoIndex - 1);
  if (event.key === "ArrowRight") renderHomeCasePhoto(activeHomeCasePhotoIndex + 1);
  if (event.key === "Escape") {
    homeCaseViewerVideo?.pause();
    homeCaseViewerModal.close();
  }
});

listingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(listingForm);
  const title = formData.get("title").toString().trim();
  const files = formData.getAll("photos").filter((file) => file instanceof File && file.size > 0);
  let media;
  try {
    media = await Promise.all(files.map(async (file) => ({
      type: file.type.startsWith("video/") ? "video" : "image",
      src: await fileToDataUrl(file)
    })));
  } catch (error) {
    showToast(error.message || "Uno de los archivos no es seguro");
    return;
  }

  const listing = {
    id: `${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    title,
    location: formData.get("location").toString().trim(),
    price: Number(formData.get("price")),
    beds: Number(formData.get("beds")),
    meters: Number(formData.get("meters")),
    status: formData.get("status").toString(),
    notes: formData.get("notes").toString().trim(),
    media,
    photos: media.filter((item) => item.type === "image").map((item) => item.src)
  };

  listings = [listing, ...listings];
  saveListings();
  listingModal.close();
  render();
  showToast("Propiedad guardada");
});

window.addEventListener("DOMContentLoaded", () => {
  loadProfilePhoto();
  const mainWhatsappMessage = "Hola Antony, quiero solicitar asesoria inmobiliaria.";
  floatingWhatsapp.href = whatsappUrl(mainWhatsappMessage);
  if (heroWhatsapp) heroWhatsapp.href = whatsappUrl(mainWhatsappMessage);
  if (footerWhatsapp) footerWhatsapp.href = whatsappUrl(mainWhatsappMessage);
  if (openVideoModalButton && videoModal && mainVideoPlayer) {
    openVideoModalButton.addEventListener("click", () => {
      videoModal.showModal();
      mainVideoPlayer.currentTime = 0;
      mainVideoPlayer.play().catch(() => {});
    });
  }
  if (closeVideoModalButton && videoModal && mainVideoPlayer) {
    closeVideoModalButton.addEventListener("click", () => {
      mainVideoPlayer.pause();
      videoModal.close();
    });
    videoModal.addEventListener("close", () => mainVideoPlayer.pause());
    videoModal.addEventListener("click", (event) => {
      if (event.target === videoModal) {
        mainVideoPlayer.pause();
        videoModal.close();
      }
    });
  }
  updateCalculator();
  render();
  renderLiveEvidence();
  const hashId = location.hash.slice(1);
  if (hashId) openDetail(hashId);
});
