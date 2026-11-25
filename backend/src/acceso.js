import { conexion } from "./db.js"

export function noDisponible() {
  const error = new Error("SIRT no está disponible.")
  error.estado = 503
  return error
}

function registrar(error) {
  const clave = process.env.POSTGRES_PASSWORD
  const mensaje = String(error?.message || "")
  if (clave && mensaje.includes(clave)) {
    console.error("sirt", "fallo de conexión")
    return
  }
  console.error("sirt", error?.code || "fallo de conexión")
}

export async function conLectura(trabajo) {
  let soloLectura = false
  try {
    const { rows } = await conexion().query("SELECT current_setting('transaction_read_only') AS solo_lectura")
    soloLectura = rows[0]?.solo_lectura === "on"
  } catch (error) {
    registrar(error)
    throw noDisponible()
  }
  if (!soloLectura) {
    const error = new Error("La consulta a SIRT solo está permitida en lectura.")
    error.estado = 403
    throw error
  }
  try {
    return await trabajo()
  } catch (error) {
    if (error?.estado) throw error
    registrar(error)
    throw noDisponible()
  }
}
