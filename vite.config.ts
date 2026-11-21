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

export default defineConfig({
  base: isProd ? '/JeopardyEvento/' : '/',
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
  plugins: [htmlMiddleware()]
})