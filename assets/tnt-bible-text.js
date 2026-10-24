/* Public-domain RV1909 text: local book files, independent from licensed providers. */
(() => {
  'use strict';
  const cache = new Map();
  const credit = 'Reina-Valera 1909 · Dominio público · Fuente: eBible.org';
  const version = { id: 1909, title: 'Reina-Valera 1909', short: 'RVR 1909' };
  async function passage(reference) {
    const match = String(reference || '').match(/^([1-3]?[A-Z]{2,3})\.([1-9]\d{0,2})(?:\.([1-9]\d{0,2})(?:-([1-9]\d{0,2}))?)?$/);
    if (!match) throw Error('Revisá el libro y el capítulo.');
    const [, id, chapter, first, last] = match, book = window.TNTBibleGames?.books?.find(b => b.id === id);
    if (!book || Number(chapter) > book.chapters) throw Error('No encontramos ese capítulo.');
    if (!cache.has(id)) cache.set(id, fetch('/assets/bible/rvr1909/' + id + '.json', { credentials: 'omit', signal: AbortSignal.timeout(15000) })
      .then(async response => { if (!response.ok) throw Error('No pudimos cargar este libro. Volvé a intentar cuando tengas conexión.'); return response.json(); })
      .catch(error => { cache.delete(id); throw error; }));
    const data = await cache.get(id), all = data.chapters[chapter] || [];
    const readable = all.filter(v => v.text.trim());
    const verses = first ? readable.filter(v => v.verse >= Number(first) && v.verse <= Number(last || first)) : readable;
    if (!verses.length || last && Number(last) < Number(first)) throw Error('No encontramos esos versículos.');
    const esc = TNTUI.esc;
    return { id: reference, version: 1909, reference: book.name + ' ' + chapter + (first ? ':' + first + (last ? '-' + last : '') : ''),
      content: verses.map(v => '<p><sup class="verse-number">' + v.verse + '</sup>' + esc(v.text) + '</p>').join(''),
      text: verses.map(v => v.text).join(' '), copyright: credit };
  }
  window.TNTBibleText = { version, credit, passage };
})();
