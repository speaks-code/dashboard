// ════════════════════════════════════════════════════════════════════════════
//  Explorador de la base D1 (tablas quotes + daily)
//  Consulta los endpoints /api/db/overview, /api/db/days y /api/db/rows del
//  Worker optimizado. Cada consulta devuelve "_rows_read" (con ?debug=1) y el
//  explorador lo suma para visualizar cuánto del límite diario de D1 se consume.
//  Se puede apuntar a otro Worker con  db_explorer.html?worker=https://...
// ════════════════════════════════════════════════════════════════════════════

const DEFAULT_WORKER = "https://dashboard.despachodigitalizacion.workers.dev";
const SYMBOLS = [
  "AAPL", "AMD", "AMZN", "AVGO", "COST", "CSCO", "GOOGL", "INTC",
  "META", "MSFT", "MU", "NFLX", "NVDA", "PLTR", "TSLA",
];
const D1_DAILY_LIMIT = 5000000; // rows_read diarias del plan gratuito

const state = {
  base: DEFAULT_WORKER,
  symbol: "AAPL",
  tab: "overview",
  rowsRead: 0,
  requests: 0,
  meterSeen: false,
  days: [],
  rows: [],
  hasMore: false,
  nextBefore: null,
  charts: {},
};

// ── Utilidades ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
const num = (n, d = 2) => (n == null || isNaN(n) ? "–" : Number(n).toFixed(d));
const int = (n) => (n == null || isNaN(n) ? "–" : Number(n).toLocaleString("es-AR"));
const sign = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");

