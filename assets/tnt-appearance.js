/* One approved design; five personal color palettes and independent screen modes. */
(() => {
  'use strict';
  const colors = window.TNTColors;
  let preview = null;
  const A = window.TNTAppearance = { styles: colors.palettes, palettes: colors.palettes, apply, open, selected };
  const owner = () => window.TNT?.session?.user?.id || window.TNT?.person?.id || 'guest';
  const storageKey = () => 'tnt:palette:' + owner();
  function selected() {
    let value = preview;
    if (!value) { try { value = localStorage.getItem(storageKey()); } catch {} }
    return colors.palettes[value] ? value : 'original';
  }
  function apply() {
    const id = selected(), palette = colors.palettes[id], html = document.documentElement;
    html.dataset.tntStyle = 'graphic';
    html.dataset.tntPalette = id;
    const tokens = { accent: palette.accent, focus: palette.accent, 'style-accent': palette.accent,
      'style-soft': palette.soft, lime: palette.lime, lilac: palette.lilac, blue: palette.blue,
      peach: palette.peach, yellow: palette.yellow, 'primary-ink': colors.ink(palette.accent) };
    for (const [name, value] of Object.entries(tokens)) html.style.setProperty('--tnt-' + name, value, 'important');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', html.dataset.tntTheme === 'dark' ? '#191B20' : '#FAF7EF');
  }
  function open() {
    const U = TNTUI, initial = selected(), initialMode = localStorage.getItem('tnt-theme') || 'light';
    let committed = false;
    const o = U.modal('Apariencia de TNT', '<div class="appearance-intro"><span>TU TNT · TUS COLORES</span><h3>Elegí tu paleta.</h3><p>El mismo TNT, con los colores que más te gusten. Probá una paleta: la preferencia se guarda para tu cuenta en este dispositivo.</p></div><form class="tnt-form appearance-form"><fieldset class="appearance-options"><legend class="sr-only">Paleta de colores</legend>' + Object.entries(colors.palettes).map(([id, p]) => '<label class="appearance-option" data-style-card="' + id + '"><input type="radio" name="palette" value="' + id + '" ' + (id === initial ? 'checked' : '') + '><span class="appearance-palette" style="--palette-accent:' + p.accent + ';--palette-soft:' + p.soft + '"><b>TNT.</b><span>' + [p.accent, p.lime, p.lilac, p.blue, p.yellow].map(color => '<i style="background:' + color + '"></i>').join('') + '</span></span><strong>' + p.name + '</strong><span>' + p.description + '</span></label>').join('') + '</fieldset><fieldset class="appearance-modes"><legend>Modo de pantalla</legend>' + [['light', 'Claro'], ['dark', 'Oscuro'], ['system', 'Como mi teléfono']].map(([id, label]) => '<label><input type="radio" name="mode" value="' + id + '" ' + (initialMode === id ? 'checked' : '') + '>' + label + '</label>').join('') + '</fieldset><p role="status" aria-live="polite"></p><div class="tnt-studio-actions"><button type="button" class="tnt-button" data-cancel>Cancelar</button><button type="submit" class="tnt-button primary">Guardar mis colores</button></div></form>', true);
    o.querySelectorAll('[name=palette]').forEach(input => input.onchange = () => { preview = input.value; apply(); });
    o.querySelectorAll('[name=mode]').forEach(input => input.onchange = () => TNT.setTheme(input.value));
    o.querySelector('[data-cancel]').onclick = () => U.closeModal(o);
    o.addEventListener('close', () => { preview = null; if (!committed) TNT.setTheme(initialMode); apply(); }, { once: true });
    o.querySelector('form').onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget, status = o.querySelector('[role=status]');
      try {
        localStorage.setItem(storageKey(), form.elements.palette.value);
        TNT.setTheme(form.elements.mode.value); committed = true; preview = null; apply();
        await U.closeModal(o); U.toast('Tus colores ya están guardados.');
      } catch { status.textContent = 'No pudimos guardar la preferencia. Revisá el almacenamiento del navegador e intentá de nuevo.'; }
    };
  }
  for (const type of ['tnt:config', 'tnt:ready', 'tnt:theme', 'tnt:profile', 'tnt:membership']) document.addEventListener(type, apply);
  window.addEventListener('storage', event => { if (event.key === storageKey()) apply(); });
  apply();
  const E = window.TNTExperience;
  if (E) { const paint = E.paint; E.paint = () => { paint(); apply(); }; }
})();
