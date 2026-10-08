(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const nf = new Intl.NumberFormat("es-ES");

  // Regla: los 4 primeros caracteres del NOMBRE del archivo, todos dígitos
  const PREFIJO = /^\d{4}$/;

  const input = $("#archivos"), // archivos sueltos
    carpeta = $("#carpeta"), // carpeta raíz (escaneo recursivo)
    zona = $("#zona"),
    contador = $("#contador"),
    err = $("#err"),
    toast = $("#toast"),
    sello = $("#sello");

  const MAX_ARCHIVOS = 20000; // límite de PDF procesables por tanda
  const MAX_FALT_CHIPS = 5000; // límite de chips en faltantes detallado

  let archivos = []; // File[] (solo PDF), cada uno con su ruta relativa
  let resultado = null; // último análisis
  let compactoLista = true; // vista de la lista extraída
  let compactoFalt = true; // vista de los faltantes
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

  const escapar = (s) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // Rellena con ceros a la izquierda: 5 → "0005" (mismo formato que los prefijos)
  const pad4 = (n) => String(n).padStart(4, "0");

  // Agrupa números consecutivos en rangos {a, b}
  function compactarRangos(arr) {
    const res = [];
    let i = 0;
    while (i < arr.length) {
      let j = i;
      while (j + 1 < arr.length && arr[j + 1] - arr[j] === 1) j++;
      res.push({ a: arr[i], b: arr[j] });
      i = j + 1;
    }
    return res;
  }

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
      el.textContent =
        nf.format(Math.round(desde + (hasta - desde) * e)) + sufijo;
      if (k < 1) requestAnimationFrame(tic);
    })(t0);
  }

  /* ---------- Recorrido recursivo de carpetas ---------- */

  const rutaDe = (f) => f.webkitRelativePath || f._ruta || f.name;

  function leerEntry(entry, rutaBase) {
    if (entry.isFile) {
      return new Promise((ok) => {
        entry.file(
          (f) => {
            f._ruta = rutaBase + f.name;
            ok([f]);
          },
          () => ok([]),
        );
      });
    }
    if (entry.isDirectory) {
      const lector = entry.createReader();
      const todos = [];
      return new Promise((ok) => {
        (function lote() {
          // readEntries entrega ~100 por llamada: se repite hasta vaciar
          lector.readEntries(
            async (entradas) => {
              if (!entradas.length) return ok(todos);
              for (const e of entradas)
                todos.push(
                  ...(await leerEntry(e, rutaBase + entry.name + "/")),
                );
              lote();
            },
            () => ok(todos),
          );
        })();
      });
    }
    return Promise.resolve([]);
  }

  async function filesDeDrop(dt) {
    const entradas = [...dt.items]
      .map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry())
      .filter(Boolean);
    if (!entradas.length) return [...dt.files];
    const todos = [];
    for (const e of entradas) todos.push(...(await leerEntry(e, "")));
    return todos;
  }

  /* ---------- Carga de archivos ---------- */

  function actualizarContador() {
    if (!archivos.length) {
      contador.textContent = "—";
      return;
    }
    const carpetas = new Set(
      archivos.map((f) => rutaDe(f).replace(/\/[^/]*$/, "")),
    );
    contador.textContent =
      nf.format(archivos.length) +
      (archivos.length === 1 ? " archivo PDF" : " archivos PDF") +
      (carpetas.size > 1
        ? " en " + nf.format(carpetas.size) + " carpetas"
        : "");
  }

  function fallar(msg) {
    err.textContent = "⚠ " + msg;
    err.hidden = false;
    zona.classList.remove("error");
    void zona.offsetWidth;
    zona.classList.add("error");
  }

  async function cargarFiles(fileList) {
    err.hidden = true;

    const pdfs = [],
      otros = [];
    for (const f of fileList) {
      f.type === "application/pdf" || /\.pdf$/i.test(f.name)
        ? pdfs.push(f)
        : otros.push(f.name);
    }

    if (!pdfs.length) {
      archivos = [];
      zona.classList.remove("llena");
      actualizarContador();
      fallar(
        "No se encontró ningún PDF" +
          (otros.length
            ? " entre " + nf.format(otros.length) + " archivos revisados."
            : "."),
      );
      return;
    }

    const recortados = pdfs.length > MAX_ARCHIVOS;
    archivos = pdfs.slice(0, MAX_ARCHIVOS);
    zona.classList.add("llena");
    actualizarContador();

    if (otros.length) {
      fallar(
        "Se omitieron " +
          nf.format(otros.length) +
          " archivo(s) que no son PDF.",
      );
    } else {
      mostrarToast(
        nf.format(archivos.length) +
          " PDF " +
          (archivos.length === 1 ? "cargado" : "cargados"),
      );
    }
    if (recortados) {
      mostrarToast(
        "Límite: se procesan los primeros " + nf.format(MAX_ARCHIVOS),
      );
    }

    extraer();
  }

  /* ---------- Extracción + auditoría de la serie ---------- */

  function extraer() {
    if (!archivos.length) {
      fallar(
        "Selecciona una carpeta raíz o archivos PDF para poder extraer los prefijos.",
      );
      return;
    }
    err.hidden = true;

    const mapa = new Map(); // prefijo -> [rutas de archivo]
    const descartados = [];

    for (const f of archivos) {
      const pref = f.name.slice(0, 4);
      if (PREFIJO.test(pref)) {
        if (!mapa.has(pref)) mapa.set(pref, []);
        mapa.get(pref).push(rutaDe(f));
      } else {
        descartados.push(rutaDe(f));
      }
    }

    // Orden numérico ascendente (desempate alfabético para ceros a la izquierda)
    const entradas = [...mapa.entries()]
      .sort(
        (a, b) =>
          parseInt(a[0], 10) - parseInt(b[0], 10) || (a[0] < b[0] ? -1 : 1),
      )
      .map(([pref, nombres]) => ({ pref, nombres }));

    const lista = entradas.flatMap((e) => e.nombres.map(() => e.pref));

    /* --- Auditoría: huecos entre el mínimo y el máximo --- */
    let min = Infinity,
      max = -Infinity;
    const presentes = new Set();
    for (const e of entradas) {
      const v = parseInt(e.pref, 10);
      presentes.add(v);
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const faltantes = [];
    if (entradas.length) {
      for (let v = min; v <= max; v++) {
        if (!presentes.has(v)) faltantes.push(pad4(v));
      }
    }
    const rangos = compactarRangos(faltantes.map(Number)).map((r) => ({
      a: pad4(r.a),
      b: pad4(r.b),
    }));

    resultado = {
      entradas,
      descartados,
      lista,
      min: entradas.length ? pad4(min) : "—",
      max: entradas.length ? pad4(max) : "—",
      faltantes,
      rangos,
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
    animar($("#v-faltantes"), d.faltantes.length);
    animar($("#v-desc"), d.descartados.length);
    $("#v-rango").textContent = d.distintos ? d.min + " — " + d.max : "—";

    const pct = d.total ? (d.conPref / d.total) * 100 : 0;
    const pctTxt = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
    $("#v-pct").textContent = pctTxt + "%";
    $("#barra-fill").style.width = pct + "%";
    $("#bloque-pct").classList.toggle("perfecta", d.conPref === d.total);

    if (d.descartados.length) {
      const muestra = d.descartados.slice(0, 10).join(", ");
      const extra = d.descartados.length - 10;
      $("#descartes-txt").textContent =
        "Sin prefijo numérico: " +
        muestra +
        (extra > 0 ? " … y " + extra + " más." : "");
      $("#descartes").classList.remove("oculto");
    } else {
      $("#descartes").classList.add("oculto");
    }

    // Sello: ahora refleja la integridad de la serie
    sello.classList.remove("stamp", "ok");
    if (d.distintos === 0) {
      $("#sello-txt").textContent = "Sin números";
      $("#sello-sub").textContent = "ningún PDF empieza con 4 dígitos";
    } else if (d.faltantes.length === 0) {
      $("#sello-txt").textContent = "Completa";
      $("#sello-sub").textContent = "serie íntegra sin huecos";
      sello.classList.add("ok");
    } else {
      $("#sello-txt").textContent = "Incompleta";
      $("#sello-sub").textContent =
        nf.format(d.faltantes.length) + " faltantes";
    }
    void sello.offsetWidth;
    sello.classList.add("stamp");

    renderLista();
    renderFaltantes();
    $("#herr-lista").classList.toggle("oculto", d.distintos === 0);
    $("#herr-falt").classList.toggle("oculto", d.faltantes.length === 0);
    document
      .getElementById("salida-falt")
      .scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderLista() {
    const d = resultado,
      salida = $("#salida-lista");
    if (!d || !d.distintos) {
      salida.innerHTML =
        '<div class="vacio"><span class="grande">Sin números todavía</span>' +
        "Selecciona la carpeta raíz y los prefijos aparecerán aquí.</div>";
      return;
    }

    if (compactoLista) {
      const chips = d.entradas
        .map(
          (e) =>
            '<button class="chip" data-copy="' +
            e.pref +
            '">' +
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
            '<button class="chip det" data-copy="' +
            e.pref +
            '" title="' +
            escapar(e.nombres.join("\n")) +
            '">' +
            "<b>" +
            e.pref +
            "</b>" +
            '<span class="nom">' +
            escapar(e.nombres.join("  ·  ")) +
            "</span></button>",
        )
        .join("");
      salida.innerHTML = '<div class="lista-falt">' + filas + "</div>";
    }
  }

  function renderFaltantes() {
    const d = resultado,
      salida = $("#salida-falt");
    if (!d || d.distintos === 0) {
      salida.innerHTML =
        '<div class="vacio"><span class="grande">Sin análisis todavía</span>' +
        "Extrae los prefijos para detectar los huecos de la serie.</div>";
      return;
    }

    if (d.faltantes.length === 0) {
      salida.innerHTML =
        '<div class="vacio completa"><span class="grande">Serie completa</span>' +
        "No falta ningún número entre " +
        d.min +
        " y " +
        d.max +
        ".</div>";
      return;
    }

    if (compactoFalt) {
      const chips = d.rangos
        .map((r) => {
          const etiqueta = r.a === r.b ? r.a : r.a + "–" + r.b;
          const copia = r.a === r.b ? r.a : r.a + "-" + r.b;
          const cuenta = parseInt(r.b, 10) - parseInt(r.a, 10) + 1;
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
      const visibles = d.faltantes.slice(0, MAX_FALT_CHIPS);
      const chips = visibles
        .map(
          (n) =>
            '<button class="chip" data-copy="' + n + '">' + n + "</button>",
        )
        .join("");
      let extra = "";
      if (d.faltantes.length > MAX_FALT_CHIPS) {
        extra =
          '<div class="truncado">… y ' +
          nf.format(d.faltantes.length - MAX_FALT_CHIPS) +
          " faltantes más. Usa la vista compacta o descarga el .txt para verlos todos.</div>";
      }
      salida.innerHTML = '<div class="lista-falt">' + chips + "</div>" + extra;
    }
  }

  /* ---------- Eventos ---------- */

  zona.addEventListener("click", () => carpeta.click());
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      carpeta.click();
    }
  });

  $("#link-archivos").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    input.click();
  });

  carpeta.addEventListener("change", () => {
    if (carpeta.files.length) cargarFiles(carpeta.files);
    carpeta.value = "";
  });

  input.addEventListener("change", () => {
    if (input.files.length) cargarFiles(input.files);
    input.value = "";
  });

  ["dragover", "dragenter"].forEach((ev) =>
    zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add("encima");
    }),
  );
  zona.addEventListener("dragleave", () => zona.classList.remove("encima"));
  zona.addEventListener("drop", async (e) => {
    e.preventDefault();
    zona.classList.remove("encima");
    const dt = e.dataTransfer;
    if (dt && (dt.items.length || dt.files.length)) {
      await cargarFiles(await filesDeDrop(dt));
    }
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
    carpeta.value = "";
    input.value = "";
    zona.classList.remove("llena");
    actualizarContador();
    err.hidden = true;
    $("#sec-diag").classList.add("oculto");
    $("#herr-lista").classList.add("oculto");
    $("#herr-falt").classList.add("oculto");
    $("#salida-lista").innerHTML =
      '<div class="vacio"><span class="grande">Sin extracción todavía</span>' +
      "Selecciona la carpeta raíz y los prefijos aparecerán aquí.</div>";
    $("#salida-falt").innerHTML =
      '<div class="vacio"><span class="grande">Sin análisis todavía</span>' +
      "Extrae los prefijos para detectar los huecos de la serie.</div>";
  });

  // Modo de vista · lista extraída
  $("#lista-compacto").addEventListener("click", () => setModoLista(true));
  $("#lista-detallado").addEventListener("click", () => setModoLista(false));
  function setModoLista(c) {
    compactoLista = c;
    $("#lista-compacto").setAttribute("aria-pressed", c);
    $("#lista-detallado").setAttribute("aria-pressed", !c);
    renderLista();
  }

  // Modo de vista · faltantes
  $("#falt-compacto").addEventListener("click", () => setModoFalt(true));
  $("#falt-detallado").addEventListener("click", () => setModoFalt(false));
  function setModoFalt(c) {
    compactoFalt = c;
    $("#falt-compacto").setAttribute("aria-pressed", c);
    $("#falt-detallado").setAttribute("aria-pressed", !c);
    renderFaltantes();
  }

  // Copiar / descargar · lista extraída
  $("#btn-copiar-lista").addEventListener("click", () => {
    if (!resultado) return;
    copiar(resultado.lista.join(", "), "Lista de números copiada");
  });
  $("#btn-descargar-lista").addEventListener("click", () => {
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

  // Copiar / descargar · faltantes
  $("#btn-copiar-falt").addEventListener("click", () => {
    if (!resultado) return;
    const texto = compactoFalt
      ? resultado.rangos
          .map((r) => (r.a === r.b ? r.a : r.a + "-" + r.b))
          .join(", ")
      : resultado.faltantes.join("\n");
    copiar(texto, "Lista de faltantes copiada");
  });
  $("#btn-descargar-falt").addEventListener("click", () => {
    if (!resultado) return;
    const texto = compactoFalt
      ? "Faltantes (rangos): " +
        resultado.rangos
          .map((r) => (r.a === r.b ? r.a : r.a + "-" + r.b))
          .join(", ") +
        "\n"
      : resultado.faltantes.join("\n") + "\n";
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "faltantes_" + resultado.min + "-" + resultado.max + ".txt";
    a.click();
    URL.revokeObjectURL(a.href);
    mostrarToast("Archivo .txt descargado");
  });

  // Clic en chips → copiar
  $("#salida-lista").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) copiar(chip.dataset.copy);
  });
  $("#salida-falt").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (chip) copiar(chip.dataset.copy);
  });
})();
