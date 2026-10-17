# TNT: navegación móvil y chat

Versión `20261017r3`, con identificador de publicación `tnt-2026-10-17-ux-chat`.

## Cambios

- Las pestañas de Organización conservan el ancho de su contenido y tienen separación real. No se comprimen dentro de columnas más angostas que sus botones.
- Mi TNT muestra cada encuentro una sola vez en «Lo que viene». Las actividades personales siguen separadas del resumen de coordinación.
- El menú de cuenta comparte la identidad elegida en TNT: cabecera con foto y rol, acciones con iconos y grupos de cuenta, experiencia y administración. Permite cerrar con el botón, Escape o al tocar afuera.
- El carrusel responde al arrastre sobre la foto y admite gestos cortos. En pantallas táctiles, la imagen pierde su captura inicial cuando se transfiere al contenedor: ese evento ya no cancela el gesto. Los movimientos verticales siguen desplazando la página y el arrastre no abre accidentalmente un módulo.
- El chat usa su propia paleta de WhatsApp en claro y oscuro, con dos columnas en escritorio y conversación completa en móvil. Incluye búsqueda, filtros Todos/No leídos/Grupos, fechas HOY/AYER, mensajes cronológicos, burbujas compactas y compositor con emojis, adjuntos y alternancia entre micrófono y envío.
- Se conservan las funciones existentes de audio, respuesta, reacciones, mensajes destacados, formato, color individual de burbuja y permisos de conversación. Los estados de participantes muestran datos disponibles, sin inventar presencia en línea.
- Se actualizaron las referencias de archivos y el worker para distribuir la nueva interfaz.

## Comprobaciones

169 pruebas automatizadas aprobadas. El recorrido completo en Chromium, con HTML real, SDK oficial y respuestas HTTP de cuentas ficticias, terminó sin errores de página. Comprueba el deslizamiento táctil nativo desde una imagen, separación entre pestañas, encuentros únicos, menú de cuenta, paletas de chat, tamaños móvil/escritorio y espacio entre compositor y navegación.

Los disparadores de avisos de chat y el proceso de envío están activos. Se comprobó actividad de envío reciente y suscripciones registradas sin mandar mensajes reales de prueba. La recepción en un teléfono personal depende de habilitar «Avisos en mi teléfono» y sigue requiriendo una comprobación en ese dispositivo.

Esta publicación no modifica la base de datos.
