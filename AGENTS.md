# TNT: conservar identidad y verificar cambios

La referencia visual aprobada usa el logo de dinamita, fondo crema, títulos Archivo Black, tarjetas redondeadas con borde y sombra desplazada, fotografías, cinco paletas personales y navegación Inicio / Comunidad / Perfil.

- Conservar el tarjetero de módulos, sus gestos horizontales, controles y permisos. El desplazamiento vertical de la página siempre debe seguir disponible.
- Paletas y colores pertenecen a `assets/tnt-colors.js`; geometría compartida a `assets/tnt-approved.css`. Evitar nuevos cambios de diseño globales desde un módulo.
- Los colores personales no publican configuración para otras cuentas. El destacado se guarda únicamente en la actividad; no cambia plantillas ni otras ocurrencias.
- Mostrar el nombre de cada responsable junto a su foto. Un contador no reemplaza su identidad.
- Abrir ventanas mediante TNTUI y su historial. Mantenerlas dentro del viewport con 12 px de margen, altura adaptable y desplazamiento interno. Los tutoriales usan ventanas nativas centradas.
- Antes de publicar cambios visuales, comprobar 320/360/390/412/768/1280 px, claro/oscuro y el tutorial en horizontal. Revisar capturas, no sólo medidas.
- Ejecutar las regresiones y `tests/community-browser.cjs` para paletas, destacado, tutoriales, foto, lectura, comunidad y juegos. Conservar las comprobaciones de permisos y privacidad de notificaciones.
- Actualizar las versiones de los recursos modificados y el service worker. No borrar datos, sesiones o preferencias para actualizar el estilo.
- La RVR 1909 local es de dominio público. No atribuir su texto a otra traducción ni copiar traducciones que requieren habilitación de YouVersion.
