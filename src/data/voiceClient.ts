// Sends recorded audio to the /api/transcribe proxy (Groq Whisper) and returns
// the transcribed text. Throws on any non-200 response so the caller can fall back.
export async function transcribeAudio(blob: Blob): Promise<string> {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  })
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`)
  const data = (await res.json()) as { text?: string }
  return (data.text ?? '').trim()
}
