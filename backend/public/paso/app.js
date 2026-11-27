const vista = document.querySelector("#vista")
const lede = document.querySelector("#lede")
const salir = document.querySelector("#salir")

let sesion = { perfil: null, usuario: null }
let refrescoContable = 0

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (caracter) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[caracter])
}

function ruta() {
  const hash = location.hash.replace(/^#/, "")
  const [seccion, id] = hash.split("/")
  return { seccion, id }
}

async function api(url, opciones = {}) {
  const respuesta = await fetch(url, opciones)
  const tipo = respuesta.headers.get("content-type") || ""
  const cuerpo = tipo.includes("json") ? await respuesta.json().catch(() => ({})) : {}
  if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo completar la solicitud.")
  return cuerpo
}

function panel(html) {
  vista.innerHTML = `<section class="panel glass">${html}</section>`
}

const NOMBRES = { logistica: "Logística", contabilidad: "Contabilidad", admin: "Administrador" }

function destino(perfil) {
  if (perfil === "logistica") return "logistica"
  if (perfil === "admin") return "admin"
  return "contabilidad"
}

function regresoAdmin() {
  return sesion.perfil === "admin" ? `<p><a href="#admin">Volver al inicio</a></p>` : ""
}

function mostrarIngreso() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search)
}

function entrada() {
  detenerRefresco()
  lede.textContent = "Cada rol entra con su usuario. El administrador puede abrir las dos pantallas."
  salir.hidden = true
  mostrarIngreso()
  panel(`
    <h2>Ingresar</h2>
    <form id="login">
      <label>Usuario<input id="usuario" name="usuario" type="text" maxlength="80" autocomplete="username" required /></label>
      <label>Clave<input id="clave" name="clave" type="password" maxlength="80" autocomplete="current-password" required /></label>
      <div class="acciones"><button class="btn btn-primary" type="submit">Entrar</button></div>
      <p class="aviso" id="aviso"></p>
    </form>
  `)
  vista.querySelector("#login").addEventListener("submit", async (evento) => {
    evento.preventDefault()
    const aviso = vista.querySelector("#aviso")
    const datos = new FormData(evento.target)
    aviso.textContent = ""
    try {
      sesion = await api("/api/paso/sesion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usuario: datos.get("usuario"), clave: datos.get("clave") }),
      })
      const siguiente = destino(sesion.perfil)
      if (location.hash === `#${siguiente}`) dibujar()
      else location.hash = siguiente
    } catch (error) {
      aviso.textContent = error.message
    }
  })
}

const COLUMNAS = [
  ["FECHA", "fecha", "fecha"],
  ["LOTE", "lote", "texto"],
  ["CLIENTE DESPOSTE", "clienteDesposte", "texto"],
  ["CLIENTE", "cliente", "texto"],
  ["CANTIDAD", "cantidad", "entero"],
  ["PRODUCTO", "producto", "texto"],
  ["PESO LOTE (KG)", "pesoLote", "kilos"],
  ["PLACA DEL VEHÍCULO", "placa", "texto"],
  ["CONDUCTOR VEHICULO", "conductor", "texto"],
  ["DOCUMENTO SIMED", "documentoSiimed", "documento"],
  ["REFERENCIA", "referencia", "texto"],
  ["GUIA TRANSPORTE", "guiaTransporte", "texto"],
  ["RUTA / SUCURSAL / DESTINO", "rutaSucursalDestino", "texto"],
  ["PROPIETARIO", "propietario", "texto"],
  ["TIPO CONSERVACION", "tipoConservacion", "texto"],
]

const kilos = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const enteros = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 })

function fechaDia(valor) {
  if (!valor) return ""
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ""
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(fecha)
  const tomar = (tipo) => partes.find((parte) => parte.type === tipo)?.value
  return `${tomar("day")}/${tomar("month")}/${tomar("year")}`
}

function textoCelda(fila, tipo, campo) {
  const valor = fila[campo]
  if (valor === null || valor === undefined || valor === "") return "—"
  if (tipo === "fecha") return fechaDia(valor) || "—"
  if (tipo === "kilos") return kilos.format(Number(valor))
  if (tipo === "entero") return enteros.format(Number(valor))
  return String(valor)
}

const REFERENCIAS = [
  ["30-10-24", "30-10-24 · Caja bandeja carne"],
  ["30-10-25", "30-10-25 · Caja cartón Colbeef negra"],
  ["30-10-26", "30-10-26 · Caja cartón Colbeef verde"],
  ["30-10-45", "30-10-45 · Caja bandeja 25 kg"],
  ["30-10-100019", "30-10-100019 · Olímpica"],
]

function esOlimpica(cliente) {
  return /olimp/i.test(String(cliente || ""))
}

