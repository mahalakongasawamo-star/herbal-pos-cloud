import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-mono/wght.css';
import './index.css';
import App from './App';
import { ConfirmProvider, ToastProvider } from './components/ui';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('POS crashed:', error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-xl font-extrabold text-ink">Something went wrong</h1>
          <p className="mt-2 text-[15px] text-ink-2">
            The screen stopped working, but saved sales and stock are kept in this browser. Reload to continue.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-sunken p-3 text-xs text-muted">{String(this.state.error?.message || this.state.error)}</pre>
          <button
            type="button"
            className="mt-4 h-11 rounded-[10px] bg-leaf px-4 font-semibold text-leaf-ink"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ToastProvider>
      <ConfirmProvider>
        <App />
      </ConfirmProvider>
    </ToastProvider>
  </ErrorBoundary>,
);
window.__posBooted = true;
