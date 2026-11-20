import { defineConfig } from 'vite'

export default defineConfig({
  base: '/JeopardyEvento/',
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
    open: '/tablero'
  }
})