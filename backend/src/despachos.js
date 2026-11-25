import { conLectura } from "./acceso.js"
import { conexion } from "./db.js"

const DOCUMENTO_SIIMED = "NULL::text"
const ORDEN = "ORDER BY fecha DESC NULLS LAST, detalle_id ASC, vehiculo_id ASC"
const COLUMNAS_SQL = `
  detalle_id,
  vehiculo_id,
  fecha,
  lote,
  cliente_desposte,
  cliente,
  cantidad,
  producto,
  peso_lote,
  placa,
  conductor,
  documento_siimed,
  fecha_realizacion,
  referencia,
  guia_transporte,
  sucursal_ids,
  cajas_despachadas,
  ruta_sucursal_destino,
  propietario,
  tipo_conservacion`

const FECHA_DIRECTA = `od.fecha_despacho_planta >= $1::timestamp AND od.fecha_despacho_planta < $2::timestamp`
const FECHA_FLEXIBLE = `($3::text IS DISTINCT FROM 'fecha' OR (($1::text IS NULL OR od.fecha_despacho_planta >= $1::timestamp) AND ($2::text IS NULL OR od.fecha_despacho_planta < $2::timestamp)))`
const REAL_DIRECTA = `$3::text = 'fecha'`
const REAL_FLEXIBLE = `($3::text IS DISTINCT FROM 'realizacion' OR (($1::text IS NULL OR (CASE WHEN va.hora_salida IS NULL THEN va.fecha_salida::timestamp AT TIME ZONE 'America/Bogota' ELSE va.fecha_salida + va.hora_salida END) >= ($1::timestamp AT TIME ZONE 'America/Bogota')) AND ($2::text IS NULL OR (CASE WHEN va.hora_salida IS NULL THEN va.fecha_salida::timestamp AT TIME ZONE 'America/Bogota' ELSE va.fecha_salida + va.hora_salida END) < ($2::timestamp AT TIME ZONE 'America/Bogota'))))`

