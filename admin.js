const SESSION_KEY = "antony-admin-session";
const LOCAL_META_KEY = "antony-evidence-items";
const DB_NAME = "antony-media-store";
const DB_STORE = "files";

const config = window.ANTONY_MEDIA_CONFIG || {};
const remoteReady = Boolean(config.cloudinaryCloudName && config.cloudinaryUploadPreset && config.supabaseUrl && config.supabaseAnonKey);

const loginPanel = document.querySelector("#loginPanel");
const adminWorkspace = document.querySelector("#adminWorkspace");
const loginForm = document.querySelector("#loginForm");
const evidenceForm = document.querySelector("#evidenceForm");
const evidenceGrid = document.querySelector("#adminEvidenceGrid");
const emptyState = document.querySelector("#adminEmptyState");
const storageMode = document.querySelector("#storageMode");
const logoutButton = document.querySelector("#logoutButton");
const refreshButton = document.querySelector("#refreshEvidence");
const toggleEvidenceForm = document.querySelector("#toggleEvidenceForm");
const publishedCount = document.querySelector("#publishedCount");
const videoCount = document.querySelector("#videoCount");
const photoCount = document.querySelector("#photoCount");
const testimonialCount = document.querySelector("#testimonialCount");
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

async function itemWithPreview(item) {
  if (item.mediaUrl) return item;
  if (!item.localKey) return item;
  const blob = await getBlob(item.localKey);
  if (!blob) return item;
  return { ...item, mediaUrl: URL.createObjectURL(blob) };
}

async function loadItems() {
  if (remoteReady) {
    const url = `${config.supabaseUrl}/rest/v1/${config.supabaseTable}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc`;
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

function renderMedia(item) {
  if (item.mediaType === "video") {
    return `<video src="${item.mediaUrl}" controls playsinline preload="metadata"></video>`;
  }
  return `<img src="${item.mediaUrl}" alt="${escapeHtml(item.title)}" />`;
}

async function loadAndRender() {
  const items = await loadItems();
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
          <p>${escapeHtml(item.city || "")}${item.eventDate ? ` · ${escapeHtml(item.eventDate)}` : ""}</p>
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

toggleEvidenceForm.addEventListener("click", () => {
  evidenceForm.hidden = !evidenceForm.hidden;
  toggleEvidenceForm.querySelector("span").textContent = evidenceForm.hidden ? "Nueva evidencia" : "Cerrar formulario";
});

evidenceGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;
  await deleteItem(button.dataset.delete, button.dataset.localKey);
  showToast("Evidencia eliminada");
  loadAndRender();
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
      city: "",
      eventDate: "",
      description: formData.get("description").toString().trim(),
      mediaType,
      isFeatured: false,
      isPublished: formData.get("isPublished") === "on",
      createdAt: new Date().toISOString()
    };

    if (remoteReady) {
      const upload = await uploadToCloudinary(file);
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

window.addEventListener("DOMContentLoaded", () => {
  storageMode.textContent = remoteReady
    ? "Contenido permanente activo"
    : "Almacenamiento temporal de prueba activo.";
  applyAuthState();
  if (window.lucide) lucide.createIcons();
});
