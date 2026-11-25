import assert from "node:assert/strict"
import test from "node:test"
import { interpretarConsulta, normalizarDocumento, paginacionDe } from "./filtros.js"

test("el día final sin hora entra completo y la hora se lee en reloj de Bogotá", () => {
  const porFecha = interpretarConsulta({ desde: "2026-11-19", hasta: "2026-11-19", campo: "fecha" })
  assert.equal(porFecha.inicio, "2026-11-19 00:00:00")
  assert.equal(porFecha.finExclusivo, "2026-11-20 00:00:00")

  const conHora = interpretarConsulta({
    desde: "2026-11-19T08:30",
    hasta: "2026-11-19 18:00:00",
    campo: "realizacion",
  })
  assert.equal(conHora.campo, "realizacion")
  assert.equal(conHora.inicio, "2026-11-19 08:30:00")
  assert.equal(conHora.finExclusivo, "2026-11-19 18:00:01")
})

test("el documento ignora espacios alrededor del guion", () => {
  assert.equal(normalizarDocumento("H7- 403"), normalizarDocumento("H7-403"))
  assert.equal(normalizarDocumento("  H7 - 403 "), "h7-403")
  const consulta = interpretarConsulta({ documento: "H7- 403" })
  assert.equal(consulta.documento, "h7-403")
})

test("rechaza filtros imposibles", () => {
  assert.throws(() => interpretarConsulta({ desde: "2026-11-20", hasta: "2026-11-19" }), /después del fin/)
  assert.throws(() => interpretarConsulta({ campo: "lote" }), /fecha o realizacion/)
  assert.throws(() => interpretarConsulta({ desde: "19/11/2026" }), /AAAA-MM-DD/)
  assert.throws(() => interpretarConsulta({ limite: "0" }), /limite/)
  assert.throws(() => interpretarConsulta({ pagina: "0" }), /pagina/)
})

test("la paginación conserva el orden y el total", () => {
  const consulta = interpretarConsulta({ pagina: "2", limite: "50" })
  assert.equal(consulta.desplazamiento, 50)
  assert.deepEqual(paginacionDe(120, 2, 50, 50), {
    pagina: 2,
    limite: 50,
    desplazamiento: 50,
    paginas: 3,
    orden: ["fecha desc", "detalleId asc", "vehiculoId asc"],
  })
  assert.equal(paginacionDe(0, 1, 50, 0).paginas, 0)
})
