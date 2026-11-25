import ExcelJS from "exceljs"
import { plano, textoClave } from "./validar.js"

function texto(valor) {
  return textoClave(valor)
}

function documentosDe(json) {
  if (Array.isArray(json)) return json
  if (Array.isArray(json?.comprobantes)) return json.comprobantes
  return [json]
}

export function leerSimed(contenido) {
  let json
  try {
    json = JSON.parse(contenido.toString("utf8").replace(/^\uFEFF/, ""))
  } catch {
    return { legible: false, documentos: [], lineas: [] }
  }
  const documentos = []
  const lineas = []
  for (const entrada of documentosDe(json)) {
    const comprobante = entrada?.Comprobante
    const encabezado = comprobante?.Encabezado
    if (!encabezado) continue
    const tercero = comprobante.Tercero || {}
    const detalle = Array.isArray(comprobante.Detalle) ? comprobante.Detalle : []
    const tipo = texto(encabezado.TipoDocumento)
    const numeroComprobante = texto(encabezado.Comprobante)
    const numero = texto(encabezado.Numero)
    const identificacion = texto(encabezado.Identificacion) || texto(tercero.Identificacion)
    const cliente = texto(tercero.Nombre) || null
    documentos.push({
      tipo,
      comprobante: numeroComprobante,
      numero,
      identificacion: identificacion || null,
      cliente,
      lineas: detalle.length,
    })
    detalle.forEach((linea, indice) => {
      const cruce = linea?.Cruce || {}
      const cantidad = linea?.Cantidad ?? linea?.Unidades ?? linea?.CantidadUnidad
      lineas.push({
        tipo: texto(cruce.TipoDocumento) || tipo,
        comprobante: texto(cruce.Comprobante) || numeroComprobante,
        numero: texto(cruce.Numero) || numero,
        secuencia: texto(cruce.Secuencia) || String(indice + 1),
        identificacion,
        cliente,
        cantidad: cantidad === undefined || cantidad === null || cantidad === "" ? null : textoClave(cantidad),
      })
    })
  }
  return { legible: documentos.length > 0, documentos, lineas }
}

export const ENCABEZADOS_REFERENCIA = [
  "TIPO DE DOCUMENTO", "COMPROBANTE", "NÚMERO", "SECUENCIA", "FECHA DOCUMENTO", "ESTADO MOVIMIENTO", "IDENTIFICACIÓN", "SUCURSAL", "CUENTA", "CÓDIGO LÍNEA",
  "CÓDIGO GRUPO", "CÓDIGO PRODUCTO", "CÓDIGO GRUPO ACTIVOS", "CÓDIGO ACTIVO", "CÓD. CENTRO DE COSTO", "CÓDIGO SUBCENTRO", "CÓDIGO BODEGA", "CÓDIGO SUB-BODEGA", "CÓD. MONEDA", "TASA DE CAMBIO AJUSTE CUENTAS DEL PASIVO",
  "CÓDIGO VENDEDOR", "PAÍS", "CIUDAD", "ZONA", "COBRADOR", "EQUIPO", "OPERARIO", "NÚMERO CHEQUE", "DESCRIPCIÓN MOVIMIENTO", "DÉBITO/CRÉDITO",
  "VALOR", "VALOR EXTRANJERA", "VALOR BASE", "CANTIDAD", "TIPO DE COMPROBANTE", "COMPROBANTE CRUCE", "NÚMERO COMPROBANTE", "VENCIMIENTO CRUCE", "FECHA VENCIMIENTO", "FORMA DE PAGO",
  "CÓDIGO BANCO", "TIPO PEDIDO CRUCE", "COMP. PEDIDO CRUCE", "NÚMERO PEDIDO CRUCE", "SEC. PEDIDO CRUCE", "TIPO FACTURA CRUCE", "COMPR. FACTURA CRUCE", "NÚMERO FACTURA CRUCE", "SEC. FACTURA CRUCE", "COMPR. PROVEEDOR",
  "NÚM. COMP. PROVEEDOR", "FECHA COMPR. PROVEEDOR", "TIPO MOVIMIENTO", "USA DATOS NÓMINA", "CANTIDAD NÓMINA", "NÚMERO QUINCENA", "CÓD. CONCEPTO NÓMINA", "VALOR IMPOCONSUMO", "VALOR IMPOCONSUMO EXT.", "CANT. CONVERSIÓN",
  "FACTOR CONVERSIÓN", "FACTOR CONV. UTILIZADO", "VR. UNITARIO SIN IVA", "VR. UNITARIO SIN IVA EXT.", "VR. UNITARIO CON IVA", "VR. UNITARIO CON IVA EXT.", "COBRO RETENCIÓN", "PORCENTAJE RETENCIÓN ITEM", "VR. RETENCIÓN ITEM", "RETENCIÓN ITEM EXT",
  "COBRO IVA", "PORCENTAJE IVA", "VALOR IVA", "VALOR IVA EXT.", "MANEJA FECHA OPTIMISTA", "MANEJA FECHA PESIMISTA", "USA AIU", "BASE IVA-AIU", "BASE IVA-AIU EXT.", "VECES A DEPRECIAR",
  "CÓD. CAJA MENOR", "NÚMERO PUNTOS CAJERO", "CANTIDAD SEGUNDA UNIDAD", "CANT. ALTERNA", "MÉTODO DEPRECIACIÓN", "VALOR IMPUESTO DEPORTE", "VALOR IMPUESTO DEPORTE EXT.", "PORCENTAJE DESCUENTO", "VALOR DESCUENTO", "TOTAL DESCUENTO EXT.",
  "PORCENTAJE CARGO", "VALOR CARGO", "TOTAL CARGO EXT.", "PORCENTAJE PRIMER DESCUENTO", "VALOR PRIMER DESCUENTO", "PORCENTAJE SEGUNDO DESCUENTO", "VALOR SEGUNDO DESCUENTO", "PORCENTAJE TERCER DESCUENTO", "VALOR TERCER DESCUENTO", "PORCENTAJE PRIMER CARGO",
  "VALOR PRIMER CARGO", "PORCENTAJE SEGUNDO CARGO", "VALOR SEGUNDO CARGO", "PORCENTAJE TERCER CARGO", "VALOR TERCER CARGO", "TIPO DE SECUENCIA", "CONTRATANTE", "SUCURSAL CONTRATANTE", "BASE DE TRANSACCION", "PORCENTAJE RETENCION CREE ITEM",
  "VALOR RETENCION CREE ITEM", "VALOR RETENCION CREE ITEM EXTRANJERA", "DATOS ADICIONALES", "TIPO NOTA", "COMPROBANTE FACTURA RELACIONADA", "NUMERO FACTURA RELACIONADA", "NOTA CREDITO MOTIVO", "NOTA DEBITO MOTIVO", "ES FACTURA ELECTRONICA", "ES DEL AÑO ANTERIOR",
  "FECHA ENTREGA",
]

