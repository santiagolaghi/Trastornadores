# TNT Unificado

Proyecto único Vercel que integra los módulos TNT recuperados de producción.

Rutas:
- / — Hub
- /organizacion/
- /campamento/
- /glosario/
- /lista-sabados/
- /efe/
- /buffet/

Notas:
- EFE y Lista Sábados conservan sus backends actuales mediante rewrites proxy para no perder datos.
- Glosario mantiene la conexión Supabase TNT actual.
- Buffet mantiene por ahora su conexión Supabase actual independiente.
- Organización y Campamento conservan su persistencia local actual.


<!-- deploy-trigger: mobile-fix-2 -->
