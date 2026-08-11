const PROXY = "https://dashboard.despachodigitalizacion.workers.dev";
const SYMBOLS = ["AAPL","MSFT","NVDA","AMZN","GOOGL","META","TSLA","AVGO","COST","NFLX","AMD","PLTR","MU","CSCO","INTC"];
let stockData = [];
let currentSymbol = "AAPL";
let currentTimeframe = "1M";
let chartInstance = null;

function $(id) { return document.getElementById(id); }

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

function fmtM(n) {
  if (!n && n !== 0) return "-";
  if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  return n.toLocaleString();
}

function formatDateNasdaq() {
  const now = new Date();
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const month = months[now.getMonth()];
  const day = now.getDate();
  const year = now.getFullYear();
  let hours = now.getHours();
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `Data as of ${month} ${day}, ${year} ${hours}:${minutes} ${ampm} ET`;
}

async function fetchAPI(path) {
  const res = await fetch(PROXY + path);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
  if (!res.ok) throw new Error(data.error || data.detail || ("HTTP " + res.status));
  return data;
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadAll() {
  clearAlert();
  const btn = $("refreshBtn"), spin = $("btnSpin"), txt = $("btnText");
  if (btn) btn.disabled = true;
  if (spin) spin.style.display = "inline-block";
  if (txt) txt.textContent = "Cargando...";

  $("pageDate").textContent = formatDateNasdaq();

  try {
    const batch = await fetchAPI("/api/batch");
    stockData = (batch.data || []).map(r => ({
      symbol: r.symbol,
      name: r.symbol,
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
      fiftyTwoWeekHigh: 0
    }));

    renderGrid();
    updateStats();

    if (!stockData.find(s => s.symbol === currentSymbol)) {
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

function renderGrid() {
  const rows = [$("gridRow1"), $("gridRow2"), $("gridRow3")];
  rows.forEach(r => { if (r) r.innerHTML = ""; });

  stockData.forEach((s, idx) => {
    const rowIdx = Math.floor(idx / 5);
    const row = rows[rowIdx];
    if (!row) return;

    const card = document.createElement("div");
    card.className = "stock-card" + (s.symbol === currentSymbol ? " selected" : "");
    card.onclick = () => selectSymbol(s.symbol);

    const cls = s.changePercent >= 0 ? "up" : "down";
    const sign = s.changePercent >= 0 ? "+" : "";
    const arrow = s.changePercent >= 0 ? "▲" : "▼";

    card.innerHTML = `
      <div class="stock-top-row">
        <div class="stock-symbol">${s.symbol}</div>
        <div class="stock-price">$${s.price.toFixed(2)}</div>
      </div>
      <div class="stock-name">${s.name}</div>
      <div class="stock-change ${cls}">
        <span>${arrow}</span> ${sign}${s.change.toFixed(2)} (${sign}${s.changePercent.toFixed(2)}%)
      </div>
    `;
    row.appendChild(card);
  });
}

function selectSymbol(sym) {
  currentSymbol = sym;
  document.querySelectorAll(".stock-card").forEach(c => c.classList.remove("selected"));
  const cards = document.querySelectorAll(".stock-card");
  cards.forEach(c => {
    if (c.querySelector(".stock-symbol")?.textContent === sym) {
      c.classList.add("selected");
    }
  });
  loadChart(sym, currentTimeframe);
}

function updateStats() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  const loaded = stockData.filter(s => s.price > 0).length;
  const gainers = stockData.filter(s => s.changePercent > 0).length;
  const losers = stockData.filter(s => s.changePercent < 0).length;
  const flat = stockData.filter(s => s.changePercent === 0 && s.price > 0).length;

  $("statStatus").textContent = loaded === SYMBOLS.length ? "Conectado" : "Parcial";
  $("statStatusSub").textContent = loaded === SYMBOLS.length ? "D1 + Finnhub" : (SYMBOLS.length - loaded) + " sin datos";
  $("statStatusSub").className = "stat-sub" + (loaded < SYMBOLS.length ? " down" : "");

  $("statCount").textContent = loaded + "/" + SYMBOLS.length;

  $("statGainers").textContent = gainers + " / " + losers;
  $("statTrend").textContent = gainers > losers ? "Sesión alcista" : (losers > gainers ? "Sesión bajista" : "Sesión mixta");
  $("statTrend").className = "stat-sub " + (gainers > losers ? "up" : (losers > gainers ? "down" : ""));

  $("statDate").textContent = dateStr;
  $("statTime").textContent = timeStr;
}

async function loadDetailsInBackground() {
  for (let i = 0; i < stockData.length; i++) {
    const s = stockData[i];
    try {
      const [profile, metric] = await Promise.all([
        fetchAPI("/api/profile?symbol=" + encodeURIComponent(s.symbol)),
        fetchAPI("/api/metric?symbol=" + encodeURIComponent(s.symbol))
      ]);
      s.name = profile.name || s.symbol;
      s.marketCap = profile.marketCapitalization ? profile.marketCapitalization * 1e6 : 0;
      const m = metric.metric || {};
      s.volume = m.volume || s.volume;
      s.pe = m.peTTM || m.peExclExtraTTM || null;
      s.fiftyTwoWeekLow = m["52WeekLow"] || 0;
      s.fiftyTwoWeekHigh = m["52WeekHigh"] || 0;
      renderGrid();
      if (s.symbol === currentSymbol) updateChartHeader(s);
      await wait(800);
    } catch (e) {
      console.warn("Detalle falló para", s.symbol);
    }
  }
}

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

// ── GRÁFICO CORREGIDO ───────────────────────────────────────────────────────
async function loadChart(symbol, timeframe) {
  currentSymbol = symbol;
  currentTimeframe = timeframe;

  document.querySelectorAll(".tf-btn").forEach(b => {
    b.classList.toggle("active", b.textContent === timeframe);
  });

  const s = stockData.find(x => x.symbol === symbol);
  if (s) updateChartHeader(s);

  try {
    const hist = await fetchAPI("/api/history?symbol=" + encodeURIComponent(symbol) + "&period=" + timeframe);
    let points = hist.data || [];

    if (points.length === 0) {
      if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
      return;
    }

    // Detectar si todos los puntos son del mismo día
    const firstDate = new Date(points[0].timestamp * 1000).toDateString();
    const allSameDay = points.every(p => new Date(p.timestamp * 1000).toDateString() === firstDate);

    const labels = points.map(p => {
      const d = new Date(p.timestamp * 1000);
      if (timeframe === '1D' || allSameDay) {
        return d.toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit'});
      }
      return d.toLocaleDateString('es-ES', {day:'numeric', month:'short'});
    });

    const prices = points.map(p => p.price);
    const last = points[points.length - 1];
    const first = points[0];
    const change = last.price - first.price;

    const canvas = $("mainChart");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const color = change >= 0 ? "#1a7f37" : "#cf222e";
    const bgGradient = ctx.createLinearGradient(0, 0, 0, 320);
    bgGradient.addColorStop(0, change >= 0 ? "rgba(26,127,55,0.12)" : "rgba(207,34,46,0.12)");
    bgGradient.addColorStop(1, "rgba(255,255,255,0)");

    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: symbol,
          data: prices,
          borderColor: color,
          backgroundColor: bgGradient,
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: points.length < 10 ? 3 : 0,
          pointHoverRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(13,17,23,0.9)',
            titleColor: '#e6edf3',
            bodyColor: '#e6edf3',
            borderColor: '#30363d',
            borderWidth: 1,
            callbacks: {
              label: function(context) {
                return symbol + ': $' + context.parsed.y.toFixed(2);
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(225,228,232,0.6)', drawBorder: false },
            ticks: { color: '#5f6b7a', maxTicksLimit: 8 }
          },
          y: {
            grid: { color: 'rgba(225,228,232,0.6)', drawBorder: false },
            ticks: {
              color: '#5f6b7a',
              // ── CORREGIDO: 2 decimales en vez de enteros ─────────────
              callback: function(value) { return '$' + value.toFixed(2); },
              // Forzar al menos 5 ticks para que no se amontonen
              maxTicksLimit: 6
            }
          }
        }
      }
    });

  } catch (e) {
    console.error("Error cargando gráfico", e);
  }
}

function setTimeframe(tf) {
  currentTimeframe = tf;
  loadChart(currentSymbol, tf);
}

// Inicializar
document.addEventListener("DOMContentLoaded", () => {
  loadAll();
});
