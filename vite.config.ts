import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'worldbook-api',
      configureServer(server) {
        const dataDir = resolve(__dirname, 'data')
        // GET: 读取世界书文件 → fetch('/data/worldbooks/xxx.json')
        server.middlewares.use('/data', (req, res, next) => {
          if (req.method !== 'GET' && req.method !== 'HEAD') return next()
          const url = new URL(req.url || '', 'http://localhost')
          const filePath = resolve(dataDir, url.pathname.replace(/^\/data\//, ''))
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile() && !filePath.includes('..')) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(fs.readFileSync(filePath, 'utf-8'))
            return
          }
          next()
        })
        // PUT: 保存世界书 JSON 到本地文件
        server.middlewares.use('/api/worldbooks', (req, res, next) => {
          if (req.method !== 'PUT' && req.method !== 'POST') return next()
          const id = (req.url || '').replace(/^\//, '').replace(/\.json$/, '')
          if (!id || id.includes('..')) return next()
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const filePath = resolve(dataDir, `${id}.json`)
              // 只允许覆盖已存在的内置文件
              if (!fs.existsSync(filePath)) {
                res.statusCode = 404
                res.end(JSON.stringify({ error: 'not found' }))
                return
              }
              fs.writeFileSync(filePath, body, 'utf-8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        })
        // PUT: 保存项目默认 Agent 配置 (允许创建新文件)
        server.middlewares.use('/api/defaults', (req, res, next) => {
          if (req.method !== 'PUT' && req.method !== 'POST') return next()
          const url = new URL(req.url || '', 'http://localhost')
          const fileName = url.pathname.replace(/^\/api\/defaults\//, '').replace(/\.json$/, '')
          if (!fileName || fileName.includes('..')) return next()
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => {
            try {
              const defaultsDir = resolve(dataDir, 'defaults')
              if (!fs.existsSync(defaultsDir)) fs.mkdirSync(defaultsDir, { recursive: true })
              const filePath = resolve(defaultsDir, `${fileName}.json`)
              fs.writeFileSync(filePath, body, 'utf-8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e: any) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: e.message }))
            }
          })
        })
      },
    },
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@engine': resolve(__dirname, 'src/sillytavern'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 5173,
    open: true,
    watch: {
      ignored: ['**/data/worldbooks/**', '**/data/defaults/**'],  // API 写入文件，不需触发热更新
    },
  },
  build: {
    outDir: 'dist-ui',
    sourcemap: true,
  },
})
