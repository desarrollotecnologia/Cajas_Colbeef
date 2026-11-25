import { timingSafeEqual } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PERFILES = new Set(["logistica", "contabilidad", "admin"])

function rutaCuentas() {
  return process.env.PASO_USUARIOS || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "usuarios.json")
}

function normalizar(valor) {
  return String(valor || "").trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
}

function accesoDe(valor) {
  return normalizar(valor).replace(/[^a-z0-9._-]/g, "")
}

function rechazo(estado, mensaje) {
  const error = new Error(mensaje)
  error.estado = estado
  return error
}

function leerCuentas() {
  try {
    const cuentas = JSON.parse(readFileSync(rutaCuentas(), "utf8"))
    return Array.isArray(cuentas) ? cuentas : []
  } catch {
    return []
  }
}

function guardarCuentas(cuentas) {
  writeFileSync(rutaCuentas(), JSON.stringify(cuentas, null, 2), "utf8")
}

function cuentaValida({ usuario, nombre, perfil, clave }, exigeClave) {
  const acceso = accesoDe(usuario)
  if (!/^[a-z0-9._-]{3,40}$/.test(acceso)) throw rechazo(400, "El usuario necesita al menos 3 letras o números. Puedes escribir el nombre con espacios.")
  const visible = String(nombre || "").trim()
  if (visible.length < 2 || visible.length > 80) throw rechazo(400, "El nombre debe tener entre 2 y 80 caracteres.")
  if (!PERFILES.has(perfil)) throw rechazo(400, "El perfil debe ser Logística, Contabilidad o Administrador.")
  const secreta = String(clave || "")
  if (exigeClave && (secreta.length < 4 || secreta.length > 80)) throw rechazo(400, "La clave debe tener entre 4 y 80 caracteres.")
  if (!exigeClave && secreta && (secreta.length < 4 || secreta.length > 80)) throw rechazo(400, "La clave debe tener entre 4 y 80 caracteres.")
  return { acceso, visible, perfil, secreta }
}

export function listarCuentas() {
  return leerCuentas().map(({ usuario, nombre, perfil }) => ({ usuario, nombre, perfil }))
}

export function crearCuenta(datos) {
  const cuenta = cuentaValida(datos, true)
  const cuentas = leerCuentas()
  if (cuentas.some((item) => accesoDe(item.usuario) === cuenta.acceso)) throw rechazo(409, "Ese usuario ya existe.")
  cuentas.push({ usuario: cuenta.acceso, nombre: cuenta.visible, perfil: cuenta.perfil, clave: cuenta.secreta })
  guardarCuentas(cuentas)
  return { usuario: cuenta.acceso, nombre: cuenta.visible, perfil: cuenta.perfil }
}

export function actualizarCuenta(usuario, datos) {
  const cuentas = leerCuentas()
  const indice = cuentas.findIndex((item) => accesoDe(item.usuario) === accesoDe(usuario))
  if (indice < 0) throw rechazo(404, "No existe ese usuario.")
  const cuenta = cuentaValida({ ...datos, clave: datos.clave || cuentas[indice].clave }, false)
  if (cuentas.some((item, posicion) => posicion !== indice && accesoDe(item.usuario) === cuenta.acceso)) {
    throw rechazo(409, "Ese usuario ya existe.")
  }
  const administradores = cuentas.filter((item) => item.perfil === "admin").length
  if (cuentas[indice].perfil === "admin" && cuenta.perfil !== "admin" && administradores < 2) {
    throw rechazo(400, "Debe quedar al menos un administrador.")
  }
  cuentas[indice] = {
    usuario: cuenta.acceso,
    nombre: cuenta.visible,
    perfil: cuenta.perfil,
    clave: datos.clave ? cuenta.secreta : cuentas[indice].clave,
  }
  guardarCuentas(cuentas)
  return { usuario: cuenta.acceso, nombre: cuenta.visible, perfil: cuenta.perfil }
}

export function eliminarCuenta(usuario) {
  const cuentas = leerCuentas()
  const indice = cuentas.findIndex((item) => accesoDe(item.usuario) === accesoDe(usuario))
  if (indice < 0) throw rechazo(404, "No existe ese usuario.")
  const administradores = cuentas.filter((item) => item.perfil === "admin").length
  if (cuentas[indice].perfil === "admin" && administradores < 2) throw rechazo(400, "Debe quedar al menos un administrador.")
  cuentas.splice(indice, 1)
  guardarCuentas(cuentas)
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
  const buscado = accesoDe(usuario)
  const claveIngresada = String(clave || "")
  const cuenta = cuentas.find((item) => accesoDe(item.usuario) === buscado)
  if (!cuenta || !PERFILES.has(cuenta.perfil) || !mismas(String(cuenta.clave || ""), claveIngresada)) return null
  return {
    usuario: String(cuenta.nombre || cuenta.usuario).trim(),
    perfil: cuenta.perfil,
    cuenta: String(cuenta.usuario),
  }
}
