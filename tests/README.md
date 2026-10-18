# TNT regression checks

## Equipos y destacados por actividad, 18 de octubre de 2026

- 177 pruebas de DOM, permisos, caché y push. Se agregan categorías, acceso directo a Equipo, errores de envío conservando el borrador, destacados por actividad y controles según permisos.
- `activity-highlights.sql` verifica los dos RPC reales, metadatos opcionales, colores válidos, independencia entre ocurrencias y permisos del equipo. Toda la transacción se revierte.
- `TNT_TEST_HIGHLIGHT_ONLY=1` ejecuta solo el recorrido de categorías, equipo y destacados en `browser-flows.cjs`; el recorrido completo también lo incluye.

## Guardado de eventos y actividades sin horario, 17 de octubre de 2026

- La suite completa de DOM, permisos, caché y push pasa con 172 pruebas.
- `event-config-save.sql` comprueba el RPC real con identidades sintéticas y rollback: tres días, edición persistida, eliminación de días vacíos, protección de días con actividades sin hora y rechazo a personas sin permiso.
- `browser-flows.cjs` verifica el botón Guardar siempre visible en celular y escritorio, un error seguido de reintento con el formulario conservado, los días al volver a editar y la separación entre logística y programa. `TNT_TEST_EVENT_ONLY=1` ejecuta solo este recorrido.
- El cronograma completo, el rápido y la proyección incluyen actividades sin hora. Las áreas de logística y sus subtareas permanecen en el evento.

## Avisos, perfiles y programa del 16 de octubre de 2026

