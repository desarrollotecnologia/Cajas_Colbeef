import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import mysql from "mysql2/promise"
import "../db.js"

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "paso")

let pool
let listo

export function usarMysql() {
  return process.env.PASO_ARCHIVOS !== "1" && Boolean(process.env.MYSQL_HOST)
}

function conexionMysql() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DB,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 4,
      charset: "utf8mb4",
    })
  }
  return pool
}

export function falloMysql(error) {
  console.error("mysql", error.code || "fallo")
  const envuelto = new Error("No se pudo usar la base de datos MySQL.")
  envuelto.estado = 503
  return envuelto
}

function leerJson(nombre, vacio) {
  try {
    return JSON.parse(readFileSync(join(raiz, nombre), "utf8"))
  } catch {
    return vacio
  }
}

async function importarSiVacio(db) {
  const [documentos] = await db.query("SELECT COUNT(*) AS n FROM documento")
  if (Number(documentos[0].n) === 0) {
    const guardados = leerJson("documentos.json", {})
    for (const [clave, item] of Object.entries(guardados)) {
      if (!item?.documento) continue
      const [detalle, vehiculo] = clave.split(":")
      await db.query(
        `INSERT INTO documento (detalle_id, vehiculo_id, documento, referencia, cliente, cantidad, usuario, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(detalle), Number(vehiculo), item.documento, item.referencia || null, item.cliente || null, item.cantidad ?? null, item.usuario || null, item.fecha || new Date().toISOString()],
      )
    }
  }

  const [referencias] = await db.query("SELECT COUNT(*) AS n FROM referencia_caja")
  if (Number(referencias[0].n) === 0) {
    const guardados = leerJson("referencias.json", {})
    for (const [clave, item] of Object.entries(guardados)) {
      const corte = clave.indexOf(":")
      if (corte < 1 || !item?.referencia) continue
      await db.query(
        `INSERT INTO referencia_caja (fecha, cliente, referencia, usuario, actualizado)
         VALUES (?, ?, ?, ?, ?)`,
        [clave.slice(0, corte), clave.slice(corte + 1), item.referencia, item.usuario || null, item.fecha || new Date().toISOString()],
      )
    }
  }

  const [archivos] = await db.query("SELECT COUNT(*) AS n FROM archivo_contable")
  if (Number(archivos[0].n) === 0) {
    let contenido = null
    try {
      contenido = readFileSync(join(raiz, "contable.xlsx"))
    } catch {
      contenido = null
    }
    if (contenido) {
      const meta = leerJson("contable.json", {})
      const revision = leerJson("revision.json", {})
      await db.query(
        `INSERT INTO archivo_contable (id, nombre, fecha, contenido, resultado)
         VALUES (1, ?, ?, ?, ?)`,
        [
          meta.archivo || "Paso de comprobantes entre empresas.xlsx",
          meta.fecha || revision.fecha || new Date().toISOString(),
          contenido,
          revision.resultado ? JSON.stringify(revision.resultado) : null,
        ],
      )
    }
  }
}

export function prepararMysql() {
  if (!usarMysql()) return Promise.resolve()
  if (!listo) {
    listo = (async () => {
      const db = conexionMysql()
      await db.query(`
        CREATE TABLE IF NOT EXISTS documento (
          detalle_id BIGINT NOT NULL,
          vehiculo_id BIGINT NOT NULL,
          documento VARCHAR(40) NOT NULL,
          referencia VARCHAR(40) NULL,
          cliente VARCHAR(300) NULL,
          cantidad DECIMAL(14,4) NULL,
          usuario VARCHAR(80) NULL,
          fecha VARCHAR(32) NOT NULL,
          PRIMARY KEY (detalle_id, vehiculo_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS referencia_caja (
          fecha CHAR(10) NOT NULL,
          cliente VARCHAR(300) NOT NULL,
          referencia VARCHAR(40) NOT NULL,
          usuario VARCHAR(80) NULL,
          actualizado VARCHAR(32) NOT NULL,
          PRIMARY KEY (fecha, cliente)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      await db.query(`
        CREATE TABLE IF NOT EXISTS archivo_contable (
          id TINYINT NOT NULL PRIMARY KEY,
          nombre VARCHAR(255) NOT NULL,
          fecha VARCHAR(32) NOT NULL,
          contenido LONGBLOB NOT NULL,
          resultado LONGTEXT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      await importarSiVacio(db)
    })().catch((error) => {
      listo = null
      throw error
    })
  }
  return listo
}

async function consultar(sql, valores) {
  try {
    await prepararMysql()
    const [filas] = await conexionMysql().query(sql, valores)
    return filas
  } catch (error) {
    if (error.estado) throw error
    throw falloMysql(error)
  }
}

export async function leerDocumentosMysql() {
  const filas = await consultar("SELECT detalle_id, vehiculo_id, documento, referencia, cliente, cantidad, usuario, fecha FROM documento")
  const guardados = {}
  for (const fila of filas) {
    guardados[`${fila.detalle_id}:${fila.vehiculo_id}`] = {
      documento: fila.documento,
      referencia: fila.referencia,
      cliente: fila.cliente,
      cantidad: fila.cantidad === null ? null : Number(fila.cantidad),
      usuario: fila.usuario,
      fecha: fila.fecha,
    }
  }
  return guardados
}

export async function guardarDocumentosMysql(registros, usuario) {
  const fecha = new Date().toISOString()
  for (const registro of registros) {
    if (!registro.documento) {
      await consultar("DELETE FROM documento WHERE detalle_id = ? AND vehiculo_id = ?", [registro.detalleId, registro.vehiculoId])
      continue
    }
    await consultar(
      `INSERT INTO documento (detalle_id, vehiculo_id, documento, referencia, cliente, cantidad, usuario, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE documento = VALUES(documento), referencia = VALUES(referencia), cliente = VALUES(cliente), cantidad = VALUES(cantidad), usuario = VALUES(usuario), fecha = VALUES(fecha)`,
      [registro.detalleId, registro.vehiculoId, registro.documento, registro.referencia || null, registro.cliente || null, registro.cantidad ?? null, usuario, fecha],
    )
  }
}

export async function leerReferenciasMysql() {
  const filas = await consultar("SELECT fecha, cliente, referencia, usuario, actualizado FROM referencia_caja")
  const guardados = {}
  for (const fila of filas) {
    guardados[`${fila.fecha}:${fila.cliente}`] = { referencia: fila.referencia, usuario: fila.usuario, fecha: fila.actualizado }
  }
  return guardados
}

export async function guardarReferenciasMysql(registros, usuario) {
  const momento = new Date().toISOString()
  for (const registro of registros) {
    await consultar(
      `INSERT INTO referencia_caja (fecha, cliente, referencia, usuario, actualizado)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE referencia = VALUES(referencia), usuario = VALUES(usuario), actualizado = VALUES(actualizado)`,
      [registro.fecha, registro.cliente, registro.referencia, usuario, momento],
    )
  }
}

export async function guardarExcelMysql(contenido, nombre) {
  const meta = { fecha: new Date().toISOString(), archivo: nombre || "Paso de comprobantes entre empresas.xlsx" }
  await consultar(
    `INSERT INTO archivo_contable (id, nombre, fecha, contenido)
     VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), fecha = VALUES(fecha), contenido = VALUES(contenido)`,
    [meta.archivo, meta.fecha, contenido],
  )
  return meta
}

export async function leerExcelMysql() {
  const filas = await consultar("SELECT nombre, fecha, contenido FROM archivo_contable WHERE id = 1")
  const fila = filas[0]
  if (!fila?.contenido?.length) return null
  return { contenido: fila.contenido, fecha: fila.fecha, archivo: fila.nombre }
}

export async function guardarResultadoMysql(resultado, extra = {}) {
  const actual = (await consultar("SELECT nombre, fecha FROM archivo_contable WHERE id = 1"))[0]
  const fecha = extra.fecha || actual?.fecha || new Date().toISOString()
  const archivo = extra.archivo || actual?.nombre || null
  const texto = JSON.stringify(resultado)
  if (!actual) {
    await consultar(
      "INSERT INTO archivo_contable (id, nombre, fecha, contenido, resultado) VALUES (1, ?, ?, ?, ?)",
      [archivo || "Paso de comprobantes entre empresas.xlsx", fecha, Buffer.alloc(0), texto],
    )
  } else {
    await consultar("UPDATE archivo_contable SET nombre = ?, fecha = ?, resultado = ? WHERE id = 1", [archivo || actual.nombre, fecha, texto])
  }
  return { fecha, archivo, resultado }
}

export async function leerResultadoMysql() {
  const filas = await consultar("SELECT nombre, fecha, resultado FROM archivo_contable WHERE id = 1")
  const fila = filas[0]
  if (!fila?.resultado) return null
  const resultado = typeof fila.resultado === "string" ? JSON.parse(fila.resultado) : fila.resultado
  return { fecha: fila.fecha, archivo: fila.nombre, resultado }
}
