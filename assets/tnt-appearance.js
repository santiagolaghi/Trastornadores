/* TNT's original visual identities, plus a personal screen mode. */
(() => {
 'use strict';
 const A=window.TNTAppearance={styles:{graphic:{name:'TNT Gráfico',description:'Titulares fuertes, naranja y tarjetas con profundidad.'},editorial:{name:'Editorial',description:'Tonos cálidos, composición limpia y detalles rojos.'},studio:{name:'Estudio',description:'Turquesa, bordes suaves y una lectura tranquila.'}},apply,open};
 let preview=null;
 function selected(){const id=preview||window.TNTExperience?.config?.appearance?.style||localStorage.getItem('tnt-style')||'graphic';return A.styles[id]?id:'graphic';}
 function apply(){document.documentElement.dataset.tntStyle=selected();if(!preview)localStorage.setItem('tnt-style',selected());document.querySelector('meta[name=theme-color]')?.setAttribute('content',document.documentElement.dataset.tntTheme==='dark'?'#17191c':'#f8f6ef');}
 function open(){
  const U=TNTUI,initial=selected(),admin=TNT.isAdmin,mode=localStorage.getItem('tnt-theme')||'light';let choice=initial;
  const o=U.modal('Apariencia de TNT','<div class="appearance-intro"><span>UNA APP · UNA IDENTIDAD</span><h3>Elegí cómo se siente TNT.</h3><p>Colores, tipografías, tarjetas, botones y navegación cambian juntos. Podés probar cada estilo antes de guardar.</p></div><form class="tnt-form appearance-form"><div class="appearance-options">'+Object.entries(A.styles).map(([id,s])=>'<label class="appearance-option" data-style-card="'+id+'"><input type="radio" name="style" value="'+id+'" '+(id===initial?'checked':'')+'><span class="appearance-mini"><i></i><b>TNT.</b><em></em><em></em><small>INICIO　 AGENDA　 CHAT</small></span><strong>'+s.name+'</strong><span>'+s.description+'</span></label>').join('')+'</div><fieldset class="appearance-modes"><legend>Modo de pantalla</legend>'+[['light','Claro'],['dark','Oscuro'],['system','Como mi teléfono']].map(([id,label])=>'<label><input type="radio" name="mode" value="'+id+'" '+(mode===id?'checked':'')+'>'+label+'</label>').join('')+'</fieldset><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="button" class="tnt-button" data-cancel>Cancelar vista previa</button><button type="submit" class="tnt-button primary">'+(admin?'Guardar preferencias':'Guardar modo de pantalla')+'</button></div>'+(!admin?'<p>El estilo de toda la app lo configura un administrador. El modo de pantalla se guarda para vos.</p>':'')+'</form>',true);
  o.querySelectorAll('[name=style]').forEach(input=>input.onchange=()=>{choice=input.value;preview=choice;apply();});
  o.querySelector('[data-cancel]').onclick=()=>U.closeModal(o);
  o.addEventListener('close',()=>{preview=null;apply();},{once:true});
  o.querySelector('form').onsubmit=async event=>{event.preventDefault();const button=o.querySelector('[type=submit]'),status=o.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando tus preferencias…';
   try{
    if(admin&&choice!==initial){const config=structuredClone(TNTExperience.config||{});config.appearance={...(config.appearance||{}),style:choice};const r=await TNT.sb.rpc('tnt_publish_experience',{p_config:config,p_revision:TNTExperience.revision});if(r.error)throw r.error;TNTExperience.config=config;TNTExperience.revision=Number(r.data);document.dispatchEvent(new CustomEvent('tnt:config',{detail:config}));}
    TNT.setTheme(event.target.elements.mode.value);preview=null;apply();await U.closeModal(o);U.toast('Tus preferencias ya están guardadas.');
   }catch(error){status.textContent=error.message;button.disabled=false;}
  };
 }
 for(const type of ['tnt:config','tnt:ready','tnt:theme'])document.addEventListener(type,apply);apply();
 const E=window.TNTExperience;if(E){const paint=E.paint;E.paint=()=>{paint();apply();};}
})();
