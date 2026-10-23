/* A bounded, authenticated gateway. The YouVersion credential never reaches the browser. */
const SUPABASE='https://oeodnnomgiddkblnlzay.supabase.co';
const PUBLIC_KEY='sb_publishable_X06jWDKqV6jgKbaa1PrrbQ_zto1XeTJ';
const DESIRED=[128,2664,149,1782,127];
const attribution=data=>String(data.copyright||'').trim()||String(data.promotional_content||'').trim();
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function remote(path,headers){return fetch(path,{headers,redirect:'error',signal:AbortSignal.timeout(12000)});}
export async function GET(request){
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [\w.-]+$/.test(auth))return reply({error:'Iniciá sesión en TNT.',code:'AUTH_REQUIRED'},401);
  try{
    const headers={apikey:PUBLIC_KEY,Authorization:auth};
    const who=await remote(SUPABASE+'/auth/v1/user',headers);
    if(!who.ok)return reply({error:'Tu sesión venció. Volvé a entrar.',code:'AUTH_REQUIRED'},401);
    const user=await who.json();if(!user.id)return reply({error:'Sesión inválida.'},401);
    const accountResponse=await remote(SUPABASE+'/rest/v1/tnt_accounts?auth_user_id=eq.'+encodeURIComponent(user.id)+'&select=enabled&limit=1',headers);
    if(!accountResponse.ok)return reply({error:'No pudimos verificar tu cuenta.'},503);
    const accounts=await accountResponse.json();
    if(!accounts[0]?.enabled)return reply({error:'Tu cuenta no está habilitada.'},403);
    const key=process.env.YOUVERSION_APP_KEY;
    if(!key)return reply({error:'Estamos preparando la lectura de la Biblia.',code:'BIBLE_NOT_CONFIGURED'},503);
    const params=new URL(request.url).searchParams,action=params.get('action')||'versions';
    const apiHeaders={'X-YVP-App-Key':key,Accept:'application/json'};
    if(action==='fonts'){
      const r=await remote('https://api.youversion.com/v1/fonts/1/stylesheet',{'X-YVP-App-Key':key,Accept:'text/css'});
      if(!r.ok)return reply({css:''});
      const css=await r.text();
      // Relay the provider stylesheet, never the credential or downloaded font files.
      return reply({css:css.length<100000&&!css.includes(key)?css:''});
    }
    if(action==='versions'){
      const r=await remote('https://api.youversion.com/v1/bibles?language_ranges%5B%5D=es&page_size=99',apiHeaders);
      if(!r.ok)return reply({error:'No pudimos cargar las traducciones. Intentá nuevamente.'},502);
      const d=await r.json();
      return reply({versions:(d.data||[]).filter(v=>DESIRED.includes(v.id)).map(v=>({id:v.id,title:v.localized_title||v.title,abbreviation:v.localized_abbreviation||v.abbreviation})),preferred:128});
    }
    const id=Number(params.get('version')||128);
    if(!DESIRED.includes(id))return reply({error:'Traducción no disponible.'},400);
    let path='bibles/'+id;
    if(action==='passage'){
      const passage=params.get('passage')||'';
      // Exactly one chapter, optionally a bounded verse range within that chapter. Never an arbitrary URL.
      if(!/^[1-3]?[A-Z]{2,3}\.[1-9]\d{0,2}(?:\.[1-9]\d{0,2}(?:-[1-9]\d{0,2})?)?$/.test(passage))return reply({error:'Revisá el libro y el capítulo.'},400);
      path+='/passages/'+encodeURIComponent(passage)+'?format=html&include_headings=true&include_notes=false';
    }else if(action==='index')path+='/index';
    else if(action!=='version')return reply({error:'Acción no disponible.'},400);
    const r=await remote('https://api.youversion.com/v1/'+path,apiHeaders);
    if(r.status===403)return reply({error:'Esta traducción todavía no está habilitada para TNT.',code:'LICENSE_REQUIRED'},403);
    if(r.status===404)return reply({error:'No encontramos ese pasaje.'},404);
    if(r.status===429)return reply({error:'Hay muchas lecturas en este momento. Esperá un poco y volvé a intentar.'},429);
    if(!r.ok)return reply({error:'No pudimos cargar la lectura. Intentá nuevamente.'},502);
    const d=await r.json();
    // The upstream API supplies safe, licensed HTML and the original text, without rewriting it.
    if(action==='passage'){
      const metadata=await remote('https://api.youversion.com/v1/bibles/'+id,apiHeaders);
      if(!metadata.ok)return reply({error:'No pudimos verificar los créditos de esta traducción.'},502);
      const credit=attribution(await metadata.json());
      if(!credit)return reply({error:'No pudimos verificar los créditos de esta traducción.'},502);
      return reply({id:d.id,reference:d.reference,content:d.content,copyright:credit});
    }
    if(action==='index')return reply({books:d.books,text_direction:d.text_direction});
    const credit=attribution(d);
    if(!credit)return reply({error:'No pudimos verificar los créditos de esta traducción.'},502);
    return reply({id:d.id,title:d.localized_title||d.title,abbreviation:d.localized_abbreviation||d.abbreviation,copyright:credit,deep_link:d.youversion_deep_link});
  }catch(error){
    console.error('TNT Bible request failed',error.name);
    return reply({error:'La conexión tardó demasiado. Volvé a intentar.'},503);
  }
}
