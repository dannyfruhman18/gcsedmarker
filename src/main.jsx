import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createWorker } from 'tesseract.js'
import './styles.css'

// Vercel environment variables required for production:
// - VITE_SUPABASE_URL
// - VITE_SUPABASE_ANON_KEY
// - VITE_STRIPE_PAYMENT_LINK (optional; enables the Stripe checkout flow)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? ''
const SUPABASE_CONFIG_ERROR =
  !SUPABASE_URL || !SUPABASE_ANON_KEY
    ? 'Supabase is not configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load and save data.'
    : null

const EMAIL_ADDRESS_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'paid', 'past_due'])

if (SUPABASE_CONFIG_ERROR) {
  console.error(
    'GCSEmarker configuration error: missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY. Supabase requests will fail until these environment variables are provided.',
  )
}

const BOARD_LINKS = {
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

const boardOptions = ['AQA', 'Edexcel', 'OCR']
const modeOptions = [
  { id: 'essay', label: 'Essay marking' },
  { id: 'maths_science', label: 'Maths / science marking' },
]

const subscriptionPlans = [
  { id: 'starter', label: 'Starter', price: '£4.99 / month', access: 'Basic marking + saves' },
  { id: 'top-band', label: 'Top Band', price: '£9.99 / month', access: 'Top Band mode + deeper AO feedback' },
  { id: 'school', label: 'School', price: 'Custom', access: 'Multi-seat access + shared reporting' },
]

function safeParseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function maskEmail(email) {
  const value = String(email ?? '').trim()
  if (!value) return ''

  const atIndex = value.indexOf('@')
  const hasDomain = atIndex !== -1
  const localPart = hasDomain ? value.slice(0, atIndex) : value
  const domain = hasDomain ? value.slice(atIndex + 1) : ''

  if (!localPart) {
    return hasDomain ? `***@${domain || '***'}` : '***'
  }

  const visibleLocal = localPart.length <= 2 ? localPart.slice(0, 1) : `${localPart[0]}***${localPart[localPart.length - 1]}`
  return hasDomain ? `${visibleLocal}@${domain || '***'}` : visibleLocal
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

function isActiveSubscriptionRow(row) {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(String(row?.status || '').trim().toLowerCase())
}

function subscriptionHasActiveAccess(rows, email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !Array.isArray(rows)) return false

  return rows.some((row) => normalizeEmail(row?.email) === normalizedEmail && isActiveSubscriptionRow(row))
}

function formatDateTime(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}

async function supabaseRequest(path, options = {}, signal) {
  if (SUPABASE_CONFIG_ERROR) {
    throw new Error(SUPABASE_CONFIG_ERROR)
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
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

function scoreEssay(answer, topBand) {
  if (typeof answer !== 'string') {
    return {
      maxMarks: topBand ? 4 : 3,
      score: 0,
      ao1: ['No valid essay answer was provided. Please enter text to receive feedback.'],
      ao2: ['Essay feedback only works with text input.'],
      ao3: ['Paste or type a student response so the marker can analyse it.'],
      summary: topBand
        ? 'Top Band mode needs a valid essay response to analyse.'
        : 'Enter a text answer to receive essay feedback.',
    }
  }

  const text = answer.trim()
  const length = text.split(/\s+/).filter(Boolean).length
  const ao1 = []
  const ao2 = []
  const ao3 = []
  let score = 0

  if (length >= 80) {
    ao1.push('Clear subject knowledge shown with enough developed detail to reward.')
    score += 1
  } else if (length > 0) {
    ao1.push('Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  } else {
    ao1.push('No answer entered yet — add factual detail and examples.')
  }

  if (/\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)) {
    ao2.push('You are explaining ideas and linking evidence to your point, which supports AO2.')
    score += 1
  } else {
    ao2.push('Develop analysis by explaining how and why the evidence matters.')
  }

  if (/\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)) {
    ao3.push('There is some evaluation or judgement, which helps the top bands.')
    score += 1
  } else {
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
  }

  if (topBand) {
    ao3.push('Top Band mode: add a sharp final judgement, embed precise terminology, and make every paragraph move the argument forward.')
    ao2.push('Top Band mode: use linked chains of reasoning and compare alternatives instead of listing points.')
    if (length >= 140) score += 1
  }

  return {
    maxMarks: topBand ? 4 : 3,
    score: Math.min(score, topBand ? 4 : 3),
    ao1,
    ao2,
    ao3,
    summary: topBand
      ? 'Grade 9 / Top Band focus: make every paragraph precise, conceptual, and evaluative.'
      : 'Focus on specific knowledge, explanation, and a clear conclusion.',
  }
}

function scoreMathsScience(answer, topBand) {
  if (typeof answer !== 'string') {
    return {
      maxMarks: topBand ? 5 : 4,
      score: 0,
      ao1: ['No valid answer was provided. Please enter text to receive method-mark feedback.'],
      ao2: ['Maths/science feedback only works with text input.'],
      ao3: ['Paste or type the working, calculation steps, or final answer.'],
      summary: topBand
        ? 'Top Band mode needs a valid maths/science response to analyse.'
        : 'Enter working or an answer to receive method-mark feedback.',
      extra: [],
    }
  }

  const text = answer.trim()
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const methodMarks = []
  const marks = new Set()

  if (lines.length >= 2) {
    marks.add('working')
    methodMarks.push('You show more than one line of working, which is good evidence for method marks.')
  } else if (text) {
    methodMarks.push('Show the steps you used, not just the final answer.')
  } else {
    methodMarks.push('Enter your working or answer to get method-mark feedback.')
  }

  if (/=|→|=>|\bsubstitut(e|ion)\b|\bcalculate\b|\bshow\b/i.test(text)) {
    marks.add('process')
    methodMarks.push('Your response includes process language or a clear calculation trail.')
  } else {
    methodMarks.push('Use equations, substitutions, or calculation steps to earn method marks.')
  }

  if (/\b(cm|mm|kg|g|mol|dm\^?3|°c)\b|(\d+\s*(m|s|n|j|w)\b)/i.test(text)) {
    marks.add('units')
    methodMarks.push('You have included units or scientific measurement language.')
  } else {
    methodMarks.push('Include units where needed and keep the final answer contextualised.')
  }

  if (/\b(therefore|because|so|hence|which means|final answer)\b/i.test(text)) {
    marks.add('conclusion')
    methodMarks.push('You are moving from working to a conclusion, which helps the final-mark award.')
  }

  if (topBand && text.length >= 100) {
    marks.add('topband')
    methodMarks.push('Top Band mode: show a full chain of reasoning, label substitutions, and check the answer against sensible values.')
  }

  const score = Math.min(marks.size, topBand ? 5 : 4)

  return {
    maxMarks: topBand ? 5 : 4,
    score,
    ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
    ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
    ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : 'Method marks focus on visible working and correct process.',
    extra: methodMarks,
  }
}

async function extractQuestionTextFromImage(file, onProgress) {
  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message?.status) onProgress?.(`OCR: ${message.status}`)
    },
  })

  try {
    const result = await worker.recognize(file)
    return result?.data?.text?.trim() ?? ''
  } finally {
    await worker.terminate()
  }
}

