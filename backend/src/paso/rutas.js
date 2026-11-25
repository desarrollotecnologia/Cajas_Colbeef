import express, { Router } from "express"
import { conexion } from "../db.js"
import { listarDespachos } from "../despachos.js"
import { interpretarConsulta } from "../filtros.js"
import { confirmacion, contenidoSimed, crearCarga, guardarExcelContable, guardarResultadoContable, guardarRevision, leerExcelGuardado, leerResultadoContable, listarCargas, obtenerCarga } from "./almacen.js"
import { aplicarDocumentos, guardarDocumentos, listarRealizados, registrosParaCruce } from "./documentos.js"
import { aplicarReferencias, guardarReferencias, REFERENCIAS_CAJA } from "./referencias.js"
import { leerExcelContable, leerSimed } from "./simed.js"
import { actualizarCuenta, autenticar, crearCuenta, eliminarCuenta, listarCuentas } from "./cuentas.js"
import { abrirSesion, cerrarSesion, sesionDe, tokenDe } from "./sesion.js"
import { maestroDesdeEmpresas, validarContraLogistica, validarFilas } from "./validar.js"
import { totalizarPorCliente } from "./totalizar.js"

export const rutasPaso = Router()
rutasPaso.use(express.json({ limit: "1mb" }))

function fallo(estado, mensaje) {
  const error = new Error(mensaje)
  error.estado = estado
  return error
}

function exigir(req, perfil) {
  const sesion = sesionDe(tokenDe(req))
  if (!sesion) throw fallo(401, "Entra con tu usuario para continuar.")
  if (sesion.perfil !== perfil && sesion.perfil !== "admin") {
    throw fallo(403, perfil === "contabilidad"
      ? "No tienes acceso a la revisión de Contabilidad."
      : "La carga del documento de SIMED corresponde a Logística.")
  }
  return sesion
}

rutasPaso.post("/sesion", (req, res, next) => {
  try {
    const cuenta = autenticar(req.body?.usuario, req.body?.clave)
    if (!cuenta) throw fallo(401, "Usuario o clave incorrectos.")
    const token = abrirSesion(cuenta.perfil, cuenta.usuario, cuenta.cuenta)
    res.setHeader("Set-Cookie", `paso=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`)
    res.json(cuenta)
  } catch (error) {
    next(error)
  }
})

rutasPaso.delete("/sesion", (req, res) => {
  cerrarSesion(tokenDe(req))
  res.setHeader("Set-Cookie", "paso=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0")
  res.json({ ok: true })
})

rutasPaso.get("/sesion", (req, res) => {
  const sesion = sesionDe(tokenDe(req))
  if (!sesion) {
    res.json({ perfil: null })
    return
  }
  res.json({ perfil: sesion.perfil, usuario: sesion.usuario, cuenta: sesion.cuenta || null })
})

function exigirAdmin(req) {
  const sesion = sesionDe(tokenDe(req))
  if (!sesion) throw fallo(401, "Entra con tu usuario para continuar.")
  if (sesion.perfil !== "admin") throw fallo(403, "Solo el administrador gestiona los usuarios.")
  return sesion
}

rutasPaso.get("/usuarios", (req, res, next) => {
  try {
    exigirAdmin(req)
    res.json(listarCuentas())
  } catch (error) {
    next(error)
  }
})

rutasPaso.post("/usuarios", (req, res, next) => {
  try {
    exigirAdmin(req)
    res.status(201).json(crearCuenta(req.body || {}))
  } catch (error) {
    next(error)
  }
})

rutasPaso.put("/usuarios/:usuario", (req, res, next) => {
  try {
    exigirAdmin(req)
    res.json(actualizarCuenta(req.params.usuario, req.body || {}))
  } catch (error) {
    next(error)
  }
})

rutasPaso.delete("/usuarios/:usuario", (req, res, next) => {
  try {
    const sesion = exigirAdmin(req)
    if (sesion.cuenta && sesion.cuenta === String(req.params.usuario)) {
      throw fallo(400, "No puedes eliminar el usuario con el que entraste.")
    }
    eliminarCuenta(req.params.usuario)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

function leerMultipart(req) {
  return new Promise((resolve, reject) => {
    const tipo = req.headers["content-type"] || ""
    const coincidencia = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(tipo)
    if (!coincidencia) {
      reject(fallo(400, "Adjunta el archivo."))
      return
    }
    const boundary = Buffer.from(`--${coincidencia[1] || coincidencia[2]}`)
    const trozos = []
    let tamano = 0
    req.on("data", (trozo) => {
      tamano += trozo.length
      if (tamano > 12 * 1024 * 1024) {
        reject(fallo(400, "El archivo supera el tamaño permitido."))
        req.destroy()
        return
      }
      trozos.push(trozo)
    })
    req.on("error", reject)
    req.on("end", () => {
      const cuerpo = Buffer.concat(trozos)
      const archivos = []
      let inicio = cuerpo.indexOf(boundary)
      while (inicio !== -1) {
        const siguiente = cuerpo.indexOf(boundary, inicio + boundary.length)
        if (siguiente === -1) break
        const parte = cuerpo.subarray(inicio + boundary.length, siguiente)
        const corte = parte.indexOf("\r\n\r\n")
        if (corte !== -1) {
          const encabezado = parte.subarray(0, corte).toString("utf8")
          let contenido = parte.subarray(corte + 4)
          if (contenido.length >= 2 && contenido.subarray(-2).toString() === "\r\n") contenido = contenido.subarray(0, -2)
          archivos.push({
            campo: /name="([^"]+)"/.exec(encabezado)?.[1] || "",
            nombre: /filename="([^"]*)"/.exec(encabezado)?.[1] || "",
            contenido,
          })
        }
        inicio = siguiente
      }
      resolve(archivos)
    })
  })
}

