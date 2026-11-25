import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const raiz = process.env.PASO_DATOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "paso")
const PERFILES = new Set(["logistica", "contabilidad", "admin"])

function ruta() {
  return join(raiz, "sesiones.json")
}

function leer() {
  mkdirSync(raiz, { recursive: true })
  try {
    return JSON.parse(readFileSync(ruta(), "utf8"))
  } catch {
    return {}
  }
}

function guardar(sesiones) {
  mkdirSync(raiz, { recursive: true })
  writeFileSync(ruta(), JSON.stringify(sesiones), "utf8")
}

export function perfilValido(perfil) {
  return PERFILES.has(perfil)
}

export function abrirSesion(perfil, usuario, cuenta) {
  const sesiones = leer()
  const token = randomUUID()
  sesiones[token] = { perfil, usuario, cuenta: cuenta || null, desde: new Date().toISOString() }
  guardar(sesiones)
  return token
}

export function cerrarSesion(token) {
  if (!token) return
  const sesiones = leer()
  delete sesiones[token]
  guardar(sesiones)
}

export function sesionDe(token) {
  if (!token) return null
  return leer()[token] || null
}

export function tokenDe(req) {
  const encabezado = req.headers.cookie || ""
  for (const parte of encabezado.split(";")) {
    const corte = parte.trim().indexOf("=")
    if (corte < 1) continue
    if (parte.trim().slice(0, corte) === "paso") return decodeURIComponent(parte.trim().slice(corte + 1))
  }
  return null
}
