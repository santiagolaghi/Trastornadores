# TNT regression checks

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
