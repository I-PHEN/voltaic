export interface TranscribeConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface TranscribeResult {
  status: number
  body: { text: string } | { error: string }
}

// Pick a file extension Groq/Whisper accepts based on the recorded mime type.
function extensionFor(contentType: string): string {
  if (contentType.includes('ogg')) return 'ogg'
  if (contentType.includes('wav')) return 'wav'
  if (contentType.includes('mp4') || contentType.includes('m4a')) return 'm4a'
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3'
  return 'webm'
}

export async function handleTranscribeRequest(
  audio: Uint8Array,
  contentType: string,
  config: TranscribeConfig,
): Promise<TranscribeResult> {
  if (!config.apiKey) return { status: 503, body: { error: 'no_key' } }
  if (!audio || audio.length === 0) return { status: 400, body: { error: 'no_audio' } }

  const mime = contentType || 'audio/webm'
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mime }), `audio.${extensionFor(mime)}`)
  form.append('model', config.model)
  form.append('response_format', 'json')

  try {
    const res = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    })
    if (!res.ok) return { status: 502, body: { error: `provider ${res.status}` } }
    const data = (await res.json()) as { text?: string }
    return { status: 200, body: { text: data.text ?? '' } }
  } catch (e) {
    return { status: 502, body: { error: String(e) } }
  }
}
