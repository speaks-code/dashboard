/* =============================================
   Fingerprint Inspector — script.js
   ============================================= */

const state = {
  data: {},
  rawJson: "",
};

/* ---------- Utilidades ---------- */

function el(id) { return document.getElementById(id); }

function showSection(id) {
  const section = el(id);
  if (section) section.classList.remove("hidden");
}

function setStatus(msg, type = "") {
  const s = el("status");
  s.textContent = msg;
  s.className = type;
}

function renderGrid(containerId, entries) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = "";

  for (const [key, value] of entries) {
    if (value === undefined || value === null || value === "") continue;

    const row = document.createElement("div");
    row.className = "data-row";

    const k = document.createElement("span");
    k.className = "data-key";
    k.textContent = key;

    const v = document.createElement("span");
    v.className = "data-value";
    if (typeof value === "string" && value.length > 80) {
      v.textContent = value.slice(0, 80) + "…";
      v.title = value;
    } else {
      v.textContent = String(value);
    }

    row.appendChild(k);
    row.appendChild(v);
    container.appendChild(row);
  }
}

/* ---------- 1. Red (Cloudflare Function) ---------- */

async function fetchNetworkData() {
  try {
    const res = await fetch("/api/info");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.data.network = json;

    const entries = Object.entries(json).map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return [k, JSON.stringify(v)];
      }
      return [k, v];
    });

    renderGrid("network-data", entries);
    showSection("network-section");
  } catch (err) {
    state.data.network = { error: err.message };
    renderGrid("network-data", [["Error", err.message]]);
    showSection("network-section");
  }
}

/* ---------- 2. Datos básicos del navegador ---------- */

function collectBasicData() {
  const nav = navigator;
  const scr = screen;

  const data = {
    userAgent: nav.userAgent,
    platform: nav.platform,
    vendor: nav.vendor,
    language: nav.language,
    languages: (nav.languages || []).join(", "),
    cookieEnabled: nav.cookieEnabled,
    doNotTrack: nav.doNotTrack || "no especificado",
    hardwareConcurrency: nav.hardwareConcurrency,
    deviceMemory: nav.deviceMemory,
    maxTouchPoints: nav.maxTouchPoints,
    screenResolution: `${scr.width}x${scr.height}`,
    availableResolution: `${scr.availWidth}x${scr.availHeight}`,
    colorDepth: scr.colorDepth,
    pixelDepth: scr.pixelDepth,
    devicePixelRatio: window.devicePixelRatio,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    webdriver: nav.webdriver,
    pdfViewerEnabled: nav.pdfViewerEnabled,
    plugins: Array.from(nav.plugins || []).map(p => p.name).join(", ") || "ninguno",
  };

  // Permissions API (algunas requieren consulta asíncrona)
  state.data.basic = data;
  renderGrid("basic-data", Object.entries(data));
  showSection("basic-section");
}

/* ---------- 3. Canvas Fingerprint ---------- */

function getCanvasFingerprint() {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 280;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");

    if (!ctx) return "Canvas no soportado";

    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Fingerprint 🤖🔥", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("Fingerprint 🤖🔥", 4, 17);

    // Gradiente
    const grad = ctx.createLinearGradient(0, 0, 280, 0);
    grad.addColorStop(0, "#ff0000");
    grad.addColorStop(0.5, "#00ff00");
    grad.addColorStop(1, "#0000ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 30, 280, 20);

    const dataUrl = canvas.toDataURL();

    // Hash simple
    let hash = 0;
    for (let i = 0; i < dataUrl.length; i++) {
      const char = dataUrl.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }

    return {
      hash: "0x" + (hash >>> 0).toString(16).padStart(8, "0"),
      length: dataUrl.length,
    };
  } catch (e) {
    return { error: e.message };
  }
}

function collectCanvasData() {
  const result = getCanvasFingerprint();
  state.data.canvas = result;

  if (typeof result === "object") {
    renderGrid("canvas-data", Object.entries(result));
  } else {
    renderGrid("canvas-data", [["Resultado", result]]);
  }
  showSection("canvas-section");
}

/* ---------- 4. WebGL / GPU ---------- */

function getWebGLInfo() {
  const result = {
    vendor: "no disponible",
    renderer: "no disponible",
    unmaskedVendor: "no disponible",
    unmaskedRenderer: "no disponible",
    version: "no disponible",
    shadingLanguageVersion: "no disponible",
    maxTextureSize: "no disponible",
    extensions: "no disponible",
  };

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    if (!gl) {
      result.error = "WebGL no soportado";
      return result;
    }

    result.vendor = gl.getParameter(gl.VENDOR) || "desconocido";
    result.renderer = gl.getParameter(gl.RENDERER) || "desconocido";
    result.version = gl.getParameter(gl.VERSION) || "desconocido";
    result.shadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || "desconocido";
    result.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

    // Extensión de debug (puede estar bloqueada por privacidad)
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      result.unmaskedVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || "no expuesto";
      result.unmaskedRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "no expuesto";
    }

    // Lista de extensiones
    const extList = gl.getSupportedExtensions();
    result.extensions = extList && extList.length
      ? extList.join(", ")
      : "ninguna";

  } catch (e) {
    result.error = e.message;
  }

  return result;
}