function celdaReferencia(fila, editable) {
  if (esOlimpica(fila.cliente)) return `<td>30-10-100019</td>`
  const actual = REFERENCIAS.some(([codigo]) => codigo === fila.referencia) ? fila.referencia : "30-10-24"
  if (!editable) return `<td>${escapar(actual)}</td>`
  const opciones = REFERENCIAS.map(([codigo, etiqueta]) => `<option value="${codigo}"${codigo === actual ? " selected" : ""}>${etiqueta}</option>`).join("")
  return `<td><select class="ref" data-cliente="${escapar(fila.cliente)}">${opciones}</select></td>`
}

function celdaRecortada(texto) {
  const limpio = String(texto)
  if (limpio === "—" || limpio.length <= 18) return `<td>${escapar(limpio)}</td>`
  const corto = limpio.slice(0, 18).trimEnd()
  return `<td><details class="recorte"><summary>${escapar(corto)}…</summary><p>${escapar(limpio)}</p></details></td>`
}

function tablaDespachos(registros, editable) {
  const encabezados = COLUMNAS.map(([titulo]) => `<th>${titulo}</th>`).join("")
  const filas = registros.map((fila) => {
    const celdas = COLUMNAS.map(([, campo, tipo]) => {
      if (campo === "referencia") return celdaReferencia(fila, editable)
      if (tipo !== "documento") return celdaRecortada(textoCelda(fila, tipo, campo))
      if (!editable) {
        return `<td>${fila.documentoSiimed ? escapar(fila.documentoSiimed) : '<span class="pendiente">Sin documento</span>'}</td>`
      }
      return `<td><input class="doc" data-detalle="${fila.detalleId}" data-vehiculo="${fila.vehiculoId}" data-cliente="${escapar(fila.cliente)}" data-cantidad="${fila.cantidad ?? ""}" value="${escapar(fila.documentoSiimed || "")}" maxlength="40" placeholder="H7-403" /></td>`
    }).join("")
    return `<tr class="${fila.documentoSiimed ? "" : "pendiente"}">${celdas}</tr>`
  }).join("")
  return `<div class="tabla-marco tabla-ancha"><table><thead><tr>${encabezados}</tr></thead><tbody>${filas}</tbody></table></div>`
}

async function pantallaDespachos() {
  const editable = ruta().seccion !== "contabilidad" && (sesion.perfil === "logistica" || sesion.perfil === "admin")
  lede.textContent = `${sesion.usuario} · ${NOMBRES[sesion.perfil]}`
  salir.hidden = false
  panel(`
    ${regresoAdmin()}
    <h2>${editable ? "Documento SIMED" : "Verificación de documentos"}</h2>
    <p class="ayuda">${editable
      ? "Info SIRT: la fecha, el cliente, la cantidad y el resto de la tabla salen de SIRT. El documento SIMED y la referencia de la caja no vienen de allí; Logística los escribe en esta pantalla. El archivo lo carga Contabilidad."
      : "Revisa el documento SIMED que escribió Logística. Lo que está vacío todavía no tiene identificador."}</p>
    <form id="consulta" class="acciones">
      ${filtroPeriodo()}
      <button class="btn btn-primary" type="submit">Consultar</button>
    </form>
    <p class="aviso" id="aviso"></p>
    <div id="tabla"></div>
    <details class="desplegable realizado">
      <summary>Realizados <span id="realizados-cuenta"></span></summary>
      <div class="cuerpo" id="realizados-tabla"><p class="ayuda">Cargando los realizados.</p></div>
    </details>
  `)
  enlazarPeriodo(vista.querySelector("#consulta"))
  cargarRealizados()
  vista.querySelector("#consulta").addEventListener("submit", async (evento) => {
    evento.preventDefault()
    const aviso = vista.querySelector("#aviso")
    const periodo = periodoDe(evento.target)
    aviso.textContent = ""
    vista.querySelector("#tabla").innerHTML = `<p class="ayuda">Consultando los despachos.</p>`
    try {
      const cuerpo = await api(`/api/paso/despachos?${periodo.consulta}`)
      if (!cuerpo.registros.length) {
        vista.querySelector("#tabla").innerHTML = `<p class="ayuda">${periodo.modo === "mes" ? "No hay despachos en ese mes." : "No hay despachos para esa fecha."}</p>`
        return
      }
      const pendientes = cuerpo.registros.filter((fila) => !fila.documentoSiimed).length
      const puedeGuardar = editable && periodo.modo === "dia"
      const guardar = puedeGuardar
        ? `<div class="acciones"><button class="btn btn-primary" id="guardar" type="button">Guardar</button><span class="ayuda">${pendientes} sin documento</span></div>`
        : `<p class="ayuda">${periodo.modo === "mes" ? `${escapar(cuerpo.desde)} al ${escapar(cuerpo.hasta)}. ` : ""}${cuerpo.registros.length - pendientes} con documento · ${pendientes} sin documento${periodo.modo === "mes" ? ". Para guardar, consulta el día." : ""}</p>`
      vista.querySelector("#tabla").innerHTML = `${guardar}${tablaDespachos(cuerpo.registros, puedeGuardar)}<p class="aviso" id="aviso-tabla"></p>`
      vista.querySelector("#guardar")?.addEventListener("click", guardarDocumentos)
      pegarEncabezado()
    } catch (error) {
      aviso.textContent = error.message
      vista.querySelector("#tabla").innerHTML = ""
    }
  })
}

