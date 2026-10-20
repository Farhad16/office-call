import { useState } from 'react';
import { NameEntry } from './components/NameEntry';
import { loadName, saveName } from './lib/identity';
import { OrderPage } from './pages/OrderPage';
import styles from './App.module.css';

export default function App() {
  const [name, setName] = useState<string | null>(() => loadName());
  const [editingName, setEditingName] = useState(false);

  if (!name || editingName) {
    return (
      <main className={styles.page}>
        <NameEntry
          initialName={name ?? ''}
          onSubmit={(newName) => {
            saveName(newName);
            setName(newName);
            setEditingName(false);
          }}
          onCancel={name ? () => setEditingName(false) : undefined}
        />
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>☕ Office Call</span>
        <button className={styles.nameButton} onClick={() => setEditingName(true)} title="Change name">
          {name} ✎
        </button>
      </header>
      <OrderPage />
    </main>
  );
}