function collectWebGLData() {
  const info = getWebGLInfo();
  state.data.webgl = info;
  renderGrid("webgl-data", Object.entries(info));
  showSection("webgl-section");
}

/* ---------- 5. Audio Fingerprint ---------- */

function getAudioFingerprint() {
  return new Promise((resolve) => {
    try {
      const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!AudioCtx) {
        resolve({ error: "OfflineAudioContext no soportado" });
        return;
      }

      const ctx = new AudioCtx(1, 44100, 44100);
      const oscillator = ctx.createOscillator();
      oscillator.type = "triangle";
      oscillator.frequency.value = 10000;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -50;
      compressor.knee.value = 40;
      compressor.ratio.value = 12;
      compressor.attack.value = 0;
      compressor.release.value = 0.25;

      oscillator.connect(compressor);
      compressor.connect(ctx.destination);
      oscillator.start(0);
      oscillator.stop(0);

      ctx.startRendering().then((buffer) => {
        const data = buffer.getChannelData(0);
        let sum = 0;
        for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i]);

        const hash = "0x" + (sum * 1000 | 0).toString(16).padStart(8, "0");
        resolve({ hash, sampleSum: sum });
      }).catch((e) => {
        resolve({ error: e.message });
      });

    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function collectAudioData() {
  const info = await getAudioFingerprint();
  state.data.audio = info;

  if (typeof info === "object" && !info.error) {
    renderGrid("audio-data", Object.entries(info));
  } else {
    renderGrid("audio-data", [["Resultado", info.error || info.hash || "desconocido"]]);
  }
  showSection("audio-section");
}

/* ---------- 6. Detección de fuentes ---------- */

function detectFonts() {
  const baseFonts = ["monospace", "sans-serif", "serif"];
  const testFonts = [
    "Arial", "Arial Black", "Arial Narrow", "Calibri", "Cambria", "Candara",
    "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New",
    "DejaVu Sans", "DejaVu Serif", "Franklin Gothic Medium", "Futura",
    "Gabriola", "Geneva", "Georgia", "Gill Sans", "Helvetica", "Helvetica Neue",
    "Impact", "Lucida Console", "Lucida Sans Unicode", "Microsoft Sans Serif",
    "MingLiU", "Modern", "Monaco", "MS Gothic", "MS PGothic", "MS Sans Serif",
    "MS Serif", "Nimbus Mono L", "Nimbus Roman No9 L", "Nimbus Sans L",
    "Palatino Linotype", "Rockwell", "Roman", "Segoe Print", "Segoe Script",
    "Segoe UI", "SimSun", "Tahoma", "Times", "Times New Roman", "Trebuchet MS",
    "Ubuntu", "Verdana", "Webdings", "Wingdings", "Zapfino",
  ];

  const span = document.createElement("span");
  span.style.position = "absolute";
  span.style.left = "-9999px";
  span.style.fontSize = "72px";
  span.textContent = "mmmmmmmmmmlli";
  document.body.appendChild(span);

  const baseSizes = {};
  for (const base of baseFonts) {
    span.style.fontFamily = base;
    baseSizes[base] = span.offsetWidth;
  }

  const detected = [];
  for (const font of testFonts) {
    let found = false;
    for (const base of baseFonts) {
      span.style.fontFamily = `"${font}", ${base}`;
      if (span.offsetWidth !== baseSizes[base]) {
        found = true;
        break;
      }
    }
    if (found) detected.push(font);
  }

  document.body.removeChild(span);

  // Local Font Access API (si está disponible y el usuario da permiso)
  const data = { detected: detected.join(", ") || "ninguna" };

  if ("queryLocalFonts" in window) {
    data.apiAvailable = "sí (requiere permiso)";
  } else {
    data.apiAvailable = "no";
  }

  return data;
}

function collectFontsData() {
  const info = detectFonts();
  state.data.fonts = info;
  renderGrid("fonts-data", Object.entries(info));
  showSection("fonts-section");
}

/* ---------- 7. Compilar raw JSON y copiar ---------- */

function updateRawJson() {
  state.rawJson = JSON.stringify(state.data, null, 2);
  el("raw-json").textContent = state.rawJson;
  showSection("raw-section");
}

async function copyToClipboard() {
  try {
    await navigator.clipboard.writeText(state.rawJson);
    setStatus("JSON copiado al portapapeles.", "success");
  } catch {
    setStatus("No se pudo copiar (permiso denegado).", "error");
  }
}

/* ---------- Orquestador ---------- */

async function runScan() {
  const btn = el("scanBtn");
  const copyBtn = el("copyBtn");
  btn.disabled = true;
  copyBtn.disabled = true;
  setStatus("Recolectando información…", "loading");

  try {
    collectBasicData();
    collectCanvasData();
    collectWebGLData();
    collectFontsData();

    // Audio es asíncrono (OfflineAudioContext)
    await collectAudioData();

    // Red: requiere la Function de Cloudflare
    await fetchNetworkData();

    updateRawJson();

    copyBtn.disabled = false;
    setStatus("Análisis completado.", "success");
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  el("scanBtn").addEventListener("click", runScan);
  el("copyBtn").addEventListener("click", copyToClipboard);
});
