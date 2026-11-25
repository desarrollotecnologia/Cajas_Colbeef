import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import express from "express"
import { consultarDespachos, listarDespachos } from "./despachos.js"
import { libroExcel } from "./excel.js"
import { interpretarConsulta, paginacionDe } from "./filtros.js"
import { prepararMysql } from "./paso/mysql.js"
import { rutasPaso } from "./paso/rutas.js"

const app = express()

app.get("/api/salud", async (_req, res, next) => {
  try {
    const { conLectura } = await import("./acceso.js")
    await conLectura(async () => true)
    res.json({ ok: true, soloLectura: true })
  } catch (error) {
    next(error)
  }
})

app.get("/api/despachos-fuera-de-planta/excel", async (req, res, next) => {
  try {
    const filtros = interpretarConsulta(req.query)
    const registros = await listarDespachos(filtros)
    const archivo = await libroExcel(registros)
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    res.setHeader("Content-Disposition", 'attachment; filename="beef-box.xlsx"')
    res.send(archivo)
  } catch (error) {
    next(error)
  }
})

app.get("/api/despachos-fuera-de-planta", async (req, res, next) => {
  try {
    const filtros = interpretarConsulta(req.query)
    const { registros, total } = await consultarDespachos(filtros)
    res.json({
      registros,
      total,
      paginacion: paginacionDe(total, filtros.pagina, filtros.limite, filtros.desplazamiento),
    })
  } catch (error) {
    next(error)
  }
})

app.use("/api/paso", express.json({ limit: "1mb" }), rutasPaso)

const publico = join(dirname(fileURLToPath(import.meta.url)), "..", "public")
function sinCache(res) {
  res.setHeader("Cache-Control", "no-cache")
}

app.get("/", (_req, res) => {
  sinCache(res)
  res.sendFile(join(publico, "paso", "index.html"))
})
app.use(express.static(publico, { setHeaders: sinCache }))
app.get(/^\/paso(?:\/.*)?$/, (req, res, next) => {
  if (req.path.includes(".")) {
    next()
    return
  }
  sinCache(res)
  res.sendFile(join(publico, "paso", "index.html"))
})

app.use((error, _req, res, _next) => {
  if (error.estado) {
    res.status(error.estado).json({ error: error.message })
    return
  }
  console.error("sirt", error.code || "fallo")
  res.status(503).json({ error: "SIRT no está disponible." })
})

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (esPrincipal) {
  const puerto = Number(process.env.PORT || 3000)
  const servidor = app.listen(puerto, "127.0.0.1", () => {
    prepararMysql()
      .then(() => console.log(`Box Beef escucha en http://127.0.0.1:${puerto}`))
      .catch((error) => {
        console.error("mysql", error.code || error.message)
        process.exit(1)
      })
  })
  servidor.on("error", (error) => {
    console.error("sirt", error.code || "puerto")
    process.exit(1)
  })
}

export { app }
