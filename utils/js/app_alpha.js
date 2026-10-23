/* ========== CONFIGURACIÓN ========== */
const RESEARCH_API =
  "https://app-alpha.despachodigitalizacion.workers.dev/research";

let turnstileToken = null;
let isLoading = false;

/* ========== TURNSTILE UI HELPERS ========== */

function hideTurnstile() {
  const zone = document.getElementById("turnstileContainer");
  if (!zone || zone.classList.contains("is-hidden")) return;

  zone.classList.add("is-leaving");
  setTimeout(() => {
    zone.classList.add("is-hidden");
    zone.classList.remove("is-leaving");
  }, 320);
}

function showTurnstile() {
  const zone = document.getElementById("turnstileContainer");
  if (!zone) return;

  zone.classList.remove("is-hidden", "is-leaving");
}

function setTurnstileStatus(message, type = "") {
  const el = document.getElementById("turnstile-status");
  if (!el) return;
  el.textContent = message || "";
  el.className = "turnstile-status" + (type ? " " + type : "");
}

/* ========== TURNSTILE CALLBACKS ========== */

function onTurnstileSuccess(token) {
  turnstileToken = token;

  setTurnstileStatus("Verificado ✓", "success");

  if (!isLoading) {
    updateStatus("ready", "Ready");
    document.getElementById("sendBtn").disabled = false;
  }

  // Brief success feedback, then hide the widget
  setTimeout(hideTurnstile, 550);
}

function onTurnstileExpired() {
  turnstileToken = null;

  setTurnstileStatus("Sesión expirada. Vuelve a verificar.", "error");
  updateStatus("error", "Verification expired");
  document.getElementById("sendBtn").disabled = true;
  showTurnstile();
}

function onTurnstileError() {
  turnstileToken = null;

  setTurnstileStatus("Error al cargar. Recarga la página.", "error");
  updateStatus("error", "Verification error");
  document.getElementById("sendBtn").disabled = true;
}

/* Reinicia el token después de cada intento (tokens de un solo uso) */
function resetTurnstile() {
  turnstileToken = null;
  document.getElementById("sendBtn").disabled = true;
  setTurnstileStatus("");

  // Mostrar de nuevo el widget y pedir un nuevo challenge
  showTurnstile();

  if (window.turnstile) {
    try {
      window.turnstile.reset();
    } catch (error) {
      console.error("No se pudo reiniciar Turnstile", error);
    }
  }
}

/* ========== ESTADO DE LA INTERFAZ ========== */

function updateStatus(type, text) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");

  if (!dot || !label) return;

  dot.className = "status-dot";

  if (type === "ready") dot.classList.add("ready");
  if (type === "loading") dot.classList.add("loading");

  label.textContent = text;
}

function toggleSources() {
  const box = document.getElementById("sourcesBox");
  if (!box) return;

  box.style.display =
    box.style.display === "block" ? "none" : "block";
}

function clearChat() {
  if (isLoading) return;

  const area = document.getElementById("chatArea");

  area.innerHTML = `
    <div class="welcome" id="welcome">
      <h1>APP ALPHA</h1>
      <p>Agente investigador · Reasoning · Coding · Agentic work<br>
      Proporciona una pregunta y, opcionalmente, material fuente.</p>
    </div>`;

  document.getElementById("questionInput").value = "";
  document.getElementById("sourcesInput").value = "";

  resetTurnstile();
  updateStatus("error", "Verification required");
}

/* ========== MENSAJES ========== */

function addMessage(role, content) {
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  const area = document.getElementById("chatArea");
  const div = document.createElement("div");

  div.className = `message ${role}`;
  div.textContent = String(content ?? "");

  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

/* ========== TECLADO ========== */

function handleKey(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendResearch();
  }
}

/* ========== INVESTIGACIÓN ========== */

async function sendResearch() {
  if (isLoading) return;

  const questionInput = document.getElementById("questionInput");
  const sourcesInput = document.getElementById("sourcesInput");
  const sendBtn = document.getElementById("sendBtn");

  const question = questionInput.value.trim();
  const sources = sourcesInput.value.trim();

  if (!question) {
    alert("Escribe una pregunta.");
    questionInput.focus();
    return;
  }

  if (question.length > 4000) {
    alert("La pregunta no puede superar los 4000 caracteres.");
    return;
  }

  if (sources.length > 12000) {
    alert("El material fuente no puede superar los 12000 caracteres.");
    return;
  }

  if (!turnstileToken) {
    alert("Completa la verificación de seguridad (Turnstile).");
    showTurnstile();
    return;
  }

  // Capturamos el token de este intento (es de un solo uso)
  const token = turnstileToken;

  isLoading = true;
  sendBtn.disabled = true;
  updateStatus("loading", "Researching…");

  addMessage(
    "user",
    question + (sources ? "\n\n[Material fuente incluido]" : "")
  );

  try {
    const response = await fetch(RESEARCH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question,
        sources,
        turnstileToken: token
      })
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        `El servidor devolvió una respuesta no válida (HTTP ${response.status}).`
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error || `Error del servidor (HTTP ${response.status}).`
      );
    }

    if (typeof data.answer !== "string") {
      throw new Error(
        "La respuesta del servidor no contiene una investigación válida."
      );
    }

    addMessage("assistant", data.answer);
    updateStatus("error", "Verification required");

  } catch (error) {
    console.error("Error en la investigación:", error);

    addMessage(
      "error",
      "No se pudo completar la investigación. " +
        (error instanceof Error ? error.message : "Error inesperado.")
    );

    updateStatus("error", "Verification required");

  } finally {
    // Los tokens son de un solo uso: se requiere uno nuevo.
    resetTurnstile();

    isLoading = false;
    questionInput.value = "";
    questionInput.style.height = "auto";
  }
}

/* ========== AJUSTE DEL ÁREA DE TEXTO ========== */

const textarea = document.getElementById("questionInput");

if (textarea) {
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height =
      Math.min(textarea.scrollHeight, 160) + "px";
  });
}
