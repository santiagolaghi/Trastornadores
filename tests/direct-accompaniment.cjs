const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,id}=require('./fixtures/community-db.cjs');
test('La migración cierra pedidos anteriores del equipo, activa asignaciones y conserva historia y notas',async()=>{
 const {db,login,action,boot}=await database({beforeDirect:async db=>{
  await db.query("insert into tnt_community_accompaniment(person_id,referent_id,status,assigned_by,assigned_at,responded_at) values($1,null,'unassigned',null,null,null),($2,null,'unassigned',null,null,null),($3,$2,'pending',$1,'2026-10-01',null),($4,$1,'accepted',$1,'2026-10-01','2026-10-02')",[id(1),id(2),id(3),id(4)]);
  await db.query("insert into tnt_community_followups(person_id,author_id,note) values($1,$2,'Registro anterior del equipo'),($3,$2,'Registro anterior de Comunidad')",[id(2),id(1),id(4)]);
  await db.query("insert into tnt_notifications(person_id,title,body,data) values($1::uuid,'Persona 2 pidió acompañamiento','Pedido anterior',jsonb_build_object('welcome_person',$2::text)),($2::uuid,'¿Podés acompañar a Persona 3?','Administración te invitó como referente. Confirmá si podés acompañarla.',jsonb_build_object('welcome_person',$3::text))",[id(1),id(2),id(3)]);
 }});
 try{
  const statuses=(await db.query('select person_id,status,responded_at from tnt_community_accompaniment order by person_id')).rows;assert.deepEqual(statuses.map(r=>r.status),['closed','closed','accepted','accepted']);assert.equal(statuses[2].responded_at,null);assert(statuses[3].responded_at);
  assert.equal((await db.query('select count(*)::int n from tnt_community_followups')).rows[0].n,2);assert.equal((await db.query("select count(*)::int n from tnt_community_history where action='close_staff_welcome_request' and details->'before'->>'status'='unassigned'")).rows[0].n,2);
  assert((await db.query('select public.tnt_notification_resolved(n) resolved from tnt_notifications n')).rows.every(n=>n.resolved));
  await login(1);let data=await boot();assert.deepEqual(data.welcome_people.map(p=>p.id).sort(),[id(3),id(4),id(5)]);assert(!data.accompaniment.some(a=>[id(1),id(2)].includes(a.person_id)));
  await assert.rejects(action('assign_referent',{person_id:id(2),referent_id:id(1)}),/personas de Comunidad/);
  await login(2);await action('followup',{person_id:id(3),note:'Sin pedir aceptación'});await assert.rejects(action('respond_referent',{person_id:id(3),accept:false}),/Administración/);
  await login(4);await assert.rejects(action('assign_referent',{person_id:id(3),referent_id:id(2)}),/Administración/);
 }finally{await db.close();}
});
test('Una asignación administrativa es inmediata, privada y no permite declinar ni tomar otro destinatario',async()=>{
 const {db,login,action,boot}=await database();try{
  await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(2)});await db.exec('reset role');
  let row=(await db.query('select * from tnt_community_accompaniment where person_id=$1',[id(3)])).rows[0];assert.equal(row.status,'accepted');assert.equal(row.responded_at,null);
  const notices=(await db.query("select * from tnt_notifications where data->>'welcome_action'='assigned'")).rows;assert.deepEqual(new Set(notices.map(n=>n.person_id)),new Set([id(2),id(3)]));assert(notices.every(n=>!n.body.includes('Confirmá')&&!n.title.includes('¿')));
  await login(2);await action('followup',{person_id:id(3),note:'Privado',shared:false});await assert.rejects(action('respond_referent',{person_id:id(3),accept:false}),/Administración/);
  await login(3);assert.equal((await boot()).followups.length,0);await login(4);assert.equal((await boot()).accompaniment.length,0);await assert.rejects(action('followup',{person_id:id(3),note:'Ajeno'}),/referente/);
  await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(1)});await login(2);await assert.rejects(action('followup',{person_id:id(3),note:'Ya no soy referente'}),/referente/);assert.equal((await boot()).followups.length,0);
 }finally{await db.close();}
});
test('Promover a líder cierra la solicitud existente y una vuelta a Comunidad no la reabre sin un pedido explícito',async()=>{
 const {db,login,action,boot}=await database();try{
  await login(3);await action('request_welcome');await db.exec('reset role');await db.query("update tnt_accounts set staff_status='approved' where person_id=$1",[id(3)]);assert.equal((await db.query('select status from tnt_community_accompaniment where person_id=$1',[id(3)])).rows[0].status,'closed');
  await login(3);assert.equal((await boot()).accompaniment.length,0);await assert.rejects(action('request_welcome'),/personas de Comunidad/);
  await db.exec('reset role');await db.query("update tnt_accounts set staff_status='community' where person_id=$1",[id(3)]);await login(3);assert.equal((await boot()).accompaniment.length,0);await action('request_welcome');assert.equal((await boot()).accompaniment[0].status,'unassigned');
 }finally{await db.close();}
});
