# TNT · experiencia y gestión del equipo

Esta versión pone las novedades en la portada de staff y comunidad, introduce Estudio TNT y aplica permisos de Organización al encuentro concreto. Un permiso para editar una actividad requiere también coordinar su encuentro. El control se aplica en la interfaz, en las funciones de base y en las políticas de las tablas.

## Uso

- Administración → Configuración → Estudio TNT: habilitar módulos, elegir portada y color, editar títulos y tutoriales.
- Modo desarrollo: tocar un texto, aplicar al borrador, recorrer Vista previa y Publicar. Cancelar vuelve al contenido publicado. Una revisión antigua no puede sobrescribir una publicación posterior; se puede tomar la última versión o restaurar una versión en un nuevo borrador.
- Organización: tocar un sábado abre su agenda. Cronograma rápido muestra el programa, los horarios, materiales, instrucciones y responsables. Ir a ver está disponible para administradores y coordinadores. Las actividades permiten deslizar para editar o eliminar y Guardar y agregar otra.
- Seleccionar varias: actividades, conversaciones, perfiles e inscripciones. Los avisos también ofrecen acciones por lote. Las operaciones recuperables tienen Deshacer; una respuesta parcial identifica qué registros no se pudieron modificar.
- Cuenta → Avisos en el teléfono: activar en cada dispositivo. El usuario debe conceder el permiso del navegador. En iPhone se usa la app agregada a la pantalla de inicio.
- Cómo se usa: reabrir el tutorial del módulo. Se conserva el paso sin terminar y se puede omitir. Completar el perfil obligatorio se exige por separado.

Las fotos de personas provienen de sus cuentas Google. Las portadas se pueden subir con la cuenta administradora. La búsqueda de coincidencias ofrece confirmar el nombre existente; unir los historiales conserva la revisión de identidad.

## Datos y actualizaciones

Los módulos pausados preservan sus datos y bloquean el acceso del staff por enlace y por API; los administradores pueden revisarlos. Las acciones por lote preservan historial. Las notificaciones generales tienen estado individual: leerlas o eliminarlas no cambia el estado de otras personas. Los avisos atendidos pasan a Resueltos.

Las páginas reciben cambios mediante Supabase Realtime. Los formularios abiertos, borradores del chat, búsquedas y carrito se conservan. Las suscripciones del teléfono se verifican de nuevo al entregar cada aviso, incluyendo pertenencia al chat, destinatarios privados, permisos y estado leído/eliminado/resuelto.

El worker `camp-notifications` conserva el envío de Campamento y procesa la cola TNT con autenticación privada del programador. Los secretos permanecen en Vault. Las pruebas no envían mensajes ni avisos a personas reales.

## Verificación

```sh
NODE_PATH=/workspace/scratch/49002f024e59/tnt-review-deps/node_modules node --test tests/regression.cjs tests/push-worker.cjs
```

116 pruebas de interfaz y worker. `tests/team-permissions.sql` comprueba 19 comportamientos con las funciones y políticas reales, crea sus datos dentro de una transacción y termina con ROLLBACK. También se verificó la copia de producción y la sintaxis de todos los scripts modificados.

La entrega física y la apariencia de las notificaciones dependen del dispositivo y del permiso concedido. Se comprobó el procesamiento del worker y la lógica de entrega con un proveedor simulado; el teléfono del usuario no se usó para una prueba de envío.
