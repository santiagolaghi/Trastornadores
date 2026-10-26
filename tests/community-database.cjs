const {test}=require('node:test'),assert=require('node:assert/strict');
const {database,id}=require('./fixtures/community-db.cjs');
test('Comunidad completa: permisos, referentes, planes, encuestas, preguntas privadas, familias, bautismos y contenido diario',async t=>{
 const {db,login,action,boot}=await database();let plan,poll,question,family;
 try{
  await t.test('Solo Comunidad solicita acompañamiento; staff y administración no crean solicitudes ni avisos',async()=>{
   for(const actor of [1,2]){await login(actor);await assert.rejects(action('request_welcome',{staff_status:'community',person_id:id(3)}),/personas de Comunidad/);}
   await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from tnt_community_history where action='request_welcome'")).rows[0].n,0);assert.equal((await db.query('select count(*)::int n from tnt_community_accompaniment')).rows[0].n,0);
   await login(3);await action('request_welcome',{person_id:id(4)});assert.equal((await boot()).accompaniment[0].person_id,id(3));
   await db.exec('reset role');assert.equal((await db.query("select subject_id from tnt_community_history where action='request_welcome'")).rows[0].subject_id,id(3));
   await db.query('update tnt_accounts set staff_status=$1 where person_id=$2',['approved',id(3)]);await login(3);await assert.rejects(action('request_welcome'),/personas de Comunidad/);assert.equal((await boot()).accompaniment[0].person_id,id(3));
   await db.exec('reset role');await db.query('update tnt_accounts set staff_status=$1 where person_id=$2',['community',id(3)]);
  });
  await t.test('Comunidad no administra y los permisos de módulo no conceden funciones de Admin',async()=>{
   await login(3);await assert.rejects(action('save_module',{module:'baptisms',version:1,title:'Cambio'}),/permiso/);
   await assert.rejects(db.exec("update public.tnt_community_modules set title='Cambio'"),/permission denied/);
   await login(1);for(const module of ['bible','polls','questions','families','baptisms'])await action('save_grant',{person_id:id(2),module,level:3});
   await login(2);await assert.rejects(action('assign_referent',{person_id:id(3),referent_id:id(2)}),/Administración/);
   await assert.rejects(action('save_grant',{person_id:id(3),module:'bible',level:3}),/Administración/);
  });
  await t.test('El referente queda pendiente, debe responder y solo acepta sus propias invitaciones',async()=>{
   await login(1);await action('assign_referent',{person_id:id(3),referent_id:id(2)});
   await login(2);assert.equal((await boot()).accompaniment[0].status,'pending');await assert.rejects(action('followup',{person_id:id(3),note:'Antes de aceptar'}),/confirmado/);
   await login(4);await assert.rejects(action('respond_referent',{person_id:id(3),accept:true}),/pendiente/);assert.equal((await boot()).accompaniment.length,0);
   await login(2);await action('respond_referent',{person_id:id(3),accept:true});await action('followup',{person_id:id(3),note:'Nota privada'});await action('followup',{person_id:id(3),note:'Conversamos el sábado',shared:true});
   await login(3);assert.equal((await boot()).followups.length,1);assert.equal((await boot()).accompaniment[0].status,'accepted');
  });
  await t.test('Los planes guardan progreso por persona y conservan la edición que empezó a leer',async()=>{
   await login(2);plan=(await action('save_content',{module:'bible',title:'Plan de prueba',status:'published',config:{steps:[{title:'Primero',reference:'JHN.1'},{title:'Segundo',reference:'JHN.2'}]}})).id;
   await login(3);await action('join_content',{id:plan});await action('progress_content',{id:plan,step:1,checked:true});
   await login(2);await action('save_content',{id:plan,version:1,module:'bible',title:'Plan corregido',status:'published',config:{steps:[{title:'Otro orden',reference:'JHN.4'}]}});
   await login(3);let e=(await boot()).enrollments.find(e=>e.content_id===plan);assert.equal(e.snapshot_steps.length,2);assert.deepEqual(e.completed_steps,[1]);await action('progress_content',{id:plan,step:2,checked:true});assert.equal((await boot()).enrollments[0].status,'completed');
   await login(4);assert.equal((await boot()).enrollments.length,0);await assert.rejects(action('progress_content',{id:plan,step:1,person_id:id(3)}),/paso válido/);
   await login(2);await assert.rejects(action('save_content',{id:plan,version:1,module:'bible',title:'Conflicto',status:'published',config:{steps:[{title:'Paso',reference:'JHN.1'}]}}),/actualizó/);
  });
  await t.test('Una cuenta tiene un voto y la encuesta anónima conserva sus opciones',async()=>{
   await login(2);poll=(await action('save_content',{module:'polls',title:'¿Cuándo?',status:'published',config:{options:['Sábado','Domingo'],anonymous:true}})).id;
   await login(3);await action('vote',{id:poll,option_index:1});await action('vote',{id:poll,option_index:2});let p=(await boot()).polls[0];assert.deepEqual(p.counts,[0,1]);assert.equal(p.mine,2);
   await login(2);await assert.rejects(action('poll_report',{id:poll}),/anónima/);await assert.rejects(action('save_content',{id:poll,version:1,module:'polls',title:'Cambio de pregunta',status:'published',config:{options:['Sábado','Domingo'],anonymous:true}}),/recibió votos/);
   await login(4);assert.equal((await boot()).polls[0].counts,null);
  });
  await t.test('Las preguntas privadas no se publican ni se filtran a otra persona',async()=>{
   await login(3);question=(await action('ask',{question:'Una consulta privada de prueba',visibility:'private'})).id;
   await login(4);assert.equal((await boot()).questions.length,0);
   await login(2);await assert.rejects(action('answer',{id:question,status:'published',answer:'Respuesta'}),/privada/);await action('answer',{id:question,status:'answered',answer:'Respuesta privada'});
   await login(3);assert.equal((await boot()).questions[0].answer,'Respuesta privada');
  });
  await t.test('Las familias se verifican antes de ver avisos o dar autorizaciones',async()=>{
   await login(2);const notice=(await action('save_content',{module:'families',title:'Salida',body:'Autorizo la participación en la salida.',status:'published',audience:'families',config:{consent:true}})).id;
   await login(3);await action('request_family',{name:'Persona 4',relationship:'Madre / padre'});family=(await boot()).families[0].id;assert(!(await boot()).content.some(c=>c.id===notice));await assert.rejects(action('review_family',{id:family,person_id:id(4),accept:true}),/permiso/);
   await login(2);await action('review_family',{id:family,person_id:id(4),accept:true});
   await login(3);assert((await boot()).content.some(c=>c.id===notice));await action('consent',{id:notice,link_id:family,version:1,accepted:true});assert.equal((await boot()).consents[0].body_snapshot,'Autorizo la participación en la salida.');
   await login(5);await assert.rejects(action('consent',{id:notice,link_id:family,version:1,accepted:true}),/cuenta|vinculación/);
  });
  await t.test('El equipo edita bautismos y confirma su realización sin alterar la identidad ni el rol',async()=>{
   await login(3);await action('request_baptism');await assert.rejects(action('save_baptism',{person_id:id(3),status:'completed',completed_on:'2020-01-01',confirmed:true}),/permiso/);
   await login(2);await assert.rejects(action('save_baptism',{person_id:id(3),status:'completed'}),/Confirmá/);await action('save_baptism',{person_id:id(3),status:'completed',completed_on:'2020-01-01',confirmed:true});
   await action('save_module',{module:'baptisms',version:1,title:'Bautismos',config:{intro:'Contenido revisado por el equipo'}});
   await login(3);assert.equal((await boot()).baptisms[0].status,'completed');await db.exec('reset role');assert.equal((await db.query('select system_role from public.tnt_accounts where person_id=$1',[id(3)])).rows[0].system_role,'user');
  });
  await t.test('El contenido diario queda fijo y las preferencias y partidas son de cada persona',async()=>{
   await login(3);const daily=(await boot()).daily;assert(daily.reference);assert(daily.phrase);await action('preferences',{birthday_public:true,daily_push:true});
   await action('save_game',{id:id(99),kind:'order',difficulty:'easy',score:100,won:true,lives:2,duration:30});await action('save_game',{id:id(99),kind:'order',difficulty:'easy',score:100,won:true,lives:2,duration:30});assert.equal((await boot()).games[0].plays,1);
   await login(4);assert.deepEqual((await boot()).daily,daily);assert.equal((await boot()).games.length,0);assert.equal((await boot()).preferences.daily_push,false);assert.equal((await boot()).birthdays.length,5);assert.equal((await boot()).community_size,5);
  });
  await t.test('Las personas deshabilitadas y visitantes no pueden ejecutar acciones',async()=>{
   await db.exec(`reset role;update public.tnt_accounts set enabled=false where person_id='${id(5)}';`);await login(5);await assert.rejects(boot(),/perfil completo/);await assert.rejects(action('request_welcome'),/perfil/);
   await db.exec('reset role;set role anon');await assert.rejects(boot(),/permission denied/);
  });
 }finally{await db.close();}
});
