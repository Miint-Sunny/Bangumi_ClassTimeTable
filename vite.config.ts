import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' 让构建产物可以部署在任意路径(GitHub Pages 子路径或本地 file://)
export default defineConfig({
  plugins: [react()],
  base: './',
})
