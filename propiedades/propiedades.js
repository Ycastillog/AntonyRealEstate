const WHATSAPP_NUMBER = "";

const properties = [
  {
    id: "colinas-de-los-rios",
    title: "Colinas de los Rios",
    subtitle: "Apartamento en torre moderna",
    priceLabel: "RD$9.5 MM",
    priceUsd: 158000,
    type: "apartamento",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "colinas-de-los-rios",
    zoneLabel: "Colinas de los Rios",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "colinas-de-los-rios/",
    image: "../assets/properties/colinas-de-los-rios/foto-01.jpg",
    tags: ["Familiar", "Torre 2022", "2 parqueos"],
    notes: "2 habitaciones, 2 parqueos lineales, gimnasio, jacuzzi, area social y seguridad."
  },
  {
    id: "mirador-sur",
    title: "Mirador Sur",
    subtitle: "Modern Family Apartment",
    priceLabel: "US$185,000",
    priceUsd: 185000,
    type: "apartamento",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "mirador-sur",
    zoneLabel: "Mirador Sur",
    beds: 2,
    meters: 132,
    status: "disponible",
    statusLabel: "Disponible",
    url: "mirador-sur/",
    image: "../assets/properties/mirador-sur/foto-01.jpg",
    tags: ["Vista premium", "Picuzzi", "Seguridad 24/7"],
    notes: "132 m2, 2 habitaciones, balcon, cuarto de servicio, gimnasio, picuzzi, BBQ y seguridad 24/7."
  }
];

const controls = {
  search: document.querySelector("#propertySearch"),
  type: document.querySelector("#propertyType"),
  city: document.querySelector("#propertyCity"),
  zone: document.querySelector("#propertyZone"),
  maxPrice: document.querySelector("#propertyMaxPrice"),
  beds: document.querySelector("#propertyBeds"),
  status: document.querySelector("#propertyStatus")
};

const results = document.querySelector("#propertyResults");
const empty = document.querySelector("#propertyEmpty");
const count = document.querySelector("#propertyResultsCount");
const toast = document.querySelector("#propertyToast");

function whatsappUrl(message) {
  const encoded = encodeURIComponent(message);
  return WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
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
    city: controls.city.value,
    zone: controls.zone.value,
    max: Number(controls.maxPrice.value || 0),
    beds: Number(controls.beds.value || 0),
    status: controls.status.value
  };
}

function setFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  controls.search.value = params.get("q") || "";
  controls.type.value = params.get("tipo") || "";
  controls.city.value = params.get("ciudad") || "";
  controls.zone.value = params.get("zona") || "";
  controls.maxPrice.value = params.get("precio") || "";
  controls.beds.value = params.get("habitaciones") || "";
  controls.status.value = params.get("estado") || "";
}

function updateUrl(filters) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.type) params.set("tipo", filters.type);
  if (filters.city) params.set("ciudad", filters.city);
  if (filters.zone) params.set("zona", filters.zone);
  if (filters.max) params.set("precio", String(filters.max));
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
  if (filters.type && property.type !== filters.type) return false;
  if (filters.city && property.city !== filters.city) return false;
  if (filters.zone && property.zone !== filters.zone) return false;
  if (filters.max && property.priceUsd > filters.max) return false;
  if (filters.beds && property.beds < filters.beds) return false;
  if (filters.status && property.status !== filters.status) return false;
  return true;
}

function propertyCard(property) {
  const message = `Hola Antony, vi la propiedad ${property.title} y quiero informacion.`;
  return `
    <article class="featured-property-card property-result-card">
      <a class="featured-property-media" href="${property.url}" aria-label="Ver ${property.title}">
        <img src="${property.image}" alt="${property.title}" loading="lazy" />
        <span class="property-status ${property.status}">${property.statusLabel}</span>
      </a>
      <div class="featured-property-copy">
        <p class="eyebrow">${property.zoneLabel}</p>
        <h3>${property.subtitle}</h3>
        <strong>${property.priceLabel}</strong>
        <div class="property-card-meta">
          <span>${property.cityLabel}</span>
          <span>${property.beds} hab.</span>
          <span>${property.meters ? `${property.meters} m2` : "Metraje a confirmar"}</span>
        </div>
        <p>${property.notes}</p>
        <div class="route-tags">
          ${property.tags.map((tag) => `<small>${tag}</small>`).join("")}
        </div>
        <div class="property-actions">
          <a class="primary-button" href="${property.url}">
            <i data-lucide="building-2"></i>
            <span>Ver detalles</span>
          </a>
          <a class="ghost-button" href="${whatsappUrl(message)}" target="_blank" rel="noreferrer">
            <i data-lucide="message-circle"></i>
            <span>Solicitar informacion</span>
          </a>
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
  count.textContent = `Mostrando ${visible.length} ${visible.length === 1 ? "propiedad" : "propiedades"}`;
  if (window.lucide) window.lucide.createIcons();
}

Object.values(controls).forEach((control) => {
  control.addEventListener("input", render);
  control.addEventListener("change", render);
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

setFiltersFromUrl();
render();
