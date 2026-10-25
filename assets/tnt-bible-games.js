/* Bible facts and game state shared by the mobile UI and its tests. No Bible translation text. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TNTBibleGames = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const rows = [
    ['GEN','Génesis',50],['EXO','Éxodo',40],['LEV','Levítico',27],['NUM','Números',36],['DEU','Deuteronomio',34],
    ['JOS','Josué',24],['JDG','Jueces',21],['RUT','Rut',4],['1SA','1 Samuel',31],['2SA','2 Samuel',24],
    ['1KI','1 Reyes',22],['2KI','2 Reyes',25],['1CH','1 Crónicas',29],['2CH','2 Crónicas',36],['EZR','Esdras',10],
    ['NEH','Nehemías',13],['EST','Ester',10],['JOB','Job',42],['PSA','Salmos',150],['PRO','Proverbios',31],
    ['ECC','Eclesiastés',12],['SNG','Cantares',8],['ISA','Isaías',66],['JER','Jeremías',52],['LAM','Lamentaciones',5],
    ['EZK','Ezequiel',48],['DAN','Daniel',12],['HOS','Oseas',14],['JOL','Joel',3],['AMO','Amós',9],
    ['OBA','Abdías',1],['JON','Jonás',4],['MIC','Miqueas',7],['NAM','Nahúm',3],['HAB','Habacuc',3],
    ['ZEP','Sofonías',3],['HAG','Hageo',2],['ZEC','Zacarías',14],['MAL','Malaquías',4],
    ['MAT','Mateo',28],['MRK','Marcos',16],['LUK','Lucas',24],['JHN','Juan',21],['ACT','Hechos',28],
    ['ROM','Romanos',16],['1CO','1 Corintios',16],['2CO','2 Corintios',13],['GAL','Gálatas',6],['EPH','Efesios',6],
    ['PHP','Filipenses',4],['COL','Colosenses',4],['1TH','1 Tesalonicenses',5],['2TH','2 Tesalonicenses',3],
    ['1TI','1 Timoteo',6],['2TI','2 Timoteo',4],['TIT','Tito',3],['PHM','Filemón',1],['HEB','Hebreos',13],
    ['JAS','Santiago',5],['1PE','1 Pedro',5],['2PE','2 Pedro',3],['1JN','1 Juan',5],['2JN','2 Juan',1],
    ['3JN','3 Juan',1],['JUD','Judas',1],['REV','Apocalipsis',22]
  ];
  const books = rows.map(([id,name,chapters],index) => Object.freeze({id,name,chapters,index,testament:index<39?'old':'new'}));
  const characters = [
    ['Noé','Construyó un arca antes del diluvio.','Génesis 6–9'],
    ['Moisés','Dios le habló desde una zarza que ardía sin consumirse.','Éxodo 3'],
    ['Rut','Acompañó a Noemí y llegó con ella a Belén.','Rut 1'],
    ['David','Era pastor y se enfrentó a Goliat.','1 Samuel 17'],
    ['Ester','Fue reina e intercedió por su pueblo ante el rey.','Ester 4–7'],
    ['Daniel','Fue arrojado a un foso de leones por seguir orando a Dios.','Daniel 6'],
    ['José','Sus hermanos lo vendieron y años después administró alimentos en Egipto.','Génesis 37 y 41'],
    ['Jonás','Después de huir en un barco, estuvo dentro de un gran pez.','Jonás 1–2'],
    ['Samuel','Siendo niño, escuchó que Dios lo llamaba durante la noche.','1 Samuel 3'],
    ['Gedeón','Dios redujo su ejército a trescientos hombres.','Jueces 7'],
    ['Rebeca','Ofreció agua a un viajero y a sus camellos junto a un pozo.','Génesis 24'],
    ['Elías','Fue un profeta que confrontó a los profetas de Baal en el monte Carmelo.','1 Reyes 18'],
    ['María','Recibió el anuncio del ángel Gabriel de que sería la madre de Jesús.','Lucas 1'],
    ['Pedro','Era pescador y negó conocer a Jesús tres veces.','Lucas 5 y 22'],
    ['Pablo','Se dirigía a Damasco cuando una luz lo rodeó y Jesús le habló.','Hechos 9'],
    ['Marta','Recibió a Jesús en su casa y era hermana de María.','Lucas 10'],
    ['Lidia','Vendía telas de púrpura y recibió a Pablo y sus compañeros en Filipos.','Hechos 16'],
    ['Juan el Bautista','Bautizó a Jesús en el río Jordán.','Mateo 3'],
    ['Abraham','Dejó su tierra y salió hacia el lugar que Dios le mostraría.','Génesis 12'],
    ['Sara','Fue madre de Isaac en su vejez.','Génesis 21'],
    ['Isaac','Fue hijo de Abraham y Sara.','Génesis 21'],
    ['Jacob','Soñó con una escalera que llegaba al cielo.','Génesis 28'],
    ['Josué','Guio al pueblo de Israel al cruzar el Jordán.','Josué 3'],
    ['Débora','Fue profetisa y jueza de Israel.','Jueces 4'],
    ['Ana','Oró por un hijo y fue madre del profeta Samuel.','1 Samuel 1'],
    ['Salomón','Pidió sabiduría para gobernar a su pueblo.','1 Reyes 3'],
    ['Nehemías','Organizó la reconstrucción de las murallas de Jerusalén.','Nehemías 2–6'],
    ['Esdras','Leyó el libro de la Ley ante el pueblo reunido.','Nehemías 8'],
    ['Zaqueo','Subió a un árbol para poder ver a Jesús.','Lucas 19'],
    ['Nicodemo','Visitó a Jesús de noche para conversar con él.','Juan 3'],
    ['Tomás','Quiso ver las heridas de Jesús antes de creer que había resucitado.','Juan 20'],
    ['Andrés','Llevó a su hermano Simón Pedro a conocer a Jesús.','Juan 1'],
    ['Felipe','Explicó las Escrituras a un funcionario etíope durante un viaje.','Hechos 8'],
    ['Esteban','Fue uno de los siete elegidos para servir en la primera comunidad.','Hechos 6'],
    ['Bernabé','Acompañó a Pablo y fue conocido por animar a otros.','Hechos 4 y 13'],
    ['Timoteo','Acompañó a Pablo y recibió dos cartas que llevan su nombre.','Hechos 16; 1 y 2 Timoteo'],
    ['Priscila','Junto a Aquila, ayudó a Apolos a comprender mejor el camino de Dios.','Hechos 18'],
    ['Dorcas','Hacía ropa y ayudaba a las personas necesitadas en Jope.','Hechos 9'],
    ['María Magdalena','Fue al sepulcro y anunció a los discípulos que había visto al Señor.','Juan 20'],
    ['Bartimeo','Era un hombre ciego que llamó a Jesús junto al camino.','Marcos 10'],
    ['Eliseo','Fue el profeta que acompañó y sucedió a Elías.','2 Reyes 2'],
    ['Rahab','Escondió a los espías que llegaron a Jericó.','Josué 2']
  ];
  const levels = Object.freeze({easy:{label:'Para empezar',seconds:150,count:5,pairs:4},normal:{label:'Un poco más',seconds:120,count:7,pairs:5},hard:{label:'Todo un desafío',seconds:90,count:10,pairs:6}});
  const associations=[['Noé','Un arca','Génesis 6–9'],['Moisés','Una zarza encendida','Éxodo 3'],['David','Una honda','1 Samuel 17'],['Jonás','Un gran pez','Jonás 1–2'],['Daniel','Un foso de leones','Daniel 6'],['José','Sueños y Egipto','Génesis 37 y 41'],['Ester','Una reina que intercede','Ester 4–7'],['Zaqueo','Un árbol junto al camino','Lucas 19'],['Pedro','Redes de pescador','Lucas 5'],['Pablo','El camino a Damasco','Hechos 9'],['Rut','Un viaje con Noemí','Rut 1'],['Samuel','Una voz en la noche','1 Samuel 3'],['Salomón','Un pedido de sabiduría','1 Reyes 3'],['Nehemías','Murallas por reconstruir','Nehemías 2–6'],['Lidia','Telas de púrpura','Hechos 16'],['Dorcas','Ropa para ayudar','Hechos 9']];
  const timelines=[
   {name:'Los primeros pasos',events:['La creación','Noé construye el arca','Abraham sale de su tierra','José llega a Egipto','Moisés guía la salida de Egipto'],reference:'Génesis 1–2; 6–9; 12; 37; Éxodo 12–14'},
   {name:'El pueblo de Israel',events:['La salida de Egipto','El cruce del Jordán con Josué','Samuel unge a David','Salomón construye el templo','Nehemías reconstruye las murallas'],reference:'Éxodo 12–14; Josué 3; 1 Samuel 16; 1 Reyes 6; Nehemías 6'},
   {name:'La vida de Jesús',events:['El nacimiento de Jesús','Su bautismo en el Jordán','La última cena','La crucifixión','La resurrección'],reference:'Lucas 2; Mateo 3; Lucas 22–24'},
   {name:'La primera comunidad',events:['Jesús resucita','La ascensión de Jesús','Pentecostés','El encuentro de Pablo camino a Damasco','Pablo y Bernabé salen de viaje'],reference:'Lucas 24; Hechos 1–2; 9; 13'}
  ];
  function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function rounds(kind,level,random,options={}){
    if(kind==='order')return Array.from({length:3},(_,round)=>{const n=level.count,start=options.startFrom==='beginning'?round*n:Math.floor(random()*(books.length-n+1)),answer=books.slice(start,start+n);return {question:'¿En qué orden van?',answer:answer.map(b=>b.id),choices:shuffle(answer,random),reference:'Orden de los libros en la Biblia',explanation:answer.map(b=>b.name).join(' → ')};});
    if(kind==='timeline')return shuffle(timelines,random).slice(0,3).map(t=>({question:t.name,answer:t.events.map((_,i)=>String(i)),choices:shuffle(t.events.map((name,i)=>({id:String(i),name})),random),reference:t.reference,explanation:t.events.join(' → ')}));
    if(kind==='pairs')return Array.from({length:3},()=>{const selected=shuffle(associations,random).slice(0,level.pairs);return{question:'Encontrá las parejas',pairs:selected,choices:shuffle(selected.flatMap(([person,object,reference],i)=>[{id:'p'+i,name:person,match:String(i),reference},{id:'o'+i,name:object,match:String(i),reference}]),random),reference:'Personas e historias',explanation:selected.map(([a,b])=>a+' · '+b).join(' / ')};});
    if(kind==='quiz')return shuffle(options.questions||[],random).slice(0,10).map(q=>({question:q.question,answer:q.answer,choices:shuffle([q.answer,...q.wrong].map(name=>({id:name,name})),random),reference:q.reference||'',explanation:q.explanation||'La respuesta es '+q.answer+'.'}));
    if(kind==='testament')return shuffle(books,random).slice(0,10).map(b=>({question:'¿En qué testamento está '+b.name+'?',answer:b.testament,choices:[{id:'old',name:'Antiguo Testamento'},{id:'new',name:'Nuevo Testamento'}],reference:b.name+' pertenece al '+(b.testament==='old'?'Antiguo':'Nuevo')+' Testamento.',explanation:(b.testament==='old'?'Los 39 libros del Antiguo Testamento cuentan la historia de Israel, su poesía y sus profetas.':'Los 27 libros del Nuevo Testamento presentan a Jesús y el camino de las primeras comunidades.')+' '+b.name+' tiene '+b.chapters+' '+(b.chapters===1?'capítulo.':'capítulos.')}));
    return shuffle(characters,random).slice(0,10).map(([name,question,reference])=>({question,answer:name,choices:shuffle([{id:name,name},...shuffle(characters.filter(c=>c[0]!==name),random).slice(0,3).map(c=>({id:c[0],name:c[0]}))],random),reference,explanation:'Es '+name+'. '+question+' Podés volver a esta historia en '+reference+'.'}));
  }
  class Game {
    constructor(kind='order',difficulty='normal',options={}){
      if(!['order','testament','characters','pairs','timeline','quiz'].includes(kind))throw new Error('Juego desconocido');
      this.kind=kind;this.level={...(levels[difficulty]||levels.normal),...(options.seconds?{seconds:Math.min(600,Math.max(30,options.seconds))}:{})};this.now=options.now||(()=>Date.now());
      this.rounds=rounds(kind,this.level,options.random||Math.random,options);if(!this.rounds.length)throw Error('Este juego todavía no tiene preguntas.');this.round=0;this.position=0;this.lives=Math.min(3,Math.max(1,options.lives||3));this.maxLives=this.lives;this.history=[];this.attempts=0;this.correct=0;this.matched=[];this.flipped=[];this.pairLocked=false;this.hintUsed=false;this.score=0;this.status='ready';this.remainingMs=this.level.seconds*1000;this.deadline=0;this.pending=false;this.reason='';
    }
    get ordered(){return this.kind==='order'||this.kind==='timeline';}
    get current(){return this.rounds[this.round];}
    get seconds(){return Math.ceil(this.remainingMs/1000);}
    start(){if(this.status!=='ready')return;this.status='playing';this.deadline=this.now()+this.remainingMs;}
    tick(){if(this.status!=='playing'||this.pending)return;this.remainingMs=Math.max(0,this.deadline-this.now());if(!this.remainingMs){this.status='lost';this.reason='time';}}
    pause(){this.tick();if(this.status==='playing'){this.status='paused';}}
    resume(){if(this.status==='paused'){this.deadline=this.now()+this.remainingMs;this.status='playing';}}
    finishRound(){this.history.push({question:this.current.question,reference:this.current.reference,explanation:this.current.explanation});this.pending=true;if(this.round===this.rounds.length-1)this.status='won';}
    choose(id){
      this.tick();if(this.status!=='playing'||this.pending||this.pairLocked)return {ignored:true};
      const q=this.current;if(!q.choices.some(c=>c.id===id))return{ignored:true};
      if(this.kind==='pairs'){
        if(this.matched.includes(id)||this.flipped.includes(id))return{ignored:true};this.flipped.push(id);if(this.flipped.length===1)return{preview:true};
        this.attempts++;const [a,b]=this.flipped.map(x=>q.choices.find(c=>c.id===x));
        if(a.match!==b.match){this.lives--;this.pairLocked=true;if(!this.lives){this.status='lost';this.reason='lives';}return{correct:false};}
        this.correct++;this.score+=10;this.matched.push(...this.flipped);this.flipped=[];const complete=this.matched.length===q.choices.length;if(complete)this.finishRound();return{correct:true,complete,reference:a.reference,explanation:a.name+' y '+b.name+' · '+a.reference};
      }
      const expected=this.ordered?q.answer[this.position]:q.answer;
      if(this.ordered&&q.answer.slice(0,this.position).includes(id))return {ignored:true};
      this.attempts++;
      if(id!==expected){this.lives--;if(!this.lives){this.status='lost';this.reason='lives';}return {correct:false,reference:q.reference};}
      this.correct++;this.score+=10;this.position++;
      const complete=!this.ordered||this.position===q.answer.length;
      if(complete)this.finishRound();
      return {correct:true,complete,reference:q.reference,explanation:q.explanation};
    }
    releasePair(){this.flipped=[];this.pairLocked=false;}
    hint(){if(this.status!=='playing'||this.pending||this.hintUsed||this.pairLocked)return null;this.hintUsed=true;const q=this.current;if(this.kind==='pairs'){const flipped=q.choices.find(c=>c.id===this.flipped[0]);return q.choices.find(c=>!this.matched.includes(c.id)&&(!flipped||c.match===flipped.match&&c.id!==flipped.id))?.id;}return this.ordered?q.answer[this.position]:q.answer;}
    next(){this.tick();if(this.status!=='playing'||!this.pending)return false;this.round++;this.position=0;this.pending=false;this.hintUsed=false;this.flipped=[];this.matched=[];this.pairLocked=false;this.deadline=this.now()+this.remainingMs;return true;}

  }
  return {books,levels,Game,shuffle,characters,associations,timelines};
});
