# TNT: guardado de eventos y cronograma completo

Publicación `tnt-2026-10-17-event-program`. Organización y el worker usan la versión `20261017r4`.

## Guardado

El RPC `tnt_update_event_config` declaraba una variable PL/pgSQL `ord` y también usaba `ord` como columna de la lista de días. Guardar un evento con varios días fallaba con `42702: column reference "ord" is ambiguous`. La migración `20261017211534_event_config_save.sql` renombra la variable y califica las columnas de las consultas. Conserva los permisos, la validación de fechas y la protección contra borrar días con contenido.

El formulario deja el botón y los errores visibles mientras se desplazan sus campos. Indica que está guardando, evita envíos simultáneos y permite reintentar conservando lo escrito ante una respuesta de error o un fallo de conexión. Espera el cierre del formulario antes de actualizar la ficha.

## Actividades y logística

- Las actividades simples y con instrucciones aparecen en el cronograma aunque no tengan hora o una entrada de programa asociada. Las pendientes de ubicar aparecen una vez bajo «Por definir día u horario»; en sábados, bajo «Actividades sin horario».
- Las entradas que ya tienen día, pero no hora, muestran «Sin horario». No se asignan horas ni días inventados.
- La agenda, el cronograma rápido y la proyección comparten los criterios de inclusión. Las áreas de logística y sus subtareas quedan fuera del programa, incluso si conservan entradas antiguas con hora.
- «Logística del evento» conserva las áreas, responsables, materiales, archivos y subtareas dentro de la ficha. Permite agregar un área directamente y abrirla desde el cronograma.
- No se cambian fechas ni contenido de eventos existentes. La proyección descarta las entradas archivadas también al actualizarse.

## Verificación

172 pruebas automatizadas aprobadas, incluidas las nuevas comprobaciones de guardado, reintento y actividades sin horario en eventos con y sin días. El recorrido en Chromium usa el HTML publicado, el SDK oficial y respuestas HTTP de cuentas ficticias. Verifica el botón visible en celular y escritorio, los tres días al volver a editar, el contenido conservado tras un error y la separación entre programa y logística.

`tests/event-config-save.sql` pasó contra la base real antes y después de aplicar la migración. Crea identidades y eventos sintéticos dentro de una transacción que revierte todo. Comprueba altas y edición de días, eliminación de días vacíos, actividades sin hora, errores atómicos y rechazo a una persona sin permiso. No se enviaron mensajes ni avisos de prueba a personas reales.

Los asesores de seguridad y rendimiento no señalan nuevas tablas, índices ni funciones. El aviso genérico sobre el RPC existente con `SECURITY DEFINER` se mantiene: su control de permisos fue conservado y probado.
