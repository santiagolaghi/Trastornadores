/* One complete profile view shared by People, Organization and the account. */
(() => {
  'use strict';
  const U = () => window.TNTUI;
  const present = value => value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  function content(ctx, personId, person = {}, account = {}) {
    const T = window.TNT, ui = U(), v = ctx.values || {}, own = personId === T.person?.id;
    if (own) { person = T.person; account = { ...T.account, avatar_url: T.avatar() }; }
    const name = ui.personName([v.first_name, v.last_name].filter(Boolean).join(' ') || person.full_name || 'Perfil TNT');
    const role = v._ministry_role || account.ministry_role || 'Comunidad TNT';
    const fields = Object.fromEntries(Object.entries(TNTProfiles.config(ctx.fields)).filter(([, f]) => f.visible !== false && TNTProfiles.applies(f, role, v._profile_roles || [])));
    const age = v.birthday ? (() => { const b = new Date(v.birthday + 'T12:00:00'), now = new Date(); return now.getFullYear() - b.getFullYear() - (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate()) ? 1 : 0); })() : null;
    const item = (key, value = v[key]) => fields[key] && present(value) ? `<div class="tnt-profile-fact"><span>${ui.esc(fields[key].label)}</span><b>${ui.esc(value)}</b></div>` : '';
    const textCard = (key, icon, tone) => fields[key] ? `<section class="tnt-profile-story ${tone}"><div class="tnt-profile-section-title">${ui.icon(icon)}<h3>${ui.esc(fields[key].label)}</h3></div><p>${ui.esc(v[key] || 'Todavía sin completar')}</p></section>` : '';
    const group = (ctx.groups || []).find(g => g.code === v.efe_group);
    const phone = String(v.phone || '').replace(/\D/g, ''), digits = phone.length === 10 ? '549' + phone : phone;
    const instagram = String(v.instagram || '').replace(/^@/, '');
    const ig = instagram && !/no tengo|no uso/i.test(instagram) ? 'https://www.instagram.com/' + encodeURIComponent(instagram) + '/' : '';
    const canEdit = own || T.isAdmin || T.canAction?.('perfiles', 'edit', '*');
    return `<article class="tnt-profile-complete" data-tnt-record data-profile-person="${personId}" data-profile-role="${ui.esc(role)}">
      <header class="tnt-profile-cover"><span class="tnt-profile-cover-tag">${own ? 'MI PERFIL' : 'PERSONAS TNT'}</span><div class="tnt-profile-identity">${ui.avatar({ ...person, id: personId, full_name: name }, account, 'portrait')}<div><h2>${ui.esc(name)}</h2><div class="tnt-profile-badges"><span data-profile-role-label>${ui.esc(role)}</span>${age !== null ? `<span>${age} años</span>` : ''}${fields.sex && v.sex ? `<span>${ui.esc({ M: 'Varón', F: 'Mujer', U: 'Sin especificar' }[v.sex] || v.sex)}</span>` : ''}</div></div></div></header>
      <div class="tnt-profile-body"><div class="tnt-profile-contact-actions">${phone ? `<a class="tnt-button" href="https://wa.me/${digits}" target="_blank" rel="noopener">WhatsApp ${ui.icon('up')}</a><button type="button" class="tnt-button" data-profile-copy="${ui.esc(v.phone)}">Copiar teléfono</button>` : ''}${ig ? `<a class="tnt-button" href="${ig}" target="_blank" rel="noopener">Instagram ${ui.icon('up')}</a>` : ''}${canEdit ? `<button type="button" class="tnt-button primary" data-profile-edit="${personId}">${ui.icon('edit')}Editar perfil</button>` : ''}${T.isAdmin ? `<button type="button" class="tnt-button" data-profile-role-edit="${personId}">${ui.icon('people')}Cambiar rol</button>` : ''}</div>
      <section class="tnt-profile-facts">${item('birthday', ui.date(v.birthday, { day: '2-digit', month: '2-digit', year: 'numeric' }))}${item('phone')}${item('instagram')}${(own || T.isAdmin) ? item('dni') : ''}</section>
      <div class="tnt-profile-stories">${textCard('dreams', 'up', 'lilac')}${textCard('studies', 'book', 'blue')}</div>
      ${fields.interests ? `<section class="tnt-profile-interests"><div class="tnt-profile-section-title">${ui.icon('check')}<h3>${ui.esc(fields.interests.label)}</h3></div><div class="tnt-profile-interest-tags">${(Array.isArray(v.interests) ? v.interests : []).map((interest, i) => `<span style="--interest-tone:${i % 3}">${ui.esc(interest)}</span>`).join('') || '<p>Todavía sin completar</p>'}</div></section>` : ''}
      ${fields.leadership_strengths ? `<section class="tnt-profile-strengths"><div class="tnt-profile-section-title">${ui.icon('people')}<h3>${ui.esc(fields.leadership_strengths.label)}</h3></div><div class="tnt-profile-strength-grid">${Object.entries(v.leadership_strengths || {}).map(([label, score]) => `<div><span>${ui.esc(label)}</span><b>${Number(score)}%</b><meter min="0" max="100" value="${Math.max(0, Math.min(100, Number(score)))}">${Number(score)}%</meter></div>`).join('') || '<p>Todavía sin completar</p>'}</div></section>` : ''}
      ${fields.efe_group ? `<section class="tnt-profile-efe">${ui.icon('people')}<div><span>MI LUGAR EN TNT</span><h3>${ui.esc(group?.name || (v.efe_group === 'none' ? 'Todavía no voy a un EFE' : 'EFE sin completar'))}</h3>${v.efe_group&&v.efe_group!=='none'&&v.efe_service_role ? `<p>${ui.esc(v.efe_service_role)}</p>` : ''}</div></section>` : ''}
      ${fields.health && (own || T.isAdmin) ? `<section class="tnt-profile-health"><div class="tnt-profile-section-title">${ui.icon('alert')}<h3>${ui.esc(fields.health.label)}</h3></div><p>${ui.esc(v.health || 'Todavía sin completar')}</p></section>` : ''}
      </div></article>`;
  }
  function editRole(personId, currentRole) {
    if (!TNT.isAdmin) return;
    const roles = ['', 'Pastor/a', 'Líder', 'Timoteo', 'Colaborador'];
    const dialog = U().modal('Cambiar rol', `<form class="tnt-form" data-role-form><label>Rol en TNT<select name="role">${roles.map(role => `<option value="${U().esc(role)}" ${role === currentRole ? 'selected' : ''}>${U().esc(role || 'Comunidad TNT')}</option>`).join('')}</select></label><p role="status" aria-live="polite"></p><button class="tnt-button primary" type="submit">Guardar rol</button></form>`);
    const form = dialog.querySelector('form');
    form.onsubmit = async event => {
      event.preventDefault(); if (form.dataset.saving) return; form.dataset.saving = 'true';
      const button = form.querySelector('[type=submit]'), status = form.querySelector('[role=status]'); button.disabled = true; status.textContent = 'Guardando…';
      try {
        const role = form.elements.role.value || null;
        const r = await TNT.sb.rpc('tnt_review_staff', { p_person: personId, p_role: role }); if (r.error) throw r.error;
        if(personId===TNT.person.id)await TNT.refreshIdentity();
        await refresh(personId);
        await U().closeModal(dialog);
        document.dispatchEvent(new CustomEvent('tnt:data', { detail: { tables: ['tnt_accounts'] } }));
        U().toast('Rol actualizado.');
      } catch (error) { status.textContent = error.message || 'No pudimos guardar el rol.'; }
      finally { delete form.dataset.saving; button.disabled = false; }
    };
  }
  function bind(host) {
    host.querySelectorAll('[data-profile-role-edit]').forEach(button => button.onclick = () => editRole(button.dataset.profileRoleEdit, button.closest('[data-profile-person]').dataset.profileRole));
    host.querySelectorAll('[data-profile-edit]').forEach(button => button.onclick = () => TNTProfileEditor.open(button.dataset.profileEdit));
    host.querySelectorAll('[data-profile-copy]').forEach(button => button.onclick = async () => { try { await navigator.clipboard.writeText(button.dataset.profileCopy); U().toast('Teléfono copiado.'); } catch { U().toast('No pudimos copiar el teléfono.', true); } });
  }
  async function open(personId = TNT.person.id, options = {}) {
    const dialog = U().modal('Perfil TNT', '<div class="tnt-profile-loading" role="status">Cargando perfil…</div>', true);
    const host = dialog.querySelector('.tnt-sheet');
    try {
      const own = personId === TNT.person.id;
      const result = await TNT.sb.rpc(own?'tnt_profile_context':'tnt_profile_detail',own?{}:{p_person:personId});
      if (result.error) throw result.error;
      let account = options.account || {};
      if (!own && !options.account) { const r = await TNT.sb.from('tnt_accounts').select('person_id,avatar_url,ministry_role,nickname').eq('person_id', personId).maybeSingle(); if (!r.error) account = r.data || {}; }
      if (!dialog.isConnected) return;
      host.querySelector('.tnt-profile-loading').outerHTML = content(result.data, personId, options.person, account);
      dialog.classList.add('tnt-profile-dialog');
      bind(host);
    } catch (error) { if (dialog.isConnected) { const node = host.querySelector('.tnt-profile-loading'); node.textContent = error.message || 'No pudimos cargar este perfil.'; node.setAttribute('role', 'alert'); } }
    return dialog;
  }
  async function refresh(personId) {
    const articles = [...document.querySelectorAll('[data-profile-person]')].filter(node => node.dataset.profilePerson === personId);
    if (!articles.length) return;
    const own = personId === TNT.person.id, result = await TNT.sb.rpc(own?'tnt_profile_context':'tnt_profile_detail',own?{}:{p_person:personId});
    if (result.error) throw result.error;
    const account = own ? { data: TNT.account } : await TNT.sb.from('tnt_accounts').select('person_id,avatar_url,ministry_role,nickname').eq('person_id',personId).maybeSingle();
    if (account.error) throw account.error;
    for (const article of articles) { if (!article.isConnected) continue; const template = document.createElement('template'); template.innerHTML = content(result.data,personId,{},account.data || {}); const next = template.content.firstElementChild; article.replaceWith(next); bind(next); }
  }
  document.addEventListener('tnt:profile',event=>{if(event.detail?.personId)refresh(event.detail.personId).catch(()=>{});});
  let refreshTimer;document.addEventListener('tnt:data',event=>{if(!(event.detail?.tables||[]).some(t=>['tnt_accounts','tnt_profile_answers'].includes(t)))return;clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const id of new Set([...document.querySelectorAll('[data-profile-person]')].map(n=>n.dataset.profilePerson)))refresh(id).catch(()=>{});},80);});
  function renderOwn(host) { host.innerHTML = content(TNT.profileContext, TNT.person.id); bind(host); }
  window.TNTProfileView = { open, content, bind, renderOwn, refresh };
})();
