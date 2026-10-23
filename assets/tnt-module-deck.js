/* Horizontal card gestures leave vertical page scrolling available. */
(() => {
  'use strict';
  window.TNTModuleDeck = { bind };
  function bind(track) {
    if(document.documentElement.dataset.tntStyle==='community'){track.setAttribute('aria-label','Espacios de TNT');return;}

    if (track.dataset.deckBound) return;
    track.dataset.deckBound = 'true';
    track.tabIndex = 0;
    track.setAttribute('aria-label', 'Espacios de TNT');
    track.setAttribute('aria-roledescription', 'carrusel');
    const cards = [...track.querySelectorAll('[data-space]')];
    if (!cards.length) return;
    const key = 'tnt:module-deck:' + TNT.person.id;
    let index = Math.max(0, cards.findIndex(c => c.dataset.space === sessionStorage.getItem(key)));
    let position = index, gesture = null, suppressUntil = 0;
    const controls = document.createElement('div');
    controls.className = 'tnt-space-controls';
    controls.innerHTML = '<span>Deslizá para elegir · tocá para entrar</span><div><button type="button" data-space-prev aria-label="Módulo anterior">' + TNTUI.icon('back') + '</button><b data-space-position aria-live="polite"></b><button type="button" data-space-next aria-label="Módulo siguiente">' + TNTUI.icon('arrow') + '</button></div>';
    track.after(controls);
    const step = () => innerWidth < 761 ? 192 : 218;
    // Overflow-hidden links are scroll containers too: set the gesture on the links themselves.
    [track, ...track.querySelectorAll('*')].forEach(node => {
      node.style.touchAction = 'pan-y';
      if (node.matches('img,a')) node.setAttribute('draggable', 'false');
    });
    track.addEventListener('dragstart', event => event.preventDefault());
    function paint() {
      cards.forEach((card, i) => {
        let delta = i - position;
        if (cards.length > 2) delta = ((delta + cards.length * 1.5) % cards.length) - cards.length / 2;
        const distance = Math.abs(delta);
        card.style.setProperty('--deck-offset', delta);
        card.style.setProperty('--deck-depth', distance);
        card.style.setProperty('--deck-tilt', Math.max(-1, Math.min(1, delta)));
        card.style.setProperty('--deck-opacity', distance > 2 ? 0 : Math.max(.2, 1 - distance * .15));
        card.style.setProperty('--deck-layer', String(30 - Math.round(distance * 10)));
        card.style.setProperty('--deck-events', distance > 1.7 ? 'none' : 'auto');
        card.dataset.deckActive = String(i === index);
        const link = card.querySelector('a');
        link.tabIndex = i === index ? 0 : -1;
        link.setAttribute('aria-label', card.querySelector('h3').textContent + ' · ' + (i + 1) + ' de ' + cards.length);
      });
      controls.querySelector('[data-space-position]').textContent = (index + 1) + ' / ' + cards.length;
      controls.querySelectorAll('button').forEach(button => button.disabled = cards.length === 1);
    }
    function select(next) {
      index = ((next % cards.length) + cards.length) % cards.length;
      position = index;
      sessionStorage.setItem(key, cards[index].dataset.space);
      paint();
    }
    function cleanup() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      track.classList.remove('is-deck-dragging');
    }
    function move(event) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.dragging && Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        cleanup();
        return;
      }
      if (!gesture.dragging && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        gesture.dragging = true;
        track.classList.add('is-deck-dragging');
        try { track.setPointerCapture?.(event.pointerId); } catch {}
      }
      if (gesture.dragging) {
        event.preventDefault();
        gesture.dx = dx;
        position = gesture.index - dx / step();
        paint();
      }
    }
    function finish(event, cancelled = false) {
      if (!gesture || event.pointerId !== gesture.id) return;
      const current = gesture;
      gesture = null;
      cleanup();
      if (!current.dragging) return;
      suppressUntil = Date.now() + 450;
      const dx = current.dx || 0, velocity = Math.abs(dx) / Math.max(1, performance.now() - current.time);
      const changed = Math.abs(dx) >= 36 || (Math.abs(dx) >= 14 && velocity > .35);
      const next = changed ? current.index - Math.sign(dx) * Math.max(1, Math.round(Math.abs(dx) / step())) : current.index;
      select(cancelled ? current.index : next);
      event.preventDefault();
    }
    function cancel(event) { finish(event, true); }
    track.addEventListener('pointerdown', event => {
      if (gesture || event.isPrimary === false || event.button > 0) return;
      suppressUntil = 0;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, index, time: performance.now(), dragging: false, dx: 0 };
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
    }, true);
    // A touch first captures its image implicitly. Ignore that image releasing
    // capture when we transfer it to the track; only losing the track cancels.
    track.addEventListener('lostpointercapture', event => { if (event.target === track) cancel(event); });
    track.addEventListener('click', event => {
      const card = event.target.closest('[data-space]');
      if (!card) return;
      if (Date.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      const next = cards.indexOf(card);
      if (next !== index) { event.preventDefault(); select(next); return; }
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
        card.querySelector('a')?.animate?.([{ opacity: 1, transform: 'scale(1)' }, { opacity: .55, transform: 'scale(1.04)' }], { duration: 160 });
      }
    }, true);
    track.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      select(index + (event.key === 'ArrowLeft' ? -1 : 1));
      cards[index].querySelector('a').focus({ preventScroll: true });
    });
    controls.querySelector('[data-space-prev]').onclick = () => select(index - 1);
    controls.querySelector('[data-space-next]').onclick = () => select(index + 1);
    paint();
  }
})();