async function maestroDe(identificaciones) {
  const bases = [...new Set(identificaciones.map((id) => String(id || "").trim()).filter(Boolean))]
  if (!bases.length) return new Map()
  try {
    const { rows } = await conexion().query(
      `SELECT nombre, nit
       FROM organizaciones.empresa
       WHERE split_part(nit, '-', 1) = ANY($1::text[])`,
      [bases],
    )
    return maestroDesdeEmpresas(rows)
  } catch (error) {
    console.error("sirt", error.code || "maestro")
    return new Map()
  }
}

function documentoLimpio(valor) {
  const texto = String(valor ?? "").trim().replace(/\s+/g, " ")
  if (!texto) return null
  if (texto.length > 40) throw fallo(400, "El documento SIMED admite hasta 40 caracteres.")
  return texto
}

function rangoMes(mes) {
  const partes = /^(\d{4})-(\d{2})$/.exec(String(mes || ""))
  if (!partes) return null
  const anio = Number(partes[1])
  const numero = Number(partes[2])
  if (numero < 1 || numero > 12) return null
  const ultimo = new Date(Date.UTC(anio, numero, 0)).getUTCDate()
  return {
    desde: `${partes[1]}-${partes[2]}-01`,
    hasta: `${partes[1]}-${partes[2]}-${String(ultimo).padStart(2, "0")}`,
  }
}

rutasPaso.get("/despachos", async (req, res, next) => {
  try {
    exigirAlguno(req)
    const mes = rangoMes(req.query.mes)
    const fecha = mes ? mes.desde : String(req.query.fecha || "")
    const hasta = mes ? mes.hasta : fecha
    const filtros = interpretarConsulta({ desde: fecha, hasta, campo: "fecha", pagina: "1", limite: "1" })
    const registros = await aplicarDocumentos(await listarDespachos(filtros))
    res.json({
      fecha,
      mes: mes ? String(req.query.mes) : null,
      desde: fecha,
      hasta,
      registros: await aplicarReferencias(totalizarPorCliente(registros), fecha),
    })
  } catch (error) {
    next(error)
  }
})

rutasPaso.put("/documentos", async (req, res, next) => {
  try {
    const sesion = exigir(req, "logistica")
    const lista = req.body?.registros
    if (!Array.isArray(lista) || !lista.length) throw fallo(400, "No hay documentos para guardar.")
    const registros = lista.map((item) => {
      const detalleId = Number(item?.detalleId)
      const vehiculoId = Number(item?.vehiculoId)
      if (!Number.isInteger(detalleId) || !Number.isInteger(vehiculoId) || detalleId < 1 || vehiculoId < 1) {
        throw fallo(400, "Cada fila debe identificar el despacho.")
      }
      const cantidad = item?.cantidad === null || item?.cantidad === undefined || item?.cantidad === "" ? null : Number(item.cantidad)
      return {
        detalleId,
        vehiculoId,
        documento: documentoLimpio(item?.documentoSiimed),
        referencia: /olimp/i.test(String(item?.cliente || ""))
          ? "30-10-100019"
          : (REFERENCIAS_CAJA.includes(String(item?.referencia || "")) ? String(item.referencia) : null),
        cliente: String(item?.cliente || "").trim() || null,
        cantidad: Number.isFinite(cantidad) ? cantidad : null,
      }
    })
    await guardarDocumentos(registros, sesion.usuario)
    const referencias = lista.flatMap((item) => {
      const cliente = String(item?.cliente || "").trim()
      const fecha = String(item?.fecha || "").trim()
      const referencia = String(item?.referencia || "").trim()
      if (!cliente || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !REFERENCIAS_CAJA.includes(referencia)) return []
      return [{ fecha, cliente, referencia }]
    })
    if (referencias.length) await guardarReferencias(referencias, sesion.usuario)
    res.json({ guardados: registros.length })
  } catch (error) {
    next(error)
  }
})

async function completarClientes(registros) {
  const faltantes = [...new Set(registros.filter((registro) => registro.detalleId && !registro.cliente).map((registro) => registro.detalleId))]
  if (!faltantes.length) return registros
  try {
    const { rows } = await conexion().query(
      `SELECT odd.id, cliente.nombre
       FROM desposte.orden_despacho_detalle odd
       JOIN desposte.orden_despacho od ON od.id = odd.id_orden_despacho
       JOIN organizaciones.empresa cliente ON cliente.id = od.id_empresa
       WHERE odd.id = ANY($1::bigint[])`,
      [faltantes],
    )
    const nombres = new Map(rows.map((fila) => [String(fila.id), fila.nombre]))
    return registros.map((registro) => (
      registro.cliente || !registro.detalleId
        ? registro
        : { ...registro, cliente: nombres.get(String(registro.detalleId)) || null }
    ))
  } catch (error) {
    console.error("sirt", error.code || "cliente")
    return registros
  }
}

