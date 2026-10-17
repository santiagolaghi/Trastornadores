/* Complete, versioned visual identities. Shared defaults are published by admins. */
(() => {
 'use strict';
 const A=window.TNTAppearance={styles:{graphic:{name:'TNT Gráfico',description:'Titulares fuertes, naranja y tarjetas con profundidad.'},editorial:{name:'Editorial',description:'Tonos cálidos, composición limpia y detalles rojos.'},studio:{name:'Estudio',description:'Turquesa, bordes suaves y una lectura tranquila.'}},apply,open};
 let preview=null;
 function selected(){return preview||TNTExperience.config?.appearance?.style||localStorage.getItem('tnt-style')||'graphic';}
 function apply(){const style=selected();document.documentElement.dataset.tntStyle=A.styles[style]?style:'graphic';if(!preview)localStorage.setItem('tnt-style',document.documentElement.dataset.tntStyle);document.querySelector('meta[name=theme-color]')?.setAttribute('content',document.documentElement.dataset.tntTheme==='dark'?'#17191c':'#f8f6ef');}
 function open(){
  const U=TNTUI,initial=selected(),admin=TNT.isAdmin;let choice=initial;
  const o=U.modal('Apariencia de TNT','<div class="appearance-intro"><span>UNA APP · UNA IDENTIDAD</span><h3>Elegí cómo se siente TNT.</h3><p>Colores, tipografías, tarjetas, botones y navegación cambian juntos. Podés probar cada estilo antes de guardar.</p></div><form class="tnt-form appearance-form"><div class="appearance-options">'+Object.entries(A.styles).map(([id,s])=>'<label class="appearance-option" data-style-card="'+id+'"><input type="radio" name="style" value="'+id+'" '+(id===initial?'checked':'')+'><span class="appearance-mini"><i></i><b>TNT.</b><em></em><em></em><small>INICIO　 AGENDA　 CHAT</small></span><strong>'+s.name+'</strong><span>'+s.description+'</span></label>').join('')+'</div><div class="appearance-mode"><span>Modo de pantalla</span><button type="button" class="tnt-button" data-mode>'+U.icon('moon')+'Cambiar claro / oscuro</button></div><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="button" class="tnt-button" data-cancel>Cancelar vista previa</button>'+(admin?'<button type="submit" class="tnt-button primary">Guardar estilo para TNT</button>':'')+'</div>'+(!admin?'<p>El estilo de toda la app lo configura un administrador. Podés cambiar el modo claro u oscuro para tu pantalla.</p>':'')+'</form>',true);
  o.querySelectorAll('[name=style]').forEach(input=>input.onchange=()=>{choice=input.value;preview=choice;apply();});
  o.querySelector('[data-mode]').onclick=()=>TNT.toggleTheme();o.querySelector('[data-cancel]').onclick=()=>U.closeModal(o);
  o.addEventListener('close',()=>{preview=null;apply();},{once:true});
  o.querySelector('form').onsubmit=async event=>{event.preventDefault();if(!admin)return;const button=o.querySelector('[type=submit]'),status=o.querySelector('[role=status]');button.disabled=true;status.textContent='Guardando el estilo…';
   try{const config=structuredClone(TNTExperience.config||{});config.appearance={...(config.appearance||{}),style:choice};const r=await TNT.sb.rpc('tnt_publish_experience',{p_config:config,p_revision:TNTExperience.revision});if(r.error)throw r.error;TNTExperience.config=config;TNTExperience.revision=Number(r.data);preview=null;apply();await U.closeModal(o);document.dispatchEvent(new CustomEvent('tnt:config',{detail:config}));U.toast('El nuevo estilo ya está aplicado a TNT.');}
   catch(error){status.textContent=error.message;button.disabled=false;}
  };
 }
 document.addEventListener('tnt:config',apply);document.addEventListener('tnt:ready',apply);document.addEventListener('tnt:theme',apply);apply();
 const E=window.TNTExperience;if(E){const paint=E.paint;E.paint=()=>{paint();apply();};}
})();
