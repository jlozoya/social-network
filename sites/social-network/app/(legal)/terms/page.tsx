export const metadata = { title: 'Términos · Social Network' };
export default function Terms() {
  return (
    <>
      <span className="eyebrow">UN BUEN PUNTO DE PARTIDA</span>
      <h1>Términos de uso</h1>
      <p>Social Network · Actualizados el 27 de octubre de 2026</p>
      <section>
        <h2>Tu cuenta</h2>
        <p>
          Para crear una cuenta debes tener al menos 18 años, aceptar estos términos, la política de
          privacidad y las normas de comunidad. Usa información que tengas derecho a utilizar,
          protege tu acceso y no te hagas pasar por otra persona. Puedes entrar con correo y
          contraseña o con ChatGPT; la vinculación de ambos métodos requiere acreditar el acceso a
          la cuenta.
        </p>
      </section>
      <section>
        <h2>Lo que compartes</h2>
        <p>
          Conservas los derechos sobre tu contenido. Al publicarlo, autorizas a Social Network a
          almacenarlo y mostrarlo para prestar el servicio según la audiencia que elijas. Sólo debes
          publicar contenido propio o que tengas permiso para compartir. No publiques información
          privada de otras personas sin su autorización.
        </p>
      </section>
      <section>
        <h2>Convivencia y moderación</h2>
        <p>
          Debes respetar nuestras <a href="/community">normas de comunidad</a>. Prohibimos el acoso,
          amenazas, suplantación, fraude, contenido ilegal y cualquier forma de abuso o explotación
          sexual infantil. Puedes denunciar perfiles, publicaciones, comentarios y mensajes, y
          bloquear cuentas desde la aplicación.
        </p>
        <p>
          El equipo puede retirar contenido que incumpla las normas y suspender cuentas. Si crees
          que una decisión es incorrecta, solicita una revisión en{' '}
          <a href="mailto:jlozoya1995+socialnetwork@gmail.com">
            jlozoya1995+socialnetwork@gmail.com
          </a>
          , indicando tu usuario y el contexto.
        </p>
      </section>
      <section>
        <h2>Servicio y cambios</h2>
        <p>
          Esta primera versión ofrece perfiles, publicaciones con fotos, comentarios, reacciones,
          seguimiento, conversaciones y moderación. Las funciones pueden evolucionar y puede haber
          interrupciones por mantenimiento o disponibilidad de los proveedores. No uses Social
          Network para situaciones que requieran respuesta de emergencia.
        </p>
        <p>
          Los cambios de estos términos se reflejarán en esta página con su fecha. Si afectan de
          forma sustancial a tus derechos o al uso de datos, se informará desde el servicio. Nada de
          estos términos limita derechos que te correspondan por la legislación aplicable.
        </p>
      </section>
      <section>
        <h2>Salir y eliminar tus datos</h2>
        <p>
          Puedes dejar de usar el servicio en cualquier momento y{' '}
          <a href="/delete-account">solicitar la eliminación de tu cuenta</a>. Consulta la política
          de privacidad para conocer qué se retira y el tratamiento de los mensajes ya enviados a
          otras personas.
        </p>
      </section>
    </>
  );
}
