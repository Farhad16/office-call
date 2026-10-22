import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-600.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import App from './App';
import { ConfirmProvider } from './components/ui/Confirm';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      <App />
      {/* Offset keeps toasts below the sticky header, so they never cover the page tabs. */}
      <Toaster
        position="top-center"
        offset={{ top: 72 }}
        mobileOffset={{ top: 68 }}
        richColors
        closeButton
        theme="system"
        toastOptions={{ duration: 4000 }}
      />
    </ConfirmProvider>
  </StrictMode>,
);
