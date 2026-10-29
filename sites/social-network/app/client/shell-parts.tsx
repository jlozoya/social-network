'use client';
import { ArrowUpRight, Compass, ShieldCheck } from 'lucide-react';
import { api } from './api-client';
import { useApp } from './app-context';
import { PostCard } from './feed';
import { useResource, useTask } from './hooks';
import { PeopleLoading } from './loading';
import { siteUrl } from './origin';
import { type Post, type Profile, type ReportTarget } from './types';
import { Avatar, Spinner } from './ui';

export function RightRail({ loading }: { loading: boolean }) {
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
export function ReportForm({ target, close }: { target: ReportTarget; close: () => void }) {
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
export function SharedPost({ id }: { id: string }) {
  const resource = useResource<Post>(`/api/posts/${encodeURIComponent(id)}`);
  return resource.error ? (
    <p role="alert">{resource.error}</p>
  ) : resource.data ? (
    <PostCard post={resource.data} />
  ) : (
    <Spinner />
  );
}
