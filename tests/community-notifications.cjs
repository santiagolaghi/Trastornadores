const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,id}=require('./fixtures/community-db.cjs');
test('Los avisos de Comunidad respetan destinatarios, privacidad, cierre, reintentos y suscripciones',async t=>{
 const {db,login,action}=await database();const root=()=>db.exec('reset role');const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 try{
  await login(1);for(const module of ['questions','families','bible','challenges'])await action('save_grant',{person_id:id(2),module,level:3});
  let post,question;
  await t.test('Publicar para una persona no avisa a otros gestores y una edición común no vuelve a avisar',async()=>{
   post=(await action('save_content',{module:'challenges',title:'Para una persona',status:'published',audience:'selected',people:[id(3)],config:{steps:[{title:'Dar un paso'}]}})).id;
   await root();let notices=await rows("select * from tnt_notifications where data->>'content_id'=$1",[post]);assert.deepEqual(notices.map(n=>n.person_id),[id(3)]);
   await login(1);await action('save_content',{id:post,version:1,module:'challenges',title:'Para una persona',description:'Texto corregido',status:'published',audience:'selected',people:[id(3)],config:{steps:[{title:'Dar un paso'}]}});
   await root();assert.equal((await rows("select * from tnt_notifications where data->>'content_id'=$1",[post])).length,1);
  });
  await t.test('Cambiar destinatarios invalida los avisos anteriores antes del envío',async()=>{
   await login(1);await action('save_content',{id:post,version:2,module:'challenges',title:'Para otra persona',status:'published',audience:'selected',people:[id(4)],notify:true,config:{steps:[{title:'Dar un paso'}]}});
   await root();const visible=await rows("select person_id,public.tnt_notification_visible_for(n,person_id) visible from tnt_notifications n where data->>'content_id'=$1",[post]);assert.deepEqual(visible.map(x=>[x.person_id,x.visible]),[[id(3),false],[id(4),true]]);
  });
  await t.test('Una consulta privada solo avisa a quienes pueden responder y a su autor',async()=>{
   await login(3);question=(await action('ask',{question:'Detalle que no debe ir a una notificación',visibility:'private'})).id;
   await root();let notices=await rows("select * from tnt_notifications where data->>'question_id'=$1",[question]);assert.deepEqual(new Set(notices.map(n=>n.person_id)),new Set([id(1),id(2)]));assert(notices.every(n=>!n.body.includes('Detalle')));
   await login(2);await action('answer',{id:question,status:'answered',answer:'Respuesta sensible'});await root();notices=await rows("select * from tnt_notifications where data->>'question_id'=$1",[question]);assert(notices.some(n=>n.person_id===id(3)));assert(notices.every(n=>!n.body.includes('sensible')));
  });
  await t.test('La invitación al referente queda dirigida a la persona elegida y se invalida al cambiarla',async()=>{
   await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(2)});await root();const invitation=(await rows("select * from tnt_notifications where person_id=$1 and data ? 'welcome_person'",[id(2)]))[0];assert(invitation);
   await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(1)});await root();assert.equal((await rows('select public.tnt_notification_visible_for(n,$1) visible from tnt_notifications n where id=$2',[id(2),invitation.id]))[0].visible,false);
  });
  await t.test('Programar no avisa antes de tiempo y la preparación repetida no duplica',async()=>{
   await login(1);const scheduled=(await action('save_content',{module:'challenges',title:'Publicación programada',status:'scheduled',starts_at:new Date(Date.now()+3600000).toISOString(),config:{steps:[{title:'Paso'}]}})).id;
   await root();assert.equal((await rows("select * from tnt_notifications where data->>'content_id'=$1",[scheduled])).length,0);
   await db.query("update tnt_community_content set starts_at=now()-interval '1 minute' where id=$1",[scheduled]);await db.exec('set role service_role;select public.tnt_community_prepare_notifications();select public.tnt_community_prepare_notifications();reset role;');
   const n=await rows("select person_id,count(*)::int n from tnt_notifications where data->>'content_id'=$1 group by person_id",[scheduled]);assert.equal(n.length,4);assert(n.every(x=>x.n===1));
  });
  await t.test('El contenido diario requiere suscripción voluntaria, conserva el día de Argentina y no duplica',async()=>{
   await login(3);await action('preferences',{daily_push:true});await login(1);await action('save_module',{module:'daily',version:1,title:'Para hoy',config:{notification_hour:0}});await root();await db.exec('set role service_role;select public.tnt_community_prepare_notifications();select public.tnt_community_prepare_notifications();reset role;');
   const n=await rows("select * from tnt_notifications where data ? 'day'");assert.equal(n.length,1);assert.equal(n[0].person_id,id(3));assert.equal(n[0].data.day,(await rows("select (now() at time zone 'America/Argentina/Buenos_Aires')::date::text as local_day"))[0].local_day);
   await login(3);await action('preferences',{daily_push:false});await root();assert.equal((await rows('select public.tnt_notification_visible_for(n,$1) visible from tnt_notifications n where id=$2',[id(3),n[0].id]))[0].visible,false);
  });
  await t.test('Activar un teléfono recupera avisos recientes sin repetirlos y el endpoint cambia de dueño al cambiar de cuenta',async()=>{
   const sub={endpoint:'https://push.test/device',keys:{auth:'synthetic',p256dh:'synthetic'}};await login(4);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await root();const queue=await rows('select * from tnt_push_outbox');assert(queue.length>0);assert.equal(new Set(queue.map(x=>x.source_key+'|'+x.endpoint)).size,queue.length);assert(queue.every(x=>x.person_id===id(4)));
   await login(5);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await root();assert.equal((await rows('select person_id from tnt_push_subscriptions'))[0].person_id,id(5));
  });
  await t.test('Una cuenta común no ejecuta la preparación ni lee el diagnóstico de envíos',async()=>{
   await login(3);await assert.rejects(db.query('select public.tnt_community_prepare_notifications()'),/permission denied/);await assert.rejects(db.query('select public.tnt_community_delivery_status()'),/Administración/);await login(1);const diagnostics=(await rows('select public.tnt_community_delivery_status() result'))[0].result;assert.equal(diagnostics.devices,1);assert(!JSON.stringify(diagnostics).includes('push.test'));
  });
 }finally{await db.close();}
});
