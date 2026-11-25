import assert from "node:assert/strict"
import test from "node:test"
import { aplicarDocumentos } from "./documentos.js"

test("el documento escrito reemplaza el vacío que devuelve SIRT", async () => {
  const filas = await aplicarDocumentos(
    [{ detalleId: 10, vehiculoId: 20, documentoSiimed: null, lote: "010725-OL-1" }],
    { "10:20": { documento: "H7-403", usuario: "Logística", fecha: "2026-11-23T15:00:00.000Z" } },
  )
  assert.equal(filas[0].documentoSiimed, "H7-403")
  assert.equal(filas[0].lote, "010725-OL-1")
  assert.equal(filas[0].documentoUsuario, "Logística")
})
