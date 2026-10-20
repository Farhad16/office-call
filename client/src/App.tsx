import { useEffect, useState } from 'react';
import type { User } from '../../shared/types.js';
import { NameEntry } from './components/NameEntry';
import { OrderPage } from './pages/OrderPage';
import { clearName, loadName, saveName } from './lib/identity';
import { errorMessage, patchJson, postJson } from './lib/api';
import styles from './App.module.css';

type Session =
  | { status: 'signed-out' }
  | { status: 'loading'; name: string }
  | { status: 'error'; name: string; error: string }
  | { status: 'ready'; user: User };

async function fetchUser(name: string): Promise<User> {
  const user = await postJson<User>('/api/users', { name });
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

  /** Finds or creates the user on the server. Returns an error message or null. */
  async function signIn(name: string): Promise<string | null> {
    try {
      const user = await fetchUser(name);
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

  function switchUser() {
    clearName();
    setEditingName(false);
    setSession({ status: 'signed-out' });
  }

  if (session.status === 'signed-out') {
    return (
      <main className={styles.page}>
        <NameEntry onSubmit={signIn} />
      </main>
    );
  }

  if (session.status !== 'ready') {
    return (
      <main className={styles.page}>
        <div className={styles.center}>
          {session.status === 'loading' ? (
            <p>Connecting to the office server…</p>
          ) : (
            <>
              <p className={styles.error}>{session.error}</p>
              <button className={styles.button} onClick={() => setSession({ status: 'loading', name: session.name })}>
                Try again
              </button>
              <button className={styles.link} onClick={switchUser}>
                Use a different name
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  const { user } = session;

  if (editingName) {
    return (
      <main className={styles.page}>
        <NameEntry
          initialName={user.name}
          onSubmit={async (name) => {
            try {
              const updated = await patchJson<User>(`/api/users/${user.id}`, { name });
              saveName(updated.name);
              setSession({ status: 'ready', user: updated });
              setEditingName(false);
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>☕ Office Call</span>
        <button className={styles.nameButton} onClick={() => setEditingName(true)} title="Change name">
          {user.name} ✎
        </button>
      </header>
      {/* key: a different user gets a fresh page (their own presets) */}
      <OrderPage key={user.id} user={user} />
    </main>
  );
}
