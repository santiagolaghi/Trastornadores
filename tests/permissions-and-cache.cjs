const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const U=require('../assets/tnt-components.js');
const root=path.resolve(__dirname,'..');
const view=(allowed,scope='*')=>({module:'buffet',scope,action:'view',allowed});

test('Las excepciones personales no habilitan módulos antes de aprobar staff',()=>{
 for(const staff_status of ['community','pending','rejected']){
  const info=U.accessInfo({system_role:'user',staff_status,enabled:true},[{module:'buffet',scope:'*',access_level:'manage',enabled:true}],'buffet','*',Date.now(),[view(true)],[view(true)]);
  assert.equal(info.level,'none');
 }
});
test('El acceso efectivo incluye el rol, la excepción y la vigencia del permiso',()=>{
 const a={system_role:'user',staff_status:'approved',enabled:true};
 assert.deepEqual(U.accessInfo(a,[],'buffet','*',Date.now(),[view(true)]),{level:'view',source:'role'});
 const grants=[{module:'buffet',scope:'*',access_level:'edit',enabled:true}];
 assert.deepEqual(U.accessInfo(a,grants,'buffet','*',Date.now(),[view(true)]),{level:'edit',source:'role'});
 assert.equal(U.accessInfo(a,grants,'buffet','*',Date.now(),[view(false)]).level,'none');
 assert.equal(U.accessInfo(a,grants,'buffet','*',Date.now(),[view(false)],[view(true)]).level,'edit');
 assert.equal(U.accessInfo(a,grants,'buffet','*',Date.now(),[view(true)],[view(false)]).level,'none');
 assert.equal(U.accessInfo(a,[{...grants[0],valid_from:'2099-01-01'}],'buffet').level,'none');
 assert.equal(U.accessInfo(a,[{...grants[0],valid_until:'2000-01-01'}],'buffet').level,'none');
});
test('Una exclusión EFE específica sigue aplicándose a administradores',()=>{
 const a={system_role:'admin',staff_status:'approved',enabled:true};
 const grants=[{module:'efe',scope:'*',enabled:true,access_level:'edit'},{module:'efe',scope:'mujeres18',enabled:false,access_level:'view'}];
 assert.equal(U.accessInfo(a,grants,'efe','mujeres18').level,'none');
 assert.equal(U.accessInfo(a,grants,'efe','varones').level,'edit');
 assert.equal(U.accessInfo(a,[],'buffet','*',Date.now(),[view(false)],[view(false)]).level,'manage');
});
test('Perfiles retira su caché antigua y el worker compartido no captura datos privados',async()=>{
 const removed=[],events={},self={addEventListener:(name,fn)=>events[name]=fn,skipWaiting:async()=>{},registration:{unregister:async()=>{self.retired=true}}};
 const caches={keys:async()=>['perfiles-v1','tnt-v47','otra-app'],delete:async name=>{removed.push(name);return true}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'perfiles/sw.js'),'utf8'),{self,caches});
 assert.equal(events.fetch,undefined);
 let pending;events.activate({waitUntil:p=>pending=p});await pending;
 assert.deepEqual(removed,['perfiles-v1']);assert.equal(self.retired,true);
 const shared={},origin='https://tnt-test.example';
 const worker={addEventListener:(name,fn)=>shared[name]=fn,clients:{claim:async()=>{}},location:{origin}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),{self:worker,caches,URL,location:{origin},Date});
 for(const url of ['https://oeodnnomgiddkblnlzay.supabase.co/rest/v1/tnt_people',origin+'/api/private']){
  shared.fetch({request:{method:'GET',url},respondWith:()=>assert.fail('Capturó una respuesta privada')});
 }
 removed.length=0;shared.activate({waitUntil:p=>pending=p});await pending;
 assert.deepEqual(removed,['perfiles-v1','tnt-v47']);assert(!removed.includes('otra-app'));
});
