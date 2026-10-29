'use client';
import { useEffect, useState } from 'react';
import {
  ImagePlus,
  Send,
  MessageCircle,
  Heart,
  Share2,
  Flag,
  Trash2,
  Pencil,
  Globe,
  Lock,
  Users,
  X,
  ArrowUpRight,
} from 'lucide-react';
import {
  api,
  Avatar,
  Empty,
  InlineError,
  Modal,
  Spinner,
  time,
  upload,
  useApp,
  useResource,
  useTask,
  type Post,
  type Page,
  type Comment,
  type Profile,
} from './shared';

import { siteUrl } from './origin';
import { ContentLoading } from './loading';

const reactions = [
  ['like', '👍', 'Me gusta'],
  ['love', '❤️', 'Me encanta'],
  ['care', '🤗', 'Me importa'],
  ['haha', '😆', 'Me divierte'],
  ['wow', '😮', 'Me asombra'],
  ['sad', '😢', 'Me entristece'],
  ['angry', '😠', 'Me enoja'],
];
function Preview({ file, remove }: { file: File; remove: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return (
    <span className="photo-preview">
      <img src={url} alt={file.name} />
      <button className="icon-button" aria-label={`Quitar ${file.name}`} onClick={remove}>
        <X size={14} />
      </button>
    </span>
  );
}
export function Composer() {
  const { user, openAuth, refresh, notify } = useApp(),
    { busy, task } = useTask();
  const [body, setBody] = useState(''),
    [files, setFiles] = useState<File[]>([]),
    [audience, setAudience] = useState('public');
  if (!user)
    return (
      <div className="join-card">
        <span className="eyebrow">SOCIAL NETWORK</span>
        <h1>
          Publica y
          <br />
          <em>conversa.</em>
        </h1>
        <p>Comparte publicaciones y fotos, sigue perfiles y envía mensajes.</p>
        <button className="button primary" onClick={openAuth}>
          Iniciar sesión <ArrowUpRight size={18} />
        </button>
        <span className="join-orbit" aria-hidden="true">
          ✳
        </span>
      </div>
    );
  return (
    <form
      className="card composer"
      onSubmit={(e) => {
        e.preventDefault();
        void task(async () => {
          const mediaIds: string[] = [];
          for (const file of files) mediaIds.push((await upload(file)).id);
          await api('/api/posts', 'POST', { body, audience, mediaIds });
          setBody('');
          setFiles([]);
          refresh();
          notify('Publicación creada.');
        });
      }}
    >
      <div className="composer-input">
        <Avatar person={user} />
        <textarea
          aria-label="Nueva publicación"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={5000}
          placeholder={`¿Qué quieres compartir, ${user.displayName.split(' ')[0]}?`}
          rows={2}
        />
      </div>
      {!!files.length && (
        <div className="photo-previews">
          {files.map((file, i) => (
            <Preview
              key={`${file.name}-${i}`}
              file={file}
              remove={() => setFiles((f) => f.filter((_, index) => index !== i))}
            />
          ))}
        </div>
      )}
      <div className="composer-actions">
        <label className="photo-button">
          <ImagePlus size={18} /> Foto
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length + files.length > 4) {
                notify('Puedes añadir hasta cuatro fotos.');
                return;
              }
              setFiles((f) => [...f, ...selected]);
              e.target.value = '';
            }}
          />
        </label>
        <select
          aria-label="Quién puede ver esta publicación"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
        >
          <option value="public">Público</option>
          <option value="followers">Seguidores</option>
          <option value="private">Sólo yo</option>
        </select>
        <button
          className="button primary compact"
          disabled={busy || (!body.trim() && !files.length)}
        >
          {busy ? <Spinner /> : <Send size={16} />} Publicar
        </button>
      </div>
    </form>
  );
}
function Comments({ post }: { post: Post }) {
  const { user, sync, openAuth, openProfile, openReport, refresh } = useApp(),
    { busy, task } = useTask();
  const resource = useResource<Page<Comment>>(`/api/posts/${post.id}/comments`, sync);
  const [extra, setExtra] = useState<Comment[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [body, setBody] = useState('');
  useEffect(() => {
    setExtra([]);
    setCursor(resource.data?.nextCursor ?? null);
  }, [resource.data]);
  return (
    <section className="comments" aria-label="Comentarios">
      {resource.error && <InlineError message={resource.error} retry={resource.reload} />}
      {resource.loading && !resource.data && <Spinner />}
      {[...(resource.data?.data ?? []), ...extra].map((c) => (
        <div className="comment" key={c.id}>
          <Avatar person={c.author} size="small" />
          <div className="comment-bubble">
            <button className="person-name" onClick={() => openProfile(c.author.id)}>
              {c.author.displayName}
            </button>
            <p>{c.body}</p>
            <span className="small muted">{time(c.createdAt)}</span>
          </div>
          <details className="post-menu">
            <summary aria-label="Opciones del comentario">···</summary>
            <div>
              {user && (user.id === c.author.id || user.id === post.author.id) ? (
                <button
                  onClick={() =>
                    void task(async () => {
                      await api(`/api/comments/${c.id}`, 'DELETE');
                      refresh();
                    })
                  }
                >
                  <Trash2 size={14} />
                  Eliminar
                </button>
              ) : (
                user && (
                  <button onClick={() => openReport({ targetType: 'comment', targetId: c.id })}>
                    <Flag size={14} />
                    Denunciar
                  </button>
                )
              )}
            </div>
          </details>
        </div>
      ))}
      {cursor && (
        <button
          className="text-button small"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              const page = await api<Page<Comment>>(
                `/api/posts/${post.id}/comments?before=${encodeURIComponent(cursor)}`,
              );
              setExtra((v) => [...v, ...page.data]);
              setCursor(page.nextCursor);
            })
          }
        >
          Ver comentarios anteriores
        </button>
      )}
      {user ? (
        <form
          className="comment-form"
          onSubmit={(e) => {
            e.preventDefault();
            void task(async () => {
              await api(`/api/posts/${post.id}/comments`, 'POST', { body });
              setBody('');
              refresh();
            });
          }}
        >
          <Avatar person={user} size="small" />
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={1000}
            aria-label="Tu comentario"
            placeholder="Escribe un comentario…"
          />
          <button
            className="icon-button"
            aria-label="Enviar comentario"
            disabled={busy || !body.trim()}
          >
            {busy ? <Spinner /> : <Send size={17} />}
          </button>
        </form>
      ) : (
        <button className="text-button" onClick={openAuth}>
          Entra para comentar
        </button>
      )}
    </section>
  );
}
export function PostCard({ post }: { post: Post }) {
  const { user, openAuth, openProfile, openReport, refresh, notify } = useApp(),
    { busy, task } = useTask();
  const [comments, setComments] = useState(false),
    [edit, setEdit] = useState(false),
    [deleting, setDeleting] = useState(false);
  const react = (value: string | null) => {
    if (!user) {
      openAuth();
      return;
    }
    void task(async () => {
      await api(`/api/posts/${post.id}/reaction`, 'POST', { reaction: value });
      refresh();
    });
  };
  const share = () =>
    void task(async () => {
      const url = new URL(siteUrl(`/?post=${post.id}`), location.origin).href;
      if (navigator.share) await navigator.share({ title: 'Social Network', url });
      else {
        await navigator.clipboard.writeText(url);
        notify('Enlace copiado.');
      }
    });
  return (
    <article className="card post">
      <div className="post-heading">
        <button className="person-link" onClick={() => openProfile(post.author.id)}>
          <Avatar person={post.author} />
          <span>
            <strong>{post.author.displayName}</strong>
            <span className="post-date">
              {time(post.createdAt)} ·{' '}
              {post.audience === 'public' ? (
                <Globe size={12} />
              ) : post.audience === 'followers' ? (
                <Users size={12} />
              ) : (
                <Lock size={12} />
              )}
            </span>
          </span>
        </button>
        <details className="post-menu">
          <summary aria-label="Opciones de la publicación">···</summary>
          <div>
            {user?.id === post.author.id ? (
              <>
                <button onClick={() => setEdit(true)}>
                  <Pencil size={14} />
                  Editar
                </button>
                <button onClick={() => setDeleting(true)}>
                  <Trash2 size={14} />
                  Eliminar
                </button>
              </>
            ) : (
              <button
                onClick={() =>
                  user ? openReport({ targetType: 'post', targetId: post.id }) : openAuth()
                }
              >
                <Flag size={14} />
                Denunciar
              </button>
            )}
          </div>
        </details>
      </div>
      {post.body && <p className="post-body">{post.body}</p>}
      {!!post.media.length && (
        <div className={`post-photos count-${post.media.length}`}>
          {post.media.map((photo, i) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
              <img
                src={photo.url}
                alt={`Foto ${i + 1} compartida por ${post.author.displayName}`}
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
      {(post.reactionCount > 0 || post.commentCount > 0) && (
        <div className="post-counts">
          <span>
            {Object.keys(post.reactions)
              .slice(0, 3)
              .map((k) => reactions.find((r) => r[0] === k)?.[1])
              .join(' ')}{' '}
            {post.reactionCount || ''}
          </span>
          <button onClick={() => setComments((v) => !v)}>
            {post.commentCount} {post.commentCount === 1 ? 'comentario' : 'comentarios'}
          </button>
        </div>
      )}
      <div className="post-actions">
        <div className="reaction-control">
          <button
            className={post.myReaction ? 'reacted' : ''}
            disabled={busy}
            onClick={() => react(post.myReaction ? null : 'like')}
          >
            {post.myReaction ? (
              <span>{reactions.find((r) => r[0] === post.myReaction)?.[1]}</span>
            ) : (
              <Heart size={18} />
            )}
            <span>{reactions.find((r) => r[0] === post.myReaction)?.[2] ?? 'Me gusta'}</span>
          </button>
          <details className="reaction-picker">
            <summary aria-label="Elegir reacción">⌄</summary>
            <div>
              {reactions.map(([value, emoji, label]) => (
                <button
                  key={value}
                  title={label}
                  aria-label={label}
                  disabled={busy}
                  onClick={(e) => {
                    react(value);
                    e.currentTarget.closest('details')?.removeAttribute('open');
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </details>
        </div>
        <button onClick={() => setComments((v) => !v)}>
          <MessageCircle size={18} />
          Comentar
        </button>
        <button onClick={share}>
          <Share2 size={18} />
          Compartir
        </button>
      </div>
      {comments && <Comments post={post} />}
      {edit && (
        <Modal title="Editar publicación" close={() => setEdit(false)}>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const body = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api(`/api/posts/${post.id}`, 'PATCH', body);
                setEdit(false);
                refresh();
              });
            }}
          >
            <textarea
              name="body"
              aria-label="Texto de la publicación"
              defaultValue={post.body}
              maxLength={5000}
              rows={6}
            />
            <label>
              Audiencia
              <select name="audience" defaultValue={post.audience}>
                <option value="public">Público</option>
                <option value="followers">Seguidores</option>
                <option value="private">Sólo yo</option>
              </select>
            </label>
            <button className="button primary" disabled={busy}>
              Guardar cambios
            </button>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Eliminar publicación" close={() => setDeleting(false)}>
          <p>Se eliminarán el contenido, sus comentarios y las fotos que no uses en tu perfil.</p>
          <div className="form-actions">
            <button className="button outline" onClick={() => setDeleting(false)}>
              Conservar
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await api(`/api/posts/${post.id}`, 'DELETE');
                  setDeleting(false);
                  refresh();
                })
              }
            >
              Eliminar publicación
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}
export function Feed({
  endpoint = '/api/posts',
  showComposer = true,
}: {
  endpoint?: string;
  showComposer?: boolean;
}) {
  const { sync } = useApp(),
    { busy, task } = useTask(),
    resource = useResource<Page<Post>>(endpoint, sync);
  const [extra, setExtra] = useState<Post[]>([]),
    [cursor, setCursor] = useState<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setCursor(resource.data?.nextCursor ?? null);
  }, [resource.data]);
  const posts = [...(resource.data?.data ?? []), ...extra];
  return (
    <>
      {showComposer && <Composer />}
      {resource.error && <InlineError message={resource.error} retry={resource.reload} />}
      {resource.loading && !resource.data && <ContentLoading />}
      {!resource.loading && !resource.error && !posts.length && (
        <div className="card">
          <Empty title="No hay publicaciones">Las publicaciones disponibles aparecerán aquí.</Empty>
        </div>
      )}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {cursor && (
        <button
          className="button outline full"
          disabled={busy}
          onClick={() =>
            void task(async () => {
              const page = await api<Page<Post>>(
                `${endpoint}${endpoint.includes('?') ? '&' : '?'}before=${encodeURIComponent(cursor)}`,
              );
              setExtra((v) => [...v, ...page.data]);
              setCursor(page.nextCursor);
            })
          }
        >
          Ver más publicaciones
        </button>
      )}
    </>
  );
}
export function ProfileView({ userId }: { userId: string }) {
  const { user, sync, openAuth, openChat, openReport, refresh, openProfile } = useApp(),
    resource = useResource<Profile>(`/api/users/${userId}`, sync),
    { busy, task } = useTask(),
    [blocking, setBlocking] = useState(false);
  if (resource.error) return <InlineError message={resource.error} retry={resource.reload} />;
  if (!resource.data)
    return (
      <div className="loading-box">
        <Spinner /> Cargando perfil…
      </div>
    );
  const person = resource.data,
    own = user?.id === person.id;
  return (
    <>
      <section className="card profile-card">
        <div className="profile-cover">
          {person.coverUrl && (
            <img src={person.coverUrl} alt={`Portada de ${person.displayName}`} />
          )}
          <span className="cover-mark" aria-hidden="true">
            ✳
          </span>
        </div>
        <div className="profile-details">
          <Avatar person={person} size="large" />
          <span className="eyebrow">{person.isPrivate ? 'PERFIL PRIVADO' : 'EN LA COMUNIDAD'}</span>
          <h1>{person.displayName}</h1>
          <p className="handle">@{person.username}</p>
          {person.bio && <p className="profile-bio">{person.bio}</p>}
          <div className="profile-stats">
            <span>
              <strong>{person.followerCount}</strong> seguidores
            </span>
            <span>
              <strong>{person.followingCount}</strong> siguiendo
            </span>
            {person.isPrivate && (
              <span>
                <Lock size={13} /> Privado
              </span>
            )}
          </div>
          {!own && (
            <div className="profile-buttons">
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  user
                    ? void task(async () => {
                        await api(
                          `/api/users/${person.id}/follow`,
                          person.followState ? 'DELETE' : 'POST',
                          person.followState ? undefined : {},
                        );
                        refresh();
                      })
                    : openAuth()
                }
              >
                {person.followState === 'accepted'
                  ? 'Siguiendo'
                  : person.followState === 'pending'
                    ? 'Solicitud enviada'
                    : 'Seguir'}
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() =>
                  user
                    ? void task(async () => {
                        const result = await api<{ id: string }>('/api/conversations', 'POST', {
                          userId: person.id,
                        });
                        openChat(result.id);
                      })
                    : openAuth()
                }
              >
                Conversar
              </button>
              <details className="post-menu">
                <summary aria-label="Opciones del perfil">···</summary>
                <div>
                  <button
                    onClick={() =>
                      user ? openReport({ targetType: 'user', targetId: person.id }) : openAuth()
                    }
                  >
                    <Flag size={14} />
                    Denunciar
                  </button>
                  <button onClick={() => (user ? setBlocking(true) : openAuth())}>
                    <Lock size={14} />
                    Bloquear
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      </section>
      <div className="section-title">
        <h2>Publicaciones</h2>
      </div>
      <Feed key={person.id} endpoint={`/api/posts?author=${person.id}`} showComposer={own} />
      {blocking && (
        <Modal title={`Bloquear a @${person.username}`} close={() => setBlocking(false)}>
          <p>
            No podrán ver sus perfiles ni conversar entre ustedes. Puedes deshacerlo desde Ajustes.
          </p>
          <div className="form-actions">
            <button className="button outline" onClick={() => setBlocking(false)}>
              Cancelar
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await api(`/api/users/${person.id}/block`, 'POST', {});
                  setBlocking(false);
                  refresh();
                })
              }
            >
              Bloquear
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Discover({ query }: { query: string }) {
  const { sync, openProfile } = useApp(),
    resource = useResource<{ data: Profile[] }>(`/api/users?q=${encodeURIComponent(query)}`, sync);
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">PERSONAS</span>
        <h1>{query ? 'Resultados de búsqueda' : 'Buscar perfiles'}</h1>
        <p>Busca por nombre o usuario.</p>
      </div>
      {resource.error && <InlineError message={resource.error} retry={resource.reload} />}
      <div className="people-grid">
        {resource.data?.data.map((person) => (
          <button
            className="card person-card"
            key={person.id}
            onClick={() => openProfile(person.id)}
          >
            <Avatar person={person} />
            <strong>{person.displayName}</strong>
            <span className="handle">@{person.username}</span>
            {person.bio && <p>{person.bio}</p>}
            <span className="text-button">
              Ver perfil <ArrowUpRight size={14} />
            </span>
          </button>
        ))}
      </div>
      {resource.loading && !resource.data && <Spinner />}
      {resource.data && !resource.data.data.length && (
        <div className="card">
          <Empty title="Sin resultados">
            No encontramos perfiles con esa búsqueda. Prueba otro nombre.
          </Empty>
        </div>
      )}
    </>
  );
}
