import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  SUPABASE_CONFIG_ERROR,
} from './constants'

function getSupabaseRequestConfigError() {
  if (SUPABASE_CONFIG_ERROR) {
    return SUPABASE_CONFIG_ERROR
  }

  if (!SUPABASE_BASE_URL) {
    return 'Supabase configuration is incomplete: VITE_SUPABASE_URL is missing.'
  }

  try {
    const parsedUrl = new URL(SUPABASE_BASE_URL)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return `Supabase URL must use http or https: "${SUPABASE_BASE_URL}".`
    }
  } catch {
    return `Supabase URL is invalid: "${SUPABASE_BASE_URL}". Set VITE_SUPABASE_URL to a full https://project URL.`
  }

  if (!SUPABASE_ANON_KEY) {
    return 'Supabase configuration is incomplete: VITE_SUPABASE_ANON_KEY is missing.'
  }

  return null
}

function normaliseRequestPath(path) {
  const value = String(path ?? '').trim()
  if (!value) return '/'
  return value.startsWith('/') ? value : `/${value}`
}

function shouldSerializeAsJson(body) {
  if (body === null || typeof body !== 'object') {
    return false
  }

  return !(
    (typeof Blob !== 'undefined' && body instanceof Blob) ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
  )
}

export function safeParseJson(text) {
  if (!text) return null

  const normalizedText = String(text).trim()
  if (!normalizedText) return null

  try {
    return JSON.parse(normalizedText)
  } catch {
    return text
  }
}

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function maskEmail(email) {
  const value = String(email ?? '').trim()
  if (!value) return ''

  const atIndex = value.indexOf('@')
  const hasDomain = atIndex !== -1
  const localPart = hasDomain ? value.slice(0, atIndex) : value
  const domain = hasDomain ? value.slice(atIndex + 1) : ''

  if (!localPart) {
    return hasDomain ? `***@${domain || '***'}` : '***'
  }

  const visibleLocal =
    localPart.length <= 2 ? localPart.slice(0, 1) : `${localPart[0]}***${localPart[localPart.length - 1]}`

  return hasDomain ? `${visibleLocal}@${domain || '***'}` : visibleLocal
}

export function isActiveSubscriptionRow(row) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(row?.status || '').trim().toLowerCase())
}

export function subscriptionHasActiveAccess(rows, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !Array.isArray(rows)) return false

  return rows.some((row) => normalizeEmail(row?.email) === normalizedEmail && isActiveSubscriptionRow(row))
}

export function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

export async function supabaseRequest(path, options = {}, signal) {
  const configError = getSupabaseRequestConfigError()
  if (configError) {
    throw new Error(configError)
  }

  const requestPath = normaliseRequestPath(path)
  const requestUrl = `${SUPABASE_BASE_URL.replace(/\/+$/, '')}${requestPath}`
  const hasBody = options.body !== undefined && options.body !== null
  const headers = new Headers(options.headers ?? {})
  headers.set('apikey', SUPABASE_ANON_KEY)
  headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`)

  const fetchOptions = {
    ...options,
    signal: signal ?? options.signal,
    headers,
  }

  if (hasBody) {
    const shouldSerialize = shouldSerializeAsJson(options.body)

    if (!headers.get('content-type') && shouldSerialize) {
      headers.set('Content-Type', 'application/json')
    }

    if (shouldSerialize) {
      try {
        fetchOptions.body = JSON.stringify(options.body)
      } catch (stringifyError) {
        throw new Error(
          `Supabase request to ${requestPath} could not serialize the request body as JSON: ${stringifyError?.message || String(stringifyError)}`,
        )
      }
    } else {
      fetchOptions.body = options.body
    }
  }

  let response
  try {
    response = await fetch(requestUrl, fetchOptions)
  } catch (error) {
    throw new Error(
      `Supabase request to ${requestPath} failed before a response was received: ${error?.message || String(error)}`,
    )
  }

  const text = await response.text()
  const data = safeParseJson(text)

  if (!response.ok) {
    const responseDetail =
      typeof data === 'string'
        ? data.trim() || response.statusText
        : data?.message || data?.error_description || data?.hint || response.statusText || 'Unknown Supabase error'

    throw new Error(
      `Supabase request to ${requestPath} failed (${response.status} ${response.statusText}): ${responseDetail}`,
    )
  }

  return data
}
