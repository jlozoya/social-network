export const metadata = { title: 'Soporte · Social Network' };
export default function Support() {
  return (
    <>
      <span className="eyebrow">ESTAMOS PARA AYUDARTE</span>
      <h1>Hablemos.</h1>
      <p>
        ¿Tienes un problema de acceso, una pregunta sobre tus datos o una sugerencia para la
        comunidad?
      </p>
      <section className="card">
        <h2>Contacto de Social Network</h2>
        <p>
          <a href="mailto:jlozoya1995+socialnetwork@gmail.com">
            jlozoya1995+socialnetwork@gmail.com
          </a>
        </p>
        <p>
          Indica tu nombre de usuario y describe lo que sucede. No envíes tu contraseña, códigos de
          acceso ni documentos de identidad.
        </p>
      </section>
      <section>
        <h2>Denunciar un problema</h2>
        <p>
          Desde la aplicación puedes denunciar perfiles, publicaciones, comentarios y mensajes.
          Consulta las <a href="/community">normas de comunidad</a> y nuestros{' '}
          <a href="/child-safety">estándares de seguridad infantil</a>.
        </p>
      </section>
      <section>
        <h2>Eliminar tu cuenta</h2>
        <p>
          Puedes hacerlo en Ajustes o{' '}
          <a href="/delete-account">registrar una solicitud desde esta web</a> sin reinstalar la
          aplicación.
        </p>
      </section>
    </>
  );
}
