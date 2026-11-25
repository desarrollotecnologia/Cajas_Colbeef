export function plano(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}

export function textoClave(valor) {
  if (valor === null || valor === undefined || valor === "") return ""
  if (typeof valor === "number" && Number.isFinite(valor)) {
    if (Number.isInteger(valor)) return String(valor)
    if (Math.abs(valor - Math.round(valor)) < 1e-9) return String(Math.round(valor))
  }
  return String(valor).trim()
}

export function esOlimpica(nombre) {
  return plano(nombre).includes("OLIMPICA")
}

export function centroEsperado(nombre) {
  if (!nombre) return null
  return esOlimpica(nombre) ? "309" : "600"
}

export function claveDocumento(linea) {
  return [plano(linea.tipo), textoClave(linea.comprobante), textoClave(linea.numero)].join("-")
}

export function claveLinea(linea) {
  return `${claveDocumento(linea)}-${textoClave(linea.secuencia)}`
}

export function maestroDesdeEmpresas(empresas) {
  const grupos = new Map()
  for (const empresa of empresas) {
    const base = textoClave(String(empresa.nit ?? "").split("-")[0])
    if (!base) continue
    const grupo = grupos.get(base) || []
    grupo.push(empresa.nombre)
    grupos.set(base, grupo)
  }
  const maestro = new Map()
  for (const [base, nombres] of grupos) {
    const unicos = [...new Set(nombres.filter(Boolean))]
    if (unicos.length === 1) maestro.set(base, { nombre: unicos[0] })
    else maestro.set(base, { ambiguo: true })
  }
  return maestro
}

function mismoCentro(registrado, esperado) {
  const izquierda = Number(registrado)
  const derecha = Number(esperado)
  if (registrado !== "" && esperado !== "" && Number.isFinite(izquierda) && Number.isFinite(derecha)) {
    return izquierda === derecha
  }
  return plano(registrado) === plano(esperado)
}

function resolverCliente(identificacion, linea, maestro) {
  const id = textoClave(identificacion)
  if (linea && textoClave(linea.identificacion) === id && linea.cliente) return { nombre: linea.cliente }
  const entrada = maestro.get(id)
  if (!entrada) return { nombre: null, motivo: "Cliente sin identificar." }
  if (entrada.ambiguo) {
    return { nombre: null, motivo: `Cliente sin identificar. La identificación ${id} coincide con varios terceros.` }
  }
  return { nombre: entrada.nombre }
}

function numeroDe(valor) {
  if (valor === null || valor === undefined || valor === "") return null
  const numero = Number(String(valor).replace(",", "."))
  return Number.isFinite(numero) ? numero : null
}

function evaluar(fila, indice, documentos, maestro) {
  const documento = claveDocumento(fila)
  const clave = claveLinea(fila)
  const coincidencias = indice.get(clave) || []
  const encontrada = coincidencias.length === 1 ? coincidencias[0] : null
  const motivos = []
  const diferencias = { centro: null, cantidad: null, cruce: null }
  let cliente = { nombre: null }
  let esperado = null
  if (coincidencias.length === 0) {
    const texto = documentos.has(documento)
      ? `Pendiente de cruce. El renglón ${documento} secuencia ${textoClave(fila.secuencia)} no está en el documento de Logística.`
      : `Pendiente de cruce. El documento ${documento} no está en el documento de Logística.`
    diferencias.cruce = texto
    motivos.push(texto)
  } else if (coincidencias.length > 1) {
    const texto = `Pendiente de cruce. El renglón ${clave} está repetido en el documento de Logística.`
    diferencias.cruce = texto
    motivos.push(texto)
  } else {
    cliente = resolverCliente(fila.identificacion, encontrada, maestro)
    if (!cliente.nombre) {
      motivos.push(cliente.motivo)
      diferencias.centro = { cargado: textoClave(fila.centro) || null, esperado: null, motivo: cliente.motivo }
    } else {
      esperado = centroEsperado(cliente.nombre)
      const registrado = textoClave(fila.centro)
      if (!registrado) {
        const motivo = `Centro de costo vacío. ${cliente.nombre} tiene registrado el centro vacío y le corresponde el ${esperado}.`
        motivos.push(motivo)
        diferencias.centro = { cargado: null, esperado, motivo }
      } else if (!mismoCentro(registrado, esperado)) {
        const motivo = `Centro de costo incorrecto. ${cliente.nombre} tiene registrado el centro ${registrado} y le corresponde el ${esperado}.`
        motivos.push(motivo)
        diferencias.centro = { cargado: registrado, esperado, motivo }
      }
    }
    const contabilidad = numeroDe(fila.cantidad)
    const logistica = numeroDe(encontrada.cantidad)
    if (contabilidad !== logistica) {
      const motivo = `Unidades distintas. Contabilidad cargó ${fila.cantidad ?? "vacío"} y Logística tiene ${encontrada.cantidad ?? "vacío"}.`
      motivos.push(motivo)
      diferencias.cantidad = { contabilidad: fila.cantidad ?? null, logistica: encontrada.cantidad ?? null, motivo }
    }
  }
  return {
    fila: fila.fila,
    valores: fila.valores || [],
    documento,
    clave,
    comprobante: textoClave(fila.comprobante),
    numero: textoClave(fila.numero),
    secuencia: textoClave(fila.secuencia),
    identificacion: textoClave(fila.identificacion),
    cliente: cliente.nombre,
    centroRegistrado: textoClave(fila.centro) || null,
    centroEsperado: esperado,
    diferencias,
    motivo: motivos.join(" "),
    requiereRevision: motivos.length > 0,
  }
}

