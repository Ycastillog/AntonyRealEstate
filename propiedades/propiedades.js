const config = window.ANTONY_MEDIA_CONFIG || {};
const hasRemoteProperties = Boolean(config.supabaseUrl && config.supabaseAnonKey && config.supabasePropertiesTable);

const staticProperties = [
  {
    id: "colinas-de-los-rios",
    title: "Colinas de los Rios",
    subtitle: "Apartamento en torre moderna",
    priceLabel: "RD$9.5 MM",
    priceUsd: 158000,
    type: "apartamento",
    city: "santo-domingo",
    category: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "colinas-de-los-rios",
    zoneLabel: "Colinas de los Rios",
    beds: 2,
    meters: null,
    status: "disponible",
    statusLabel: "Disponible",
    detailUrl: "colinas-de-los-rios/",
    image: "../assets/properties/colinas-de-los-rios/foto-01.jpg",
    tags: ["Familiar", "Apartamento", "Santo Domingo"],
    notes: "2 habitaciones, 2 parqueos lineales, gimnasio, jacuzzi, area social y seguridad.",
    message: "Hola Antony, vi la propiedad Colinas de los Rios en tu pagina y quiero mas informacion."
  },
  {
    id: "mirador-sur",
    title: "Mirador Sur",
    subtitle: "Modern Family Apartment",
    priceLabel: "US$185,000",
    priceUsd: 185000,
    type: "apartamento",
    city: "santo-domingo",
    category: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "mirador-sur",
    zoneLabel: "Mirador Sur",
    beds: 2,
    meters: 132,
    status: "disponible",
    statusLabel: "Disponible",
    detailUrl: "mirador-sur/",
    image: "../assets/properties/mirador-sur/foto-01.jpg",
    tags: ["Familiar", "Apartamento", "Vista premium"],
    notes: "132 m2, 2 habitaciones, balcon, cuarto de servicio, gimnasio, picuzzi, BBQ y seguridad 24/7.",
    message: "Hola Antony, vi el apartamento de Mirador Sur y quiero mas informacion."
  },
  ...[
    ["santo-01", "Proyecto residencial en Santo Domingo", "Torre moderna para evaluar con asesoria", "../assets/inventory/santo-domingo/santo-domingo-01.jpg", "evaristo-morales", "Evaristo Morales", ["Santo Domingo", "Inversion"]],
    ["santo-02", "Apartamento familiar en Santo Domingo", "Opcion urbana para familia o inversion", "../assets/inventory/santo-domingo/santo-domingo-08.jpg", "bella-vista", "Bella Vista", ["Familiar", "Apartamento"]],
    ["santo-03", "Torre moderna en Naco", "Proyecto de referencia en sector premium", "../assets/inventory/santo-domingo/santo-domingo-35.jpg", "naco", "Naco", ["Naco", "Premium"]],
    ["santo-04", "Opcion de inversion en Santo Domingo", "Proyecto urbano sujeto a confirmacion", "../assets/inventory/santo-domingo/santo-domingo-19.jpg", "el-millon", "El Millon", ["Inversion", "Ciudad"]],
    ["santo-05", "Proyecto residencial urbano", "Alternativa para comparar por zona y presupuesto", "../assets/inventory/santo-domingo/santo-domingo-28.jpg", "naco", "Naco", ["Apartamento", "Santo Domingo"]],
    ["santo-06", "Opcion familiar en Santo Domingo", "Proyecto visual para solicitar disponibilidad actualizada", "../assets/inventory/santo-domingo/santo-domingo-34.jpg", "santo-domingo", "Santo Domingo", ["Familiar", "Residencial"]]
  ].map(([id, title, subtitle, image, zone, zoneLabel, tags]) => ({
    id,
    title,
    subtitle,
    priceLabel: "Precio a consultar",
    priceUsd: null,
    type: "proyecto",
    city: "santo-domingo",
    category: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone,
    zoneLabel,
    beds: null,
    meters: null,
    status: "disponible",
    statusLabel: "Disponible",
    detailUrl: "opciones-santo-domingo/",
    image,
    tags,
    notes: "Opcion del inventario visual de proyectos en Santo Domingo. Disponibilidad, precio y condiciones se confirman con Antony.",
    message: "Hola Antony, vi opciones en Santo Domingo y quiero que me orientes."
  })),
  ...[
    ["turistica-01", "Proyecto turistico", "Opcion en zona turistica para evaluar inversion", "../assets/inventory/turisticas/turisticas-01.jpg", "punta-cana", "Punta Cana", ["Turistica", "Inversion"]],
    ["turistica-02", "Apartamento para inversion turistica", "Alternativa visual para renta o descanso", "../assets/inventory/turisticas/turisticas-04.jpg", "cap-cana", "Cap Cana", ["Turistica", "Premium"]],
    ["turistica-03", "Opcion vacacional", "Proyecto para compradores desde RD o el exterior", "../assets/inventory/turisticas/turisticas-08.jpg", "bavaro", "Bavaro", ["Vacacional", "Desde USA"]],
    ["turistica-04", "Propiedad para renta corta", "Opcion de referencia para evaluar rentabilidad", "../assets/inventory/turisticas/turisticas-11.jpg", "san-pedro", "San Pedro", ["Renta corta", "Inversion"]],
    ["turistica-05", "Proyecto en zona turistica", "Inventario visual sujeto a disponibilidad real", "../assets/inventory/turisticas/turisticas-20.jpg", "punta-cana", "Punta Cana", ["Turistica", "Proyecto"]],
    ["turistica-06", "Opcion de inversion turistica", "Proyecto para comparar por zona, precio y condiciones", "../assets/inventory/turisticas/turisticas-26.jpg", "punta-cana", "Punta Cana", ["Inversion", "Turistica"]]
  ].map(([id, title, subtitle, image, zone, zoneLabel, tags]) => ({
    id,
    title,
    subtitle,
    priceLabel: "Precio a consultar",
    priceUsd: null,
    type: "proyecto",
    city: zone,
    category: "turisticas",
    cityLabel: zoneLabel,
    zone,
    zoneLabel,
    beds: null,
    meters: null,
    status: "disponible",
    statusLabel: "Disponible",
    detailUrl: "opciones-turisticas/",
    image,
    tags,
    notes: "Opcion del inventario visual de proyectos turisticos. Precio, disponibilidad y condiciones se confirman antes de avanzar.",
    message: "Hola Antony, vi opciones turisticas y quiero evaluar una inversion."
  }))
];

