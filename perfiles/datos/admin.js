(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const loginView = $("loginView");
  const dashboardView = $("dashboardView");
  const loginForm = $("loginForm");
  const passwordInput = $("password");
  const togglePassword = $("togglePassword");
  const loginMessage = $("loginMessage");
  const loginBtn = $("loginBtn");
  const loginText = $("loginText");
  const loginSpinner = $("loginSpinner");

  const searchInput = $("searchInput");
  const clearSearchBtn = $("clearSearchBtn");
  const activeFilters = $("activeFilters");
  const filterCount = $("filterCount");
  const visibleCount = $("visibleCount");
  const listSubtext = $("listSubtext");
  const updatedBadge = $("updatedBadge");
  const rowsBody = $("rowsBody");
  const cardsList = $("cardsList");
  const emptyState = $("emptyState");
  const toast = $("toast");

  const filterSheet = $("filterSheet");
  const filterBackdrop = $("filterBackdrop");
  const detailSheet = $("detailSheet");
  const detailBackdrop = $("detailBackdrop");

  let records = [];
  let accessToken = "";
  let toastTimer = null;
  let currentDetailId = "";
  let profileState = "active";
  let deleteMode = "archive", deleting = false;
  const deletedProfiles = new Set(), selectedProfiles=new Set();
  let bulkBusy=false;
  const canEdit = () => window.TNT.canAction('perfiles', 'edit');
  const canArchive = () => window.TNT.canAction('perfiles', 'delete');

  const SESSION_KEY = "tnt_base_admin_session_v1";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

  const defaultFilters = () => ({
    category: "",
    gender: "",
    contact: "",
    sort: "recent",
  });

  let filters = defaultFilters();
  let draftFilters = defaultFilters();

  const icons = {
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6Z"/><path d="M9 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.5l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .7.5.9 1.3 1.7 2.2 2.2.3.2.5.2.7 0l.8-1c.2-.2.4-.3.7-.2l1.6.8c.3.2.5.3.5.5 0 .3-.1 1.3-.8 1.9-.6.6-1.5.8-2.4.5-1.5-.5-3.2-1.4-4.6-2.8-1.2-1.2-2.1-2.7-2.5-3.9-.3-.9-.1-1.6.3-2.1.3-.4.6-.6.8-.8Z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>`,
    eye: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
    phone: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7.2 3.5 9.7 7c.4.6.3 1.3-.2 1.8L8 10.1c1.2 2.6 3.3 4.7 5.9 5.9l1.3-1.5c.5-.5 1.2-.6 1.8-.2l3.5 2.5c.6.4.8 1.2.4 1.8-.8 1.3-2.2 2.1-3.7 2-7-.9-12.5-6.4-13.4-13.4-.2-1.5.7-2.9 2-3.7.5-.3 1.1-.3 1.4 0Z"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function normalize(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .trim();
  }

  async function hashPassword(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  function ageFromBirthdate(value) {
    if (!value) return null;
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    const [year, month, day] = parts;
    const today = new Date();
    let age = today.getFullYear() - year;
    if (
      today.getMonth() + 1 < month ||
      (today.getMonth() + 1 === month && today.getDate() < day)
    ) age -= 1;
    return Math.max(0, age);
  }

  function groupFor(record) {
    const age = ageFromBirthdate(record.fecha_nacimiento);
    return age === null ? 'Sin fecha de nacimiento' : age < 18 ? "Adolescente" : "Joven";
  }

  function formatDate(value, withTime = false) {
    if (!value) return "—";
    const date = new Date(value.includes("T") ? value : value + "T12:00:00");
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-AR", withTime ? {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    } : {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  }

  function whatsappNumber(value) {
    let digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("0")) digits = digits.slice(1);
    if (digits.startsWith("549")) return digits;
    if (digits.startsWith("54")) return "549" + digits.slice(2).replace(/^0/, "");
    if (digits.length === 10) return "549" + digits;
    return digits;
  }

  function whatsappUrl(value) {
    const number = whatsappNumber(value);
    return number ? "https://wa.me/" + number : "";
  }

  function instagramUrl(value) {
    const username = String(value || "").trim().replace(/^@+/, "");
    return username ? "https://www.instagram.com/" + encodeURIComponent(username) : "";
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2300);
  }

  function syncTheme() {
    const theme = document.documentElement.dataset.tntTheme === 'light' ? 'light' : 'dark';
    const label = theme === 'dark' ? 'Usar tema claro' : 'Usar tema oscuro';
    $('themeIcon').innerHTML = window.TNTUI.icon(theme === 'dark' ? 'sun' : 'moon');
    $('themeToggle').title = label;
    $('themeToggle').setAttribute('aria-label', label);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#131412' : '#f5f3ec');
  }

  function initTheme() {
    syncTheme();
    document.addEventListener('tnt:theme', syncTheme);
    window.addEventListener('storage', event => {
      if (event.key !== 'tnt-theme') return;
      window.TNT.setTheme(event.newValue || 'dark');
    });
  }

  function savePanelSession(token) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        token,
        expiresAt: Date.now() + SESSION_TTL_MS,
      }));
    } catch (_) {}
  }

  function clearPanelSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  function readPanelSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      if (!parsed?.token || !parsed?.expiresAt || parsed.expiresAt <= Date.now()) {
        clearPanelSession();
        return "";
      }
      return parsed.token;
    } catch (_) {
      clearPanelSession();
      return "";
    }
  }

  function filterRecords() {
    const query = normalize(searchInput.value);
    const result = records.filter((record) => {
      const searchable = normalize([
        record.nombre,
        record.apellido,
        record.instagram,
        record.telefono,
      ].filter(Boolean).join(" "));

      if (query && !searchable.includes(query)) return false;
      if (filters.category && groupFor(record) !== filters.category) return false;
      if (filters.gender && record.genero !== filters.gender) return false;

      const hasPhone = Boolean(String(record.telefono || "").trim());
      const hasInstagram = Boolean(String(record.instagram || "").trim());

      if (filters.contact === "telefono" && !hasPhone) return false;
      if (filters.contact === "instagram" && !hasInstagram) return false;
      if (filters.contact === "ambos" && !(hasPhone && hasInstagram)) return false;
      if (filters.contact === "sininstagram" && hasInstagram) return false;

      return true;
    });

    return result.sort((a, b) => {
      if (filters.sort === "name") {
        return (a.nombre + " " + a.apellido).localeCompare(
          b.nombre + " " + b.apellido,
          "es-AR",
          { sensitivity: "base" }
        );
      }
      if (filters.sort === "ageAsc") {
        return (ageFromBirthdate(a.fecha_nacimiento) ?? Infinity) - (ageFromBirthdate(b.fecha_nacimiento) ?? Infinity);
      }
      if (filters.sort === "ageDesc") {
        return (ageFromBirthdate(b.fecha_nacimiento) ?? -Infinity) - (ageFromBirthdate(a.fecha_nacimiento) ?? -Infinity);
      }
      if (filters.sort === "oldest") {
        return new Date(a.creado_en || 0) - new Date(b.creado_en || 0);
      }
      return new Date(b.creado_en || 0) - new Date(a.creado_en || 0);
    });
  }

  function renderStats() {
    const adolescentes = records.filter((record) => groupFor(record) === "Adolescente").length;
    const jovenes = records.filter(record => groupFor(record) === 'Joven').length;
    const mujeres = records.filter((record) => record.genero === "Mujer").length;
    const varones = records.filter((record) => record.genero === "Varón").length;

    $("statTotal").textContent = records.length;
    $("statAdolescentes").textContent = adolescentes;
    $("statJovenes").textContent = jovenes;
    $("statMujeres").textContent = mujeres;
    $("statVarones").textContent = varones;
    $("summaryText").textContent = records.length === 1
      ? "1 persona cargada desde Perfiles."
      : records.length + " personas cargadas desde Perfiles.";
  }

  function activeQuickValue() {
    const extraActive = filters.contact || filters.sort !== "recent";
    if (extraActive) return "";
    if (filters.category && !filters.gender) return filters.category;
    if (filters.gender && !filters.category) return filters.gender;
    if (!filters.category && !filters.gender) return "all";
    return "";
  }

  function syncQuickFilters() {
    const active = activeQuickValue();
    document.querySelectorAll("[data-quick], [data-summary-filter]").forEach((button) => {
      const value = button.dataset.quick ?? button.dataset.summaryFilter;
      button.classList.toggle("active", value === active);
    });
  }

  function filterLabel(key, value) {
    const maps = {
      category: { Adolescente: "Adolescentes", Joven: "Jóvenes" },
      gender: { Mujer: "Mujeres", "Varón": "Varones" },
      contact: {
        telefono: "Con teléfono",
        instagram: "Con Instagram",
        ambos: "Con ambos",
        sininstagram: "Sin Instagram",
      },
      sort: {
        name: "Nombre A–Z",
        ageAsc: "Menor edad",
        ageDesc: "Mayor edad",
        oldest: "Más antiguos",
      },
    };
    return maps[key]?.[value] || value;
  }

  function renderActiveFilters() {
    const chips = [];
    if (filters.category) chips.push(["category", filters.category]);
    if (filters.gender) chips.push(["gender", filters.gender]);
    if (filters.contact) chips.push(["contact", filters.contact]);
    if (filters.sort !== "recent") chips.push(["sort", filters.sort]);

    activeFilters.innerHTML = chips.map(([key, value]) => `
      <button class="active-filter-chip" type="button" data-remove-filter="${key}">
        ${escapeHtml(filterLabel(key, value))}<span>×</span>
      </button>
    `).join("");
    activeFilters.hidden = chips.length === 0;

    filterCount.textContent = chips.length;
    filterCount.hidden = chips.length === 0;
  }

  function contactMarkup(record) {
    const phone = String(record.telefono || "").trim();
    const instagram = String(record.instagram || "").trim();
    return `
      <div class="person-contact">
        <div class="contact-row">
          <span class="contact-icon">${icons.phone}</span>
          <span>${escapeHtml(phone || "Sin teléfono")}</span>
        </div>
        <div class="contact-row">
          <span class="contact-icon">${icons.instagram}</span>
          <span>${escapeHtml(instagram || "Sin Instagram")}</span>
        </div>
      </div>
    `;
  }

  function actionMarkup(record, compact = false) {
    const phone = String(record.telefono || "").trim();
    const instagram = String(record.instagram || "").trim();
    const wa = whatsappUrl(phone);
    const ig = instagramUrl(instagram);
    const id = escapeHtml(record.id);

    if (compact) {
      return `
        <div class="table-actions">
          <a class="icon-action whatsapp ${wa ? "" : "disabled"}" ${wa ? `href="${wa}" target="_blank" rel="noopener"` : ""} title="WhatsApp" aria-label="WhatsApp">${icons.whatsapp}</a>
          <a class="icon-action instagram ${ig ? "" : "disabled"}" ${ig ? `href="${ig}" target="_blank" rel="noopener"` : ""} title="Instagram" aria-label="Instagram">${icons.instagram}</a>
          <button class="icon-action view" type="button" data-view-id="${id}" title="Ver perfil" aria-label="Ver perfil">${icons.eye}</button>
        </div>
      `;
    }

    return `
      <div class="person-actions">
        <a class="person-action whatsapp ${wa ? "" : "disabled"}" ${wa ? `href="${wa}" target="_blank" rel="noopener"` : ""}>${icons.whatsapp}<span>WhatsApp</span></a>
        <a class="person-action instagram ${ig ? "" : "disabled"}" ${ig ? `href="${ig}" target="_blank" rel="noopener"` : ""}>${icons.instagram}<span>Instagram</span></a>
        <button class="person-action view" type="button" data-view-id="${id}">${icons.eye}<span>Ver perfil</span></button>
      </div>
    `;
  }

  function renderList() {
    const filtered = filterRecords();

    rowsBody.innerHTML = filtered.map((record) => {
      const age = ageFromBirthdate(record.fecha_nacimiento);
      const group = groupFor(record);
      const phone = String(record.telefono || "").trim();
      const instagram = String(record.instagram || "").trim();
      return `
        <tr>
          <td class="person-cell">
            <strong>${escapeHtml(record.nombre)} ${escapeHtml(record.apellido)}</strong>
            <small>${escapeHtml(instagram || "Sin Instagram")}</small>
          </td>
          <td><strong>${age ?? '—'}</strong></td>
          <td><span class="mini-badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span></td>
          <td>${escapeHtml(record.genero || "—")}</td>
          <td class="contact-cell">
            <span>${escapeHtml(phone || "Sin teléfono")}</span>
            <small>${escapeHtml(instagram || "Sin Instagram")}</small>
          </td>
          <td>${formatDate(record.creado_en, true)}</td>
          <td>${actionMarkup(record, true)}</td>
        </tr>
      `;
    }).join("");

    cardsList.innerHTML = filtered.map((record) => {
      const age = ageFromBirthdate(record.fecha_nacimiento);
      const group = groupFor(record);
      return `
        <article class="person-card">
          <div class="person-card-main">
            <div class="person-card-head">
              <div>
                <strong class="person-name">${escapeHtml(record.nombre)} ${escapeHtml(record.apellido)}</strong>
                <p class="person-subtitle">${age === null ? 'Nacimiento sin completar' : age + ' años · ' + group} · ${escapeHtml(record.genero || "Sexo sin definir")}</p>
              </div>
              <span class="mini-badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span>
            </div>
            ${contactMarkup(record)}
            <div class="future-tags"><span class="future-tag">Perfil</span></div>
          </div>
          ${actionMarkup(record)}
        </article>
      `;
    }).join("");

    visibleCount.textContent = filtered.length === 1 ? "1 persona" : filtered.length + " personas";
    listSubtext.textContent = (searchInput.value.trim() || activeFilters.hidden === false)
      ? "Resultados de tu búsqueda y filtros"
      : profileState === 'trash' ? "Papelera · perfiles eliminados de la base" : profileState === 'archived' ? "Perfiles archivados · historial conservado" : "Todos los perfiles activos";

    emptyState.hidden = filtered.length !== 0;
    clearSearchBtn.hidden = !searchInput.value.trim();
    syncQuickFilters();
    renderActiveFilters();
    const grouped = new Map();
    for (const record of records) {
      if (!record.fecha_nacimiento) continue;
      const key = normalize(record.nombre + ' ' + record.apellido).replace(/[^a-z0-9]/g, '') + ':' + record.fecha_nacimiento;
      const matches = grouped.get(key) || [];
      matches.push(record);
      grouped.set(key, matches);
    }
    const duplicates = [...grouped.values()].filter(group => group.length > 1);
    const panel = $('profileDuplicates');
    panel.hidden = profileState !== 'active' || !duplicates.length;
    panel.innerHTML = duplicates.map(group => `<div><p><strong>${escapeHtml(group[0].nombre)} ${escapeHtml(group[0].apellido)}</strong> · ${group.length} registros coincidentes. Revisá las fichas para elegir cuál conservar.</p><div class="profile-duplicate-actions">${group.map((record,index) => `<button type="button" data-view-id="${escapeHtml(record.id)}">Revisar registro ${index+1} · ${escapeHtml(formatDate(record.creado_en,true))}</button>`).join('')}</div></div>`).join('');
    renderBulkControls(filtered);
  }

  function syncChoiceButtons() {
    document.querySelectorAll("[data-filter-group]").forEach((group) => {
      const key = group.dataset.filterGroup;
      group.querySelectorAll("[data-value]").forEach((button) => {
        button.classList.toggle("active", button.dataset.value === draftFilters[key]);
      });
    });
  }

  function openFilters() {
    draftFilters = { ...filters };
    syncChoiceButtons();
    filterBackdrop.hidden = false;
    filterSheet.classList.add("open");
    filterSheet.setAttribute("aria-hidden", "false");
    window.TNTUI.trackOverlay(filterSheet, () => {
      filterSheet.classList.remove("open");
      filterSheet.setAttribute("aria-hidden", "true");
      filterBackdrop.hidden = true;
      document.body.style.overflow = document.querySelector('.bottom-sheet.open') ? 'hidden' : '';
    });
    document.body.style.overflow = "hidden";
  }

  async function loadProfileInterests(record) {
    const id = record.id;
    try {
      const result = await window.TNT.sb.rpc('tnt_profile_detail', { p_person: id });
      if (result.error || String(currentDetailId) !== String(id) || !detailSheet.classList.contains('open')) return;
      const ctx = result.data;
      if (!ctx?.values) return;
      const old = $("detailData").querySelector('[data-profile-interests]');
      old?.remove();
      const extra = document.createElement('div');
      extra.dataset.profileInterests = '';
      extra.className = 'profile-detail-extra';
      extra.innerHTML = '<h3>Intereses y proyectos</h3>' + Object.entries(ctx.fields).filter(([k,f]) => !window.TNTProfiles.baseKeys.includes(k) && f.visible !== false).map(([k,f]) => {
        let value = ctx.values[k];
        if (k === 'efe_group') value = value === 'none' ? 'Todavía no va a un EFE' : ctx.groups.find(g => g.code === value)?.name;
        if (Array.isArray(value)) value = value.join(', ');
        return detailItem(f.label, value || 'Sin completar', ['dreams','studies','interests'].includes(k) || f.type === 'textarea' || String(value || '').length > 60);
      }).join('');
      if (window.TNT.isAdmin && ctx.fields.dni?.visible !== false && ctx.values.dni) extra.innerHTML += detailItem('DNI',ctx.values.dni);
      if (canEdit() && profileState === 'active') {
        const button = document.createElement('button');
        button.className = 'tnt-button primary';button.textContent = 'Editar intereses, sueños y EFE';
        button.onclick = () => editProfileInterests(record,ctx);
        extra.append(button);
      }
      $("detailData").append(extra);
    } catch(error) { console.warn('Datos ampliados del perfil',error); }
  }

  function editProfileInterests(record,ctx) {
    const U=window.TNTUI,P=window.TNTProfiles;
    const o=U.modal('Lo que hace única a esta persona',`<form class="tnt-form">${P.render(ctx.fields,ctx.values,ctx.groups,{mode:'extra'})}<button class="tnt-button primary" type="submit">Guardar perfil</button><p role="status"></p></form>`,false,{stack:true});
    const form=o.querySelector('form');P.bind(form,ctx.fields,ctx.values,ctx.groups);
    form.onsubmit=async e=>{e.preventDefault();if(!P.validate(form,ctx.fields))return;const button=form.querySelector('[type=submit]');button.disabled=true;try{const r=await window.TNT.sb.rpc('tnt_save_central_profile',{p_person:record.id,p_values:P.collect(form,ctx.fields)});if(r.error)throw r.error;await U.closeModal(o);await loadProfileInterests(record);showToast('Perfil actualizado.');}catch(err){form.querySelector('[role=status]').textContent=err.message;}finally{button.disabled=false;}};
  }

  function closeFilters() {
    window.TNTUI.closeModal(filterSheet);
  }

  function resetAllFilters() {
    filters = defaultFilters();
    draftFilters = defaultFilters();
    searchInput.value = "";
    syncChoiceButtons();
    renderList();
  }

  function setQuickFilter(value) {
    filters = defaultFilters();
    if (value === "Adolescente" || value === "Joven") filters.category = value;
    if (value === "Mujer" || value === "Varón") filters.gender = value;
    draftFilters = { ...filters };
    renderList();
  }

  function detailItem(label, value, wide = false) {
    return `
      <div class="detail-item ${wide ? 'detail-item-wide' : ''}">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value || "—")}</strong>
      </div>
    `;
  }

  function openDetail(id) {
    const record = records.find((item) => String(item.id) === String(id));
    if (!record) return;
    currentDetailId = String(record.id);

    const age = ageFromBirthdate(record.fecha_nacimiento);
    const group = groupFor(record);
    const phone = String(record.telefono || "").trim();
    const instagram = String(record.instagram || "").trim();
    const wa = whatsappUrl(phone);
    const ig = instagramUrl(instagram);

    $("detailAvatar").textContent =
      ((record.nombre || "P").charAt(0) + (record.apellido || "").charAt(0)).toUpperCase();
    $("detailName").textContent = [record.nombre, record.apellido].filter(Boolean).join(" ");
    $("detailSummary").textContent = (age === null ? 'Nacimiento sin completar' : age + ' años · ' + group) + " · " + (record.genero || "Sexo sin definir");
    $("detailData").innerHTML = [
      detailItem("Fecha de nacimiento", formatDate(record.fecha_nacimiento)),
      detailItem("Edad actual", age === null ? 'Sin fecha de nacimiento' : age + " años"),
      detailItem("Grupo", group),
      detailItem("Género", record.genero || "—"),
      detailItem("Teléfono", phone || "—"),
      detailItem("Instagram", instagram || "—"),
      detailItem("Registrado", formatDate(record.creado_en, true), true),
    ].join("");

    $("detailActions").innerHTML = `
      <a class="detail-action whatsapp ${wa ? "" : "disabled"}" ${wa ? `href="${wa}" target="_blank" rel="noopener"` : ""}>${icons.whatsapp}<span>WhatsApp</span></a>
      <a class="detail-action instagram ${ig ? "" : "disabled"}" ${ig ? `href="${ig}" target="_blank" rel="noopener"` : ""}>${icons.instagram}<span>Instagram</span></a>
      <button class="detail-action copy-detail ${phone ? "" : "disabled"}" type="button" data-copy-phone="${escapeHtml(phone)}">${icons.copy}<span>Copiar teléfono</span></button>
    `;

    $("editProfileBtn").hidden = !canEdit() || profileState !== 'active';
    $("deleteProfileBtn").hidden = !canArchive();
    $("deleteProfileBtn").textContent = profileState === 'trash' ? 'Restaurar desde Papelera' : profileState === 'archived' ? 'Restaurar perfil' : 'Archivar perfil';
    $('removeProfileBtn').hidden = !canArchive() || profileState === 'trash' || String(record.id) === String(window.TNT.person?.id);
    detailBackdrop.hidden = false;
    detailSheet.classList.add("open");
    detailSheet.setAttribute("aria-hidden", "false");
    window.TNTUI.trackOverlay(detailSheet, () => {
      detailSheet.classList.remove("open");
      detailSheet.setAttribute("aria-hidden", "true");
      detailBackdrop.hidden = true;
      document.body.style.overflow = document.querySelector('.bottom-sheet.open') ? 'hidden' : '';
    });
    document.body.style.overflow = "hidden";
    loadProfileInterests(record);
  }

  function closeDetail() {
    return window.TNTUI.closeModal(detailSheet);
  }

  function currentRecord() {
    return records.find((item) => String(item.id) === String(currentDetailId)) || null;
  }

  function closeEdit() {
    window.TNTUI.closeModal($("editSheet"));
  }

  function openEdit() {
    const record = currentRecord();
    if (!record || !canEdit() || profileState !== 'active') return;


    $("editNombre").value = record.nombre || "";
    $("editApellido").value = record.apellido || "";
    $("editFechaNacimiento").value = record.fecha_nacimiento || "";
    $("editInstagram").value = record.instagram || "";
    $("editTelefono").value = record.telefono || "";
    document.querySelectorAll('input[name="editGenero"]').forEach((input) => {
      input.checked = input.value === record.genero;
    });

    $("editMessage").textContent = "";
    $("editBackdrop").hidden = false;
    $("editSheet").classList.add("open");
    $("editSheet").setAttribute("aria-hidden", "false");
    window.TNTUI.trackOverlay($("editSheet"), () => {
      $("editSheet").classList.remove("open");
      $("editSheet").setAttribute("aria-hidden", "true");
      $("editBackdrop").hidden = true;
      document.body.style.overflow = document.querySelector('.bottom-sheet.open') ? 'hidden' : '';
    });
    document.body.style.overflow = "hidden";
    setTimeout(() => $("editNombre").focus(), 120);
  }

  function setEditLoading(active) {
    $("saveEditBtn").disabled = active;
    $("saveEditText").textContent = active ? "Guardando…" : "Guardar cambios";
    $("saveEditSpinner").hidden = !active;
  }

  function closeDelete() {
    if (deleting) return;
    return window.TNTUI.closeModal($("deleteSheet"));
  }

  async function restoreProfile(record) {
    const button = $('deleteProfileBtn');
    button.disabled = true;
    try {
      const action = profileState === 'trash' ? 'tnt_restore_deleted_profile' : 'tnt_set_profile_active';
      const args = profileState === 'trash' ? {p_person:record.id} : {p_person:record.id,p_active:true};
      const result = await window.TNT.sb.rpc(action,args);
      if (result.error) throw result.error;
      deletedProfiles.delete(String(record.id));
      await loadData('central', {silent:true});
      await closeDetail();
      currentDetailId = '';
      showToast('Perfil restaurado. Su historial se conserva.');
    } catch(error) { showToast(error.message || 'No se pudo restaurar.'); }
    finally { button.disabled = false; }
  }


  function renderBulkControls(filtered){
    $('profileBulkActions')?.remove();if(!canArchive())return;const available=new Set(filtered.map(r=>String(r.id)));for(const id of selectedProfiles)if(!records.some(r=>String(r.id)===id))selectedProfiles.delete(id);
    const bar=document.createElement('div');bar.id='profileBulkActions';bar.className='tnt-profile-bulk';bar.innerHTML=`<label><input type="checkbox" data-profile-all ${filtered.length&&filtered.every(r=>selectedProfiles.has(String(r.id)))?'checked':''}> Seleccionar todos</label><b>${selectedProfiles.size?selectedProfiles.size+' seleccionados':''}</b>${selectedProfiles.size?`${profileState==='active'?'<button data-profile-bulk="archive">Archivar</button>':''}${profileState==='trash'?'<button data-profile-bulk="restore_deleted">Restaurar</button>':profileState==='archived'?'<button data-profile-bulk="activate">Restaurar</button>':''}${profileState!=='trash'?'<button data-profile-bulk="delete">Eliminar</button>':''}<button data-profile-clear>Cancelar selección</button>`:''}`;cardsList.before(bar);
    bar.querySelector('[data-profile-all]').onchange=e=>{for(const record of filtered){if(e.target.checked)selectedProfiles.add(String(record.id));else selectedProfiles.delete(String(record.id));}renderList();};bar.querySelector('[data-profile-clear]')?.addEventListener('click',()=>{selectedProfiles.clear();renderList();});bar.querySelectorAll('[data-profile-bulk]').forEach(b=>b.onclick=()=>bulkProfiles([...selectedProfiles],b.dataset.profileBulk));
    for(const [list,selector] of [[cardsList,'.person-card'],[rowsBody,'tr']])list.querySelectorAll(selector).forEach((node,i)=>{const record=filtered[i];if(!record)return;node.dataset.tntRecord='';const input=document.createElement('input');input.type='checkbox';input.className='tnt-profile-select';input.checked=selectedProfiles.has(String(record.id));input.setAttribute('aria-label','Seleccionar '+record.nombre+' '+record.apellido);input.onchange=()=>{if(input.checked)selectedProfiles.add(String(record.id));else selectedProfiles.delete(String(record.id));renderList();};input.onclick=e=>e.stopPropagation();if(selector==='tr')node.querySelector('td').prepend(input);else node.prepend(input);});
  }
  async function bulkProfiles(ids,action){
    if(bulkBusy||!canArchive()||!ids.length)return;bulkBusy=true;const previous=records.filter(r=>ids.includes(String(r.id)));try{const r=await TNT.sb.rpc('tnt_bulk_profiles',{p_ids:ids,p_action:action});if(r.error)throw r.error;const rows=Array.isArray(r.data)?r.data:[],success=rows.filter(r=>r.ok).map(r=>String(r.id)),failed=rows.filter(r=>!r.ok);if(!success.length)throw Error(failed.map(r=>r.error).join(' · ')||'No se pudieron cambiar los perfiles.');for(const id of success){selectedProfiles.delete(id);if(action==='delete')deletedProfiles.add(id);if(action==='restore_deleted')deletedProfiles.delete(id);}records=records.filter(r=>!success.includes(String(r.id)));renderStats();renderList();if(success.includes(currentDetailId)){await closeDetail();currentDetailId='';}await loadData('central',{silent:true});const message=success.length+' '+(success.length===1?'perfil':'perfiles')+' '+({archive:'archivado',delete:'eliminado',activate:'restaurado',restore_deleted:'restaurado'}[action])+(success.length===1?'':'s');if(action==='archive'||action==='delete')TNTExperience.undo(message,async()=>{const undo=await TNT.sb.rpc('tnt_bulk_profiles',{p_ids:success,p_action:action==='archive'?'activate':'restore_deleted'});if(undo.error)throw undo.error;const errors=(undo.data||[]).filter(r=>!r.ok);for(const id of success)if(!errors.some(r=>String(r.id)===id))deletedProfiles.delete(id);await loadData('central',{silent:true});if(errors.length)throw Error(errors.map(r=>r.error).join(' · '));});else showToast(message);if(failed.length)showToast(failed.length+' no se pudieron cambiar: '+failed.map(r=>r.error).join(' · '));}catch(e){showToast(e.message);}finally{bulkBusy=false;}
  }

  function openDelete(mode = 'archive') {
    const record = currentRecord();
    if (!record || !canArchive() || deleting) return;
    if(mode==='archive'&&profileState==='active'){bulkProfiles([String(record.id)],'archive');return;}
    if (mode === 'archive' && profileState !== 'active') {
      restoreProfile(record);
      return;
    }
    if (mode === 'delete' && profileState === 'trash') return;
    deleteMode = mode;
    $('deleteTitle').textContent = mode === 'delete' ? '¿Eliminar este perfil?' : '¿Archivar perfil?';
    $('deleteActionVerb').textContent = mode === 'delete' ? 'Vas a eliminar de la base a' : 'Vas a archivar a';
    $('deleteActionDescription').textContent = mode === 'delete'
      ? 'El perfil irá a la Papelera. Sus asistencias, pagos y responsabilidades se conservan. Podés restaurarlo desde allí.'
      : 'Su historial de EFE y sábados se conserva. Podés restaurarlo desde Archivados.';
    $('deleteStatus').textContent = '';
    $('deleteProfileName').textContent = [record.nombre,record.apellido].filter(Boolean).join(' ');
    setDeleteLoading(false);
    $('deleteBackdrop').hidden = false;
    $('deleteSheet').classList.add('open');
    $('deleteSheet').setAttribute('aria-hidden','false');
    window.TNTUI.trackOverlay($('deleteSheet'), () => {
      $('deleteSheet').classList.remove('open');
      $('deleteSheet').setAttribute('aria-hidden','true');
      $('deleteBackdrop').hidden = true;
      document.body.style.overflow = document.querySelector('.bottom-sheet.open') ? 'hidden' : '';
    });
    document.body.style.overflow = 'hidden';
  }

  function setDeleteLoading(active) {
    $('confirmDeleteBtn').disabled = active;
    $('cancelDeleteBtn').disabled = active;
    $('confirmDeleteText').textContent = active ? (deleteMode === 'delete' ? 'Eliminando…' : 'Archivando…') : (deleteMode === 'delete' ? 'Eliminar perfil' : 'Sí, archivar');
    $('deleteSpinner').hidden = !active;
  }

  async function copyPhone(phone) {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = phone;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    showToast("Teléfono copiado: " + phone);
  }

  function csvEscape(value) {
    return '"' + String(value ?? "").replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    const filtered = filterRecords();
    if (!filtered.length) {
      showToast("No hay personas para exportar.");
      return;
    }

    const rows = [
      ["Nombre","Apellido","Fecha de nacimiento","Edad","Grupo","Género","Instagram","Teléfono","Fecha de registro"],
      ...filtered.map((record) => [
        record.nombre,
        record.apellido,
        record.fecha_nacimiento,
        ageFromBirthdate(record.fecha_nacimiento),
        groupFor(record),
        record.genero,
        record.instagram || "",
        record.telefono || "",
        record.creado_en || "",
      ]),
    ];

    const csv = "\ufeff" + rows.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "Base_TNT_" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Base exportada a CSV.");
  }

  function setLoginLoading(active) {
    loginBtn.disabled = active;
    loginText.textContent = active ? "Abriendo…" : "Abrir Base TNT";
    loginSpinner.hidden = !active;
  }

  function setRefreshLoading(active) {
    document.querySelectorAll("#refreshBtn,#mobileRefreshBtn").forEach((button) => {
      button.disabled = active;
    });
    const symbol = document.querySelector("#refreshBtn .refresh-symbol");
    if (symbol) symbol.textContent = active ? "…" : "↻";
  }

  document.addEventListener('tnt:data',e=>{if((e.detail?.tables||[]).some(t=>['tnt_people','tnt_accounts','tnt_settings'].includes(t))&&!bulkBusy)loadData('central',{silent:true}).catch(e=>showToast(e.message));});
  async function loadData(token, options = {}) {
    const sb = window.TNT?.sb;
    if (!sb) throw new Error("No se pudo conectar con la base.");

    if (!options.silent) setRefreshLoading(true);
    try {
      const { data, error } = await sb.from("tnt_profiles_central").select("*").eq("active", profileState === 'active').order("actualizado_en", { ascending: false });
      if (error) throw error;

      records = Array.isArray(data) ? data.filter(p => !p.data_notes?.linked_to && (profileState === 'trash' ? Boolean(p.data_notes?.deleted_at) : !p.data_notes?.deleted_at && !deletedProfiles.has(String(p.id)))) : [];
      renderStats();
      renderList();

      const time = new Intl.DateTimeFormat("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
      updatedBadge.textContent = "Actualizado " + time;
    } finally {
      if (!options.silent) setRefreshLoading(false);
    }
  }

  function lockBase() {
    location.href = "/";
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.TNT?.hasAccess('perfiles','*','view')) { loginMessage.textContent = "Necesitás permiso para ver Perfiles. Podés solicitarlo desde tu Cuenta TNT."; return; }
    try { await loadData("central", { silent: true }); accessToken="central"; loginView.hidden=true; dashboardView.hidden=false; }
    catch (error) { loginMessage.textContent="No se pudo cargar la base de perfiles."; }
  });

  togglePassword.addEventListener("click", () => {
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    togglePassword.textContent = visible ? "Ver" : "Ocultar";
    passwordInput.focus();
  });

  $("themeToggle").addEventListener("click", () => {
    window.TNT.toggleTheme();
  });

  searchInput.addEventListener("input", renderList);
  document.querySelectorAll('[data-profile-state]').forEach(button => button.addEventListener('click', async () => {
    if (!accessToken || button.dataset.profileState === profileState || button.dataset.profileState !== 'active' && !canArchive()) return;
    const previous = profileState;
    const controls = [...document.querySelectorAll('[data-profile-state]')];
    controls.forEach(b => b.disabled = true);
    profileState = button.dataset.profileState;
    try {
      await loadData('central');
      controls.forEach(b => b.classList.toggle('active', b.dataset.profileState === profileState));
    } catch (error) {
      profileState = previous;
      showToast('No se pudieron cargar los perfiles. Reintentá.');
    } finally { controls.forEach(b => b.disabled = b.dataset.profileState !== 'active' && !canArchive()); }
  }));
  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    renderList();
    searchInput.focus();
  });

  document.querySelectorAll("[data-quick], [data-summary-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      setQuickFilter(button.dataset.quick ?? button.dataset.summaryFilter);
    });
  });

  $("openFiltersBtn").addEventListener("click", openFilters);
  $("closeFiltersBtn").addEventListener("click", closeFilters);
  filterBackdrop.addEventListener("click", closeFilters);

  document.querySelectorAll("[data-filter-group]").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("[data-value]");
      if (!button) return;
      const key = group.dataset.filterGroup;
      draftFilters[key] = button.dataset.value;
      syncChoiceButtons();
    });
  });

  $("resetFiltersBtn").addEventListener("click", () => {
    draftFilters = defaultFilters();
    syncChoiceButtons();
  });

  $("applyFiltersBtn").addEventListener("click", () => {
    filters = { ...draftFilters };
    renderList();
    closeFilters();
  });

  activeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-filter]");
    if (!button) return;
    const key = button.dataset.removeFilter;
    if (key === "sort") filters.sort = "recent";
    else filters[key] = "";
    draftFilters = { ...filters };
    renderList();
  });

  $("emptyClearBtn").addEventListener("click", resetAllFilters);

  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view-id]");
    if (viewButton) {
      openDetail(viewButton.dataset.viewId);
      return;
    }

    const copyButton = event.target.closest("[data-copy-phone]");
    if (copyButton) {
      copyPhone(copyButton.dataset.copyPhone || "");
    }
  });

  $("closeDetailBtn").addEventListener("click", closeDetail);
  detailBackdrop.addEventListener("click", closeDetail);

  $("editProfileBtn").addEventListener("click", openEdit);
  $('deleteProfileBtn').addEventListener('click', () => openDelete('archive'));
  $('removeProfileBtn').addEventListener('click', () => openDelete('delete'));

  $("closeEditBtn").addEventListener("click", closeEdit);
  $("cancelEditBtn").addEventListener("click", closeEdit);
  $("editBackdrop").addEventListener("click", closeEdit);

  $("editForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const record = currentRecord();
    if (!record || !accessToken) return;

    const nombre = $("editNombre").value.trim();
    const apellido = $("editApellido").value.trim();
    const fecha = $("editFechaNacimiento").value;
    const instagram = $("editInstagram").value.trim();
    const telefono = $("editTelefono").value.trim();
    const genero = document.querySelector('input[name="editGenero"]:checked')?.value || "";

    $("editMessage").textContent = "";

    if (nombre.length < 2) {
      $("editMessage").textContent = "Revisá el nombre.";
      return;
    }
    if (apellido.length < 2) {
      $("editMessage").textContent = "Revisá el apellido.";
      return;
    }
    if (telefono && telefono.replace(/\D/g, "").length < 6) {
      $("editMessage").textContent = "Revisá el número de teléfono o dejalo vacío.";
      return;
    }
    if (!genero) {
      $("editMessage").textContent = "Elegí Mujer o Varón.";
      return;
    }

    setEditLoading(true);
    try {
      const sb = window.TNT?.sb;
      if (!sb) throw new Error("No se pudo conectar con la base.");

      const { error } = await sb.rpc("tnt_save_central_profile", {
        p_person: record.id,
        p_values: {
          first_name: nombre,
          last_name: apellido,
          full_name: [nombre, apellido].filter(Boolean).join(" "),
          birthday: fecha,
          instagram: instagram || null,
          phone: telefono || null,
          sex: genero === "Mujer" ? "F" : "M"
        }
      });

      if (error) throw error;

      await loadData("central", { silent: true });
      const updated = records.find((item) => String(item.id) === String(record.id));
      closeEdit();
      if (updated) openDetail(updated.id);
      showToast("Perfil actualizado.");
    } catch (error) {
      console.error(error);
      $("editMessage").textContent = error.message || "No se pudieron guardar los cambios.";
    } finally {
      setEditLoading(false);
    }
  });

  $("cancelDeleteBtn").addEventListener("click", closeDelete);
  $("deleteBackdrop").addEventListener("click", closeDelete);

  $('confirmDeleteBtn').addEventListener('click', async () => {
    const record = currentRecord(), mode = deleteMode;
    if (!record || !accessToken || !canArchive() || deleting) return;
    deleting = true;
    setDeleteLoading(true);
    $('deleteStatus').textContent = '';
    try {
      const sb = window.TNT?.sb;
      if (!sb) throw new Error('No se pudo conectar con la base.');
      const result = mode === 'delete'
        ? await sb.rpc('tnt_delete_profile', {p_person:record.id})
        : await sb.rpc('tnt_set_profile_active', {p_person:record.id,p_active:false});
      if (result.error) throw result.error;
      const name = [record.nombre,record.apellido].filter(Boolean).join(' ');
      if (mode === 'delete') deletedProfiles.add(String(record.id));
      records = records.filter(item => String(item.id) !== String(record.id));
      renderStats();renderList();
      deleting = false;
      await closeDelete();
      if (String(currentDetailId) === String(record.id)) {
        await closeDetail();
        currentDetailId = '';
        $('detailData').innerHTML = '';
      }
      showToast(name + (mode === 'delete' ? ' se eliminó de la base y está en la Papelera.' : ' fue archivado sin perder su historial.'));
    } catch(error) {
      $('deleteStatus').textContent = error.message || 'No se pudo guardar el cambio. Reintentá.';
      showToast(error.message || 'No se pudo guardar el cambio.');
    } finally {
      deleting = false;
      setDeleteLoading(false);
    }
  });

  const refresh = async () => {
    if (!accessToken) return;
    try {
      await loadData(accessToken);
      showToast("Base actualizada.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar.");
    }
  };

  $("refreshBtn").addEventListener("click", refresh);
  $("mobileRefreshBtn").addEventListener("click", refresh);
  $("exportBtn").addEventListener("click", exportCsv);
  $("mobileExportBtn").addEventListener("click", exportCsv);
  $("logoutBtn").addEventListener("click", lockBase);
  $("headerLockBtn").addEventListener("click", lockBase);



  const share = new URLSearchParams(location.search).get("_vercel_share");
  if (share) {
    const suffix = "?_vercel_share=" + encodeURIComponent(share);
    document.querySelector(".back-button").href = "/perfiles" + suffix;
    $("newProfileBtn").href = "/perfiles" + suffix;
    $("mobileNewProfileBtn").href = "/perfiles" + suffix;
  }

  async function restorePanelSession() {
    await window.TNT?.ready;
    if (!window.TNT?.identity || window.TNT.blocked || !window.TNT.hasAccess('perfiles','*','view')) {
      loginMessage.textContent = "Necesitás permiso para ver Perfiles. Podés solicitarlo desde tu Cuenta TNT.";
      loginView.hidden = false;
      return;
    }
    try {
      await loadData("central", { silent: true });
      accessToken="central";
      loginView.hidden=true;
      dashboardView.hidden=false;
      $("newProfileBtn").hidden = !canEdit();
      $("mobileNewProfileBtn").hidden = !canEdit();
      document.querySelectorAll('[data-profile-state]').forEach(b => b.disabled = b.dataset.profileState !== 'active' && !canArchive());
    } catch (error) { console.error("No se pudieron cargar los perfiles",error); loginMessage.textContent="No se pudo cargar la base. Reintentá."; loginView.hidden=false; }
  }

  initTheme();
  document.querySelectorAll('[data-profile-state]').forEach(b => b.disabled = b.dataset.profileState !== 'active' && !canArchive());
  syncChoiceButtons();
  $("editFechaNacimiento").max = new Date().toISOString().slice(0, 10);
  restorePanelSession();
})();
