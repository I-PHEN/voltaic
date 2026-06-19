import { describe, it, expect, vi, afterEach } from 'vitest'
import { handleTranscribeRequest } from './transcribeHandler'

const config = { apiKey: 'k', baseUrl: 'https://x/v1', model: 'whisper-large-v3-turbo' }
const audio = new Uint8Array([1, 2, 3, 4])

describe('handleTranscribeRequest', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns 503 when no api key is configured', async () => {
    const res = await handleTranscribeRequest(audio, 'audio/webm', { ...config, apiKey: '' })
    expect(res.status).toBe(503)
  })

  it('returns 400 when the audio is empty', async () => {
    const res = await handleTranscribeRequest(new Uint8Array([]), 'audio/webm', config)
    expect(res.status).toBe(400)
  })

  it('returns the transcribed text on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ text: 'measure SNR at 900 megahertz' }), { status: 200 })),
    )
    const res = await handleTranscribeRequest(audio, 'audio/webm', config)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ text: 'measure SNR at 900 megahertz' })
  })

  it('returns 502 when the provider errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const res = await handleTranscribeRequest(audio, 'audio/webm', config)
    expect(res.status).toBe(502)
  })
})
