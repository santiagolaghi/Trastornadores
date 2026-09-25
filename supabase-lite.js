/* TNT local Supabase browser client: minimal compatible subset used by TNT apps. */
(function(g){
'use strict';
const enc=v=>encodeURIComponent(String(v));
const safeJson=async r=>{const t=await r.text();if(!t)return null;try{return JSON.parse(t)}catch{return t}};
const jwtPayload=t=>{try{const p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');const s=decodeURIComponent(Array.from(atob(p.padEnd(Math.ceil(p.length/4)*4,'='))).map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));return JSON.parse(s)}catch{return {}}};
class Auth{
  constructor(c){this.c=c;this.listeners=new Set();this.key='tnt-auth-'+new URL(c.url).hostname.split('.')[0];this.session=null;this._load();this._consumeUrl()}
  _load(){try{this.session=JSON.parse(localStorage.getItem(this.key)||'null')}catch{this.session=null}}
  _save(s){this.session=s||null;try{s?localStorage.setItem(this.key,JSON.stringify(s)):localStorage.removeItem(this.key)}catch{};this.c._session=this.session}
  _emit(ev){for(const cb of this.listeners)try{cb(ev,this.session)}catch(e){console.error(e)}}
  _consumeUrl(){const h=new URLSearchParams(location.hash.replace(/^#/,''));const at=h.get('access_token'),rt=h.get('refresh_token');if(at){const p=jwtPayload(at);this._save({access_token:at,refresh_token:rt||'',token_type:h.get('token_type')||'bearer',expires_in:Number(h.get('expires_in')||3600),expires_at:Number(p.exp||Math.floor(Date.now()/1000)+3600),user:null});history.replaceState({},document.title,location.pathname+location.search)}}
  async _request(path,opt={}){const r=await fetch(this.c.url+'/auth/v1'+path,{...opt,headers:{apikey:this.c.key,'Content-Type':'application/json',...(opt.headers||{})}});const data=await safeJson(r);if(!r.ok)return {data:null,error:{message:data?.msg||data?.message||data?.error_description||data?.error||('Auth '+r.status),status:r.status,details:data}};return {data,error:null}}
  async _user(){if(!this.session?.access_token)return null;const r=await fetch(this.c.url+'/auth/v1/user',{headers:{apikey:this.c.key,Authorization:'Bearer '+this.session.access_token}});if(!r.ok)return null;return safeJson(r)}
  async _refresh(){if(!this.session?.refresh_token)return this.session;const x=await this._request('/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:this.session.refresh_token})});if(x.error){this._save(null);return null}const d=x.data||{};const p=jwtPayload(d.access_token||'');this._save({access_token:d.access_token,refresh_token:d.refresh_token||this.session.refresh_token,token_type:d.token_type||'bearer',expires_in:d.expires_in||3600,expires_at:p.exp||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user||null});return this.session}
  async getSession(){if(this.session?.expires_at&&this.session.expires_at<Math.floor(Date.now()/1000)+30)await this._refresh();if(this.session&&!this.session.user){this.session.user=await this._user();this._save(this.session)}return {data:{session:this.session},error:null}}
  onAuthStateChange(cb){this.listeners.add(cb);setTimeout(()=>cb('INITIAL_SESSION',this.session),0);return {data:{subscription:{unsubscribe:()=>this.listeners.delete(cb)}}}}
  async signInWithOAuth({provider,options={}}){const redirect=options.redirectTo||location.href;const u=this.c.url+'/auth/v1/authorize?provider='+enc(provider)+'&redirect_to='+enc(redirect);location.assign(u);return {data:{provider,url:u},error:null}}
  async signInWithOtp({email,options={}}){const body={email,create_user:options.shouldCreateUser!==false,data:options.data||{}};if(options.emailRedirectTo)body.redirect_to=options.emailRedirectTo;const x=await this._request('/otp',{method:'POST',body:JSON.stringify(body)});return {data:x.data,error:x.error}}
  async signInWithPassword({email,password}){const x=await this._request('/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(x.error)return {data:{user:null,session:null},error:x.error};const d=x.data||{},p=jwtPayload(d.access_token||'');this._save({access_token:d.access_token,refresh_token:d.refresh_token||'',token_type:d.token_type||'bearer',expires_in:d.expires_in||3600,expires_at:p.exp||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user||null});this._emit('SIGNED_IN');return {data:{user:this.session.user,session:this.session},error:null}}
  async signUp({email,password,options={}}){const x=await this._request('/signup',{method:'POST',body:JSON.stringify({email,password,data:options.data||{}})});if(x.error)return {data:{user:null,session:null},error:x.error};const d=x.data||{};if(d.access_token){const p=jwtPayload(d.access_token);this._save({access_token:d.access_token,refresh_token:d.refresh_token||'',token_type:d.token_type||'bearer',expires_in:d.expires_in||3600,expires_at:p.exp||Math.floor(Date.now()/1000)+(d.expires_in||3600),user:d.user||null});this._emit('SIGNED_IN')}return {data:{user:d.user||null,session:this.session},error:null}}
  async signOut(){if(this.session?.access_token)try{await fetch(this.c.url+'/auth/v1/logout',{method:'POST',headers:{apikey:this.c.key,Authorization:'Bearer '+this.session.access_token}})}catch{}this._save(null);this._emit('SIGNED_OUT');return {error:null}}
}
class Query{
  constructor(c,table){this.c=c;this.table=table;this.method='GET';this.body=null;this.params=[];this.columns='*';this.want=false;this.one=0;this.prefer=[]}
  select(cols='*'){this.columns=cols||'*';this.want=true;return this}
  insert(v){this.method='POST';this.body=v;return this}
  update(v){this.method='PATCH';this.body=v;return this}
  delete(){this.method='DELETE';return this}
  upsert(v,opt={}){this.method='POST';this.body=v;this.prefer.push('resolution=merge-duplicates');if(opt.onConflict)this.params.push(['on_conflict',opt.onConflict]);return this}
  eq(k,v){this.params.push([k,'eq.'+v]);return this}
  neq(k,v){this.params.push([k,'neq.'+v]);return this}
  in(k,a){this.params.push([k,'in.('+(a||[]).map(v=>String(v).replace(/,/g,'\\,')).join(',')+')']);return this}
  is(k,v){this.params.push([k,'is.'+v]);return this}
  gte(k,v){this.params.push([k,'gte.'+v]);return this}
  lte(k,v){this.params.push([k,'lte.'+v]);return this}
  gt(k,v){this.params.push([k,'gt.'+v]);return this}
  lt(k,v){this.params.push([k,'lt.'+v]);return this}
  filter(k,op,v){this.params.push([k,op+'.'+v]);return this}
  order(k,opt={}){this.params.push(['order',k+'.'+(opt.ascending===false?'desc':'asc')+(opt.nullsFirst===true?'.nullsfirst':opt.nullsFirst===false?'.nullslast':'')]);return this}
  limit(n){this.params.push(['limit',n]);return this}
  range(a,b){this.params.push(['offset',a]);this.params.push(['limit',b-a+1]);return this}
  single(){this.one=1;return this}
  maybeSingle(){this.one=2;return this}
  async execute(){
    const q=new URLSearchParams();if(this.want||this.method==='GET')q.set('select',this.columns);for(const [k,v] of this.params)q.append(k,v);
    const h=this.c._headers();if(this.body!=null)h['Content-Type']='application/json';if(this.method!=='GET'&&this.want)this.prefer.push('return=representation');if(this.prefer.length)h.Prefer=[...new Set(this.prefer)].join(',');if(this.one)h.Accept='application/vnd.pgrst.object+json';
    let r;try{r=await fetch(this.c.url+'/rest/v1/'+this.table+(q.toString()?'?'+q.toString():''),{method:this.method,headers:h,body:this.body==null?undefined:JSON.stringify(this.body)})}catch(e){return {data:null,error:{message:e.message||'Error de red'}}}
    const data=await safeJson(r);if(!r.ok){if(this.one===2&&r.status===406)return {data:null,error:null};return {data:null,error:{message:data?.message||data?.hint||('Error '+r.status),code:data?.code,details:data,status:r.status}}}
    if(this.one&&Array.isArray(data))return {data:data[0]||null,error:this.one===1&&!data.length?{message:'No rows'}:null};return {data,error:null,count:null,status:r.status,statusText:r.statusText}
  }
  then(a,b){return this.execute().then(a,b)}catch(a){return this.execute().catch(a)}finally(a){return this.execute().finally(a)}
}
class StorageBucket{
  constructor(c,b){this.c=c;this.b=b}
  async upload(path,file,opt={}){const h=this.c._headers();h['x-upsert']=opt.upsert?'true':'false';if(file?.type)h['Content-Type']=file.type;let r;try{r=await fetch(this.c.url+'/storage/v1/object/'+enc(this.b)+'/'+path.split('/').map(enc).join('/'),{method:'POST',headers:h,body:file})}catch(e){return {data:null,error:{message:e.message}}}const d=await safeJson(r);return r.ok?{data:d,error:null}:{data:null,error:{message:d?.message||d?.error||('Storage '+r.status),status:r.status}}}
  async createSignedUrl(path,expiresIn){const r=await fetch(this.c.url+'/storage/v1/object/sign/'+enc(this.b)+'/'+path.split('/').map(enc).join('/'),{method:'POST',headers:{...this.c._headers(),'Content-Type':'application/json'},body:JSON.stringify({expiresIn})});const d=await safeJson(r);if(!r.ok)return {data:null,error:{message:d?.message||d?.error||('Storage '+r.status)}};let s=d?.signedURL||d?.signedUrl||d?.signed_url||'';if(s&&s.startsWith('/'))s=this.c.url+'/storage/v1'+s;return {data:{...d,signedUrl:s,signedURL:s},error:null}}
  getPublicUrl(path){return {data:{publicUrl:this.c.url+'/storage/v1/object/public/'+enc(this.b)+'/'+path.split('/').map(enc).join('/')}}}
}
class Client{
  constructor(url,key,opt={}){this.url=url.replace(/\/$/,'');this.key=key;this.opt=opt;this._session=null;this.auth=new Auth(this);this.storage={from:b=>new StorageBucket(this,b)}}
  _headers(){const tok=this.auth?.session?.access_token;return {apikey:this.key,Authorization:'Bearer '+(tok||this.key)}}
  from(t){return new Query(this,t)}
  async rpc(name,args={}){let r;try{r=await fetch(this.url+'/rest/v1/rpc/'+enc(name),{method:'POST',headers:{...this._headers(),'Content-Type':'application/json'},body:JSON.stringify(args||{})})}catch(e){return {data:null,error:{message:e.message}}}const d=await safeJson(r);return r.ok?{data:d,error:null}:{data:null,error:{message:d?.message||d?.hint||('RPC '+r.status),code:d?.code,details:d,status:r.status}}}
}
g.supabase={createClient:(url,key,opt)=>new Client(url,key,opt)};
})(window);