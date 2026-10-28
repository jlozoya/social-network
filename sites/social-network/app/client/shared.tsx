'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { siteOrigin, siteUrl } from './origin';
export type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  followState: string | null;
  email?: string;
  role?: string;
  chatgptLinked?: boolean;
};
export type Person = Pick<Profile, 'id' | 'username' | 'displayName'> & {
  avatarUrl?: string | null;
};
export type Post = {
  id: string;
  body: string;
  audience: string;
  author: Person;
  media: { id: string; url: string }[];
  reactions: Record<string, number>;
  reactionCount: number;
  commentCount: number;
  myReaction: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Comment = { id: string; body: string; createdAt: string; author: Person };
export type Conversation = {
  id: string;
  lastMessage: string | null;
  lastAt: string | null;
  unread: number;
  peers: Person[];
};
export type Message = {
  id: string;
  body: string;
  clientId: string;
  createdAt: string;
  author: Person | null;
};
export type Page<T> = {
  data: T[];
  nextCursor: string | null;
  afterCursor?: string | null;
  hasMore?: boolean;
};
export type ReportTarget = {
  targetType: 'post' | 'comment' | 'user' | 'message';
  targetId: string;
};
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const binary = body instanceof Blob;
  const response = await fetch(siteUrl(path), {
    method,
    credentials: 'include',
    headers:
      body === undefined
        ? undefined
        : { 'content-type': binary ? 'image/webp' : 'application/json' },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const raw = await response.text();
  let result: { error?: string };
  try {
    result = JSON.parse(raw, (key, value) =>
      siteOrigin &&
      ['url', 'avatarUrl', 'coverUrl'].includes(key) &&
      typeof value === 'string' &&
      value.startsWith('/media/')
        ? siteUrl(value)
        : value,
    );
  } catch {
    throw new ClientError(
      'El servicio no está disponible. Inténtalo de nuevo en unos minutos.',
      response.status,
    );
  }
  if (!response.ok)
    throw new ClientError(result.error ?? 'No se pudo completar la operación.', response.status);
  return result as T;
}
type Context = {
  user: Profile | null;
  sync: number;
  notify: (message: string) => void;
  refreshUser: () => Promise<void>;
  refresh: () => void;
  openAuth: () => void;
  openProfile: (id: string) => void;
  openChat: (id: string) => void;
  openReport: (target: ReportTarget) => void;
};
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function useTask() {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    task: async (action: () => Promise<void>) => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
      } catch (error) {
        notify(error instanceof Error ? error.message : 'No se pudo completar la operación.');
      } finally {
        setBusy(false);
      }
    },
  };
}
export function useResource<T>(path: string | null, version = 0) {
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError('');
    api<T>(path)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, version, retry]);
  return { data, setData, loading, error, reload: () => setRetry((v) => v + 1) };
}
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
export function time(value: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
export async function photoBlob(file: File): Promise<Blob> {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error('Selecciona una foto JPG, PNG o WebP de menos de 12 MB.');
  const image = await createImageBitmap(file),
    ratio = Math.min(1, 1600 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * ratio));
  canvas.height = Math.max(1, Math.round(image.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) {
    image.close();
    throw new Error('No se pudo preparar la foto.');
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo preparar la foto.'))),
      'image/webp',
      0.84,
    ),
  );
}
export async function upload(file: File) {
  return api<{ id: string; url: string }>('/api/media', 'POST', await photoBlob(file));
}
