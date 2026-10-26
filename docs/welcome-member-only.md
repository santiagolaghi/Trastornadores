# Asignación administrativa de acompañamientos

Administración elige quién acompaña a cada persona de Comunidad. Guardar deja la asignación activa y habilita al referente a registrar encuentros; no se envía una invitación ni se pide aceptar o rechazar. Los avisos informan la asignación a ambas personas. Cambiar el referente retira el acceso del anterior y resuelve sus avisos obsoletos.

Líderes, staff aprobado y administradores no pueden solicitar acompañamiento ni figuran en la lista de personas para asignar. La migración cierra los pedidos antiguos del equipo (`unassigned`, `pending`, `declined`), conserva una copia en auditoría y resuelve sus avisos anteriores. Un trigger aplica lo mismo al promover a una persona. Los acompañamientos previamente aceptados y todas sus notas se conservan; los del equipo se muestran aparte como antecedentes.

Las asignaciones pendientes de personas habilitadas de Comunidad pasan a estar activas si su referente sigue habilitado. Se conserva la fecha original, sin inventar una aceptación ni reenviar notificaciones. El rol de la cuenta real se comprueba en el servidor; permisos de edición de Comunidad no conceden facultades de Administración.

Migración: `20261026223709_direct_accompaniment_and_staff_requests.sql`. Pruebas: `tests/direct-accompaniment.cjs` verifica limpieza de datos anteriores, historial, promoción de roles, asignación inmediata y privacidad; `tests/community-browser.cjs` recorre las tres cuentas y el formulario en claro/oscuro, móvil, escritorio, horizontal y altura reducida. `tests/welcome-member-requests.sql` deja disponible una comprobación sintética con rollback para instalaciones reales.

Recursos y service worker de esta revisión: `20261026r3`.
