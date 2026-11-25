import { timingSafeEqual } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PERFILES = new Set(["logistica", "contabilidad", "admin"])

function rutaCuentas() {
  return process.env.PASO_USUARIOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "usuarios.json")
}

function mismas(izquierda, derecha) {
  const a = Buffer.from(izquierda)
  const b = Buffer.from(derecha)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function autenticar(usuario, clave) {
  let cuentas
  try {
    cuentas = JSON.parse(readFileSync(rutaCuentas(), "utf8"))
  } catch {
    return null
  }
  if (!Array.isArray(cuentas)) return null
  const buscado = String(usuario || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  const claveIngresada = String(clave || "")
  const cuenta = cuentas.find((item) => String(item.usuario || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "") === buscado)
  if (!cuenta || !PERFILES.has(cuenta.perfil) || !mismas(String(cuenta.clave || ""), claveIngresada)) return null
  return {
    usuario: String(cuenta.nombre || cuenta.usuario).trim(),
    perfil: cuenta.perfil,
  }
}
