import React from 'react'
import { APP_NAME } from '../lib/constants'

class ErrorBoundaryController extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null,
      hasError: false,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      error,
      hasError: true,
    }
  }

  componentDidCatch(error, errorInfo) {
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.props.onReset?.()
    // Reset the boundary state so the app can remount without a full page reload.
    // If the same render error persists, React will catch it again and show the fallback.
    this.setState({ error: null, hasError: false })
  }

  renderFallback(error) {
    const fallback = this.props.fallback

    if (typeof fallback === 'function') {
      return fallback({ error, resetError: this.handleRetry })
    }

    if (fallback) {
      return fallback
    }

    return (
      <div className="app-shell">
        <section className="panel" role="alert" aria-live="assertive">
          <h1>{APP_NAME} hit a rendering problem</h1>
          <p className="error">
            {error?.message || 'An unexpected error occurred while rendering the app.'}
          </p>
          {error?.stack && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? (
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                margin: '12px 0 0',
                color: 'var(--color-text-secondary)',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
              }}
            >
              {error.stack}
            </pre>
          ) : null}
          <button className="primary" type="button" onClick={this.handleRetry}>
            Reload app
          </button>
        </section>
      </div>
    )
  }

  render() {
    if (this.state.hasError) {
      return this.renderFallback(this.state.error)
    }

    return this.props.children
  }
}

export default function ErrorBoundary(props) {
  return <ErrorBoundaryController {...props} />
}
