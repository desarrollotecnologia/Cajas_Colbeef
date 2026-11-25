import assert from "node:assert/strict"
import test from "node:test"
import { aplicarReferencias, referenciaPorDefecto } from "./referencias.js"

test("Olímpica queda en 30-10-100019 y el resto parte de 30-10-24", () => {
  assert.equal(referenciaPorDefecto("SUPERTIENDAS Y DROGUERIA OLIMPICA S.A."), "30-10-100019")
  assert.equal(referenciaPorDefecto("CARNES SANTACRUZ S.A.S"), "30-10-24")
})

test("una referencia guardada reemplaza el valor por defecto, salvo Olímpica", async () => {
  const filas = await aplicarReferencias(
    [
      { cliente: "CARNES SANTACRUZ S.A.S", referencia: "30-10-24" },
      { cliente: "SUPERTIENDAS Y DROGUERIA OLIMPICA S.A.", referencia: "30-10-25" },
    ],
    "2026-10-13",
    { "2026-10-13:CARNES SANTACRUZ S.A.S": { referencia: "30-10-26" } },
  )
  assert.equal(filas[0].referencia, "30-10-26")
  assert.equal(filas[1].referencia, "30-10-100019")
})
