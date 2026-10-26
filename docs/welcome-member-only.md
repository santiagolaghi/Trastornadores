# Solicitudes de acompañamiento según el rol

«Quiero que me acompañen» aparece únicamente para personas de Comunidad sin una solicitud previa. Líderes, demás staff aprobado y administradores encuentran sus invitaciones y personas a cargo como referentes. Los acompañamientos e historiales anteriores se conservan.

El servidor verifica el rol de la cuenta real, rechaza solicitudes del staff con 42501 e ignora un destinatario falsificado. El resto del flujo —asignar referente, aceptar invitación y registrar seguimiento— conserva sus controles.

La migración `20261026010032_community_welcome_member_requests.sql` está aplicada en Supabase. La prueba `tests/welcome-member-requests.sql` pasó contra el proyecto real con identidades sintéticas y rollback completo. También pasaron 295 pruebas automatizadas y el navegador compilado para Comunidad, líder y administrador, en once tamaños, claro/oscuro, horizontal y reflujo equivalente a zoom del 200 %.

Recursos y service worker: `20261025c`. Este arreglo se publica de manera independiente de la actualización general de la PR 14.
