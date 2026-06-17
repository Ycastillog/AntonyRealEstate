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
  },
  {
    id: "punta-cana-vista-cana",
    title: "Punta Cana Vista Cana",
    subtitle: "Proyecto turistico para inversion",
    priceLabel: "US$157,900",
    priceUsd: 157900,
    type: "proyecto",
    city: "punta-cana",
    cityLabel: "Punta Cana",
    zone: "punta-cana",
    zoneLabel: "Punta Cana",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-turisticos/punta-cana-01.jpg",
    tags: ["Turistico", "Inversion", "Vista Cana"],
    notes: "Proyecto turistico para evaluar por presupuesto, renta y plusvalia en Punta Cana."
  },
  {
    id: "cap-cana-proyecto",
    title: "Cap Cana",
    subtitle: "Proyecto premium en zona turistica",
    priceLabel: "US$307,500",
    priceUsd: 307500,
    type: "proyecto",
    city: "cap-cana",
    cityLabel: "Cap Cana",
    zone: "cap-cana",
    zoneLabel: "Cap Cana",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-turisticos/cap-cana-01.jpg",
    tags: ["Turistico", "Premium", "Inversion"],
    notes: "Opcion premium para compradores que buscan zona turistica, renta y posicionamiento."
  },
  {
    id: "downtown-punta-cana",
    title: "Downtown Punta Cana",
    subtitle: "Proyecto para renta e inversion",
    priceLabel: "US$127,500",
    priceUsd: 127500,
    type: "proyecto",
    city: "punta-cana",
    cityLabel: "Punta Cana",
    zone: "downtown-punta-cana",
    zoneLabel: "Downtown Punta Cana",
    beds: 1,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-turisticos/downtown-punta-cana-01.jpg",
    tags: ["Turistico", "Renta", "Desde USA"],
    notes: "Alternativa de entrada para evaluar inversion y renta en el poligono turistico."
  },
  {
    id: "bavaro-proyecto",
    title: "Bavaro",
    subtitle: "Opcion turistica de entrada",
    priceLabel: "US$78,000",
    priceUsd: 78000,
    type: "proyecto",
    city: "bavaro",
    cityLabel: "Bavaro",
    zone: "bavaro",
    zoneLabel: "Bavaro",
    beds: 1,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-turisticos/punta-cana-02.jpg",
    tags: ["Turistico", "Entrada", "Inversion"],
    notes: "Proyecto turistico para compradores que buscan iniciar con una opcion de menor presupuesto."
  },
  {
    id: "san-pedro-macoris",
    title: "San Pedro de Macoris",
    subtitle: "Proyecto turistico residencial",
    priceLabel: "US$84,500",
    priceUsd: 84500,
    type: "proyecto",
    city: "san-pedro",
    cityLabel: "San Pedro",
    zone: "san-pedro",
    zoneLabel: "San Pedro de Macoris",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-turisticos/san-pedro-01.jpg",
    tags: ["Turistico", "Residencial", "Inversion"],
    notes: "Opcion para evaluar fuera del centro de Santo Domingo con enfoque residencial e inversion."
  },
  {
    id: "evaristo-morales",
    title: "Evaristo Morales",
    subtitle: "Proyecto urbano en sector premium",
    priceLabel: "US$135,000",
    priceUsd: 135000,
    type: "proyecto",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "evaristo-morales",
    zoneLabel: "Evaristo Morales",
    beds: 1,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-santo-domingo/evaristo-morales-01.jpg",
    tags: ["Urbano", "Inversion", "Sector premium"],
    notes: "Proyecto en Evaristo Morales para evaluar ubicacion, rentabilidad y forma de pago."
  },
  {
    id: "bella-vista",
    title: "Bella Vista",
    subtitle: "Proyecto familiar urbano",
    priceLabel: "US$258,893",
    priceUsd: 258893,
    type: "apartamento",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "bella-vista",
    zoneLabel: "Bella Vista",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-santo-domingo/bella-vista-01.jpg",
    tags: ["Familiar", "Ciudad", "Premium"],
    notes: "Opcion en Bella Vista para vivir en ciudad con acceso a servicios y sectores clave."
  },
  {
    id: "ducal-56-naco",
    title: "Ducal 56 Naco",
    subtitle: "Proyecto en Naco",
    priceLabel: "US$280,500",
    priceUsd: 280500,
    type: "proyecto",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "naco",
    zoneLabel: "Naco",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-santo-domingo/ducal-naco-01.jpg",
    tags: ["Naco", "Premium", "Ciudad"],
    notes: "Proyecto para evaluar en uno de los sectores urbanos de mayor demanda."
  },
  {
    id: "el-millon",
    title: "El Millon",
    subtitle: "Proyecto residencial urbano",
    priceLabel: "US$149,500",
    priceUsd: 149500,
    type: "apartamento",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "el-millon",
    zoneLabel: "El Millon",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-santo-domingo/el-millon-01.jpg",
    tags: ["Residencial", "Ciudad", "Familiar"],
    notes: "Opcion residencial para compradores que priorizan ubicacion practica y vida urbana."
  },
  {
    id: "ensanche-naco",
    title: "Ensanche Naco",
    subtitle: "Torre residencial en Naco",
    priceLabel: "US$179,000",
    priceUsd: 179000,
    type: "apartamento",
    city: "santo-domingo",
    cityLabel: "Santo Domingo",
    zone: "naco",
    zoneLabel: "Naco",
    beds: 2,
    meters: 0,
    status: "disponible",
    statusLabel: "Disponible",
    url: "",
    image: "../assets/real/proyectos-santo-domingo/ensanche-naco-01.jpg",
    tags: ["Naco", "Residencial", "Inversion"],
    notes: "Torre en Naco para evaluar por ubicacion, terminaciones y esquema de pago."
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
  const hasDetail = Boolean(property.url);
  const primaryHref = hasDetail ? property.url : whatsappUrl(message);
  const primaryAttrs = hasDetail ? "" : 'target="_blank" rel="noreferrer"';
  const primaryLabel = hasDetail ? "Ver detalles" : "Solicitar informacion";
  const mediaAttrs = hasDetail ? `href="${property.url}"` : `href="${whatsappUrl(message)}" target="_blank" rel="noreferrer"`;
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
          <a class="primary-button" href="${primaryHref}" ${primaryAttrs}>
            <i data-lucide="${hasDetail ? "building-2" : "message-circle"}"></i>
            <span>${primaryLabel}</span>
          </a>
          ${hasDetail ? `
            <a class="ghost-button" href="${whatsappUrl(message)}" target="_blank" rel="noreferrer">
              <i data-lucide="message-circle"></i>
              <span>Solicitar informacion</span>
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
