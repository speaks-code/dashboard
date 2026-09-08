/* ============================================================
 *       OX ALPHA — Frontend client - Cloudflare Worker.
 * ============================================================ */


// Con frontend en GitHub Pages: pega aquí la URL de tu Worker.
const WORKER_URL = "https://ox-alpha-client.despachodigitalizacion.workers.dev";

const $chat    = document.getElementById("chat");
const $input   = document.getElementById("input");
const $btnSend = document.getElementById("btn-send");
const $dot     = document.getElementById("conn-dot");
const $connTxt = document.getElementById("conn-text");
const $statusModel = document.getElementById("status-model");

const STORAGE_KEY = "ox-alpha-conversation";

/* ---------- Estado ---------- */
let messages = loadConversation();
let busy = false;

/* ---------- API ---------- */
function api(path) {
  return `${WORKER_URL}${path}`;
}

async function checkHealth() {
  try {
    const res = await fetch(api("/api/health"));
    if (!res.ok) throw new Error();
    const data = await res.json();
    setConn(true, "Connected");
    if (data.model) $statusModel.textContent = `Model: ${data.model}`;
  } catch {
    setConn(false, "Disconnected");
  }
}

function setConn(ok, text) {
  $dot.className = "conn-dot " + (ok ? "ok" : "err");
  $connTxt.textContent = text;
}

async function sendToWorker(history) {
  const res = await fetch(api("/api/chat"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: getSelectedModel(),
      messages: history,
      stream: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Worker ${res.status}: ${err}`);
  }
  return res; // ReadableStream del SSE
}

/* ---------- Streaming SSE ---------- */
async function readStream(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop(); // último fragmento puede estar incompleto

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;

      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content ?? "";
        if (token) onToken(token);
      } catch { /* chunk parcial, se ignora */ }
    }
  }
}

/* ---------- UI ---------- */
function getSelectedModel() {
  return document.querySelector('input[name="model"]:checked')?.value
      || "stealth/ox-alpha";
}

function renderMessage(role, content) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = content;
  $chat.appendChild(div);
  scrollBottom();
  return div;
}

function renderEmpty() {
  $chat.innerHTML = `
    <div class="empty-state">
      <h1>OX ALPHA</h1>
      <p>Reasoning · Coding · Agentic work</p>
    </div>`;
}

function scrollBottom() {
  $chat.scrollTop = $chat.scrollHeight;
}

function renderAll() {
  $chat.innerHTML = "";
  if (messages.length === 0) { renderEmpty(); return; }
  for (const m of messages) renderMessage(m.role, m.content);
}

/* ---------- Flujo principal ---------- */
async function onSend() {
  const text = $input.value.trim();
  if (!text || busy) return;

  busy = true;
  $btnSend.disabled = true;
  $input.value = "";
  $input.style.height = "auto";

  messages.push({ role: "user", content: text });
  renderAll();
  saveConversation();

  const thinking = renderMessage("assistant loading", "Thinking…");

  try {
    const res = await sendToWorker(messages); // historial completo
    thinking.classList.remove("loading");
    thinking.textContent = "";

    let full = "";
    await readStream(res, (token) => {
      full += token;
      thinking.textContent = full;
      scrollBottom();
    });

    if (!full) full = "(empty response)";
    thinking.textContent = full;
    messages.push({ role: "assistant", content: full });
    saveConversation();
  } catch (err) {
    thinking.className = "msg error";
    thinking.textContent = `Error: ${err.message}`;
  } finally {
    busy = false;
    $btnSend.disabled = false;
    $input.focus();
  }
}

/* ---------- Persistencia ---------- */
function saveConversation() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch { /* storage lleno, se ignora */ }
}

function loadConversation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ---------- Eventos ---------- */
$btnSend.addEventListener("click", onSend);

$input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    onSend();
  }
});

$input.addEventListener("input", () => {
  $input.style.height = "auto";
  $input.style.height = Math.min($input.scrollHeight, 160) + "px";
});

document.getElementById("btn-new-chat").addEventListener("click", () => {
  messages = [];
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
  $input.focus();
});

document.getElementById("btn-clear").addEventListener("click", () => {
  messages = [];
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
});

/* ---------- Init ---------- */
renderAll();
checkHealth();
setInterval(checkHealth, 60_000);
