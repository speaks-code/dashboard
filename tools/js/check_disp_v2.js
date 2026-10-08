(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const nf = new Intl.NumberFormat("es-ES");

  const entrada = $("#entrada"),
    pasoInput = $("#paso"),
    contador = $("#contador"),
    err = $("#err"),
    cinta = $("#cinta"),
    tooltip = $("#tooltip"),
    toast = $("#toast"),
    sello = $("#sello");

  const MAX_CELDAS = 8000; // límite de celdas dibujadas en el mapa
  const MAX_ESPERADOS = 200000; // límite del rango analizable
  const MAX_CHIPS = 5000; // límite de chips en la vista detallada

  let ultimo = null; // resultado del último análisis
  let compacto = true; // modo de vista de faltantes
  let esEjemplo = false;
  let toastTimer = null;

  /* ---------- Utilidades ---------- */

  function mostrarToast(msg) {
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  function copiar(texto, aviso) {
    const hecho = () => mostrarToast(aviso || "« " + texto + " » copiado");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(texto)
        .then(hecho)
        .catch(() => copiarFallback(texto, hecho));
    } else {
      copiarFallback(texto, hecho);
    }
  }
  function copiarFallback(texto, hecho) {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      hecho();
    } catch (e) {
      mostrarToast("No se pudo copiar");
    }
    ta.remove();
  }

  // Anima un valor numérico tipo odómetro
  function animar(el, hasta, sufijo) {
    sufijo = sufijo || "";
    const desde = parseFloat(el.dataset.v || "0") || 0;
    el.dataset.v = hasta;
    if (desde === hasta) {
      el.textContent = nf.format(hasta) + sufijo;
      return;
    }
    const dur = 650,
      t0 = performance.now();
    (function tic(t) {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
      el.textContent =
        nf.format(Math.round(desde + (hasta - desde) * e)) + sufijo;
      if (k < 1) requestAnimationFrame(tic);
    })(t0);
  }

  // Agrupa una lista ordenada en rangos consecutivos según el paso
  function compactarRangos(arr, paso) {
    const res = [];
    let i = 0;
    while (i < arr.length) {
      let j = i;
      while (j + 1 < arr.length && arr[j + 1] - arr[j] === paso) j++;
      res.push(j === i ? { a: arr[i], b: arr[i] } : { a: arr[i], b: arr[j] });
      i = j + 1;
    }
    return res;
  }

  /* ---------- Análisis ---------- */

  function analizar() {
    err.hidden = true;
    entrada.classList.remove("error");

    const nums = (entrada.value.match(/-?\d+/g) || []).map(Number);
    if (nums.length < 2) {
      fallar("Introduce al menos dos números para poder auditar la serie.");
      return;
    }

    let paso = parseInt(pasoInput.value, 10);
    if (!Number.isFinite(paso) || paso < 1) paso = 1;

    const conteo = new Map();
    for (const n of nums) conteo.set(n, (conteo.get(n) || 0) + 1);

    const unicos = [...conteo.keys()].sort((a, b) => a - b);
    const min = unicos[0],
      max = unicos[unicos.length - 1];
    const esperados = Math.floor((max - min) / paso) + 1;

    if (esperados > MAX_ESPERADOS) {
      fallar(
        "El rango analizado (" +
          nf.format(esperados) +
          " posiciones) es demasiado grande. Límite: " +
          nf.format(MAX_ESPERADOS) +
          ".",
      );
      return;
    }

    const faltantes = [];
    for (let v = min; v <= max; v += paso) {
      if (!conteo.has(v)) faltantes.push(v);
    }

    const duplicados = [...conteo.entries()]
      .filter(([, c]) => c > 1)
      .sort((a, b) => b[1] - a[1]);
    const pct = esperados
      ? ((esperados - faltantes.length) / esperados) * 100
      : 0;

    ultimo = {
      min,
      max,
      paso,
      esperados,
      recibidos: nums.length,
      unicos: unicos.length,
      duplicados,
      faltantes,
      rangos: compactarRangos(faltantes, paso),
      pct,
      _set: new Set(unicos), // ← añadir esta línea
    };

    pintar();
  }

  function fallar(msg) {
    err.textContent = "⚠ " + msg;
    err.hidden = false;
    entrada.classList.remove("error");
    void entrada.offsetWidth; // reinicia la animación
    entrada.classList.add("error");
  }

  /* ---------- Render ---------- */

  function pintar() {
    const d = ultimo;
    $("#sec-diag").classList.remove("oculto");
    $("#sec-diag").classList.remove("anim-entrada");
    void $("#sec-diag").offsetWidth;
    $("#sec-diag").classList.add("anim-entrada");

    $("#v-rango").textContent =
      nf.format(d.min) +
      " — " +
      nf.format(d.max) +
      (d.paso !== 1 ? "  (paso " + d.paso + ")" : "");
    animar($("#v-esperados"), d.esperados);
    animar($("#v-recibidos"), d.recibidos);
    animar($("#v-unicos"), d.unicos);
    animar($("#v-duplicados"), d.duplicados.length);
    animar($("#v-faltantes"), d.faltantes.length);
    $("#leg-ok").textContent = nf.format(d.unicos);
    $("#leg-falta").textContent = nf.format(d.faltantes.length);

    // Completitud
    const pctTxt = d.pct % 1 === 0 ? d.pct.toFixed(0) : d.pct.toFixed(1);
    $("#v-pct").textContent = pctTxt + "%";
    $("#barra-fill").style.width = d.pct + "%";
    $("#bloque-pct").classList.toggle("perfecta", d.faltantes.length === 0);

    // Duplicados
    if (d.duplicados.length) {
      const muestra = d.duplicados
        .slice(0, 12)
        .map(([n, c]) => nf.format(n) + "×" + c)
        .join(", ");
      const extra = d.duplicados.length - 12;
      $("#dupes-txt").textContent =
        "Duplicados detectados: " +
        muestra +
        (extra > 0 ? " … y " + extra + " más." : "");
      $("#dupes").classList.remove("oculto");
    } else {
      $("#dupes").classList.add("oculto");
    }

    // Sello
    sello.classList.remove("stamp", "ok");
    if (d.faltantes.length === 0) {
      $("#sello-txt").textContent = "Completa";
      $("#sello-sub").textContent = "Serie íntegra";
      sello.classList.add("ok");
    } else {
      $("#sello-txt").textContent = "Incompleta";
      $("#sello-sub").textContent =
        nf.format(d.faltantes.length) + " faltantes";
    }
    void sello.offsetWidth;
    sello.classList.add("stamp");

    try {
      pintarCinta();
    } catch (e) {
      console.error("Error al pintar el mapa:", e);
    }
    renderFaltantes();

    $("#herr-falt").classList.toggle("oculto", d.faltantes.length === 0);
    document
      .getElementById("salida-falt")
      .scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function pintarCinta() {
    const d = ultimo;
    cinta.innerHTML = "";
    const total = Math.min(d.esperados, MAX_CELDAS);
    cinta.style.setProperty(
      "--stagger",
      Math.min(1.6, 900 / total).toFixed(3) + "ms",
    );

    const frag = document.createDocumentFragment();
    for (let i = 0; i < total; i++) {
      const v = d.min + i * d.paso;
      const cel = document.createElement("i");
      cel.className =
        "cel" +
        (d.paso !== 1 && v > d.max ? "" : conteoTiene(v) ? "" : " falta");
      cel.dataset.n = v;
      cel.style.setProperty("--i", i);
      frag.appendChild(cel);
    }
    cinta.appendChild(frag);

    const nota = $("#cinta-nota");
    if (d.esperados > MAX_CELDAS) {
      nota.textContent =
        "El rango completo es de " +
        nf.format(d.esperados) +
        " posiciones: el mapa muestra las primeras " +
        nf.format(MAX_CELDAS) +
        ".";
      nota.classList.remove("oculto");
    } else {
      nota.classList.add("oculto");
    }
  }
  // atajo: el conteo vive dentro de ultimo
  function conteoTiene(v) {
    return ultimo._set.has(v);
  }

  function renderFaltantes() {
    const d = ultimo,
      salida = $("#salida-falt");
    if (!d) {
      return;
    }

    if (d.faltantes.length === 0) {
      salida.innerHTML =
        '<div class="vacio completa"><span class="grande">Serie completa</span>' +
        "No falta ningún número entre " +
        nf.format(d.min) +
        " y " +
        nf.format(d.max) +
        ".</div>";
      return;
    }

    if (compacto) {
      const chips = d.rangos
        .map((r) => {
          const etiqueta =
            r.a === r.b
              ? nf.format(r.a)
              : nf.format(r.a) + "–" + nf.format(r.b);
          const copia = r.a === r.b ? String(r.a) : r.a + "-" + r.b;
          const cuenta = (r.b - r.a) / d.paso + 1;
          return (
            '<button class="chip rango" data-copy="' +
            copia +
            '">' +
            etiqueta +
            (cuenta > 1
              ? ' <span class="n">(' + nf.format(cuenta) + ")</span>"
              : "") +
            "</button>"
          );
        })
        .join("");
      salida.innerHTML =
        '<div class="lista-falt" style="max-height:none">' + chips + "</div>";
    } else {
      const visibles = d.faltantes.slice(0, MAX_CHIPS);
      const chips = visibles
        .map(
          (n) =>
            '<button class="chip" data-copy="' +
            n +
            '">' +
            nf.format(n) +
            "</button>",
        )
        .join("");
      let extra = "";
      if (d.faltantes.length > MAX_CHIPS) {
        extra =
          '<div class="truncado">… y ' +
          nf.format(d.faltantes.length - MAX_CHIPS) +
          " faltantes más. Usa la vista compacta o descarga el .txt para verlos todos.</div>";
      }
      salida.innerHTML = '<div class="lista-falt">' + chips + "</div>" + extra;
    }
  }

  /* ---------- Eventos ---------- */

  $("#btn-analizar").addEventListener("click", analizar);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      analizar();
    }
  });

  // Contador en vivo + invalidar la marca de ejemplo
  function actualizarContador() {
    const nums = entrada.value.match(/-?\d+/g) || [];
    contador.innerHTML =
      nums.length === 0
        ? "—"
        : nf.format(nums.length) +
          " números detectados" +
          (esEjemplo
            ? ' <span class="ejemplo">· datos de ejemplo precargados</span>'
            : "");
  }
  entrada.addEventListener("input", () => {
    esEjemplo = false;
    actualizarContador();
  });

  // Si ya hay un análisis, cambiar el paso vuelve a analizar
  pasoInput.addEventListener("change", () => {
    if (ultimo) analizar();
  });

  // Lista de ejemplo (la de la consulta del usuario, generada por código)
  $("#btn-ejemplo").addEventListener("click", () => {
    const out = [1, 2, 3, 5];
    entrada.value = out.join("\n");
    esEjemplo = true;
    actualizarContador();
    analizar();
  });

    function limpiar(enfocar) {
    entrada.value = "";
    pasoInput.value = "1";
    esEjemplo = false;
    ultimo = null;
    setModo(true);
    actualizarContador();
    err.hidden = true;
    $("#sec-diag").classList.add("oculto");
    $("#herr-falt").classList.add("oculto");
    $("#salida-falt").innerHTML =
      '<div class="vacio"><span class="grande">Sin análisis todavía</span>' +
      "Pega tus números en la sección 01 y pulsa <b>Analizar serie</b>.</div>";
    if (enfocar) entrada.focus();
  }

  $("#btn-limpiar").addEventListener("click", () => limpiar(true));

  // Modo de vista
  $("#modo-compacto").addEventListener("click", () => setModo(true));
  $("#modo-detallado").addEventListener("click", () => setModo(false));
  function setModo(c) {
    compacto = c;
    $("#modo-compacto").setAttribute("aria-pressed", c);
    $("#modo-detallado").setAttribute("aria-pressed", !c);
    renderFaltantes();
  }

  // Copiar / descargar
  $("#btn-copiar").addEventListener("click", () => {
    if (!ultimo) return;
    const texto = compacto
      ? ultimo.rangos
          .map((r) => (r.a === r.b ? r.a : r.a + "-" + r.b))
          .join(", ")
      : ultimo.faltantes.join("\n");
    copiar(texto, "Lista de faltantes copiada");
  });
  $("#btn-descargar").addEventListener("click", () => {
    if (!ultimo) return;
    const texto = compacto
      ? "Faltantes (rangos): " +
        ultimo.rangos
          .map((r) => (r.a === r.b ? r.a : r.a + "-" + r.b))
          .join(", ") +
        "\n"
      : ultimo.faltantes.join("\n") + "\n";
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "faltantes_" + ultimo.min + "-" + ultimo.max + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
    mostrarToast("Archivo .txt descargado");
  });

  // Clic en chips y celdas → copiar
  $("#salida-falt").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) copiar(chip.dataset.copy);
  });
  cinta.addEventListener("click", (e) => {
    const cel = e.target.closest(".cel");
    if (cel) copiar(cel.dataset.n);
  });

  // Tooltip del mapa
  cinta.addEventListener("mouseover", (e) => {
    const cel = e.target.closest(".cel");
    if (!cel) return;
    const ausente = cel.classList.contains("falta");
    tooltip.textContent = nf.format(+cel.dataset.n);
    const est = document.createElement("span");
    est.className = "estado";
    est.textContent = ausente ? "· AUSENTE" : "· presente";
    tooltip.appendChild(est);
    tooltip.classList.toggle("ausente", ausente);
    tooltip.style.display = "block";
  });
  cinta.addEventListener("mousemove", (e) => {
    const x = Math.min(
      e.clientX + 14,
      window.innerWidth - tooltip.offsetWidth - 8,
    );
    tooltip.style.left = x + "px";
    tooltip.style.top = e.clientY - 34 + "px";
  });
  cinta.addEventListener("mouseout", (e) => {
    if (!e.target.closest(".cel")) return;
    tooltip.style.display = "none";
  });

  /* ---------- Arranque: precarga tu propia lista como demo ---------- */
  // $("#btn-ejemplo").click();

    /* ---------- Arranque: estado inicial limpio ---------- */
  limpiar(false);

  // Si el navegador restaura datos después de ejecutar el script, se vuelve a limpiar
  window.addEventListener("load", () => {
    if (entrada.value !== "") limpiar(false);
  });

  // Al volver con el botón Atrás (caché de página) también se reinicia
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) limpiar(false);
  });
})();