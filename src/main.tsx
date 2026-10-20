import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { recordCrash } from './services/crash';
import './index.css';

// Errors that never reach React (a rejected promise, a failed dynamic import)
// still deserve a breadcrumb: the boot watchdog and the next launch read this,
// and a packaged build has no console. Component errors are recorded by the
// boundary itself.
window.addEventListener('error', (event) => {
  recordCrash('error', event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  recordCrash('unhandledrejection', event.reason);
});

const container = document.getElementById('root');
if (!container) {
  // Should be impossible (index.html owns it), but throwing here would be a
  // white screen with no explanation. The watchdog will show the panel.
  recordCrash('boot', new Error('index.html has no #root element'));
} else {
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