let properties = [...staticProperties];

const controls = {
  search: document.querySelector("#propertySearch"),
  type: document.querySelector("#propertyType"),
  category: document.querySelector("#propertyCategory"),
  city: document.querySelector("#propertyCity"),
  zone: document.querySelector("#propertyZone"),
  priceMode: document.querySelector("#propertyPriceMode"),
  beds: document.querySelector("#propertyBeds"),
  status: document.querySelector("#propertyStatus")
};

const results = document.querySelector("#propertyResults");
const empty = document.querySelector("#propertyEmpty");
const count = document.querySelector("#propertyResultsCount");
const toast = document.querySelector("#propertyToast");

function whatsappUrl(message) {
  return window.antonyWhatsappUrl ? window.antonyWhatsappUrl(message) : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function plainSlug(value) {
  return String(value || "opcion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "opcion";
}

function normalizeRemoteProperty(item) {
  const tags = Array.isArray(item.tags)
    ? item.tags
    : String(item.tags || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
  const mediaUrls = Array.isArray(item.media_urls) ? item.media_urls : [item.image_url].filter(Boolean);
  const title = item.title || "Propiedad para evaluar";
  const priceLabel = item.price_label || "Precio a consultar";

  return {
    id: item.id,
    title,
    subtitle: item.subtitle || title,
    priceLabel,
    priceUsd: item.price_usd ?? null,
    type: item.type || "apartamento",
    city: item.city || plainSlug(item.city_label),
    category: item.category || "santo-domingo",
    cityLabel: item.city_label || "",
    zone: item.zone || plainSlug(item.zone_label),
    zoneLabel: item.zone_label || "",
    beds: item.beds ?? null,
    meters: item.meters ?? null,
    status: item.status || "disponible",
    statusLabel: item.status_label || "Disponible",
    detailUrl: "",
    image: item.image_url || mediaUrls[0] || "../assets/properties/mirador-sur/foto-01.jpg",
    tags: tags.length ? tags : [item.type || "Propiedad"],
    notes: item.notes || "Propiedad cargada por Antony. Disponibilidad, precio y condiciones se confirman antes de avanzar.",
    message: `Hola Antony, vi la propiedad ${title} (${priceLabel}) en tu pagina y quiero mas informacion.`
  };
}

async function loadRemoteProperties() {
  if (!hasRemoteProperties) return [];
  const url = `${config.supabaseUrl}/rest/v1/${config.supabasePropertiesTable}?select=*&is_published=eq.true&order=is_featured.desc,created_at.desc`;
  const response = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    }
  });
  if (!response.ok) return [];
  const items = await response.json();
  return items.map(normalizeRemoteProperty);
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function currentFilters() {
  return {
    q: controls.search.value.trim().toLowerCase(),
    type: controls.type.value,
    category: controls.category.value,
    city: controls.city.value,
    zone: controls.zone.value,
    priceMode: controls.priceMode.value,
    beds: Number(controls.beds.value || 0),
    status: controls.status.value
  };
}

function setFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  controls.search.value = params.get("q") || "";
  controls.type.value = params.get("tipo") || "";
  controls.category.value = params.get("categoria") || "";
  controls.city.value = params.get("ciudad") || "";
  controls.zone.value = params.get("zona") || "";
  controls.priceMode.value = params.get("precio") || "";
  controls.beds.value = params.get("habitaciones") || "";
  controls.status.value = params.get("estado") || "";
}

