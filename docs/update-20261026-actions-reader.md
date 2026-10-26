# Atajos de acciones y lector móvil — 26 de octubre de 2026

La barra tiene Inicio, tres favoritos personales y Más. Más abre un cajón con acciones, módulos disponibles, personalización y los espacios abiertos. Los módulos conservan sus formularios al retomarlos desde Espacios abiertos; la barra de pestañas permanece oculta.

| Acción | Destino y contexto |
| --- | --- |
| Pasar lista | Lista de Sábados: próximo encuentro, último hasta hoy o fecha fija. La fecha visible siempre coincide con la usada para registrar. |
| Mi EFE | Grupo habilitado elegido al configurar, con último/próximo encuentro o fecha fija. |
| Cronograma | Programa del próximo sábado o del sábado de una fecha fija. |
| Preparar sábado | Editor del encuentro correspondiente; si falta, formulario sin guardar con fecha precargada. |
| Mis actividades | Resumen de las responsabilidades propias y próximas. |
| Chat TNT | Conversación general abierta y compositor disponible según permisos. |
| Continuar Biblia | Último libro, capítulo y traducción de la cuenta. |
| Cumpleaños / Comunidad / Perfil | Sección concreta dentro de TNT. |

Volver a tocar un atajo aplica otra vez su acción, incluso si el módulo quedó abierto en otra lista, fecha o conversación. Retomar un espacio abierto conserva su estado. Inicio vuelve a su contenido real y sólo hay una barra principal.

La configuración añade `shortcut_context` a las preferencias privadas existentes. Se validan acciones, grupos, criterios y fechas (sábado para los atajos de sábado), sin guardar URLs arbitrarias ni permisos en la preferencia. Las exclusiones EFE siguen prevaleciendo. Los clientes anteriores conservan compatibilidad con los IDs previos y la transferencia de perfil respeta las preferencias de la cuenta principal.

El lector transforma los hitos de versículo REST de YouVersion antes de hacerlos seleccionables. Se incluye únicamente el transformador de HTML de `@youversion/platform-core` 2.16.0, bajo Apache 2.0, en `assets/vendor/` con su licencia. No contiene textos bíblicos ni credenciales. Fuente y formato: https://developers.youversion.com/guides/display-bible-html y https://github.com/youversion/platform-sdk-react.

Tocar un versículo abre un panel inferior sin bloquear la lectura. Permite sumar versículos, elegir color, subrayar, guardar, copiar y ampliar opciones; Escape, Atrás y Cerrar cancelan la selección. Las marcas siguen guardadas por referencia y por cuenta. El panel de capítulo aparece al principio/final y al subir; su título abre libro/capítulo. Se conserva la atribución de cada traducción y la política de acceso del proveedor.

Las ventanas de Organización salen de la capa modal nativa antes de ocultarse o archivarse. Al cerrar la hija se restaura la ventana padre y su formulario. El botón Personas del detalle se vincula dentro de su propia ventana, aunque exista otro botón del mismo ID en el cronograma de fondo.

Validación: 227 regresiones DOM/SQL/cache/privacidad; recorrido completo de Comunidad con HTML compilado y SDK Supabase oficial; pruebas específicas de destinos exactos, fecha fija, repetición de atajos, EFE revocado, chat general, creación/edición de sábado y coordinadores anidados dentro del workspace. Capturas en claro/oscuro y 320/360/390/412/768/1280, escritorio 1366/1440/1920, horizontal y vista equivalente a zoom de 200 %. Lectura y selección verificadas con un capítulo público real RVR 1909 y con HTML sintético que reproduce los hitos REST y párrafos poéticos. Estas pruebas no certifican licencias NVI/NTV ni sustituyen una prueba física en Safari/iOS o Android.

Versión de recursos y service worker: `20261026r2`. Actualización sin borrar sesiones, marcas ni preferencias.
