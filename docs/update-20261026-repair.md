# Corrección de navegación y lectura — 26 de octubre de 2026

- Una única barra principal con Inicio, dos accesos personales y Espacios. Los atajos reemplazan los accesos centrales; se pueden ordenar y quitar. Pasar lista abre Asistencia de sábados y Cronograma abre el próximo programa.
- Los módulos abiertos se administran dentro de Espacios → Abiertos. Se conservan formularios, enlaces y posiciones. El marco real identifica un módulo interno aun cuando una redirección pierde la marca de la URL; el título y la selección principal se sincronizan con el contenido. Los permisos se vuelven a comprobar.
- Las ventanas de Organización recuperan su modalidad nativa después de regresar desde otra ventana, incluso al moverlas en navegadores sin moveBefore. Se verificó guardar coordinadores, conservar la selección tras un error y reintentar.
- La confirmación de un perfil valida la fecha y un WhatsApp o DNI antes de enviar. Una solicitud que requiere revisión administrativa muestra su estado y permite continuar con la cuenta actual, sin transferir permisos ni borrar el historial. Errores y esperas dejan el formulario recuperable.
- Las tarjetas de apariencia contienen su nombre, descripción y colores en celular y escritorio.
- El capítulo bíblico usa el ancho disponible, con controles compactos y ajustes plegados. Tamaño e interlineado son ajustables y la barra se oculta al avanzar en la lectura. Los versículos se pueden seleccionar también cuando hay varios en un mismo párrafo. Los favoritos usan las marcas privadas existentes y se pueden reabrir por referencia.
- Se renovaron versiones de recursos y caché sin borrar sesiones, datos ni preferencias. No se modificó el esquema de datos ni se concedieron permisos nuevos.

## Verificación

Se ejecutaron regresiones Node/DOM, comprobaciones SQL aisladas de identidad y privacidad, HTML compilado con el SDK oficial y flujos de navegador con datos sintéticos. Casos específicos: redirección dentro de un módulo, regreso a Inicio, atajos y orden, permisos revocados, selección de versículos en párrafos, guardado y reapertura de favoritos, coordinadores con error/reintento y restauración de ventanas. Se revisaron capturas claro/oscuro, anchos de 320 a 1920 px y orientación horizontal. Las pruebas sintéticas no equivalen a una sesión Google real ni a una prueba física en iPhone.