const AGRUPADO_BASE = `
WITH cajas_validas AS MATERIALIZED (
  SELECT DISTINCT
    odd.id AS detalle_id,
    va.id AS vehiculo_id,
    ca.id AS caja_id,
    ca.peso,
    ca.id_ruta_sucursal
  FROM desposte.orden_despacho_detalle odd
  JOIN desposte.orden_despacho od ON od.id = odd.id_orden_despacho
  JOIN desposte.lote l ON l.id = odd.id_lote
  JOIN desposte.vehiculo_asignado_orden_despacho vaod ON vaod.id_orden_despacho = od.id
  JOIN trazabilidad_proceso.vehiculo_asignado va
    ON va.id = vaod.id_vehiculo_asignado
   AND va.id_tipo_despacho = 13
   AND va.fecha_salida IS NOT NULL
  JOIN desposte.caja ca
    ON ca.id_vehiculo_orden = vaod.id
   AND ca.id_lote = l.id
   AND ca.fecha_despacho IS NOT NULL
   AND ca.codigo NOT ILIKE 'prealist%'
   AND ca.codigo NOT ILIKE 'desembarco%'
  JOIN desposte.caja_producto_desposte cpd
    ON cpd.id_caja = ca.id
   AND cpd.fecha_creacion <= ca.fecha_despacho
   AND (cpd.fecha_fin_vigencia IS NULL OR cpd.fecha_fin_vigencia > ca.fecha_despacho)
  JOIN desposte.producto_desposte pd
    ON pd.id = cpd.id_producto_desposte
   AND pd.id_lote = l.id
   AND (odd.id_tipo_conservacion IS NULL OR pd.id_tipo_conservacion = odd.id_tipo_conservacion)
  JOIN desposte.nombre_corte nc
    ON nc.id = pd.id_nombre_corte
   AND nc.id_corte = odd.id_corte
  WHERE FECHA_PRED
    AND REAL_PRED
),
agrupado AS (
  SELECT
    odd.id AS detalle_id,
    va.id AS vehiculo_id,
    MAX(od.fecha_despacho_planta) AS fecha,
    MAX(l.codigo) AS lote,
    MAX(cliente_desposte.nombre) AS cliente_desposte,
    MAX(cliente.nombre) AS cliente,
    COUNT(DISTINCT ca.id)::int AS cantidad,
    MAX(corte.nombre) AS producto,
    SUM(cv.peso) AS peso_lote,
    NULLIF(BTRIM(MAX(va.placa_vehiculo)), '') AS placa,
    NULLIF(BTRIM(CONCAT_WS(' ', MAX(per.nombres), MAX(per.apellidos))), '') AS conductor,
    MAX(${DOCUMENTO_SIIMED}) AS documento_siimed,
    CASE
      WHEN MAX(va.hora_salida) IS NULL THEN MAX(va.fecha_salida)::timestamp AT TIME ZONE 'America/Bogota'
      ELSE MAX(va.fecha_salida) + MAX(va.hora_salida)
    END AS fecha_realizacion,
    CASE
      WHEN MAX(cliente.nombre) ILIKE '%OLIMP%' THEN '30-10-100019'
      ELSE '30-10-24'
    END AS referencia,
    NULL::text AS guia_transporte,
    ARRAY_AGG(DISTINCT sucursal.id) FILTER (WHERE sucursal.id IS NOT NULL) AS sucursal_ids,
    JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('id', ca.id, 'peso', ca.peso)) AS cajas_despachadas,
    NULLIF(
      STRING_AGG(
        DISTINCT NULLIF(CONCAT_WS(' / ', ruta.nombre, sucursal.nombre, destino.nombre), ''),
        ' | '
      ),
      ''
    ) AS ruta_sucursal_destino,
    MAX(cliente_desposte.nombre) AS propietario,
    MAX(tc.nombre) AS tipo_conservacion
  FROM cajas_validas cv
  JOIN desposte.orden_despacho_detalle odd ON odd.id = cv.detalle_id
  JOIN desposte.orden_despacho od ON od.id = odd.id_orden_despacho
  JOIN desposte.lote l ON l.id = odd.id_lote
  JOIN desposte.corte corte ON corte.id = odd.id_corte
  LEFT JOIN desposte.tipo_conservacion tc ON tc.id = odd.id_tipo_conservacion
  JOIN desposte.plan_desposte plan ON plan.id = l.id_plan_desposte
  JOIN desposte.pedido pedido ON pedido.id = plan.id_pedido
  JOIN desposte.ficha_empresa ficha ON ficha.id = pedido.id_ficha_empresa
  JOIN organizaciones.empresa cliente_desposte ON cliente_desposte.id = ficha.id_empresa
  JOIN organizaciones.empresa cliente ON cliente.id = od.id_empresa
  JOIN trazabilidad_proceso.vehiculo_asignado va
    ON va.id = cv.vehiculo_id
  LEFT JOIN recursos_humanos.persona per ON per.id = va.id_conductor
  JOIN desposte.caja ca ON ca.id = cv.caja_id
  LEFT JOIN desposte.ruta_sucursal rs ON rs.id = cv.id_ruta_sucursal
  LEFT JOIN desposte.ruta ruta ON ruta.id = rs.id_ruta
  LEFT JOIN organizaciones.sucursal sucursal ON sucursal.id = rs.id_sucursal
  LEFT JOIN trazabilidad_proceso.destino destino ON destino.id = sucursal.id_destino
  WHERE ($4::text IS NULL OR cliente.nombre ILIKE $4 ESCAPE '\\')
    AND ($5::text IS NULL OR corte.nombre ILIKE $5 ESCAPE '\\')
    AND ($6::text IS NULL OR l.codigo ILIKE $6 ESCAPE '\\')
    AND (
      $7::text IS NULL
      OR regexp_replace(lower(btrim(${DOCUMENTO_SIIMED})), '\\s*-\\s*', '-', 'g') = $7
    )
    AND ($8::text IS NULL OR lower(btrim(va.placa_vehiculo)) = $8)
    AND NOT (
      destino.nombre IS NOT DISTINCT FROM 'CAVA'
      AND sucursal.nombre IS NOT DISTINCT FROM 'BODEGA COLBEEF'
    )
  GROUP BY odd.id, va.id
)
`

