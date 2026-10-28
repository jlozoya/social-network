'use client';
import { api, Empty, InlineError, useApp, useResource, useTask } from './shared';
type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  targetContent: string | null;
  reporterUsername: string | null;
};
type Deletion = { id: string; email: string; note: string };
export default function Moderation() {
  const { user, sync, refresh } = useApp(),
    { busy, task } = useTask(),
    reports = useResource<{ data: Report[] }>('/api/moderation/reports', sync),
    suspended = useResource<{ data: { id: string; username: string; displayName: string }[] }>(
      '/api/moderation/users',
      sync,
    ),
    deletions = useResource<{ data: Deletion[] }>(
      user?.role === 'admin' ? '/api/moderation/deletion-requests' : null,
      sync,
    );
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CUIDAMOS ESTE ESPACIO</span>
        <h1>Moderación</h1>
        <p>Revisa el contexto de cada denuncia antes de tomar una decisión.</p>
      </div>
      <section className="card settings-card">
        <h2>Denuncias pendientes</h2>
        {reports.error && <InlineError message={reports.error} retry={reports.reload} />}
        <div>
          {reports.data?.data.map((report) => (
            <article key={report.id} className="report-card">
              <span className="eyebrow">
                {report.target_type === 'user'
                  ? 'PERFIL'
                  : report.target_type === 'message'
                    ? 'MENSAJE'
                    : report.target_type === 'comment'
                      ? 'COMENTARIO'
                      : 'PUBLICACIÓN'}
              </span>
              <blockquote>
                {report.targetContent ?? 'Este contenido ya no está disponible.'}
              </blockquote>
              <p>{report.reason}</p>
              <p className="small muted">
                Denunciado por{' '}
                {report.reporterUsername ? `@${report.reporterUsername}` : 'una cuenta eliminada'}
              </p>
              <div className="form-actions">
                <button
                  className="button outline compact"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await api(`/api/moderation/reports/${report.id}`, 'POST', {
                        action: 'dismiss',
                      });
                      refresh();
                    })
                  }
                >
                  Descartar denuncia
                </button>
                <button
                  className="button danger compact"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await api(`/api/moderation/reports/${report.id}`, 'POST', {
                        action: 'remove',
                      });
                      refresh();
                    })
                  }
                >
                  {report.target_type === 'user' ? 'Suspender cuenta' : 'Retirar contenido'}
                </button>
              </div>
            </article>
          ))}
          {reports.data && !reports.data.data.length && (
            <Empty title="No hay denuncias pendientes">
              Las denuncias de la comunidad aparecerán aquí.
            </Empty>
          )}
        </div>
      </section>
      <section className="card settings-card">
        <h2>Cuentas suspendidas</h2>
        {suspended.error && <InlineError message={suspended.error} retry={suspended.reload} />}
        <div className="settings-list">
          {suspended.data?.data.map((person) => (
            <div className="settings-row" key={person.id}>
              <span>
                {person.displayName} <small>@{person.username}</small>
              </span>
              {user?.role === 'admin' && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await api(`/api/moderation/users/${person.id}/restore`, 'POST', {});
                      refresh();
                    })
                  }
                >
                  Restaurar acceso
                </button>
              )}
            </div>
          ))}
          {suspended.data && !suspended.data.data.length && (
            <p className="muted">No hay cuentas suspendidas.</p>
          )}
        </div>
      </section>
      {user?.role === 'admin' && (
        <section className="card settings-card">
          <h2>Solicitudes de eliminación</h2>
          <p className="small muted">
            Comprueba la identidad del solicitante desde el correo de soporte antes de procesar su
            petición. Marcarla como atendida no elimina una cuenta.
          </p>
          {deletions.error && <InlineError message={deletions.error} retry={deletions.reload} />}
          <div>
            {deletions.data?.data.map((request) => (
              <div className="report-card" key={request.id}>
                <strong>{request.email}</strong>
                <p>{request.note}</p>
                <a
                  className="text-button"
                  href={`mailto:${encodeURIComponent(request.email)}?subject=Solicitud%20de%20eliminaci%C3%B3n%20en%20Social%20Network`}
                >
                  Responder desde mi correo
                </a>
                <button
                  className="button outline compact"
                  disabled={busy}
                  onClick={() =>
                    void task(async () => {
                      await api(`/api/moderation/deletion-requests/${request.id}`, 'POST', {});
                      refresh();
                    })
                  }
                >
                  Marcar como atendida
                </button>
              </div>
            ))}
            {deletions.data && !deletions.data.data.length && (
              <p className="muted">No hay solicitudes pendientes.</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
