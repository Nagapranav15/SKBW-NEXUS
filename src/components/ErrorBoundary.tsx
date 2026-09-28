import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    const msg = error?.message || String(error || '');
    const isChunkOrNetworkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Expected a JavaScript-or-Wasm module script') ||
      msg.includes('MIME type of "text/html"') ||
      msg.includes('Network Error');

    if (isChunkOrNetworkError) {
      const lastReload = parseInt(sessionStorage.getItem('chunk_eb_reload') || '0', 10);
      const now = Date.now();
      if (now - lastReload > 10000) {
        sessionStorage.setItem('chunk_eb_reload', String(now));
        window.location.reload();
      }
    }
  }

  private handleReload = () => {
    sessionStorage.removeItem('chunk_eb_reload');
    sessionStorage.removeItem('chunk_failed_refreshed');
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || '';
      const isChunk =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Expected a JavaScript-or-Wasm module script') ||
        msg.includes('MIME type of "text/html"');

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-gray-150 p-6 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-base font-black text-gray-900">
                {isChunk ? 'New Update Available' : 'Connection Interrupted'}
              </h3>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                {isChunk
                  ? 'A newer version of the ERP has been published. Please refresh to load the latest modules and improvements.'
                  : 'A network or module loading issue occurred while retrieving the requested screen. Click below to reconnect.'}
              </p>
            </div>

            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-98 text-white rounded-xl font-bold text-xs shadow-sm transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Refresh Application</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