function agrupado(fechaDirecta) {
  const sql = AGRUPADO_BASE.replace("FECHA_PRED", fechaDirecta ? FECHA_DIRECTA : FECHA_FLEXIBLE).replace(
    "REAL_PRED",
    fechaDirecta ? REAL_DIRECTA : REAL_FLEXIBLE,
  )
  if (!fechaDirecta) return sql
  return sql
    .replace(
      "WITH cajas_validas AS MATERIALIZED (",
      `WITH ordenes_dia AS MATERIALIZED (
  SELECT od.id
  FROM desposte.orden_despacho od
  WHERE ${FECHA_DIRECTA}
),
cajas_validas AS MATERIALIZED (`,
    )
    .replace(
      "FROM desposte.orden_despacho_detalle odd\n  JOIN desposte.orden_despacho od ON od.id = odd.id_orden_despacho",
      "FROM ordenes_dia\n  JOIN desposte.orden_despacho od ON od.id = ordenes_dia.id\n  JOIN desposte.orden_despacho_detalle odd ON odd.id_orden_despacho = od.id",
    )
}

const AGRUPADO = agrupado(false)
const AGRUPADO_POR_FECHA = agrupado(true)

const GUIAS = `
SELECT vas.id_vehiculo_asignado AS vehiculo_id,
       vas.id_sucursal AS sucursal_id,
       vas.numero_guia_transporte_completo AS numero
FROM trazabilidad_proceso.vehiculo_asignado_sucursal vas
WHERE vas.fecha_fin_vigencia IS NULL
  AND vas.id_vehiculo_asignado = ANY($1::bigint[])
ORDER BY vas.id
`

const CONSULTA = `
${AGRUPADO}
SELECT c.total, a.detalle_id, a.vehiculo_id, a.fecha, a.lote, a.cliente_desposte, a.cliente,
  a.cantidad, a.producto, a.peso_lote, a.placa, a.conductor, a.documento_siimed, a.fecha_realizacion,
  a.referencia, a.guia_transporte, a.cajas_despachadas, a.ruta_sucursal_destino, a.propietario, a.tipo_conservacion
FROM (SELECT COUNT(*)::int AS total FROM agrupado) c
LEFT JOIN (
  SELECT ${COLUMNAS_SQL}
  FROM agrupado
  ${ORDEN}
  LIMIT $9 OFFSET $10
) a ON TRUE
`

const CONSULTA_COMPLETA = `
${AGRUPADO}
SELECT ${COLUMNAS_SQL}
FROM agrupado
${ORDEN}
`

const CONSULTA_COMPLETA_POR_FECHA = `
${AGRUPADO_POR_FECHA}
SELECT ${COLUMNAS_SQL}
FROM agrupado
${ORDEN}
`

const CONSULTA_POR_FECHA = `
${AGRUPADO_POR_FECHA}
SELECT c.total, a.detalle_id, a.vehiculo_id, a.fecha, a.lote, a.cliente_desposte, a.cliente,
  a.cantidad, a.producto, a.peso_lote, a.placa, a.conductor, a.documento_siimed, a.fecha_realizacion,
  a.referencia, a.guia_transporte, a.cajas_despachadas, a.ruta_sucursal_destino, a.propietario, a.tipo_conservacion
FROM (SELECT COUNT(*)::int AS total FROM agrupado) c
LEFT JOIN (
  SELECT ${COLUMNAS_SQL}
  FROM agrupado
  ${ORDEN}
  LIMIT $9 OFFSET $10
) a ON TRUE
`

function porFecha(filtros) {
  return filtros.campo === "fecha" && Boolean(filtros.inicio) && Boolean(filtros.finExclusivo)
}

export function numeroONulo(valor) {
  if (valor === null || valor === undefined) return null
  const numero = Number(valor)
  return Number.isNaN(numero) ? null : numero
}

