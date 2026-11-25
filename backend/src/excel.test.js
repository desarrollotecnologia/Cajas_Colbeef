import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { libroExcel } from "./excel.js"

test("fechas, kilos y texto conservan el tipo de celda", async () => {
  const buffer = await libroExcel([
    {
      fecha: "2026-11-21T18:30:00.000Z",
      lote: "0123",
      clienteDesposte: "COLBEEF S.A.S",
      cliente: "SUPERMERCADOS MAS POR MENOS S.A.S.",
      cantidad: 8,
      producto: "P-MOLIDA PREMIUM",
      pesoLote: 1190.58,
      placa: "LCM829",
      conductor: "Oscar Angulo Almario",
      documentoSiimed: "H7-574",
      fechaRealizacion: "2026-11-19T15:21:37.002Z",
      referencia: "080-0004-000025",
      guiaTransporte: "696B-DM-505858-26",
      rutaSucursalDestino: "BODEGA COLBEEF / MXM GIRON / Giron",
      propietario: "COLBEEF S.A.S",
      tipoConservacion: "Refrigerado",
    },
    {
      fecha: null,
      lote: "121126-CCF-P3",
      clienteDesposte: null,
      cliente: "CARNES SANTACRUZ",
      cantidad: 0,
      producto: "D-NUDITOS DE COLA",
      pesoLote: null,
      placa: null,
      conductor: null,
      documentoSiimed: null,
      fechaRealizacion: null,
      referencia: null,
      guiaTransporte: null,
      rutaSucursalDestino: null,
      propietario: null,
      tipoConservacion: null,
    },
    {
      fecha: "2026-11-20T05:00:00.000Z",
      lote: "121126-CCF-2",
      clienteDesposte: "COLBEEF S.A.S",
      cliente: "CARNES SANTACRUZ",
      cantidad: 2,
      producto: "D-NUDITOS DE COLA",
      pesoLote: 0,
      placa: "ABC123",
      conductor: "Ana Ruiz",
      documentoSiimed: "H7-403",
      fechaRealizacion: "2026-11-20T05:00:00.000Z",
      referencia: "080-0001-000001",
      guiaTransporte: "G-1",
      rutaSucursalDestino: "RUTA / SUCURSAL / CIUDAD",
      propietario: "COLBEEF S.A.S",
      tipoConservacion: "Congelado",
    },
  ])

  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  const hoja = libro.getWorksheet("Beef Box")
  const titulos = hoja.getRow(1).values.slice(1)
  assert.deepEqual(titulos, [
    "FECHA",
    "LOTE",
    "CLIENTE DESPOSTE",
    "CLIENTE",
    "CANTIDAD",
    "PRODUCTO",
    "PESO LOTE (KG)",
    "PLACA DEL VEHÍCULO",
    "CONDUCTOR VEHICULO",
    "DOCUMENTO SIIMED",
    "FECHA DE REALIZACIÓN",
    "REFERENCIA",
    "GUIA TRANSPORTE",
    "RUTA / SUCURSAL / DESTINO",
    "PROPIETARIO",
    "TIPO CONSERVACION",
  ])

  const primera = hoja.getRow(2)
  assert.ok(primera.getCell(1).value instanceof Date)
  assert.equal(primera.getCell(1).value.toISOString().slice(0, 10), "2026-11-21")
  assert.equal(primera.getCell(1).numFmt, "dd/mm/yyyy")
  assert.equal(primera.getCell(2).value, "0123")
  assert.equal(primera.getCell(2).numFmt, "@")
  assert.equal(primera.getCell(5).value, 8)
  assert.equal(typeof primera.getCell(5).value, "number")
  assert.equal(primera.getCell(7).value, 1190.58)
  assert.equal(typeof primera.getCell(7).value, "number")
  assert.equal(primera.getCell(10).value, "H7-574")
  assert.equal(primera.getCell(10).numFmt, "@")

  const vacia = hoja.getRow(3)
  assert.equal(vacia.getCell(1).value, null)
  assert.equal(vacia.getCell(5).value, 0)
  assert.equal(typeof vacia.getCell(5).value, "number")
  assert.equal(vacia.getCell(7).value, null)
  assert.equal(vacia.getCell(10).value, null)

  const cero = hoja.getRow(4)
  assert.equal(cero.getCell(7).value, 0)
  assert.equal(typeof cero.getCell(7).value, "number")
  assert.equal(cero.getCell(7).numFmt, "#,##0.00")
})
