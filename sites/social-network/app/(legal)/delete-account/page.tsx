import DeletionForm from './request-form';
export const metadata = { title: 'Eliminar cuenta · Social Network' };
export default function DeleteAccount() {
  return (
    <>
      <span className="eyebrow">TÚ DECIDES</span>
      <h1>Eliminar tu cuenta de Social Network</h1>
      <p>Puedes solicitarlo desde aquí aunque hayas desinstalado la app.</p>
      <section>
        <h2>Desde la aplicación</h2>
        <p>
          Abre Ajustes → Eliminar tu cuenta. Confirma tu usuario y contraseña, o vuelve a entrar con
          ChatGPT para acreditar tu identidad.
        </p>
      </section>
      <section>
        <h2>Desde esta página</h2>
        <p>
          Registra la solicitud con el correo de tu cuenta. Soporte comprobará tu identidad antes de
          eliminar datos. También puedes escribir a{' '}
          <a href="mailto:jlozoya1995+socialnetwork@gmail.com?subject=Eliminar%20mi%20cuenta%20de%20Social%20Network">
            jlozoya1995+socialnetwork@gmail.com
          </a>
          . No envíes contraseñas ni códigos.
        </p>
        <DeletionForm />
      </section>
      <section>
        <h2>Qué se elimina</h2>
        <p>
          Tu perfil, acceso, sesiones, publicaciones, comentarios, reacciones, seguimientos,
          bloqueos y fotografías asociadas. Si hay un fallo temporal del almacenamiento, la retirada
          de archivos queda en una cola de reintento.
        </p>
        <p>
          Los mensajes enviados pueden conservarse en las conversaciones de otras personas, sin tu
          perfil y atribuidos a «Usuario eliminado». Si quieres retirar mensajes concretos, bórralos
          desde la conversación antes de eliminar tu cuenta. Consulta la{' '}
          <a href="/privacy">política de privacidad</a> para los detalles de conservación de
          solicitudes y moderación.
        </p>
      </section>
    </>
  );
}