const CAMPOS = {
  "TIPO DE DOCUMENTO": "tipo",
  COMPROBANTE: "comprobante",
  NUMERO: "numero",
  SECUENCIA: "secuencia",
  IDENTIFICACION: "identificacion",
  "COD. CENTRO DE COSTO": "centro",
  "COD CENTRO DE COSTO": "centro",
  CANTIDAD: "cantidad",
  "CODIGO LINEA": "linea",
  "CODIGO GRUPO": "grupo",
  "CODIGO PRODUCTO": "producto",
}

function nombreColumna(valor) {
  return plano(encabezadoDe(valor)).replace(/\s*\.\s*/g, ". ").replace(/\.\s+/g, ". ")
}

function encabezadoDe(valor) {
  if (valor && typeof valor === "object" && "richText" in valor) {
    return valor.richText.map((parte) => parte.text).join("")
  }
  if (valor && typeof valor === "object" && "text" in valor) return valor.text
  return valor
}

function textoCelda(valor) {
  if (valor === null || valor === undefined) return ""
  if (valor instanceof Date) {
    const iso = valor.toISOString()
    return iso.slice(0, 10)
  }
  if (typeof valor === "object" && "result" in valor) return textoCelda(valor.result)
  if (typeof valor === "object" && "richText" in valor) return valor.richText.map((parte) => parte.text).join("")
  if (typeof valor === "object" && "text" in valor) return textoCelda(valor.text)
  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (Number.isInteger(valor)) return String(valor)
    return String(Math.round(valor * 1000000) / 1000000)
  }
  return String(valor)
}

export async function leerExcelContable(contenido) {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(contenido)
  const hoja = libro.getWorksheet("Hoja1") || libro.worksheets[0]
  if (!hoja) {
    const error = new Error("El Excel debe incluir la hoja Hoja1.")
    error.estado = 400
    throw error
  }
  const titulo = hoja.getRow(1)
  const porNombre = new Map()
  titulo.eachCell({ includeEmpty: false }, (celda, numero) => {
    const nombre = nombreColumna(celda.value).replace(/\./g, "")
    if (!porNombre.has(nombre)) porNombre.set(nombre, numero)
  })
  const posiciones = ENCABEZADOS_REFERENCIA.map((encabezado) => porNombre.get(nombreColumna(encabezado).replace(/\./g, "")) || null)
  const columnas = {}
  ENCABEZADOS_REFERENCIA.forEach((encabezado, indice) => {
    const campo = CAMPOS[nombreColumna(encabezado)] || CAMPOS[nombreColumna(encabezado).replace(/\./g, "")]
    if (campo && posiciones[indice]) columnas[campo] = posiciones[indice]
  })
  for (const campo of ["tipo", "comprobante", "numero", "secuencia", "identificacion", "centro"]) {
    if (!columnas[campo]) {
      const error = new Error("La hoja Hoja1 no tiene las columnas del paso de comprobantes.")
      error.estado = 400
      throw error
    }
  }
  const filas = []
  for (let numero = 2; numero <= hoja.rowCount; numero += 1) {
    const fila = hoja.getRow(numero)
    const leer = (indice) => {
      if (!indice) return ""
      return textoCelda(fila.getCell(indice).value).trim()
    }
    const valores = posiciones.map((indice) => leer(indice))
    const tomar = (campo) => leer(columnas[campo])
    const registro = {
      fila: numero,
      valores,
      tipo: textoClave(tomar("tipo")),
      comprobante: textoClave(tomar("comprobante")),
      numero: textoClave(tomar("numero")),
      secuencia: textoClave(tomar("secuencia")),
      identificacion: textoClave(tomar("identificacion")),
      centro: textoClave(tomar("centro")) || null,
      cantidad: columnas.cantidad ? textoClave(tomar("cantidad")) || null : null,
      linea: columnas.linea ? textoClave(tomar("linea")) || null : null,
      grupo: columnas.grupo ? textoClave(tomar("grupo")) || null : null,
      producto: columnas.producto ? textoClave(tomar("producto")) || null : null,
    }
    if (valores.every((valor) => valor === "")) continue
    filas.push(registro)
  }
  if (!filas.length) {
    const error = new Error("La hoja Hoja1 no tiene filas para validar.")
    error.estado = 400
    throw error
  }
  return { encabezados: ENCABEZADOS_REFERENCIA, filas }
}
