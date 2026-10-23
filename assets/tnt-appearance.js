/* A single identity for TNT, with a personal screen mode. */
(() => {
 'use strict';
 const A=window.TNTAppearance={styles:{community:{name:'Comunidad',description:'Una identidad para toda TNT.'}},apply,open};
 function apply(){document.documentElement.dataset.tntStyle='community';document.querySelector('meta[name=theme-color]')?.setAttribute('content',document.documentElement.dataset.tntTheme==='dark'?'#111923':'#fbfcfd');}
 function open(){const U=TNTUI,mode=localStorage.getItem('tnt-theme')||'light';const o=U.modal('Apariencia de TNT','<section class="life-card life-feature"><span class="life-eyebrow">TU EXPERIENCIA</span><h2>Un mismo espacio, a tu manera.</h2><p>Inicio, Comunidad, Perfil y las herramientas del equipo comparten el mismo estilo.</p></section><form class="c-form appearance-form"><fieldset class="life-difficulties"><legend>Modo de pantalla</legend>'+[['light','Claro','Una pantalla luminosa y tranquila.'],['dark','Oscuro','Colores suaves para momentos con poca luz.'],['system','Como mi teléfono','Se adapta a la configuración del dispositivo.']].map(([id,name,copy])=>'<label><input type="radio" name="mode" value="'+id+'" '+(mode===id?'checked':'')+'><span><b>'+name+'</b><small>'+copy+'</small></span></label>').join('')+'</fieldset><button class="life-button" type="submit">Guardar preferencia</button></form>');o.querySelector('form').onsubmit=e=>{e.preventDefault();TNT.setTheme(e.target.elements.mode.value);U.closeModal(o);};}
 for(const type of ['tnt:config','tnt:ready','tnt:theme'])document.addEventListener(type,apply);apply();
})();
