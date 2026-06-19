import { describe, it, expect, vi, afterEach } from 'vitest'
import { transcribeAudio } from './voiceClient'

describe('transcribeAudio', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the trimmed transcript on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ text: '  hello world  ' }), { status: 200 })))
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
    expect(await transcribeAudio(blob)).toBe('hello world')
  })

  it('throws on a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'no_key' }), { status: 503 })))
    const blob = new Blob([new Uint8Array([1])], { type: 'audio/webm' })
    await expect(transcribeAudio(blob)).rejects.toThrow()
  })
})
