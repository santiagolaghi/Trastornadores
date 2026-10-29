# Catálogo visual de TNT

Página para abrir desde el celular: https://catalogo-visual-tnt.tangyteal130.chatgpt.site. La entrega principal es la página; los visores de archivos pueden mostrar el HTML descargado como código.

El catálogo permite pedir cambios mediante una referencia permanente, por ejemplo «ORG-013 · Personas del sábado». Incluye rutas, formularios y ventanas, con el rol y el contexto de cada captura. Los datos son ficticios y no representan personas ni operaciones reales.

## Actualización

1. Mantener los IDs de `tests/visual-catalog.cjs`; agregar nuevos sin renumerar.
2. Compilar con `bash scripts/build-static.sh`.
3. Ejecutar `TNT_VISUAL_CATALOG=1 node tests/community-browser.cjs` con las dependencias y el SDK indicados en `tests/README.md`. `TNT_CATALOG_OUTPUT` permite elegir el directorio de salida.
4. Revisar el informe de cobertura, las capturas y las variantes móvil/escritorio y claro/oscuro. Las capturas fallidas quedan pendientes con su motivo. No sustituirlas por pantallas inventadas.
5. Actualizar la página existente de `docs/visual-catalog-site.json` mediante Sites: reutilizar el project_id, abrir su fuente y ejecutar `node scripts/import-catalog.mjs /ruta/Catalogo-visual-TNT.html`. El importador actualiza `public/catalogo.html` y el registro conservando los controles de notas. No reemplazar el proyecto por HTML estático ni quitar el Worker, D1 o MCP. Conservar el acceso privado del propietario, la dirección y los códigos; no crear otro sitio. El HTML descargable es secundario. El HTML generado es autónomo: contiene sus imágenes y no consulta la base real. No guardar datos privados ni sesiones en las capturas.

El catálogo registra pantallas representativas; no pretende enumerar cada combinación posible de datos. Las ventanas del sistema (Google, permisos del teléfono, teclado) se identifican por separado cuando no pueden capturarse en el entorno de referencia.

## Notas por pantalla

Cada pantalla tiene «Agregar nota» y el visor ofrece «Notas de esta pantalla». Se pueden guardar varios comentarios, precisar una variante, editar, resolver y volver a pendiente. «Ver notas» reúne los pendientes por referencia. Se guardan en D1 del catálogo y se conservan al actualizar las capturas; los borradores sin guardar viven sólo en la pestaña.

Antes de preparar una revisión, leer `list_screen_notes` con estado `pending` del plugin del catálogo. Leer las páginas adicionales si `nextOffset` no es nulo. Si la conexión no aparece, obtener sus datos mediante Sites `get_site` con `include_mcp_connection: true`. La alternativa de servicio usa POST `/mcp` con el token que devuelve `get_site`, únicamente en la cabecera `OAI-Sites-Authorization`; mantenerlo en memoria, nunca en archivos, argumentos o resultados. El catálogo sigue siendo privado del propietario.

Agrupar las solicitudes por pantalla y revisar todo el conjunto. Marcar una nota resuelta sólo después de implementar y verificar su cambio, conservando su texto y usando la revisión actual para no sobrescribir otra edición. No incluir notas reales en las capturas sintéticas ni en el repositorio. Una publicación nueva conserva la base existente y sus migraciones.
