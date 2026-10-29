'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, ArrowLeft, Flag, Trash2 } from 'lucide-react';
import {
  api,
  Avatar,
  Empty,
  InlineError,
  Spinner,
  time,
  useApp,
  useResource,
  useTask,
  type Conversation,
  type Page,
  type Message,
} from './shared';

export default function Chat({
  conversationId,
  select,
}: {
  conversationId: string | null;
  select: (id: string | null) => void;
}) {
  const { user, sync, openProfile } = useApp(),
    resource = useResource<{ data: Conversation[] }>(user ? '/api/conversations' : null, sync);
  if (!user)
    return (
      <div className="card">
        <Empty title="Mensajes">Entra en tu cuenta para enviar mensajes.</Empty>
      </div>
    );
  const selected = resource.data?.data.find((c) => c.id === conversationId);
  return (
    <div className={`card chat-layout ${conversationId ? 'chat-selected' : ''}`}>
      <aside className="inbox">
        <div className="inbox-heading">
          <span className="eyebrow">CONVERSACIONES</span>
          <h1>Mensajes</h1>
        </div>
        {resource.error && <InlineError message={resource.error} retry={resource.reload} />}
        <div className="conversation-list">
          {resource.data?.data.map((conversation) => (
            <button
              key={conversation.id}
              className={`conversation ${conversationId === conversation.id ? 'selected' : ''}`}
              onClick={() => select(conversation.id)}
            >
              <Avatar person={conversation.peers[0] ?? { displayName: 'Usuario eliminado' }} />
              <span>
                <strong>{conversation.peers[0]?.displayName ?? 'Usuario eliminado'}</strong>
                <span className="message-preview">
                  {conversation.lastMessage ?? 'Sin mensajes'}
                </span>
              </span>
              {conversation.unread > 0 && <span className="unread">{conversation.unread}</span>}
            </button>
          ))}
          {resource.data && !resource.data.data.length && (
            <Empty title="Todavía no hay conversaciones">
              Visita un perfil y pulsa Conversar para empezar.
            </Empty>
          )}
        </div>
      </aside>
      {conversationId ? (
        <div className="chat-main">
          <div className="chat-heading">
            <button
              className="icon-button mobile-only"
              aria-label="Volver a conversaciones"
              onClick={() => select(null)}
            >
              <ArrowLeft size={20} />
            </button>
            <button
              className="person-link"
              onClick={() => selected?.peers[0] && openProfile(selected.peers[0].id)}
            >
              <Avatar person={selected?.peers[0] ?? { displayName: 'Conversación' }} />
              <span>
                <strong>{selected?.peers[0]?.displayName ?? 'Conversación'}</strong>
                <span className="post-date">Mensaje directo</span>
              </span>
            </button>
          </div>
          <Messages key={conversationId} conversationId={conversationId} />
        </div>
      ) : (
        <div className="chat-placeholder">
          <MessageCircle size={42} strokeWidth={1} />
          <h2>Selecciona una conversación</h2>
          <p>Elige una conversación para continuar.</p>
        </div>
      )}
    </div>
  );
}
function Messages({ conversationId }: { conversationId: string }) {
  const { user, sync, openReport, refresh, notify } = useApp(),
    { busy, task } = useTask(),
    resource = useResource<Page<Message>>(`/api/conversations/${conversationId}/messages`, sync);
  const [body, setBody] = useState(''),
    [extra, setExtra] = useState<Message[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [deleting, setDeleting] = useState<string | null>(null),
    list = useRef<HTMLDivElement>(null),
    pending = useRef<{ id: string; body: string } | null>(null);
  useEffect(() => {
    setExtra([]);
    setCursor(resource.data?.nextCursor ?? null);
    const latest = resource.data?.data[0];
    if (latest)
      void api(`/api/conversations/${conversationId}/read`, 'POST', { messageId: latest.id }).catch(
        () => {},
      );
  }, [resource.data, conversationId]);
  useEffect(() => {
    if (list.current && extra.length === 0) list.current.scrollTop = list.current.scrollHeight;
  }, [resource.data, extra.length]);
  if (resource.error) return <InlineError message={resource.error} retry={resource.reload} />;
  const messages = [...(resource.data?.data ?? []), ...extra]
    .filter((m, i, a) => a.findIndex((x) => x.id === m.id) === i)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return (
    <>
      <div className="message-list" ref={list} aria-label="Mensajes de la conversación">
        {cursor && (
          <button
            className="text-button history-button"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                const page = await api<Page<Message>>(
                  `/api/conversations/${conversationId}/messages?before=${encodeURIComponent(cursor)}`,
                );
                setExtra((v) => [...v, ...page.data]);
                setCursor(page.nextCursor);
              })
            }
          >
            Cargar mensajes anteriores
          </button>
        )}
        {resource.loading && !resource.data && <Spinner />}
        {!resource.loading && !messages.length && (
          <Empty title="Sin mensajes">Escribe un mensaje para iniciar la conversación.</Empty>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`message ${message.author?.id === user?.id ? 'mine' : ''}`}
          >
            <div>
              <p>{message.body}</p>
              <span>
                {message.author
                  ? message.author.id !== user?.id
                    ? `${message.author.displayName} · `
                    : ''
                  : 'Usuario eliminado · '}
                {time(message.createdAt)}
              </span>
            </div>
            <details className="post-menu">
              <summary aria-label="Opciones del mensaje">···</summary>
              <div>
                {message.author?.id === user?.id ? (
                  <button onClick={() => setDeleting(message.id)}>
                    <Trash2 size={14} />
                    Eliminar
                  </button>
                ) : (
                  <button
                    onClick={() => openReport({ targetType: 'message', targetId: message.id })}
                  >
                    <Flag size={14} />
                    Denunciar
                  </button>
                )}
              </div>
            </details>
          </div>
        ))}
      </div>
      <form
        className="message-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          void task(async () => {
            if (!pending.current || pending.current.body !== body)
              pending.current = { id: crypto.randomUUID(), body };
            await api(`/api/conversations/${conversationId}/messages`, 'POST', {
              body,
              clientId: pending.current.id,
            });
            setBody('');
            pending.current = null;
            refresh();
          });
        }}
      >
        <textarea
          aria-label="Escribe tu mensaje"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={1}
          placeholder="Escribe algo bonito…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="button primary"
          disabled={busy || !body.trim()}
          aria-label="Enviar mensaje"
        >
          {busy ? <Spinner /> : <Send size={19} />}
        </button>
      </form>
      {deleting && (
        <div className="inline-confirm" role="alert">
          <p>¿Eliminar este mensaje para ambos participantes?</p>
          <button onClick={() => setDeleting(null)}>Conservar</button>
          <button
            className="danger-text"
            disabled={busy}
            onClick={() =>
              void task(async () => {
                await api(`/api/messages/${deleting}`, 'DELETE');
                setDeleting(null);
                refresh();
                notify('Mensaje eliminado.');
              })
            }
          >
            Eliminar
          </button>
        </div>
      )}
    </>
  );
}
