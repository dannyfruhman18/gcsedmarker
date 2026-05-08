export const APP_NAME = 'GCSEmarker'

const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawSupabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()
const rawStripePaymentLink = String(import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? '').trim()

function getSupabaseUrlValidationError(value) {
  const trimmedValue = String(value ?? '').trim()
  if (!trimmedValue) {
    return null
  }

  try {
    const parsedUrl = new URL(trimmedValue)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return `Supabase URL must use http or https: "${trimmedValue}".`
    }
    if (!parsedUrl.hostname) {
      return `Supabase URL is invalid: "${trimmedValue}". Set VITE_SUPABASE_URL to a full http(s) project URL.`
    }
    return null
  } catch {
    return `Supabase URL is invalid: "${trimmedValue}". Set VITE_SUPABASE_URL to a full http(s) project URL.`
  }
}

export const SUPABASE_URL = rawSupabaseUrl
export const SUPABASE_BASE_URL = SUPABASE_URL ? SUPABASE_URL.replace(/\/+$/, '') : ''
export const SUPABASE_ANON_KEY = rawSupabaseAnonKey
export const STRIPE_PAYMENT_LINK = rawStripePaymentLink

const supabaseUrlValidationError = getSupabaseUrlValidationError(SUPABASE_URL)

export const SUPABASE_CONFIG_ERROR =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment, then restart the app to enable loading and saving data.'
    : supabaseUrlValidationError
      ? supabaseUrlValidationError
      : null

export const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'pending_payment',
])
export const MAX_VISIBLE_HISTORY_ROWS = 5
export const MAX_VISIBLE_SUBSCRIPTION_ROWS = 10

export const BOARD_LINKS = {
  AQA: {
    label: 'AQA past papers and mark schemes',
    href: 'https://www.aqa.org.uk/find-past-papers-and-mark-schemes',
  },
  Edexcel: {
    label: 'Pearson Edexcel past papers and mark schemes',
    href: 'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html',
  },
  OCR: {
    label: 'OCR past paper finder',
    href: 'https://www.ocr.org.uk/qualifications/past-paper-finder/',
  },
  WJEC: {
    label: 'WJEC past papers and mark schemes',
    href: 'https://www.wjec.co.uk/home/past-papers/',
  },
  CCEA: {
    label: 'CCEA past papers and mark schemes',
    href: 'https://ccea.org.uk/learning-resources/exams-assessments/past-papers-and-mark-schemes',
  },
}

export const boardOptions = ['AQA', 'Edexcel', 'OCR', 'WJEC', 'CCEA']

export const modeOptions = [
  { id: 'essay', label: 'Essay marking' },
  { id: 'maths_science', label: 'Maths / science marking' },
]

export const subscriptionPlans = [
  { id: 'starter', label: 'Starter', price: '£4.99 / month', access: 'Basic marking + saves' },
  { id: 'top-band', label: 'Top Band', price: '£9.99 / month', access: 'Top Band mode + deeper AO feedback' },
  { id: 'school', label: 'School', price: 'Custom', access: 'Multi-seat access + shared reporting' },
]