async function cargarRealizados() {
  const tabla = vista.querySelector("#realizados-tabla")
  const cuenta = vista.querySelector("#realizados-cuenta")
  if (!tabla) return
  try {
    const cuerpo = await api("/api/paso/realizados")
    const filas = cuerpo.realizados || []
    if (cuenta) cuenta.textContent = String(filas.length)
    tabla.innerHTML = filas.length
      ? `<div class="tabla-marco tabla-diferencias"><table><thead><tr><th>DÍA DEL CARGUE</th><th>DOCUMENTO</th><th>CLIENTE</th><th>REFERENCIA</th><th>CANTIDAD</th></tr></thead><tbody>${filas.map((fila) => `<tr><td>${escapar(diaVisible(fila.fecha) || "—")}</td><td>${escapar(fila.documento)}</td><td>${escapar(fila.cliente || "—")}</td><td>${escapar(fila.referencia || "—")}</td><td>${escapar(fila.cantidad ?? "—")}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="ayuda">Todavía no hay cargues guardados.</p>`
  } catch (error) {
    tabla.innerHTML = `<p class="aviso">${escapar(error.message)}</p>`
  }
}

function filtroPeriodo() {
  return `
    <label>Ver por<select name="modo"><option value="dia">Día</option><option value="mes">Mes</option></select></label>
    <label data-modo="dia">Día<input name="fecha" type="date" required /></label>
    <label data-modo="mes" hidden>Mes<input name="mes" type="month" /></label>
  `
}

function enlazarPeriodo(formulario) {
  const modo = formulario.querySelector("[name=modo]")
  const aplicar = () => {
    const mes = modo.value === "mes"
    formulario.querySelectorAll("[data-modo]").forEach((etiqueta) => {
      const activo = etiqueta.dataset.modo === (mes ? "mes" : "dia")
      etiqueta.hidden = !activo
      etiqueta.querySelector("input").required = activo
    })
  }
  modo.addEventListener("change", aplicar)
  aplicar()
}

function periodoDe(formulario) {
  const modo = formulario.querySelector("[name=modo]").value === "mes" ? "mes" : "dia"
  const valor = formulario.querySelector(modo === "mes" ? "[name=mes]" : "[name=fecha]").value
  return { modo, consulta: `${modo === "mes" ? "mes" : "fecha"}=${encodeURIComponent(valor)}` }
}

async function guardarDocumentos() {
  const aviso = vista.querySelector("#aviso-tabla")
  const boton = vista.querySelector("#guardar")
  const fecha = vista.querySelector("#consulta [name=fecha]").value
  const referenciaDe = new Map([...vista.querySelectorAll(".ref")].map((campo) => [campo.dataset.cliente, campo.value]))
  const registros = [...vista.querySelectorAll(".doc")].map((campo) => {
    const cliente = campo.dataset.cliente || ""
    const cantidad = campo.dataset.cantidad
    return {
      detalleId: Number(campo.dataset.detalle),
      vehiculoId: Number(campo.dataset.vehiculo),
      documentoSiimed: campo.value,
      fecha,
      cliente,
      cantidad: cantidad === "" ? null : Number(cantidad),
      referencia: /olimp/i.test(cliente) ? "30-10-100019" : (referenciaDe.get(cliente) || "30-10-24"),
    }
  })
  boton.disabled = true
  aviso.textContent = ""
  try {
    await api("/api/paso/documentos", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registros }),
    })
    aviso.textContent = "Documentos y referencias guardados. Contabilidad ya puede verificarlos."
  } catch (error) {
    aviso.textContent = error.message
  } finally {
    boton.disabled = false
  }
}

function diaVisible(valor) {
  if (!valor) return ""
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ""
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fecha)
}

function fechaVisible(valor) {
  if (!valor) return ""
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ""
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(fecha)
}

let mesContable = ""

function bloqueMes() {
  return `
    <form id="mes" class="acciones">
      <label>Mes<input id="mes-valor" name="mes" type="month" value="${escapar(mesContable)}" required /></label>
      <button class="btn btn-primary" type="submit">Ver mes</button>
    </form>
    <p class="ayuda">Muestra del día 1 al último día del mes que elijas.</p>
    <div id="mes-tabla"></div>
  `
}

async function cargarMes(aviso) {
  const tabla = vista.querySelector("#mes-tabla")
  if (!tabla || !mesContable) return
  tabla.innerHTML = `<p class="ayuda">Consultando el mes.</p>`
  try {
    const cuerpo = await api(`/api/paso/despachos?mes=${encodeURIComponent(mesContable)}`)
    if (!cuerpo.registros.length) {
      tabla.innerHTML = `<p class="ayuda">No hay despachos entre el ${escapar(cuerpo.desde)} y el ${escapar(cuerpo.hasta)}.</p>`
      return
    }
    tabla.innerHTML = `<p class="ayuda">${escapar(cuerpo.desde)} al ${escapar(cuerpo.hasta)} · ${cuerpo.registros.length} clientes.</p>${tablaDespachos(cuerpo.registros, false)}`
  } catch (error) {
    if (aviso) aviso.textContent = error.message
    tabla.innerHTML = ""
  }
}

function enlazarMes() {
  const formulario = vista.querySelector("#mes")
  if (!formulario) return
  formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault()
    mesContable = vista.querySelector("#mes-valor").value
    await cargarMes(vista.querySelector("#aviso"))
  })
  if (mesContable) cargarMes(vista.querySelector("#aviso"))
}

function firmaResultado(resultado, realizados) {
  const cruce = (resultado?.filas || []).map((fila) => `${fila.requiereRevision ? 1 : 0}:${fila.motivo || ""}`).join("|")
  const hechos = (realizados || []).map((fila) => `${fila.documento}:${fila.fecha || ""}`).join("|")
  return `${cruce}#${hechos}`
}

function vistaRevision(guardado) {
  const conservado = Boolean(guardado?.archivo)
  const archivo = conservado
    ? `<p class="ayuda">Archivo en uso: ${escapar(guardado.archivo)}${guardado.fecha ? ` · cargado ${escapar(fechaVisible(guardado.fecha))}` : ""}. Al recargar, y cada 15 segundos, el cruce se actualiza con lo que guardó Logística. No hace falta volver a subir el archivo.</p>`
    : `<p class="ayuda">Carga el Excel una vez. Después queda guardado y el cruce se actualiza con lo que registra Logística.</p>`
  return `
    <div class="revision-fija">
      ${regresoAdmin()}
      <h2>Paso de comprobantes entre empresas</h2>
      <p class="ayuda">Cada renglón se relaciona con Logística por el documento SIMED (tipo, comprobante y número) y por la referencia de la caja (código de línea, grupo y producto).</p>
      ${archivo}
      <form id="plano"${conservado ? ` data-conservado="1"` : ""}>
        <label>${conservado ? "Reemplazar archivo" : "Paso de comprobantes entre empresas"}<input name="excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${conservado ? "" : " required"} /></label>
        <div class="acciones"><button class="btn btn-primary" type="submit">${conservado ? "Reemplazar y cruzar" : "Cargar y cruzar"}</button></div>
        <p class="aviso" id="aviso"></p>
      </form>
    </div>
    <div id="resultado" data-firma="${escapar(firmaResultado(guardado?.resultado, guardado?.realizados))}">${bloqueResultado(guardado)}</div>
  `
}

function apartadoRealizados(lista) {
  const filas = lista || []
  const cuerpo = filas.length
    ? `<div class="tabla-marco tabla-diferencias"><table><thead><tr><th>DÍA DEL CARGUE</th><th>DOCUMENTO</th><th>CLIENTE</th><th>REFERENCIA</th><th>CANTIDAD</th></tr></thead><tbody>${filas.map((fila) => `<tr><td>${escapar(fechaVisible(fila.fecha) || "—")}</td><td>${escapar(fila.documento)}</td><td>${escapar(fila.cliente || "—")}</td><td>${escapar(fila.referencia || "—")}</td><td>${escapar(fila.cantidad ?? "—")}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="ayuda">Logística todavía no registra documentos.</p>`
  return `<details class="desplegable realizado"><summary>Realizados <span>${filas.length}</span></summary><div class="cuerpo">${cuerpo}</div></details>`
}

function bloqueResultado(guardado) {
  const resultado = guardado?.resultado
  const hechos = apartadoRealizados(guardado?.realizados)
  if (resultado?.encabezados?.length) return `${hechos}${tablaRevision(resultado)}`
  return `${hechos}<p class="ayuda">Carga el Excel para cruzarlo con el documento SIMED y la referencia que registró Logística.</p>`
}

function detenerRefresco() {
  if (refrescoContable) clearInterval(refrescoContable)
  refrescoContable = 0
}

function pintarResultado(guardado) {
  const zona = vista.querySelector("#resultado")
  if (!zona) return
  const abierto = zona.querySelector("details.desplegable")?.open
  zona.dataset.firma = firmaResultado(guardado?.resultado, guardado?.realizados)
  zona.innerHTML = bloqueResultado(guardado)
  if (abierto) {
    const detalle = zona.querySelector("details.desplegable")
    if (detalle) detalle.open = true
  }
  enlazarCeldas()
}

async function pantallaContabilidad() {
  detenerRefresco()
  lede.textContent = `${sesion.usuario} · ${NOMBRES[sesion.perfil]}`
  salir.hidden = false
  panel(`<h2>Paso de comprobantes entre empresas</h2><p class="ayuda">Cargando.</p>`)
  let guardado = { resultado: null }
  try {
    guardado = await api("/api/paso/revision")
  } catch (error) {
    guardado = { resultado: null, aviso: error.message }
  }
  panel(vistaRevision(guardado))
  if (guardado.aviso) {
    const aviso = vista.querySelector("#aviso")
    if (aviso) aviso.textContent = guardado.aviso
  }
  enlazarRevision()
}

function iniciarRefresco() {
  detenerRefresco()
  if (!vista.querySelector("#plano")?.dataset.conservado) return
  refrescoContable = setInterval(async () => {
    if (ruta().seccion !== "contabilidad") {
      detenerRefresco()
      return
    }
    try {
      const nuevo = await api("/api/paso/revision")
      const zona = vista.querySelector("#resultado")
      if (!zona || !nuevo?.resultado) return
      if (zona.dataset.firma === firmaResultado(nuevo.resultado, nuevo.realizados)) return
      pintarResultado(nuevo)
    } catch {
      /* la próxima vuelta vuelve a intentar */
    }
  }, 15000)
}

function pegarEncabezado() {
  const marco = document.querySelector(".tabla-ancha")
  const celdas = marco?.querySelectorAll("thead th")
  if (!celdas?.length) return
  const caja = marco.getBoundingClientRect()
  const alto = celdas[0].offsetHeight
  const desplazamiento = Math.min(Math.max(-caja.top, 0), Math.max(caja.height - alto, 0))
  const valor = desplazamiento ? `translateY(${desplazamiento}px)` : ""
  celdas.forEach((celda) => { celda.style.transform = valor })
}

function enlazarCeldas() {
  pegarEncabezado()
  vista.querySelectorAll("td.diferencia").forEach((celda) => {
    celda.addEventListener("click", () => {
      vista.querySelectorAll("td.diferencia.sel").forEach((otra) => otra.classList.remove("sel"))
      celda.classList.add("sel")
      const detalle = vista.querySelector("#detalle")
      if (detalle) detalle.textContent = celda.dataset.detalle || ""
    })
  })
}

function enlazarRevision() {
  enlazarCeldas()
  iniciarRefresco()
  vista.querySelector("#plano")?.addEventListener("submit", async (evento) => {
    evento.preventDefault()
    const aviso = vista.querySelector("#aviso")
    const boton = evento.target.querySelector("button")
    aviso.textContent = ""
    boton.disabled = true
    try {
      const respuesta = await fetch("/api/paso/revision", { method: "POST", body: new FormData(evento.target) })
      const cuerpo = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo cruzar el archivo.")
      panel(vistaRevision(cuerpo))
      enlazarRevision()
    } catch (error) {
      aviso.textContent = error.message
      boton.disabled = false
    }
  })
}

async function pantallaCarga(id, opciones = {}) {
  lede.textContent = `${sesion.usuario} · ${NOMBRES[sesion.perfil]}`
  salir.hidden = false
  panel(`<h2>Documento de Logística</h2><p class="ayuda">Cargando.</p>`)
  try {
    const carga = await api(`/api/paso/cargas/${encodeURIComponent(id)}`)
    const resultado = carga.resultado
    const revision = resultado?.encabezados?.length ? tablaRevision(resultado) : `<p class="ayuda">Sube el archivo de Contabilidad para cruzarlo con el documento de Logística.</p>`
    panel(`
      ${opciones.inicio ? regresoAdmin() : `<p><a href="#contabilidad">Volver</a></p>`}
      <h2>Revisión del documento</h2>
      <p class="ayuda">Logística subió ${escapar(carga.archivo)} el ${escapar(fechaVisible(carga.fechaCarga))}. El cruce usa tipo de documento, comprobante y número, y la secuencia del renglón.</p>
      ${revision}
      <form id="plano">
        <label>Paso de comprobantes entre empresas<input name="excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
        <p class="ayuda">Sube el Excel con la hoja Hoja1: tipo de documento, comprobante, número, secuencia, identificación y centro de costo.</p>
        <div class="acciones"><button class="btn btn-primary" type="submit">Subir y comparar</button></div>
        <p class="aviso" id="aviso"></p>
      </form>
    `)
    vista.querySelectorAll("td.diferencia").forEach((celda) => {
      celda.addEventListener("click", () => {
        vista.querySelectorAll("td.diferencia.sel").forEach((otra) => otra.classList.remove("sel"))
        celda.classList.add("sel")
        const detalle = vista.querySelector("#detalle")
        if (detalle) detalle.textContent = celda.dataset.detalle || ""
      })
    })
    vista.querySelector("#plano").addEventListener("submit", async (evento) => {
      evento.preventDefault()
      const aviso = vista.querySelector("#aviso")
      const boton = evento.target.querySelector("button")
      aviso.textContent = ""
      boton.disabled = true
      try {
        const respuesta = await fetch(`/api/paso/cargas/${encodeURIComponent(id)}/excel`, { method: "POST", body: new FormData(evento.target) })
        const cuerpo = await respuesta.json().catch(() => ({}))
        if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo comparar el archivo.")
        await pantallaCarga(id, opciones)
      } catch (error) {
        aviso.textContent = error.message
        boton.disabled = false
      }
    })
  } catch (error) {
    panel(`<p><a href="#contabilidad">Volver</a></p><h2>Documento de Logística</h2><p class="aviso">${escapar(error.message)}</p>`)
  }
}

function tablaRevision(resultado) {
  const encabezados = resultado.encabezados || []
  const centro = encabezados.indexOf("CÓD. CENTRO DE COSTO")
  const cantidad = encabezados.indexOf("CANTIDAD")
  const conDiferencias = (resultado.filas || []).filter((fila) => fila.requiereRevision)
  const aviso = resultado.resumen?.sinDiferencias
    ? `<p class="sin-diferencias">Sin diferencias</p>`
    : `<p class="aviso">${conDiferencias.length} renglones con diferencias. El detalle está en el apartado de abajo y también en las celdas resaltadas.</p>`
  const apartado = conDiferencias.length
    ? `<details class="desplegable">
        <summary>Diferencias <span>${conDiferencias.length}</span></summary>
        <div class="cuerpo">
          <div class="tabla-marco tabla-diferencias"><table><thead><tr><th>DOCUMENTO</th><th>REFERENCIA</th><th>CLIENTE</th><th>CENTRO CARGADO</th><th>CENTRO CORRECTO</th><th>QUÉ REVISAR</th></tr></thead><tbody>${conDiferencias.map((fila) => `<tr class="alerta"><td>${escapar(`${fila.valores?.[0] || ""}${fila.valores?.[1] || ""}-${fila.valores?.[2] || ""}`)}</td><td>${escapar(fila.referencia || "—")}</td><td>${escapar(fila.cliente || "Sin cliente en el H7")}</td><td>${escapar(fila.centroRegistrado || "Vacío")}</td><td>${escapar(fila.centroEsperado || "—")}</td><td class="motivo">${escapar(fila.motivo)}</td></tr>`).join("")}</tbody></table></div>
        </div>
      </details>`
    : ""
  const pendientes = (resultado.pendientesLogistica || []).map((linea) => `<li>${escapar(linea.clave)} · ${escapar(linea.motivo)}</li>`).join("")
  const cuerpo = (resultado.filas || []).map((fila) => {
    const celdas = encabezados.map((encabezado, indice) => {
      const valor = fila.valores?.[indice] ?? ""
      let detalle = ""
      const columnasCruce = new Set(["TIPO DE DOCUMENTO", "COMPROBANTE", "NÚMERO", "CÓDIGO LÍNEA", "CÓDIGO GRUPO", "CÓDIGO PRODUCTO"])
      if (indice === centro && fila.diferencias?.centro) detalle = fila.diferencias.centro.motivo
      if (indice === cantidad && fila.diferencias?.cantidad) detalle = fila.diferencias.cantidad.motivo
      if (fila.diferencias?.cruce && columnasCruce.has(encabezado)) detalle = fila.diferencias.cruce
      const marca = detalle ? ` class="diferencia" data-detalle="${escapar(detalle)}"` : ""
      return `<td${marca}>${escapar(valor)}</td>`
    }).join("")
    return `<tr>${celdas}</tr>`
  }).join("")
  return `
    <div class="revision-resumen">
      ${aviso}
      ${apartado}
      ${resultado.resumen?.sinDiferencias ? "" : `<p id="detalle" class="ayuda">Selecciona una celda resaltada para ver el detalle.</p>`}
      ${pendientes ? `<h3>Pendiente de cruce</h3><ul>${pendientes}</ul>` : ""}
    </div>
    <div class="tabla-marco tabla-ancha"><table><thead><tr>${encabezados.map((encabezado) => `<th>${escapar(encabezado)}</th>`).join("")}</tr></thead><tbody>${cuerpo}</tbody></table></div>
  `
}

function pantallaLogistica(confirmacion) {
  lede.textContent = `${sesion.usuario} · ${NOMBRES[sesion.perfil]}`
  salir.hidden = false
  const hecho = confirmacion
    ? `<div class="dato"><strong>Documento cargado</strong><span>${escapar(confirmacion.archivo)} · ${escapar(fechaVisible(confirmacion.fechaCarga))}</span><span>${escapar(confirmacion.estado)}</span></div>`
    : ""
  panel(`
    ${regresoAdmin()}
    <h2>Cargar documento de SIMED</h2>
    <p class="ayuda">Sube el documento de SIMED. Contabilidad carga su propio archivo y revisa el cruce.</p>
    ${hecho}
    <form id="carga">
      <label>Documento de SIMED<input name="documento" type="file" accept="application/json,.json" required /></label>
      <div class="acciones"><button class="btn btn-primary" type="submit">Cargar</button></div>
      <p class="aviso" id="aviso"></p>
    </form>
  `)
  vista.querySelector("#carga").addEventListener("submit", async (evento) => {
    evento.preventDefault()
    const aviso = vista.querySelector("#aviso")
    const boton = evento.target.querySelector("button")
    aviso.textContent = ""
    boton.disabled = true
    try {
      const respuesta = await fetch("/api/paso/cargas", { method: "POST", body: new FormData(evento.target) })
      const cuerpo = await respuesta.json().catch(() => ({}))
      if (!respuesta.ok) throw new Error(cuerpo.error || "No se pudo cargar el documento.")
      pantallaLogistica(cuerpo)
    } catch (error) {
      aviso.textContent = error.message
      boton.disabled = false
    }
  })
}

function pantallaAdmin() {
  lede.textContent = `${sesion.usuario} · Administrador`
  salir.hidden = false
  panel(`
    <h2>Administrador</h2>
    <p class="ayuda">Abre la carga de Logística, la revisión de Contabilidad o las cuentas de acceso.</p>
    <div class="perfiles">
      <a class="btn btn-primary" href="#usuarios">Usuarios</a>
      <a class="btn btn-ghost" href="#logistica">Registrar documento y referencia</a>
      <a class="btn btn-ghost" href="#contabilidad">Cargar el Excel y revisar</a>
    </div>
    <p class="secreto"><a href="#uso">Uso del programa</a></p>
  `)
}

const PERFILES_USUARIO = [
  ["logistica", "Logística"],
  ["contabilidad", "Contabilidad"],
  ["admin", "Administrador"],
]

function pantallaUso() {
  lede.textContent = `${sesion.usuario} · Administrador`
  salir.hidden = false
  panel(`
    <p><a href="#admin">Volver al inicio</a></p>
    <h2>Uso del programa</h2>
    <p class="ayuda">Esta guía solo la ve el administrador.</p>
    <h3>Logística</h3>
    <p class="ayuda">Elige la fecha y consulta. La tabla sale de SIRT: cliente, cantidad, lote y el resto. Logística solo escribe el documento SIMED, por ejemplo H7-403, y confirma la referencia de la caja. Olímpica queda siempre en 30-10-100019. Los demás parten de 30-10-24 y pueden elegir 30-10-25, 30-10-26 o 30-10-45. Si un texto es largo, la flecha lo abre. Guardar deja el documento listo para Contabilidad. La fecha del cargue se guarda sola y no se muestra en esta tabla.</p>
    <h3>Contabilidad</h3>
    <p class="ayuda">Sube una vez el Excel de paso de comprobantes. Queda guardado: al recargar, y cada 15 segundos, se vuelve a cruzar con lo que Logística haya guardado. El encabezado de las columnas se queda fijo al bajar. Hacia los lados solo se mueve la tabla. El centro de costo correcto es 309 para Olímpica y 600 para los demás. Las unidades se comparan con las que Logística registró para ese documento y esa referencia. Si falta el cruce o no coinciden, la celda queda marcada y el detalle está en Diferencias. Realizados lista los documentos que ya se cargaron, con el día, el cliente, la referencia y la cantidad.</p>
    <h3>Administrador</h3>
    <p class="ayuda">Puede abrir Logística y Contabilidad. En Usuarios crea, edita y elimina las cuentas. Siempre debe quedar al menos un administrador, y no se puede borrar la cuenta con la que se entró. Esta guía no aparece para los otros roles.</p>
  `)
}

async function pantallaUsuarios() {
  lede.textContent = `${sesion.usuario} · Administrador`
  salir.hidden = false
  panel(`<h2>Usuarios</h2><p class="ayuda">Cargando.</p>`)
  try {
    const cuentas = await api("/api/paso/usuarios")
    dibujarUsuarios(cuentas)
  } catch (error) {
    panel(`<p><a href="#admin">Volver al inicio</a></p><h2>Usuarios</h2><p class="aviso">${escapar(error.message)}</p>`)
  }
}

function dibujarUsuarios(cuentas, edicion = null) {
  const opciones = PERFILES_USUARIO.map(([valor, etiqueta]) => `<option value="${valor}"${edicion?.perfil === valor ? " selected" : ""}>${etiqueta}</option>`).join("")
  const filas = cuentas.map((cuenta) => `
    <tr>
      <td>${escapar(cuenta.usuario)}</td>
      <td>${escapar(cuenta.nombre)}</td>
      <td>${escapar(NOMBRES[cuenta.perfil] || cuenta.perfil)}</td>
      <td class="acciones">
        <button class="btn btn-ghost" type="button" data-editar="${escapar(cuenta.usuario)}">Editar</button>
        <button class="btn btn-ghost" type="button" data-eliminar="${escapar(cuenta.usuario)}"${cuenta.usuario === sesion.cuenta ? " disabled" : ""}>Eliminar</button>
      </td>
    </tr>
  `).join("")
  panel(`
    <p><a href="#admin">Volver al inicio</a></p>
    <h2>Usuarios</h2>
    <p class="ayuda">${edicion ? `Editando ${escapar(edicion.usuario)}. Deja la clave vacía si no quieres cambiarla.` : "Crea una cuenta para Logística, Contabilidad o Administrador."}</p>
    <form id="cuenta" class="rejilla-cuenta">
      <input type="hidden" name="original" value="${escapar(edicion?.usuario || "")}" />
      <label>Usuario<input name="usuario" type="text" maxlength="80" required value="${escapar(edicion?.usuario || "")}" /></label>
      <label>Nombre<input name="nombre" type="text" maxlength="80" required value="${escapar(edicion?.nombre || "")}" /></label>
      <label>Perfil<select name="perfil">${opciones}</select></label>
      <label>Clave<input name="clave" type="password" maxlength="80" ${edicion ? "" : "required"} placeholder="${edicion ? "Sin cambio" : ""}" /></label>
      <div class="acciones">
        <button class="btn btn-primary" type="submit">${edicion ? "Guardar cambios" : "Agregar"}</button>
        ${edicion ? `<button class="btn btn-ghost" type="button" id="cancelar-cuenta">Cancelar</button>` : ""}
      </div>
      <p class="aviso" id="aviso"></p>
    </form>
    <div class="tabla-marco tabla-diferencias"><table><thead><tr><th>USUARIO</th><th>NOMBRE</th><th>PERFIL</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
  `)
  vista.querySelector("#cancelar-cuenta")?.addEventListener("click", () => dibujarUsuarios(cuentas))
  vista.querySelectorAll("[data-editar]").forEach((boton) => {
    boton.addEventListener("click", () => dibujarUsuarios(cuentas, cuentas.find((cuenta) => cuenta.usuario === boton.dataset.editar)))
  })
  vista.querySelectorAll("[data-eliminar]").forEach((boton) => {
    boton.addEventListener("click", async () => {
      if (!confirm(`Eliminar el usuario ${boton.dataset.eliminar}?`)) return
      try {
        await api(`/api/paso/usuarios/${encodeURIComponent(boton.dataset.eliminar)}`, { method: "DELETE" })
        await pantallaUsuarios()
      } catch (error) {
        vista.querySelector("#aviso").textContent = error.message
      }
    })
  })
  vista.querySelector("#cuenta").addEventListener("submit", async (evento) => {
    evento.preventDefault()
    const aviso = vista.querySelector("#aviso")
    const datos = new FormData(evento.target)
    const original = datos.get("original")
    const cuerpo = {
      usuario: datos.get("usuario"),
      nombre: datos.get("nombre"),
      perfil: datos.get("perfil"),
      clave: datos.get("clave"),
    }
    aviso.textContent = ""
    try {
      if (original) await api(`/api/paso/usuarios/${encodeURIComponent(original)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      else await api("/api/paso/usuarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) })
      await pantallaUsuarios()
    } catch (error) {
      aviso.textContent = error.message
    }
  })
}

