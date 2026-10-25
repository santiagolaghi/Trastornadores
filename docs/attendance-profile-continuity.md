# Asistencia y perfiles existentes

El modo swipe empieza en la próxima persona pendiente. Guarda el cursor por cuenta, fecha y grupo, mantiene el progreso registrado y no vuelve a incluir a los marcados al terminar. Los fallos de guardado siguen pendientes. La tarjeta muestra un retrato circular más pequeño y deja espacio para las acciones.

El registro espera la búsqueda por nombre antes de crear un perfil completo. La fecha y el WhatsApp o DNI se comprueban en el servidor; los teléfonos argentinos equivalentes admiten el prefijo internacional. Una selección anterior de «No soy yo» no impide buscar nuevamente desde «Ya tenía un perfil».

Un perfil sin Google puede continuar después de verificar identidad. Si ya tiene una cuenta Google, se prepara una revisión administrativa. La cuenta principal conserva su acceso, foto y permisos. La secundaria queda deshabilitada, no se elimina la identidad de Auth, y el historial se consolida con auditoría. La revisión muestra el correo principal. La cuenta administradora tiene prioridad y no puede reemplazarse por una cuenta de Comunidad.

La migración `20261024232426_profile_claim_retry` se aplicó y registró en Supabase el 25 de octubre de 2026. El SQL registrado coincide con el archivo de este repositorio. Las pruebas `profile-claim-retry.sql` y `profile-continuation.sql` pasaron contra el esquema completo, antes y después de aplicarla, con identidades sintéticas y reversión de todos los datos de prueba. Comprueban identidad, teléfonos equivalentes, cuentas preparadas, historial, auditoría, conservación de permisos y revisión de dos cuentas Google. La prueba administrativa completa también el perfil requerido; no omite esa protección. Los avisos de seguridad y rendimiento de Supabase no aumentaron. No se unieron cuentas reales.

También pasaron 294 pruebas unitarias/DOM/SQL aislado/PWA, el recorrido completo de `community-browser.cjs` y la verificación específica del swipe en seis anchos, claro/oscuro y horizontal. Las respuestas de YouVersion, OAuth y permisos del sistema usadas en esas pruebas son sintéticas: no certifican el texto NVI autorizado, una instalación física ni la recepción push real.
