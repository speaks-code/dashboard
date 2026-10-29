/* =====================================================
   NASDAQ Dashboard v2
   - Tema claro/oscuro persistente + gráfico adaptado
   - Nombres de empresas estáticos (sin parpadeo)
   - Hora real del Este de EE.UU. (America/New_York)
   - Actualización de tarjetas sin re-render completo
   ===================================================== */

const PROXY = "https://dashboard.despachodigitalizacion.workers.dev";
const SYMBOLS = [
  "AAPL",
  "MSFT",
  "NVDA",
  "AMZN",
  "GOOGL",
  "META",
  "TSLA",
  "AVGO",
  "COST",
  "NFLX",
  "AMD",
  "PLTR",
  "MU",
  "CSCO",
  "INTC",
];

// Nombres oficiales: nunca cambian, se muestran al instante
const NAMES = {
  AAPL: "Apple Inc.",
  MSFT: "Microsoft Corp.",
  NVDA: "NVIDIA Corp.",
  AMZN: "Amazon.com Inc.",
  GOOGL: "Alphabet Inc.",
  META: "Meta Platforms Inc.",
  TSLA: "Tesla Inc.",
  AVGO: "Broadcom Inc.",
  COST: "Costco Wholesale Corp.",
  NFLX: "Netflix Inc.",
  AMD: "Advanced Micro Devices",
  PLTR: "Palantir Technologies",
  MU: "Micron Technology",
  CSCO: "Cisco Systems Inc.",
  INTC: "Intel Corp.",
};

const THEME_KEY = "nasdaq-theme";

let stockData = [];
let currentSymbol = "AAPL";
let currentTimeframe = "1M";
let chartInstance = null;
let lastSeries = null; // datos del último gráfico, para re-render sin refetch
const cards = new Map();

function $(id) {
  return document.getElementById(id);
}

/* ---------- Tema ---------- */

function themeColors() {
  const dark = document.documentElement.dataset.theme === "dark";
  return {
    grid: dark ? "rgba(48, 54, 61, 0.55)" : "rgba(208, 215, 222, 0.55)",
    tick: dark ? "#9198a1" : "#59636e",
    tooltipBg: dark ? "rgba(22, 27, 34, 0.95)" : "rgba(31, 35, 40, 0.92)",
    tooltipBorder: dark ? "#30363d" : "#d0d7de",
    transparent: "rgba(0, 0, 0, 0)",
  };
}

function applyTheme(theme, save) {
  document.documentElement.dataset.theme = theme;
  const toggle = $("themeToggle");
  if (toggle) toggle.setAttribute("aria-checked", String(theme === "dark"));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute("content", theme === "dark" ? "#0d1117" : "#f6f8fa");
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }
  // Redibuja el gráfico con los colores del tema, sin volver a pedir datos ni animar
  if (lastSeries) buildChart(false);
}

function initTheme() {
  const toggle = $("themeToggle");
  if (!toggle) return;
  toggle.setAttribute(
    "aria-checked",
    String(document.documentElement.dataset.theme === "dark"),
  );
  toggle.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
  });
}

/* ---------- Utilidades ---------- */

function showAlert(msg, type) {
  const b = $("alertBox");
  if (!b) return;
  b.textContent = msg;
  b.className = "alert " + (type || "danger");
}

function clearAlert() {
  const b = $("alertBox");
  if (b) b.className = "alert";
}

