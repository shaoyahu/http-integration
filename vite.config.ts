import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // 允许局域网访问
    port: 62345,
    proxy: {
      '/api': {
        target: 'http://localhost:4573',
        changeOrigin: true,
      }
    }
  }
})