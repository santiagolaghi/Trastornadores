const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),path=require('node:path');
const {database,id}=require('./fixtures/community-db.cjs');
test('Los avisos de Comunidad respetan destinatarios, privacidad, cierre, reintentos y suscripciones',async t=>{
 const {db,login,action}=await database();const root=()=>db.exec('reset role');const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
 try{
  await db.exec(`
   alter table tnt_accounts add column nickname text;
   alter table tnt_events add column start_date date,add column name text;
   alter table tnt_tasks add column event_id uuid,add column title text,add column due_at timestamptz;
   alter table tnt_task_assignees add column created_at timestamptz;
   create table tnt_event_members(event_id uuid,person_id uuid,event_role text);
   update tnt_people set birthday=case when id='${id(2)}' then tnt_actions.community_today() end;
   update tnt_accounts set nickname=' ' where person_id='${id(2)}';
   insert into tnt_notifications(id,person_id,title,body,href,read_at)
   values('${id(90)}','${id(3)}','🎂 Cumpleaños TNT','Hoy cumple  .','/organizacion/',now());
  `);
  await db.exec(readFileSync(path.join(__dirname,'../supabase/migrations/20261109161418_birthday_and_verse_notices.sql'),'utf8'));
  await t.test('Cumpleaños recupera el nombre de la ficha y distingue a las personas con el mismo nombre',async()=>{
   const [existing]=await rows('select * from tnt_notifications where id=$1',[id(90)]);
   assert.equal(existing.body,'Hoy cumple Persona 2.');
   assert.equal(existing.href,'/comunidad?module=birthdays');
   assert.equal(existing.data.birthday_person,id(2));
   assert(existing.read_at);
   await db.query("update tnt_people set birthday=tnt_actions.community_today(),full_name='Persona 2' where id=$1",[id(4)]);
   await db.query("insert into tnt_people(id,full_name,birthday) values($1,'Perfil sin cuenta',tnt_actions.community_today())",[id(6)]);
   await db.exec('select tnt_generate_daily_notifications();select tnt_generate_daily_notifications();');
   await login(3);
   const notices=(await rows('select public.tnt_my_notifications(true) note')).map(r=>r.note)
     .filter(n=>n.data.community_module==='birthdays');
   assert.equal(notices.length,2);
   assert(notices.every(n=>n.href==='/comunidad?module=birthdays'&&n.body==='Hoy cumple Persona 2.'));
   assert.deepEqual(new Set(notices.map(n=>n.data.birthday_person)),new Set([id(2),id(4)]));
   await root();
  });
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
  await t.test('El aviso de asignación directa llega al referente elegido y se invalida al cambiarlo',async()=>{
   await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(2)});await root();const invitation=(await rows("select * from tnt_notifications where person_id=$1 and data ? 'welcome_person'",[id(2)]))[0];assert(invitation);
   await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(1)});await root();assert.equal((await rows('select public.tnt_notification_visible_for(n,$1) visible from tnt_notifications n where id=$2',[id(2),invitation.id]))[0].visible,false);
  });
  await t.test('Programar no avisa antes de tiempo y la preparación repetida no duplica',async()=>{
   await login(1);const scheduled=(await action('save_content',{module:'challenges',title:'Publicación programada',status:'scheduled',starts_at:new Date(Date.now()+3600000).toISOString(),config:{steps:[{title:'Paso'}]}})).id;
   await root();assert.equal((await rows("select * from tnt_notifications where data->>'content_id'=$1",[scheduled])).length,0);
   await db.query("update tnt_community_content set starts_at=now()-interval '1 minute' where id=$1",[scheduled]);await db.exec('set role service_role;select public.tnt_community_prepare_notifications();select public.tnt_community_prepare_notifications();reset role;');
   const n=await rows("select person_id,count(*)::int n from tnt_notifications where data->>'content_id'=$1 group by person_id",[scheduled]);assert.equal(n.length,4);assert(n.every(x=>x.n===1));
  });
  await t.test('El aviso diario contiene la lectura, actualiza el aviso anterior y se envía una vez a quien lo activó',async()=>{
   await login(3);await action('preferences',{daily_push:true});
   await login(4);await action('preferences',{daily_push:true});
   await login(1);await action('save_module',{module:'daily',version:1,title:'Para hoy',config:{notification_hour:0}});
   await root();
   await db.exec("update tnt_community_days set reference='MAT.5.14-16' where day=tnt_actions.community_today();set role service_role");
   const [{result:day}]=await rows('select public.tnt_community_prepare_notifications() result');
   assert.equal(day.verse_reference,'MAT.5.14-16');
   await root();
   const [{local_day}]=await rows("select tnt_actions.community_today()::text as local_day");
   assert.equal(day.day,local_day);
   await db.query(`insert into tnt_notifications(id,person_id,title,body,href,data,read_at)
     values($1,$2,'Una Palabra para hoy','El versículo y la frase de hoy ya están en TNT.','/comunidad?module=daily',
       jsonb_build_object('kind','community','community_module','daily','day',$3::date),now())`,[id(91),id(3),day.day]);
   await db.query('insert into tnt_community_notice_keys(source_key,person_id) values($1,$2)',['community:daily:'+day.day,id(3)]);
   const verse=require('../assets/bible/rvr1909/MAT.json').chapters[5].filter(v=>v.verse>=14&&v.verse<=16).map(v=>v.text).join(' ');
   const publish=(ref)=>db.query('select public.tnt_publish_daily_verse_notice($1,$2,$3,$4)',[day.day,ref,'Mateo 5:14–16',verse]);
   await db.exec('set role service_role');await publish('MAT.5.1');await root();
   assert.equal((await rows("select id from tnt_notifications where data ? 'verse_reference'")).length,0);
   await db.exec('set role service_role');await publish(day.verse_reference);await publish(day.verse_reference);
   assert.equal((await rows('select public.tnt_community_prepare_notifications() result'))[0].result.verse_reference,null);
   await root();
   const n=await rows("select * from tnt_notifications where data->>'community_module'='daily' order by person_id");
   assert.deepEqual(n.map(note=>note.person_id),[id(3),id(4)]);
   assert.equal(n[0].id,id(91));assert(n[0].read_at);
   assert(n.every(note=>note.body===verse&&note.href==='/biblia?ref=MAT.5.14-16&v=1909'&&note.title.includes('Mateo 5:14–16 · RVR 1909')));
   await login(3);await action('preferences',{daily_push:false});await root();
   assert.equal((await rows('select public.tnt_notification_visible_for(n,$1) visible from tnt_notifications n where id=$2',[id(3),n[0].id]))[0].visible,false);
  });
  await t.test('Activar un teléfono recupera avisos recientes sin repetirlos y el endpoint cambia de dueño al cambiar de cuenta',async()=>{
   const sub={endpoint:'https://push.test/device',keys:{auth:'synthetic',p256dh:'synthetic'}};await login(4);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await root();const queue=await rows('select * from tnt_push_outbox');assert(queue.length>0);assert.equal(new Set(queue.map(x=>x.source_key+'|'+x.endpoint)).size,queue.length);assert(queue.every(x=>x.person_id===id(4)));
   await login(5);await db.query('select public.tnt_push_subscribe($1::jsonb)',[JSON.stringify(sub)]);await root();assert.equal((await rows('select person_id from tnt_push_subscriptions'))[0].person_id,id(5));
  });
  await t.test('Una cuenta común no ejecuta la preparación ni lee el diagnóstico de envíos',async()=>{
   await login(3);await assert.rejects(db.query('select public.tnt_community_prepare_notifications()'),/permission denied/);
   await assert.rejects(db.query("select public.tnt_publish_daily_verse_notice(current_date,'MAT.5.14-16','Mateo 5:14–16','Prueba')"),/permission denied/);
   await assert.rejects(db.query('select public.tnt_community_delivery_status()'),/Administración/);await login(1);const diagnostics=(await rows('select public.tnt_community_delivery_status() result'))[0].result;assert.equal(diagnostics.devices,1);assert(!JSON.stringify(diagnostics).includes('push.test'));
  });
  await t.test('Acompañamiento identifica quién pidió ayuda, sin mostrar el aviso a otras cuentas',async()=>{
   await login(3);await action('request_welcome',{person_id:id(4)});await root();const notice=(await rows("select * from tnt_notifications where data->>'welcome_person'=$1 and title like '%pidió acompañamiento'",[id(3)]))[0];assert(notice);assert(notice.title.includes('Persona 3'));assert(notice.href.includes('person='+id(3)));assert.equal(notice.data.sender_id,id(3));
   await db.query("update tnt_notifications set title='Una persona pidió acompañamiento',href='/comunidad?module=welcome&manage=1',data=data-'sender_id'-'sender_name'-'sender_avatar' where id=$1",[notice.id]);
   await login(1);const recovered=(await rows('select public.tnt_my_notifications(true) note')).map(r=>r.note).find(n=>n.id===notice.id);assert(recovered.title.includes('Persona 3'));assert.equal(recovered.data.sender_name,'Persona 3');
   await login(4);assert(!(await rows('select public.tnt_my_notifications(true) note')).some(r=>r.note.id===notice.id));
  });
 }finally{await db.close();}
});