// Fecha y hora reales de la costa Este de EE.UU.
function etDateParts() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("es-ES", {
    timeZone: "America/New_York",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
  const timeStr = new Intl.DateTimeFormat("es-ES", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return { dateStr, timeStr };
}

async function fetchAPI(path) {
  const res = await fetch(PROXY + path);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok)
    throw new Error(data.error || data.detail || "HTTP " + res.status);
  return data;
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* ---------- Carga de datos ---------- */

async function loadAll() {
  clearAlert();
  const btn = $("refreshBtn"),
    spin = $("btnSpin"),
    txt = $("btnText");
  if (btn) btn.disabled = true;
  if (spin) spin.style.display = "inline-block";
  if (txt) txt.textContent = "Cargando...";

  const et = etDateParts();
  $("pageDate").textContent =
    "Datos al " + et.dateStr + " · " + et.timeStr + " ET";

  try {
    const batch = await fetchAPI("/api/batch");
    stockData = (batch.data || []).map((r) => ({
      symbol: r.symbol.trim(),
      name: NAMES[r.symbol.trim()] || r.symbol.trim(),
      price: r.price || 0,
      change: r.change || 0,
      changePercent: r.change_percent || 0,
      volume: r.volume || 0,
      marketCap: 0,
      pe: null,
      dayLow: r.day_low || 0,
      dayHigh: r.day_high || 0,
      open: r.open || 0,
      prevClose: r.prev_close || 0,
      fiftyTwoWeekLow: 0,
      fiftyTwoWeekHigh: 0,
    }));

    renderGrid();
    updateStats();

    if (!stockData.find((s) => s.symbol === currentSymbol)) {
      currentSymbol = stockData[0]?.symbol || "AAPL";
    }
    await loadChart(currentSymbol, currentTimeframe);
    loadDetailsInBackground();
  } catch (e) {
    showAlert("Error cargando datos: " + e.message, "danger");
    console.error(e);
  }

  if (btn) btn.disabled = false;
  if (spin) spin.style.display = "none";
  if (txt) txt.textContent = "Actualizar";
}

/* ---------- Grilla de acciones ---------- */

function cardHTML(s) {
  const cls = s.changePercent >= 0 ? "up" : "down";
  const sign = s.changePercent >= 0 ? "+" : "";
  const arrow = s.changePercent >= 0 ? "▲" : "▼";
  return `
    <div class="stock-top-row">
      <div class="stock-symbol">${s.symbol}</div>
      <div class="stock-price">$${s.price.toFixed(2)}</div>
    </div>
    <div class="stock-name">${s.name}</div>
    <div class="stock-change ${cls}">${arrow} ${sign}${s.change.toFixed(2)} (${sign}${s.changePercent.toFixed(2)}%)</div>
  `;
}

// Crea o actualiza UNA tarjeta: sin parpadeos ni re-render completo
function renderCard(s) {
  const grid = $("stockGrid");
  if (!grid) return;
  let card = cards.get(s.symbol);
  if (!card) {
    card = document.createElement("div");
    card.className = "stock-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.addEventListener("click", () => selectSymbol(s.symbol));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectSymbol(s.symbol);
      }
    });
    grid.appendChild(card);
    cards.set(s.symbol, card);
  }
  card.className =
    "stock-card" + (s.symbol === currentSymbol ? " selected" : "");
  card.setAttribute("aria-pressed", String(s.symbol === currentSymbol));
  card.setAttribute(
    "aria-label",
    s.symbol + " " + s.name + " $" + s.price.toFixed(2),
  );
  card.innerHTML = cardHTML(s);
}

function renderGrid() {
  stockData.forEach(renderCard);
}

