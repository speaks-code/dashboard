(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const nf = new Intl.NumberFormat("es-ES");

  // Regla: los 4 primeros caracteres del nombre, todos dígitos
  const PREFIJO = /^\d{4}$/;

  const input = $("#archivos"),
    zona = $("#zona"),
    contador = $("#contador"),
    err = $("#err"),
    toast = $("#toast"),
    sello = $("#sello");

  const MAX_ARCHIVOS = 5000; // límite de archivos procesables por tanda

  let archivos = [];    // File[] (solo PDF)
  let resultado = null; // último análisis
  let compacto = true;
  let toastTimer = null;

  /* ---------- Utilidades (idénticas al auditor) ---------- */

  function mostrarToast(msg) {
    toast.textContent = msg;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  function copiar(texto, aviso) {
    const hecho = () => mostrarToast(aviso || "« " + texto + " » copiado");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(hecho).catch(() => copiarFallback(texto, hecho));
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

  // Escapa nombres de archivo antes de inyectarlos en el HTML
  const escapar = (s) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = nf.format(Math.round(desde + (hasta - desde) * e)) + sufijo;
      if (k < 1) requestAnimationFrame(tic);
    })(t0);
  }

  /* ---------- Carga de archivos ---------- */

  function actualizarContador() {
    contador.textContent =
      archivos.length === 0
        ? "—"
        : nf.format(archivos.length) +
          (archivos.length === 1
            ? " archivo PDF seleccionado"
            : " archivos PDF seleccionados");
  }

  function fallar(msg) {
    err.textContent = "⚠ " + msg;
    err.hidden = false;
    zona.classList.remove("error");
    void zona.offsetWidth;
    zona.classList.add("error");
  }

  function cargarFiles(fileList) {
    err.hidden = true;

    const pdfs = [],
      otros = [];
    for (const f of fileList) {
      (/\.pdf$/i.test(f.name) || f.type === "application/pdf") ? pdfs.push(f) : otros.push(f.name);
    }

    if (!pdfs.length) {
      archivos = [];
      zona.classList.remove("llena");
      actualizarContador();
      fallar("Ninguno de los archivos es un PDF válido.");
      return;
    }

    archivos = pdfs.slice(0, MAX_ARCHIVOS);
    zona.classList.add("llena");
    actualizarContador();

    if (otros.length) {
      fallar(
        "Se ignoraron " + nf.format(otros.length) + " archivo(s) que no son PDF: " +
        otros.slice(0, 3).join(", ") + (otros.length > 3 ? "…" : "."),
      );
    }
    if (pdfs.length > MAX_ARCHIVOS) {
      mostrarToast("Límite alcanzado: se procesan los primeros " + nf.format(MAX_ARCHIVOS));
    } else {
      mostrarToast(nf.format(archivos.length) + " PDF " + (archivos.length === 1 ? "cargado" : "cargados"));
    }

    extraer();
  }

  /* ---------- Extracción ---------- */

  function extraer() {
    if (!archivos.length) {
      fallar("Selecciona al menos un archivo PDF para poder extraer los prefijos.");
      return;
    }
    err.hidden = true;

    const mapa = new Map(); // prefijo (string) -> [nombres de archivo]
    const descartados = [];

    for (const f of archivos) {
      const pref = f.name.slice(0, 4);
      if (PREFIJO.test(pref)) {
        if (!mapa.has(pref)) mapa.set(pref, []);
        mapa.get(pref).push(f.name);
      } else {
        descartados.push(f.name);
      }
    }

    // Orden numérico ascendente (desempate por texto para ceros a la izquierda)
    const entradas = [...mapa.entries()]
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10) || (a[0] < b[0] ? -1 : 1))
      .map(([pref, nombres]) => ({ pref, nombres }));

    // Un dato por archivo (conserva repeticiones), ya ordenado
    const lista = entradas.flatMap((e) => e.nombres.map(() => e.pref));

    resultado = {
      entradas,
      descartados,
      lista,
      total: archivos.length,
      conPref: lista.length,
      distintos: entradas.length,
      repetidos: entradas.filter((e) => e.nombres.length > 1).length,
    };

    pintar();
  }

  /* ---------- Render ---------- */

  function pintar() {
    const d = resultado;
    const sec = $("#sec-diag");
    sec.classList.remove("oculto", "anim-entrada");
    void sec.offsetWidth;
    sec.classList.add("anim-entrada");

    animar($("#v-total"), d.total);
    animar($("#v-lista"), d.conPref);
    animar($("#v-distintos"), d.distintos);
    animar($("#v-repetidos"), d.repetidos);
    animar($("#v-desc"), d.descartados.length);

    const pct = d.total ? (d.conPref / d.total) * 100 : 0;
    const pctTxt = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
    $("#v-pct").textContent = pctTxt + "%";
    $("#barra-fill").style.width = pct + "%";
    $("#bloque-pct").classList.toggle("perfecta", d.conPref === d.total);

    // Archivos descartados
    if (d.descartados.length) {
      const muestra = d.descartados.slice(0, 10).join(", ");
      const extra = d.descartados.length - 10;
      $("#descartes-txt").textContent =
        "Sin prefijo numérico: " + muestra + (extra > 0 ? " … y " + extra + " más." : "");
      $("#descartes").classList.remove("oculto");
    } else {
      $("#descartes").classList.add("oculto");
    }

    // Sello
    sello.classList.remove("stamp", "ok");
    if (d.conPref === d.total) {
      $("#sello-txt").textContent = "Extracción limpia";
      $("#sello-sub").textContent = "todos los PDF aportan número";
      sello.classList.add("ok");
    } else if (d.distintos === 0) {
      $("#sello-txt").textContent = "Sin números";
      $("#sello-sub").textContent = "ningún PDF empieza con 4 dígitos";
    } else {
      $("#sello-txt").textContent = "Con descartes";
      $("#sello-sub").textContent = nf.format(d.descartados.length) + " sin prefijo";
    }
    void sello.offsetWidth;
    sello.classList.add("stamp");

    renderLista();
    $("#herr-falt").classList.toggle("oculto", d.distintos === 0);
    document
      .getElementById("salida-lista")
      .scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderLista() {
    const d = resultado,
      salida = $("#salida-lista");
    if (!d || !d.distintos) {
      salida.innerHTML =
        '<div class="vacio"><span class="grande">Sin números todavía</span>' +
        "Selecciona tus PDF en la sección 01 y los prefijos aparecerán aquí.</div>";
      return;
    }

    if (compacto) {
      const chips = d.entradas
        .map(
          (e) =>
            '<button class="chip" data-copy="' + e.pref + '">' +
            e.pref +
            (e.nombres.length > 1
              ? ' <span class="n">(×' + nf.format(e.nombres.length) + ")</span>"
              : "") +
            "</button>",
        )
        .join("");
      salida.innerHTML =
        '<div class="lista-falt" style="max-height:none">' + chips + "</div>";
    } else {
      const filas = d.entradas
        .map(
          (e) =>
            '<button class="chip det" data-copy="' + e.pref + '" title="' +
            escapar(e.nombres.join("\n")) + '">' +
            "<b>" + e.pref + "</b>" +
            '<span class="nom">' + escapar(e.nombres.join("  ·  ")) + "</span></button>",
        )
        .join("");
      salida.innerHTML = '<div class="lista-falt">' + filas + "</div>";
    }
  }

  /* ---------- Eventos ---------- */

  // Reinicio del input: permite volver a elegir el mismo archivo
  input.addEventListener("change", () => {
    if (input.files.length) cargarFiles(input.files);
    input.value = "";
  });

  // Arrastrar y soltar
  ["dragover", "dragenter"].forEach((ev) =>
    zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add("encima");
    }),
  );
  zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("encima");
    if (e.dataTransfer && e.dataTransfer.files.length) cargarFiles(e.dataTransfer.files);
  });

  $("#btn-extraer").addEventListener("click", extraer);

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      extraer();
    }
  });

  $("#btn-limpiar").addEventListener("click", () => {
    archivos = [];
    resultado = null;
    input.value = "";
    zona.classList.remove("llena");
    actualizarContador();
    err.hidden = true;
    $("#sec-diag").classList.add("oculto");
    $("#herr-falt").classList.add("oculto");
    $("#salida-lista").innerHTML =
      '<div class="vacio"><span class="grande">Sin extracción todavía</span>' +
      "Selecciona tus PDF en la sección 01 y los prefijos aparecerán aquí.</div>";
  });

  // Modo de vista
  $("#modo-compacto").addEventListener("click", () => setModo(true));
  $("#modo-detallado").addEventListener("click", () => setModo(false));
  function setModo(c) {
    compacto = c;
    $("#modo-compacto").setAttribute("aria-pressed", c);
    $("#modo-detallado").setAttribute("aria-pressed", !c);
    renderLista();
  }

  // Copiar / descargar
  $("#btn-copiar").addEventListener("click", () => {
    if (!resultado) return;
    copiar(resultado.lista.join(", "), "Lista de números copiada");
  });
  $("#btn-descargar").addEventListener("click", () => {
    if (!resultado) return;
    const blob = new Blob([resultado.lista.join("\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "prefijos_pdf.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    mostrarToast("Archivo .txt descargado");
  });

  // Clic en un chip → copiar ese número
  $("#salida-lista").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) copiar(chip.dataset.copy);
  });
})();