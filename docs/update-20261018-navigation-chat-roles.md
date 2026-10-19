# TNT: ventanas, perfiles y vistos del chat

Versión `20261018r2`, publicación `tnt-2026-10-18-navigation-chat-roles`.

Las ventanas conservan sus padres en una pila compartida. Cerrar con X, Escape o Atrás devuelve al padre con su formulario, pestaña y scroll. Los selectores usan la misma pila. El consumo de un Atrás programático se resuelve en el listener central: en el navegador real, un listener de módulo registrado antes podía cerrar el padre antes de que otro listener consumiera ese evento. Organización conserva sus ventanas previas fuera del contenedor activo para evitar que sus selectores apunten al formulario anterior.

Las estrellas actualizan las tarjetas abiertas y significan destacar esa actividad concreta en color. Perfiles mantiene Archivar/Eliminar al alcance durante la selección, oculta el aviso de registros coincidentes sin alterar los registros y permite a administradores cambiar el rol desde la ficha. Los nombres se presentan y guardan con iniciales mayúsculas. El swipe de asistencia anima la salida y entrada mientras el guardado continúa; cancelar un gesto no registra asistencia. Inicio tiene un banner de encuentros con movimiento y las personas de «Lo que viene» aprovechan el ancho de la tarjeta.

Las fotos del chat se muestran una sola vez, con visor y descarga dentro de él. Los documentos conservan su nombre. Se retiró «Ver responsabilidades» del resumen de contacto. La lectura se confirma con `tnt_mark_chat_read`, usando la fecha del último mensaje recibido en el servidor. La lista conserva esa confirmación durante las actualizaciones; los mensajes posteriores de chats cerrados siguen pendientes. Los vistos de otros participantes comparan fechas numéricas, también cuando el servidor usa otro formato de zona horaria.

## Base de datos

La migración `20261018223919_profile_roles_and_chat_read.sql` mantiene la autorización administrativa de `tnt_review_staff` y admite perfiles centrales sin cuenta: crea únicamente la fila de presentación, sin vincular Google ni modificar el rol de administrador. El nuevo RPC de lectura es invoker y conserva RLS. Un trigger interno de membresías necesitaba ejecutar su comprobación en el esquema privado; su contexto se corrigió sin dar acceso público a ese esquema. El despachador conserva sus credenciales y cola y pasa de consultar cada 30 segundos a cada 5 segundos. El sistema operativo y la conectividad del teléfono siguen influyendo en la entrega final.

## Verificación

Pruebas de interfaz y regresión con datos sintéticos; navegador Chromium móvil y escritorio sobre el HTML publicado y el SDK oficial; pruebas SQL de asignación de rol sin Google y persistencia de lectura con identidades sintéticas y rollback. Las pruebas no envían mensajes reales al equipo. Los asesores de Supabase no señalan hallazgos nuevos para el RPC de lectura ni el trigger privado; conservan avisos previos del proyecto.
