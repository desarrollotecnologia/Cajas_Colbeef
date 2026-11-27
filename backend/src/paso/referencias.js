import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { guardarReferenciasMysql, leerReferenciasMysql, usarMysql } from "./mysql.js"

export const REFERENCIAS_CAJA = ["30-10-24", "30-10-25", "30-10-26", "30-10-45", "30-10-100019"]

const raiz = process.env.PASO_DATOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "paso")

function ruta() {
  return join(raiz, "referencias.json")
}

export function esOlimpica(cliente) {
  return /olimp/i.test(String(cliente || ""))
}

export function referenciaPorDefecto(cliente) {
  return esOlimpica(cliente) ? "30-10-100019" : "30-10-24"
}

export function claveReferencia(fecha, cliente) {
  return `${fecha}:${String(cliente || "").trim()}`
}

function leerArchivo() {
  mkdirSync(raiz, { recursive: true })
  try {
    return JSON.parse(readFileSync(ruta(), "utf8"))
  } catch {
    return {}
  }
}

export async function leerReferencias() {
  if (usarMysql()) return leerReferenciasMysql()
  return leerArchivo()
}

export async function guardarReferencias(registros, usuario) {
  const guardados = usarMysql() ? {} : leerArchivo()
  const momento = new Date().toISOString()
  const cambios = []
  for (const registro of registros) {
    const cliente = String(registro.cliente || "").trim()
    const referencia = esOlimpica(cliente) ? "30-10-100019" : registro.referencia
    if (!esOlimpica(cliente) && !REFERENCIAS_CAJA.includes(referencia)) continue
    const clave = claveReferencia(registro.fecha, cliente)
    guardados[clave] = { referencia, usuario, fecha: momento }
    cambios.push({ fecha: registro.fecha, cliente, referencia })
  }
  if (usarMysql()) {
    await guardarReferenciasMysql(cambios, usuario)
    return leerReferencias()
  }
  writeFileSync(ruta(), JSON.stringify(guardados), "utf8")
  return guardados
}

function diaDe(valor) {
  const texto = String(valor || "")
  if (/^\d{4}-\d{2}-\d{2}/.test(texto) && !texto.includes("T")) return texto.slice(0, 10)
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha)
}

export async function aplicarReferencias(registros, fecha, guardados) {
  const fuente = guardados || await leerReferencias()
  return registros.map((fila) => {
    const dia = fecha || diaDe(fila.fecha)
    if (esOlimpica(fila.cliente)) return { ...fila, fecha: dia || fila.fecha, referencia: "30-10-100019" }
    const guardado = fuente[claveReferencia(dia, fila.cliente)]
    return { ...fila, fecha: dia || fila.fecha, referencia: guardado?.referencia || fila.referencia || "30-10-24" }
  })
}
