import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import styles from './Confirm.module.css';

type Options = { title: string; description?: string; confirmLabel?: string; danger?: boolean };
type Ask = (options: Options) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(() => Promise.resolve(false));

/** `const confirm = useConfirm(); if (await confirm({ title: 'Delete?' })) …` */
export const useConfirm = () => useContext(ConfirmContext);

/** A styled confirm dialog (native <dialog>: focus trap, Esc to cancel, backdrop). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const [options, setOptions] = useState<Options | null>(null);

  const ask = useCallback<Ask>((opts) => {
    resolver.current?.(false);
    setOptions(opts);
    requestAnimationFrame(() => dialog.current?.showModal());
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function close(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    dialog.current?.close();
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <dialog
        ref={dialog}
        className={styles.dialog}
        onCancel={(e) => {
          e.preventDefault();
          close(false);
        }}
        onClick={(e) => e.target === dialog.current && close(false)} // click on backdrop
        aria-labelledby="confirm-title"
      >
        {options && (
          <div className={styles.body}>
            {options.danger && (
              <span className={styles.icon} aria-hidden>
                <TriangleAlert size={22} />
              </span>
            )}
            <h2 id="confirm-title">{options.title}</h2>
            {options.description && <p>{options.description}</p>}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button variant={options.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
