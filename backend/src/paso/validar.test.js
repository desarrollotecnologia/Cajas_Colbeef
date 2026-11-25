import assert from "node:assert/strict"
import test from "node:test"
import { centroEsperado, maestroDesdeEmpresas, validarContraLogistica, validarFilas } from "./validar.js"

const OLIMPICA = "SUPERTIENDAS Y DROGUERIA OLIMPICA S.A."
const OTRO = "CARNES SANTACRUZ S.A.S."

function linea(numero, identificacion, cliente) {
  return { tipo: "F", comprobante: "1", numero: String(numero), secuencia: "1", identificacion, cliente }
}

function fila(filaExcel, numero, identificacion, centro) {
  return { fila: filaExcel, tipo: "F", comprobante: 1, numero, secuencia: 1, identificacion, centro }
}

test("los cuatro centros de costo quedan como espera Contabilidad", () => {
  const lineas = [
    linea(100, "890107487", OLIMPICA),
    linea(101, "890107487", OLIMPICA),
    linea(102, "800111222", OTRO),
    linea(103, "800111222", OTRO),
  ]
  const { resumen, filas } = validarFilas(
    [fila(2, 100, "890107487", 309), fila(3, 101, "890107487", 600), fila(4, 102, "800111222", 600), fila(5, 103, "800111222", 309)],
    lineas,
  )
  assert.equal(resumen.procesadas, 4)
  assert.equal(resumen.correctas, 2)
  assert.equal(resumen.revision, 2)
  assert.equal(filas[0].requiereRevision, false)
  assert.equal(filas[0].centroEsperado, "309")
  assert.equal(filas[1].motivo, `Centro de costo incorrecto. ${OLIMPICA} tiene registrado el centro 600 y le corresponde el 309.`)
  assert.equal(filas[1].centroRegistrado, "600")
  assert.equal(filas[1].centroEsperado, "309")
  assert.equal(filas[2].requiereRevision, false)
  assert.equal(centroEsperado("OLIMPICA"), "309")
  assert.equal(filas[2].centroEsperado, "600")
  assert.equal(filas[3].motivo, `Centro de costo incorrecto. ${OTRO} tiene registrado el centro 309 y le corresponde el 600.`)
})

test("un centro vacío, un cliente desconocido y las coincidencias dudosas quedan pendientes", () => {
  const { filas } = validarFilas(
    [
      fila(2, 100, "890107487", ""),
      fila(3, 100, "999", 600),
      { fila: 4, tipo: "H", comprobante: 7, numero: 913, secuencia: 1, identificacion: "890107487", centro: 309 },
      fila(5, 101, "890107487", 309),
    ],
    [linea(101, "890107487", OLIMPICA), linea(101, "890107487", OLIMPICA), linea(100, "890107487", OLIMPICA)],
  )
  assert.match(filas[0].motivo, /Centro de costo vacío/)
  assert.equal(filas[0].centroEsperado, "309")
  assert.equal(filas[0].centroRegistrado, null)
  assert.match(filas[1].motivo, /^Cliente sin identificar\./)
  assert.equal(filas[1].centroEsperado, null)
  assert.match(filas[2].motivo, /Pendiente de cruce/)
  assert.match(filas[3].motivo, /Pendiente de cruce/)
  assert.equal(filas[3].documento, "F-1-101")
})

test("el centro de costo sale del cliente del H7 aunque la referencia no cruce", () => {
  const { filas } = validarContraLogistica(
    [{ fila: 2, tipo: "H", comprobante: 7, numero: 938, linea: "30", grupo: "10", producto: "24", centro: 309, cantidad: "44", valores: [] }],
    [{ documento: "H7-938", referencia: "30-10-25", cliente: "INVERSIONES KHIMAIRA SAS", cantidad: 44 }],
  )
  assert.match(filas[0].motivo, /Pendiente de cruce/)
  assert.equal(filas[0].centroEsperado, "600")
  assert.match(filas[0].motivo, /tiene registrado el centro 309 y le corresponde el 600/)
})

test("sin unidades en Logística queda pendiente y no marca sin diferencias", () => {
  const { resumen, filas } = validarContraLogistica(
    [{ fila: 2, tipo: "H", comprobante: 7, numero: 403, linea: "030", grupo: "0010", producto: "000024", centro: 600, cantidad: "8", valores: [] }],
    [{ documento: "H7-403", referencia: "30-10-24", cliente: "CARNES SANTACRUZ S.A.S.", cantidad: null }],
  )
  assert.equal(filas[0].diferencias.cantidad.motivo, "Unidades pendientes de validar")
  assert.equal(filas[0].diferencias.centro, null)
  assert.equal(resumen.sinDiferencias, false)
})

test("las unidades se comparan solo cuando el renglón cruza", () => {
  const { filas } = validarFilas(
    [{ fila: 2, tipo: "F", comprobante: 1, numero: 100, secuencia: 1, identificacion: "890107487", centro: 309, cantidad: "10" }],
    [{ tipo: "F", comprobante: "1", numero: "100", secuencia: "1", identificacion: "890107487", cliente: "SUPERTIENDAS Y DROGUERIA OLIMPICA S.A.", cantidad: "12" }],
  )
  assert.equal(filas[0].diferencias.cantidad.contabilidad, "10")
  assert.equal(filas[0].diferencias.cantidad.logistica, "12")
  assert.equal(filas[0].diferencias.centro, null)
})

test("una identificación repetida en el maestro no elige un cliente", () => {
  const maestro = maestroDesdeEmpresas([
    { nit: "900087044", nombre: "FERIA COMERCIAL Y SUBASTA" },
    { nit: "900087044-2", nombre: "COLBEEF S.A.S" },
    { nit: "890107487-3", nombre: OLIMPICA },
  ])
  const { filas } = validarFilas([fila(2, 100, "900087044", 600)], [linea(100, "900087044", "")], maestro)
  assert.match(filas[0].motivo, /Cliente sin identificar/)
  assert.match(filas[0].motivo, /varios terceros/)
  assert.equal(maestro.get("890107487").nombre, OLIMPICA)
})