function puede(seccion) {
  if (sesion.perfil === "admin") return true
  if (sesion.perfil === "logistica") return seccion === "logistica"
  return seccion === "contabilidad"
}

async function dibujar() {
  detenerRefresco()
  const { seccion, id } = ruta()
  if (!sesion.perfil) {
    entrada()
    return
  }
  if (!puede(seccion)) {
    location.hash = destino(sesion.perfil)
    return
  }
  if (seccion === "contabilidad") {
    pantallaContabilidad()
    return
  }
  if (seccion === "logistica") {
    pantallaDespachos()
    return
  }
  if (seccion === "admin") {
    pantallaAdmin()
    return
  }
  if (seccion === "usuarios") {
    pantallaUsuarios()
    return
  }
  if (seccion === "uso") {
    pantallaUso()
    return
  }
  pantallaDespachos()
}

salir.addEventListener("click", async () => {
  await api("/api/paso/sesion", { method: "DELETE" }).catch(() => {})
  sesion = { perfil: null, usuario: null }
  entrada()
})

window.addEventListener("hashchange", dibujar)
window.addEventListener("scroll", pegarEncabezado, { passive: true })
window.addEventListener("resize", pegarEncabezado)

const actual = await api("/api/paso/sesion")
sesion = actual.perfil ? actual : { perfil: null, usuario: null }
if (sesion.perfil && location.hash !== `#${destino(sesion.perfil)}` && !puede(ruta().seccion)) location.hash = destino(sesion.perfil)
else if (sesion.perfil && !location.hash) location.hash = destino(sesion.perfil)
else dibujar()
