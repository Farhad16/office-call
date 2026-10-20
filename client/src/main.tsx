import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ReceiverPage } from './pages/ReceiverPage';
import './index.css';

// Two pages, no router needed: /receiver is the speaker page, everything else is the app.
const isReceiver = window.location.pathname.replace(/\/+$/, '') === '/receiver';

createRoot(document.getElementById('root')!).render(<StrictMode>{isReceiver ? <ReceiverPage /> : <App />}</StrictMode>);
