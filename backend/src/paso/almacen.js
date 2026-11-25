import { randomUUID } from "node:crypto"
import { guardarExcelMysql, guardarResultadoMysql, leerExcelMysql, leerResultadoMysql, usarMysql } from "./mysql.js"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = process.env.PASO_DATOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "paso")

function asegurar() {
  mkdirSync(join(raiz, "archivos"), { recursive: true })
}

function rutaProcesos() {
  return join(raiz, "procesos.json")
}

function leer() {
  asegurar()
  try {
    return JSON.parse(readFileSync(rutaProcesos(), "utf8"))
  } catch {
    return []
  }
}

function guardar(procesos) {
  asegurar()
  writeFileSync(rutaProcesos(), JSON.stringify(procesos), "utf8")
}

export function crearCarga({ archivo, usuario, contenido }) {
  const procesos = leer()
  const id = randomUUID()
  const fechaCarga = new Date().toISOString()
  const carpeta = join(raiz, "archivos", id)
  mkdirSync(carpeta, { recursive: true })
  writeFileSync(join(carpeta, "simed.json"), contenido)
  const proceso = {
    id,
    archivo,
    usuario,
    fechaCarga,
    estado: "Pendiente de revisión contable",
    excel: null,
    resultado: null,
  }
  procesos.unshift(proceso)
  guardar(procesos)
  return proceso
}

export function listarCargas() {
  return leer().map(vista)
}

export function obtenerCarga(id) {
  return leer().find((proceso) => proceso.id === id) || null
}

export function contenidoSimed(id) {
  return readFileSync(join(raiz, "archivos", id, "simed.json"))
}

export function guardarRevision(id, { excel, resultado }) {
  const procesos = leer()
  const proceso = procesos.find((item) => item.id === id)
  if (!proceso) return null
  const carpeta = join(raiz, "archivos", id)
  mkdirSync(carpeta, { recursive: true })
  writeFileSync(join(carpeta, "contable.xlsx"), excel)
  proceso.excel = "Paso de comprobantes entre empresas.xlsx"
  proceso.resultado = resultado
  proceso.estado = resultado.resumen.revision === 0 ? "Revisado" : "Con alertas"
  guardar(procesos)
  return proceso
}

function vista(proceso) {
  return {
    id: proceso.id,
    archivo: proceso.archivo,
    usuario: proceso.usuario,
    fechaCarga: proceso.fechaCarga,
    estado: proceso.estado,
  }
}

export function confirmacion(proceso) {
  return vista(proceso)
}

function rutaRevision() {
  return join(raiz, "revision.json")
}

function rutaExcelContable() {
  return join(raiz, "contable.xlsx")
}

function rutaMetaContable() {
  return join(raiz, "contable.json")
}

export async function guardarExcelContable(contenido, nombre) {
  if (usarMysql()) return guardarExcelMysql(contenido, nombre)
  asegurar()
  writeFileSync(rutaExcelContable(), contenido)
  const meta = { fecha: new Date().toISOString(), archivo: nombre || "Paso de comprobantes entre empresas.xlsx" }
  writeFileSync(rutaMetaContable(), JSON.stringify(meta), "utf8")
  return meta
}

export async function leerExcelGuardado() {
  if (usarMysql()) return leerExcelMysql()
  asegurar()
  try {
    const contenido = readFileSync(rutaExcelContable())
    let meta = { fecha: null, archivo: "Paso de comprobantes entre empresas.xlsx" }
    try {
      meta = JSON.parse(readFileSync(rutaMetaContable(), "utf8"))
    } catch {
      meta = { fecha: null, archivo: "Paso de comprobantes entre empresas.xlsx" }
    }
    return { contenido, fecha: meta.fecha, archivo: meta.archivo }
  } catch {
    return null
  }
}

export async function guardarResultadoContable(resultado, extra = {}) {
  if (usarMysql()) return guardarResultadoMysql(resultado, extra)
  asegurar()
  const guardado = { fecha: extra.fecha || new Date().toISOString(), archivo: extra.archivo || null, resultado }
  writeFileSync(rutaRevision(), JSON.stringify(guardado), "utf8")
  return guardado
}

export async function leerResultadoContable() {
  if (usarMysql()) return leerResultadoMysql()
  asegurar()
  try {
    return JSON.parse(readFileSync(rutaRevision(), "utf8"))
  } catch {
    return null
  }
}
