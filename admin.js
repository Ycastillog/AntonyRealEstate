const SESSION_KEY = "antony-admin-session";
const LOCAL_META_KEY = "antony-evidence-items";
const LOCAL_PROPERTY_KEY = "antony-property-items";
const DB_NAME = "antony-media-store";
const DB_STORE = "files";

const config = window.ANTONY_MEDIA_CONFIG || {};
const hasSupabase = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const hasCloudinary = Boolean(config.cloudinaryCloudName && config.cloudinaryUploadPreset);
const hasSupabaseStorage = Boolean(config.supabaseStorageBucket);
const remoteReady = hasSupabase && (hasCloudinary || hasSupabaseStorage);
let propertyRemoteAvailable = true;

const loginPanel = document.querySelector("#loginPanel");
const adminWorkspace = document.querySelector("#adminWorkspace");
const loginForm = document.querySelector("#loginForm");
const evidenceForm = document.querySelector("#evidenceForm");
const propertyForm = document.querySelector("#propertyForm");
const evidenceGrid = document.querySelector("#adminEvidenceGrid");
const propertyGrid = document.querySelector("#adminPropertyGrid");
const emptyState = document.querySelector("#adminEmptyState");
const propertyEmptyState = document.querySelector("#adminPropertyEmptyState");
const storageMode = document.querySelector("#storageMode");
const logoutButton = document.querySelector("#logoutButton");
const refreshButton = document.querySelector("#refreshEvidence");
const refreshPropertiesButton = document.querySelector("#refreshProperties");
const toggleEvidenceForm = document.querySelector("#toggleEvidenceForm");
const togglePropertyForm = document.querySelector("#togglePropertyForm");
const publishedCount = document.querySelector("#publishedCount");
const videoCount = document.querySelector("#videoCount");
const photoCount = document.querySelector("#photoCount");
const testimonialCount = document.querySelector("#testimonialCount");
const propertyCount = document.querySelector("#propertyCount");
const toast = document.querySelector("#adminToast");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function isAuthed() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

function setAuthed(value) {
  if (value) sessionStorage.setItem(SESSION_KEY, "1");
  else sessionStorage.removeItem(SESSION_KEY);
}

