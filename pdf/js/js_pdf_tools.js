// ─── Configuración PDF.js ───
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ─── Estado ───
let currentFile = null;
let pdfDocument = null;
let isProcessing = false;

// ─── Referencias DOM ───
const dropZone = document.getElementById("dropZone");
const pdfInput = document.getElementById("pdfInput");
const settingsCard = document.getElementById("settingsCard");
const fileInfo = document.getElementById("fileInfo");
const fileName = document.getElementById("fileName");
const fileSize = document.getElementById("fileSize");
const previewBtn = document.getElementById("previewBtn");
const processBtn = document.getElementById("processBtn");
const previewArea = document.getElementById("previewArea");
const progressContainer = document.getElementById("progressContainer");
const downloadArea = document.getElementById("downloadArea");
const logEl = document.getElementById("log");

// ─── Sliders ───
const sliders = {
  dpi: {
    el: document.getElementById("dpi"),
    val: document.getElementById("dpiVal"),
  },
  contrast: {
    el: document.getElementById("contrast"),
    val: document.getElementById("contrastVal"),
  },
  tolerance: {
    el: document.getElementById("tolerance"),
    val: document.getElementById("toleranceVal"),
  },
  minBright: {
    el: document.getElementById("minBright"),
    val: document.getElementById("minBrightVal"),
  },
};
Object.keys(sliders).forEach((key) => {
  sliders[key].el.addEventListener("input", () => {
    sliders[key].val.textContent = sliders[key].el.value;
  });
});

// ─── Helpers ───
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function log(msg) {
  const line = document.createElement("div");
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ─── Drag & Drop ───
dropZone.addEventListener("click", () => pdfInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});
dropZone.addEventListener("dragleave", () =>
  dropZone.classList.remove("dragover"),
);
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
pdfInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    alert("Por favor selecciona un archivo PDF");
    return;
  }
  currentFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.style.display = "block";
  settingsCard.style.opacity = "1";
  settingsCard.style.pointerEvents = "auto";
  previewArea.style.display = "none";
  downloadArea.style.display = "none";
  log(`Archivo cargado: ${file.name} (${formatBytes(file.size)})`);

  const arrayBuffer = await file.arrayBuffer();
  pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  log(`PDF cargado: ${pdfDocument.numPages} páginas`);
}

// ─── Detectar color de fondo ───
function detectBackground(ctx, width, height, margin = 20) {
  const sampleSize = 30;
  const samples = [
    ctx.getImageData(margin, margin, sampleSize, sampleSize).data,
    ctx.getImageData(
      width - margin - sampleSize,
      margin,
      sampleSize,
      sampleSize,
    ).data,
    ctx.getImageData(
      margin,
      height - margin - sampleSize,
      sampleSize,
      sampleSize,
    ).data,
    ctx.getImageData(
      width - margin - sampleSize,
      height - margin - sampleSize,
      sampleSize,
      sampleSize,
    ).data,
  ];

  let rSum = 0,
    gSum = 0,
    bSum = 0,
    count = 0;
  samples.forEach((data) => {
    for (let i = 0; i < data.length; i += 4) {
      rSum += data[i];
      gSum += data[i + 1];
      bSum += data[i + 2];
      count++;
    }
  });
  return [rSum / count, gSum / count, bSum / count];
}

