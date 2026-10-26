# Comunidad TNT

Los nueve espacios se agrupan en Camino de fe, Vida en comunidad y Familias TNT. Para hoy agrega una referencia bíblica y una frase que permanecen fijas durante el día de Argentina. Los espacios sin publicaciones se ocultan cuando corresponde; el equipo conserva su acceso de gestión.

| Espacio | Comunidad | Equipo autorizado |
| --- | --- | --- |
| Bienvenida | Pedir acompañamiento y ver registros compartidos | Líderes y demás staff participan como referentes y no pueden enviar esta solicitud. Administración elige el referente; la persona elegida debe aceptar. Registrar encuentros y distinguir notas privadas |
| Cumpleaños y fechas | Ver los cumpleaños de la comunidad por mes, con próximos, recientes y edad | Publicar y editar fechas especiales |
| Biblia y planes | Elegir versión, libro y capítulo; comenzar planes y marcar avances | Editar lecturas y consignas, publicar, programar y consultar avances |
| Desafíos | Participar, registrar pasos y pausar | Preparar pasos, destinatarios y cierre de participación |
| Preguntas de fe | Consultar en privado o proponer una pregunta para compartir | Responder y publicar únicamente las consultas propuestas para Comunidad |
| Familias | Solicitar la vinculación y responder autorizaciones | Verificar la relación antes de habilitar avisos; editar información y revisar respuestas |
| Bautismos | Leer la información, expresar interés y sumarse a la preparación | Editar significado y preguntas frecuentes; coordinar encuentros y confirmar la realización con fecha |
| Encuestas | Un voto por persona, modificable mientras la encuesta está abierta | Elegir opciones, anonimato, destinatarios y momento de mostrar resultados |
| Dinámicas y juegos | Cinco juegos y propuestas para encuentros | Preparar dinámicas, preguntas con explicaciones, tiempos y vidas |
| Para hoy | Leer la propuesta diaria y elegir los recordatorios | Editar el banco de frases, programar días y elegir la hora del aviso |

## Identidad de TNT

Los espacios nuevos heredan la identidad gráfica original: logo, tipografías, colores, bordes y profundidad. Inicio conserva el tarjetero dinámico con desplazamiento táctil, teclado y selección recordada. El menú de cuenta contiene su propia lista desplazable; la agenda de Inicio sigue el desplazamiento de la página. Los estilos del calendario y las acciones del cronograma se ajustan de forma puntual para conservar fechas y textos completos en celular.

Los estilos TNT Gráfico, Editorial y Estudio mantienen su vista previa y publicación administrativa. El modo claro, oscuro o del dispositivo se guarda como preferencia personal.

## Permisos y datos

Comunidad usa la identidad central de TNT. Los permisos nuevos se delegan por espacio, desde Administrar Comunidad → Permisos del equipo: editar borradores, publicar o administrar. Ser referente no concede acceso de administración. El servidor valida cada transición y las tablas tienen RLS; las escrituras pasan por RPC comprobadas.

Las lecturas iniciadas conservan una copia de sus pasos aunque después se edite el plan. Las ediciones de contenidos tienen control de versión para evitar sobrescribir el trabajo de otra persona. Las preguntas privadas no se publican. Las autorizaciones guardan el texto aceptado y exigen que el contenido no haya cambiado entre su lectura y la respuesta.

## Biblia

El gateway `/api/bible` conserva la credencial en el servidor. Las cinco ediciones principales son NVI, NTV, RVA 2015, RVR 1960 y TLA. Otras ediciones se añaden desde el catálogo opcional. Toda lectura permanece dentro de TNT; una edición sin acceso muestra ese estado y conserva la referencia. Las marcas por referencia, favorita y racha son privadas por cuenta. La configuración comienza plegada y los controles de capítulo siguen accesibles. Los créditos vigentes se muestran discretamente, completos.

Los cumpleaños ya no dependen del opt-out anterior: se muestran para perfiles activos con cuenta habilitada, agrupados por mes y con próximos, recientes y edad. Inicio muestra el contador de cuentas activas únicas. El versículo y la frase diarios aparecen únicamente allí.

## Avisos

Las solicitudes de acompañamiento muestran nombre, foto y un enlace a la persona para quienes ya están autorizados a verlas. Los avisos antiguos se identifican al leerlos, sin volver a enviarlos.

Cada aviso guardado en la app es la fuente para sus envíos a teléfonos. Las publicaciones usan sus destinatarios reales; el permiso de gestión por sí solo no suscribe a un anuncio privado. El worker vuelve a validar acceso, lectura y pertenencia antes de enviar, mantiene reintentos y descarta dispositivos vencidos. La activación de un dispositivo recupera hasta 30 avisos recientes sin duplicarlos por endpoint. Los avisos diarios son voluntarios.

El worker `camp-notifications` conserva su autenticación y agrega `tnt_community_prepare_notifications` antes de reclamar la cola existente. El cron existente lo ejecuta. El centro de avisos se actualiza al recibir el evento del service worker. Estado de avisos muestra agregados sin exponer credenciales ni endpoints.

La recepción física debe comprobarse con la prueba de teléfono desde el dispositivo destinatario. Los ensayos automáticos de presentación del sistema operativo son sintéticos.

## Validación

- Tests Node para permisos, datos, progreso, privacidad, avisos, worker, fotos y juegos.
- PGlite ejecuta las migraciones reales con distintas identidades y roles.
- `tests/community-browser.cjs` usa HTML publicado, Chromium, SDK oficial y RPC conectadas al SQL local: publicación de planes, recuperación tras error, edición de bautismos, aceptación del referente, progreso desde otra cuenta, JPG real, menú, scroll, lector y juegos.
- `tests/browser-flows.cjs` mantiene las verificaciones de Organización, Chat, Perfiles, Asistencia, Campamento, permisos e instalación.
- Capturas y controles de ancho en 320, 390, 768 y 1280 px, en modo claro y oscuro.

Antes de activar la interfaz deben aplicarse las migraciones de Comunidad en orden, desplegar el worker y verificar el cron. La versión del service worker y los assets compartidos deben coincidir para renovar las instalaciones anteriores.
