import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const { Pool } = pg

function cargarEnv() {
  const ruta = join(dirname(fileURLToPath(import.meta.url)), "..", ".env")
  let texto = ""
  try {
    texto = readFileSync(ruta, "utf8")
  } catch {
    return
  }
  for (const linea of texto.split(/\r?\n/)) {
    const limpio = linea.trim()
    if (!limpio || limpio.startsWith("#")) continue
    const corte = limpio.indexOf("=")
    if (corte < 1) continue
    const clave = limpio.slice(0, corte).trim()
    if (!process.env[clave]) process.env[clave] = limpio.slice(corte + 1).trim()
  }
}

cargarEnv()

let pool

export function conexion() {
  const faltan = ["POSTGRES_HOST", "POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_PORT"].filter(
    (clave) => !process.env[clave],
  )
  if (faltan.length) {
    throw new Error("Falta la configuración de solo lectura en el .env del backend.")
  }
  if (!pool) {
    pool = new Pool({
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      application_name: "boxbeef",
      max: 4,
      connectionTimeoutMillis: 8000,
      statement_timeout: 50000,
      query_timeout: 50000,
      options: "-c default_transaction_read_only=on",
    })
  }
  return pool
}
