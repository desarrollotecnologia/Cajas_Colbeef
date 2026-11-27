import assert from "node:assert/strict"
import test from "node:test"
import { totalizarPorCliente } from "./totalizar.js"

test("totaliza cantidad y peso por cliente y marca varios lotes", () => {
  const base = {
    fecha: "2026-10-13T00:00:00.000Z",
    clienteDesposte: "COLBEEF",
    producto: "COLBEEF",
    placa: "ABC123",
    conductor: "Conductor",
    documentoSiimed: null,
    fechaRealizacion: "2026-10-13T12:00:00.000Z",
    referencia: "30-10-100019",
    guiaTransporte: null,
    rutaSucursalDestino: "Ruta",
    propietario: "COLBEEF",
    tipoConservacion: "REFRIGERADO",
  }
  const resultado = totalizarPorCliente([
    { ...base, detalleId: 1, vehiculoId: 10, cliente: "CLIENTE A", lote: "LOTE 1", cantidad: 3, pesoLote: 45.25 },
    { ...base, detalleId: 2, vehiculoId: 10, cliente: "CLIENTE A", lote: "LOTE 2", cantidad: 2, pesoLote: 30.5 },
    { ...base, detalleId: 3, vehiculoId: 11, cliente: "CLIENTE B", lote: "LOTE 3", cantidad: 1, pesoLote: 12 },
  ])

  assert.equal(resultado.length, 2)
  assert.deepEqual(
    { lote: resultado[0].lote, cantidad: resultado[0].cantidad, peso: resultado[0].pesoLote },
    { lote: "VARIOS", cantidad: 5, peso: 75.75 },
  )
  assert.equal(resultado[1].lote, "LOTE 3")
  assert.equal(resultado[0].referencia, "30-10-100019")
})

test("lista las referencias de las cajas cuando el cliente tiene varias", () => {
  const resultado = totalizarPorCliente([
    { cliente: "CLIENTE", lote: "L1", referencia: "30-10-24", cantidad: 1, pesoLote: 10 },
    { cliente: "CLIENTE", lote: "L1", referencia: "30-10-100019", cantidad: 1, pesoLote: 10 },
    { cliente: "CLIENTE", lote: "L1", referencia: "30-10-24", cantidad: 1, pesoLote: 10 },
  ])

  assert.equal(resultado[0].referencia, "30-10-24 | 30-10-100019")
})

test("separa al mismo cliente cuando los despachos son de otra fecha", () => {
  const resultado = totalizarPorCliente([
    { cliente: "CLIENTE", fecha: "2026-11-01T17:00:00.000Z", lote: "L1", cantidad: 1, pesoLote: 10 },
    { cliente: "CLIENTE", fecha: "2026-11-01T20:00:00.000Z", lote: "L2", cantidad: 1, pesoLote: 10 },
    { cliente: "CLIENTE", fecha: "2026-11-02T17:00:00.000Z", lote: "L3", cantidad: 1, pesoLote: 10 },
  ])

  assert.equal(resultado.length, 2)
  assert.equal(resultado[0].lote, "VARIOS")
  assert.equal(resultado[1].lote, "L3")
})

test("no cuenta dos veces una caja relacionada con varios detalles", () => {
  const resultado = totalizarPorCliente([
    { detalleId: 1, vehiculoId: 10, cliente: "CLIENTE", lote: "LOTE", cantidad: 1, pesoLote: 20, cajasDespachadas: [{ id: 100, peso: 20 }] },
    { detalleId: 2, vehiculoId: 10, cliente: "CLIENTE", lote: "LOTE", cantidad: 1, pesoLote: 20, cajasDespachadas: [{ id: 100, peso: 20 }] },
  ])

  assert.equal(resultado[0].cantidad, 1)
  assert.equal(resultado[0].pesoLote, 20)
})
