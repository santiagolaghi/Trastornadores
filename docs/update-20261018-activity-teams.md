# TNT: equipos, categorías y destacados por actividad

Versión `20261018`, publicación `tnt-2026-10-18-activity-teams`.

## Equipo a mano

Las tarjetas incluyen «Hablar con el equipo» o «Equipo». La ficha tiene pestañas visibles Equipo, Detalles y Archivos; las áreas abren directamente en Equipo. Las indicaciones y consultas existentes conservan su historial y sus permisos. Los mensajes ya no están debajo de checklist, referencias y archivos vacíos.

La conversación muestra autores, fotos y mensajes compactos. El formato se abre a pedido. Un error conserva el texto y permite reintentar. El encabezado y las pestañas siguen disponibles al desplazarse; las notas privadas permanecen separadas dentro de Detalles.

## Programa y destacados

- Los eventos abren el día dividido en Áreas, Dinámicas y Básicas. «Por horario» conserva el orden cronológico y el arrastre del programa completo. Los sábados mantienen esa vista de horario por defecto.
- Las actividades sin hora siguen apareciendo. Las áreas sin hora permanecen en Logística del evento; las que tienen horario también aparecen en el programa.
- Cada actividad tiene una estrella para destacar o quitar el destacado. Al editarla se elige entre cinco colores. La decisión pertenece a esa actividad específica: una prédica del viernes no cambia la del sábado ni la plantilla.
- Los colores se conservan al actualizar otros datos y aparecen también en el cronograma rápido y la proyección. No se marca automáticamente ninguna actividad existente.

## Datos y comprobaciones

La migración `20261018030254_activity_highlights.sql` agrega `is_featured` y `feature_color` a `tnt_tasks`, y extiende los dos RPC de guardado existentes. No agrega funciones públicas nuevas ni cambia permisos. Los colores tienen una restricción y los clientes que omiten los campos conservan las elecciones existentes.

177 pruebas automatizadas aprobadas. `tests/activity-highlights.sql` pasó en la base real, tanto en una transacción previa a aplicar la migración como después. Comprueba independencia entre actividades, edición desde programa, colores válidos, compatibilidad con clientes anteriores, áreas con horario y permisos de conversación y edición. Todas sus identidades, mensajes y avisos sintéticos se revierten.

El recorrido de Chromium verifica categorías, conversación a un toque, error y reintento sin perder texto, destacado independiente entre días, selección de color, conservación tras recargar datos, acceso a logística y orden cronológico. Usa HTML real, el SDK oficial y respuestas HTTP sintéticas; no envía mensajes a personas reales.

Los asesores de seguridad y rendimiento mantienen los mismos conteos de avisos previos. No se modifican las fechas ni las asignaciones de eventos reales.
