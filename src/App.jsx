import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'
import {
  APP_NAME,
  BOARD_LINKS,
  EMAIL_ADDRESS_REGEX,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_VISIBLE_HISTORY_ROWS,
  STRIPE_PAYMENT_LINK,
  SUPABASE_CONFIG_ERROR,
  boardOptions,
  modeOptions,
  subscriptionPlans,
} from './lib/constants'
import { scoreEssay, scoreMathsScience } from './lib/scoring'
import {
  formatDateTime,
  maskEmail,
  normalizeEmail,
  subscriptionHasActiveAccess,
  supabaseRequest,
} from './lib/supabase'

async function extractQuestionTextFromImage(file, onProgress, worker) {
  if (!worker) {
    throw new Error('OCR worker is not available.')
  }

  if (typeof onProgress === 'function') {
    onProgress('Preparing OCR...')
  }

  const result = await worker.recognize(file)
  const extractedText = result?.data?.text?.trim() ?? ''

  if (typeof onProgress === 'function') {
    onProgress(
      extractedText
        ? 'OCR complete.'
        : 'No clear text found. You can type or paste the question manually.',
    )
  }

  return extractedText
}

export default function App() {
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
  const [marking, setMarking] = useState(false)
  const [subscriptionEmail, setSubscriptionEmail] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('top-band')
  const [subscriptionResult, setSubscriptionResult] = useState('')
  const [submittingSubscription, setSubmittingSubscription] = useState(false)
  const [error, setError] = useState(SUPABASE_CONFIG_ERROR)
  const [sessionsError, setSessionsError] = useState(null)
  const [subscriptionsError, setSubscriptionsError] = useState(null)

  const uploadRequestIdRef = useRef(0)
  const sessionsRequestIdRef = useRef(0)
  const subscriptionsRequestIdRef = useRef(0)
  const questionTextVersionRef = useRef(0)
  const mountedRef = useRef(true)
  const requestControllersRef = useRef(new Set())
  const sessionsControllerRef = useRef(null)
  const subscriptionsControllerRef = useRef(null)
  const configErrorLoggedRef = useRef(false)
  const workerRef = useRef(null)
  const workerInitPromiseRef = useRef(null)
  const ocrProgressHandlerRef = useRef(null)

  const boardLink = useMemo(() => BOARD_LINKS[board] ?? BOARD_LINKS.AQA, [board])
  const normalizedSubscriptionEmail = useMemo(
    () => normalizeEmail(subscriptionEmail),
    [subscriptionEmail],
  )

  const ensureOcrWorker = useCallback(async () => {
    if (workerRef.current) {
      return workerRef.current
    }

    if (!workerInitPromiseRef.current) {
      workerInitPromiseRef.current = createWorker('eng', 1, {
        logger: (message) => {
          if (typeof ocrProgressHandlerRef.current === 'function') {
            ocrProgressHandlerRef.current(message)
          }
        },
      })
        .then(async (worker) => {
          if (!mountedRef.current) {
            try {
              await worker.terminate()
            } catch (terminateErr) {
              console.warn('OCR worker cleanup failed during initialization:', terminateErr)
            }
            throw new Error('OCR worker initialization was cancelled.')
          }

          workerRef.current = worker
          return worker
        })
        .catch((err) => {
          workerRef.current = null
          throw err
        })
        .finally(() => {
          workerInitPromiseRef.current = null
        })
    }

    const worker = await workerInitPromiseRef.current
    if (!workerRef.current) {
      workerRef.current = worker
    }
    return worker
  }, [])

  const loadSessions = useCallback(async () => {
    if (sessionsControllerRef.current) {
      sessionsControllerRef.current.abort()
    }

    const requestId = ++sessionsRequestIdRef.current
    const controller = new AbortController()
    sessionsControllerRef.current = controller
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
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        requestId !== sessionsRequestIdRef.current
      ) {
        return nextRows
      }

      setRecentSessions(nextRows)
      setSessionsError(null)
      return nextRows
    } catch (err) {
      if (controller.signal.aborted || requestId !== sessionsRequestIdRef.current) return []

      console.error('Could not load recent marking sessions:', err)
      if (mountedRef.current) {
        setSessionsError(`Could not load recent marking sessions: ${err?.message || String(err)}`)
      }
      return []
    } finally {
      requestControllersRef.current.delete(controller)
      if (sessionsControllerRef.current === controller) {
        sessionsControllerRef.current = null
      }
      if (mountedRef.current && !controller.signal.aborted && requestId === sessionsRequestIdRef.current) {
        setLoadingSessions(false)
      }
    }
  }, [])

  const loadSubscriptions = useCallback(async (email = '', options = {}) => {
    const { updateRecentSubscriptions = true } = options

    if (subscriptionsControllerRef.current) {
      subscriptionsControllerRef.current.abort()
    }

    const requestId = ++subscriptionsRequestIdRef.current
    const normalizedEmail = normalizeEmail(email)
    const subscriptionsPath = normalizedEmail
      ? `/rest/v1/subscriptions?select=*&order=created_at.desc&limit=200&email=eq.${encodeURIComponent(normalizedEmail)}`
      : '/rest/v1/subscriptions?select=*&order=created_at.desc&limit=200'

    const controller = new AbortController()
    subscriptionsControllerRef.current = controller
    requestControllersRef.current.add(controller)

    setSubscriptionsError(null)
    try {
      if (!mountedRef.current) {
        controller.abort()
        return null
      }

      setLoadingSubscriptions(true)
      const rows = await supabaseRequest(
        subscriptionsPath,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
        controller.signal,
      )
      const nextRows = Array.isArray(rows) ? rows : []
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        requestId !== subscriptionsRequestIdRef.current
      ) {
        return nextRows
      }

      if (updateRecentSubscriptions) {
        setRecentSubscriptions(nextRows)
      }
      setSubscriptionsError(null)
      return nextRows
    } catch (err) {
      if (controller.signal.aborted || requestId !== subscriptionsRequestIdRef.current) return null

      console.error('Could not load recent subscriptions:', err)
      if (mountedRef.current) {
        setSubscriptionsError(`Could not load recent subscriptions: ${err?.message || String(err)}`)
      }
      return null
    } finally {
      requestControllersRef.current.delete(controller)
      if (subscriptionsControllerRef.current === controller) {
        subscriptionsControllerRef.current = null
      }
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        requestId === subscriptionsRequestIdRef.current
      ) {
        setLoadingSubscriptions(false)
      }
    }
  }, [])

  const refreshSubscriptionStatus = useCallback(async () => {
    const email = normalizedSubscriptionEmail

    if (!email) {
      setSubscriptionResult('Add a subscriber email to check subscription status.')
      return
    }

    const rows = await loadSubscriptions(email, { updateRecentSubscriptions: false })
    if (rows === null) {
      return
    }

    const hasActiveSubscription = subscriptionHasActiveAccess(rows, email)
    setSubscriptionResult(
      hasActiveSubscription
        ? 'An active subscription was found for this email.'
        : 'No active subscription was found for this email.',
    )
  }, [loadSubscriptions, normalizedSubscriptionEmail])

  const clearUpload = useCallback(() => {
    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview)
    }

    uploadRequestIdRef.current += 1
    setUploadName('')
    setUploadPreview('')
    setOcrStatus('Upload an image and OCR will fill the question box.')
    setOcrLoading(false)
  }, [uploadPreview])

  useEffect(() => {
    if (SUPABASE_CONFIG_ERROR && !configErrorLoggedRef.current) {
      configErrorLoggedRef.current = true
      console.error(`${APP_NAME} configuration error: ${SUPABASE_CONFIG_ERROR}`)
    }
  }, [SUPABASE_CONFIG_ERROR])

  useEffect(() => {
    return () => {
      mountedRef.current = false
      sessionsControllerRef.current?.abort()
      subscriptionsControllerRef.current?.abort()
      requestControllersRef.current.forEach((controller) => controller.abort())
      requestControllersRef.current.clear()
      ocrProgressHandlerRef.current = null
      workerInitPromiseRef.current = null
      if (workerRef.current) {
        void workerRef.current.terminate().catch(() => {})
        workerRef.current = null
      }
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
    if (SUPABASE_CONFIG_ERROR) {
      return
    }

    void loadSessions()
    void loadSubscriptions()
  }, [loadSessions, loadSubscriptions])

  async function handleFileChange(file) {
    if (!file) return

    const isImageType = Boolean(
      (file.type && file.type.startsWith('image/')) ||
        /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name || ''),
    )

    if (!isImageType) {
      clearUpload()
      setOcrStatus('Unsupported file type. Please upload an image file (JPG, PNG, WebP, GIF, BMP, HEIC, or AVIF).')
      return
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      clearUpload()
      setOcrStatus('File is too large. Please upload an image smaller than 5MB.')
      return
    }

    const uploadRequestId = ++uploadRequestIdRef.current
    const isLatestUpload = () => uploadRequestIdRef.current === uploadRequestId
    const questionTextVersionAtStart = questionTextVersionRef.current

    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview)
    }

    const nextPreview = URL.createObjectURL(file)
    setOcrLoading(true)
    setUploadName(file.name)
    setUploadPreview(nextPreview)
    setOcrStatus('Reading text from the image...')

    ocrProgressHandlerRef.current = (message) => {
      if (!mountedRef.current || !isLatestUpload()) {
        return
      }

      if (typeof message?.progress === 'number') {
        const percent = Math.max(0, Math.min(100, Math.round(message.progress * 100)))
        setOcrStatus(`OCR: ${percent}%`)
        return
      }

      if (message?.status) {
        setOcrStatus(`OCR: ${message.status}`)
      }
    }

    try {
      const worker = await ensureOcrWorker()
      if (!mountedRef.current || !isLatestUpload()) return

      const extracted = await extractQuestionTextFromImage(
        file,
        (status) => {
          if (mountedRef.current && isLatestUpload()) {
            setOcrStatus(status)
          }
        },
        worker,
      )
      if (!mountedRef.current || !isLatestUpload()) return

      if (extracted) {
        const extractedWordCount = extracted.split(/\s+/).filter(Boolean).length
        if (questionTextRefe
rence.current === questionTextVersionAtStart) {
          setQuestionText(extracted)
          setOcrStatus(`Text read from image (${extractedWordCount} words).`)
        } else {
          setOcrStatus(
            `OCR complete (${extractedWordCount} words), but your manual question edits were kept.`,
          )
        }
      } else if (questionTextVersionRef.current === questionTextVersionAtStart) {
        setQuestionText('')
        setOcrStatus('No clear text found. Question text was cleared, so you can type it manually.')
      } else {
        setOcrStatus('No clear text found. Your manual question edits were kept.')
      }
    } catch (err) {
      if (!mountedRef.current || !isLatestUpload()) return

      console.error('OCR failed while reading uploaded question:', err)
      if (workerRef.current) {
        setOcrStatus('OCR failed — please type the question manually. Try a clearer image or a smaller file under 5MB.')
      } else {
        setOcrStatus('OCR could not start. Please try again or reload the page.')
      }
    } finally {
      if (isLatestUpload() && mountedRef.current) {
        setOcrLoading(false)
        ocrProgressHandlerRef.current = null
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

    if (!trimmedQuestion && !trimmedAnswer) {
      setMarkResult(null)
      setError('Add a question and an answer before marking.')
      return
    }

    if (!trimmedQuestion) {
      setMarkResult(null)
      setError('Add a question or prompt before marking so the answer has context.')
      return
    }

    if (!trimmedAnswer) {
      setMarkResult(null)
      setError('Add a student answer, essay, or working before marking.')
      return
    }

    if (STRIPE_PAYMENT_LINK && !hasSubscriptionEmail) {
      setMarkResult(null)
      setError('Add a subscriber email before marking when Stripe payments are enabled.')
      return
    }

    if (hasSubscriptionEmail && !EMAIL_ADDRESS_REGEX.test(normalizedMarkEmail)) {
      setMarkResult(null)
      setError('Add a valid email address before marking, or leave it blank for demo mode.')
      return
    }

    setMarking(true)
    try {
      const refreshedSubscriptions = hasSubscriptionEmail
        ? await loadSubscriptions(normalizedMarkEmail, { updateRecentSubscriptions: false })
        : []
      if (!mountedRef.current) return

      const subscriptionLoadFailed = hasSubscriptionEmail && refreshedSubscriptions === null
      if (STRIPE_PAYMENT_LINK && hasSubscriptionEmail && subscriptionLoadFailed) {
        const message = 'Subscription status could not be verified. Please refresh status and try again.'
        if (mountedRef.current) {
          setError(message)
          setMarkResult({
            score: 0,
            maxMarks: mode === 'essay' ? 6 : 10,
            summary: message,
            ao1: ['We could not confirm subscription access just now. Please refresh status and try again.'],
            ao2: [],
            ao3: [],
          })
        }
        return
      }

      const hasActiveSubscription = !hasSubscriptionEmail
        ? true
        : subscriptionHasActiveAccess(refreshedSubscriptions, normalizedMarkEmail)

      if (STRIPE_PAYMENT_LINK && hasSubscriptionEmail && !hasActiveSubscription) {
        if (mountedRef.current) {
          setMarkResult({
            score: 0,
            maxMarks: mode === 'essay' ? 6 : 10,
            summary: 'Subscription required. Enter the subscriber email, complete checkout, and wait for an active record before marking.',
            ao1: ['This workspace is currently configured to require an active subscription before marking.'],
            ao2: [],
            ao3: [],
          })
        }
        return
      }

      const analyzer = mode === 'essay' ? scoreEssay : scoreMathsScience
      const result = analyzer({
        questionText: trimmedQuestion,
        answerText: trimmedAnswer,
        topBand,
        board,
      })
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
      console.error('Marking answer failed:', err)
      if (!mountedRef.current) return

      const message = `Supabase save failed. Check VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, network connectivity, and Supabase RLS or table permissions for marking_sessions/subscriptions. Original error: ${err?.message || String(err)}`
      setError(message)
      setMarkResult((current) => ({
        ...(current || {}),
        storageError: message,
      }))
    } finally {
      if (mountedRef.current) {
        setMarking(false)
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

    let stripeWindow = null
    let stripePopupBlocked = false

    if (STRIPE_PAYMENT_LINK) {
      stripeWindow = window.open('about:blank', '_blank', 'noreferrer')
      stripePopupBlocked = !stripeWindow
      if (stripeWindow) {
        try {
          stripeWindow.document.write('<p style="font-family:sans-serif;padding:16px;">Opening Stripe checkout…</p>')
        } catch {
          // Ignore cross-browser about:blank write issues.
        }
      }
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

      if (STRIPE_PAYMENT_LINK && stripeWindow && !stripeWindow.closed) {
        stripeWindow.location.href = STRIPE_PAYMENT_LINK
      }

      await loadSubscriptions()
      if (!mountedRef.current) return

      setError(null)
      setSubscriptionResult(
        STRIPE_PAYMENT_LINK
          ? stripePopupBlocked
            ? 'Subscription record saved in Supabase, but the Stripe popup was blocked. Please allow popups or open the payment link manually.'
            : 'Subscription record saved in Supabase and Stripe checkout opened.'
          : 'Subscription record saved in Supabase. Add a Stripe payment link to turn this into live checkout.',
      )
    } catch (err) {
      console.error('Subscription save failed:', err)
      if (stripeWindow && !stripeWindow.closed) {
        stripeWindow.close()
      }

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
            <img src="/logo.svg" alt={`${APP_NAME} logo`} className="brand-logo" />
            <div>
              <p className="eyebrow">{APP_NAME}</p>
              <h1>Upload a question, choose the board, and get mark-style feedback fast.</h1>
            </div>
          </div>
          <p className="lede">
            Built for essays, maths, and science. Includes OCR image reading, AO1 / AO2 / AO3 prompts, method marks,
            official mark-scheme links, a Top Band mode for grade 9 refinement, subscription-ready access, and a
            Capacitor-ready path for iOS packaging.
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

          <div className={`dropzone ${ocrLoading ? 'loading' : ''}`}>
            <input
              id="upload"
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(e) => {
                void handleFileChange(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <label
              htmlFor="upload"
              className="upload-button"
              tabIndex="0"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  document.getElementById('upload')?.click()
                }
              }}
            >
              <strong>Upload a scan or photo of the question</strong>
              <span>JPG, PNG, or camera image</span>
            </label>
            {uploadName ? <p className="file-name">Selected: {uploadName}</p> : <p className="file-name">No file selected yet.</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <p className="muted" style={{ margin: 0, flex: '1 1 220px' }}>{ocrStatus}</p>
              {uploadPreview ? (
                <button
                  type="button"
                  className="clear-button"
                  onClick={clearUpload}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {uploadPreview ? <img className="preview" src={uploadPreview} alt="Uploaded question preview" /> : null}
          </div>

          <div className="textareas">
            <label>
              Question or prompt
              <textarea
                value={questionText}
                onChange={(e) => {
                  questionTextVersionRef.current += 1
                  setQuestionText(e.target.value)
                }}
                placeholder="Paste the question text here."
                rows={7}
              />
            </label>
            <label>
              Student answer / essay / working
              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Paste the answer, essay, or working here."
                rows={10}
              />
            </label>
          </div>

          <button className="primary" onClick={handleMark} disabled={marking || ocrLoading}>
            {marking ? 'Marking...' : 'Mark answer'}
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
                  <ul>{markResult.ao1.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao2?.length ? (
                <div>
                  <h3>AO2</h3>
                  <ul>{markResult.ao2.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao3?.length ? (
                <div>
                  <h3>AO3</h3>
                  <ul>{markResult.ao3.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.extra?.length ? (
                <div>
                  <h3>Method marks</h3>
                  <ul>{markResult.extra.map((item, index) => <li key={`${index}-${item.slice(0, 30)}`}>{item}</li>)}</ul>
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
              <input
                type="email"
                value={subscriptionEmail}
                onChange={(e) => setSubscriptionEmail(e.target.value)}
                placeholder="parent@example.com"
              />
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
            <button className="secondary" onClick={() => void refreshSubscriptionStatus()}>
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
            recentSessions.slice(0, MAX_VISIBLE_HISTORY_ROWS).map((session, index) => (
              <article key={session?.id ?? `session-${index}`} className="history-item">
                <div>
                  <strong>{session?.exam_board ?? 'Unknown board'}</strong>
                  <span>{modeOptions.find((m) => m.id === session.mode)?.label ?? session.mode}</span>
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
          <button className="secondary" onClick={() => void loadSubscriptions()} disabled={loadingSubscriptions}>
            {loadingSubscriptions ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="history-list">
          {recentSubscriptions.length ? (
            recentSubscriptions.slice(0, MAX_VISIBLE_HISTORY_ROWS).map((subscription, index) => (
              <article key={subscription?.id ?? `subscription-${index}`} className="history-item">
                <div>
                  <strong>{maskEmail(subscription?.email)}</strong>
                  <span>{subscriptionPlans.find((p) => p.id === subscription.plan)?.label ?? subscription.plan}</span>
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
