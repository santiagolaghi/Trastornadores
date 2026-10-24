const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const C=require('../assets/tnt-colors.js'),G=require('../assets/tnt-bible-games.js');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..');

test('Five palettes keep readable action colors and custom RGB values cannot inject CSS',()=>{
 assert.equal(Object.keys(C.palettes).length,5);assert.equal(Object.keys(C.activity).length,12);
 assert.equal(C.ink('#000000'),'#FFFFFF');assert.equal(C.ink('#FFFFFF'),'#000000');assert.equal(C.activityColor('#162b49'),'#162B49');
 for(const p of Object.values(C.palettes))assert.equal(C.ink(p.accent),'#000000');
 for(const invalid of ['red','#fff','#112233;color:red','url(https://example.test)','var(--x)','transparent']){
  assert.equal(C.validHex(invalid),false);assert.equal(C.activityColor(invalid),C.activity.lime[1]);
 }
});

test('The highlight migration preserves existing choices and validates custom RGB in real PostgreSQL',async()=>{
 const db=new PGlite();try{
  await db.exec("create table public.tnt_tasks(id serial primary key,feature_color text not null default 'lime' constraint tnt_tasks_feature_color_check check(feature_color in('lime','peach','lilac','blue','rose')));insert into tnt_tasks(feature_color) values('peach');");
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261023230939_approved_activity_colors.sql'),'utf8'));
  for(const color of [...Object.keys(C.activity),'#162b49','#FFFFFF','#000000'])await db.query('insert into tnt_tasks(feature_color) values($1)',[color]);
  for(const value of ['#123','black','#112233;display:none','var(--x)'])await assert.rejects(db.query('insert into tnt_tasks(feature_color) values($1)',[value]),/tnt_tasks_feature_color_check/);
  assert.equal((await db.query('select feature_color from tnt_tasks where id=1')).rows[0].feature_color,'peach');
  assert.equal((await db.query("select feature_color from tnt_tasks where feature_color='#162b49'")).rows.length,1);
 }finally{await db.close();}
});

test('The local public-domain Bible has all 66 books, 1189 chapters and 31102 verses',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/bible/rvr1909/manifest.json')));let chapters=0,verses=0;
 assert.equal(G.books.length,66);assert.equal(manifest.license,'Dominio público');
 for(const book of G.books){const data=JSON.parse(fs.readFileSync(path.join(root,'assets/bible/rvr1909',book.id+'.json')));assert.equal(data.book,book.id);assert.equal(Object.keys(data.chapters).length,book.chapters);chapters+=book.chapters;
  for(const list of Object.values(data.chapters)){assert(list.every(v=>Number.isInteger(v.verse)&&v.verse>0&&typeof v.text==='string'));assert.equal(new Set(list.map(v=>v.verse)).size,list.length);verses+=list.length;}
 }
 assert.equal(chapters,1189);assert.equal(verses,31102);
});

test('The reader loads one bounded local book, selects verses and rejects paths',async()=>{
 let requests=0;const window={TNTBibleGames:G,TNTUI:{esc:text=>text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'assets/tnt-bible-text.js'),'utf8'),{window,TNTUI:window.TNTUI,AbortSignal,fetch:async url=>{requests++;return{ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,url.slice(1)),'utf8'))};}});
 const p=await window.TNTBibleText.passage('PSA.23.1');assert(p.text.includes('es mi pastor; nada me faltará'));assert.equal(p.version,1909);assert(p.copyright.includes('1909'));
 await window.TNTBibleText.passage('PSA.23.2');assert.equal(requests,1);
 for(const invalid of ['../../secret','PSA.151','GEN.1.999','GEN.1.3-1'])await assert.rejects(window.TNTBibleText.passage(invalid));
});
