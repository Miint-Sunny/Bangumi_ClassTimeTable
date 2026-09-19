import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// base './' 让构建产物可以部署在任意路径(GitHub Pages 子路径或本地 file://)
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // 开发期把 /api/timeline 转到 bgm p1、/api/bgm/* 转到 api.bgm.tv(生产由 worker/worker.js 的同源代理承担)
  server: {
    proxy: {
      '/api/bgm': {
        target: 'https://api.bgm.tv',
        changeOrigin: true,
        headers: { 'User-Agent': 'Miint-Sunny/Bangumi_ClassTimeTable (dev)' },
        rewrite: (p: string) => p.replace(/^\/api\/bgm/, ''),
        configure: (proxy) => {
          // 去掉浏览器带上的 Origin(bgm 对跨站 Origin 会 502),并给回包打上代理标记供前端识别
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
          proxy.on('proxyRes', (proxyRes) => {
            proxyRes.headers['x-bgm-proxy'] = '1'
          })
        },
      },
      '/api/timeline': {
        target: 'https://next.bgm.tv',
        changeOrigin: true,
        headers: { 'User-Agent': 'Miint-Sunny/Bangumi_ClassTimeTable (dev)' },
        rewrite: (p: string) => {
          const u = new URL(p, 'http://x')
          const user = u.searchParams.get('user') ?? ''
          u.searchParams.delete('user')
          return `/p1/users/${user}/timeline${u.search}`
        },
      },
    },
  },
})
