export const APP_NAME = 'GCSEmarker'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_BASE_URL = SUPABASE_URL ? SUPABASE_URL.replace(/\/+$/, '') : ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? ''

export const SUPABASE_CONFIG_ERROR =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Supabase is not configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load and save data.'
    : null

export const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'paid',
  'past_due',
  'pending_payment',
])
export const MAX_VISIBLE_HISTORY_ROWS = 5

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
}

export const boardOptions = ['AQA', 'Edexcel', 'OCR']

export const modeOptions = [
  { id: 'essay', label: 'Essay marking' },
  { id: 'maths_science', label: 'Maths / science marking' },
]

export const subscriptionPlans = [
  { id: 'starter', label: 'Starter', price: '£4.99 / month', access: 'Basic marking + saves' },
  { id: 'top-band', label: 'Top Band', price: '£9.99 / month', access: 'Top Band mode + deeper AO feedback' },
  { id: 'school', label: 'School', price: 'Custom', access: 'Multi-seat access + shared reporting' },
]