function textoONulo(valor) {
  if (valor === null || valor === undefined) return null
  const texto = String(valor).trim()
  return texto ? texto : null
}

function momentoONulo(valor) {
  if (valor === null || valor === undefined) return null
  if (valor instanceof Date) return valor.toISOString()
  return String(valor)
}

export function filaDe(registro) {
  return {
    detalleId: registro.detalle_id,
    vehiculoId: registro.vehiculo_id,
    fecha: momentoONulo(registro.fecha),
    lote: textoONulo(registro.lote),
    clienteDesposte: textoONulo(registro.cliente_desposte),
    cliente: textoONulo(registro.cliente),
    cantidad: numeroONulo(registro.cantidad),
    producto: textoONulo(registro.producto),
    pesoLote: numeroONulo(registro.peso_lote),
    placa: textoONulo(registro.placa),
    conductor: textoONulo(registro.conductor),
    documentoSiimed: textoONulo(registro.documento_siimed),
    fechaRealizacion: momentoONulo(registro.fecha_realizacion),
    referencia: textoONulo(registro.referencia),
    guiaTransporte: textoONulo(registro.guia_transporte),
    cajasDespachadas: Array.isArray(registro.cajas_despachadas) ? registro.cajas_despachadas : [],
    rutaSucursalDestino: textoONulo(registro.ruta_sucursal_destino),
    propietario: textoONulo(registro.propietario),
    tipoConservacion: textoONulo(registro.tipo_conservacion),
  }
}

async function completarGuias(filas) {
  const vehiculos = [...new Set(filas.map((fila) => fila.vehiculo_id).filter((id) => id != null))]
  if (!vehiculos.length) return
  const { rows } = await conexion().query(GUIAS, [vehiculos])
  const porSucursal = new Map()
  const general = new Map()
  for (const guia of rows) {
    const numero = textoONulo(guia.numero)
    if (!numero) continue
    const clave = `${guia.vehiculo_id}:${guia.sucursal_id}`
    if (!porSucursal.has(clave)) porSucursal.set(clave, numero)
    if (!general.has(String(guia.vehiculo_id))) general.set(String(guia.vehiculo_id), numero)
  }
  for (const fila of filas) {
    const sucursales = Array.isArray(fila.sucursal_ids) ? fila.sucursal_ids : []
    const numeros = []
    const agregar = (numero) => {
      if (numero && !numeros.includes(numero)) numeros.push(numero)
    }
    const cualquiera = general.get(String(fila.vehiculo_id))
    if (sucursales.length) {
      for (const sucursalId of sucursales) agregar(porSucursal.get(`${fila.vehiculo_id}:${sucursalId}`) || cualquiera)
    } else {
      agregar(cualquiera)
    }
    fila.guia_transporte = numeros.length ? numeros.join(" | ") : null
  }
}

export async function consultarDespachos(filtros) {
  return conLectura(async () => {
    const { rows } = await conexion().query(porFecha(filtros) ? CONSULTA_POR_FECHA : CONSULTA, [
      filtros.inicio,
      filtros.finExclusivo,
      filtros.campo,
      filtros.cliente,
      filtros.producto,
      filtros.lote,
      filtros.documento,
      filtros.placa,
      filtros.limite,
      filtros.desplazamiento,
    ])
    const total = rows.length ? Number(rows[0].total) : 0
    const presentes = rows.filter((fila) => fila.detalle_id != null)
    await completarGuias(presentes)
    return { registros: presentes.map(filaDe), total }
  })
}

export async function listarDespachos(filtros) {
  return conLectura(async () => {
    const { rows } = await conexion().query(porFecha(filtros) ? CONSULTA_COMPLETA_POR_FECHA : CONSULTA_COMPLETA, [
      filtros.inicio,
      filtros.finExclusivo,
      filtros.campo,
      filtros.cliente,
      filtros.producto,
      filtros.lote,
      filtros.documento,
      filtros.placa,
    ])
    await completarGuias(rows)
    return rows.map(filaDe)
  })
}
