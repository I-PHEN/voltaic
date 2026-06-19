import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePlanRequest } from './server/planHandler'

function planApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'voltaic-plan-api',
    configureServer(server) {
      server.middlewares.use('/api/plan', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          try {
            const { intent } = JSON.parse(raw || '{}') as { intent?: string }
            const result = await handlePlanRequest(intent ?? '', {
              apiKey: env.GROQ_API_KEY || '',
              baseUrl: env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
              model: env.LLM_MODEL || 'openai/gpt-oss-120b',
            })
            res.statusCode = result.status
            res.end(JSON.stringify(result.body))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'bad_request' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), planApiPlugin(env)] }
})
