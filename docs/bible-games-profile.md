# Biblia, juegos y perfil

La navegación principal reúne Inicio, Comunidad y Perfil. Comunidad contiene dos entradas funcionales: Biblia y juegos. Perfil conserva los datos existentes y usa el nuevo diseño claro/oscuro con foto central, editor de datos y preferencias.

## Fotos

- Se puede elegir una foto propia o la de Google y activar su actualización al volver a iniciar sesión. Una foto propia o la sincronización apagada se respetan en los siguientes ingresos.
- Las imágenes se preparan en el dispositivo, sin metadatos, con un máximo de 1024 píxeles y 2 MB. Se aceptan JPG, PNG y WebP; la subida utiliza WebP.
- El bucket público `tnt-profile-photos` sirve retratos por URL. Insertar, consultar y borrar objetos exige la carpeta del usuario autenticado. El RPC invocador solo cambia la cuenta propia y comprueba la existencia y pertenencia del archivo. No modifica roles ni permisos.
- La migración `20261023001415_profile_photo_preferences` conserva las fotos existentes. Está registrada en Supabase; no debe aplicarse de nuevo manualmente.

## Lectura

- `/api/bible` comprueba la sesión en Supabase y que la cuenta esté habilitada. La credencial se obtiene únicamente de `YOUVERSION_APP_KEY` en el servidor.
- Registrar una aplicación en YouVersion genera la clave. El acceso al texto requiere además la licencia correspondiente. Para NVI 2025 (128) y NVI 2015 (2664), revisar la licencia Biblica en el portal. El catálogo de versiones del lector usa solo versiones autorizadas.
- La consulta de esta integración devolvió 403 para NVI sin la licencia habilitada. Mientras falte la configuración o autorización, el lector informa que está en preparación. RVR 1960, RVA 2015 y NTV siguen pendientes de una fuente autorizada; no se sustituyen por otra traducción.
- El texto se solicita por capítulo. Se vuelven a obtener los créditos del editor en cada lectura. No se guardan capítulos en localStorage ni en el service worker. Solo se recuerda la referencia, traducción y tamaño de letra por persona.
- Se utilizan los estilos y la tipografía provistos por YouVersion. La API de fuentes se consulta desde el servidor y nunca se devuelve una hoja que incluya la credencial; los archivos de fuente conservan su entrega desde el CDN del proveedor.

## Juegos y verificación

Ordenar libros: tres rondas de 5, 7 o 10 libros. Personajes y Antiguo/Nuevo Testamento: diez preguntas. Todos tienen tres vidas, reloj, pausa, dificultad, resultado y mejor marca por persona/dispositivo. Las pistas son textos originales sobre hechos bíblicos.

Pruebas nuevas: `bible-games.cjs`, `bible-api.cjs`, `profile-photo-database.cjs` y `life-browser.cjs`. El SQL se comprueba en PostgreSQL aislado; la navegación y los formularios utilizan Chromium y el SDK oficial de Supabase con respuestas HTTP sintéticas. No equivale a un ingreso Google real ni a una descarga de texto NVI autorizada.

```sh
node --test tests/regression.cjs tests/permissions-and-cache.cjs tests/phone-client.cjs tests/pwa-worker.cjs tests/push-worker.cjs tests/organization-database.cjs tests/roles-community-database.cjs tests/bible-games.cjs tests/bible-api.cjs tests/profile-photo-database.cjs
TNT_TEST_BROWSER=/ruta/chromium TNT_TEST_SDK=/ruta/supabase.min.js node tests/life-browser.cjs
```

Dependencias de prueba: jsdom, acorn, @electric-sql/pglite y playwright-core. El SDK UMD de la prueba debe coincidir con la versión de `vercel.json`. Los recorridos comprueban 320, 390, 768 y 1280 píxeles en ambos temas, incluida la posición completa de la navegación.
