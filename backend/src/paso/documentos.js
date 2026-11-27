import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { guardarDocumentosMysql, leerDocumentosMysql, usarMysql } from "./mysql.js"

const raiz = process.env.PASO_DATOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "paso")

function ruta() {
  return join(raiz, "documentos.json")
}

export function claveDocumento(detalleId, vehiculoId) {
  return `${detalleId}:${vehiculoId}`
}

function leerArchivo() {
  mkdirSync(raiz, { recursive: true })
  try {
    return JSON.parse(readFileSync(ruta(), "utf8"))
  } catch {
    return {}
  }
}

export async function leerDocumentos() {
  if (usarMysql()) return leerDocumentosMysql()
  return leerArchivo()
}

export async function guardarDocumentos(registros, usuario) {
  if (usarMysql()) {
    await guardarDocumentosMysql(registros, usuario)
    return leerDocumentos()
  }
  const guardados = leerArchivo()
  const fecha = new Date().toISOString()
  for (const registro of registros) {
    const clave = claveDocumento(registro.detalleId, registro.vehiculoId)
    if (!registro.documento) {
      delete guardados[clave]
      continue
    }
    guardados[clave] = {
      documento: registro.documento,
      referencia: registro.referencia || null,
      cliente: registro.cliente || null,
      cantidad: registro.cantidad ?? null,
      usuario,
      fecha,
    }
  }
  writeFileSync(ruta(), JSON.stringify(guardados), "utf8")
  return guardados
}

export function diaEnBogota(valor) {
  if (!valor) return ""
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) {
    const texto = String(valor)
    return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : ""
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha)
}

function compararDocumento(a, b) {
  const partes = (valor) => {
    const texto = String(valor || "").trim().toUpperCase()
    const corte = texto.match(/^(.*?)(\d+)$/)
    return corte ? [corte[1], Number(corte[2])] : [texto, 0]
  }
  const [prefijoA, numeroA] = partes(a.documento)
  const [prefijoB, numeroB] = partes(b.documento)
  const prefijo = prefijoA.localeCompare(prefijoB, "es")
  if (prefijo) return prefijo
  return numeroA - numeroB
}

export async function listarRealizados(guardados, filtro = {}) {
  const fuente = guardados || await leerDocumentos()
  return Object.values(fuente)
    .filter((item) => item?.documento)
    .map((item) => ({
      documento: item.documento,
      referencia: item.referencia || null,
      cliente: item.cliente || null,
      cantidad: item.cantidad ?? null,
      usuario: item.usuario || null,
      fecha: item.fecha || null,
    }))
    .filter((item) => {
      const dia = diaEnBogota(item.fecha)
      if (filtro.fecha) return dia === filtro.fecha
      if (filtro.mes) return dia.startsWith(`${filtro.mes}-`)
      return true
    })
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || compararDocumento(a, b))
}

export async function registrosParaCruce(guardados) {
  const fuente = guardados || await leerDocumentos()
  return Object.entries(fuente)
    .filter(([, item]) => item?.documento)
    .map(([clave, item]) => ({
      detalleId: Number(clave.split(":")[0]) || null,
      documento: item.documento,
      referencia: item.referencia || null,
      cliente: item.cliente || null,
      cantidad: item.cantidad ?? null,
    }))
}

export async function aplicarDocumentos(registros, guardados) {
  const fuente = guardados || await leerDocumentos()
  return registros.map((fila) => {
    const guardado = fuente[claveDocumento(fila.detalleId, fila.vehiculoId)]
    return {
      ...fila,
      documentoSiimed: guardado?.documento || null,
      documentoUsuario: guardado?.usuario || null,
      documentoFecha: guardado?.fecha || null,
    }
  })
}
