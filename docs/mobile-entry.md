# Entrada móvil y búsqueda

TNT ofrece un único ingreso y registro con Google. La pantalla no solicita un email ni envía enlaces de acceso. Se conservan las cuentas, perfiles, sesiones y permisos existentes; esto no cambia la configuración de proveedores de Supabase Auth.

En iPhone, iPad y Android, el enlace de la app muestra primero una guía para agregar TNT a la pantalla de inicio. Android usa el instalador nativo cuando el navegador lo ofrece. Si no está disponible, se muestran los pasos manuales y un enlace para abrir en un navegador compatible. Sólo el modo independiente confirma que TNT está abierta desde su ícono; aceptar el instalador no habilita el siguiente paso desde la pestaña del navegador.

Después del ingreso con Google y de completar el perfil, se muestra el paso de avisos. El permiso del sistema se solicita desde el botón de la persona y la pantalla termina sólo después de guardar el dispositivo. Un rechazo conserva la explicación para recuperar el permiso. Un dispositivo sin soporte puede continuar con avisos internos, sin registrar consentimiento push. Una desactivación explícita posterior se respeta. Los formularios públicos de perfiles y campamento conservan su entrada directa.

La búsqueda fija las fotos a un círculo, reserva una columna flexible para el nombre y muestra «Tu perfil» en la cuenta actual. Evita repetir el mismo ID, pero conserva personas distintas aunque compartan nombre. No modifica ni fusiona cuentas.

Las pruebas automatizadas usan OAuth y permisos del sistema sintéticos. Comprobar instalación, regreso desde Google y recepción real en iPhone/Android requiere esos dispositivos y la cuenta de la persona.
