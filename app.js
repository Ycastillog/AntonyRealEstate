const STORAGE_KEY = "antony-real-estate-listings";
const PROFILE_PHOTO_KEY = "antony-real-estate-profile-photo";
const EVIDENCE_META_KEY = "antony-evidence-items";
const EVIDENCE_DB_NAME = "antony-media-store";
const EVIDENCE_DB_STORE = "files";
const mediaConfig = window.ANTONY_MEDIA_CONFIG || {};
const remoteEvidenceReady = Boolean(mediaConfig.supabaseUrl && mediaConfig.supabaseAnonKey);

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
    hook: "Jacobo Majluta | 3 habitaciones | 2 banos",
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
    hook: "Las Praderas | 3 habitaciones | 3 banos | 2 parqueos",
    notes: "Unidad lista en Las Praderas con 3 habitaciones, 3 banos, 2 parqueos y terminaciones modernas.",
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
const calcPrice = document.querySelector("#calcPrice");
const calcDownPayment = document.querySelector("#calcDownPayment");
const calcRate = document.querySelector("#calcRate");
const calcYears = document.querySelector("#calcYears");
const calcPriceLabel = document.querySelector("#calcPriceLabel");
const calcReserve = document.querySelector("#calcReserve");
const calcSeparation = document.querySelector("#calcSeparation");
const calcPayment = document.querySelector("#calcPayment");

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