export function claveDocumentoContable(tipo, comprobante, numero) {
  return plano(`${tipo || ""}${comprobante || ""}${numero || ""}`).replace(/[^A-Z0-9]/g, "")
}

export function claveReferenciaCaja(linea, grupo, producto) {
  const partes = [linea, grupo, producto].map((parte) => {
    const texto = textoClave(parte)
    if (!texto) return ""
    return /^\d+$/.test(texto) ? String(Number(texto)) : texto
  })
  if (partes.some((parte) => !parte)) return ""
  return partes.join("-")
}

function clienteDelH7(registros) {
  const nombres = [...new Set(registros.map((registro) => registro.cliente).filter(Boolean))]
  if (nombres.length === 1) return nombres[0]
  return null
}

export function validarContraLogistica(filas, registros) {
  const grupos = new Map()
  const porDocumento = new Map()
  for (const registro of registros) {
    const documento = claveDocumentoContable(registro.documento)
    if (!documento) continue
    const delDocumento = porDocumento.get(documento) || []
    delDocumento.push(registro)
    porDocumento.set(documento, delDocumento)
    if (!registro.referencia) continue
    const clave = `${documento}|${registro.referencia}`
    const grupo = grupos.get(clave) || []
    grupo.push(registro)
    grupos.set(clave, grupo)
  }
  const resultado = filas.map((fila) => evaluarRegistro(fila, grupos, porDocumento))
  const revision = resultado.filter((fila) => fila.requiereRevision).length
  return {
    resumen: {
      procesadas: resultado.length,
      correctas: resultado.length - revision,
      revision,
      sinDiferencias: revision === 0 && resultado.length > 0,
    },
    filas: resultado,
    pendientesLogistica: [],
  }
}

function revisarCentro(fila, cliente, motivos, diferencias) {
  const esperado = centroEsperado(cliente)
  const registrado = textoClave(fila.centro)
  if (!registrado) {
    const motivo = `Centro de costo vacío. ${cliente} tiene registrado el centro vacío y le corresponde el ${esperado}.`
    motivos.push(motivo)
    diferencias.centro = { cargado: null, esperado, motivo }
  } else if (!mismoCentro(registrado, esperado)) {
    const motivo = `Centro de costo incorrecto. ${cliente} tiene registrado el centro ${registrado} y le corresponde el ${esperado}.`
    motivos.push(motivo)
    diferencias.centro = { cargado: registrado, esperado, motivo }
  }
  return esperado
}