function App() {
  const [board, setBoard] = useState('AQA')
  const [mode, setMode] = useState('essay')
  const [topBand, setTopBand] = useState(true)
  const [questionText, setQuestionText] = useState('')
  const [answerText, setAnswerText] = useState('')
  const [uploadName, setUploadName] = useState('')
  const [uploadPreview, setUploadPreview] = useState('')
  const [ocrStatus, setOcrStatus] = useState('Upload an image and OCR will fill the question box.')
  const [ocrLoading, setOcrLoading] = useState(false)
  const [markResult, setMarkResult] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [recentSubscriptions, setRecentSubscriptions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subscriptionEmail, setSubscriptionEmail] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('top-band')
  const [subscriptionResult, setSubscriptionResult] = useState('')
  const [submittingSubscription, setSubmittingSubscription] = useState(false)
  const [error, setError] = useState(SUPABASE_CONFIG_ERROR)
  const [sessionsError, setSessionsError] = useState(null)
  const [subscriptionsError, setSubscriptionsError] = useState(null)

  const uploadRequestIdRef = useRef(0)
  const mountedRef = useRef(true)
  const requestControllersRef = useRef(new Set())

  const boardLink = useMemo(() => BOARD_LINKS[board] ?? BOARD_LINKS.AQA, [board])
  const normalizedSubscriptionEmail = useMemo(
    () => normalizeEmail(subscriptionEmail),
    [subscriptionEmail],
  )
  const activeSubscription = useMemo(() => {
    return subscriptionHasActiveAccess(recentSubscriptions, normalizedSubscriptionEmail)
  }, [recentSubscriptions, normalizedSubscriptionEmail])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      requestControllersRef.current.forEach((controller) => controller.abort())
      requestControllersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (uploadPreview) {
        URL.revokeObjectURL(uploadPreview)
      }
    }
  }, [uploadPreview])

  useEffect(() => {
    void loadSessions()
    void loadSubscriptions()
  }, [])

  async function loadSessions() {
    const controller = new AbortController()
    requestControllersRef.current.add(controller)

    setSessionsError(null)
    try {
      if (!mountedRef.current) {
        controller.abort()
        return []
      }

      setLoadingSessions(true)
      const rows = await supabaseRequest(
        '/rest/v1/marking_sessions?select=*&order=created_at.desc&limit=5',
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
        controller.signal,
      )
      const nextRows = Array.isArray(rows) ? rows : []
      if (!mountedRef.current || controller.signal.aborted) return nextRows

      setRecentSessions(nextRows)
      setSessionsError(null)
      return nextRows
    } catch (err) {
      if (controller.signal.aborted) return []

      console.error(err)
      if (mountedRef.current) {
        setSessionsError(`Could not load recent marking sessions: ${err?.message || String(err)}`)
      }
      return []
    } finally {
      requestControllersRef.current.delete(controller)
      if (mountedRef.current && !controller.signal.aborted) {
        setLoadingSessions(false)
      }
    }
  }

  async function loadSubscriptions(email = '') {
    const controller = new AbortController()
    requestControllersRef.current.add(controller)

    setSubscriptionsError(null)
    try {
      if (!mountedRef.current) {
        controller.abort()
        return null
      }

      setLoadingSubscriptions(true)
      const normalizedEmail = normalizeEmail(email)
      const subscriptionsPath = normalizedEmail
        ? `/rest/v1/subscriptions?select=*&order=created_at.desc&limit=200&email=eq.${encodeURIComponent(normalizedEmail)}`
        : '/rest/v1/subscriptions?select=*&order=created_at.desc&limit=200'
      // TODO: Query subscriptions by email/status on the server instead of loading a broad recent history for better scale.
      const rows = await supabaseRequest(subscriptionsPath, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      }, controller.signal)
      const nextRows = Array.isArray(rows) ? rows : []
      if (!mountedRef.current || controller.signal.aborted) return nextRows

      setRecentSubscriptions(nextRows)
      setSubscriptionsError(null)
      return nextRows
    } catch (err) {
      if (controller.signal.aborted) return null

      console.error(err)
      if (mountedRef.current) {
        setSubscriptionsError(`Could not load recent subscriptions: ${err?.message || String(err)}`)
      }
      return null
    } finally {
      requestControllersRef.current.delete(controller)
      if (mountedRef.current && !controller.signal.aborted) {
        setLoadingSubscriptions(false)
      }
    }
  }

  async function handleFileChange(file) {
    if (!file) return

    const isImageType = Boolean(
      (file.type && file.type.startsWith('image/')) ||
      /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name || ''),
    )

    if (!isImageType) {
      setOcrStatus('Unsupported file type. Please upload an image file (JPG, PNG, WebP, GIF, BMP, HEIC, or AVIF).')
      return
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      setOcrStatus('File is too large. Please upload an image smaller than 5MB.')
      return
    }

    const uploadRequestId = ++uploadRequestIdRef.current
    const isLatestUpload = () => uploadRequestIdRef.current === uploadRequestId

    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview)
    }

    const nextPreview = URL.createObjectURL(file)
    setQuestionText('')
    setOcrLoading(true)
    setUploadName(file.name)
    setUploadPreview(nextPreview)
    setOcrStatus('Reading text from the image...')

    try {
      const extracted = await extractQuestionTextFromImage(file, setOcrStatus)
      if (!mountedRef.current || !isLatestUpload()) return

      if (extracted) {
        setQuestionText(extracted)
        setOcrStatus(`Text read from image (${extracted.split(/\s+/).filter(Boolean).length} words).`)
      } else {
        setOcrStatus('No clear text found. You can type or paste the question manually.')
      }
    } catch (err) {
      if (!mountedRef.current || !isLatestUpload()) return

      console.error(err)
      setOcrStatus('OCR failed — please type the question manually. Try a clearer image or a smaller file under 5MB.')
    } finally {
      if (isLatestUpload() && mountedRef.current) {
        setOcrLoading(false)
      }
    }
  }

  async function handleMark() {
    setError(null)
    setSubscriptionsError(null)

    const trimmedQuestion = questionText.trim()
    const trimmedAnswer = answerText.trim()
    const normalizedMarkEmail = normalizeEmail(subscriptionEmail)
    const hasSubscriptionEmail = Boolean(normalizedMarkEmail)

    if (hasSubscriptionEmail && !EMAIL_ADDRESS_REGEX.test(normalizedMarkEmail)) {
      setError('Add a valid email address before marking, or leave it blank for demo mode.')
      return
    }

    if (!trimmedQuestion && !trimmedAnswer) {
      setMarkResult({
        score: 0,
        maxMarks: topBand ? 5 : 4,
        summary: 'Add a question or an answer before marking.',
        ao1: ['Upload a question, paste the prompt, or enter a student answer so the app has something to mark.'],
        ao2: [],
        ao3: [],
      })
      return
    }

    setSaving(true)
    try {
      const refreshedSubscriptions = hasSubscriptionEmail
        ? await loadSubscriptions(normalizedMarkEmail)
        : []
      if (!mountedRef.current) return

      const subscriptionLoadFailed = hasSubscriptionEmail && refreshedSubscriptions === null
      const hasActiveSubscription = !hasSubscriptionEmail
        ? true
        : subscriptionLoadFailed
          ? activeSubscription
          : subscriptionHasActiveAccess(refreshedSubscriptions, normalizedMarkEmail)

      if (STRIPE_PAYMENT_LINK && hasSubscriptionEmail && subscriptionLoadFailed) {
        const message = 'Subscription validation failed. Please try again before marking.'
        if (mountedRef.current) {
          setError(message)
          setMarkResult({
            score: 0,
            maxMarks: topBand ? 5 : 4,
            summary: message,
            ao1: ['Unable to verify subscription status right now. Please retry or refresh status.'],
            ao2: [],
            ao3: [],
          })
        }
        return
      }

      if (STRIPE_PAYMENT_LINK && hasSubscriptionEmail && !subscriptionLoadFailed && !hasActiveSubscription) {
        if (mountedRef.current) {
          setMarkResult({
            score: 0,
            maxMarks: topBand ? 5 : 4,
            summary: 'Subscription required. Enter the subscriber email, complete checkout, and wait for an active record before marking.',
            ao1: ['This workspace is currently configured to require an active subscription before marking.'],
            ao2: [],
            ao3: [],
          })
        }
        return
      }

      const analyzer = mode === 'essay' ? scoreEssay : scoreMathsScience
      const result = analyzer(answerText, topBand)
      if (!mountedRef.current) return
      setMarkResult(result)

      await supabaseRequest('/rest/v1/marking_sessions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([
          {
            exam_board: board,
            mode,
            question_text: questionText,
            answer_text: answerText,
            upload_name: uploadName,
            score: result.score,
            feedback: result,
          },
        ]),
      })
      if (!mountedRef.current) return

      setError(null)
      await loadSessions()
    } catch (err) {
      if (!mountedRef.current) return

      const message = `Supabase save failed: ${err?.message || String(err)}`
      setError(message)
      setMarkResult((current) => ({
        ...(current || {}),
        storageError: message,
      }))
    } finally {
      if (mountedRef.current) {
        setSaving(false)
      }
    }
  }

  async function handleSubscription() {
    setError(null)
    setSubscriptionResult('')
    setSubscriptionsError(null)

    const email = normalizeEmail(subscriptionEmail)
    if (!email || !EMAIL_ADDRESS_REGEX.test(email)) {
      setSubscriptionResult('Add a valid email address.')
      return
    }

    setSubmittingSubscription(true)
    try {
      await supabaseRequest('/rest/v1/subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([
          {
            email,
            plan: subscriptionPlan,
            status: STRIPE_PAYMENT_LINK ? 'pending_payment' : 'active',
            provider: STRIPE_PAYMENT_LINK ? 'stripe_link' : 'supabase_demo',
            notes: STRIPE_PAYMENT_LINK ? 'User sent to Stripe checkout link.' : 'No Stripe link configured yet.',
          },
        ]),
      })

      if (!mountedRef.current) return

      let stripePopupBlocked = false
      if (STRIPE_PAYMENT_LINK) {
        const stripeWindow = window.open(STRIPE_PAYMENT_LINK, '_blank', 'noreferrer')
        stripePopupBlocked = !stripeWindow
      }

      await loadSubscriptions(normalizedSubscriptionEmail)
      if (!mountedRef.current) return

      setError(null)
      setSubscriptionResult(
        STRIPE_PAYMENT_LINK
          ? stripePopupBlocked
            ? 'Subscription record saved in Supabase, but the Stripe popup was blocked. Please allow popups or open the payment link manually.'
            : 'Subscription record saved in Supabase and Stripe checkout opened.'
          : 'Subscription record saved in Supabase. Add a Stripe payment link to turn this into live checkout.'
      )
    } catch (err) {
      if (!mountedRef.current) return

      const message = `Subscription save failed: ${err?.message || String(err)}`
      setError(message)
      setSubscriptionResult(message)
    } finally {
      if (mountedRef.current) {
        setSubmittingSubscription(false)
      }
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-card">
          <div className="brand-row">
            <img src="/logo.svg" alt="GCSEmarker logo" className="brand-logo" />
            <div>
              <p className="eyebrow">GCSEmarker</p>
              <h1>Upload a question, choose the board, and get mark-style feedback fast.</h1>
            </div>
          </div>
          <p className="lede">
            Built for essays, maths, and science. Includes OCR image reading, AO1 / AO2 / AO3 prompts, method marks,
            official mark-scheme links, a Top Band mode for grade 9 refinement, subscription-ready
            access, and a Capacitor-ready path for iOS packaging.
          </p>
          <div className="hero-actions">
            <a className="chip-link" href={boardLink.href} target="_blank" rel="noreferrer">
              {boardLink.label}
            </a>
            <a className="chip-link" href="https://capacitorjs.com/" target="_blank" rel="noreferrer">
              Capacitor wrapper ready
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="stat-row">
            <div className="stat"><span>Exam board</span><strong>{board}</strong></div>
            <div className="stat"><span>Mode</span><strong>{modeOptions.find((item) => item.id === mode)?.label}</strong></div>
            <div className="stat"><span>Top Band</span><strong>{topBand ? 'On' : 'Off'}</strong></div>
            <div className="stat"><span>Paywall</span><strong>{STRIPE_PAYMENT_LINK ? 'On' : 'Demo'}</strong></div>
          </div>
        </div>
      </header>

      {error || sessionsError || subscriptionsError ? (
        <section className="panel" role="alert" aria-live="assertive">
          <h2>Something went wrong</h2>
          {error ? <p className="error">{error}</p> : null}
          {sessionsError ? <p className="error">{sessionsError}</p> : null}
          {subscriptionsError ? <p className="error">{subscriptionsError}</p> : null}
        </section>
      ) : null}

      <main className="chat-layout">
        <section className="panel">
          <div className="panel-header">
            <h2>Mark a GCSE answer</h2>
            <div className="board-links">
              <a href={boardLink.href} target="_blank" rel="noreferrer">
                {boardLink.label}
              </a>
            </div>
          </div>

          <div className="control-row">
            <label>
              Exam board
              <select value={board} onChange={(e) => setBoard(e.target.value)}>
                {boardOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                {modeOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={topBand} onChange={(e) => setTopBand(e.target.checked)} />
              Top Band mode
            </label>
          </div>

          <div className="dropzone">
            <input id="upload" type="file" accept="image/*" onChange={(e) => void handleFileChange(e.target.files?.[0])} />
            <label htmlFor="upload" className="upload-button">
              <strong>Upload a scan or photo of the question</strong>
              <span>JPG, PNG, or camera image</span>
            </label>
            {uploadName ? <p className="file-name">Selected: {uploadName}</p> : <p className="file-name">No file selected yet.</p>}
            <p className="muted">{ocrStatus}</p>
            {uploadPreview ? <img className="preview" src={uploadPreview} alt="Uploaded question preview" /> : null}
          </div>

          <div className="textareas">
            <label>
              Question or prompt
              <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Paste the question text here." rows={7} />
            </label>
            <label>
              Student answer / essay / working
              <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Paste the answer, essay, or working here." rows={10} />
            </label>
          </div>

          <button className="primary" onClick={handleMark} disabled={saving || ocrLoading}>
            {saving ? 'Saving...' : 'Mark answer'}
          </button>
        </section>

        <section className="panel results-panel">
          <h2>Feedback</h2>
          {markResult ? (
            <div className="result-card">
              <div className="result-score">
                <strong>{markResult.score}</strong>
                <span> / {markResult.maxMarks} marks</span>
              </div>
              <p>{markResult.summary}</p>
              {markResult.ao1?.length ? (
                <div>
                  <h3>AO1</h3>
                  <ul>{markResult.ao1.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao2?.length ? (
                <div>
                  <h3>AO2</h3>
                  <ul>{markResult.ao2.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao3?.length ? (
                <div>
                  <h3>AO3</h3>
                  <ul>{markResult.ao3.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.extra?.length ? (
                <div>
                  <h3>Method marks</h3>
                  <ul>{markResult.extra.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.storageError ? <p className="error">{markResult.storageError}</p> : null}
            </div>
          ) : (
            <p className="muted">Run a mark to see AO feedback, method-mark comments, and Top Band advice.</p>
          )}

          <div className="resource-box">
            <h3>Official mark-scheme links</h3>
            <a href="https://www.aqa.org.uk/find-past-papers-and-mark-schemes" target="_blank" rel="noreferrer">AQA</a>
            <a href="https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html" target="_blank" rel="noreferrer">Pearson Edexcel</a>
            <a href="https://www.ocr.org.uk/qualifications/past-paper-finder/" target="_blank" rel="noreferrer">OCR</a>
          </div>
        </section>
      </main>

      <section className="panel subscription-panel">
        <div className="panel-header">
          <h2>Subscription service</h2>
          <span className="muted">Stripe-ready, with Supabase storage</span>
        </div>
        <div className="subscription-grid">
          <div className="subscription-form">
            <label>
              Subscriber email
              <input type="email" value={subscriptionEmail} onChange={(e) => setSubscriptionEmail(e.target.value)} placeholder="parent@example.com" />
            </label>
            <label>
              Plan
              <select value={subscriptionPlan} onChange={(e) => setSubscriptionPlan(e.target.value)}>
                {subscriptionPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>{plan.label} — {plan.price}</option>
                ))}
              </select>
            </label>
            <p className="muted">{subscriptionPlans.find((plan) => plan.id === subscriptionPlan)?.access}</p>
            <button className="primary" onClick={handleSubscription} disabled={submittingSubscription}>
              {submittingSubscription ? 'Processing...' : STRIPE_PAYMENT_LINK ? 'Open Stripe checkout' : 'Create subscription record'}
            </button>
            <button className="secondary" onClick={() => void loadSubscriptions(normalizedSubscriptionEmail)}>
              Refresh Status
            </button>
            {subscriptionResult ? <p className="result-note">{subscriptionResult}</p> : null}
          </div>
          <div className="subscription-cards">
            {subscriptionPlans.map((plan) => (
              <article key={plan.id} className="tier-card">
                <strong>{plan.label}</strong>
                <span>{plan.price}</span>
                <p>{plan.access}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel history-panel">
        <div className="panel-header">
          <h2>Recent Supabase saves</h2>
          <button className="secondary" onClick={loadSessions} disabled={loadingSessions}>
            {loadingSessions ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="history-list">
          {recentSessions.length ? (
            recentSessions.map((session, index) => (
              <article key={session?.id ?? `session-${index}`} className="history-item">
                <div>
                  <strong>{session?.exam_board ?? 'Unknown board'}</strong>
                  <span>{session?.mode ?? 'Unknown mode'}</span>
                </div>
                <div>
                  <strong>{session?.score ?? 0}</strong>
                  <span>{formatDateTime(session?.created_at)}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No saved sessions yet. Mark something and it will appear here.</p>
          )}
        </div>
      </section>

      <section className="panel history-panel">
        <div className="panel-header">
          <h2>Recent subscriptions</h2>
          <button className="secondary" onClick={() => void loadSubscriptions(normalizedSubscriptionEmail)} disabled={loadingSubscriptions}>
            {loadingSubscriptions ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="history-list">
          {recentSubscriptions.length ? (
            recentSubscriptions.map((subscription, index) => (
              <article key={subscription?.id ?? `subscription-${index}`} className="history-item">
                <div>
                  <strong>{maskEmail(subscription?.email)}</strong>
                  <span>{subscription?.plan ?? 'Unknown plan'}</span>
                </div>
                <div>
                  <strong>{subscription?.status ?? 'Unknown status'}</strong>
                  <span>{formatDateTime(subscription?.created_at)}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No subscriptions saved yet. Create one and it will appear here.</p>
          )}
        </div>
      </section>
    </div>
  )
}

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('GCSEmarker cannot start: missing root element #root.')
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
