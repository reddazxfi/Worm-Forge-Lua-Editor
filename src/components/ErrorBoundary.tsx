// Last line of defence for a render error.
//
// WHY THIS EXISTS
// Without a boundary, React unmounts the whole tree when a component throws.
// The window stays open with an empty document -- the "white screen" report --
// and a packaged build has no console to read. This keeps a way back: reload,
// reset the restored session, or copy the stack.
//
// The styles are inline on purpose. The screen must be readable even if the
// failure is the stylesheet itself, so it cannot depend on Tailwind.
import React from 'react';
import { recordCrash } from '../services/crash';
import { resetPersistedSession } from '../services/session';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  copied: boolean;
}

const C = {
  page: '#121417',
  card: '#171b21',
  border: '#2b333e',
  text: '#dbe4ef',
  muted: '#93a6bd',
  faint: '#66788c',
  amber: '#f59e0b',
  rose: '#fb7185',
  mono: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

const button: React.CSSProperties = {
  border: `1px solid ${C.border}`,
  background: '#212730',
  color: C.text,
  borderRadius: 6,
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: C.sans,
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Persist first: the next launch (and the index.html watchdog) can then show
    // what happened even if this screen is never seen.
    recordCrash('react', error, info.componentStack ?? undefined);
    console.error('[WormForge] render error', error, info);
  }

  private reload = () => {
    try {
      window.location.reload();
    } catch {
      // If reload itself fails there is nothing left to try.
    }
  };

  private resetAndReload = () => {
    resetPersistedSession();
    this.reload();
  };

  private copyDetails = async () => {
    const text = this.detailsText();
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 1500);
    } catch {
      // Clipboard permission is not worth a second error screen.
    }
  };

  private detailsText = () => {
    const { error, componentStack } = this.state;
    return [
      error ? `${error.name}: ${error.message}` : 'Unknown error',
      error?.stack ?? '',
      componentStack ? `Component stack:${componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          overflow: 'auto',
          background: C.page,
          color: C.text,
          fontFamily: C.sans,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '8vh 24px 24px',
        }}
      >
        <div
          style={{
            width: 'min(760px, 100%)',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: '22px 24px',
            boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: C.rose,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            WormForge stopped rendering
          </div>
          <h1 style={{ fontSize: 19, fontWeight: 700, margin: '0 0 8px' }}>
            The editor hit an error
          </h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: C.muted }}>
            Your mod files on disk are untouched. Reloading keeps everything as it was. If this
            started after opening a folder, resetting the restored session clears the remembered
            folder, open tabs and buffers &mdash; it does not delete files and does not touch your
            settings or custom verbs.
          </p>

          <div
            style={{
              fontFamily: C.mono,
              fontSize: 12,
              lineHeight: 1.5,
              background: '#10141a',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              padding: '10px 12px',
              color: C.amber,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: 14,
            }}
          >
            {error.name}: {error.message}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            <button type="button" style={button} onClick={this.reload}>
              Reload
            </button>
            <button
              type="button"
              style={{ ...button, background: '#3a2a12', borderColor: '#7a5218', color: '#fbbf24' }}
              onClick={this.resetAndReload}
            >
              Reset session &amp; reload
            </button>
            <button type="button" style={button} onClick={this.copyDetails}>
              {this.state.copied ? 'Copied' : 'Copy details'}
            </button>
          </div>

          <details>
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: C.faint,
                userSelect: 'none',
              }}
            >
              Technical details
            </summary>
            <pre
              style={{
                margin: '10px 0 0',
                fontFamily: C.mono,
                fontSize: 11,
                lineHeight: 1.45,
                color: C.muted,
                background: '#10141a',
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                padding: 10,
                maxHeight: 280,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.detailsText()}
            </pre>
          </details>

          <p style={{ margin: '14px 0 0', fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
            The same details were saved for the next launch. If this keeps happening, copy them
            into a bug report.
          </p>
        </div>
      </div>
    );
  }
}
