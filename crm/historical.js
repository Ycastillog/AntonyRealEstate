/**
 * Parser and normalizer for private historical-sale imports.
 *
 * This file contains no customer data. It only converts a user-selected CSV/TSV
 * into the strict payload accepted by the Supabase staging RPC.
 */
(function (root) {
  "use strict";

  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_ROWS = 5000;
  var PROJECTS = Object.freeze([
    "Altos del este",
    "Riviera 1",
    "Riviera 2",
    "Riviera 3",
    "Riviera 4",
    "Vistas del limonal",
    "Epic Moon",
    "Epic River",
    "Doña Carmen",
    "Las Margaritas",
    "LP12",
    "LP11",
    "LP11 ABEY",
    "East Town"
  ]);
  var MONTHS = Object.freeze({
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    setiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
  });
  var HEADER_ALIASES = Object.freeze({
    proyecto: "project",
    ano: "year",
    mes: "month",
    fecha: "saleDate",
    fechaventa: "saleDate",
    unidad: "unit",
    precio: "salePrice",
    precioventa: "salePrice",
    fechadeentrega: "deliveryDate",
    fechaentrega: "deliveryDate",
    vendedor: "sellerName",
    comprador: "buyerName",
    cliente: "buyerName",
    correo: "buyerEmail",
    correoelectronico: "buyerEmail",
    email: "buyerEmail",
    telefono: "buyerPhone",
    celular: "buyerPhone"
  });

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function cleanText(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ");
  }

  function normalizeHeader(value) {
    return normalizeText(value).replace(/[^a-z0-9]/g, "");
  }

  function canonicalProject(value) {
    var key = normalizeText(value);
    return PROJECTS.find(function (project) {
      return normalizeText(project) === key;
    }) || "";
  }

  function canonicalSeller(value) {
    var seller = cleanText(value);
    var key = normalizeText(seller);
    if (key === "antony fulgencio" || key === "anthony fulgencio") {
      return "Antony Fulgencio";
    }
    return seller;
  }

  function parseDelimited(text, delimiter) {
    var rows = [];
    var row = [];
    var cell = "";
    var quoted = false;
    var source = String(text || "").replace(/^\uFEFF/, "");
    var index;

    for (index = 0; index < source.length; index += 1) {
      var character = source[index];
      if (quoted) {
        if (character === '"' && source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (character === '"') {
          quoted = false;
        } else {
          cell += character;
        }
      } else if (character === '"') {
        quoted = true;
      } else if (character === delimiter) {
        row.push(cell);
        cell = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(cell);
        if (row.some(function (value) { return String(value).trim(); })) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += character;
      }
    }
    if (quoted) throw new Error("El archivo contiene una celda entre comillas sin cerrar.");
    row.push(cell);
    if (row.some(function (value) { return String(value).trim(); })) rows.push(row);
    return rows;
  }

  function detectDelimiter(text) {
    var firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
    var candidates = ["\t", ";", ","];
    return candidates
      .map(function (delimiter) {
        return { delimiter: delimiter, count: firstLine.split(delimiter).length - 1 };
      })
      .sort(function (a, b) { return b.count - a.count; })[0].delimiter;
  }

  function parseIsoDate(value, label, allowBlank) {
    var text = cleanText(value);
    var match;
    var year;
    var month;
    var day;
    var date;
    if (!text && allowBlank) return "";
    if (!text) throw new Error(label + " es obligatoria.");
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
      if (!match) throw new Error(label + " no tiene un formato reconocido: " + text);
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    }
    date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      throw new Error(label + " no es una fecha real: " + text);
    }
    return (
      String(year).padStart(4, "0") +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  }

  function parsePrice(value, rowNumber) {
    var source = cleanText(value);
    var currency = /(?:RD\$|DOP)/i.test(source) ? "DOP" : "USD";
    var numeric = source.replace(/[^0-9.,-]/g, "");
    var amount;
    if (numeric.includes(",") && numeric.includes(".")) {
      numeric = numeric.lastIndexOf(".") > numeric.lastIndexOf(",")
        ? numeric.replace(/,/g, "")
        : numeric.replace(/\./g, "").replace(",", ".");
    } else if ((numeric.match(/,/g) || []).length === 1 && /,\d{1,2}$/.test(numeric)) {
      numeric = numeric.replace(",", ".");
    } else {
      numeric = numeric.replace(/,/g, "");
    }
    amount = Number(numeric);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Precio inválido en la fila " + rowNumber + ".");
    }
    return { amount: Math.round((amount + Number.EPSILON) * 100) / 100, currency: currency };
  }

  function shortHash(value) {
    var hash = 2166136261;
    var text = String(value || "");
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function sourceObject(headers, cells) {
    var snapshot = {};
    headers.forEach(function (header, index) {
      var key = cleanText(header) || "columna_" + String(index + 1);
      snapshot[key] = cleanText(cells[index]);
    });
    return snapshot;
  }

  function parseHistoricalFile(text, options) {
    var source = String(text || "");
    var byteLength = typeof TextEncoder === "function"
      ? new TextEncoder().encode(source).byteLength
      : source.length;
    var delimiter;
    var matrix;
    var headers;
    var headerMap = {};
    var missingHeaders;
    var seenUnits = new Set();
    var rows;
    var today = cleanText(options && options.today) || new Date().toISOString().slice(0, 10);

    if (!source.trim()) throw new Error("El archivo está vacío.");
    if (byteLength > MAX_FILE_BYTES) throw new Error("El archivo excede el límite de 5 MB.");
    delimiter = detectDelimiter(source);
    matrix = parseDelimited(source, delimiter);
    if (matrix.length < 2) throw new Error("El archivo no contiene ventas para importar.");
    headers = matrix[0].map(cleanText);
    headers.forEach(function (header, index) {
      var canonical = HEADER_ALIASES[normalizeHeader(header)];
      if (canonical && headerMap[canonical] === undefined) headerMap[canonical] = index;
    });
    missingHeaders = ["project", "saleDate", "unit", "salePrice", "buyerName"].filter(
      function (field) { return headerMap[field] === undefined; }
    );
    if (missingHeaders.length) {
      throw new Error("Faltan columnas obligatorias: Proyecto, Fecha, Unidad, Precio y Comprador.");
    }
    if (matrix.length - 1 > MAX_ROWS) {
      throw new Error("El archivo excede el límite de " + MAX_ROWS + " ventas.");
    }

    rows = matrix.slice(1).map(function (cells, dataIndex) {
      var sourceRow = dataIndex + 2;
      var read = function (field) {
        return headerMap[field] === undefined ? "" : cleanText(cells[headerMap[field]]);
      };
      var project = canonicalProject(read("project"));
      var saleDate = parseIsoDate(read("saleDate"), "La fecha de la fila " + sourceRow, false);
      var deliveryDate = parseIsoDate(
        read("deliveryDate"),
        "La fecha de entrega de la fila " + sourceRow,
        true
      );
      var price = parsePrice(read("salePrice"), sourceRow);
      var unit = read("unit");
      var buyerName = read("buyerName");
      var buyerEmail = read("buyerEmail").toLowerCase();
      var buyerPhone = read("buyerPhone");
      var declaredYear = Number(read("year"));
      var declaredMonth = MONTHS[normalizeText(read("month"))];
      var identity;

      if (!project) throw new Error("Proyecto fuera del catálogo en la fila " + sourceRow + ".");
      if (!unit) throw new Error("Falta la unidad en la fila " + sourceRow + ".");
      if (!buyerName) throw new Error("Falta el comprador en la fila " + sourceRow + ".");
      if (saleDate > today) throw new Error("La fecha de venta de la fila " + sourceRow + " está en el futuro.");
      if (deliveryDate && deliveryDate < saleDate) {
        throw new Error("La entrega de la fila " + sourceRow + " ocurre antes de la venta.");
      }
      if (declaredYear && declaredYear !== Number(saleDate.slice(0, 4))) {
        throw new Error("El año no coincide con la fecha en la fila " + sourceRow + ".");
      }
      if (declaredMonth && declaredMonth !== Number(saleDate.slice(5, 7))) {
        throw new Error("El mes no coincide con la fecha en la fila " + sourceRow + ".");
      }
      if (buyerEmail && !/^\S+@\S+\.\S+$/.test(buyerEmail)) {
        throw new Error("Correo inválido en la fila " + sourceRow + ".");
      }
      if (buyerPhone && buyerPhone.replace(/\D/g, "").length < 7) {
        throw new Error("Teléfono inválido en la fila " + sourceRow + ".");
      }
      identity = normalizeText(project) + "::" + normalizeText(unit);
      if (seenUnits.has(identity)) {
        throw new Error("La unidad " + project + " · " + unit + " aparece más de una vez.");
      }
      seenUnits.add(identity);
      return {
        id: "historical-" + shortHash(identity + "::" + saleDate),
        sourceRow: sourceRow,
        developer: "Constructora LVP",
        project: project,
        unit: unit,
        saleDate: saleDate,
        salePrice: price.amount,
        saleCurrency: price.currency,
        sellerName: canonicalSeller(read("sellerName")) || "Antony Fulgencio",
        buyerName: buyerName,
        buyerEmail: buyerEmail,
        buyerPhone: buyerPhone,
        deliveryDate: deliveryDate,
        saleStatus: "",
        commissionRate: null,
        commissionAmount: null,
        commissionCurrency: "",
        commissionPlan: "",
        advancePercentage: null,
        paymentsConfirmed: false,
        reviewStatus: "Por completar",
        sourceSnapshot: sourceObject(headers, cells)
      };
    });

    return rows;
  }

  function parseHistoricalContactUpdates(text) {
    var source = String(text || "");
    var byteLength = typeof TextEncoder === "function"
      ? new TextEncoder().encode(source).byteLength
      : source.length;
    var delimiter;
    var matrix;
    var headers;
    var headerMap = {};
    var missingHeaders;
    var seenUnits = new Set();

    if (!source.trim()) throw new Error("El archivo está vacío.");
    if (byteLength > MAX_FILE_BYTES) throw new Error("El archivo excede el límite de 5 MB.");
    delimiter = detectDelimiter(source);
    matrix = parseDelimited(source, delimiter);
    if (matrix.length < 2) throw new Error("El archivo no contiene contactos para actualizar.");
    headers = matrix[0].map(cleanText);
    headers.forEach(function (header, index) {
      var canonical = HEADER_ALIASES[normalizeHeader(header)];
      if (canonical && headerMap[canonical] === undefined) headerMap[canonical] = index;
    });
    missingHeaders = ["project", "unit"].filter(function (field) {
      return headerMap[field] === undefined;
    });
    if (missingHeaders.length) {
      throw new Error("Para actualizar contactos se requieren las columnas Proyecto y Unidad.");
    }
    if (headerMap.buyerEmail === undefined && headerMap.buyerPhone === undefined) {
      throw new Error("La base debe incluir al menos una columna de Correo o Teléfono.");
    }
    if (matrix.length - 1 > MAX_ROWS) {
      throw new Error("El archivo excede el límite de " + MAX_ROWS + " contactos.");
    }

    return matrix.slice(1).map(function (cells, dataIndex) {
      var sourceRow = dataIndex + 2;
      var read = function (field) {
        return headerMap[field] === undefined ? "" : cleanText(cells[headerMap[field]]);
      };
      var project = canonicalProject(read("project"));
      var unit = read("unit");
      var buyerEmail = read("buyerEmail").toLowerCase();
      var buyerPhone = read("buyerPhone");
      var identity;

      if (!project) throw new Error("Proyecto fuera del catálogo en la fila " + sourceRow + ".");
      if (!unit) throw new Error("Falta la unidad en la fila " + sourceRow + ".");
      if (buyerEmail && !/^\S+@\S+\.\S+$/.test(buyerEmail)) {
        throw new Error("Correo inválido en la fila " + sourceRow + ".");
      }
      if (buyerPhone && buyerPhone.replace(/\D/g, "").length < 7) {
        throw new Error("Teléfono inválido en la fila " + sourceRow + ".");
      }
      identity = normalizeText(project) + "::" + normalizeText(unit);
      if (seenUnits.has(identity)) {
        throw new Error("La unidad " + project + " · " + unit + " aparece más de una vez.");
      }
      seenUnits.add(identity);
      return {
        sourceRow: sourceRow,
        project: project,
        unit: unit,
        buyerName: read("buyerName"),
        buyerEmail: buyerEmail,
        buyerPhone: buyerPhone
      };
    });
  }

  async function sha256(value) {
    var cryptoObject = root.crypto;
    var bytes;
    var digest;
    if (!cryptoObject || !cryptoObject.subtle || typeof TextEncoder !== "function") {
      throw new Error("Este navegador no permite verificar de forma segura la huella del archivo.");
    }
    bytes = new TextEncoder().encode(String(value || ""));
    digest = await cryptoObject.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map(function (byte) { return byte.toString(16).padStart(2, "0"); })
      .join("");
  }

  function summarize(rows) {
    var source = Array.isArray(rows) ? rows : [];
    var volume = source.reduce(function (total, row) {
      return total + Number(row.salePrice || 0);
    }, 0);
    var buyers = new Set(source.map(function (row) { return normalizeText(row.buyerName); }));
    var years = source.reduce(function (groups, row) {
      var year = String(row.saleDate || "").slice(0, 4);
      if (year) groups[year] = (groups[year] || 0) + 1;
      return groups;
    }, {});
    return {
      rows: source.length,
      volume: Math.round((volume + Number.EPSILON) * 100) / 100,
      buyers: buyers.size,
      years: years
    };
  }

  root.AntonyHistoricalImport = Object.freeze({
    MAX_FILE_BYTES: MAX_FILE_BYTES,
    MAX_ROWS: MAX_ROWS,
    PROJECTS: PROJECTS,
    canonicalProject: canonicalProject,
    parseHistoricalContactUpdates: parseHistoricalContactUpdates,
    parseHistoricalFile: parseHistoricalFile,
    sha256: sha256,
    summarize: summarize
  });
}(window));
