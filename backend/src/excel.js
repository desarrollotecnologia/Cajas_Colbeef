import ExcelJS from "exceljs"

const COLUMNAS = [
  ["FECHA", "fecha", "fecha"],
  ["LOTE", "lote", "texto"],
  ["CLIENTE DESPOSTE", "clienteDesposte", "texto"],
  ["CLIENTE", "cliente", "texto"],
  ["CANTIDAD", "cantidad", "entero"],
  ["PRODUCTO", "producto", "texto"],
  ["PESO LOTE (KG)", "pesoLote", "kilos"],
  ["PLACA DEL VEHÍCULO", "placa", "texto"],
  ["CONDUCTOR VEHICULO", "conductor", "texto"],
  ["DOCUMENTO SIIMED", "documentoSiimed", "texto"],
  ["FECHA DE REALIZACIÓN", "fechaRealizacion", "fecha"],
  ["REFERENCIA", "referencia", "texto"],
  ["GUIA TRANSPORTE", "guiaTransporte", "texto"],
  ["RUTA / SUCURSAL / DESTINO", "rutaSucursalDestino", "texto"],
  ["PROPIETARIO", "propietario", "texto"],
  ["TIPO CONSERVACION", "tipoConservacion", "texto"],
]

const EPOCA_EXCEL = Date.UTC(1899, 11, 30)

export function serieFecha(valor) {
  if (valor === null || valor === undefined || valor === "") return null
  const fecha = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha)
  const [anio, mes, dia] = iso.split("-").map(Number)
  return (Date.UTC(anio, mes - 1, dia) - EPOCA_EXCEL) / 86400000
}

function escribirCelda(celda, tipo, clave, valor) {
  if (tipo === "fecha") {
    const serie = serieFecha(valor)
    if (serie == null) return
    celda.value = serie
    celda.numFmt = "dd/mm/yyyy"
    return
  }
  if (tipo === "kilos" || tipo === "entero") {
    if (valor === null || valor === undefined || valor === "") return
    celda.value = Number(valor)
    celda.numFmt = tipo === "kilos" ? "#,##0.00" : "#,##0"
    return
  }
  if (valor === null || valor === undefined || valor === "") return
  celda.value = String(valor)
  if (clave === "lote" || clave === "documentoSiimed") celda.numFmt = "@"
}

export async function libroExcel(registros) {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet("Beef Box")
  const encabezado = hoja.addRow(COLUMNAS.map(([titulo]) => titulo))
  encabezado.font = { bold: true }
  for (const registro of registros) {
    const fila = hoja.addRow([])
    COLUMNAS.forEach(([, clave, tipo], indice) => {
      escribirCelda(fila.getCell(indice + 1), tipo, clave, registro[clave])
    })
  }
  hoja.views = [{ state: "frozen", ySplit: 1 }]
  return Buffer.from(await libro.xlsx.writeBuffer())
}
