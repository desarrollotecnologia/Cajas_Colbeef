import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ExcelJS from "exceljs"
import { leerExcelContable, leerSimed } from "./simed.js"

test("el JSON de SIMED usa el cruce como comprobante, número y secuencia", () => {
  const leido = leerSimed(Buffer.from(JSON.stringify({
    Comprobante: {
      Encabezado: { TipoDocumento: "F", Comprobante: 1, Numero: 462751, Identificacion: 900119072 },
      Tercero: { Identificacion: 900119072, Nombre: "SUPERMERCADOS MAS POR MENOS S.A.S." },
      Detalle: [
        { Identificacion: 0, Cruce: { TipoDocumento: "F", Comprobante: "1", Numero: 462751, Secuencia: 1 } },
        { Identificacion: 0, Cruce: { TipoDocumento: "F", Comprobante: "1", Numero: 462751, Secuencia: 2 } },
      ],
    },
  })))
  assert.equal(leido.legible, true)
  assert.equal(leido.lineas.length, 2)
  assert.equal(leido.lineas[1].secuencia, "2")
  assert.equal(leido.lineas[0].identificacion, "900119072")
  assert.equal(leido.documentos[0].cliente, "SUPERMERCADOS MAS POR MENOS S.A.S.")
})

test("la hoja Hoja1 conserva el centro y la fila del Excel", async () => {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("Hoja1")
  hoja.addRow(["TIPO DE DOCUMENTO", "COMPROBANTE", "NÚMERO", "SECUENCIA", "IDENTIFICACIÓN", "CÓD. CENTRO DE COSTO"])
  hoja.addRow(["H", 7, 913, 1, 900087044, 600])
  hoja.addRow(["H", 7, 914, 1, 900087044, null])
  const { encabezados, filas } = await leerExcelContable(Buffer.from(await libro.xlsx.writeBuffer()))
  assert.equal(encabezados.length, 121)
  assert.equal(filas[0].fila, 2)
  assert.equal(filas[0].numero, "913")
  assert.equal(filas[0].centro, "600")
  assert.equal(filas[1].centro, null)
})

test("el archivo contable de ejemplo trae identificación y centro", async () => {
  const ruta = "c:/Users/Desarrollador_3/Downloads/Paso de comprobantes entre empresas - 2026-11-23T083605.453.xlsx"
  let contenido
  try {
    contenido = readFileSync(ruta)
  } catch {
    return
  }
  const { filas } = await leerExcelContable(contenido)
  assert.equal(filas.length, 36)
  assert.equal(filas[0].valores.length, 121)
  assert.equal(filas[0].identificacion, "900087044")
  assert.ok(filas.some((fila) => String(fila.centro) === "309"))
  assert.ok(filas.some((fila) => String(fila.centro) === "600"))
})
