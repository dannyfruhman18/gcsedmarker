import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWorker } from 'tesseract.js'
import {
  APP_NAME,
  BOARD_LINKS,
  EMAIL_ADDRESS_REGEX,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_VISIBLE_HISTORY_ROWS,
  MAX_VISIBLE_SUBSCRIPTION_ROWS,
  STRIPE_PAYMENT_LINK,
  SUPABASE_CONFIG_ERROR,
  boardOptions,
  modeOptions,
  subscriptionPlans,
} from './lib/constants'
import { scoreEssay, scoreMathsScience } from './lib/scoring'
import ProofVideoSection from './components/ProofVideoSection'
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

const OCR_WORKER_INIT_TIMEOUT_MS = 30_000
const OCR_WORKER_INIT_TIMEOUT_ERROR =
  `OCR worker initialization timed out after ${OCR_WORKER_INIT_TIMEOUT_MS / 1000} seconds. Please try again or reload the page.`

function getSupabaseConfigErrorMessage(error) {
  const message = error?.message || String(error)
  return message === SUPABASE_CONFIG_ERROR ? SUPABASE_CONFIG_ERROR : null
}

function getValidStripePaymentLink(link) {
  const value = String(link ?? '').trim()
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function getEmailValidationError(email, allowBlank = false) {
  const value = normalizeEmail(email)
  if (!value) {
    return allowBlank ? null : 'Add a valid email address.'
  }

  if (!EMAIL_ADDRESS_REGEX.test(value)) {
    return 'Add a valid email address.'
  }

  return null
}

function getStripeCheckoutFallbackMessage(detail) {
  const value = String(detail ?? '').trim()
  if (!value) {
    return 'Stripe checkout could not be opened. The subscription was saved in Supabase, and you can use the fallback link below to continue payment.'
  }

  return `Stripe checkout could not be opened because ${value}. The subscription was saved in Supabase, and you can use the fallback link below to continue payment.`
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
  const [copyFeedbackStatus, setCopyFeedbackStatus] = useState('')
  const [recentSessions, setRecentSessions] = useState([])
  const [recentSubscriptions, setRecentSubscriptions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false)
  const [marking, setMarking] = useState(false)
  const [subscriptionEmail, setSubscriptionEmail] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('top-band')
  const [subscriptionResult, setSubscriptionResult] = useState('')
  const [showStripeFallback, setShowStripeFallback] = useState(false)
  const [submittingSubscription, setSubmittingSubscription] = useState(false)
  const [error, setError] = useState(null)
  const [sessionsError, setSessionsError] = useState(null)
  const [subscriptionsError, setSubscriptionsError] = useState(null)
  const [ocrRetryAvailable, setOcrRetryAvailable] = useState(false)

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
  const pendingOcrFileRef = useRef(null)
  const uploadPreviewRef = useRef('')
  const markRequestInFlightRef = useRef(false)
  const scoringContextVersionRef = useRef(0)
  const questionTextAutoFilledRef = useRef(false)

  const boardLink = useMemo(() => BOARD_LINKS[board] ?? BOARD_LINKS.AQA, [board])
  const normalizedSubscriptionEmail = useMemo(
    () => normalizeEmail(subscriptionEmail),
    [subscriptionEmail],
  )
  const supabaseConfigMessage = SUPABASE_CONFIG_ERROR || ''
  const stripePaymentLinkUrl = useMemo(() => getValidStripePaymentLink(STRIPE_PAYMENT_LINK), [])
  const hasStripePaymentLink = Boolean(stripePaymentLinkUrl)

  const ensureOcrWorker = useCallback(async () => {
    if (workerRef.current) {
      return workerRef.current
    }

    if (!workerInitPromiseRef.current) {
      workerInitPromiseRef.current = (() => {
        let timeoutId
        const initPromise = createWorker('eng', 1, {
          logger: (message) => {
            if (typeof ocrProgressHandlerRef.current === 'function') {
              ocrProgressHandlerRef.current(message)
            }
          },
        })

        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(OCR_WORKER_INIT_TIMEOUT_ERROR))
          }, OCR_WORKER_INIT_TIMEOUT_MS)
        })

        return Promise.race([initPromise, timeoutPromise])
          .then(async (worker) => {
            if (!mountedRef.current) {
              try {
                await worker.terminate()
              } catch {
                // Ignore cleanup failures during worker initialization.
              }
              throw new Error('OCR worker initialization was cancelled.')
            }

            workerRef.current = worker
            return worker
          })
          .catch((err) => {
            const errorMessage = err?.message || String(err)
            if (errorMessage === OCR_WORKER_INIT_TIMEOUT_ERROR) {
              void initPromise.then((worker) => worker.terminate().catch(() => {})).catch(() => {})
            }
            workerRef.current = null
            throw err
          })
          .finally(() => {
            if (timeoutId) {
              clearTimeout(timeoutId)
            }
            workerInitPromiseRef.current = null
          })
      })()
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
        const configErrorMessage = getSupabaseConfigErrorMessage(err)
        setSessionsError(
          configErrorMessage ?? `Could not load recent marking sessions: ${err?.message || String(err)}`,
        )
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
      : '/rest/v1/subscriptions?select=*&order=created_at.desc&limit=10'

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
        const configErrorMessage = getSupabaseConfigErrorMessage(err)
        setSubscriptionsError(
          configErrorMessage ?? `Could not load recent subscriptions: ${err?.message || String(err)}`,
        )
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

    const emailValidationError = getEmailValidationError(email)
    if (emailValidationError) {
      setSubscriptionResult(emailValidationError)
      return
    }

    const rows = await loadSubscriptions(email, { updateRecentSubscriptions: false })
    if (rows === null) {
      setSubscriptionResult('Failed to refresh status.')
    } else {
      const hasActiveSubscription = subscriptionHasActiveAccess(rows, email)
      setSubscriptionResult(
        hasActiveSubscription
          ? 'An active subscription was found for this email.'
          : 'No active subscription was found for this email.',
      )
    }
  }, [loadSubscriptions, normalizedSubscriptionEmail])

  const revokeUploadPreview = useCallback((previewUrl = uploadPreviewRef.current) => {
    if (!previewUrl) {
      return
    }

    if (uploadPreviewRef.current === previewUrl) {
      uploadPreviewRef.current = ''
    }

    URL.revokeObjectURL(previewUrl)
  }, [])

  const resetMarkingContext = useCallback(() => {
    scoringContextVersionRef.current += 1
    setMarkResult(null)
    setCopyFeedbackStatus('')
    setError(null)
  }, [])

  const clearUpload = useCallback(() => {
    uploadRequestIdRef.current += 1
    revokeUploadPreview()
    pendingOcrFileRef.current = null
    setOcrRetryAvailable(false)
    setUploadName('')
    setUploadPreview('')
    resetMarkingContext()
    setOcrStatus('Upload an image and OCR will fill the question box.')
    setOcrLoading(false)
  }, [resetMarkingContext, revokeUploadPreview])

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
      pendingOcrFileRef.current = null
      if (uploadPreviewRef.current) {
        URL.revokeObjectURL(uploadPreviewRef.current)
        uploadPreviewRef.current = ''
      }
      if (workerRef.current) {
        const worker = workerRef.current
        workerRef.current = null
        void (async () => {
          await worker.terminate().catch(() => {})
        })()
      }
    }
  }, [])

  useEffect(() => {
    if (SUPABASE_CONFIG_ERROR) {
      return
    }

    void loadSessions()
    void loadSubscriptions()
  }, [loadSessions, loadSubscriptions])

  async function handleFileChange(file) {
    setError(null)

    if (!file) return

    const isImageType = Boolean(
      (file.type && file.type.startsWith('image/')) ||
        /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i.test(file.name || ''),
    )

    if (!isImageType) {
      uploadRequestIdRef.current += 1
      ocrProgressHandlerRef.current = null
      pendingOcrFileRef.current = null
      setOcrRetryAvailable(false)
      revokeUploadPreview()
      setUploadName('')
      setUploadPreview('')
      setOcrLoading(false)
      if (questionTextAutoFilledRef.current) {
        questionTextVersionRef.current += 1
        setQuestionText('')
        questionTextAutoFilledRef.current = false
      }
      setOcrStatus('Unsupported file type. Please upload an image file (JPG, PNG, WebP, GIF, BMP, HEIC, or AVIF).')
      return
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      uploadRequestIdRef.current += 1
      ocrProgressHandlerRef.current = null
      pendingOcrFileRef.current = null
      setOcrRetryAvailable(false)
      revokeUploadPreview()
      setUploadName('')
      setUploadPreview('')
      setOcrLoading(false)
      if (questionTextAutoFilledRef.current) {
        questionTextVersionRef.current += 1
        setQuestionText('')
        questionTextAutoFilledRef.current = false
      }
      const maxUploadSizeMb = Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))
      setOcrStatus(`File is too large. Please upload an image smaller than ${maxUploadSizeMb}MB.`)
      return
    }

    const uploadRequestId = ++uploadRequestIdRef.current
    const isLatestUpload = () => uploadRequestIdRef.current === uploadRequestId
    const questionTextVersionAtStart = questionTextVersionRef.current

    pendingOcrFileRef.current = file
    setOcrRetryAvailable(false)

    revokeUploadPreview()

    const nextPreview = URL.createObjectURL(file)
    uploadPreviewRef.current = nextPreview
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
        if (questionTextVersionRef.current === questionTextVersionAtStart) {
          setQuestionText(extracted)
          questionTextAutoFilledRef.current = true
          setOcrStatus(`Text read from image (${extractedWordCount} words).`)
        } else {
          questionTextAutoFilledRef.current = false
          setOcrStatus(
            `OCR complete (${extractedWordCount} words). We kept your manual question edits so you can keep refining the prompt below.`,
          )
        }
      } else if (questionTextVersionRef.current === questionTextVersionAtStart) {
        setQuestionText('')
        questionTextAutoFilledRef.current = false
        setOcrStatus('No clear text found. Question text was cleared, so you can type it manually.')
      } else {
        questionTextAutoFilledRef.current = false
        setOcrStatus('No clear text found. Your manual question edits were kept.')
      }

      setOcrRetryAvailable(false)
    } catch (err) {
      if (!mountedRef.current || !isLatestUpload()) return

      console.error('OCR failed while reading uploaded question:', err)
      const errorMessage = err?.message || String(err)
      const sanitizedErrorMessage = errorMessage.endsWith('.') ? errorMessage.slice(0, -1) : errorMessage
      const initFailure = !workerRef.current
      const ocrErrorMessage = initFailure
        ? `OCR could not start: ${sanitizedErrorMessage}. Tap Retry OCR to try again.`
        : `OCR failed: ${sanitizedErrorMessage}. Please try a clearer image or a smaller file under ${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB.`
      setOcrRetryAvailable(true)
      setError(ocrErrorMessage)
      setOcrStatus(ocrErrorMessage)
    } finally {
      if (isLatestUpload() && mountedRef.current) {
        setOcrLoading(false)
        ocrProgressHandlerRef.current = null
      }
    }
  }

  async function handleOcrRetry() {
    const file = pendingOcrFileRef.current
    if (!file) {
      setOcrRetryAvailable(false)
      setOcrStatus('There is no uploaded image to retry. Please upload the question image again.')
      return
    }

    setError(null)
    setOcrRetryAvailable(false)
    setOcrStatus('Retrying OCR...')
    await handleFileChange(file)
  }

  async function handleMark() {
    if (markRequestInFlightRef.current) {
      return
    }

    setError(null)
    setSessionsError(null)
    setSubscriptionsError(null)
    setCopyFeedbackStatus('')

    const trimmedQuestion = questionText.trim()
    const trimmedAnswer = answerText.trim()
    const normalizedMarkEmail = normalizeEmail(subscriptionEmail)
    const hasSubscriptionEmail = Boolean(normalizedMarkEmail)
    const stripeGateAllowsMarking = hasSubscriptionEmail || !hasStripePaymentLink
    const emailValidationError = hasSubscriptionEmail ? getEmailValidationError(normalizedMarkEmail, true) : null

    if (!trimmedQuestion && !trimmedAnswer) {
      window.scrollTo(0, 0)
      setError('Add a question and an answer before marking.')
      return
    }

    if (!trimmedQuestion) {
      window.scrollTo(0, 0)
      setError('Add a question or prompt before marking so the answer has context.')
      return
    }

    if (!trimmedAnswer) {
      window.scrollTo(0, 0)
      setError('Add a student answer, essay, or working before marking.')
      return
    }

    if (!stripeGateAllowsMarking) {
      window.scrollTo(0, 0)
      setError('Add a subscriber email before marking when Stripe payments are enabled.')
      return
    }

    if (emailValidationError) {
      window.scrollTo(0, 0)
      setError(emailValidationError)
      return
    }

    resetMarkingContext()
    const scoringContextVersionAtStart = scoringContextVersionRef.current
    markRequestInFlightRef.current = true
    setMarking(true)
    try {
      const refreshedSubscriptions = hasSubscriptionEmail
        ? await loadSubscriptions(normalizedMarkEmail, { updateRecentSubscriptions: false })
        : []
      if (!mountedRef.current || scoringContextVersionRef.current !== scoringContextVersionAtStart) return

      const subscriptionLoadFailed = hasSubscriptionEmail && refreshedSubscriptions === null
      if (hasStripePaymentLink && hasSubscriptionEmail && subscriptionLoadFailed) {
        const message = 'Subscription status could not be verified. Please refresh status and try again.'
        if (mountedRef.current && scoringContextVersionRef.current === scoringContextVersionAtStart) {
          window.scrollTo(0, 0)
          setError(message)
        }
        return
      }

      const hasActiveSubscription = !hasSubscriptionEmail
        ? true
        : subscriptionHasActiveAccess(refreshedSubscriptions, normalizedMarkEmail)

      if (hasStripePaymentLink && hasSubscriptionEmail && !hasActiveSubscription) {
        if (mountedRef.current && scoringContextVersionRef.current === scoringContextVersionAtStart) {
          const subscriptionRequiredMessage = 'Subscription required. Enter the subscriber email, complete checkout, and wait for an active record before marking.'
          window.scrollTo(0, 0)
          setError(subscriptionRequiredMessage)
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
      if (!mountedRef.current || scoringContextVersionRef.current !== scoringContextVersionAtStart) return
      setMarkResult(result)

      await supabaseRequest('/rest/v1/marking_sessions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [
          {
            exam_board: board,
            mode,
            question_text: trimmedQuestion,
            answer_text: trimmedAnswer,
            upload_name: uploadName,
            score: result.score,
            feedback: result,
          },
        ],
      })
      if (!mountedRef.current || scoringContextVersionRef.current !== scoringContextVersionAtStart) return

      setError(null)
      await loadSessions()
    } catch (err) {
      console.error('Marking answer failed:', err)
      if (!mountedRef.current || scoringContextVersionRef.current !== scoringContextVersionAtStart) return

      window.scrollTo(0, 0)
      const configErrorMessage = getSupabaseConfigErrorMessage(err)
      const message =
        configErrorMessage ??
        `Supabase save failed. Check VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, network connectivity, and Supabase RLS or table permissions for marking_sessions/subscriptions. Original error: ${err?.message || String(err)}`
      setError(message)
      setMarkResult((current) => ({
        ...(current || {}),
        storageError: message,
      }))
    } finally {
      markRequestInFlightRef.current = false
      if (mountedRef.current) {
        setMarking(false)
      }
    }
  }

  async function handleSubscription() {
    setError(null)
    setSessionsError(null)
    setSubscriptionResult('')
    setSubscriptionsError(null)
    setShowStripeFallback(false)

    if (STRIPE_PAYMENT_LINK && !stripePaymentLinkUrl) {
      const message =
        'Stripe payment link is invalid. Set VITE_STRIPE_PAYMENT_LINK to a valid http(s) URL before opening checkout.'
      console.error(message, { stripePaymentLink: STRIPE_PAYMENT_LINK })
      setError(message)
      setSubscriptionResult(message)
      return
    }

    const emailValidationError = getEmailValidationError(subscriptionEmail)
    if (emailValidationError) {
      setSubscriptionResult(emailValidationError)
      return
    }

    const email = normalizeEmail(subscriptionEmail)
    const hasStripeCheckout = Boolean(stripePaymentLinkUrl)
    let stripeWindow = null
    let stripeCheckoutIssue = ''

    if (hasStripeCheckout) {
      try {
        stripeWindow = window.open('about:blank', '_blank', 'noreferrer')
        if (!stripeWindow || stripeWindow.closed) {
          stripeCheckoutIssue = 'the popup was blocked by your browser'
          setShowStripeFallback(true)
        } else {
          try {
            stripeWindow.document.write('<p style="font-family:sans-serif;padding:16px;">Opening Stripe checkout…</p>')
          } catch (popupWriteErr) {
            console.error('Stripe checkout popup opened, but writing the placeholder content failed.', popupWriteErr)
          }
        }
      } catch (popupOpenErr) {
        stripeCheckoutIssue = 'opening the Stripe checkout popup threw an exception'
        setShowStripeFallback(true)
        console.error('Opening the Stripe checkout popup threw an exception.', popupOpenErr)
      }
    }

    setSubmittingSubscription(true)
    try {
      await supabaseRequest('/rest/v1/subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: [
          {
            email,
            plan: subscriptionPlan,
            status: hasStripeCheckout ? 'pending_payment' : 'active',
            provider: hasStripeCheckout ? 'stripe_link' : 'supabase_demo',
            notes: hasStripeCheckout ? 'User sent to Stripe checkout link.' : 'No Stripe link configured yet.',
          },
        ],
      })

      if (!mountedRef.current) return

      if (stripePaymentLinkUrl && stripeWindow && !stripeWindow.closed) {
        try {
          stripeWindow.location.href = stripePaymentLinkUrl.href
        } catch (popupRedirectErr) {
          console.error('Stripe checkout popup opened, but redirecting to the payment link failed.', popupRedirectErr)
          if (!stripeCheckoutIssue) {
            stripeCheckoutIssue = 'the browser blocked redirecting the checkout popup to Stripe'
          }
          setShowStripeFallback(true)
        }
      }

      await loadSubscriptions()
      if (!mountedRef.current) return

      setError(null)
      setSubscriptionResult(
        hasStripeCheckout
          ? stripeCheckoutIssue
            ? getStripeCheckoutFallbackMessage(stripeCheckoutIssue)
            : 'Subscription record saved in Supabase and Stripe checkout opened in a new tab.'
          : 'Subscription record saved in Supabase. Add a Stripe payment link to turn this into live checkout.',
      )
    } catch (err) {
      console.error('Subscription save failed:', err)
      if (stripeWindow && !stripeWindow.closed) {
        stripeWindow.close()
      }

      if (!mountedRef.current) return

      const configErrorMessage = getSupabaseConfigErrorMessage(err)
      const message = configErrorMessage ?? `Subscription save failed: ${err?.message || String(err)}`
      setError(message)
      setSubscriptionResult(
        hasStripeCheckout
          ? stripeCheckoutIssue
            ? `${message} The checkout popup was blocked, so use the fallback link below to continue payment.`
            : message
          : message,
      )
    } finally {
      if (mountedRef.current) {
        setSubmittingSubscription(false)
      }
    }
  }

  async function handleCopyFeedback() {
    if (!markResult) {
      return
    }

    const summary = String(markResult.summary ?? '').trim()
    const feedbackText = `Score: ${markResult.score} / ${markResult.maxMarks}\nSummary: ${summary}`

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(feedbackText)
      } else {
        const helper = document.createElement('textarea')
        helper.value = feedbackText
        helper.setAttribute('readonly', 'true')
        helper.style.position = 'fixed'
        helper.style.top = '-9999px'
        helper.style.left = '-9999px'
        helper.style.opacity = '0'
        document.body.appendChild(helper)
        helper.focus()
        helper.select()
        const copied = document.execCommand('copy')
        document.body.removeChild(helper)
        if (!copied) {
          throw new Error('Clipboard copy was blocked.')
        }
      }

      setCopyFeedbackStatus('Feedback copied to clipboard.')
    } catch (copyErr) {
      console.error('Could not copy feedback to clipboard:', copyErr)
      setCopyFeedbackStatus('Could not copy automatically. Please copy the score and summary manually.')
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-card">
          <div className="brand-row">
            <img src="/logo.svg" alt={`${APP_NAME} logo`} className="brand-logo" width="64" height="64" loading="eager" decoding="async" />
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
            <div className="stat"><span>Paywall</span><strong>{STRIPE_PAYMENT_LINK ? (hasStripePaymentLink ? 'On' : 'Invalid') : 'Demo'}</strong></div>
          </div>
        </div>
      </header>

      <ProofVideoSection />

      {supabaseConfigMessage ? (
        <section className="panel" role="alert" aria-live="assertive">
          <h2>Supabase not configured</h2>
          <p className="error">{supabaseConfigMessage}</p>
        </section>
      ) : null}

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
              disabled={ocrLoading}
              onChange={(e) => {
                void handleFileChange(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <label
              htmlFor="upload"
              className="upload-button"
              role="button"
              tabIndex={ocrLoading ? -1 : 0}
              aria-disabled={ocrLoading}
              aria-label="Upload a scan or photo of the question"
              aria-describedby="ocr-status"
              onKeyDown={(e) => {
                if (ocrLoading) {
                  return
                }
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
              <p id="ocr-status" className="muted" aria-live="polite" style={{ margin: 0, flex: '1 1 220px' }}>{ocrStatus}</p>
              {ocrRetryAvailable ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void handleOcrRetry()}
                >
                  Retry OCR
                </button>
              ) : null}
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
            <div className="preview-container">
              {uploadPreview ? (
                <img className="preview" src={uploadPreview} alt="Uploaded question preview" />
              ) : (
                <div className="preview-placeholder" aria-hidden="true">
                  Preview will appear here after an image is uploaded.
                </div>
              )}
            </div>
          </div>

          <div className="textareas">
            <label>
              Question or prompt
              <textarea
                value={questionText}
                onChange={(e) => {
                  questionTextAutoFilledRef.current = false
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
              <button type="button" className="copy-button" onClick={() => void handleCopyFeedback()}>
                Copy feedback
              </button>
              {copyFeedbackStatus ? <p className="result-note" aria-live="polite">{copyFeedbackStatus}</p> : null}
              {markResult.ao1?.length ? (
                <div>
                  <h3>AO1</h3>
                  <ul>{markResult.ao1.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao2?.length ? (
                <div>
                  <h3>AO2</h3>
                  <ul>{markResult.ao2.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.ao3?.length ? (
                <div>
                  <h3>AO3</h3>
                  <ul>{markResult.ao3.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.extra?.length ? (
                <div>
                  <h3>Method marks</h3>
                  <ul>{markResult.extra.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
                </div>
              ) : null}
              {markResult.storageError ? <p className="error">{markResult.storageError}</p> : null}
            </div>
          ) : (
            <p className="muted">Run a mark to see AO feedback, method-mark comments, and Top Band advice.</p>
          )}

          <div className="resource-box">
            <h3>Official mark-scheme links</h3>
            {Object.entries(BOARD_LINKS).map(([id, link]) => (
              <a key={id} href={link.href} target="_blank" rel="noreferrer">
                {id}
              </a>
            ))}
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
              {submittingSubscription ? 'Processing...' : STRIPE_PAYMENT_LINK ? (hasStripePaymentLink ? 'Open Stripe checkout' : 'Checkout config invalid') : 'Create subscription record'}
            </button>
            <button className="secondary" onClick={() => void refreshSubscriptionStatus()}>
              Refresh Status
            </button>
            {subscriptionResult ? <p className="result-note">{subscriptionResult}</p> : null}
            {showStripeFallback && hasStripePaymentLink && stripePaymentLinkUrl ? (
              <a className="chip-link" href={stripePaymentLinkUrl.href} target="_blank" rel="noreferrer">
                Open Stripe checkout in a new tab
              </a>
            ) : null}
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
                  <span>{modeOptions.find((m) => m.id === session?.mode)?.label ?? session?.mode}</span>
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
            recentSubscriptions.slice(0, MAX_VISIBLE_SUBSCRIPTION_ROWS).map((subscription, index) => (
              <article key={subscription?.id ?? `subscription-${index}`} className="history-item">
                <div>
                  <strong>{maskEmail(subscription?.email)}</strong>
                  <span>{subscriptionPlans.find((p) => p.id === subscription?.plan)?.label ?? subscription?.plan}</span>
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
