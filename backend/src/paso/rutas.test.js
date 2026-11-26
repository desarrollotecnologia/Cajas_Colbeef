import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import ExcelJS from "exceljs"

const carpeta = mkdtempSync(join(tmpdir(), "paso-"))
process.env.PASO_ARCHIVOS = "1"
process.env.PASO_DATOS = carpeta
process.env.PASO_USUARIOS = join(carpeta, "usuarios.json")
writeFileSync(process.env.PASO_USUARIOS, JSON.stringify([
  { usuario: "logistica", nombre: "Ana Logística", perfil: "logistica", clave: "logistica" },
  { usuario: "contabilidad", nombre: "Luis Contabilidad", perfil: "contabilidad", clave: "contabilidad" },
  { usuario: "admin", nombre: "Administrador", perfil: "admin", clave: "admin" },
]))
const { app } = await import("../server.js")

const OLIMPICA = "SUPERTIENDAS Y DROGUERIA OLIMPICA S.A."
const OTRO = "CARNES SANTACRUZ S.A.S."

function comprobante(numero, identificacion, cliente) {
  return {
    Comprobante: {
      Encabezado: { TipoDocumento: "F", Comprobante: 1, Numero: numero, Identificacion: Number(identificacion) },
      Tercero: { Identificacion: Number(identificacion), Nombre: cliente },
      Detalle: [{ Identificacion: 0, Cruce: { TipoDocumento: "F", Comprobante: "1", Numero: numero, Secuencia: 1 } }],
    },
  }
}

function cookieDe(respuesta) {
  const encabezado = respuesta.headers.get("set-cookie") || ""
  return encabezado.split(";")[0]
}

async function entrar(perfil) {
  const respuesta = await fetch(`${base}/api/paso/sesion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: perfil, clave: perfil }),
  })
  assert.equal(respuesta.status, 200)
  return cookieDe(respuesta)
}

let base
let servidor

test.before(async () => {
  servidor = app.listen(0, "127.0.0.1")
  await new Promise((resolve) => servidor.once("listening", resolve))
  base = `http://127.0.0.1:${servidor.address().port}`
})

test.after(async () => {
  await new Promise((resolve, reject) => servidor.close((error) => (error ? reject(error) : resolve())))
})

