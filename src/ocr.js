const OCR_API_URL = 'https://api.ocr.space/parse/image'
const OCR_API_KEY = 'helloworld'

export async function performOcr(file) {
  const form = new FormData()
  form.append('apikey', OCR_API_KEY)
  form.append('language', 'eng')
  form.append('isOverlayRequired', 'false')
  form.append('scale', 'true')
  form.append('OCREngine', '2')
  form.append('file', file, file.name)

  const response = await fetch(OCR_API_URL, {
    method: 'POST',
    body: form,
  })

  const raw = await response.text()
  let payload = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = payload?.ErrorMessage?.[0] || payload?.Message || raw || response.statusText
    throw new Error(message)
  }

  const parsedText = payload?.ParsedResults?.map((result) => result.ParsedText || '').join('\n').trim() || ''
  return {
    text: parsedText,
    raw: payload,
  }
}
