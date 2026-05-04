import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createWorker } from 'tesseract.js'
import './styles.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? ''

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

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
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
    const message = typeof data === 'string'
      ? data
      : data?.message || data?.error_description || data?.hint || response.statusText
    throw new Error(`${message} (${response.status})`)
  }

  return data
}

function scoreEssay(answer, topBand) {
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

  if (/\b(cm|mm|m|kg|g|n|j|w|s|°c|mol|dm\^?3)\b/i.test(text)) {
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

  const score = Math.min(marks.size + (topBand && text.length >= 100 ? 1 : 0), topBand ? 5 : 4)

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
  const [markResult, setMarkResult] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [recentSubscriptions, setRecentSubscriptions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subscriptionEmail, setSubscriptionEmail] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('top-band')
  const [subscriptionResult, setSubscriptionResult] = useState('')
  const [submittingSubscription, setSubmittingSubscription] = useState(false)

  const boardLink = useMemo(() => BOARD_LINKS[board], [board])
  const normalizedSubscriptionEmail = useMemo(
    () => subscriptionEmail.trim().toLowerCase(),
    [subscriptionEmail],
  )
  const activeSubscription = useMemo(() => {
    if (!normalizedSubscriptionEmail) return false

    return recentSubscriptions.some((row) => {
      const rowEmail = String(row.email || '').trim().toLowerCase()
      const rowStatus = String(row.status || '').trim().toLowerCase()
      return rowEmail === normalizedSubscriptionEmail && rowStatus === 'active'
    })
  }, [recentSubscriptions, normalizedSubscriptionEmail])

  useEffect(() => {
    void loadSessions()
    void loadSubscriptions()
  }, [])

  async function loadSessions() {
    setLoadingSessions(true)
    try {
      const rows = await supabaseRequest('/rest/v1/marking_sessions?select=*&order=created_at.desc&limit=5', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      setRecentSessions(rows ?? [])
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingSessions(false)
    }
  }

  async function loadSubscriptions() {
    try {
      const rows = await supabaseRequest('/rest/v1/subscriptions?select=*&order=created_at.desc&limit=50', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      setRecentSubscriptions(rows ?? [])
    } catch (error) {
      console.error(error)
    }
  }

  async function handleFileChange(file) {
    if (!file) return
    setUploadName(file.name)
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    setUploadPreview(URL.createObjectURL(file))
    setOcrStatus('Reading text from the image...')

    try {
      const extracted = await extractQuestionTextFromImage(file, setOcrStatus)
      if (extracted) {
        setQuestionText(extracted)
        setOcrStatus(`Text read from image (${extracted.split(/\s+/).filter(Boolean).length} words).`)
      } else {
        setOcrStatus('No clear text found. You can type or paste the question manually.')
      }
    } catch (error) {
      console.error(error)
      setOcrStatus('OCR failed — please type the question manually.')
    }
  }

  async function handleMark() {
    if (STRIPE_PAYMENT_LINK && !activeSubscription) {
      setMarkResult({
        score: 0,
        maxMarks: topBand ? 5 : 4,
        summary: 'Subscription required. Enter the subscriber email, complete checkout, and wait for the active record before marking.',
        ao1: ['This workspace is currently configured to require an active subscription before marking.'],
        ao2: [],
        ao3: [],
      })
      return
    }

    const analyzer = mode === 'essay' ? scoreEssay : scoreMathsScience
    const result = analyzer(answerText, topBand)
    setMarkResult(result)
    setSaving(true)

    try {
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
      await loadSessions()
    } catch (error) {
      setMarkResult((current) => ({
        ...(current || {}),
        storageError: `Supabase save failed: ${error?.message || String(error)}`,
      }))
    } finally {
      setSaving(false)
    }
  }

  async function handleSubscription() {
    const email = subscriptionEmail.trim()
    if (!email) {
      setSubscriptionResult('Add an email address first.')
      return
    }

    setSubmittingSubscription(true)
    try {
      if (STRIPE_PAYMENT_LINK) {
        window.open(STRIPE_PAYMENT_LINK, '_blank', 'noreferrer')
      }

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
      setSubscriptionResult(
        STRIPE_PAYMENT_LINK
          ? 'Stripe checkout opened and subscription record saved in Supabase as pending_payment.'
          : 'Subscription record saved in Supabase. Add a Stripe payment link to turn this into live checkout.'
      )
      await loadSubscriptions()
    } catch (error) {
      setSubscriptionResult(`Subscription save failed: ${error?.message || String(error)}`)
    } finally {
      setSubmittingSubscription(false)
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
            <label htmlFor="upload">
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

          <button className="primary" onClick={handleMark} disabled={saving}>
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
            recentSessions.map((session) => (
              <article key={session.id} className="history-item">
                <div>
                  <strong>{session.exam_board}</strong>
                  <span>{session.mode}</span>
                </div>
                <div>
                  <strong>{session.score ?? 0}</strong>
                  <span>{new Date(session.created_at).toLocaleString()}</span>
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
          <button className="secondary" onClick={loadSubscriptions}>Refresh</button>
        </div>
        <div className="history-list">
          {recentSubscriptions.length ? (
            recentSubscriptions.map((subscription) => (
              <article key={subscription.id} className="history-item">
                <div>
                  <strong>{subscription.email}</strong>
                  <span>{subscription.plan}</span>
                </div>
                <div>
                  <strong>{subscription.status}</strong>
                  <span>{new Date(subscription.created_at).toLocaleString()}</span>
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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