test("una clave incorrecta no abre sesión", async () => {
  const respuesta = await fetch(`${base}/api/paso/sesion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: "admin", clave: "otra" }),
  })
  assert.equal(respuesta.status, 401)
})

test("Logística carga el documento y no puede ver la revisión de Contabilidad", async () => {
  const logistica = await entrar("logistica")
  const documento = new FormData()
  documento.set("documento", new Blob([JSON.stringify(comprobante(100, "890107487", OLIMPICA))], { type: "application/json" }), "simed.json")
  const carga = await fetch(`${base}/api/paso/cargas`, { method: "POST", headers: { cookie: logistica }, body: documento })
  const cuerpo = await carga.json()
  assert.equal(carga.status, 201)
  assert.equal(cuerpo.estado, "Pendiente de revisión contable")
  assert.equal(cuerpo.usuario, "Ana Logística")
  assert.equal(cuerpo.archivo, "simed.json")
  assert.equal("resultado" in cuerpo, false)

  const lista = await fetch(`${base}/api/paso/cargas`, { headers: { cookie: logistica } })
  assert.equal(lista.status, 403)
  const detalle = await fetch(`${base}/api/paso/cargas/${cuerpo.id}`, { headers: { cookie: logistica } })
  assert.equal(detalle.status, 403)
  const excel = await fetch(`${base}/api/paso/cargas/${cuerpo.id}/excel`, { method: "POST", headers: { cookie: logistica } })
  assert.equal(excel.status, 403)
})

test("Contabilidad cruza el Excel con el documento y la referencia de Logística", async () => {
  const logistica = await entrar("logistica")
  const guardado = await fetch(`${base}/api/paso/documentos`, {
    method: "PUT",
    headers: { cookie: logistica, "content-type": "application/json" },
    body: JSON.stringify({
      registros: [
        { detalleId: 1, vehiculoId: 1, documentoSiimed: "F1-100", referencia: "30-10-100019", cliente: OLIMPICA, cantidad: 4 },
        { detalleId: 2, vehiculoId: 1, documentoSiimed: "F1-101", referencia: "30-10-100019", cliente: OLIMPICA, cantidad: 4 },
        { detalleId: 3, vehiculoId: 1, documentoSiimed: "F1-102", referencia: "30-10-24", cliente: OTRO, cantidad: 2 },
        { detalleId: 4, vehiculoId: 1, documentoSiimed: "F1-103", referencia: "30-10-24", cliente: OTRO, cantidad: 2 },
      ],
    }),
  })
  assert.equal(guardado.status, 200)

  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("Hoja1")
  hoja.addRow(["TIPO DE DOCUMENTO", "COMPROBANTE", "NÚMERO", "SECUENCIA", "IDENTIFICACIÓN", "CÓDIGO LÍNEA", "CÓDIGO GRUPO", "CÓDIGO PRODUCTO", "CÓD. CENTRO DE COSTO", "CANTIDAD"])
  hoja.addRow(["F", 1, 100, 1, "890107487", 30, 10, 100019, 309, 4])
  hoja.addRow(["F", 1, 101, 1, "890107487", 30, 10, 100019, 600, 4])
  hoja.addRow(["F", 1, 102, 1, "800111222", 30, 10, 24, 600, 2])
  hoja.addRow(["F", 1, 103, 1, "800111222", 30, 10, 24, 309, 2])
  const archivo = new FormData()
  archivo.set("excel", new Blob([Buffer.from(await libro.xlsx.writeBuffer())]), "Paso de comprobantes entre empresas.xlsx")

  const contabilidad = await entrar("contabilidad")
  const respuesta = await fetch(`${base}/api/paso/revision`, { method: "POST", headers: { cookie: contabilidad }, body: archivo })
  const cuerpo = await respuesta.json()
  assert.equal(respuesta.status, 200)
  assert.equal(cuerpo.resultado.encabezados.length, 121)
  assert.equal(cuerpo.resultado.resumen.correctas, 2)
  assert.equal(cuerpo.resultado.resumen.revision, 2)
  assert.equal(cuerpo.resultado.resumen.sinDiferencias, false)
  assert.equal(cuerpo.resultado.filas[0].requiereRevision, false)
  assert.match(cuerpo.resultado.filas[1].motivo, /tiene registrado el centro 600 y le corresponde el 309/)
  assert.equal(cuerpo.resultado.filas[2].requiereRevision, false)
  assert.match(cuerpo.resultado.filas[3].motivo, /tiene registrado el centro 309 y le corresponde el 600/)

  const recarga = await fetch(`${base}/api/paso/revision`, { headers: { cookie: contabilidad } })
  const otraVez = await recarga.json()
  assert.equal(recarga.status, 200)
  assert.equal(otraVez.archivo, "Paso de comprobantes entre empresas.xlsx")
  assert.equal(otraVez.resultado.resumen.revision, 2)
  assert.equal(otraVez.realizados.filter((fila) => fila.documento === "F1-100").length, 1)
  assert.ok(otraVez.realizados.find((fila) => fila.documento === "F1-100").fecha)

  const cambio = await fetch(`${base}/api/paso/documentos`, {
    method: "PUT",
    headers: { cookie: logistica, "content-type": "application/json" },
    body: JSON.stringify({
      registros: [
        { detalleId: 1, vehiculoId: 1, documentoSiimed: "F1-100", referencia: "30-10-100019", cliente: OLIMPICA, cantidad: 9 },
      ],
    }),
  })
  assert.equal(cambio.status, 200)
  const actualizado = await fetch(`${base}/api/paso/revision`, { headers: { cookie: contabilidad } })
  const fresco = await actualizado.json()
  assert.equal(fresco.resultado.filas[0].requiereRevision, true)
  assert.match(fresco.resultado.filas[0].motivo, /Unidades distintas/)

  const propia = await fetch(`${base}/api/paso/cargas`, { method: "POST", headers: { cookie: contabilidad } })
  assert.equal(propia.status, 403)
})

test("solo Logística guarda el documento SIMED", async () => {
  const contabilidad = await entrar("contabilidad")
  const denegado = await fetch(`${base}/api/paso/documentos`, {
    method: "PUT",
    headers: { cookie: contabilidad, "content-type": "application/json" },
    body: JSON.stringify({ registros: [{ detalleId: 10, vehiculoId: 20, documentoSiimed: "H7-403" }] }),
  })
  assert.equal(denegado.status, 403)
  const logistica = await entrar("logistica")
  const guardado = await fetch(`${base}/api/paso/documentos`, {
    method: "PUT",
    headers: { cookie: logistica, "content-type": "application/json" },
    body: JSON.stringify({ registros: [{ detalleId: 10, vehiculoId: 20, documentoSiimed: "H7- 403" }] }),
  })
  assert.equal(guardado.status, 200)
})

test("el administrador entra a la carga y a la revisión", async () => {
  const admin = await entrar("admin")
  const sesion = await fetch(`${base}/api/paso/sesion`, { headers: { cookie: admin } })
  assert.deepEqual(await sesion.json(), { perfil: "admin", usuario: "Administrador", cuenta: "admin" })
  const lista = await fetch(`${base}/api/paso/cargas`, { headers: { cookie: admin } })
  assert.equal(lista.status, 200)
  const documento = new FormData()
  documento.set("documento", new Blob([JSON.stringify(comprobante(200, "890107487", OLIMPICA))], { type: "application/json" }), "admin.json")
  const carga = await fetch(`${base}/api/paso/cargas`, { method: "POST", headers: { cookie: admin }, body: documento })
  assert.equal(carga.status, 201)
})

test("el administrador agrega, edita y elimina usuarios", async () => {
  const logistica = await entrar("logistica")
  const denegado = await fetch(`${base}/api/paso/usuarios`, { headers: { cookie: logistica } })
  assert.equal(denegado.status, 403)

  const admin = await entrar("admin")
  const correo = await fetch(`${base}/api/paso/usuarios`, {
    method: "POST",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({ usuario: "coordinacion.logistico@colbeef.", nombre: "Mauricio", perfil: "logistica", clave: "mauricio" }),
  })
  assert.equal(correo.status, 201)
  assert.equal((await correo.json()).usuario, "coordinacion.logistico@colbeef.")
  await fetch(`${base}/api/paso/usuarios/${encodeURIComponent("coordinacion.logistico@colbeef.")}`, { method: "DELETE", headers: { cookie: admin } })

  const conEspacios = await fetch(`${base}/api/paso/usuarios`, {
    method: "POST",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({ usuario: "Ana María", nombre: "Ana María", perfil: "logistica", clave: "ana123" }),
  })
  assert.equal(conEspacios.status, 201)
  assert.equal((await conEspacios.json()).usuario, "anamaria")
  await fetch(`${base}/api/paso/usuarios/anamaria`, { method: "DELETE", headers: { cookie: admin } })

  const creado = await fetch(`${base}/api/paso/usuarios`, {
    method: "POST",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({ usuario: "bodega", nombre: "Bodega Norte", perfil: "logistica", clave: "bodega" }),
  })
  assert.equal(creado.status, 201)
  const lista = await fetch(`${base}/api/paso/usuarios`, { headers: { cookie: admin } })
  const cuentas = await lista.json()
  assert.equal(cuentas.some((cuenta) => cuenta.usuario === "bodega" && cuenta.clave === undefined), true)

  const editado = await fetch(`${base}/api/paso/usuarios/bodega`, {
    method: "PUT",
    headers: { cookie: admin, "content-type": "application/json" },
    body: JSON.stringify({ usuario: "bodega", nombre: "Bodega Sur", perfil: "contabilidad", clave: "" }),
  })
  assert.equal(editado.status, 200)
  assert.equal((await editado.json()).nombre, "Bodega Sur")

  const propio = await fetch(`${base}/api/paso/usuarios/admin`, { method: "DELETE", headers: { cookie: admin } })
  assert.equal(propio.status, 400)
  const borrado = await fetch(`${base}/api/paso/usuarios/bodega`, { method: "DELETE", headers: { cookie: admin } })
  assert.equal(borrado.status, 200)
  const entrada = await fetch(`${base}/api/paso/sesion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario: "bodega", clave: "bodega" }),
  })
  assert.equal(entrada.status, 401)
})
