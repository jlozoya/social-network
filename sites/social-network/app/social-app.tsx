'use client';
import {
  ArrowLeft,
  ArrowUpRight,
  Compass,
  House,
  LogOut,
  MessageCircle,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppContext } from './client/app-context';
import AuthPanel from './client/auth-panel';
import Chat from './client/chat';
import { Discover, Feed, ProfileView } from './client/feed';
import { ContentLoading } from './client/loading';
import Moderation from './client/moderation';
import { siteUrl } from './client/origin';
import Settings from './client/settings';
import { type ReportTarget } from './client/types';
import { Avatar, Modal } from './client/ui';

import { ReportForm, RightRail, SharedPost } from './client/shell-parts';
import { names, useNavigation, type View } from './client/use-navigation';
import { useRealtime } from './client/use-realtime';
import { useSession } from './client/use-session';

export default function SocialApp() {
  const { view, profileId, conversation, setConversation, sharedPost, setSharedPost, go } =
    useNavigation();
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [following, setFollowing] = useState(false),
    [sync, setSync] = useState(0),
    [report, setReport] = useState<ReportTarget | null>(null),
    [toast, setToast] = useState('');
  const notify = useCallback((message: string) => setToast(message), []);
  const refresh = useCallback(() => setSync((v) => v + 1), []);
  const { user, setUser, loading, auth, setAuth, refreshUser, chatgpt, logout } = useSession({
    go,
    refresh,
    notify,
  });
  const live = useRealtime(user, refresh, refreshUser);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.title = `${names[view]} · Social Network`;
  }, [view]);

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
    [user, sync, notify, refreshUser, refresh, go, setAuth],
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
