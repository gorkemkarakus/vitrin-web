import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/errorReporting'
import { logger } from '../lib/logger'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
  // Degisince (ör. rota) hata ekrani kapanir; hata yokken hicbir sey yeniden kurulmaz.
  resetKey?: string
}

interface State {
  failed: boolean
}

// Bir ekran cizilirken hata olursa beyaz ekran yerine bu gorunur. Rota
// degisince (resetKey) kendiliginden sifirlanir.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('Ekran hatasi', error, info.componentStack)
    reportError(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={styles.wrap} role="alert">
        <h1 className={styles.title}>Bu ekran açılamadı</h1>
        <p className={styles.text}>
          Beklenmeyen bir hata oldu ve kaydedildi. Verilerin güvende; tekrar deneyebilirsin.
        </p>
        <button type="button" className="btn-primary" onClick={() => this.setState({ failed: false })}>
          Tekrar dene
        </button>
        <button type="button" className={styles.home} onClick={() => window.location.assign('/')}>
          Ana sayfaya dön
        </button>
      </div>
    )
  }
}
