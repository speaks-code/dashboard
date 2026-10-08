const inputArchivos = document.getElementById("archivos");
const btnProcesar = document.getElementById("btnProcesar");
const btnLimpiar = document.getElementById("btnLimpiar");
const btnDescargar = document.getElementById("btnDescargar");

const listaArchivos = document.getElementById("listaArchivos");
const resumen = document.getElementById("resumen");
const cantidadValidos = document.getElementById("cantidadValidos");
const cantidadInvalidos = document.getElementById("cantidadInvalidos");
const mensaje = document.getElementById("mensaje");

let archivosProcesados = [];

const patronFormato1 = /^(\d{4})\s+(\d{2}|\d{4})\s+(.+)-([^-]+)-([^-]+)\.pdf$/i;

const patronFormato2 = /^(\d{4})-(\d{2}|\d{4})-(.+)-([^-]+)-([^-]+)\.pdf$/i;

function limpiarTexto(texto) {
  return texto.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function generarNuevoNombre(nombreOriginal) {
  let coincidencia = nombreOriginal.match(patronFormato1);

  if (coincidencia) {
    const disposicion = coincidencia[1];
    const anio = coincidencia[2];

    let laboratorio = coincidencia[3];
    let tramite = coincidencia[4];
    let tipoTramite = coincidencia[5];

    laboratorio = limpiarTexto(laboratorio);
    tramite = limpiarTexto(tramite);
    tipoTramite = limpiarTexto(tipoTramite);

    laboratorio = laboratorio.toUpperCase();
    tramite = tramite.toUpperCase();
    tipoTramite = tipoTramite.toUpperCase();

    return `${disposicion} ${anio} ${laboratorio} - ${tramite} - ${tipoTramite}.pdf`;
  }

  coincidencia = nombreOriginal.match(patronFormato2);

  if (coincidencia) {
    const disposicion = coincidencia[1];
    const anio = coincidencia[2];

    let laboratorio = coincidencia[3];
    let tramite = coincidencia[4];
    let tipoTramite = coincidencia[5];

    laboratorio = limpiarTexto(laboratorio);
    tramite = limpiarTexto(tramite);
    tipoTramite = limpiarTexto(tipoTramite);

    laboratorio = laboratorio.toUpperCase();
    tramite = tramite.toUpperCase();
    tipoTramite = tipoTramite.toUpperCase();

    return `${disposicion} ${anio} ${laboratorio} - ${tramite} - ${tipoTramite}.pdf`;
  }

  return null;
}

function escaparHTML(texto) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

inputArchivos.addEventListener("change", function () {
  archivosProcesados = [];

  const archivos = Array.from(inputArchivos.files);

  listaArchivos.innerHTML = "";

  if (archivos.length === 0) {
    listaArchivos.innerHTML = `
            <div class="sin-archivos">
                No se seleccionaron archivos.
            </div>
        `;

    btnProcesar.disabled = true;
    btnDescargar.disabled = true;
    resumen.classList.add("oculto");

    return;
  }

  archivos.forEach(function (archivo) {
    const nuevoNombre = generarNuevoNombre(archivo.name);

    archivosProcesados.push({
      archivo: archivo,
      nombreOriginal: archivo.name,
      nuevoNombre: nuevoNombre,
      valido: nuevoNombre !== null,
    });
  });

  mostrarResultados(archivosProcesados);

  btnProcesar.disabled = false;
  btnDescargar.disabled = true;
});

function mostrarResultados(archivos) {
  listaArchivos.innerHTML = "";

  let validos = 0;
  let invalidos = 0;

  archivos.forEach(function (item) {
    const elemento = document.createElement("div");

    if (item.valido) {
      validos++;

      elemento.className = "archivo valido";

      elemento.innerHTML = `
                <div class="archivo-original">
                    ${escaparHTML(item.nombreOriginal)}
                </div>

                <div class="estado correcto">
                    ✓ Archivo válido
                </div>

                <div class="archivo-nuevo">
                    ${escaparHTML(item.nuevoNombre)}
                </div>
            `;
    } else {
      invalidos++;

      elemento.className = "archivo invalido";

      elemento.innerHTML = `
                <div class="archivo-original">
                    ${escaparHTML(item.nombreOriginal)}
                </div>

                <div class="estado error">
                    ✗ Archivo no válido
                </div>

                <div>
                    El nombre no cumple con ninguno de los formatos admitidos.
                </div>
            `;
    }

    listaArchivos.appendChild(elemento);
  });

  cantidadValidos.textContent = validos;
  cantidadInvalidos.textContent = invalidos;

  resumen.classList.remove("oculto");
}

btnProcesar.addEventListener("click", function () {
  const validos = archivosProcesados.filter(function (item) {
    return item.valido;
  });

  if (validos.length === 0) {
    mostrarMensaje("No hay archivos válidos para procesar.", true);

    btnDescargar.disabled = true;

    return;
  }

  btnDescargar.disabled = false;

  mostrarMensaje(
    `Se encontraron ${validos.length} archivo(s) válido(s). Puede descargar el ZIP con los archivos renombrados.`,
  );
});

btnDescargar.addEventListener("click", async function () {
  const validos = archivosProcesados.filter(function (item) {
    return item.valido;
  });

  if (validos.length === 0) {
    return;
  }

  btnDescargar.disabled = true;
  btnDescargar.textContent = "Generando ZIP...";

  try {
    const zip = new JSZip();

    validos.forEach(function (item) {
      zip.file(item.nuevoNombre, item.archivo);
    });

    const contenidoZip = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });

    const url = URL.createObjectURL(contenidoZip);

    const enlace = document.createElement("a");

    enlace.href = url;
    enlace.download = "PDF_renombrados.zip";

    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();

    URL.revokeObjectURL(url);

    mostrarMensaje(
      `ZIP generado correctamente con ${validos.length} archivo(s).`,
    );
  } catch (error) {
    console.error(error);

    mostrarMensaje("Ocurrió un error al generar el archivo ZIP.", true);
  } finally {
    btnDescargar.disabled = false;
    btnDescargar.textContent = "Descargar archivos renombrados en ZIP";
  }
});

btnLimpiar.addEventListener("click", function () {
  inputArchivos.value = "";

  archivosProcesados = [];

  listaArchivos.innerHTML = `
        <div class="sin-archivos">
            No se seleccionaron archivos.
        </div>
    `;

  cantidadValidos.textContent = "0";
  cantidadInvalidos.textContent = "0";

  resumen.classList.add("oculto");

  btnProcesar.disabled = true;
  btnDescargar.disabled = true;

  mensaje.classList.add("oculto");
  mensaje.textContent = "";
});

function mostrarMensaje(texto, error = false) {
  mensaje.textContent = texto;

  mensaje.classList.remove("oculto");

  if (error) {
    mensaje.style.background = "#fee2e2";
    mensaje.style.color = "#991b1b";
  } else {
    mensaje.style.background = "#dbeafe";
    mensaje.style.color = "#1e40af";
  }
}
