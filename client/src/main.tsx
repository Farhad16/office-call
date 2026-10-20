import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-bengali/bengali-400.css';
import '@fontsource/noto-sans-bengali/bengali-600.css';
import '@fontsource/noto-sans-bengali/bengali-700.css';
import App from './App';
import { ReceiverPage } from './pages/ReceiverPage';
import { ConfirmProvider } from './components/ui/Confirm';
import './index.css';

// Two pages, no router needed: /receiver is the speaker page, everything else is the app.
const isReceiver = window.location.pathname.replace(/\/+$/, '') === '/receiver';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfirmProvider>
      {isReceiver ? <ReceiverPage /> : <App />}
      <Toaster position="top-center" richColors closeButton theme="system" toastOptions={{ duration: 4000 }} />
    </ConfirmProvider>
  </StrictMode>,
);
