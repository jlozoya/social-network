'use client';
import { useState } from 'react';
import { CheckCircle2, Camera, Link2 } from 'lucide-react';
import {
  api,
  Avatar,
  InlineError,
  Modal,
  Spinner,
  upload,
  useApp,
  useResource,
  useTask,
  type Profile,
} from './shared';
export default function Settings({
  chatgpt,
  deleted,
}: {
  chatgpt: (link: boolean, accepted: boolean) => Promise<void>;
  deleted: () => void;
}) {
  const { user, sync, refreshUser, refresh, notify, openProfile } = useApp(),
    { busy, task } = useTask(),
    [deleting, setDeleting] = useState(false),
    requests = useResource<{ data: Profile[] }>('/api/follow-requests', sync),
    blocks = useResource<{ data: { id: string; username: string; displayName: string }[] }>(
      '/api/blocks',
      sync,
    );
  if (!user) return null;
  const photo = (kind: 'avatar' | 'cover', file: File) =>
    void task(async () => {
      const result = await upload(file);
      await api('/api/account', 'PATCH', {
        [kind === 'avatar' ? 'avatarMediaId' : 'coverMediaId']: result.id,
      });
      await refreshUser();
      refresh();
      notify('Foto actualizada.');
    });
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">A TU MANERA</span>
        <h1>Tu perfil y tu cuenta</h1>
        <p>Decide qué compartes y con quién conectas.</p>
      </div>
      <section className="card settings-card">
        <h2>Perfil público</h2>
        <div className="settings-photo">
          <Avatar person={user} size="large" />
          <div>
            <label className="button outline compact">
              <Camera size={16} />
              Cambiar foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) photo('avatar', file);
                  e.target.value = '';
                }}
              />
            </label>
            <label className="text-button small">
              Cambiar portada
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) photo('cover', file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <form
          key={user.id + user.username + user.displayName + user.bio + user.isPrivate}
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            void task(async () => {
              await api('/api/account', 'PATCH', {
                ...values,
                isPrivate: values.isPrivate === 'on',
              });
              await refreshUser();
              refresh();
              notify('Tu perfil está actualizado.');
            });
          }}
        >
          <label>
            Nombre visible
            <input name="displayName" defaultValue={user.displayName} required maxLength={80} />
          </label>
          <label>
            Nombre de usuario
            <input
              name="username"
              defaultValue={user.username}
              required
              pattern="[a-zA-Z0-9_]+"
              minLength={3}
              maxLength={30}
            />
          </label>
          <label>
            Cuéntanos algo de ti
            <textarea
              name="bio"
              defaultValue={user.bio}
              maxLength={500}
              rows={3}
              placeholder="Describe tus intereses…"
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="isPrivate" defaultChecked={user.isPrivate} />
            <span>Perfil privado. Aceptarás quién puede seguirte y ver tus publicaciones.</span>
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? <Spinner /> : 'Guardar cambios'}
          </button>
        </form>
      </section>
      <section className="card settings-card">
        <h2>Acceso a tu cuenta</h2>
        <p className="muted">{user.email}</p>
        {user.chatgptLinked ? (
          <p className="connected-label">
            <CheckCircle2 size={17} />
            ChatGPT está vinculado
          </p>
        ) : (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => void task(() => chatgpt(true, true))}
          >
            <Link2 size={16} />
            Vincular ChatGPT
          </button>
        )}
        <form
          className="form spaced"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              values = Object.fromEntries(new FormData(form));
            void task(async () => {
              await api('/api/account/password', 'POST', values);
              form.reset();
              notify('Contraseña actualizada. Se cerraron las otras sesiones.');
            });
          }}
        >
          <label>
            Contraseña actual
            <input name="currentPassword" type="password" autoComplete="current-password" />
          </label>
          <label>
            Nueva contraseña
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <p className="small muted">
            Si acabas de entrar con ChatGPT, puedes dejar vacía la contraseña actual.
          </p>
          <button className="button outline" disabled={busy}>
            Guardar contraseña
          </button>
        </form>
      </section>
      <section className="card settings-card">
        <h2>Solicitudes de seguimiento</h2>
        {requests.error && <InlineError message={requests.error} retry={requests.reload} />}
        <div className="settings-list">
          {requests.data?.data.length === 0 && (
            <p className="muted">No tienes solicitudes pendientes.</p>
          )}
          {requests.data?.data.map((person) => (
            <div key={person.id} className="settings-row">
              <button className="person-link" onClick={() => openProfile(person.id)}>
                <Avatar person={person} />
                <strong>{person.displayName}</strong>
              </button>
              <button
                className="button primary compact"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await api(`/api/follow-requests/${person.id}`, 'POST', {});
                    refresh();
                  })
                }
              >
                Aceptar
              </button>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await api(`/api/follow-requests/${person.id}`, 'DELETE');
                    refresh();
                  })
                }
              >
                Rechazar
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="card settings-card">
        <h2>Cuentas bloqueadas</h2>
        {blocks.error && <InlineError message={blocks.error} retry={blocks.reload} />}
        <div className="settings-list">
          {blocks.data?.data.length === 0 && <p className="muted">No has bloqueado a nadie.</p>}
          {blocks.data?.data.map((person) => (
            <div key={person.id} className="settings-row">
              <span>
                {person.displayName} <small className="muted">@{person.username}</small>
              </span>
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  void task(async () => {
                    await api(`/api/users/${person.id}/block`, 'DELETE');
                    refresh();
                  })
                }
              >
                Desbloquear
              </button>
            </div>
          ))}
        </div>
      </section>
      <section className="card settings-card danger-zone">
        <h2>Eliminar tu cuenta</h2>
        <p>
          Eliminarás tu perfil, publicaciones, comentarios y fotos. Los mensajes que ya enviaste
          pueden permanecer en las conversaciones de otras personas, sin tu perfil.
        </p>
        <button className="button outline danger-text" onClick={() => setDeleting(true)}>
          Quiero eliminar mi cuenta
        </button>
      </section>
      {deleting && (
        <Modal title="Eliminar mi cuenta" close={() => setDeleting(false)}>
          <p>
            Esta acción no se puede deshacer. Escribe <strong>{user.username}</strong> para
            confirmar.
          </p>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              const values = Object.fromEntries(new FormData(e.currentTarget));
              void task(async () => {
                await api('/api/account', 'DELETE', values);
                setDeleting(false);
                deleted();
                notify('Tu cuenta ha sido eliminada.');
              });
            }}
          >
            <label>
              Tu nombre de usuario
              <input name="confirmation" required autoComplete="off" />
            </label>
            <label>
              Contraseña
              <input name="password" type="password" autoComplete="current-password" />
            </label>
            <p className="small muted">
              Si acabas de entrar con ChatGPT, puedes dejar la contraseña vacía.
            </p>
            <button className="button danger" disabled={busy}>
              {busy ? <Spinner /> : 'Eliminar definitivamente'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