// ─── Procesar canvas ───
function processCanvas(canvas, ctx, bgColor, contrast, tolerance, minBright) {
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const [bgR, bgG, bgB] = bgColor;
  const tolSq = tolerance * tolerance;
  const minB = minBright;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];

    const dR = r - bgR,
      dG = g - bgG,
      dB = b - bgB;
    const distSq = dR * dR + dG * dG + dB * dB;

    if (distSq < tolSq && r > minB && g > minB && b > minB) {
      data[i] = data[i + 1] = data[i + 2] = 255;
    } else {
      data[i] = Math.min(255, Math.max(0, 255 + (r - bgR) * contrast));
      data[i + 1] = Math.min(255, Math.max(0, 255 + (g - bgG) * contrast));
      data[i + 2] = Math.min(255, Math.max(0, 255 + (b - bgB) * contrast));
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ─── Renderizar página a canvas ───
async function renderPageToCanvas(pageNum, canvas, ctx, dpi) {
  const page = await pdfDocument.getPage(pageNum);
  const scale = dpi / 72;
  const viewport = page.getViewport({ scale });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return { width: viewport.width, height: viewport.height };
}

// ─── Vista previa ───
previewBtn.addEventListener("click", async () => {
  if (!pdfDocument) return;
  previewBtn.disabled = true;
  previewArea.style.display = "block";
  log("Generando vista previa...");

  const dpi = parseInt(sliders.dpi.el.value);
  const origCanvas = document.getElementById("originalCanvas");
  const procCanvas = document.getElementById("processedCanvas");
  const origCtx = origCanvas.getContext("2d");
  const procCtx = procCanvas.getContext("2d");

  await renderPageToCanvas(1, origCanvas, origCtx, dpi);

  procCanvas.width = origCanvas.width;
  procCanvas.height = origCanvas.height;
  procCtx.drawImage(origCanvas, 0, 0);

  const bgColor = detectBackground(
    procCtx,
    procCanvas.width,
    procCanvas.height,
  );
  log(
    `Fondo detectado: RGB(${Math.round(bgColor[0])}, ${Math.round(bgColor[1])}, ${Math.round(bgColor[2])})`,
  );

  processCanvas(
    procCanvas,
    procCtx,
    bgColor,
    parseFloat(sliders.contrast.el.value),
    parseInt(sliders.tolerance.el.value),
    parseInt(sliders.minBright.el.value),
  );

  log("Vista previa lista");
  previewBtn.disabled = false;
});

// ─── Procesar todas las páginas ───
processBtn.addEventListener("click", async () => {
  if (!pdfDocument || isProcessing) return;
  isProcessing = true;
  processBtn.disabled = true;
  previewBtn.disabled = true;
  progressContainer.style.display = "block";
  downloadArea.style.display = "none";
  logEl.innerHTML = "";
  log("Iniciando procesamiento...");

  const dpi = parseInt(sliders.dpi.el.value);
  const contrast = parseFloat(sliders.contrast.el.value);
  const tolerance = parseInt(sliders.tolerance.el.value);
  const minBright = parseInt(sliders.minBright.el.value);
  const totalPages = pdfDocument.numPages;

  const pdfDoc = await PDFLib.PDFDocument.create();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const startTime = Date.now();
  let bgColor = null;

  for (let i = 1; i <= totalPages; i++) {
    const dims = await renderPageToCanvas(i, canvas, ctx, dpi);

    if (!bgColor) {
      bgColor = detectBackground(ctx, dims.width, dims.height);
      log(
        `Fondo detectado: RGB(${Math.round(bgColor[0])}, ${Math.round(bgColor[1])}, ${Math.round(bgColor[2])})`,
      );
    }

    processCanvas(canvas, ctx, bgColor, contrast, tolerance, minBright);

    const jpegUrl = canvas.toDataURL("image/jpeg", 0.92);
    const jpegImage = await pdfDoc.embedJpg(jpegUrl);
    const newPage = pdfDoc.addPage([dims.width, dims.height]);
    newPage.drawImage(jpegImage, {
      x: 0,
      y: 0,
      width: dims.width,
      height: dims.height,
    });

    jpegImage.dispose && jpegImage.dispose();

    const elapsed = (Date.now() - startTime) / 1000;
    const perPage = elapsed / i;
    const remaining = perPage * (totalPages - i);
    const percent = Math.round((i / totalPages) * 100);

    document.getElementById("progressFill").style.width = percent + "%";
    document.getElementById("progressPercent").textContent = percent + "%";
    document.getElementById("progressStatus").textContent =
      `Procesando página ${i} de ${totalPages}`;
    document.getElementById("statPage").textContent = i;
    document.getElementById("statTime").textContent = formatTime(elapsed);
    document.getElementById("statETA").textContent = formatTime(remaining);

    if (i % 10 === 0 || i === 1) {
      log(
        `Página ${i}/${totalPages} procesada (${formatTime(elapsed)} transcurrido)`,
      );
    }

    if (i < totalPages) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  log("Generando archivo PDF...");
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const downloadLink = document.getElementById("downloadLink");
  const baseName = currentFile.name.replace(/\.pdf$/i, "");
  downloadLink.href = url;
  downloadLink.download = `${baseName}_limpio.pdf`;

  document.getElementById("downloadInfo").textContent =
    `${totalPages} páginas · ${formatBytes(blob.size)} · DPI ${dpi}`;

  downloadArea.style.display = "block";
  progressContainer.style.display = "none";
  log("¡Procesamiento completado!");

  isProcessing = false;
  processBtn.disabled = false;
  previewBtn.disabled = false;
});
