// Turnstile callbacks – hide the widget once verification succeeds
function onTurnstileSuccess(token) {
  const container = document.getElementById("turnstileContainer");
  const status = document.getElementById("turnstile-status");
  if (status) status.textContent = "";
  if (container) {
    container.classList.add("hidden");
  }
  // Enable send button if your app_alpha.js expects it
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = false;
  // Store token if needed by the rest of the app
  window.turnstileToken = token;
}

function onTurnstileExpired() {
  const container = document.getElementById("turnstileContainer");
  const status = document.getElementById("turnstile-status");
  if (container) container.classList.remove("hidden");
  if (status)
    status.textContent =
      "Verificación expirada. Vuelve a completar el captcha.";
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;
  window.turnstileToken = null;
}

function onTurnstileError() {
  const status = document.getElementById("turnstile-status");
  if (status)
    status.textContent = "Error al cargar Turnstile. Recarga la página.";
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) sendBtn.disabled = true;
}
