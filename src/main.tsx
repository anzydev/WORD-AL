import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('WORD-AL interface failed to render', { error, componentStack: info.componentStack }); }
  render() {
    if (this.state.failed) return <main className="content narrow empty-state" role="alert"><h1>Something went wrong</h1><p>Your game state may still be available. Reload the page to try again.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload WORD-AL</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>,
);
