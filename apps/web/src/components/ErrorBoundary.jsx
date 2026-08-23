import React from 'react';
import { RefreshCw } from 'lucide-react';

// Errors thrown by browser auto-translate tools (Google Translate, Edge Translate,
// Safari Translate, etc.) mutate the live DOM by wrapping text nodes in <font>/<span>
// elements. When React later tries to reconcile or remove those nodes it doesn't
// recognize anymore, it throws NotFoundError / DOMException on removeChild or
// insertBefore. These are harmless to app state but React 18 treats any render-phase
// throw as fatal and unmounts the tree, producing a blank page. We detect that
// specific class of error and recover instead of showing a blank screen.
function isTranslateDomError(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    message.includes('removeChild') ||
    message.includes('insertBefore') ||
    message.includes('NotFoundError') ||
    message.includes('The node to be removed is not a child of this node') ||
    message.includes('appendChild')
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, translateRelated: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, translateRelated: isTranslateDomError(error) };
  }

  componentDidCatch(error, info) {
    if (!isTranslateDomError(error)) {
      console.error('[ErrorBoundary] Caught error:', error, info);
    }
  }

  componentDidUpdate(_prevProps, prevState) {
    // Auto-recover immediately from translate-related DOM errors so the user
    // never actually sees a blank/error screen — just a silent re-render.
    if (this.state.hasError && this.state.translateRelated && !prevState.translateRelated) {
      this.setState({ hasError: false, translateRelated: false });
    }
  }

  render() {
    if (this.state.hasError && !this.state.translateRelated) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6 py-16">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-serif font-bold text-primary">
              Something went wrong
            </h1>
            <p className="text-muted-foreground">
              Please refresh the page to continue. If this keeps happening, try
              disabling automatic page translation in your browser.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-semibold hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
