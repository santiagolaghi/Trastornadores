/* Personal palettes share one TNT identity. Activity colors belong to the activity. */
(function (root) {
  'use strict';
  const palettes = {
    original: { name: 'TNT Original', description: 'Coral, pistacho y lila.', accent: '#EF523E', soft: '#F8D8CD', lime: '#DDEAB5', lilac: '#DCD0F6', blue: '#C9E6EF', peach: '#F8D8CD', yellow: '#F4E7AB' },
    bosque: { name: 'Bosque', description: 'Verde, salvia y arena.', accent: '#85C997', soft: '#DDEBD8', lime: '#DDEBD8', lilac: '#DFD8EE', blue: '#CEE5E1', peach: '#F1DDC9', yellow: '#EBE5B7' },
    lavanda: { name: 'Lavanda', description: 'Violeta, rosa y cielo.', accent: '#BA9BE8', soft: '#E6D9F5', lime: '#E3EBCB', lilac: '#E6D9F5', blue: '#D3E7F5', peach: '#F6D7E2', yellow: '#F2E4BE' },
    oceano: { name: 'Océano', description: 'Turquesa, celeste y menta.', accent: '#76CCD3', soft: '#D2ECEC', lime: '#D7EACD', lilac: '#DEDDF5', blue: '#CCE7F4', peach: '#F4DDCD', yellow: '#EFE5B9' },
    atardecer: { name: 'Atardecer', description: 'Ámbar, durazno y terracota.', accent: '#F2B85B', soft: '#F5DFBA', lime: '#E6E9C4', lilac: '#E7D7EE', blue: '#D2E5E8', peach: '#F7CEBD', yellow: '#F5E5AB' }
  };
  const activity = {
    lime: ['Pistacho', '#DDEAB5'], peach: ['Durazno', '#F8D8CD'], lilac: ['Lila', '#DCD0F6'],
    blue: ['Celeste', '#C9E6EF'], rose: ['Rosa', '#F3BCD1'], lemon: ['Amarillo', '#F4E7AB'],
    mint: ['Menta', '#BFE6CC'], coral: ['Coral', '#F8AA94'], teal: ['Turquesa', '#A4DBD5'],
    grape: ['Violeta', '#BAA0E5'], sand: ['Arena', '#E6D8BA'], sky: ['Azul', '#A8C9EF']
  };
  const validHex = value => /^#[\da-f]{6}$/i.test(String(value || ''));
  function activityColor(value) { return validHex(value) ? value.toUpperCase() : (activity[value] || activity.lime)[1]; }
  function luminance(hex) {
    return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  }
  function ink(value) { const l = luminance(activityColor(value)); return (l + .05) / .05 >= 1.05 / (l + .05) ? '#000000' : '#FFFFFF'; }
  root.TNTColors = { palettes, activity, validHex, activityColor, ink };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TNTColors;
})(typeof window !== 'undefined' ? window : globalThis);
