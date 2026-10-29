# Catálogo visual de TNT

Página para abrir desde el celular: https://catalogo-visual-tnt.tangyteal130.chatgpt.site. La entrega principal es la página; los visores de archivos pueden mostrar el HTML descargado como código.

El catálogo permite pedir cambios mediante una referencia permanente, por ejemplo «ORG-013 · Personas del sábado». Incluye rutas, formularios y ventanas, con el rol y el contexto de cada captura. Los datos son ficticios y no representan personas ni operaciones reales.

## Actualización

1. Mantener los IDs de `tests/visual-catalog.cjs`; agregar nuevos sin renumerar.
2. Compilar con `bash scripts/build-static.sh`.
3. Ejecutar `TNT_VISUAL_CATALOG=1 node tests/community-browser.cjs` con las dependencias y el SDK indicados en `tests/README.md`. `TNT_CATALOG_OUTPUT` permite elegir el directorio de salida.
4. Revisar el informe de cobertura, las capturas y las variantes móvil/escritorio y claro/oscuro. Las capturas fallidas quedan pendientes con su motivo. No sustituirlas por pantallas inventadas.
5. Actualizar la página existente de `docs/visual-catalog-site.json` mediante Sites: reutilizar el project_id, abrir su fuente y reemplazar `dist/index.html` por el catálogo generado. Conservar el acceso privado del propietario, la dirección y los códigos; no crear otro sitio. El HTML descargable es secundario. El HTML generado es autónomo: contiene sus imágenes y no consulta la base real. No guardar datos privados ni sesiones en las capturas.

El catálogo registra pantallas representativas; no pretende enumerar cada combinación posible de datos. Las ventanas del sistema (Google, permisos del teléfono, teclado) se identifican por separado cuando no pueden capturarse en el entorno de referencia.