function applyAuthState() {
  const authed = isAuthed();
  loginPanel.hidden = authed;
  adminWorkspace.hidden = !authed;
  logoutButton.hidden = !authed;
  if (authed) loadAndRender();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slug() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putBlob(key, file) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(file, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const request = tx.objectStore(DB_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteBlob(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function localItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_META_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalItems(items) {
  localStorage.setItem(LOCAL_META_KEY, JSON.stringify(items));
}

function localProperties() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_PROPERTY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalProperties(items) {
  localStorage.setItem(LOCAL_PROPERTY_KEY, JSON.stringify(items));
}

function normalizeItem(item) {
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

function plainSlug(value) {
  return String(value || "opcion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "opcion";
}

function statusLabel(status) {
  return {
    disponible: "Disponible",
    reservada: "Reservada",
    vendida: "Vendida"
  }[status] || "Disponible";
}

function normalizeProperty(item) {
  const tags = Array.isArray(item.tags)
    ? item.tags
    : String(item.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

  const mediaUrls = Array.isArray(item.mediaUrls)
    ? item.mediaUrls
    : Array.isArray(item.media_urls)
      ? item.media_urls
      : [item.imageUrl || item.image_url].filter(Boolean);

  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    priceLabel: item.priceLabel || item.price_label || "Precio a consultar",
    priceUsd: item.priceUsd ?? item.price_usd ?? null,
    type: item.type || "apartamento",
    category: item.category || "santo-domingo",
    city: item.city || plainSlug(item.cityLabel || item.city_label),
    cityLabel: item.cityLabel || item.city_label || "",
    zone: item.zone || plainSlug(item.zoneLabel || item.zone_label),
    zoneLabel: item.zoneLabel || item.zone_label || "",
    beds: item.beds ?? null,
    meters: item.meters ?? null,
    status: item.status || "disponible",
    statusLabel: item.statusLabel || item.status_label || statusLabel(item.status),
    notes: item.notes || "",
    tags,
    imageUrl: item.imageUrl || item.image_url || mediaUrls[0] || "",
    mediaUrls,
    isFeatured: Boolean(item.isFeatured ?? item.is_featured),
    isPublished: Boolean(item.isPublished ?? item.is_published)
  };
}

async function itemWithPreview(item) {
  if (item.mediaUrl) return item;
  if (!item.localKey) return item;
  const blob = await getBlob(item.localKey);
  if (!blob) return item;
  return { ...item, mediaUrl: URL.createObjectURL(blob) };
}

async function loadItems() {
  if (remoteReady) {
    const url = `${config.supabaseUrl}/rest/v1/${config.supabaseTable}?select=*&order=is_featured.desc,created_at.desc`;
    const response = await fetch(url, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      }
    });
    if (!response.ok) throw new Error("No se pudieron cargar las evidencias remotas.");
    const items = await response.json();
    return items.map(normalizeItem);
  }

  const items = localItems().filter((item) => item.isPublished).map(normalizeItem);
  return Promise.all(items.map(itemWithPreview));
}

async function loadProperties() {
  if (remoteReady) {
    const table = config.supabasePropertiesTable || "property_items";
    const url = `${config.supabaseUrl}/rest/v1/${table}?select=*&order=is_featured.desc,created_at.desc`;
    const response = await fetch(url, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      }
    });
    if (!response.ok) throw new Error("No se pudieron cargar las propiedades remotas.");
    const items = await response.json();
    return items.map(normalizeProperty);
  }

  return localProperties().map(normalizeProperty);
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", config.cloudinaryUploadPreset);
  if (config.cloudinaryFolder) formData.append("folder", config.cloudinaryFolder);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/auto/upload`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) throw new Error("Cloudinary no acepto el archivo.");
  return response.json();
}

function cleanFileName(name) {
  return String(name || "archivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function uploadToSupabaseStorage(file, itemId) {
  const bucket = config.supabaseStorageBucket || "evidencias";
  const extension = cleanFileName(file.name).split(".").pop() || (file.type.startsWith("video/") ? "mp4" : "jpg");
  const filePath = `${itemId}/${Date.now()}.${extension}`;
  const uploadUrl = `${config.supabaseUrl}/storage/v1/object/${bucket}/${filePath}`;

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });

  if (!response.ok) throw new Error("Supabase Storage no acepto el archivo.");

  return {
    secure_url: `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`,
    storage_path: filePath
  };
}

async function uploadMultipleFiles(files, itemId) {
  const uploads = [];
  for (const file of files) {
    uploads.push(await uploadPermanentFile(file, itemId));
  }
  return uploads;
}

async function uploadPermanentFile(file, itemId) {
  if (hasCloudinary) return uploadToCloudinary(file);
  return uploadToSupabaseStorage(file, itemId);
}

async function saveRemoteItem(item) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.supabaseTable}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(item)
  });
  if (!response.ok) throw new Error("Supabase no pudo guardar la evidencia.");
  const [saved] = await response.json();
  return saved;
}

async function saveRemoteProperty(item) {
  const table = config.supabasePropertiesTable || "property_items";
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(item)
  });
  if (!response.ok) throw new Error("Supabase no pudo guardar la propiedad.");
  const [saved] = await response.json();
  return saved;
}

async function deleteItem(id, localKey) {
  if (remoteReady) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${config.supabaseTable}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      }
    });
    if (!response.ok) throw new Error("No se pudo eliminar en Supabase.");
    return;
  }

  saveLocalItems(localItems().filter((item) => item.id !== id));
  if (localKey) await deleteBlob(localKey);
}

async function deleteProperty(id) {
  if (remoteReady) {
    const table = config.supabasePropertiesTable || "property_items";
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      }
    });
    if (!response.ok) throw new Error("No se pudo eliminar la propiedad en Supabase.");
    return;
  }

  saveLocalProperties(localProperties().filter((item) => item.id !== id));
}

function renderMedia(item) {
  if (item.mediaType === "video") {
    return `<video src="${item.mediaUrl}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${item.mediaUrl}" alt="${escapeHtml(item.title)}" />`;
}

async function loadAndRender() {
  let items = [];
  try {
    items = await loadItems();
  } catch (error) {
    publishedCount.textContent = "0";
    videoCount.textContent = "0";
    photoCount.textContent = "0";
    testimonialCount.textContent = "0";
    evidenceGrid.innerHTML = "";
    emptyState.hidden = false;
    emptyState.textContent = remoteReady
      ? "Supabase esta conectado, pero falta ejecutar la configuracion inicial de tabla y storage."
      : "Todavia no hay evidencias cargadas.";
    if (remoteReady) storageMode.textContent = "Supabase conectado - falta configurar tabla y storage.";
    showToast(error.message || "Falta completar la configuracion.");
    return;
  }
  const publishedItems = items.filter((item) => item.isPublished);
  publishedCount.textContent = publishedItems.length;
  videoCount.textContent = publishedItems.filter((item) => item.mediaType === "video").length;
  photoCount.textContent = publishedItems.filter((item) => item.mediaType === "image").length;
  testimonialCount.textContent = publishedItems.filter((item) => item.category === "Testimonio").length;
  emptyState.hidden = items.length !== 0;
  evidenceGrid.innerHTML = items
    .map((item) => `
      <article class="admin-evidence-card">
        <div class="admin-media-preview">${renderMedia(item)}</div>
        <div>
          <span>${escapeHtml(item.category || "Evidencia")}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml([item.city, item.eventDate].filter(Boolean).join(" - "))}</p>
          <p>${escapeHtml(item.description || "")}</p>
        </div>
        <button class="ghost-button" type="button" data-delete="${escapeHtml(item.id)}" data-local-key="${escapeHtml(item.localKey || "")}">
          <i data-lucide="trash-2"></i>
          <span>Eliminar</span>
        </button>
      </article>
    `)
    .join("");
  if (window.lucide) lucide.createIcons();
  await loadAndRenderProperties();
}

async function loadAndRenderProperties() {
  let items = [];
  try {
    items = await loadProperties();
  } catch (error) {
    propertyRemoteAvailable = false;
    propertyCount.textContent = "0";
    propertyGrid.innerHTML = "";
    propertyEmptyState.hidden = false;
    propertyEmptyState.textContent = remoteReady
      ? "Supabase esta conectado, pero falta ejecutar la tabla de propiedades."
      : "Todavia no hay propiedades cargadas.";
    showToast(error.message || "Falta completar propiedades.");
    return;
  }

  propertyRemoteAvailable = true;
  propertyCount.textContent = items.filter((item) => item.isPublished).length;
  propertyEmptyState.hidden = items.length !== 0;
  propertyGrid.innerHTML = items
    .map((item) => `
      <article class="admin-evidence-card">
        <div class="admin-media-preview">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" />
        </div>
        <div>
          <span>${escapeHtml(item.statusLabel)} · ${escapeHtml(item.zoneLabel)}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.priceLabel)} · ${escapeHtml([item.cityLabel, item.beds ? `${item.beds} hab.` : ""].filter(Boolean).join(" - "))}</p>
          <p>${escapeHtml(item.notes || "")}</p>
        </div>
        <button class="ghost-button" type="button" data-delete-property="${escapeHtml(item.id)}">
          <i data-lucide="trash-2"></i>
          <span>Eliminar</span>
        </button>
      </article>
    `)
    .join("");
  if (window.lucide) lucide.createIcons();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get("username").toString().trim();
  const password = formData.get("password").toString();
  if (username !== config.adminUser || password !== config.adminPassword) {
    showToast("Usuario o contraseña incorrectos");
    return;
  }
  setAuthed(true);
  applyAuthState();
});

logoutButton.addEventListener("click", () => {
  setAuthed(false);
  applyAuthState();
});

refreshButton.addEventListener("click", loadAndRender);
refreshPropertiesButton.addEventListener("click", loadAndRenderProperties);

toggleEvidenceForm.addEventListener("click", () => {
  evidenceForm.hidden = !evidenceForm.hidden;
  toggleEvidenceForm.querySelector("span").textContent = evidenceForm.hidden ? "Nueva evidencia" : "Cerrar formulario";
  if (!evidenceForm.hidden) {
    propertyForm.hidden = true;
    togglePropertyForm.querySelector("span").textContent = "Nueva propiedad";
  }
});

togglePropertyForm.addEventListener("click", () => {
  propertyForm.hidden = !propertyForm.hidden;
  togglePropertyForm.querySelector("span").textContent = propertyForm.hidden ? "Nueva propiedad" : "Cerrar formulario";
  if (!propertyForm.hidden) {
    evidenceForm.hidden = true;
    toggleEvidenceForm.querySelector("span").textContent = "Nueva evidencia";
  }
});

evidenceGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  await deleteItem(button.dataset.delete, button.dataset.localKey);
  showToast("Evidencia eliminada");
  loadAndRender();
});

propertyGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-property]");
  if (!button) return;
  await deleteProperty(button.dataset.deleteProperty);
  showToast("Propiedad eliminada");
  loadAndRenderProperties();
});

evidenceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = evidenceForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Guardando...";

  try {
    const formData = new FormData(evidenceForm);
    const file = formData.get("media");
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    const baseItem = {
      id: slug(),
      title: formData.get("title").toString().trim(),
      category: formData.get("category").toString(),
      city: formData.get("city").toString().trim(),
      eventDate: formData.get("eventDate").toString(),
      description: formData.get("description").toString().trim(),
      mediaType,
      isFeatured: formData.get("isFeatured") === "on",
      isPublished: formData.get("isPublished") === "on",
      createdAt: new Date().toISOString()
    };

    if (remoteReady) {
      const upload = await uploadPermanentFile(file, baseItem.id);
      await saveRemoteItem({
        id: baseItem.id,
        title: baseItem.title,
        category: baseItem.category,
        city: baseItem.city,
        event_date: baseItem.eventDate || null,
        description: baseItem.description,
        media_type: mediaType,
        media_url: upload.secure_url,
        poster_url: upload.thumbnail_url || null,
        is_featured: baseItem.isFeatured,
        is_published: baseItem.isPublished,
        created_at: baseItem.createdAt
      });
    } else {
      const localKey = `media-${baseItem.id}`;
      await putBlob(localKey, file);
      saveLocalItems([{ ...baseItem, localKey }, ...localItems()]);
    }

    evidenceForm.reset();
    evidenceForm.hidden = true;
    toggleEvidenceForm.querySelector("span").textContent = "Nueva evidencia";
    showToast("Evidencia guardada");
    await loadAndRender();
  } catch (error) {
    showToast(error.message || "No se pudo guardar");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Guardar evidencia";
  }
});

propertyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = propertyForm.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Guardando...";

  try {
    const formData = new FormData(propertyForm);
    const files = formData.getAll("media").filter((file) => file && file.size);
    if (!files.length) throw new Error("Sube al menos una foto.");
    if (remoteReady && !propertyRemoteAvailable) {
      throw new Error("Primero ejecuta el SQL de propiedades en Supabase.");
    }

    const title = formData.get("title").toString().trim();
    const cityLabel = formData.get("cityLabel").toString().trim();
    const zoneLabel = formData.get("zoneLabel").toString().trim();
    const id = `${plainSlug(title)}-${Date.now()}`;
    const uploads = remoteReady
      ? await uploadMultipleFiles(files, id)
      : [];
    const mediaUrls = uploads.map((item) => item.secure_url);
    const tags = formData.get("tags").toString().split(",").map((tag) => tag.trim()).filter(Boolean);
    const property = {
      id,
      title,
      subtitle: formData.get("subtitle").toString().trim(),
      priceLabel: formData.get("priceLabel").toString().trim(),
      priceUsd: formData.get("priceUsd") ? Number(formData.get("priceUsd")) : null,
      type: formData.get("type").toString(),
      category: formData.get("category").toString(),
      city: plainSlug(cityLabel),
      cityLabel,
      zone: plainSlug(zoneLabel),
      zoneLabel,
      beds: formData.get("beds") ? Number(formData.get("beds")) : null,
      meters: formData.get("meters") ? Number(formData.get("meters")) : null,
      status: formData.get("status").toString(),
      statusLabel: statusLabel(formData.get("status").toString()),
      notes: formData.get("notes").toString().trim(),
      tags,
      imageUrl: mediaUrls[0] || "",
      mediaUrls,
      isFeatured: formData.get("isFeatured") === "on",
      isPublished: formData.get("isPublished") === "on",
      createdAt: new Date().toISOString()
    };

    if (remoteReady) {
      await saveRemoteProperty({
        id: property.id,
        title: property.title,
        subtitle: property.subtitle,
        price_label: property.priceLabel,
        price_usd: property.priceUsd,
        type: property.type,
        category: property.category,
        city: property.city,
        city_label: property.cityLabel,
        zone: property.zone,
        zone_label: property.zoneLabel,
        beds: property.beds,
        meters: property.meters,
        status: property.status,
        status_label: property.statusLabel,
        notes: property.notes,
        tags: property.tags,
        image_url: property.imageUrl,
        media_urls: property.mediaUrls,
        is_featured: property.isFeatured,
        is_published: property.isPublished,
        created_at: property.createdAt
      });
    } else {
      const localUrls = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      })));
      saveLocalProperties([{ ...property, imageUrl: localUrls[0], mediaUrls: localUrls }, ...localProperties()]);
    }

    propertyForm.reset();
    propertyForm.hidden = true;
    togglePropertyForm.querySelector("span").textContent = "Nueva propiedad";
    showToast("Propiedad guardada");
    await loadAndRenderProperties();
  } catch (error) {
    showToast(error.message || "No se pudo guardar");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Guardar propiedad";
  }
});

window.addEventListener("DOMContentLoaded", () => {
  storageMode.textContent = remoteReady
    ? "Contenido permanente activo"
    : "Almacenamiento temporal de prueba activo.";
  applyAuthState();
  if (window.lucide) lucide.createIcons();
});