function exigirAlguno(req) {
  const sesion = sesionDe(tokenDe(req))
  if (!sesion) throw fallo(401, "Entra con tu usuario para continuar.")
  return sesion
}

rutasPaso.post("/cargas", async (req, res, next) => {
  try {
    const sesion = exigir(req, "logistica")
    const archivos = await leerMultipart(req)
    const documento = archivos.find((archivo) => archivo.campo === "documento" && archivo.nombre)
    if (!documento || !documento.contenido.length) throw fallo(400, "Adjunta el documento de SIMED.")
    const proceso = crearCarga({
      archivo: documento.nombre.split(/[\\/]/).pop(),
      usuario: sesion.usuario,
      contenido: documento.contenido,
    })
    res.status(201).json(confirmacion(proceso))
  } catch (error) {
    next(error)
  }
})

rutasPaso.get("/cargas", (req, res, next) => {
  try {
    exigir(req, "contabilidad")
    res.json({ cargas: listarCargas() })
  } catch (error) {
    next(error)
  }
})

rutasPaso.get("/cargas/:id", (req, res, next) => {
  try {
    exigir(req, "contabilidad")
    const proceso = obtenerCarga(req.params.id)
    if (!proceso) throw fallo(404, "No existe esa carga.")
    let simed = { legible: false, documentos: [], lineas: [] }
    try {
      simed = leerSimed(contenidoSimed(proceso.id))
    } catch {
      simed = { legible: false, documentos: [], lineas: [] }
    }
    res.json({
      ...confirmacion(proceso),
      simed: { legible: simed.legible, documentos: simed.documentos },
      resultado: proceso.resultado,
    })
  } catch (error) {
    next(error)
  }
})

async function cruzarExcel(contenido) {
  const libro = await leerExcelContable(contenido)
  const registros = await completarClientes(await registrosParaCruce())
  const resultado = validarContraLogistica(libro.filas, registros)
  resultado.encabezados = libro.encabezados
  return resultado
}

rutasPaso.get("/revision", async (req, res, next) => {
  try {
    exigir(req, "contabilidad")
    const guardado = await leerExcelGuardado()
    const realizados = await listarRealizados()
    if (!guardado) {
      const previo = await leerResultadoContable()
      res.json({ ...(previo || { resultado: null, archivo: null }), realizados })
      return
    }
    try {
      const resultado = await cruzarExcel(guardado.contenido)
      const respuesta = { fecha: guardado.fecha, archivo: guardado.archivo, resultado, realizados }
      await guardarResultadoContable(resultado, { fecha: guardado.fecha, archivo: guardado.archivo })
      res.json(respuesta)
    } catch (error) {
      const previo = await leerResultadoContable()
      if (!previo?.resultado) throw error
      res.json({ ...previo, archivo: guardado.archivo, realizados })
    }
  } catch (error) {
    next(error)
  }
})

rutasPaso.post("/revision", async (req, res, next) => {
  try {
    exigir(req, "contabilidad")
    const archivos = await leerMultipart(req)
    const excel = archivos.find((archivo) => archivo.campo === "excel" && archivo.nombre)
    if (!excel || !excel.contenido.length) throw fallo(400, "Adjunta el Excel de paso de comprobantes.")
    const meta = await guardarExcelContable(excel.contenido, excel.nombre)
    const resultado = await cruzarExcel(excel.contenido)
    const guardado = await guardarResultadoContable(resultado, meta)
    res.json({ ...guardado, realizados: await listarRealizados() })
  } catch (error) {
    next(error)
  }
})

rutasPaso.post("/cargas/:id/excel", async (req, res, next) => {
  try {
    exigir(req, "contabilidad")
    const proceso = obtenerCarga(req.params.id)
    if (!proceso) throw fallo(404, "No existe esa carga.")
    const archivos = await leerMultipart(req)
    const excel = archivos.find((archivo) => archivo.campo === "excel" && archivo.nombre)
    if (!excel || !excel.contenido.length) throw fallo(400, "Adjunta el Excel de paso de comprobantes.")
    const libro = await leerExcelContable(excel.contenido)
    let simed = { lineas: [] }
    try {
      simed = leerSimed(contenidoSimed(proceso.id))
    } catch {
      simed = { lineas: [] }
    }
    const maestro = await maestroDe(libro.filas.map((fila) => fila.identificacion))
    const resultado = validarFilas(libro.filas, simed.lineas, maestro)
    resultado.encabezados = libro.encabezados
    const actualizado = guardarRevision(proceso.id, { excel: excel.contenido, resultado })
    res.json({ ...confirmacion(actualizado), resultado })
  } catch (error) {
    next(error)
  }
})
