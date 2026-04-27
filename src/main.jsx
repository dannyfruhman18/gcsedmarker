import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createClient } from '@supabase/supabase-js'
import Tesseract from 'tesseract.js'
import './styles.css'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://kgygnazvnvjgtypaokug.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_OXGxr2KQxcuNgrVs_UQrCw_dX8O72XM'
const STRIPE_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PAYMENT_LINK ?? ''

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

const BOARD_LINKS = {
  AQA: {
    label: 'AQA mark schemes',
    href: 'https://www.aqa.org.uk/find-past-papers-and-mark-schemes',
  },
  Edexcel: {
    label: 'Pearson Edexcel mark schemes',
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

function scoreEssay(answer, topBand) {
  const text = answer.trim()
  const length = text.split(/\s+/).filter(Boolean).length
  const ao1 = []
  const ao2 = []
  const ao3 = []
  let score = 0

  if (!text) {
    ao1.push('No answer entered yet — add factual detail and examples.')
    ao2.push('Explain how the evidence matters.')
    ao3.push('Add a clear judgement or comparison to reach stronger AO3 levels.')
    return {
      maxMarks: topBand ? 4 : 3,
      score: 0,
      ao1,
      ao2,
      ao3,
      summary: topBand
        ? 'Grade 9 / Top Band focus: make every paragraph precise, conceptual, and evaluative.'
        : 'Focus on specific knowledge, explanation, and a clear conclusion.',
    }
  }

  if (length >= 80) {
    ao1.push('Clear subject knowledge shown with enough developed detail to reward.')
    score += 1
  } else {
    ao1.push('Add more specific facts, quotes, examples, or terminology to secure AO1 marks.')
  }

  if (/\b(because|therefore|this shows|consequently|as a result|proves|suggests)\b/i.test(text)) {
    ao2.push('You are explaining ideas and linking evidence to your point, which supports AO2.')
    score += 1
  } else {
    ao2.push('Develop analysis by explaining how and why the evidence matters.')
  }

  if (/\b(however|although|overall|on the other hand|ultimately|to a large extent|judgement)\b/i.test(text)) {
    ao3.push('There is some evaluation / judgement, which helps the top bands.')
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

function scoreMathsScience(question, answer, topBand) {
  const q = question.trim()
  const a = answer.trim()
  const lines = a.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const hasSteps = lines.length >= 2
  const hasEquation = /\d+\s*[+\-*/×÷=]\s*\d+/.test(a) || /\b[a-zA-Z]+\s*=\s*\d/.test(a)
  const hasMethodWords = /\b(substitute|calculate|expand|factorise|simplify|solve|arrange|rearrange|formula|working)\b/i.test(a)
  const hasUnits = /\b(cm|mm|m|km|kg|g|N|J|W|s|ms|°C|mol|dm3|cm3)\b/i.test(a)
  const hasConclusion = /\b(therefore|so|hence|thus|final answer|answer is|in conclusion)\b/i.test(a)
  const hasCheck = /\b(check|verify|sanity|reasonable)\b/i.test(a)

  const extra = []
  let score = 0

  if (!a) {
    extra.push('Enter your working or answer to get method-mark feedback.')
    return {
      maxMarks: topBand ? 5 : 4,
      score: 0,
      ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
      ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
      ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
      summary: topBand
        ? 'Top Band mode: show a full chain of reasoning, label substitutions, and check the answer against sensible values.'
        : 'Method marks focus on visible working and correct process.',
      extra,
    }
  }

  if (hasSteps) {
    score += 1
    extra.push('You show more than one line of working, which is good evidence for method marks.')
  } else {
    extra.push('Show the steps you used, not just the final answer.')
  }

  if (hasEquation || hasMethodWords) {
    score += 1
    extra.push('Your response includes a recognisable calculation method or working language.')
  } else {
    extra.push('Use equations, substitutions, or method language to earn method marks.')
  }

  if (hasUnits) {
    score += 1
    extra.push('You are including units, which helps a science or maths response look complete.')
  } else {
    extra.push('Include units where relevant to secure the final mark.')
  }

  if (hasConclusion) {
    score += 1
    extra.push('You are moving from working to a conclusion, which helps the final-mark award.')
  } else {
    extra.push('Finish with a clear final answer statement.')
  }

  if (topBand) {
    if (hasCheck || /\b(reasonable|estimate|compare)\b/i.test(q + ' ' + a)) {
      score += 1
      extra.push('Top Band mode: you have a checking / evaluation step as well.')
    } else {
      extra.push('Top Band mode: check the answer against a sensible estimate or expected pattern.')
    }
  }

  return {
    maxMarks: topBand ? 5 : 4,
    score: Math.min(score, topBand ? 5 : 4),
    ao1: ['Method marks are awarded for the steps, working, and correct structure you show.'],
    ao2: ['Explain each step clearly, especially when moving from formula to substitution to answer.'],
    ao3: ['If this is a science question, include the key scientific idea, correct units, and any required conclusion.'],
    summary: topBand
      ? 'Top Band mode: maximise the working trail and annotate every step.'
      : 'Method marks focus on visible working and correct process.',
    extra,
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
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrError, setOcrError] = useState('')
  const [markResult, setMarkResult] = useState(null)
  const [recentSessions, setRecentSessions] = useState([])
  const [recentSubscriptions, setRecentSubscriptions] = useState([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [saving, setSaving] = useState(false)
  const [subscriptionEmail, setSubscriptionEmail] = useState('')
  const [subscriptionPlan, setSubscriptionPlan] = useState('top-band')
  const [subscriptionResult, setSubscriptionResult] = useState('')
  const [submittingSubscription, setSubmittingSubscription] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authError, setAuthError] = useState('')
  const [session, setSession] = useState(null)
  const [authBusy, setAuthBusy] = useState(false)
  const boardLink = useMemo(() => BOARD_LINKS[board], [board])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      setSession(data.session ?? null)
      setAuthEmail(data.session?.user?.email ?? '')
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthEmail(nextSession?.user?.email ?? '')
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    void loadSessions()
    void loadSubscriptions()
  }, [session])

  async function loadSessions() {
    if (!session?.user?.id) {
      setRecentSessions([])
      return
    }
    setLoadingSessions(true)
    try {
      const { data, error } = await supabase
        .from('marking_sessions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      setRecentSessions(data ?? [])
    } catch (error) {
      console.error(error)
      setAuthError(`Supabase load failed: ${error?.message || String(error)}`)
    } finally {
      setLoadingSessions(false)
    }
  }

  async function loadSubscriptions() {
    if (!session?.user?.id) {
      setRecentSubscriptions([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      setRecentSubscriptions(data ?? [])
    } catch (error) {
      console.error(error)
      setAuthError(`Subscription load failed: ${error?.message || String(error)}`)
    }
  }

  async function handleFileChange(file) {
    if (!file) return
    setUploadName(file.name)
    setOcrError('')
    setOcrStatus('Reading image...')
    if (uploadPreview) URL.revokeObjectURL(uploadPreview)
    setUploadPreview(URL.createObjectURL(file))

    try {
      const result = await Tesseract.recognize(file, 'eng')
      const text = result?.data?.text?.trim() ?? ''
      if (text) {
        setQuestionText((current) => (current.trim() ? current : text))
        setOcrStatus('OCR text extracted from the upload.')
      } else {
        setOcrStatus('No readable text found in the image yet.')
      }
    } catch (error) {
      setOcrError(`OCR failed: ${error?.message || String(error)}`)
      setOcrStatus('')
    }
  }

  async function handleMark() {
    if (!session?.user?.id) {
      setAuthMessage('Please sign in first so GCSEmarker can save your work securely.')
      return
    }

    const analyzer = mode === 'essay' ? scoreEssay : scoreMathsScience
    const result = analyzer(questionText, answerText, topBand)
    setMarkResult(result)
    setSaving(true)

    try {
      const { error } = await supabase.from('marking_sessions').insert({
        user_id: session.user.id,
        exam_board: board,
        mode,
        question_text: questionText,
        answer_text: answerText,
        upload_name: uploadName,
        score: result.score,
        feedback: result,
      })
      if (error) throw error
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

  async function handleSendMagicLink() {
    const email = authEmail.trim()
    if (!email) {
      setAuthError('Enter an email address first.')
      return
    }
    setAuthBusy(true)
    setAuthError('')
    setAuthMessage('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error
      setAuthMessage('Check your email for the sign-in link.')
    } catch (error) {
      setAuthError(`Sign-in failed: ${error?.message || String(error)}`)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSignOut() {
    setAuthBusy(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setSession(null)
      setRecentSessions([])
      setRecentSubscriptions([])
      setAuthMessage('Signed out.')
    } catch (error) {
      setAuthError(`Sign-out failed: ${error?.message || String(error)}`)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleSubscription() {
    const email = subscriptionEmail.trim()
    if (!email) {
      setSubscriptionResult('Add an email address first.')
      return
    }

    if (!session?.user?.id) {
      setSubscriptionResult('Sign in first so the subscription can be saved to your account.')
      return
    }

    setSubmittingSubscription(true)
    try {
      if (STRIPE_PAYMENT_LINK) {
        window.open(STRIPE_PAYMENT_LINK, '_blank', 'noreferrer')
      }

      const { error } = await supabase.from('subscriptions').insert({
        user_id: session.user.id,
        email,
        plan: subscriptionPlan,
        status: STRIPE_PAYMENT_LINK ? 'checkout_opened' : 'active',
        provider: STRIPE_PAYMENT_LINK ? 'stripe_link' : 'supabase_demo',
        notes: STRIPE_PAYMENT_LINK ? 'User sent to Stripe checkout link.' : 'No Stripe link configured yet.',
      })
      if (error) throw error

      setSubscriptionResult(
        STRIPE_PAYMENT_LINK
          ? 'Stripe checkout opened and subscription record saved in Supabase.'
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
        <div className="brand-row">
          <img src="/logo.svg" alt="GCSEmarker logo" className="brand-logo" />
          <div>
            <p className="eyebrow">GCSEmarker</p>
            <h1>Upload a question, choose the board, and get mark-style feedback fast.</h1>
          </div>
        </div>
        <p className="lede">
          Built for essays, maths, and science. Includes AO1 / AO2 / AO3 prompts, method marks,
          official mark-scheme links, a Top Band mode for grade 9 refinement, subscription-ready
          access, real OCR on uploads, and a Capacitor-ready path for iOS packaging.
        </p>
        <div className="hero-actions">
          <a className="chip-link" href={boardLink.href} target="_blank" rel="noreferrer">
            {boardLink.label}
          </a>
          <a className="chip-link" href="https://capacitorjs.com/" target="_blank" rel="noreferrer">
            Capacitor wrapper ready
          </a>
        </div>
        <div className="stat-row">
          <div className="stat"><span>Exam board</span><strong>{board}</strong></div>
          <div className="stat"><span>Mode</span><strong>{modeOptions.find((item) => item.id === mode)?.label}</strong></div>
          <div className="stat"><span>Top Band</span><strong>{topBand ? 'On' : 'Off'}</strong></div>
          <div className="stat"><span>Auth</span><strong>{session?.user?.email ? 'Signed in' : 'Waiting'}</strong></div>
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
            <input id="upload" type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files?.[0])} />
            <label htmlFor="upload">
              <strong>Upload a scan or photo of the question</strong>
              <span>JPG, PNG, or camera image</span>
            </label>
            {uploadName ? <p className="file-name">Selected: {uploadName}</p> : <p className="file-name">No file selected yet.</p>}
            {ocrStatus ? <p className="file-name">{ocrStatus}</p> : null}
            {ocrError ? <p className="error">{ocrError}</p> : null}
            {uploadPreview ? <img className="preview" src={uploadPreview} alt="Uploaded question preview" /> : null}
          </div>

          <div className="textareas">
            <label>
              Question or prompt
              <textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Paste the question text here or let OCR fill it in." rows={7} />
            </label>
            <label>
              Student answer / essay / working
              <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="Paste the answer, essay, or working here." rows={10} />
            </label>
          </div>

          <button className="primary" onClick={handleMark} disabled={saving}>
            {saving ? 'Saving...' : session?.user?.id ? 'Mark answer' : 'Sign in to save and mark'}
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Feedback</h2>
            <span className="muted">AO1 / AO2 / AO3 + method marks</span>
          </div>
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
          <h2>Account and subscription</h2>
          <span className="muted">Supabase auth + Stripe-ready flow</span>
        </div>
        <div className="subscription-grid">
          <div className="subscription-form">
            <label>
              Email for sign in / subscription
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="parent@example.com" />
            </label>
            <div className="hero-actions">
              <button className="secondary" onClick={handleSendMagicLink} disabled={authBusy}>
                {authBusy ? 'Sending...' : 'Send magic link'}
              </button>
              <button className="secondary" onClick={handleSignOut} disabled={authBusy || !session}>
                Sign out
              </button>
            </div>
            {authMessage ? <p className="result-note">{authMessage}</p> : null}
            {authError ? <p className="error">{authError}</p> : null}
            <label>
              Subscriber email
              <input type="email" value={subscriptionEmail} onChange={(e) => setSubscriptionEmail(e.target.value)} placeholder="subscriber@example.com" />
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
            <button className="primary" onClick={handleSubscription} disabled={submittingSubscription || !session}>
              {submittingSubscription ? 'Processing...' : STRIPE_PAYMENT_LINK ? 'Open Stripe checkout' : 'Save subscription'}
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
          <button className="secondary" onClick={loadSessions} disabled={loadingSessions || !session}>
            {loadingSessions ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <div className="history-list">
          {recentSessions.length ? (
            recentSessions.map((sessionRow) => (
              <article key={sessionRow.id} className="history-item">
                <div>
                  <strong>{sessionRow.exam_board}</strong>
                  <span>{sessionRow.mode}</span>
                </div>
                <div>
                  <strong>{sessionRow.score ?? 0}</strong>
                  <span>{new Date(sessionRow.created_at).toLocaleString()}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="muted">No saved sessions yet. Sign in and mark something to populate this list.</p>
          )}
        </div>
      </section>

      <section className="panel history-panel">
        <div className="panel-header">
          <h2>Recent subscriptions</h2>
          <button className="secondary" onClick={loadSubscriptions} disabled={!session}>
            Refresh
          </button>
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
            <p className="muted">No subscriptions saved yet. Sign in and add one to populate this list.</p>
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