function selectSymbol(sym) {
  currentSymbol = sym;
  cards.forEach((card, symbol) => {
    const selected = symbol === sym;
    card.classList.toggle("selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  loadChart(sym, currentTimeframe);
}

/* ---------- Stats ---------- */

function updateStats() {
  const et = etDateParts();

  const loaded = stockData.filter((s) => s.price > 0).length;
  const gainers = stockData.filter((s) => s.changePercent > 0).length;
  const losers = stockData.filter((s) => s.changePercent < 0).length;

  $("statStatus").textContent =
    loaded === SYMBOLS.length ? "Conectado" : "Parcial";
  $("statStatusSub").textContent =
    loaded === SYMBOLS.length
      ? "D1 + Finnhub"
      : SYMBOLS.length - loaded + " sin datos";
  $("statStatusSub").className =
    "stat-sub " + (loaded < SYMBOLS.length ? "down" : "");
  $("statCount").textContent = loaded + "/" + SYMBOLS.length;
  $("statGainers").textContent = gainers + " / " + losers;
  $("statTrend").textContent =
    gainers > losers
      ? "Sesión alcista"
      : losers > gainers
        ? "Sesión bajista"
        : "Sesión mixta";
  $("statTrend").className =
    "stat-sub " + (gainers > losers ? "up" : losers > gainers ? "down" : "");
  $("statDate").textContent = et.dateStr
    .replace(" de ", " ")
    .replace(" de ", "");
  $("statTime").textContent = et.timeStr + " ET";
}

/* ---------- Detalles en segundo plano ---------- */

async function loadDetailsInBackground() {
  for (let i = 0; i < stockData.length; i++) {
    const s = stockData[i];
    try {
      const [profile, metric] = await Promise.all([
        fetchAPI("/api/profile?symbol=" + encodeURIComponent(s.symbol)),
        fetchAPI("/api/metric?symbol=" + encodeURIComponent(s.symbol)),
      ]);
      // Solo actualiza campos si la API trae datos reales; el nombre estático es la base
      if (profile.name && profile.name !== s.symbol) s.name = profile.name;
      s.marketCap = profile.marketCapitalization
        ? profile.marketCapitalization * 1e6
        : 0;
      const m = metric.metric || {};
      s.volume = m.volume || s.volume;
      s.pe = m.peTTM || m.peExclExtraTTM || null;
      s.fiftyTwoWeekLow = m["52WeekLow"] || 0;
      s.fiftyTwoWeekHigh = m["52WeekHigh"] || 0;

      renderCard(s); // actualiza solo esta tarjeta
      if (s.symbol === currentSymbol) updateChartHeader(s);
      await wait(800);
    } catch (e) {
      console.warn("Detalle falló para", s.symbol);
    }
  }
}

/* ---------- Header del gráfico ---------- */

function updateChartHeader(s) {
  $("chartSymbol").textContent = s.symbol;
  $("chartName").textContent = s.name;
  $("chartPrice").textContent = "$" + s.price.toFixed(2);
  const cls = s.changePercent >= 0 ? "up" : "down";
  const sign = s.changePercent >= 0 ? "+" : "";
  const arrow = s.changePercent >= 0 ? "▲" : "▼";
  const chg = $("chartChange");
  chg.textContent = `${arrow} ${sign}${s.change.toFixed(2)} (${sign}${s.changePercent.toFixed(2)}%)`;
  chg.className = "chart-change " + cls;
}

/* ---------- Rendimiento del período ---------- */

function updatePeriodPerformance(symbol, timeframe, change, percentChange) {
  const container = $("rendimiento");
  if (!container) return;
  const isPositive = percentChange >= 0;
  const sign = isPositive ? "+" : "";
  const arrow = isPositive ? "▲" : "▼";
  const periodLabels = {
    "1D": "1 día",
    "1W": "1 semana",
    "1M": "1 mes",
    "3M": "3 meses",
    "6M": "6 meses",
    "1Y": "1 año",
    MAX: "máximo histórico",
  };
  const label = periodLabels[timeframe] || timeframe;

  container.innerHTML = `
    <div class="rend-inner">
      <span class="rend-title">Rendimiento</span>
      <span class="rend-symbol">${symbol} · ${label}</span>
      <span class="rend-value ${isPositive ? "up" : "down"}">${sign}${percentChange.toFixed(2)}% ${arrow} ${sign}$${Math.abs(change).toFixed(2)}</span>
    </div>`;
}

/* ---------- Gráfico ---------- */

function buildChart(animate) {
  if (!lastSeries) return;
  const { labels, prices, symbol, change } = lastSeries;
  const canvas = $("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const tc = themeColors();

  const color = change >= 0 ? "rgba(26, 127, 55, 1)" : "rgba(207, 34, 46, 1)";
  const lineColor =
    document.documentElement.dataset.theme === "dark"
      ? change >= 0
        ? "#3fb950"
        : "#f85149"
      : color;

  const bgGradient = ctx.createLinearGradient(0, 0, 0, 320);
  bgGradient.addColorStop(
    0,
    change >= 0
      ? document.documentElement.dataset.theme === "dark"
        ? "rgba(63, 185, 80, 0.18)"
        : "rgba(26, 127, 55, 0.12)"
      : document.documentElement.dataset.theme === "dark"
        ? "rgba(248, 81, 73, 0.18)"
        : "rgba(207, 34, 46, 0.12)",
  );
  bgGradient.addColorStop(1, tc.transparent);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: symbol,
          data: prices,
          borderColor: lineColor,
          backgroundColor: bgGradient,
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: prices.length < 50 ? 2 : 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: lineColor,
          pointHoverBorderColor: tc.tooltipBg,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation:
        animate === false ? false : { duration: 900, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tc.tooltipBg,
          titleColor: "#e6edf3",
          bodyColor: "#e6edf3",
          borderColor: tc.tooltipBorder,
          borderWidth: 1,
          titleFont: { family: "'IBM Plex Mono', monospace" },
          bodyFont: { family: "'IBM Plex Mono', monospace" },
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: function (context) {
              return symbol + ": $" + context.parsed.y.toFixed(2);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: tc.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: tc.tick,
            maxTicksLimit: window.innerWidth < 768 ? 5 : 8,
            maxRotation: 0,
            autoSkip: true,
            font: { family: "'IBM Plex Mono', monospace", size: 10.5 },
          },
        },
        y: {
          position: "right",
          grid: { color: tc.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: tc.tick,
            callback: function (value) {
              return "$" + value.toFixed(2);
            },
            maxTicksLimit: 6,
            font: { family: "'IBM Plex Mono', monospace", size: 10.5 },
          },
        },
      },
    },
  });
}