function evaluarRegistro(fila, grupos, porDocumento) {
  const documento = claveDocumentoContable(fila.tipo, fila.comprobante, fila.numero)
  const referencia = claveReferenciaCaja(fila.linea, fila.grupo, fila.producto)
  const motivos = []
  const diferencias = { centro: null, cantidad: null, cruce: null }
  let cliente = clienteDelH7(porDocumento.get(documento) || [])
  let esperado = null
  if (cliente) esperado = revisarCentro(fila, cliente, motivos, diferencias)
  if (!documento || !referencia) {
    const texto = !documento
      ? "Pendiente de cruce. El renglón no trae tipo de documento, comprobante y número."
      : "Pendiente de cruce. El renglón no trae el código de línea, grupo y producto de la referencia."
    diferencias.cruce = texto
    motivos.push(texto)
  } else {
    const coincidencias = grupos.get(`${documento}|${referencia}`) || []
    if (coincidencias.length === 0) {
      const texto = `Pendiente de cruce. No hay un registro de Logística con el documento ${textoClave(fila.tipo)}${textoClave(fila.comprobante)}-${textoClave(fila.numero)} y la referencia ${referencia}.`
      diferencias.cruce = texto
      motivos.push(texto)
    } else if (coincidencias.length > 1) {
      const texto = `Pendiente de cruce. El documento ${textoClave(fila.tipo)}${textoClave(fila.comprobante)}-${textoClave(fila.numero)} y la referencia ${referencia} coinciden con varios registros de Logística.`
      diferencias.cruce = texto
      motivos.push(texto)
    } else {
      const registro = coincidencias[0]
      cliente = registro.cliente || cliente
      if (!cliente) {
        const motivo = "Pendiente de cruce. El H7 de Logística no identifica el cliente."
        diferencias.cruce = motivo
        motivos.push(motivo)
      } else if (!esperado) {
        esperado = revisarCentro(fila, cliente, motivos, diferencias)
      }
      if (registro.cantidad === null || registro.cantidad === undefined || registro.cantidad === "") {
        const motivo = "Unidades pendientes de validar"
        motivos.push(motivo)
        diferencias.cantidad = { contabilidad: fila.cantidad ?? null, logistica: null, motivo }
      } else {
        const contabilidad = numeroDe(fila.cantidad)
        const logistica = numeroDe(registro.cantidad)
        if (contabilidad !== logistica) {
          const motivo = `Unidades distintas. Contabilidad cargó ${fila.cantidad ?? "vacío"} y Logística tiene ${registro.cantidad}.`
          motivos.push(motivo)
          diferencias.cantidad = { contabilidad: fila.cantidad ?? null, logistica: registro.cantidad, motivo }
        }
      }
    }
  }
  return {
    fila: fila.fila,
    valores: fila.valores || [],
    documento,
    referencia,
    cliente,
    centroRegistrado: textoClave(fila.centro) || null,
    centroEsperado: esperado,
    diferencias,
    motivo: motivos.join(" "),
    requiereRevision: motivos.length > 0,
  }
}

export function validarFilas(filas, lineas, maestro = new Map()) {
  const indice = new Map()
  const documentos = new Set()
  for (const linea of lineas) {
    documentos.add(claveDocumento(linea))
    const clave = claveLinea(linea)
    const grupo = indice.get(clave) || []
    grupo.push(linea)
    indice.set(clave, grupo)
  }
  const resultado = filas.map((fila) => evaluar(fila, indice, documentos, maestro))
  const usadas = new Set(resultado.filter((fila) => !fila.diferencias.cruce).map((fila) => fila.clave))
  const pendientesLogistica = []
  for (const [clave, grupo] of indice) {
    if (usadas.has(clave)) continue
    const linea = grupo[0]
    pendientesLogistica.push({
      clave,
      documento: claveDocumento(linea),
      secuencia: textoClave(linea.secuencia),
      cliente: linea.cliente || null,
      motivo: "Pendiente de cruce. Este renglón de Logística no está en el archivo de Contabilidad.",
    })
  }
  const revision = resultado.filter((fila) => fila.requiereRevision).length + pendientesLogistica.length
  return {
    resumen: {
      procesadas: resultado.length,
      correctas: resultado.filter((fila) => !fila.requiereRevision).length,
      revision,
      sinDiferencias: revision === 0,
    },
    filas: resultado,
    pendientesLogistica,
  }
}
