const {test}=require('node:test');
const assert=require('node:assert/strict');
const {books,Game}=require('../assets/tnt-bible-games.js');

test('Los 66 libros conservan el orden y la separación de testamentos',()=>{
 assert.equal(books.length,66);assert.equal(new Set(books.map(b=>b.id)).size,66);
 assert.equal(books.filter(b=>b.testament==='old').length,39);
 assert.equal(books[38].id,'MAL');assert.equal(books[39].id,'MAT');assert.equal(books.at(-1).id,'REV');
});
test('Ordenar permite recuperarse de un error, evita duplicados y termina las tres rondas',()=>{
 const game=new Game('order','easy');game.start();
 assert.equal(game.choose(game.current.answer[1]).correct,false);assert.equal(game.lives,2);
 let answers=0;
 while(game.status==='playing'){
  for(const id of game.current.answer){assert.equal(game.choose(id).correct,true);answers++;if(game.status==='playing')assert(game.choose(id).ignored);}
  if(game.status==='playing'){assert(game.pending);assert.equal(game.next(),true);}
 }
 assert.equal(game.status,'won');assert.equal(game.score,answers*10);assert.equal(answers,15);
 assert(game.choose('GEN').ignored);assert.equal(game.lives,2);
});
test('Tres errores agotan las vidas y las entradas inválidas no las consumen',()=>{
 const game=new Game('testament');game.start();assert(game.choose('invalid').ignored);
 for(let i=0;i<3;i++)game.choose(game.current.answer==='old'?'new':'old');
 assert.equal(game.status,'lost');assert.equal(game.reason,'lives');assert.equal(game.lives,0);
 game.choose('old');assert.equal(game.lives,0);
});
test('El reloj cuenta tiempo real y la pausa conserva el tiempo y la ronda pendiente',()=>{
 let now=1000;const game=new Game('characters','hard',{now:()=>now});game.start();
 now+=12345;game.choose(game.current.answer);assert(game.pending);game.pause();const remaining=game.remainingMs;
 now+=100000;game.tick();assert.equal(game.remainingMs,remaining);assert.equal(game.status,'paused');
 game.resume();assert(game.pending);assert(game.next());assert.equal(game.round,1);
 now+=remaining+1;assert(game.choose(game.current.answer).ignored);assert.equal(game.status,'lost');assert.equal(game.reason,'time');
});
test('Cada juego de preguntas tiene respuestas válidas y puede completarse',()=>{
 for(const kind of ['characters','testament'])for(const level of ['easy','normal','hard']){
  const game=new Game(kind,level);game.start();
  assert.equal(new Set(game.rounds.map(q=>q.question)).size,10);
  while(game.status==='playing'){
   assert(game.current.choices.some(c=>c.id===game.current.answer));
   assert.equal(new Set(game.current.choices.map(c=>c.id)).size,game.current.choices.length);
   assert(game.choose(game.current.answer).correct);if(game.status==='playing'){assert(game.choose(game.current.answer).ignored);game.next();}
  }
  assert.equal(game.status,'won');assert.equal(game.score,100);assert.equal(game.lives,3);
 }
});

test('Las parejas requieren dos tarjetas distintas, conservan aciertos y consumen una vida al errar',()=>{
 const game=new Game('pairs','easy');game.start();const q=game.current,a=q.choices[0],b=q.choices.find(c=>c.match===a.match&&c.id!==a.id),wrong=q.choices.find(c=>c.match!==a.match);
 assert(game.choose(a.id).preview);assert(game.choose(a.id).ignored);assert.equal(game.choose(wrong.id).correct,false);assert.equal(game.lives,2);assert(game.choose(b.id).ignored);game.releasePair();assert(game.choose(a.id).preview);assert(game.choose(b.id).correct);assert(game.matched.includes(a.id));assert(game.choose(a.id).ignored);
 while(game.status==='playing'){for(const c of game.current.choices){if(game.matched.includes(c.id))continue;game.choose(c.id);const pair=game.current.choices.find(x=>x.id!==c.id&&x.match===c.match);game.choose(pair.id);}if(game.status==='playing')game.next();}assert.equal(game.status,'won');assert.equal(game.history.length,3);
});
test('La línea del tiempo conserva el orden y la explicación se puede leer sin consumir tiempo',()=>{
 let now=0;const game=new Game('timeline','normal',{now:()=>now});game.start();for(const id of game.current.answer)game.choose(id);assert(game.pending);const remaining=game.remainingMs;now+=500000;game.tick();assert.equal(game.remainingMs,remaining);game.next();assert.equal(game.seconds,120);assert(game.hint());assert.equal(game.hint(),null);
});
test('Un juego del equipo conserva preguntas, alternativas y explicaciones, y respeta tiempos y vidas configurados',()=>{
 const game=new Game('quiz','hard',{seconds:210,lives:2,questions:[{question:'Pregunta del equipo',answer:'Sí',wrong:['A','B','C'],explanation:'Explicación del equipo',reference:'Juan 1'}]});assert.equal(game.seconds,210);assert.equal(game.lives,2);game.start();assert(game.choose('Sí').correct);assert.equal(game.status,'won');assert.equal(game.history[0].explanation,'Explicación del equipo');assert.throws(()=>new Game('quiz'),/preguntas/);
});
