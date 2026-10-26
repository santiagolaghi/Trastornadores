const {test}=require('node:test');
const assert=require('node:assert/strict');
const {database,id}=require('./fixtures/community-db.cjs');
const fs=require('node:fs'),path=require('node:path');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261025220637_responsive_personal_reading.sql'),'utf8');
const section=(start,end)=>sql.slice(sql.indexOf(start),sql.indexOf(end,sql.indexOf(start)));
async function personal(){return database();}
test('Marcas, favorita y atajos pertenecen al usuario y a la referencia, sin depender de traducción',async()=>{
 const {db,login}=await personal();try{
  const action=async(a,d)=>(await db.query('select public.tnt_personal_action($1,$2) result',[a,JSON.stringify(d)])).rows[0].result;
  await login(3);let r=await action('preferences',{favorite_version:176,shortcuts:['efe','bible','efe'],extra_versions:[1909]});assert.equal(r.preferences.favorite_version,176);assert.deepEqual(r.preferences.shortcuts,['efe','bible']);
  r=await action('mark',{book:'JHN',chapter:3,verses:[16,17,16],color:'lime',version:128,person_id:id(4)});assert.equal(r.marks.length,2);
  r=(await db.query("select public.tnt_personal_context('JHN',3) result")).rows[0].result;assert.equal(r.marks[0].color,'lime');assert(!('version' in r.marks[0]));
  await login(4);r=(await db.query("select public.tnt_personal_context('JHN',3) result")).rows[0].result;assert.deepEqual(r.marks,[]);assert.equal(r.preferences.favorite_version,128);assert.equal((await db.query('select count(*)::int n from public.tnt_reader_marks')).rows[0].n,0);
  await assert.rejects(db.query("insert into public.tnt_reader_days(person_id,day) values($1,current_date)",[id(3)]),/permission denied/);
  await assert.rejects(action('mark',{book:'ZZZ',chapter:1,verses:[1],color:'lime'}),/versículos válidos/);
  await assert.rejects(action('mark',{book:'JUD',chapter:2,verses:[1],color:'lime'}),/versículos válidos/);
  await assert.rejects(action('preferences',{shortcuts:['admin']}),/atajos válidos/);
  await login(3);await action('unmark',{book:'JHN',chapter:3,verses:[16]});assert.equal((await db.query("select public.tnt_personal_context('JHN',3) r")).rows[0].r.marks.length,1);
  await db.exec('reset role;update public.tnt_accounts set enabled=false where person_id=\''+id(3)+'\'');await login(3);await assert.rejects(action('read',{}),/perfil completo/);
 }finally{await db.close();}
});
test('Racha usa días del servidor, no duplica lecturas y conserva datos en consolidación',async()=>{
 const {db,login}=await personal();try{
  const today=(await db.query('select tnt_actions.community_today() today')).rows[0].today;
  await db.query('insert into public.tnt_reader_days select $1,tnt_actions.community_today()-n from generate_series(1,3)n',[id(3)]);
  await login(3);let r=(await db.query("select public.tnt_personal_action('read','{\"day\":\"2099-01-01\"}') r")).rows[0].r;assert.equal(r.streak,4);assert.equal(r.best_streak,4);assert.equal(r.today,new Date(today).toISOString().slice(0,10));assert(r.read_today);
  await db.query("select public.tnt_personal_action('read','{}')");assert.equal((await db.query('select count(*)::int n from public.tnt_reader_days')).rows[0].n,4);
  await db.exec('reset role');await db.query("insert into public.tnt_reader_marks(person_id,book,chapter,verse,color) values($1,'JHN',3,16,'lime'),($2,'JHN',3,16,'pink'),($2,'JHN',3,17,'blue')",[id(3),id(4)]);
  await db.query('select tnt_actions.merge_personal_state($1,$2)',[id(4),id(3)]);assert.deepEqual((await db.query('select verse,color from public.tnt_reader_marks where person_id=$1 order by verse',[id(3)])).rows,[{verse:16,color:'lime'},{verse:17,color:'blue'}]);
  await login(3);await assert.rejects(db.query('select tnt_actions.merge_personal_state($1,$2)',[id(3),id(4)]),/permission denied/);
  await db.exec("reset role;set role anon;set request.jwt.claim.sub=''");await assert.rejects(db.query('select public.tnt_personal_context()'),/permission denied/);
 }finally{await db.close();}
});
test('Atajos guardan acción, EFE y fecha privados; rechazan destinos arbitrarios y conservan la cuenta principal',async()=>{
 const {db,login}=await personal();try{
  const action=async data=>(await db.query("select public.tnt_personal_action('preferences',$1) r",[JSON.stringify(data)])).rows[0].r;
  await login(3);const context={efe:{group:'mujeres18',when:'latest'},saturday:{when:'date',date:'2026-10-31'},prepare:{when:'next'}};
  let r=await action({shortcuts:['efe','prepare','chat'],shortcut_context:context});assert.deepEqual(r.preferences.shortcut_context,context);assert.deepEqual(r.preferences.shortcuts,['efe','prepare','chat']);
  for(const shortcut_context of [{efe:{group:'admin'}},{chat:{href:'https://example.test'}},{schedule:{when:'date',date:'2026-10-30'}},{efe:{when:'date',date:'2026-02-30'}},{saturday:{when:'date'}},{efe:{group:null}},[]])await assert.rejects(action({shortcut_context}),/grupo y la fecha/);
  await login(4);r=(await db.query('select public.tnt_personal_context() r')).rows[0].r;assert(!r.preferences.shortcut_context||Object.keys(r.preferences.shortcut_context).length===0);assert.equal((await db.query('select count(*)::int n from public.tnt_personal_preferences')).rows[0].n,0);
  await db.exec('reset role');await db.query('select tnt_actions.merge_personal_state($1,$2)',[id(3),id(4)]);await login(4);r=(await db.query('select public.tnt_personal_context() r')).rows[0].r;assert.deepEqual(r.preferences.shortcut_context,context);
  await assert.rejects(db.query("update public.tnt_personal_preferences set shortcut_context='{}'"),/permission denied/);
 }finally{await db.close();}
});