async function loadChart(symbol, timeframe) {
  currentSymbol = symbol;
  currentTimeframe = timeframe;
  document.querySelectorAll(".tf-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tf === timeframe);
  });

  const s = stockData.find((x) => x.symbol === symbol);
  if (s) updateChartHeader(s);

  try {
    const hist = await fetchAPI(
      "/api/history?symbol=" +
        encodeURIComponent(symbol) +
        "&period=" +
        timeframe,
    );
    const points = hist.data || [];

    if (points.length === 0) {
      lastSeries = null;
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      const container = $("rendimiento");
      if (container)
        container.innerHTML =
          '<p class="rend-msg">Sin datos históricos para este período.</p>';
      return;
    }

    const labels = points.map((p) => {
      const d = new Date(p.timestamp * 1000);
      const firstDate = new Date(points[0].timestamp * 1000).toDateString();
      const allSameDay = points.every(
        (p) => new Date(p.timestamp * 1000).toDateString() === firstDate,
      );
      if (timeframe === "1D" || allSameDay) {
        return d.toLocaleTimeString("es-ES", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    });

    const prices = points.map((p) => p.price);
    const change = prices[prices.length - 1] - prices[0];
    const percentChange = (change / prices[0]) * 100;

    lastSeries = { labels, prices, symbol, change };
    updatePeriodPerformance(symbol, timeframe, change, percentChange);
    buildChart();
  } catch (e) {
    console.error("Error cargando gráfico", e);
    const container = $("rendimiento");
    if (container)
      container.innerHTML =
        '<p class="rend-msg">Error al cargar el rendimiento.</p>';
  }
}

function setTimeframe(tf) {
  if (tf === currentTimeframe && chartInstance) return;
  loadChart(currentSymbol, tf);
}

/* ---------- Inicio ---------- */

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  document.querySelectorAll(".tf-btn").forEach((b) => {
    b.addEventListener("click", () => setTimeframe(b.dataset.tf));
  });
  const refresh = $("refreshBtn");
  if (refresh) refresh.addEventListener("click", loadAll);
  // Si el usuario cambia el tema del sistema y no ha elegido uno manual, lo seguimos
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      let saved = null;
      try {
        saved = localStorage.getItem(THEME_KEY);
      } catch (err) {}
      if (saved !== "light" && saved !== "dark") {
        applyTheme(e.matches ? "dark" : "light", false);
      }
    });
  loadAll();
});
