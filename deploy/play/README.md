# Publicación de Social Network en Google Play

Primera beta publicada el 27 de octubre de 2026 en el canal de pruebas internas.
Play Console confirmó **Available to internal testers**. El único tester
seleccionado es la cuenta del propietario de Play Console.

- Paquete: `io.lozoya.socialnetwork`.
- Versión: `1.0`, código `1`; API mínima 24, destino 36.
- [Instalar la prueba interna](https://play.google.com/apps/internaltest/4701543898566185898).
- [Administrar el canal](https://play.google.com/console/u/0/developers/6439095547353071593/app/4973046562137387783/tracks/4701543898566185898?tab=releases).
- [Compilación de Android](https://github.com/jlozoya/social-network/actions/runs/40608013907).
- Fuente del AAB: commit `6eb58d73efe546cf87462a630d6eff59d6ea720c`,
  rama `fernando/play-internal-20261027`.
- SHA-256 del AAB firmado:
  `7c7349842124a541fd4197d2b7b5319073f5a236b71221e07bdd91727e0b3f95`.

El AAB local está en
`apps/mobile/android/release-artifacts/social-network-1.0-internal-signed.aab`;
`release-metadata.json` guarda la trazabilidad. Ambos son salidas ignoradas.
Se verificaron la firma con `jarsigner`, la estructura con bundletool 1.18.3
y el manifiesto final. Google Play aceptó el paquete y activó su distribución
interna. No se ha realizado una prueba en un dispositivo físico.

Google Play gestiona la clave de firma de distribución. La clave de **carga**
permanece local en `.android-signing/`, excluida de Git. Su contraseña está
cifrada mediante Windows DPAPI para esta cuenta de Windows y no se transmite
a GitHub. Conservar esta carpeta y gestionar una copia recuperable antes de
cambiar de cuenta o equipo. No generar otra clave para una actualización sin
tramitar antes el cambio de clave de carga en Play Console.

Para firmar un AAB posterior con la misma clave:

```powershell
./apps/mobile/scripts/sign-android-aab.ps1 -InputBundle ruta/al/original.aab -OutputBundle ruta/al/firmado.aab
```

La advertencia de Play sobre el archivo de desofuscación no bloqueó la beta;
la compilación tiene `minifyEnabled false`. La app conserva un nombre temporal
en Play hasta recibir su primera revisión. Las páginas de privacidad y soporte
están publicadas en el Site, pero esta publicación interna no equivale a una
publicación de producción en la tienda.

El correo y teléfono de contacto de la cuenta estaban verificados. Tras la
publicación, el banner de inactividad seguía visible: no se confirmó aún que
Google hubiera retirado ese aviso. No asumir que desapareció por haber
completado la carga.

La compilación de Android y los controles de Sites pasaron en GitHub. El
trabajo E2E del backend NestJS anterior no llegó a ejecutar sus pruebas por
una incompatibilidad de MongoDB 8 con el kernel del runner Ubuntu 26. Ese
backend no forma parte de este AAB, que usa D1/R2 en Sites y Ably.
