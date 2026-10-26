# Biblia, juegos y perfil

La navegación principal reúne Inicio, Comunidad y Perfil. Comunidad contiene dos entradas funcionales: Biblia y juegos. Perfil conserva los datos existentes y usa el nuevo diseño claro/oscuro con foto central, editor de datos y preferencias.

## Fotos

- Se puede elegir una foto propia o la de Google y activar su actualización al volver a iniciar sesión. Una foto propia o la sincronización apagada se respetan en los siguientes ingresos.
- Las imágenes se preparan en el dispositivo, sin metadatos, con un máximo de 1024 píxeles y 2 MB. Se aceptan JPG, PNG y WebP; la subida utiliza WebP.
- El bucket público `tnt-profile-photos` sirve retratos por URL. Insertar, consultar y borrar objetos exige la carpeta del usuario autenticado. El RPC invocador solo cambia la cuenta propia y comprueba la existencia y pertenencia del archivo. No modifica roles ni permisos.
- La migración `20261023001415_profile_photo_preferences` conserva las fotos existentes. Está registrada en Supabase; no debe aplicarse de nuevo manualmente.

## Lectura

- El selector principal contiene NVI (128), NTV (127), RVA 2015 (1782), RVR 1960 (149) y TLA (176). El catálogo opcional permite añadir hasta doce ediciones autorizadas, incluida RVR 1909 local. No hay enlaces de lectura externa.
- `/api/bible` comprueba la sesión y la cuenta habilitada. `YOUVERSION_APP_KEY` permanece exclusivamente en el servidor. La selección de una edición no concede licencia: se solicita el pasaje real y, si no está disponible, se conserva el lugar y se informa dentro de TNT. Un fallo del catálogo o del índice no bloquea un pasaje autorizado.
- La configuración comienza plegada; los controles anterior/siguiente permanecen accesibles al desplazar la lectura. Los créditos vigentes del proveedor se conservan completos, con menor tamaño y peso visual.
- Las marcas guardan libro, capítulo y versículo, sin texto protegido ni ID de traducción. Se muestran al leer la misma referencia en otra edición. La favorita y las traducciones adicionales se guardan por persona.
- La racha usa días únicos del servidor en Argentina. La aplicación registra el día después de un período de lectura visible; los módulos ocultos no suman tiempo. No se aceptan fechas de lectura del cliente.
- Las tablas personales tienen RLS de lectura propia, sin escritura directa. Los RPC comprueban una cuenta habilitada y un perfil completo; ignoran un destinatario ajeno. La consolidación administrativa conserva los datos de lectura y su auditoría.
- La comprobación histórica del 24/10 encontró texto autorizado de RVES (147), VBL (3291) y PdDpt (3365). No certifica el acceso actual a las cinco principales. Las pruebas del navegador usan textos sintéticos para verificar interfaz, autorización, créditos y errores; no sustituyen una prueba real con el proveedor.

## Juegos y verificación

Ordenar libros: tres rondas de 5, 7 o 10 libros, empezando por Génesis o por un segmento aleatorio. Personajes y Antiguo/Nuevo Testamento: diez preguntas. Todos tienen tres vidas, reloj, pausa, dificultad, resultado y mejor marca por persona/dispositivo. Cada ronda renueva la pista. Un acierto completo avanza automáticamente después del feedback; cambiar de módulo pausa el juego.

Pruebas nuevas: `bible-games.cjs`, `bible-api.cjs`, `profile-photo-database.cjs` y `life-browser.cjs`. El SQL se comprueba en PostgreSQL aislado; la navegación y los formularios utilizan Chromium y el SDK oficial de Supabase con respuestas HTTP sintéticas. No equivale a un ingreso Google real ni a una descarga de texto NVI autorizada.

```sh
node --test tests/regression.cjs tests/permissions-and-cache.cjs tests/phone-client.cjs tests/pwa-worker.cjs tests/push-worker.cjs tests/organization-database.cjs tests/roles-community-database.cjs tests/bible-games.cjs tests/bible-api.cjs tests/profile-photo-database.cjs
TNT_TEST_BROWSER=/ruta/chromium TNT_TEST_SDK=/ruta/supabase.min.js node tests/life-browser.cjs
```

Dependencias de prueba: jsdom, acorn, @electric-sql/pglite y playwright-core. El SDK UMD de la prueba debe coincidir con la versión de `vercel.json`. Los recorridos comprueban 320, 390, 768 y 1280 píxeles en ambos temas, incluida la posición completa de la navegación.
