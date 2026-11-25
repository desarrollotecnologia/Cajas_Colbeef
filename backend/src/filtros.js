const CAMPOS = new Set(["fecha", "realizacion"])
const LIMITE_DEFECTO = 50
const LIMITE_MAXIMO = 100

export function normalizarDocumento(valor) {
  return String(valor).trim().replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").toLowerCase()
}

function escaparLike(valor) {
  return valor.replace(/[\\%_]/g, (caracter) => `\\${caracter}`)
}

function pad(numero) {
  return String(numero).padStart(2, "0")
}

function fechaCalendario(anio, mes, dia) {
  const marca = new Date(Date.UTC(anio, mes - 1, dia))
  return marca.getUTCFullYear() === anio && marca.getUTCMonth() === mes - 1 && marca.getUTCDate() === dia
}

function textoDeReloj(anio, mes, dia, hora, minuto, segundo) {
  return `${anio}-${pad(mes)}-${pad(dia)} ${pad(hora)}:${pad(minuto)}:${pad(segundo)}`
}

function sumarSegundo(texto) {
  const [fecha, hora] = texto.split(" ")
  const [anio, mes, dia] = fecha.split("-").map(Number)
  const [hh, mm, ss] = hora.split(":").map(Number)
  const marca = new Date(Date.UTC(anio, mes - 1, dia, hh, mm, ss + 1))
  return textoDeReloj(
    marca.getUTCFullYear(),
    marca.getUTCMonth() + 1,
    marca.getUTCDate(),
    marca.getUTCHours(),
    marca.getUTCMinutes(),
    marca.getUTCSeconds(),
  )
}

function diaSiguiente(fecha) {
  const [anio, mes, dia] = fecha.split("-").map(Number)
  const marca = new Date(Date.UTC(anio, mes - 1, dia + 1))
  return textoDeReloj(marca.getUTCFullYear(), marca.getUTCMonth() + 1, marca.getUTCDate(), 0, 0, 0)
}

function errorFiltro(mensaje) {
  const error = new Error(mensaje)
  error.estado = 400
  return error
}

export function leerMomento(valor, nombre) {
  if (valor === undefined || valor === null || valor === "") return null
  if (typeof valor !== "string") throw errorFiltro(`${nombre} debe ser una fecha.`)
  const texto = valor.trim()
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto)
  const conHora = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(texto)
  const partes = soloFecha || conHora
  if (!partes) throw errorFiltro(`${nombre} debe usar AAAA-MM-DD o AAAA-MM-DDTHH:mm.`)
  const anio = Number(partes[1])
  const mes = Number(partes[2])
  const dia = Number(partes[3])
  if (!fechaCalendario(anio, mes, dia)) throw errorFiltro(`${nombre} no es una fecha válida.`)
  if (!conHora) return { conHora: false, inicio: `${partes[1]}-${partes[2]}-${partes[3]} 00:00:00`, finExclusivo: diaSiguiente(`${partes[1]}-${partes[2]}-${partes[3]}`) }
  const hora = Number(partes[4])
  const minuto = Number(partes[5])
  const segundo = Number(partes[6] || 0)
  if (hora > 23 || minuto > 59 || segundo > 59) throw errorFiltro(`${nombre} no es una hora válida.`)
  const instante = textoDeReloj(anio, mes, dia, hora, minuto, segundo)
  return { conHora: true, inicio: instante, finExclusivo: sumarSegundo(instante) }
}

function leerTexto(valor, nombre, maximo) {
  if (valor === undefined || valor === null || valor === "") return null
  if (typeof valor !== "string") throw errorFiltro(`${nombre} debe ser texto.`)
  const texto = valor.trim()
  if (!texto) return null
  if (texto.length > maximo) throw errorFiltro(`${nombre} admite hasta ${maximo} caracteres.`)
  return texto
}

function leerEntero(valor, nombre, defecto, minimo, maximo) {
  if (valor === undefined || valor === null || valor === "") return defecto
  if (typeof valor !== "string" || !/^\d+$/.test(valor)) throw errorFiltro(`${nombre} debe ser un entero.`)
  const numero = Number(valor)
  if (numero < minimo || numero > maximo) throw errorFiltro(`${nombre} debe estar entre ${minimo} y ${maximo}.`)
  return numero
}

export function interpretarConsulta(consulta) {
  const desde = leerMomento(consulta.desde, "desde")
  const hasta = leerMomento(consulta.hasta, "hasta")
  const hayRango = Boolean(desde || hasta)
  let campo = null
  if (consulta.campo !== undefined && consulta.campo !== "") {
    if (typeof consulta.campo !== "string") throw errorFiltro("campo debe ser fecha o realizacion.")
    campo = consulta.campo.trim().toLowerCase()
    if (!CAMPOS.has(campo)) throw errorFiltro("campo debe ser fecha o realizacion.")
  }
  if (hayRango && !campo) campo = "fecha"
  if (campo && !hayRango) throw errorFiltro("Indica desde o hasta para filtrar por fecha.")
  const inicio = desde?.inicio ?? null
  const finExclusivo = hasta ? hasta.finExclusivo : null
  if (inicio && finExclusivo && inicio >= finExclusivo) throw errorFiltro("La fecha inicial queda después del fin.")

  const limite = leerEntero(consulta.limite, "limite", LIMITE_DEFECTO, 1, LIMITE_MAXIMO)
  const pagina = leerEntero(consulta.pagina, "pagina", 1, 1, 10000)
  const documento = leerTexto(consulta.documento, "documento", 40)
  const placa = leerTexto(consulta.placa, "placa", 12)

  return {
    campo,
    inicio,
    finExclusivo,
    cliente: patron(leerTexto(consulta.cliente, "cliente", 120)),
    producto: patron(leerTexto(consulta.producto, "producto", 120)),
    lote: patron(leerTexto(consulta.lote, "lote", 40)),
    documento: documento ? normalizarDocumento(documento) : null,
    placa: placa ? placa.toLowerCase() : null,
    pagina,
    limite,
    desplazamiento: (pagina - 1) * limite,
  }
}

function patron(texto) {
  if (!texto) return null
  return `%${escaparLike(texto)}%`
}

export function paginacionDe(total, pagina, limite, desplazamiento) {
  return {
    pagina,
    limite,
    desplazamiento,
    paginas: total === 0 ? 0 : Math.ceil(total / limite),
    orden: ["fecha desc", "detalleId asc", "vehiculoId asc"],
  }
}
