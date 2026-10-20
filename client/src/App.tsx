import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Coffee,
  ExternalLink,
  LayoutDashboard,
  LoaderCircle,
  Megaphone,
  RefreshCw,
  ShoppingBag,
  WifiOff,
} from 'lucide-react';
import type { User } from '../../shared/types.js';
import { NameEntry } from './components/NameEntry';
import { OrderPage } from './pages/OrderPage';
import { DashboardPage } from './pages/DashboardPage';
import { useRoute } from './lib/route';
import { clearName, loadName, saveName } from './lib/identity';
import { errorMessage, patchJson, postJson } from './lib/api';
import { Button } from './components/ui/Button';
import { AlertToggle } from './components/AlertToggle';
import styles from './App.module.css';

type Session =
  | { status: 'signed-out' }
  | { status: 'loading'; name: string }
  | { status: 'error'; name: string; error: string }
  | { status: 'ready'; user: User };

async function fetchUser(name: string, isStaff = false): Promise<User> {
  const user = await postJson<User>('/api/users', { name, isStaff });
  saveName(user.name);
  return user;
}

function initialSession(): Session {
  const name = loadName();
  return name ? { status: 'loading', name } : { status: 'signed-out' };
}

export default function App() {
  const [session, setSession] = useState<Session>(initialSession);
  const [editingName, setEditingName] = useState(false);
  const [route, navigate] = useRoute();

  /** Finds or creates the user on the server. Returns an error message or null. */
  async function signIn(name: string, isStaff: boolean): Promise<string | null> {
    try {
      const user = await fetchUser(name, isStaff);
      setSession({ status: 'ready', user });
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  // Sign in with the name saved on this device.
  const savedName = session.status === 'loading' ? session.name : null;
  useEffect(() => {
    if (!savedName) return;
    let cancelled = false;
    fetchUser(savedName)
      .then((user) => !cancelled && setSession({ status: 'ready', user }))
      .catch((err) => !cancelled && setSession({ status: 'error', name: savedName, error: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [savedName]);

  // Receivers work on the dashboard only: send them there from the order page.
  const isReceiver = session.status === 'ready' && session.user.isStaff;
  useEffect(() => {
    if (isReceiver && route === 'order') navigate('dashboard', true);
  }, [isReceiver, route, navigate]);
  const showDashboard = useCallback(() => navigate('dashboard'), [navigate]);

  function switchUser() {
    clearName();
    setEditingName(false);
    setSession({ status: 'signed-out' });
  }

  if (session.status === 'signed-out') {
    return (
      <main className={styles.auth}>
        <NameEntry onSubmit={signIn} />
      </main>
    );
  }

  if (session.status !== 'ready') {
    return (
      <main className={styles.auth}>
        <div className={`${styles.stateCard} fade-in`}>
          {session.status === 'loading' ? (
            <>
              <LoaderCircle className="spin" size={28} aria-hidden />
              <p>Connecting to the office server…</p>
            </>
          ) : (
            <>
              <span className={styles.stateIcon} aria-hidden>
                <WifiOff size={24} />
              </span>
              <h2>Can’t reach the server</h2>
              <p className={styles.muted}>{session.error}</p>
              <Button
                variant="primary"
                icon={<RefreshCw size={16} />}
                onClick={() => setSession({ status: 'loading', name: session.name })}
              >
                Try again
              </Button>
              <Button variant="ghost" size="sm" onClick={switchUser}>
                Use a different name
              </Button>
            </>
          )}
        </div>
      </main>
    );
  }

  const { user } = session;

  if (editingName) {
    return (
      <main className={styles.auth}>
        <NameEntry
          initialName={user.name}
          initialStaff={user.isStaff}
          onSubmit={async (name, isStaff) => {
            try {
              const updated = await patchJson<User>(`/api/users/${user.id}`, { name, isStaff });
              saveName(updated.name);
              setSession({ status: 'ready', user: updated });
              setEditingName(false);
              toast.success('Profile saved');
              return null;
            } catch (err) {
              return errorMessage(err);
            }
          }}
          onCancel={() => setEditingName(false)}
          onSwitchUser={switchUser}
        />
      </main>
    );
  }

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>
            <span className={styles.logo} aria-hidden>
              <Coffee size={18} strokeWidth={2.4} />
            </span>
            Office Call
          </span>
          <nav className={styles.tabs} aria-label="Pages">
            {user.isStaff ? (
              <>
                <a href="/dashboard" aria-current="page" onClick={(e) => e.preventDefault()}>
                  <LayoutDashboard size={16} aria-hidden />
                  <span>Dashboard</span>
                </a>
                {/* New tab, so the dashboard keeps running here. */}
                <a href="/receiver" target="_blank" rel="noopener" title="Open the speaker page in a new tab">
                  <Megaphone size={16} aria-hidden />
                  <span>Speaker</span>
                  <ExternalLink size={12} aria-hidden />
                </a>
              </>
            ) : (
              (['order', 'dashboard'] as const).map((r) => (
                <a
                  key={r}
                  href={r === 'order' ? '/' : '/dashboard'}
                  aria-current={route === r ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(r);
                  }}
                >
                  {r === 'order' ? <ShoppingBag size={16} aria-hidden /> : <LayoutDashboard size={16} aria-hidden />}
                  <span>{r === 'order' ? 'Order' : 'Dashboard'}</span>
                </a>
              ))
            )}
          </nav>
          {user.isStaff && <AlertToggle user={user} onView={showDashboard} />}
          <button className={styles.user} onClick={() => setEditingName(true)} title="Profile: change name or role">
            <span className={styles.avatar} aria-hidden>
              {initials}
            </span>
            <span className={styles.userText}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.isStaff ? 'Receiver' : 'Sender'}</span>
            </span>
          </button>
        </div>
      </header>
      <main className={styles.page}>
        {/* The order page stays mounted (hidden) so a half-finished selection survives switching tabs.
            key: a different user gets a fresh page (their own presets). */}
        {!user.isStaff && (
          <div hidden={route !== 'order'}>
            <OrderPage key={user.id} user={user} />
          </div>
        )}
        {(route === 'dashboard' || user.isStaff) && <DashboardPage user={user} />}
      </main>
    </>
  );
}
