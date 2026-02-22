import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  server: {
    // En desarrollo local, Vite redirige /api → backend en :3001.
    // En producción (build estático), VITE_API_URL apunta al backend de Railway.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },

  // Si desplegás el frontend en una sub-ruta de GitHub Pages (ej. /studio-full),
  // descomentá y ajustá la línea de abajo:
  // base: '/studio-full/',
})
