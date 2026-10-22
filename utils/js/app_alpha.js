
/* ========== CONFIGURACIÓN ========== */
const RESEARCH_API =
  "https://app-alpha.despachodigitalizacion.workers.dev/research";

let turnstileToken = null;
let isLoading = false;

/* ========== TURNSTILE ========== */

function onTurnstileSuccess(token) {
  turnstileToken = token;

  if (!isLoading) {
    updateStatus("ready", "Ready");
    document.getElementById("sendBtn").disabled = false;
  }
}

function onTurnstileExpired() {
  turnstileToken = null;

  updateStatus("error", "Verification expired");
  document.getElementById("sendBtn").disabled = true;
}

function onTurnstileError() {
  turnstileToken = null;

  updateStatus("error", "Verification error");
  document.getElementById("sendBtn").disabled = true;
}

/* Reinicia el token después de cada intento */
function resetTurnstile() {
  turnstileToken = null;
  document.getElementById("sendBtn").disabled = true;

  if (window.turnstile) {
    try {
      window.turnstile.reset();
    } catch (error) {
      console.error("No se pudo reiniciar Turnstile");
    }
  }
}

/* ========== ESTADO DE LA INTERFAZ ========== */

function updateStatus(type, text) {
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusText");

  dot.className = "status-dot";

  if (type === "ready") dot.classList.add("ready");
  if (type === "loading") dot.classList.add("loading");

  label.textContent = text;
}

function toggleSources() {
  const box = document.getElementById("sourcesBox");

  box.style.display =
    box.style.display === "block" ? "none" : "block";
}

function clearChat() {
  if (isLoading) return;

  const area = document.getElementById("chatArea");

  area.innerHTML = `
    <div class="welcome" id="welcome">
      <h1>OX ALPHA</h1>
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
    return;
  }

  // Capturamos el token de este intento.
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
      throw new Error("La respuesta del servidor no contiene una investigación válida.");
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

textarea.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height =
    Math.min(textarea.scrollHeight, 160) + "px";
});