function tsET(ts) {
  if (!ts) return "–";
  return new Date(ts * 1000).toLocaleString("es-AR", {
    timeZone: "America/New_York",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weekdaysBetween(first, last) {
  const out = [];
  const end = Date.parse(last + "T00:00:00Z");
  for (let t = Date.parse(first + "T00:00:00Z"); t <= end; t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

function toCsv(headers, rows) {
  const q = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(",")].concat(rows.map((r) => r.map(q).join(","))).join("\r\n");
}

function download(name, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ── Acceso al Worker ───────────────────────────────────────────────────────
async function api(path, params) {
  const u = new URL(state.base.replace(/\/+$/, "") + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== "" && v != null) u.searchParams.set(k, v);
  });
  u.searchParams.set("debug", "1");

  let res;
  try {
    res = await fetch(u);
  } catch (e) {
    throw new Error("No se pudo conectar con el Worker (" + e.message + ").");
  }
  let data = {};
  try { data = await res.json(); } catch (_) { /* respuesta sin JSON */ }

  if (!res.ok) {
    const err = new Error(data.error || "HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  state.requests++;
  if (typeof data._rows_read === "number") {
    state.rowsRead += data._rows_read;
    state.meterSeen = true;
  }
  updateMeter();
  return data;
}

function showAlert(msg, type) {
  const b = $("alertBox");
  b.textContent = msg;
  b.className = "alert " + (type || "danger");
  b.hidden = false;
}
function clearAlert() { $("alertBox").hidden = true; }

function handleError(e) {
  console.error(e);
  if (e.status === 404 && /Endpoint no válido/i.test(e.message)) {
    showAlert(
      "El Worker todavía no tiene los endpoints /api/db/*. Desplegá worker_optimizado.js y volvé a probar.",
      "warn",
    );
  } else {
    showAlert("Error: " + e.message, "danger");
  }
}

function updateMeter() {
  const pct = Math.min(100, (state.rowsRead / D1_DAILY_LIMIT) * 100);
  const q = state.requests + (state.requests === 1 ? " consulta" : " consultas");
  $("meterText").textContent = state.meterSeen
    ? int(state.rowsRead) + " filas leídas en " + q + " · " +
      pct.toFixed(2) + "% del límite diario (" + int(D1_DAILY_LIMIT) + ")"
    : q + " · el Worker no informa filas leídas (¿versión anterior?)";
  $("meterBar").style.width = (state.rowsRead > 0 ? Math.max(pct, 0.6) : 0) + "%";
}

// ── Pestañas ───────────────────────────────────────────────────────────────
function selectTab(name) {
  state.tab = name;
  clearAlert();
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => {
    p.hidden = p.id !== "panel-" + name;
  });
  $("symbolPick").hidden = name === "overview";
  refreshActive();
}

function refreshActive() {
  const run = { overview: loadOverview, days: loadDays, rows: () => loadRows(true) }[state.tab];
  return run().catch(handleError);
}

// ── Resumen ────────────────────────────────────────────────────────────────
async function loadOverview() {
  const d = await api("/api/db/overview");
  const syms = d.symbols || [];

  $("statSymbols").textContent = syms.length + " / " + SYMBOLS.length;
  $("statRows").textContent = int(d.total_rows);
  $("statDays").textContent = int(d.total_days);
  const firsts = syms.map((s) => s.first_day).sort();
  const lasts = syms.map((s) => s.last_day).sort();
  $("statRange").textContent = firsts.length ? firsts[0] + " → " + lasts[lasts.length - 1] : "–";
  $("overviewNotice").hidden = !!d.daily_ready;

  $("overviewBody").innerHTML = syms.map((s) =>
    '<tr class="clickable" data-symbol="' + esc(s.symbol) + '">' +
      "<td><strong>" + esc(s.symbol) + "</strong></td>" +
      '<td class="r">' + int(s.days) + "</td>" +
      '<td class="r">' + int(s.rows) + "</td>" +
      '<td class="r">' + (s.days ? num(s.rows / s.days, 1) : "–") + "</td>" +
      "<td>" + esc(s.first_day) + "</td>" +
      "<td>" + esc(s.last_day) + "</td>" +
      "<td>" + esc(tsET(s.last_ts)) + " ET</td>" +
    "</tr>").join("") ||
    '<tr><td colspan="7" class="empty">Sin datos en la tabla daily.</td></tr>';
}

// ── Días ───────────────────────────────────────────────────────────────────
async function loadDays() {
  const d = await api("/api/db/days", {
    symbol: state.symbol, from: $("daysFrom").value, to: $("daysTo").value,
  });
  state.days = d.data || [];
  renderDays();
}

function drawChart(key, canvasId, config) {
  if (typeof Chart === "undefined") return;
  if (state.charts[key]) state.charts[key].destroy();
  state.charts[key] = new Chart($(canvasId).getContext("2d"), config);
}

const AXIS = {
  grid: { color: "rgba(225,228,232,0.6)", drawBorder: false },
  ticks: { color: "#5f6b7a", maxTicksLimit: 8 },
};

function renderDays() {
  const days = state.days;
  $("daysCount").textContent = days.length + " días";
  $("daysCsv").disabled = !days.length;

  if (!days.length) {
    $("daysBody").innerHTML = '<tr><td colspan="8" class="empty">Sin días para ' + esc(state.symbol) + " en este rango.</td></tr>";
    $("daysInfo").hidden = true;
    ["close", "count"].forEach((k) => { if (state.charts[k]) { state.charts[k].destroy(); delete state.charts[k]; } });
    return;
  }

  // Tabla (más reciente arriba) con variación contra el cierre anterior
  const rows = days.map((r, i) => {
    const prev = i > 0 ? days[i - 1].close : null;
    return Object.assign({}, r, { chg: prev ? ((r.close - prev) / prev) * 100 : null });
  });
  const med = median(days.map((r) => r.n));
  $("daysBody").innerHTML = rows.slice().reverse().map((r) =>
    "<tr" + (r.n < med * 0.9 ? ' class="partial"' : "") + ">" +
      "<td>" + esc(r.day) + "</td>" +
      '<td class="r">' + num(r.open) + "</td>" +
      '<td class="r">' + num(r.high) + "</td>" +
      '<td class="r">' + num(r.low) + "</td>" +
      '<td class="r">' + num(r.close) + "</td>" +
      '<td class="r ' + sign(r.chg) + '">' + (r.chg == null ? "–" : (r.chg > 0 ? "+" : "") + num(r.chg) + "%") + "</td>" +
      '<td class="r">' + int(r.n) + "</td>" +
      "<td>" + esc(tsET(r.first_ts).slice(12, 17)) + " → " + esc(tsET(r.last_ts).slice(12, 17)) + "</td>" +
    "</tr>").join("");

  // Huecos: días hábiles sin ningún registro y días con pocos registros
  const have = new Set(days.map((r) => r.day));
  const missing = weekdaysBetween(days[0].day, days[days.length - 1].day).filter((x) => !have.has(x));
  const partial = days.filter((r) => r.n < med * 0.9);
  const parts = [];
  parts.push("Mediana de registros por día: <strong>" + int(med) + "</strong> (esperado ≈ 78 con recolección cada 5 min).");
  parts.push(missing.length
    ? "Días hábiles sin ningún registro: <strong>" + missing.length + "</strong> — " + esc(missing.slice(0, 15).join(", ")) + (missing.length > 15 ? "…" : "") + " (incluye feriados)."
    : "No faltan días hábiles en el rango.");
  if (partial.length) {
    parts.push("Días incompletos (&lt; 90% de la mediana): " +
      esc(partial.slice(0, 10).map((r) => r.day + " (" + r.n + ")").join(", ")) + (partial.length > 10 ? "…" : "") + ".");
  }
  $("daysInfo").innerHTML = parts.map((p) => "<div>" + p + "</div>").join("");
  $("daysInfo").hidden = false;

  // Gráficos
  const labels = days.map((r) => r.day);
  const up = days[days.length - 1].close >= days[0].close;
  const color = up ? "#1a7f37" : "#cf222e";
  drawChart("close", "closeChart", {
    type: "line",
    data: { labels, datasets: [{
      label: "Cierre", data: days.map((r) => r.close), borderColor: color,
      backgroundColor: up ? "rgba(26,127,55,0.10)" : "rgba(207,34,46,0.10)",
      borderWidth: 2, fill: true, tension: 0.1, pointRadius: days.length < 50 ? 2 : 0, pointHoverRadius: 4,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => state.symbol + ": $" + c.parsed.y.toFixed(2) } } },
      scales: { x: AXIS, y: { grid: AXIS.grid, ticks: Object.assign({}, AXIS.ticks, { maxTicksLimit: 6, callback: (v) => "$" + v.toFixed(2) }) } },
    },
  });
  drawChart("count", "countChart", {
    type: "bar",
    data: { labels, datasets: [{
      label: "Registros", data: days.map((r) => r.n),
      backgroundColor: days.map((r) => (r.n < med * 0.9 ? "#bf8700" : "#9aa4af")),
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: AXIS, y: { grid: AXIS.grid, ticks: Object.assign({}, AXIS.ticks, { maxTicksLimit: 6 }), beginAtZero: true } },
    },
  });
}

// ── Registros crudos ───────────────────────────────────────────────────────
async function loadRows(reset) {
  if (reset) {
    state.rows = [];
    state.nextBefore = null;
    $("rowsBody").innerHTML = "";
  }
  const d = await api("/api/db/rows", {
    symbol: state.symbol,
    from: $("rowsFrom").value,
    to: $("rowsTo").value,
    limit: $("rowsLimit").value,
    before: reset ? "" : state.nextBefore,
  });
  const batch = d.data || [];
  state.rows = state.rows.concat(batch);
  state.hasMore = !!d.has_more;
  state.nextBefore = d.next_before;

  $("rowsBody").insertAdjacentHTML("beforeend", batch.map((r) =>
    "<tr>" +
      "<td>" + esc(tsET(r.timestamp)) + "</td>" +
      '<td class="r">' + num(r.price) + "</td>" +
      '<td class="r ' + sign(r.change) + '">' + num(r.change) + "</td>" +
      '<td class="r ' + sign(r.change_percent) + '">' + num(r.change_percent, 3) + "%</td>" +
      '<td class="r">' + num(r.day_high) + "</td>" +
      '<td class="r">' + num(r.day_low) + "</td>" +
      '<td class="r">' + num(r.open) + "</td>" +
      '<td class="r">' + num(r.prev_close) + "</td>" +
      '<td class="r">' + (r.volume == null ? "–" : int(r.volume)) + "</td>" +
      '<td class="r muted">' + esc(r.id) + "</td>" +
    "</tr>").join(""));
  if (!state.rows.length) {
    $("rowsBody").innerHTML = '<tr><td colspan="10" class="empty">Sin registros para ' + esc(state.symbol) + " con esos filtros.</td></tr>";
  }
  $("rowsCount").textContent = int(state.rows.length) + " registros cargados" + (state.hasMore ? " · hay más" : " · fin");
  $("rowsMore").disabled = !state.hasMore;
  $("rowsCsv").disabled = !state.rows.length;
}

// ── Eventos ────────────────────────────────────────────────────────────────
function connect(url) {
  state.base = url.replace(/\/+$/, "");
  try { localStorage.setItem("dbExplorerWorker", state.base); } catch (_) { /* sin almacenamiento */ }
  $("workerUrl").value = state.base;
  state.rowsRead = 0;
  state.requests = 0;
  state.meterSeen = false;
  updateMeter();
  refreshActive();
}

function init() {
  let saved = null;
  try { saved = localStorage.getItem("dbExplorerWorker"); } catch (_) { /* sin almacenamiento */ }
  const fromQuery = new URLSearchParams(location.search).get("worker");
  state.base = (fromQuery || saved || DEFAULT_WORKER).replace(/\/+$/, "");
  $("workerUrl").value = state.base;

  $("symbolSelect").innerHTML = SYMBOLS.map((s) => '<option value="' + s + '">' + s + "</option>").join("");
  $("symbolSelect").value = state.symbol;
  $("symbolSelect").addEventListener("change", (e) => {
    state.symbol = e.target.value;
    refreshActive();
  });

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.tab)));
  $("workerForm").addEventListener("submit", (e) => { e.preventDefault(); connect($("workerUrl").value.trim()); });

  $("overviewBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-symbol]");
    if (!tr) return;
    state.symbol = tr.dataset.symbol;
    $("symbolSelect").value = state.symbol;
    selectTab("days");
  });

  $("daysApply").addEventListener("click", () => loadDays().catch(handleError));
  $("rowsApply").addEventListener("click", () => loadRows(true).catch(handleError));
  $("rowsMore").addEventListener("click", () => loadRows(false).catch(handleError));

  $("daysCsv").addEventListener("click", () => {
    download(state.symbol + "_dias.csv", toCsv(
      ["day", "open", "high", "low", "close", "registros", "primer_ts", "ultimo_ts"],
      state.days.map((r) => [r.day, r.open, r.high, r.low, r.close, r.n, r.first_ts, r.last_ts]),
    ));
  });
  $("rowsCsv").addEventListener("click", () => {
    download(state.symbol + "_registros.csv", toCsv(
      ["id", "symbol", "timestamp", "fecha_et", "price", "change", "change_percent", "volume", "day_high", "day_low", "open", "prev_close"],
      state.rows.map((r) => [r.id, r.symbol, r.timestamp, tsET(r.timestamp), r.price, r.change, r.change_percent, r.volume, r.day_high, r.day_low, r.open, r.prev_close]),
    ));
  });

  updateMeter();
  selectTab("overview");
}

document.addEventListener("DOMContentLoaded", init);
