import { Component, type ReactNode, type ErrorInfo } from 'react';

/** Keep an unexpected render failure visible and recoverable instead of a blank page. */
export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Nxsoos interface failed:', error, info.componentStack);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="loading-screen" role="alert">
          <span className="brand-mark">n.</span>
          <h1>The interface encountered a problem.</h1>
          <p>Reload to reconnect. Saved conversations remain in local storage.</p>
          <button className="primary" onClick={() => location.reload()}>
            Reload company
          </button>
        </main>
      );
    return this.props.children;
  }
}