function updateUrl(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("tipo", filters.type);
  if (filters.category) params.set("categoria", filters.category);
  if (filters.city) params.set("ciudad", filters.city);
  if (filters.zone) params.set("zona", filters.zone);
  if (filters.priceMode) params.set("precio", filters.priceMode);
  if (filters.beds) params.set("habitaciones", String(filters.beds));
  if (filters.status) params.set("estado", filters.status);
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({ filters }, "", next);
}

function matches(property, filters) {
  const haystack = [
    property.title,
    property.subtitle,
    property.cityLabel,
    property.zoneLabel,
    property.priceLabel,
    property.notes,
    ...property.tags
  ].join(" ").toLowerCase();

  if (filters.q && !haystack.includes(filters.q)) return false;
  if (filters.type && property.type !== filters.type && !property.tags.map((tag) => tag.toLowerCase()).includes(filters.type)) return false;
  if (filters.category && property.category !== filters.category) return false;
  if (filters.city && property.city !== filters.city) return false;
  if (filters.zone && property.zone !== filters.zone) return false;
  if (filters.priceMode === "consultar" && property.priceUsd !== null) return false;
  if (filters.priceMode === "con-precio" && property.priceUsd === null) return false;
  if (filters.beds && (!property.beds || property.beds < filters.beds)) return false;
  if (filters.status && property.status !== filters.status) return false;
  return true;
}

function propertyCard(property) {
  const hasDetail = Boolean(property.detailUrl);
  const primaryHref = hasDetail ? property.detailUrl : whatsappUrl(property.message);
  const primaryAttrs = hasDetail ? "" : 'target="_blank" rel="noreferrer"';
  const primaryLabel = hasDetail ? "Ver detalles" : "Solicitar asesoria";
  const mediaAttrs = hasDetail ? `href="${property.detailUrl}"` : `href="${whatsappUrl(property.message)}" target="_blank" rel="noreferrer"`;
  const meta = [
    property.cityLabel,
    property.beds ? `${property.beds} hab.` : "",
    property.meters ? `${property.meters} m2` : ""
  ].filter(Boolean);

  return `
    <article class="featured-property-card property-result-card">
      <a class="featured-property-media" ${mediaAttrs} aria-label="${primaryLabel} de ${property.title}">
        <img src="${property.image}" alt="${property.title}" loading="lazy" />
        <span class="property-status ${property.status}">${property.statusLabel}</span>
      </a>
      <div class="featured-property-copy">
        <p class="eyebrow">${property.zoneLabel}</p>
        <h3>${property.subtitle}</h3>
        <strong>${property.priceLabel}</strong>
        ${meta.length ? `<div class="property-card-meta">${meta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
        <p>${property.notes}</p>
        <div class="route-tags">
          ${property.tags.map((tag) => `<small>${tag}</small>`).join("")}
        </div>
        <div class="property-actions">
          <a class="primary-button" href="${primaryHref}" ${primaryAttrs}>
            <i data-lucide="${hasDetail ? "building-2" : "message-circle"}"></i>
            <span>${primaryLabel}</span>
          </a>
          ${hasDetail ? `
            <a class="ghost-button" href="${whatsappUrl(property.message)}" target="_blank" rel="noreferrer">
              <i data-lucide="message-circle"></i>
              <span>Solicitar asesoria</span>
            </a>
          ` : ""}
        </div>
      </div>
    </article>
  `;
}

function render() {
  const filters = currentFilters();
  const visible = properties.filter((property) => matches(property, filters));
  updateUrl(filters);
  results.innerHTML = visible.map(propertyCard).join("");
  empty.hidden = visible.length > 0;
  count.textContent = `Mostrando ${visible.length} ${visible.length === 1 ? "opcion" : "opciones"}`;
  if (window.lucide) window.lucide.createIcons();
}

Object.values(controls).forEach((control) => {
  control.addEventListener("input", render);
  control.addEventListener("change", render);
});

document.querySelectorAll("[data-quick-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    const [key, value] = button.dataset.quickFilter.split(":");
    Object.values(controls).forEach((control) => {
      control.value = "";
    });
    if (controls[key]) controls[key].value = value;
    render();
  });
});

document.querySelector("#clearPropertyFilters").addEventListener("click", () => {
  Object.values(controls).forEach((control) => {
    control.value = "";
  });
  render();
});

document.querySelector("#copyPropertiesLink").addEventListener("click", async () => {
  await navigator.clipboard.writeText(window.location.href);
  showToast("Busqueda copiada");
});

async function initProperties() {
  setFiltersFromUrl();
  const remoteProperties = await loadRemoteProperties();
  const existingIds = new Set(staticProperties.map((property) => property.id));
  properties = [
    ...remoteProperties.filter((property) => !existingIds.has(property.id)),
    ...staticProperties
  ];
  render();
}

initProperties();
