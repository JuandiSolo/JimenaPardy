import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'

// base solo en producción (GitHub Pages); en dev servimos desde /
const isProd = process.env.NODE_ENV === 'production'

// Middleware para servir HTMLs en rutas limpias (/moderador, /tablero, /capitan) en dev
function htmlMiddleware() {
  return {
    name: 'html-clean-urls',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        const htmlMap: Record<string, string> = {
          '/moderador': 'src/pages/moderador.html',
          '/tablero': 'src/pages/tablero.html',
          '/capitan': 'src/pages/capitan.html',
        }
        const file = htmlMap[url]
        if (file && fs.existsSync(file)) {
          res.setHeader('Content-Type', 'text/html')
          res.end(fs.readFileSync(file))
          return
        }
        next()
      })
    }
  }
}

// Plugin: copiar HTMLs a raíz de dist con nombres limpios (moderador.html, tablero.html, capitan.html)
function copyHtmlsToRoot() {
  return {
    name: 'copy-htmls-to-root',
    closeBundle() {
      const pages = ['moderador', 'tablero', 'capitan']
      pages.forEach(page => {
        const src = path.resolve(__dirname, 'dist', 'src', 'pages', `${page}.html`)
        const dest = path.resolve(__dirname, 'dist', `${page}.html`)
        if (fs.existsSync(src)) {
          // Leer y reescribir rutas de assets para que apunten a /JeopardyEvento/assets/...
          let html = fs.readFileSync(src, 'utf-8')
          // Vite ya pone base en los assets, solo copiar
          fs.writeFileSync(dest, html)
          console.log(`Copied ${page}.html to dist root`)
        }
      })
    }
  }
}

export default defineConfig({
  base: isProd ? '/JimenaPardy/' : '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        tablero: 'src/pages/tablero.html',
        capitan: 'src/pages/capitan.html',
        moderador: 'src/pages/moderador.html'
      }
    }
  },
  server: {
    port: 5173,
    host: true,
    hmr: {
      host: 'localhost'
    }
  },
  plugins: [htmlMiddleware(), copyHtmlsToRoot()]
})