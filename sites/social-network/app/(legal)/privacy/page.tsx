export const metadata = { title: 'Privacidad · Social Network' };
export default function Privacy() {
  return (
    <>
      <span className="eyebrow">TU INFORMACIÓN, CON CLARIDAD</span>
      <h1>Política de privacidad</h1>
      <p>Social Network · Actualizada el 27 de octubre de 2026</p>
      <section>
        <h2>Responsable y contacto</h2>
        <p>
          La administración de Social Network opera este servicio. Para preguntas sobre privacidad,
          acceso o eliminación de datos, escribe a{' '}
          <a href="mailto:jlozoya1995+socialnetwork@gmail.com">
            jlozoya1995+socialnetwork@gmail.com
          </a>
          .
        </p>
      </section>
      <section>
        <h2>Qué información usamos</h2>
        <ul>
          <li>
            Cuenta: correo electrónico, nombre visible, usuario, biografía y las fotos de perfil o
            portada que elijas.
          </li>
          <li>
            Acceso: una huella criptográfica de tu contraseña si usas este método, sesiones y datos
            necesarios para proteger el acceso. No guardamos tu contraseña en texto legible.
          </li>
          <li>
            ChatGPT: si eliges ese acceso, recibimos un identificador de tu identidad en este sitio,
            tu correo y, cuando está disponible, tu nombre. No recibimos tu contraseña ni tus
            conversaciones de ChatGPT.
          </li>
          <li>
            Contenido: publicaciones, fotos, comentarios, reacciones, seguimientos, bloqueos,
            mensajes y denuncias que creas.
          </li>
          <li>
            Operación: límites de intentos, identificadores técnicos de conexión y solicitudes de
            soporte o de eliminación. Los proveedores de alojamiento y conexión pueden procesar
            direcciones IP y registros operativos.
          </li>
        </ul>
      </section>
      <section>
        <h2>Para qué los usamos</h2>
        <p>
          Para ofrecer perfiles y publicaciones, entregar mensajes, aplicar tus preferencias de
          privacidad, mantener tu sesión, evitar abusos y revisar denuncias. Esta versión no integra
          anuncios ni vende datos personales.
        </p>
      </section>
      <section>
        <h2>Qué pueden ver otras personas</h2>
        <p>
          Tu nombre visible, usuario, biografía, foto de perfil y portada pueden verse en tu perfil.
          Tu correo no se muestra a otros miembros. Puedes hacer privado tu perfil y elegir Público,
          Seguidores o Sólo yo en cada publicación. El bloqueo impide el acceso entre ambas cuentas
          autenticadas; el contenido público sigue siendo accesible a visitantes sin sesión.
        </p>
        <p>
          Los mensajes se muestran a los participantes de la conversación. Cuando alguien denuncia
          un mensaje, el equipo de moderación puede consultar ese mensaje para revisar la denuncia.
          La mensajería no ofrece cifrado de extremo a extremo.
        </p>
      </section>
      <section>
        <h2>Proveedores</h2>
        <p>
          El servicio se aloja en ChatGPT Sites, con datos en D1 y fotos en R2 mediante la
          infraestructura de OpenAI y Cloudflare. Ably entrega avisos de cambios en tiempo real y
          procesa identificadores técnicos y datos de conexión. Los avisos que publicamos en Ably no
          incluyen el texto de tus mensajes ni tus publicaciones; el contenido se obtiene desde
          nuestra API con sus permisos de acceso. ChatGPT participa además cuando eliges ese método
          de acceso. Estos proveedores pueden tratar información fuera de tu país de residencia.
        </p>
      </section>
      <section>
        <h2>Almacenamiento y seguridad</h2>
        <p>
          Usamos HTTPS para las comunicaciones, contraseñas con sal y derivación criptográfica,
          cookies de sesión HttpOnly y comprobaciones de acceso en el servidor. La aplicación
          prepara las fotos antes de subirlas. No compartas contraseñas, información financiera,
          datos de salud o documentos de identidad por el chat.
        </p>
        <p>
          La cookie de Social Network puede mantener tu sesión durante 30 días. Los códigos de
          acceso entre el navegador y la app caducan en dos minutos y se consumen una sola vez.
          ChatGPT puede utilizar sus propias cookies al iniciar sesión. No instalamos cookies
          publicitarias desde la aplicación.
        </p>
      </section>
      <section>
        <h2>Conservación y eliminación</h2>
        <p>
          Conservamos tu cuenta y contenido mientras utilices el servicio. Puedes eliminar tu cuenta
          desde Ajustes o solicitarlo sin reinstalar la app en{' '}
          <a href="/delete-account">Eliminar cuenta</a>. La eliminación retira el perfil,
          credenciales, sesiones, publicaciones, comentarios, reacciones, seguimientos, bloqueos y
          fotos asociadas. Si el proveedor de archivos no responde, la retirada de las fotos queda
          en una cola de reintento.
        </p>
        <p>
          Los mensajes ya enviados pueden permanecer en las conversaciones de otras personas
          atribuidos a «Usuario eliminado». Puedes borrar tus mensajes antes de eliminar la cuenta.
          Las denuncias que presentaste se eliminan junto con tu cuenta. Las denuncias resueltas de
          otras personas y las solicitudes atendidas se depuran en el mantenimiento del servicio, a
          partir de 90 y 30 días respectivamente. Las solicitudes pendientes se conservan mientras
          se comprueba la identidad y se atiende la petición.
        </p>
      </section>
      <section>
        <h2>Edad y tus opciones</h2>
        <p>
          Social Network está dirigido a personas de 18 años o más. Si identificas una cuenta de un
          menor o tienes dudas sobre tus datos, utiliza el correo de soporte. Puedes editar tu
          perfil, cambiar privacidad, bloquear usuarios, cerrar sesión y solicitar acceso,
          corrección o eliminación de tus datos desde el mismo contacto.
        </p>
      </section>
    </>
  );
}