function moneyCompact(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function statusLabel(status) {
  return status === "project" ? "Proyecto" : "Listo";
}

function whatsappUrl(message) {
  return window.antonyWhatsappUrl ? window.antonyWhatsappUrl(message) : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function openWhatsapp(message) {
  window.open(whatsappUrl(message), "_blank", "noreferrer");
}

function fallbackPhoto(title) {
  const encoded = encodeURIComponent(title);
  return `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1000&q=85&sig=${encoded}`;
}

function listingMedia(listing) {
  if (Array.isArray(listing.media) && listing.media.length) return listing.media;

  return (listing.photos || []).map((src) => ({
    type: String(src).startsWith("data:video") ? "video" : "image",
    src
  }));
}

function mediaFromSrc(src) {
  return {
    type: String(src).startsWith("data:video") ? "video" : "image",
    src
  };
}

function renderMedia(media, className = "") {
  if (!media?.src) return "";

  if (media.type === "video") {
    return `<video class="${className}" src="${media.src}" controls playsinline preload="metadata"></video>`;
  }

  return `<img class="${className}" src="${media.src}" alt="" />`;
}

function normalizeEvidenceItem(item) {
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    city: item.city,
    eventDate: item.eventDate || item.event_date,
    description: item.description,
    mediaType: item.mediaType || item.media_type,
    mediaUrl: item.mediaUrl || item.media_url,
    localKey: item.localKey,
    isFeatured: Boolean(item.isFeatured ?? item.is_featured),
    isPublished: Boolean(item.isPublished ?? item.is_published)
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

async function loadEvidenceItems() {
  if (remoteEvidenceReady) {
    const table = mediaConfig.supabaseTable || "evidence_items";
    const url = `${mediaConfig.supabaseUrl}/rest/v1/${table}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc&limit=6`;
    const response = await fetch(url, {
      headers: {
        apikey: mediaConfig.supabaseAnonKey,
        Authorization: `Bearer ${mediaConfig.supabaseAnonKey}`
      }
    });
    if (!response.ok) return [];
    const items = await response.json();
    return items.map(normalizeEvidenceItem);
  }

  const items = localEvidenceItems()
    .filter((item) => item.isPublished)
    .slice(0, 6);

  return Promise.all(items.map(async (item) => {
    const normalized = normalizeEvidenceItem(item);
    if (!normalized.localKey) return normalized;
    const blob = await getEvidenceBlob(normalized.localKey);
    return blob ? { ...normalized, mediaUrl: URL.createObjectURL(blob) } : normalized;
  }));
}

function evidenceMediaMarkup(item) {
  if (item.mediaType === "video") {
    return `<video src="${item.mediaUrl}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${item.mediaUrl}" alt="${escapeHtml(item.title)}" />`;
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
  if (!storedPhoto) return;

  profilePhoto.src = storedPhoto;
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
  const mediaMarkup = media.type === "video"
    ? `<video src="${media.src}" controls playsinline preload="metadata"></video>`
    : "";
  const imageStyle = media.type === "image" ? `style="background-image: url('${media.src}')"` : "";

  return `
    <article class="listing-card">
      <button type="button" data-open="${listing.id}" aria-label="Abrir ${escapeHtml(listing.title)}">
        <div class="card-image" ${imageStyle}>
          ${mediaMarkup}
          <span class="badge ${listing.status}">${statusLabel(listing.status)}</span>
          <span class="reference-badge">Confirmar con Antony</span>
          <span class="card-hook">${escapeHtml(listing.hook || listing.title)}</span>
        </div>
        <div class="card-copy">
          <h3>${escapeHtml(listing.title)}</h3>
          <span class="price">${money(listing.price)}</span>
          <div class="meta-row">
            <span>${escapeHtml(listing.location)}</span>
            <span>${listing.beds} hab.</span>
            <span>${listing.meters} m2</span>
          </div>
        </div>
      </button>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
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

  const price = Number(calcPrice.value || 0);
  const downPaymentPercent = Number(calcDownPayment?.value || 25) / 100;
  const annualRate = Number(calcRate?.value || 13.5) / 100;
  const years = Number(calcYears?.value || 20);
  const initial = price * downPaymentPercent;
  const financedAmount = Math.max(price - initial, 0);
  const monthlyRate = annualRate / 12;
  const months = years * 12;
  const payment = monthlyRate
    ? financedAmount * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
    : financedAmount / months;

  calcPriceLabel.textContent = moneyCompact(price);
  calcReserve.textContent = moneyCompact(initial);
  calcSeparation.textContent = moneyCompact(financedAmount);
  calcPayment.textContent = moneyCompact(payment);
}

function openDetail(id) {
  const listing = listings.find((item) => item.id === id);
  if (!listing) return;

  activeDetailId = id;
  location.hash = id;
  const media = listingMedia(listing).length ? listingMedia(listing) : [mediaFromSrc(fallbackPhoto(listing.title))];

  document.querySelector("#detailStatus").textContent = statusLabel(listing.status);
  document.querySelector("#detailTitle").textContent = listing.title;
  document.querySelector("#detailGallery").innerHTML = media
    .slice(0, 3)
    .map((item, index) => {
      if (item.type === "video") {
        return `<video src="${item.src}" controls playsinline preload="metadata" aria-label="${escapeHtml(listing.title)} video ${index + 1}"></video>`;
      }

      return `<img src="${item.src}" alt="${escapeHtml(listing.title)} foto ${index + 1}" />`;
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

  const photo = await fileToDataUrl(file);
  localStorage.setItem(PROFILE_PHOTO_KEY, photo);
  loadProfilePhoto();
  showToast("Foto de perfil actualizada");
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
if (calcPrice) calcPrice.addEventListener("input", updateCalculator);
if (calcDownPayment) calcDownPayment.addEventListener("change", updateCalculator);
if (calcRate) calcRate.addEventListener("input", updateCalculator);
if (calcYears) calcYears.addEventListener("change", updateCalculator);

document.querySelectorAll("[data-chat]").forEach((link) => {
  link.href = whatsappUrl(`Hola Antony, ${link.dataset.chat}`);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.addEventListener("click", (event) => {
    link.href = whatsappUrl(`Hola Antony, ${link.dataset.chat}`);
  });
});

listingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(listingForm);
  const title = formData.get("title").toString().trim();
  const files = formData.getAll("photos").filter((file) => file instanceof File && file.size > 0);
  const media = await Promise.all(files.map(async (file) => ({
    type: file.type.startsWith("video/") ? "video" : "image",
    src: await fileToDataUrl(file)
  })));

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
