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
    ['Juan el Bautista','Bautizó a Jesús en el río Jordán.','Mateo 3']
  ];
  const levels = Object.freeze({easy:{label:'Para empezar',seconds:120,count:5},normal:{label:'Un poco más',seconds:90,count:7},hard:{label:'Todo un desafío',seconds:60,count:10}});
  function shuffle(items,random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
  function rounds(kind,level,random){
    if(kind==='order')return Array.from({length:3},()=>{const n=level.count,start=Math.floor(random()*(books.length-n+1)),answer=books.slice(start,start+n);return {answer:answer.map(b=>b.id),choices:shuffle(answer,random),reference:'Orden de los libros en la Biblia'};});
    if(kind==='testament')return shuffle(books,random).slice(0,10).map(b=>({question:b.name,answer:b.testament,choices:[{id:'old',name:'Antiguo Testamento'},{id:'new',name:'Nuevo Testamento'}],reference:b.name+' pertenece al '+(b.testament==='old'?'Antiguo':'Nuevo')+' Testamento.'}));
    return shuffle(characters,random).slice(0,10).map(([name,question,reference])=>({question,answer:name,choices:shuffle([{id:name,name},...shuffle(characters.filter(c=>c[0]!==name),random).slice(0,3).map(c=>({id:c[0],name:c[0]}))],random),reference}));
  }
  class Game {
    constructor(kind='order',difficulty='normal',options={}){
      if(!['order','testament','characters'].includes(kind))throw new Error('Juego desconocido');
      this.kind=kind;this.level=levels[difficulty]||levels.normal;this.now=options.now||(()=>Date.now());
      this.rounds=rounds(kind,this.level,options.random||Math.random);this.round=0;this.position=0;this.lives=3;this.score=0;this.status='ready';this.remainingMs=this.level.seconds*1000;this.deadline=0;this.pending=false;this.reason='';
    }
    get current(){return this.rounds[this.round];}
    get seconds(){return Math.ceil(this.remainingMs/1000);}
    start(){if(this.status!=='ready')return;this.status='playing';this.deadline=this.now()+this.remainingMs;}
    tick(){if(this.status!=='playing')return;this.remainingMs=Math.max(0,this.deadline-this.now());if(!this.remainingMs){this.status='lost';this.reason='time';}}
    pause(){this.tick();if(this.status==='playing'){this.status='paused';}}
    resume(){if(this.status==='paused'){this.deadline=this.now()+this.remainingMs;this.status='playing';}}
    choose(id){
      this.tick();if(this.status!=='playing'||this.pending)return {ignored:true};
      const q=this.current,expected=this.kind==='order'?q.answer[this.position]:q.answer;
      if(this.kind==='order'&&q.answer.slice(0,this.position).includes(id))return {ignored:true};
      if(!q.choices.some(c=>c.id===id))return {ignored:true};
      if(id!==expected){this.lives--;if(!this.lives){this.status='lost';this.reason='lives';}return {correct:false,reference:q.reference};}
      this.score+=10;this.position++;
      const complete=this.kind!=='order'||this.position===q.answer.length;
      if(complete){this.pending=true;if(this.round===this.rounds.length-1){this.status='won';this.remainingMs=Math.max(0,this.deadline-this.now());}}
      return {correct:true,complete,reference:q.reference};
    }
    next(){this.tick();if(this.status!=='playing'||!this.pending)return false;this.round++;this.position=0;this.pending=false;return true;}
  }
  return {books,levels,Game,shuffle};
});
