'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  House,
  Compass,
  MessageCircle,
  UserRound,
  Settings2,
  ShieldCheck,
  Search,
  ArrowUpRight,
  LogOut,
  RefreshCw,
  X,
  ArrowLeft,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  AppContext,
  api,
  Avatar,
  ClientError,
  Modal,
  Spinner,
  useApp,
  useResource,
  useTask,
  type Profile,
  type ReportTarget,
  type Post,
} from './client/shared';
import AuthPanel from './client/auth-panel';
import { Feed, Discover, ProfileView, PostCard } from './client/feed';
import Chat from './client/chat';
import Settings from './client/settings';
import Moderation from './client/moderation';
import { siteUrl } from './client/origin';
import { ContentLoading, PeopleLoading } from './client/loading';

type View = 'feed' | 'discover' | 'messages' | 'profile' | 'settings' | 'moderation';
const names: Record<View, string> = {
  feed: 'Publicaciones',
  discover: 'Descubrir',
  messages: 'Mensajes',
  profile: 'Perfil',
  settings: 'Ajustes',
  moderation: 'Moderación',
};
function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
export default function SocialApp() {
  const [user, setUser] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [view, setView] = useState<View>('feed'),
    [profileId, setProfileId] = useState(''),
    [conversation, setConversation] = useState<string | null>(null),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [following, setFollowing] = useState(false),
    [sync, setSync] = useState(0),
    [auth, setAuth] = useState(false),
    [report, setReport] = useState<ReportTarget | null>(null),
    [sharedPost, setSharedPost] = useState<string | null>(null),
    [toast, setToast] = useState(''),
    [live, setLive] = useState('connecting');
  const lastCode = useRef('');
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(() => setSync((v) => v + 1), []);
  const refreshUser = useCallback(async () => {
    const result = await api<{ user: Profile | null }>('/api/session');
    setUser(result.user);
  }, []);
  const go = useCallback((page: View, person = '', chat: string | null = null) => {
    setView(page);
    setProfileId(person);
    setConversation(chat);
    const url = new URL(location.href);
    url.search = '';
    if (page !== 'feed') url.searchParams.set('view', page);
    if (person) url.searchParams.set('user', person);
    if (chat) url.searchParams.set('chat', chat);
    history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  const finishAuth = useCallback(
    async (code: string, state: string) => {
      if (lastCode.current === code) return;
      lastCode.current = code;
      try {
        const raw = sessionStorage.getItem('sn_auth');
        if (!raw) throw new Error('Vuelve a iniciar el acceso desde esta app.');
        const pending = JSON.parse(raw);
        if (pending.state !== state) throw new Error('El acceso no corresponde a esta sesión.');
        await api('/api/auth/exchange', 'POST', { code, state, verifier: pending.verifier });
        sessionStorage.removeItem('sn_auth');
        if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
        await refreshUser();
        setAuth(false);
        go('feed');
        refresh();
        notify('Sesión iniciada.');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'No se pudo completar el acceso.');
        history.replaceState({}, '', '/');
        await refreshUser();
      }
    },
    [go, notify, refresh, refreshUser],
  );
  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      const requested = params.get('view') as View;
      if (requested && names[requested]) setView(requested);
      else setView('feed');
      setProfileId(params.get('user') ?? '');
      setConversation(params.get('chat'));
      setSharedPost(params.get('post'));
    };
    read();
    window.addEventListener('popstate', read);
    const params = new URLSearchParams(location.search);
    const code = params.get('auth_code'),
      state = params.get('state');
    void (code && state ? finishAuth(code, state) : refreshUser())
      .catch((error) => notify(error.message))
      .finally(() => setLoading(false));
    let disposed = false,
      remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const receive = (value: string) => {
        const url = new URL(value);
        if (url.protocol === 'socialnetwork:' && url.host === 'auth') {
          const code = url.searchParams.get('code'),
            state = url.searchParams.get('state');
          if (code && state) void finishAuth(code, state);
        }
      };
      void App.addListener('appUrlOpen', (event) => receive(event.url)).then((listener) => {
        if (disposed) void listener.remove();
        else remove = () => void listener.remove();
      });
      void App.getLaunchUrl().then((value) => {
        if (value) receive(value.url);
      });
    }
    return () => {
      disposed = true;
      remove?.();
      window.removeEventListener('popstate', read);
    };
  }, [finishAuth, notify, refreshUser]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = `${names[view]} · Social Network`;
  }, [view]);
  useEffect(() => {
    if (!user) {
      setLive('signed-out');
      return;
    }
    let disposed = false,
      client: { close: () => void } | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        void refreshUser().catch(() => {});
      }, 250);
    };
    void api<{ configured: boolean }>('/api/realtime/status')
      .then(async (status) => {
        if (disposed) return;
        if (!status.configured) {
          setLive('manual');
          return;
        }
        const Ably = await import('ably');
        if (disposed) return;
        const realtime = new Ably.Realtime({
          authCallback: (_params, callback) => {
            void api<import('ably').TokenRequest>('/api/realtime/token', 'POST')
              .then((token) => callback(null, token))
              .catch((error) => callback(error.message, null));
          },
          clientId: user.id,
        });
        client = realtime;
        realtime.connection.on('connected', () => {
          if (!disposed) {
            setLive('connected');
            changed();
          }
        });
        realtime.connection.on('disconnected', () => !disposed && setLive('reconnecting'));
        realtime.connection.on('suspended', () => !disposed && setLive('manual'));
        realtime.connection.on('failed', () => {
          if (!disposed) {
            setLive('manual');
            void refreshUser().catch(() => {});
          }
        });
        for (const channelName of ['sn:feed', `sn:user:${user.id}`]) {
          const channel = realtime.channels.get(channelName);
          void channel.subscribe('changed', changed).catch(() => !disposed && setLive('manual'));
          channel.on('attached', changed);
        }
      })
      .catch(() => !disposed && setLive('manual'));
    const visible = () => {
      if (document.visibilityState === 'visible') changed();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      client?.close();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user?.id, refresh, refreshUser]);
  const chatgpt = useCallback(async (link: boolean, accepted: boolean) => {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(32))),
      state = b64(crypto.getRandomValues(new Uint8Array(32))),
      challenge = b64(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
      );
    const native = Capacitor.isNativePlatform();
    const payload = {
      challenge,
      state,
      native,
      link,
      termsAccepted: accepted,
      ageConfirmed: accepted,
    };
    sessionStorage.setItem('sn_auth', JSON.stringify({ verifier, state }));
    if (native) {
      const result = await api<{ url: string }>('/api/auth/start', 'POST', payload);
      await Browser.open({ url: result.url });
    } else {
      // El acceso de Sites requiere navegar en la página superior. Un formulario
      // nativo evita esperar un fetch antes de salir del modal y también funciona
      // cuando la aplicación está dentro de un iframe.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = siteUrl('/api/auth/start');
      form.target = '_top';
      form.hidden = true;
      for (const [name, value] of Object.entries(payload)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      try {
        form.submit();
      } finally {
        form.remove();
      }
    }
  }, []);
  const context = useMemo(
    () => ({
      user,
      sync,
      notify,
      refreshUser,
      refresh,
      openAuth: () => setAuth(true),
      openProfile: (id: string) => go('profile', id),
      openChat: (id: string) => go('messages', '', id),
      openReport: (target: ReportTarget) => setReport(target),
    }),
    [user, sync, notify, refreshUser, refresh, go],
  );
  const nav = (page: View) => {
    if (loading) return;
    if (['messages', 'settings', 'moderation'].includes(page) && !user) {
      setAuth(true);
      return;
    }
    if (page === 'profile') {
      if (user) go(page, user.id);
      else setAuth(true);
    } else go(page);
  };
  const logout = async () => {
    try {
      await api('/api/auth/logout', 'POST', {});
      setUser(null);
      go('feed');
      refresh();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const menu = [
    ['feed', House, 'Inicio'],
    ['discover', Compass, 'Descubrir'],
    ['messages', MessageCircle, 'Mensajes'],
    ['profile', UserRound, 'Mi perfil'],
    ['settings', Settings2, 'Ajustes'],
  ] as const;
  return (
    <AppContext.Provider value={context}>
      <div className="app-shell">
        <header className="topbar">
          <button className="brand" onClick={() => go('feed')} aria-label="Social Network · Inicio">
            <span className="brand-icon">
              s<span>.</span>
            </span>
            <span>
              Social Network<span className="brand-note">PUBLICACIONES Y MENSAJES</span>
            </span>
          </button>
          <form
            className="search-box"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(search);
              go('discover');
            }}
          >
            <Search size={18} />
            <input
              aria-label="Buscar personas"
              placeholder="Buscar personas…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>↵</kbd>
          </form>
          <div className="header-actions">
            {loading ? (
              <span className="account-placeholder skeleton-shape" aria-hidden="true" />
            ) : user ? (
              <>
                {(live === 'reconnecting' || live === 'manual') && (
                  <span className="live-status" role="status">
                    <i aria-hidden="true" />
                    {live === 'reconnecting' ? 'Reconectando…' : 'Actualiza para ver cambios'}
                  </span>
                )}
                <button
                  className="account-avatar"
                  aria-label="Abrir mi perfil"
                  onClick={() => go('profile', user.id)}
                >
                  <Avatar person={user} />
                </button>
              </>
            ) : (
              <button className="button primary compact" onClick={() => setAuth(true)}>
                Entrar <ArrowUpRight size={16} />
              </button>
            )}
          </div>
        </header>
        <div className={`workspace ${view === 'messages' ? 'wide-view' : ''}`}>
          <aside className="sidebar">
            <div>
              <span className="nav-kicker">NAVEGACIÓN</span>
              <nav aria-label="Navegación principal">
                {menu.map(([page, Icon, label]) => (
                  <button
                    className={view === page ? 'active' : ''}
                    key={page}
                    onClick={() => nav(page)}
                  >
                    <Icon size={21} />
                    {label}
                    {view === page && <i />}
                  </button>
                ))}
                {user && ['admin', 'moderator'].includes(user.role ?? '') && (
                  <button
                    className={view === 'moderation' ? 'active' : ''}
                    onClick={() => go('moderation')}
                  >
                    <ShieldCheck size={21} />
                    Moderación
                  </button>
                )}
              </nav>
            </div>
            <div className="sidebar-bottom">
              {user && (
                <button className="sidebar-user" onClick={() => go('profile', user.id)}>
                  <Avatar person={user} size="small" />
                  <span>
                    <strong>{user.displayName}</strong>
                    <small>@{user.username}</small>
                  </span>
                </button>
              )}
              {user && (
                <button className="text-button logout" onClick={() => void logout()}>
                  <LogOut size={15} />
                  Cerrar sesión
                </button>
              )}
              <div className="footer-links">
                <a href={siteUrl('/privacy')}>Privacidad</a>
                <a href={siteUrl('/terms')}>Términos</a>
                <a href={siteUrl('/community')}>Comunidad</a>
                <a href={siteUrl('/support')}>Ayuda</a>
              </div>
              <small className="copyright">© 2026 Social Network</small>
            </div>
          </aside>
          <main className="main-content" id="main-content">
            {loading ? (
              <ContentLoading title={names[view]} />
            ) : (
              <>
                {view === 'feed' && (
                  <>
                    <div className="section-title">
                      <div>
                        <span className="eyebrow">INICIO</span>
                        <h2>Publicaciones</h2>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Actualizar publicaciones"
                        onClick={refresh}
                      >
                        <RefreshCw size={17} />
                      </button>
                    </div>
                    {user && (
                      <div className="tabs feed-tabs">
                        <button
                          className={!following ? 'active' : ''}
                          onClick={() => setFollowing(false)}
                        >
                          Para ti
                        </button>
                        <button
                          className={following ? 'active' : ''}
                          onClick={() => setFollowing(true)}
                        >
                          Siguiendo
                        </button>
                      </div>
                    )}
                    <Feed
                      key={`${user?.id ?? 'guest'}-${following}`}
                      endpoint={following && user ? '/api/posts?following=1' : '/api/posts'}
                    />
                  </>
                )}
                {view === 'discover' && <Discover query={query} />}
                {view === 'profile' && profileId && (
                  <>
                    <button className="text-button back-button" onClick={() => go('feed')}>
                      <ArrowLeft size={16} />
                      Volver al inicio
                    </button>
                    <ProfileView key={profileId} userId={profileId} />
                  </>
                )}
                {view === 'messages' && (
                  <Chat conversationId={conversation} select={(id) => setConversation(id)} />
                )}
                {view === 'settings' && user && (
                  <Settings
                    chatgpt={chatgpt}
                    deleted={() => {
                      setUser(null);
                      go('feed');
                      refresh();
                    }}
                  />
                )}
                {view === 'moderation' &&
                  user &&
                  ['admin', 'moderator'].includes(user.role ?? '') && <Moderation />}
              </>
            )}
          </main>
          {view !== 'messages' && <RightRail loading={loading} />}
        </div>
        <nav className="mobile-nav" aria-label="Navegación móvil">
          {menu.map(([page, Icon, label]) => (
            <button
              className={view === page ? 'active' : ''}
              key={page}
              onClick={() => nav(page)}
              aria-label={label}
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {toast && (
        <div className="toast" role="status">
          <p>{toast}</p>
          <button className="icon-button" onClick={() => setToast('')} aria-label="Cerrar aviso">
            <X size={17} />
          </button>
        </div>
      )}
      {auth && (
        <Modal title="Accede a Social Network" close={() => setAuth(false)}>
          <AuthPanel
            done={() => {
              setAuth(false);
              refresh();
            }}
            chatgpt={chatgpt}
          />
        </Modal>
      )}
      {report && (
        <Modal title="Denunciar contenido" close={() => setReport(null)}>
          <ReportForm target={report} close={() => setReport(null)} />
        </Modal>
      )}
      {sharedPost && (
        <Modal
          title="Publicación"
          close={() => {
            setSharedPost(null);
            history.replaceState({}, '', '/');
          }}
        >
          <SharedPost id={sharedPost} />
        </Modal>
      )}
    </AppContext.Provider>
  );
}
function RightRail({ loading }: { loading: boolean }) {
  const { user, sync, openProfile, openAuth } = useApp(),
    people = useResource<{ data: Profile[] }>('/api/users', sync);
  return (
    <aside className="right-rail">
      <section className="rail-card">
        <div className="section-title">
          <h3>Personas</h3>
          <Compass size={17} />
        </div>
        {(loading || (people.loading && !people.data)) && <PeopleLoading />}
        {!loading &&
          people.data?.data.slice(0, 4).map((person) => (
            <button
              className="suggested-person"
              key={person.id}
              onClick={() => openProfile(person.id)}
            >
              <Avatar person={person} size="small" />
              <span>
                <strong>{person.displayName}</strong>
                <small>@{person.username}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        {!loading && people.data && !people.data.data.length && (
          <p className="small muted">No hay perfiles disponibles.</p>
        )}
        {!loading && !user && (
          <button className="text-button" onClick={openAuth}>
            Iniciar sesión <ArrowUpRight size={14} />
          </button>
        )}
      </section>
      <a className="community-link" href={siteUrl('/community')}>
        <ShieldCheck size={19} />
        <span>
          Normas de comunidad
          <strong>
            Leer normas <ArrowUpRight size={13} />
          </strong>
        </span>
      </a>
      <div className="footer-links">
        <a href={siteUrl('/delete-account')}>Eliminar cuenta</a>
        <a href={siteUrl('/child-safety')}>Seguridad infantil</a>
        <a href={siteUrl('/support')}>Contacto</a>
      </div>
    </aside>
  );
}
function ReportForm({ target, close }: { target: ReportTarget; close: () => void }) {
  const { notify } = useApp(),
    { busy, task } = useTask();
  return (
    <>
      <p>
        Cuéntanos qué sucede. El equipo de moderación revisará tu denuncia y el contenido señalado.
      </p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          void task(async () => {
            await api('/api/reports', 'POST', { ...target, ...values });
            notify('Denuncia enviada.');
            close();
          });
        }}
      >
        <label>
          Motivo
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={1000}
            rows={5}
            placeholder="Acoso, suplantación, contenido inapropiado…"
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? <Spinner /> : 'Enviar denuncia'}
        </button>
      </form>
    </>
  );
}
function SharedPost({ id }: { id: string }) {
  const resource = useResource<Post>(`/api/posts/${encodeURIComponent(id)}`);
  return resource.error ? (
    <p role="alert">{resource.error}</p>
  ) : resource.data ? (
    <PostCard post={resource.data} />
  ) : (
    <Spinner />
  );
}
