# Biblia, juegos y perfil

La navegación principal reúne Inicio, Comunidad y Perfil. Comunidad contiene dos entradas funcionales: Biblia y juegos. Perfil conserva los datos existentes y usa el nuevo diseño claro/oscuro con foto central, editor de datos y preferencias.

## Fotos

- Se puede elegir una foto propia o la de Google y activar su actualización al volver a iniciar sesión. Una foto propia o la sincronización apagada se respetan en los siguientes ingresos.
- Las imágenes se preparan en el dispositivo, sin metadatos, con un máximo de 1024 píxeles y 2 MB. Se aceptan JPG, PNG y WebP; la subida utiliza WebP.
- El bucket público `tnt-profile-photos` sirve retratos por URL. Insertar, consultar y borrar objetos exige la carpeta del usuario autenticado. El RPC invocador solo cambia la cuenta propia y comprueba la existencia y pertenencia del archivo. No modifica roles ni permisos.
- La migración `20261023001415_profile_photo_preferences` conserva las fotos existentes. Está registrada en Supabase; no debe aplicarse de nuevo manualmente.

## Lectura

- `/api/bible` comprueba la sesión en Supabase y que la cuenta esté habilitada. La credencial se obtiene únicamente de `YOUVERSION_APP_KEY` en el servidor.
- Registrar una aplicación en YouVersion genera la clave. El acceso al texto requiere además la licencia correspondiente. El lector conserva todas las versiones españolas devueltas por el catálogo autorizado, incluyendo sus páginas, y separa las opciones internas de los enlaces a Bible.com.
- La comprobación real del 24 de octubre de 2026 encontró RVES (147), VBL (3291) y PdDpt (3365) habilitadas. Sus índices incluyen 66 libros y capítulos con IDs de texto. El gateway corrigió esa normalización y devolvió Mateo 5:14-16 con texto y atribución para las tres. RVES devuelve ambos campos de créditos nulos; se identifica explícitamente su edición y fuente YouVersion sin inventar copyright ni atribuirle texto de otra versión.
- NVI (128 y 2664) devuelve 403; su licencia Biblica Fast-track v1 aparece sin aceptación. Debe revisarse en el portal de YouVersion. NTV (127), RVR 1960 (149) y RVA 2015 (1782) devuelven 404 y no aparecen ni en el catálogo completo de esta API. Necesitan una fuente autorizada que las ofrezca. No se habilitan cambiando el nombre ni sustituyendo su texto por RVR 1909.
- «Revisar conexión» actualiza el catálogo y el índice, de modo que una licencia concedida se detecta sin borrar el marcador, los datos ni la sesión. Un fallo temporal del índice usa el índice canónico y conserva la posibilidad de leer el pasaje; un fallo de red no se describe como licencia pendiente.
- Las opciones con licencia pendiente o acceso desconocido comprueban el permiso dentro de TNT al elegirlas. Sólo una versión confirmada como no ofrecida se convierte en enlace externo directo. Para las ediciones solicitadas, el servidor verifica el contenido con el proveedor sin depender de un catálogo anterior; una respuesta de texto siempre requiere su permiso y sus créditos. Las opciones de un menú ya abierto conservan su valor aunque termine de cargar otro catálogo.
- Las opciones externas del selector son enlaces HTTPS nativos con `noopener noreferrer`: abrir una de ellas lleva directamente al destino en otra pestaña y conserva la selección y el marcador internos. El selector se cierra después de que el navegador active el enlace. Se comprobaron los cinco destinos públicos con Mateo 5:14-16 en Bible.com; esto no implica acceso autorizado a su texto dentro de TNT.
- El ID público 2664 corresponde actualmente a NVI Simplificada, no a una edición completa llamada NVI 2015. Su nombre se corrige sin alterar IDs guardados. Para un libro del Antiguo Testamento se abre la página oficial de esa versión y se indica que solo incluye el Nuevo Testamento.
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
