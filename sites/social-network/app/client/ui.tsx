'use client';
import { Loader2, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Person } from './types';
export function Avatar({
  person,
  size = 'normal',
}: {
  person: Pick<Person, 'displayName' | 'avatarUrl'>;
  size?: 'small' | 'normal' | 'large';
}) {
  return (
    <span className={`avatar ${size}`} aria-hidden="true">
      {person.avatarUrl ? (
        <img src={person.avatarUrl} alt="" />
      ) : (
        person.displayName.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
export function Spinner() {
  return <Loader2 className="spin" size={18} aria-label="Cargando" />;
}
export function InlineError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="inline-error" role="alert">
      <p>{message}</p>
      <button className="text-button" onClick={retry}>
        Volver a intentar
      </button>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-dot">✳</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const dialog = ref.current;
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Cerrar" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
