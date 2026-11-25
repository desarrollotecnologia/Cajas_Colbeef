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

export async function listarRealizados(guardados) {
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
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
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
