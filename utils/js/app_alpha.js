// ========== CONFIGURACIÓN ==========
const RESEARCH_API =
  "https://app-alpha.despachodigitalizacion.workers.dev/research";
// Reemplaza TU_SITE_KEY_AQUI en el HTML por tu Site Key de Turnstile

let turnstileToken = null;
let isLoading = false;

// ========== Turnstile callbacks ==========
function onTurnstileSuccess(token) {
  turnstileToken = token;
  updateStatus("ready", "Ready");
  document.getElementById("sendBtn").disabled = false;
}

function onTurnstileExpired() {
  turnstileToken = null;
  updateStatus("error", "Verification expired");
  document.getElementById("sendBtn").disabled = true;
}

// ========== UI helpers ==========
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
  box.style.display = box.style.display === "block" ? "none" : "block";
}

function clearChat() {
  const area = document.getElementById("chatArea");
  area.innerHTML = `
        <div class="welcome" id="welcome">
          <h1>OX ALPHA</h1>
          <p>Agente investigador · Reasoning · Coding · Agentic work<br>
             Proporciona una pregunta y, opcionalmente, material fuente.</p>
        </div>`;
  document.getElementById("questionInput").value = "";
  document.getElementById("sourcesInput").value = "";
}

function addMessage(role, content) {
  const welcome = document.getElementById("welcome");
  if (welcome) welcome.remove();

  const area = document.getElementById("chatArea");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = content;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendResearch();
  }
}

// ========== Función principal ==========
async function sendResearch() {
  if (isLoading) return;

  const question = document.getElementById("questionInput").value.trim();
  const sources = document.getElementById("sourcesInput").value.trim();

  if (!question) {
    alert("Escribe una pregunta");
    return;
  }
  if (!turnstileToken) {
    alert("Completa la verificación de seguridad (Turnstile)");
    return;
  }

  isLoading = true;
  document.getElementById("sendBtn").disabled = true;
  updateStatus("loading", "Researching…");

  addMessage(
    "user",
    question + (sources ? "\n\n[Material fuente incluido]" : ""),
  );

  try {
    const response = await fetch(RESEARCH_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        sources,
        turnstileToken,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Error de investigación");
    }

    addMessage("assistant", data.answer);
    updateStatus("ready", "Ready");

    // Reset Turnstile para la siguiente petición
    turnstileToken = null;
    if (window.turnstile) {
      window.turnstile.reset();
    }
    document.getElementById("sendBtn").disabled = true;
    updateStatus("error", "Verification required");
  } catch (err) {
    addMessage("error", "Error: " + err.message);
    updateStatus("error", "Error");
    document.getElementById("sendBtn").disabled = false;
  } finally {
    isLoading = false;
    document.getElementById("questionInput").value = "";
  }
}
const textarea = document.getElementById("questionInput");
textarea.addEventListener("input", () => {
  textarea.style.height = "auto";
  textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
});