- Las regresiones de interfaz, permisos, caché y push se ejecutan con `node --test tests/regression.cjs tests/permissions-and-cache.cjs tests/phone-client.cjs tests/pwa-worker.cjs tests/push-worker.cjs` (152 pruebas). La configuración conserva todas las preguntas visibles como obligatorias y respeta sus roles; también se comprueba que un administrador pueda responder una pregunta exclusiva de su rol.
- `browser-flows.cjs` ejecuta el HTML de producción y el SDK oficial con respuestas HTTP sintéticas. Comprueba el arrastre táctil de Canciones antes de Reflexión, ajuste de horarios, persistencia tras recargar y restauración ante conflictos. Una cuenta ya registrada queda bloqueada por una respuesta pendiente y vuelve a entrar después de completarla. La vinculación tiene una confirmación de identidad, prioridad automática de Google y valores finales plegables.
- `requests-links-order.sql` pasó en Supabase dentro de una transacción revertida. Comprueba avisos con nombre y acción, un solo aviso de alta por cuenta, campos modificados sin revelar respuestas privadas, prioridad de Google incluso con clientes anteriores, omisión de habilidades nulas, conservación del historial, foto y permisos, orden y horarios atómicos en Buenos Aires, rechazo de versiones antiguas y bloqueo de usuarios sin permiso o con perfil incompleto.
- El nuevo RPC público de orden es un invocador autenticado; la implementación privilegiada vive en el esquema no expuesto `tnt_actions`. Las advertencias existentes de funciones privilegiadas y extensión pública siguen documentadas por el [analizador de seguridad de Supabase](https://supabase.com/docs/guides/database/database-linter). No se agregan funciones privilegiadas anónimas ni se fusionan personas reales durante las pruebas.
- El worker y las referencias de los archivos modificados usan la versión `20261016`, conservando el manifiesto canónico y los iconos vigentes. La prueba de teléfono en Chromium usa el worker real y simula únicamente el permiso y la visualización del sistema operativo; no representa una prueba en un teléfono físico.

Run DOM tests from the repository root with Node 22 or later and jsdom 26.1.0 / acorn 8.15.0 on NODE_PATH:

```sh
node --test tests/regression.cjs tests/permissions-and-cache.cjs
```

The browser fixtures contain synthetic people and in-memory data only. `__preview__` is temporary and is removed before production. The Vercel deployment excludes tests and database migrations.

Validated on 26 September 2026:

- Active HTML scripts parse; every module has one central runtime and its shared components.
- Assigned activities are highlighted; other activities stay neutral. Filters and calendar dates work.
- Native task details retain checklists, responses, editing and replacement tools.
- Chat shows roster, shared reactions and per-room drafts. Failed writes preserve the draft; a retry sends once.
- Task editing preserves the form on errors and serializes Buenos Aires time.
- Hub counters use live assignments and authorized modules only.
- SQL transactions verified recurrence generation, idempotency and off setting; contextual chat permissions, roster access without recursive policies, peer reactions and prevented self promotion; event duplication; atomic task/calendar/team updates and deletion. Test transactions were rolled back.
- Existing Supabase advisor warnings concern the bootstrap table, pg_trgm extension schema, existing guarded public helpers and password protection. No new public definer function was added. See https://supabase.com/docs/guides/database/database-linter for the existing notices.

Authenticated Google login is preserved. Browser UI review uses a separate synthetic fixture; it does not impersonate the user's session or send real messages.

## Verificación del 30 de septiembre de 2026

- 38 pruebas de interfaz con jsdom: se ejecuta el alta con el runtime real y una base simulada; cambios de selector esperan el popstate asíncrono; administración muestra permisos heredados; comunidad no recibe módulos de staff; Glosario y Prédicas renderizan sin lectores de PDF/Word.
- `tests/staff-permissions.sql` se ejecutó en una transacción revertida: nueva cuenta sin privilegios, petición de Pastor/a sin acceso, bloqueo de autoaprobación, corrección a Timoteo por administrador, directorio restringido, exclusión de EFE y chat solo por membresía.
- El navegador Chromium local no pudo iniciarse por restricciones del entorno. No se afirma una prueba visual en Android ni un ingreso real por Google en esta revisión.
- Pendiente externo: las APIs originales de Lista Sábados y EFE requieren sus credenciales anteriores. No se ha migrado el historial faltante. No se borraron ni sustituyeron esos datos.


## Verificación del 3 de octubre de 2026

- 64 pruebas de interfaz y caché: alta inicial completa, solicitud de rol pendiente, selectores conservados, permisos efectivos por rol y excepciones, archivados/restauración, nombres coincidentes sin fusión automática, revisión de cambios públicos y verificación de identidad antes de vincular Google.
- Cinco transacciones de prueba en Supabase, revertidas: `profile-review.sql`, `profile-lifecycle.sql`, `profile-link-conflicts.sql`, `effective-permissions.sql` y `staff-permissions.sql`. Cubren aislamiento de comunidad, bloqueo de autoaprobación, aprobación efectiva de acceso, historial transferido sin ampliar permisos, conflictos sin pérdida de datos, archivado/restauración, Perfiles de lectura y operaciones de Buffet con stock y vuelto.
- Recuento real después de las pruebas: 62 personas, 127 registros de asistencia de Sábados, 21 registros de EFE y ninguna cuenta sintética restante. Las dos cuentas de Santiago siguen separadas para pruebas.
- Sábados ya usa los registros originales recuperados. El resto del historial de la aplicación anterior de EFE sigue protegido por contraseña o patrón; se necesita una sesión de su grupo para importarlo.
- Perfiles retira su antiguo worker: elimina solo su caché y no almacena respuestas privadas de Supabase. El worker compartido conserva cachés ajenas.
- La revisión visual de los módulos privados y la grabación en un teléfono real requieren iniciar sesión. Estas pruebas automáticas no sustituyen esa comprobación.

## Verificación del 4 de octubre de 2026

- 86 pruebas de interfaz y caché: perfil obligatorio para cuentas nuevas y existentes, conservación de respuestas ante errores, intereses múltiples, sugerencia de EFE por cumpleaños y selección manual, portada de comunidad y configuración de todas las preguntas desde Administración.
- `tests/community-profiles.sql` se ejecuta dentro de una transacción revertida. Verifica el bloqueo de permisos y lecturas antes de completar el perfil, validación del servidor, configuración de obligatoriedad, EFE sin conceder permisos de staff, protección de datos ya registrados y revisión de vinculaciones sin perder respuestas ni historial.
- Los campos comunes están visibles y son obligatorios por defecto. Administración puede cambiar etiquetas, opciones, visibilidad y obligatoriedad, y agregar preguntas. Cambiar un campo a obligatorio vuelve a pedirlo a quienes todavía no lo completaron.
- La agenda de comunidad muestra solo eventos confirmados o en curso que Organización haya marcado como visibles para la comunidad. Administración publica las novedades. No se comparten detalles operativos de los eventos.
- El navegador Chromium local no pudo iniciarse por restricciones del entorno. La verificación en navegador remoto no incluye un inicio real por Google ni una prueba en un teléfono físico.

## Corrección de Perfiles del 4 de octubre de 2026

- 102 pruebas de interfaz y caché pasan. Perfiles usa `tnt-theme`, responde a cambios del tema compartido y habilita las acciones según los permisos cargados por el runtime.
- Eliminar mueve el perfil a Papelera; Archivar sigue siendo una acción independiente. Se comprueban la revisión de registros coincidentes, cancelación con Atrás, errores conservando la ficha y reintentos sin duplicar operaciones.
- `tests/profile-deletion.sql` pasó en una transacción revertida con cuentas sintéticas. Comprueba permisos de lectura y eliminación, bloqueo para perfiles incompletos, protección de la cuenta propia, conservación de identidad Google, asistencias y pagos, restauración de membresías y conservación del estado archivado anterior.
- El recuento posterior confirmó cero cuentas y campamentos temporales. Las dos nuevas funciones requieren autenticación y permiso de eliminación; cuentas vinculadas a Google requieren administración. No se agregaron funciones accesibles al público sin iniciar sesión.

## Corrección funcional y visual del 13 de octubre de 2026

- 137 regresiones de interfaz, permisos, caché y avisos, más `browser-flows.cjs` con el HTML publicado, carga real de scripts y el SDK oficial de Supabase. El navegador usa respuestas HTTP sintéticas y comprueba móvil, escritorio y tema oscuro.
- La carga inicial incluye revisión de vínculos, una ficha de perfil completa y un editor único. Se retira la presentación adicional; Mi perfil queda fijo en las acciones de Perfiles. El perfil propio sigue disponible sin acceder al directorio.
- Encuentros reúne sábados y eventos. La coordinación cuenta como responsabilidad aunque no haya actividades individuales. Se comprueban el banner interactivo, asignaciones directas, ausencia de confirmaciones y controles de estados, edición y eliminación recuperable.
- Plantillas se edita como un programa visual. Reordenar conserva el borrador; un error no guarda partes sueltas. El servidor comprueba permisos, versión y pertenencia de cada actividad.
- Asistencia y las listas largas se pliegan sin perder filtros. Campamento agrupa sus permisos de salud sin ampliar quién puede leerlos. Recursos acepta enlaces sin esquema y usa el módulo y columna de autor correctos.
- `oct13-flows.sql`, `refinements.sql` y `phone-notifications.sql` pasan dentro de transacciones revertidas. Cubren EFE sin autoautorizar permisos, plantillas atómicas, archivos de Organización con Glosario pausado, conservación de historial y permisos de Buffet, avisos de asignación directa y suscripciones de teléfono aisladas por cuenta.
- Se reemplazan SVG, favicon PNG, iconos de instalación y máscara de Android; las portadas predeterminadas se sirven desde archivos locales. Los avisos se muestran en la misma capa de la ventana abierta.
- Esta revisión no incluye un teléfono Android físico ni una sesión Google real. La renovación del icono instalado y la entrega de avisos en ese dispositivo dependen también del navegador y de la autorización del teléfono.

Para ejecutar las pruebas en navegador, instalar `playwright-core`, proporcionar Chromium en `TNT_TEST_BROWSER` y el UMD indicado por `vercel.json` en `TNT_TEST_SDK`; ejecutar `node tests/browser-flows.cjs`. Las capturas y los datos sintéticos no se publican como contenido de la aplicación.

## Notificaciones y actualización del 14 de octubre de 2026

- 148 pruebas de interfaz, permisos, caché, worker y teléfono. `phone-client.cjs` comprueba activación sin confundir avisos locales con push, recuperación solo para cuentas que optaron por avisos, desactivación, cambio de cuenta y recepción confirmada por el worker.
- `pwa-worker.cjs` comprueba renovación de manifiestos e iconos antiguos con fallback sin conexión, instalación parcial ante un módulo caído y confirmación de recepción después de mostrar el aviso.
- `phone-notifications.sql` también comprueba las RPC de prueba real: aislamiento por cuenta y dispositivo, deduplicación por minuto, consulta del estado propio y cancelación al desactivar. Toda la prueba se revierte. Las RPC públicas son invocadores; el acceso privilegiado vive en el esquema no expuesto `tnt_phone`.
- `TNT_TEST_PHONE=1 node tests/browser-flows.cjs` activa el service worker de Chromium y entrega un evento push mediante CDP. Verifica entrada directa a Organización, renovación de iconos/manifiestos antiguos, caché sin conexión, actualización sin recargar un borrador y recepción tardía después de que el servidor ya informó «enviado».
- Si el navegador de pruebas no admite visualización nativa de avisos, usar `TNT_TEST_MOCK_NOTIFICATIONS=1`; solo el permiso y la visualización del sistema operativo se simulan. El worker, el evento push, los mensajes al cliente, el caché y la interfaz se ejecutan en Chromium. Esa opción fue necesaria en este entorno y no sustituye la prueba en un teléfono físico.
- El servidor remoto conserva autenticación por secreto, despacha cada 30 segundos y responde 200. Un fallo al reclamar la cola ahora informa error; los iconos del payload llevan versión. La pantalla «Avisos en el teléfono» permite enviar y comprobar una prueba desde el servidor.
