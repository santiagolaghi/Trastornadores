/* A small shared editor. Stored markup is always normalized before rendering. */
(() => {
  'use strict';
  const colors={purple:'#6b39b5',blue:'#175caa',red:'#ae2634',green:'#276437'};
  const esc=s=>TNTUI.esc(s);
  function clean(html){
    const doc=new DOMParser().parseFromString(String(html||'').slice(0,100000),'text/html');
    function walk(node){
      if(node.nodeType===3)return esc(node.textContent);
      if(node.nodeType!==1)return '';
      if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','IMG','VIDEO','AUDIO'].includes(node.tagName))return '';
      let inner=[...node.childNodes].map(walk).join(''),tag=node.tagName;
      if(tag==='BR')return '<br>';
      if(['B','STRONG','I','EM','U','S','P','DIV','UL','OL','LI','BLOCKQUOTE'].includes(tag))return '<'+tag.toLowerCase()+'>'+inner+'</'+tag.toLowerCase()+'>';
      let cls=[...node.classList].find(c=>/^tnt-color-(purple|blue|red|green)$/.test(c));
      const value=(node.getAttribute('color')||node.style.color||'').toLowerCase().replace(/\s/g,'');
      const rgb={purple:'rgb(107,57,181)',blue:'rgb(23,92,170)',red:'rgb(174,38,52)',green:'rgb(39,100,55)'};
      for(const [name,color] of Object.entries(colors))if(value===color||value===rgb[name])cls='tnt-color-'+name;
      if(node.classList.contains('tnt-highlight')||node.style.backgroundColor==='rgb(247, 223, 134)')cls='tnt-highlight';
      return cls?'<span class="'+cls+'">'+inner+'</span>':inner;
    }
    return [...doc.body.childNodes].map(walk).join('');
  }
  function text(html){const el=document.createElement('div');el.innerHTML=clean(html).replace(/<br\s*\/?>/g,'\n').replace(/<\/(?:div|p)>/g,'\n');return el.textContent.replace(/\n$/,'');}
  function render(plain,rich){return rich?'<span class="tnt-rich">'+clean(rich)+'</span>':esc(plain||'').replace(/(https?:\/\/[^\s<>]+)/g,url=>'<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a>');}
  function attach(input,options={}){
    const wrap=document.createElement('div');wrap.className='tnt-editor';
    wrap.innerHTML='<div class="tnt-editor-tools" role="toolbar" aria-label="Formato del texto"><button type="button" data-command="bold" aria-label="Negrita"><b>B</b></button><button type="button" data-command="italic" aria-label="Cursiva"><i>I</i></button><button type="button" data-command="underline" aria-label="Subrayar"><u>U</u></button><button type="button" data-command="hiliteColor" aria-label="Resaltar">▰</button><button type="button" class="tnt-swatch tnt-swatch-purple" data-color="purple" aria-label="Texto violeta" title="Violeta"></button><button type="button" class="tnt-swatch tnt-swatch-blue" data-color="blue" aria-label="Texto azul" title="Azul"></button><button type="button" class="tnt-swatch tnt-swatch-red" data-color="red" aria-label="Texto rojo" title="Rojo"></button><button type="button" class="tnt-swatch tnt-swatch-green" data-color="green" aria-label="Texto verde" title="Verde"></button><button type="button" data-command="removeFormat" aria-label="Quitar formato">Aa</button></div><div class="tnt-editor-content tnt-rich" contenteditable="true" role="textbox" aria-multiline="true"></div>';
    input.after(wrap);input.hidden=true;const area=wrap.querySelector('[contenteditable]');area.setAttribute('aria-label',input.getAttribute('aria-label')||input.placeholder||'Texto');area.dataset.placeholder=input.placeholder||'Escribí acá…';
    const sync=()=>{input.value=text(area.innerHTML);input.dispatchEvent(new Event('input',{bubbles:true}));};
    const api={area,wrap,get:()=>({text:text(area.innerHTML),html:clean(area.innerHTML)}),set:(plain,rich)=>{area.innerHTML=rich?clean(rich):esc(plain||'').replace(/\n/g,'<br>');sync();},focus:()=>area.focus(),lock:value=>{area.contentEditable=value?'false':'true';wrap.querySelectorAll('button,select').forEach(b=>b.disabled=value);}};
    let selection=null;area.addEventListener('keyup',save);area.addEventListener('mouseup',save);area.addEventListener('touchend',save);area.addEventListener('pointerup',save);
    document.addEventListener('selectionchange',()=>{if(document.activeElement===area)save();});
    function save(){const s=getSelection();if(s.rangeCount&&!s.isCollapsed&&area.contains(s.anchorNode)&&area.contains(s.focusNode))selection=s.getRangeAt(0).cloneRange();}
    function command(cmd,value){
      const range=selection?.cloneRange();if(!range||range.collapsed||!area.contains(range.commonAncestorContainer)){area.focus();return;}
      if(['foreColor','hiliteColor','underline','bold','italic'].includes(cmd)){
        const node=document.createElement(({underline:'u',bold:'strong',italic:'em'})[cmd]||'span');
        if(cmd==='foreColor')node.className='tnt-color-'+Object.keys(colors).find(k=>colors[k]===value);
        if(cmd==='hiliteColor')node.className='tnt-highlight';
        node.append(range.extractContents());range.insertNode(node);const s=getSelection();s.removeAllRanges();s.selectAllChildren(node);selection=s.getRangeAt(0).cloneRange();
      }else{area.focus();const s=getSelection();s.removeAllRanges();s.addRange(range);document.execCommand(cmd,false,value);save();}
      sync();
    }
    wrap.querySelectorAll('[data-command]').forEach(b=>{b.onpointerdown=e=>{save();e.preventDefault();};b.onclick=()=>command(b.dataset.command,b.dataset.command==='hiliteColor'?'#f7df86':null);});
    wrap.querySelectorAll('[data-color]').forEach(b=>{b.onpointerdown=save;b.onclick=()=>command('foreColor',colors[b.dataset.color]);});
    area.addEventListener('input',()=>{if(text(area.innerHTML).length>10000){area.textContent=text(area.innerHTML).slice(0,10000);}sync();save();});
    area.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));sync();});
    area.addEventListener('keydown',e=>input.dispatchEvent(new KeyboardEvent('keydown',{key:e.key,shiftKey:e.shiftKey,isComposing:e.isComposing,bubbles:true,cancelable:true}))===false&&e.preventDefault());
    api.set(input.value,options.html);input.tntEditor=api;return api;
  }
  window.TNTEditor={clean,text,render,attach};
})();
