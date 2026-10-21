/* A template is edited as one draft and saved atomically. */
(() => {
  'use strict';
  const types = { simple: 'Actividad simple', complex: 'Dinámica o explicación', logistics: 'Área de trabajo' };
  const emojis = [['👋','Bienvenida'],['🙏','Ministración'],['📖','Palabra'],['🎤','Micrófono'],['🎵','Música'],['🔥','Fogón'],['🎲','Juegos'],['🧩','Dinámica'],['💬','Conversación'],['🎨','Creatividad'],['📸','Fotos'],['📦','Materiales'],['🧹','Limpieza'],['🍽️','Comida'],['🚐','Transporte'],['🏕️','Campamento'],['❤️','Acompañamiento'],['✓','Sin emoji']];
  async function open(template = null, sourceItems = [], onSaved = () => {}) {
    const U = TNTUI;
    let items = sourceItems.map(item => ({ ...item, open: false }));
    const dialog = U.modal(template ? 'Editar plantilla' : 'Nueva plantilla', `<form class="tnt-template-builder tnt-form" novalidate data-tnt-dynamic>
      <section class="tnt-template-intro"><span>${U.icon('book')}</span><div><small>DISEÑÁ EL ENCUENTRO</small><h3>Una estructura que podés volver a usar.</h3><p>Armá las actividades y ordenalas como quieras.</p></div></section>
      <label>Nombre de la plantilla<input name="name" value="${U.esc(template?.name || '')}" maxlength="160" required placeholder="Ej.: Servicio TNT o Evangelismo"></label>
      <fieldset class="tnt-template-kind"><legend>Tipo de encuentro</legend>${[['saturday', 'calendar', 'Sábado'], ['event', 'people', 'Evento'], ['camp', 'camp', 'Campamento']].map(([value, icon, label]) => `<label><input type="radio" name="kind" value="${value}" ${(template?.kind || 'saturday') === value ? 'checked' : ''}><span>${U.icon(icon)}${label}</span></label>`).join('')}</fieldset>
      <details class="tnt-fold"><summary>Una descripción para el equipo</summary><label class="tnt-fold-content"><textarea name="description" maxlength="2000" placeholder="¿Para qué sirve esta plantilla?">${U.esc(template?.description || '')}</textarea></label></details>
      <div class="tnt-template-program-head"><div><small>EL PROGRAMA</small><h3>Actividades</h3></div><span data-template-total></span></div>
      <div class="tnt-template-presets"><span>Ideas para empezar</span><button type="button" data-template-preset="service">Servicio TNT</button><button type="button" data-template-preset="outreach">Evangelismo</button></div>
      <div class="tnt-template-blocks" data-template-blocks></div>
      <button type="button" class="tnt-button tnt-template-add" data-template-add>${U.icon('plus')}Agregar actividad</button>
      <p role="status" aria-live="polite"></p><footer class="tnt-template-footer"><button class="tnt-button primary" type="submit">Guardar plantilla</button>${template ? '<button type="button" class="tnt-button danger" data-template-archive>Archivar plantilla</button>' : ''}</footer></form>`, true);
    dialog.classList.add('tnt-template-dialog');
    const form = dialog.querySelector('form'), host = form.querySelector('[data-template-blocks]'), status = form.querySelector('[role=status]');
    function capture() {
      host.querySelectorAll('[data-template-item]').forEach(row => {
        const item = items.find(item => item.id === row.dataset.templateItem); if (!item) return;
        item.open = row.open;
        row.querySelectorAll('[data-item-field]').forEach(input => item[input.dataset.itemField] = input.value);
        item.checklist = String(item.stepsText ?? (item.checklist || []).join('\n')).split('\n').map(text => text.trim()).filter(Boolean);
      });
    }
    function paint() {
      const top = dialog.scrollTop;
      form.querySelector('[data-template-total]').textContent = items.length + ' actividades · ' + items.reduce((n, item) => n + (Number(item.duration_minutes) || 5), 0) + ' min';
      host.innerHTML = items.length ? items.map((item, index) => `<details class="tnt-template-block" data-template-item="${item.id}" ${item.open ? 'open' : ''}>
        <summary><span class="tnt-template-order">${String(index + 1).padStart(2, '0')}</span><span class="tnt-template-icon-preview" data-template-icon-preview aria-hidden="true">${U.esc(item.icon || '✓')}</span><div><b>${U.esc(item.title || 'Nueva actividad')}</b><small>${U.esc(types[item.task_type])} · ${Number(item.duration_minutes) || 5} min</small></div>
        <span class="tnt-template-block-controls"><button type="button" data-template-move="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Subir ${U.esc(item.title || 'actividad')}">↑</button><button type="button" data-template-move="${index}" data-direction="1" ${index === items.length - 1 ? 'disabled' : ''} aria-label="Bajar ${U.esc(item.title || 'actividad')}">↓</button><button type="button" data-template-remove="${item.id}" aria-label="Quitar ${U.esc(item.title || 'actividad')}">${U.icon('trash')}</button></span></summary>
        <div class="tnt-template-block-fields"><div class="tnt-template-field-row"><label>Actividad<input data-item-field="title" value="${U.esc(item.title || '')}" maxlength="160" required placeholder="Ej.: Bienvenida"></label><label>Duración<input type="number" min="1" max="1440" data-item-field="duration_minutes" value="${Number(item.duration_minutes) || 5}" required><small>minutos</small></label></div>
        <details class="tnt-template-emoji"><summary>Elegir emoji <span data-template-emoji-label>${U.esc(item.icon || '✓')}</span></summary><div class="tnt-template-emoji-grid" role="group" aria-label="Emojis para la actividad">${emojis.map(([emoji,label]) => `<button type="button" data-template-emoji="${emoji}" aria-label="${label}" title="${label}" aria-pressed="${(item.icon || '✓') === emoji}">${emoji}</button>`).join('')}</div><label>O pegá otro emoji<input data-item-field="icon" value="${U.esc(item.icon || '✓')}" maxlength="32" autocomplete="off" placeholder="Ej.: ✨"></label></details>
        <label>Qué necesita esta actividad<select data-item-field="task_type">${Object.entries(types).map(([value, label]) => `<option value="${value}" ${item.task_type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        ${item.task_type !== 'simple' ? `<label>Instrucciones<textarea data-item-field="description" rows="3" placeholder="Cómo se hace y qué necesita saber el equipo">${U.esc(item.description || '')}</textarea></label><label>Materiales<input data-item-field="materials" value="${U.esc(item.materials || '')}" placeholder="Lo que hace falta preparar"></label><details class="tnt-fold"><summary>Referencia y pasos</summary><div class="tnt-fold-content"><label>Enlace<input inputmode="url" data-item-field="reference_url" value="${U.esc(item.reference_url || '')}" placeholder="www.ejemplo.com"></label><label>Pasos<textarea data-item-field="stepsText" placeholder="Un paso por línea">${U.esc((item.checklist || []).join('\n'))}</textarea></label></div></details>` : ''}
        ${item.task_type === 'logistics' ? `<label>Presupuesto estimado<input type="number" min="0" data-item-field="budget_estimated" value="${Number(item.budget_estimated) || ''}"></label>` : ''}
        </div></details>`).join('') : '<div class="tnt-template-empty">' + U.icon('tasks') + '<h4>Tu programa empieza acá.</h4><p>Sumá una actividad o elegí una de las ideas de arriba.</p></div>';
      U.enhanceSelects(host); dialog.scrollTop = top;
      host.querySelectorAll('[data-template-move]').forEach(button => button.onclick = event => { event.preventDefault(); event.stopPropagation(); capture(); const from = Number(button.dataset.templateMove), to = from + Number(button.dataset.direction); if (to < 0 || to >= items.length) return; [items[from], items[to]] = [items[to], items[from]]; paint(); });
      host.querySelectorAll('[data-template-remove]').forEach(button => button.onclick = event => { event.preventDefault(); event.stopPropagation(); capture(); items = items.filter(item => item.id !== button.dataset.templateRemove); paint(); });
      host.querySelectorAll('[data-item-field=task_type]').forEach(select => select.onchange = () => { capture(); paint(); });
      host.querySelectorAll('[data-template-emoji]').forEach(button => button.onclick = () => {
        const input = button.closest('[data-template-item]').querySelector('[data-item-field=icon]');
        input.value = button.dataset.templateEmoji;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const fresh = (title = '', duration = 5, type = 'simple', icon = '✓') => ({ id: crypto.randomUUID(), title, duration_minutes: duration, task_type: type, icon, checklist: [], open: true });
    form.querySelectorAll('[data-template-add]').forEach(button => button.onclick = () => { capture(); items.push(fresh()); paint(); host.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    form.querySelectorAll('[data-template-preset]').forEach(button => button.onclick = () => {
      capture(); const rows = button.dataset.templatePreset === 'service' ? [['Bienvenida', 5, 'simple', '👋'], ['Palabra', 25, 'complex', '📖'], ['Compartimos juntos', 15, 'simple', '💬']] : [['Preparación del equipo', 10, 'simple', '🙏'], ['Salida de evangelismo', 40, 'complex', '🚶'], ['Cierre y testimonios', 10, 'simple', '💬']];
      items.push(...rows.map(args => fresh(...args))); paint();
    });
    form.addEventListener('input', event => {
      form.dataset.tntDirty = 'true';const row=event.target.closest('[data-template-item]');if(!row)return;
      const title=row.querySelector('[data-item-field=title]').value;const duration=Number(row.querySelector('[data-item-field=duration_minutes]').value)||5;
      row.querySelector('summary b').textContent=title||'Nueva actividad';row.querySelector('summary small').textContent=types[row.querySelector('[data-item-field=task_type]').value]+' · '+duration+' min';
      const icon=row.querySelector('[data-item-field=icon]').value.trim()||'✓';
      row.querySelector('[data-template-icon-preview]').textContent=icon;row.querySelector('[data-template-emoji-label]').textContent=icon;
      row.querySelectorAll('[data-template-emoji]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.templateEmoji===icon)));
      capture();form.querySelector('[data-template-total]').textContent=items.length+' actividades · '+items.reduce((n,item)=>n+(Number(item.duration_minutes)||5),0)+' min';
    });
    form.onsubmit = async event => {
      event.preventDefault(); capture();
      const invalid = [...form.querySelectorAll('input,textarea,select')].find(input => !input.checkValidity());
      if (invalid) { invalid.closest('details')?.setAttribute('open', ''); invalid.reportValidity(); return; }
      const payload = items.map(item => ({ id: item.id, title: item.title.trim(), task_type: item.task_type, icon: item.icon?.trim() || '✓', description: item.description || null, materials: item.materials || null, duration_minutes: Number(item.duration_minutes) || 5, checklist: item.checklist || [], reference_url: item.reference_url ? U.resourceUrl(item.reference_url) : null, budget_estimated: Number(item.budget_estimated) || null }));
      if (items.some((item, i) => item.reference_url && !payload[i].reference_url)) { status.textContent = 'Revisá el enlace de referencia de tus actividades.'; return; }
      const button = form.querySelector('[type=submit]'); button.disabled = true; status.textContent = 'Guardando el programa…';
      try { const result = await TNT.sb.rpc('tnt_save_org_template', { p_id: template?.id || null, p_values: { name: form.elements.name.value.trim(), kind: form.elements.kind.value, description: form.elements.description.value }, p_items: payload, p_version: template?.version ?? null }); if (result.error) throw result.error; await U.closeModal(dialog); await onSaved(); U.toast('Plantilla guardada.'); }
      catch (error) { status.textContent = error.message || 'No pudimos guardar. Tu programa sigue acá.'; button.disabled = false; }
    };
    form.querySelector('[data-template-archive]')?.addEventListener('click', async event => {
      const button = event.currentTarget; button.disabled = true;
      try { const r = await TNT.sb.rpc('tnt_archive_org_template', { p_template: template.id, p_restore: false }); if (r.error) throw r.error; await U.closeModal(dialog); await onSaved(); TNTExperience.undo('Plantilla archivada', async () => { const restore = await TNT.sb.rpc('tnt_archive_org_template', { p_template: template.id, p_restore: true }); if (restore.error) throw restore.error; await onSaved(); }); }
      catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    paint();
    return dialog;
  }
  window.TNTTemplateBuilder = { open };
})();
