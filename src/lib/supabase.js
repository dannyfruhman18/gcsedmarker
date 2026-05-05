import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  SUPABASE_ANON_KEY,
  SUPABASE_BASE_URL,
  SUPABASE_CONFIG_ERROR,
} from './constants'

export function safeParseJson(text) {
  if (!text) return null

  try {
    return JSON.parse(text)
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
  if (SUPABASE_CONFIG_ERROR) {
    throw new Error(SUPABASE_CONFIG_ERROR)
  }

  const response = await fetch(`${SUPABASE_BASE_URL}${path}`, {
    ...options,
    signal: signal ?? options.signal,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const text = await response.text()
  const data = safeParseJson(text)

  if (!response.ok) {
    const message =
      typeof data === 'string'
        ? data
        : data?.message || data?.error_description || data?.hint || response.statusText

    throw new Error(`${message} (${response.status})`)
  }

  return data
}
