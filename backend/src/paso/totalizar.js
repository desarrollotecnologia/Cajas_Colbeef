function valoresUnicos(registros, campo) {
  return [...new Set(registros.map((registro) => registro[campo]).filter((valor) => valor !== null && valor !== undefined && valor !== ""))]
}

function unoOVarios(registros, campo) {
  const valores = valoresUnicos(registros, campo)
  if (!valores.length) return null
  return valores.length === 1 ? valores[0] : "VARIOS"
}

function unir(registros, campo) {
  const valores = valoresUnicos(registros, campo)
  return valores.length ? valores.join(" | ") : null
}

function sumar(registros, campo) {
  const valores = registros.map((registro) => registro[campo]).filter((valor) => valor !== null && valor !== undefined)
  if (!valores.length) return null
  return Math.round(valores.reduce((total, valor) => total + Number(valor), 0) * 100) / 100
}

function cajasUnicas(registros) {
  const cajas = new Map()
  for (const registro of registros) {
    for (const caja of registro.cajasDespachadas || []) {
      if (caja?.id !== null && caja?.id !== undefined) cajas.set(String(caja.id), caja)
    }
  }
  return [...cajas.values()]
}

function diaDe(valor) {
  if (!valor) return ""
  const texto = String(valor)
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return texto.slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha)
}

export function totalizarPorCliente(registros) {
  const grupos = new Map()
  for (const registro of registros) {
    const cliente = registro.cliente || "Cliente sin identificar"
    const clave = `${diaDe(registro.fecha)}|${cliente}`
    if (!grupos.has(clave)) grupos.set(clave, [])
    grupos.get(clave).push(registro)
  }

  return [...grupos.values()].map((grupo) => {
    const primero = grupo[0]
    const cajas = cajasUnicas(grupo)
    return {
      ...primero,
      fecha: primero.fecha,
      lote: unoOVarios(grupo, "lote"),
      clienteDesposte: unoOVarios(grupo, "clienteDesposte"),
      cantidad: cajas.length || sumar(grupo, "cantidad"),
      producto: unoOVarios(grupo, "producto"),
      pesoLote: cajas.length
        ? Math.round(cajas.reduce((total, caja) => total + Number(caja.peso || 0), 0) * 100) / 100
        : sumar(grupo, "pesoLote"),
      placa: unir(grupo, "placa"),
      conductor: unir(grupo, "conductor"),
      documentoSiimed: unir(grupo, "documentoSiimed"),
      fechaRealizacion: primero.fechaRealizacion,
      referencia: unir(grupo, "referencia"),
      guiaTransporte: unir(grupo, "guiaTransporte"),
      rutaSucursalDestino: unir(grupo, "rutaSucursalDestino"),
      propietario: unoOVarios(grupo, "propietario"),
      tipoConservacion: unoOVarios(grupo, "tipoConservacion"),
      cajasDespachadas: undefined,
    }
  })
}
