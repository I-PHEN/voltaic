import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePlanRequest } from './server/planHandler'
import { handleTranscribeRequest } from './server/transcribeHandler'

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
            const { intent, canvas, history } = JSON.parse(raw || '{}') as {
              intent?: string
              canvas?: {
                devices: { deviceId: string; properties: Record<string, unknown> }[]
                connections: { from: number; to: number }[]
              }
              history?: { role: 'user' | 'assistant'; text: string }[]
            }
            const result = await handlePlanRequest(
              intent ?? '',
              {
                apiKey: env.GROQ_API_KEY || '',
                baseUrl: env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
                model: env.LLM_MODEL || 'openai/gpt-oss-120b',
              },
              { canvas, history },
            )
            res.statusCode = result.status
            res.end(JSON.stringify(result.body))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'bad_request' }))
          }
        })
      })

      server.middlewares.use('/api/transcribe', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end()
          return
        }
        const chunks: Buffer[] = []
        req.on('data', (chunk) => chunks.push(chunk as Buffer))
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          try {
            const audio = new Uint8Array(Buffer.concat(chunks))
            const result = await handleTranscribeRequest(
              audio,
              (req.headers['content-type'] as string) || 'audio/webm',
              {
                apiKey: env.GROQ_API_KEY || '',
                baseUrl: env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
                model: env.LLM_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo',
              },
            )
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
