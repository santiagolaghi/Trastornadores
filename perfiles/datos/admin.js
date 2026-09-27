(() => {
  const $ = (id) => document.getElementById(id);

  const loginView = $("loginView");
  const dashboardView = $("dashboardView");
  const loginForm = $("loginForm");
  const claveInput = $("password");
  const toggleClave = $("togglePassword");
  const loginMessage = $("loginMessage");
  const loginBtn = $("loginBtn");
  const loginText = $("loginText");
  const loginSpinner = $("loginSpinner");

  const searchInput = $("searchInput");
  const categoryFilter = $("categoryFilter");
  const genderFilter = $("genderFilter");
  const contactFilter = $("contactFilter");
  const sortFilter = $("sortFilter");
  const rowsBody = $("rowsBody");
  const cardsList = $("cardsList");
  const emptyState = $("emptyState");
  const visibleCount = $("visibleCount");
  const activeFilterText = $("activeFilterText");
  const updatedBadge = $("updatedBadge");
  const refreshBtn = $("refreshBtn");
  const exportBtn = $("exportBtn");
  const toast = $("toast");
  const themeToggle = $("themeToggle");
  const themeIcon = $("themeIcon");

  let registros = [];
  let accessToken = "";
  let toastTimer = null;

  const icons = {
    whatsapp: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.6a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.6Z"/><path d="M9 8.3c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.5l.7 1.7c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4 0 .7.5.9 1.3 1.7 2.2 2.2.3.2.5.2.7 0l.8-1c.2-.2.4-.3.7-.2l1.6.8c.3.2.5.3.5.5 0 .3-.1 1.3-.8 1.9-.6.6-1.5.8-2.4.5-1.5-.5-3.2-1.4-4.6-2.8-1.2-1.2-2.1-2.7-2.5-3.9-.3-.9-.1-1.6.3-2.1.3-.4.6-.6.8-.8Z"/></svg>`,
    instagram: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.7" r="1" fill="currentColor" stroke="none"/></svg>`,
    copy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  };

  function applyTheme(theme) {
    const finalTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = finalTheme;
    themeIcon.textContent = finalTheme === "dark" ? "☀" : "☾";
    themeToggle.title = finalTheme === "dark" ? "Usar tema claro" : "Usar tema oscuro";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", finalTheme === "dark" ? "#0b0d12" : "#f4f6fb");
    try { localStorage.setItem("tnt_perfiles_theme", finalTheme); } catch (_) {}
  }

  function loadInitialTheme() {
    let saved = "";
    try { saved = localStorage.getItem("tnt_perfiles_theme") || ""; } catch (_) {}
    if (!saved && window.matchMedia?.("(prefers-color-scheme: light)").matches) saved = "light";
    applyTheme(saved || "dark");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2300);
  }

  async function hashClave(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function normalize(value = "") {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es-AR")
      .trim();
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char]));
  }

  function ageFromBirthdate(value) {
    if (!value) return 0;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return 0;
    const today = new Date();
    let age = today.getFullYear() - year;
    if (
      today.getMonth() + 1 < month ||
      (today.getMonth() + 1 === month && today.getDate() < day)
    ) age -= 1;
    return Math.max(0, age);
  }

  function liveCategory(row) {
    return ageFromBirthdate(row.fecha_nacimiento) < 18 ? "Adolescente" : "Joven";
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
    const user = String(value || "").trim().replace(/^@+/, "");
    return user ? "https://www.instagram.com/" + encodeURIComponent(user) : "";
  }

  function filteredRows() {
    const q = normalize(searchInput.value);
    const contact = contactFilter.value;

    const result = registros.filter((row) => {
      const text = normalize([
        row.nombre,
        row.apellido,
        row.instagram,
        row.telefono,
      ].filter(Boolean).join(" "));

      if (q && !text.includes(q)) return false;
      if (categoryFilter.value && liveCategory(row) !== categoryFilter.value) return false;
      if (genderFilter.value && row.genero !== genderFilter.value) return false;

      const hasIg = Boolean(String(row.instagram || "").trim());
      const hasPhone = Boolean(String(row.telefono || "").trim());

      if (contact === "instagram" && !hasIg) return false;
      if (contact === "telefono" && !hasPhone) return false;
      if (contact === "ambos" && !(hasIg && hasPhone)) return false;
      if (contact === "sininstagram" && hasIg) return false;

      return true;
    });

    return result.sort((a, b) => {
      if (sortFilter.value === "name") {
        return (a.nombre + " " + a.apellido).localeCompare(
          b.nombre + " " + b.apellido,
          "es-AR",
          { sensitivity: "base" }
        );
      }
      if (sortFilter.value === "ageAsc") {
        return ageFromBirthdate(a.fecha_nacimiento) - ageFromBirthdate(b.fecha_nacimiento);
      }
      if (sortFilter.value === "ageDesc") {
        return ageFromBirthdate(b.fecha_nacimiento) - ageFromBirthdate(a.fecha_nacimiento);
      }
      if (sortFilter.value === "oldest") {
        return new Date(a.creado_en || 0) - new Date(b.creado_en || 0);
      }
      return new Date(b.creado_en || 0) - new Date(a.creado_en || 0);
    });
  }

  function activeFilterDescription() {
    const parts = [];
    if (searchInput.value.trim()) parts.push('búsqueda "' + searchInput.value.trim() + '"');
    if (categoryFilter.value) parts.push(categoryFilter.value === "Joven" ? "jóvenes" : "adolescentes");
    if (genderFilter.value) parts.push(genderFilter.value === "Mujer" ? "mujeres" : "varones");
    if (contactFilter.value === "instagram") parts.push("con Instagram");
    if (contactFilter.value === "telefono") parts.push("con teléfono");
    if (contactFilter.value === "ambos") parts.push("con Instagram y teléfono");
    if (contactFilter.value === "sininstagram") parts.push("sin Instagram");
    return parts.length ? "Filtros: " + parts.join(" · ") : "Mostrando todos los perfiles";
  }

  function renderStats() {
    const adolescentes = registros.filter((r) => liveCategory(r) === "Adolescente").length;
    const jovenes = registros.length - adolescentes;
    const mujeres = registros.filter((r) => r.genero === "Mujer").length;
    const varones = registros.filter((r) => r.genero === "Varón").length;

    $("statTotal").textContent = registros.length;
    $("statAdolescentes").textContent = adolescentes;
    $("statJovenes").textContent = jovenes;
    $("statMujeres").textContent = mujeres;
    $("statVarones").textContent = varones;

    $("summaryText").textContent = registros.length === 1
      ? "Hay 1 persona cargada en Perfiles."
      : "Hay " + registros.length + " personas cargadas en Perfiles.";
  }

  function syncQuickButtons() {
    let active = "all";
    if (categoryFilter.value) active = categoryFilter.value;
    else if (genderFilter.value) active = genderFilter.value;

    document.querySelectorAll("[data-chip]").forEach((button) => {
      button.classList.toggle("active", button.dataset.chip === active);
    });

    document.querySelectorAll("[data-quick-filter]").forEach((button) => {
      button.classList.toggle("active", button.dataset.quickFilter === active);
    });
  }

  function socialActions(row, mobile = false) {
    const phone = String(row.telefono || "").trim();
    const ig = String(row.instagram || "").trim();
    const wa = whatsappUrl(phone);
    const insta = instagramUrl(ig);

    if (mobile) {
      return `
        <div class="mobile-actions">
          <a class="mobile-action whatsapp ${wa ? "" : "disabled"}" ${wa ? `href="${wa}" target="_blank" rel="noopener"` : ""}>
            ${icons.whatsapp}<span>WhatsApp</span>
          </a>
          <a class="mobile-action instagram ${insta ? "" : "disabled"}" ${insta ? `href="${insta}" target="_blank" rel="noopener"` : ""}>
            ${icons.instagram}<span>Instagram</span>
          </a>
          <button class="mobile-action copy-contact ${phone ? "" : "disabled"}" type="button" data-copy-phone="${escapeHtml(phone)}">
            ${icons.copy}<span>Copiar teléfono</span>
          </button>
        </div>`;
    }

    return `
      <div class="row-actions">
        <a class="social-button whatsapp ${wa ? "" : "disabled"}" ${wa ? `href="${wa}" target="_blank" rel="noopener"` : ""} aria-label="Abrir WhatsApp" title="WhatsApp">${icons.whatsapp}</a>
        <a class="social-button instagram ${insta ? "" : "disabled"}" ${insta ? `href="${insta}" target="_blank" rel="noopener"` : ""} aria-label="Abrir Instagram" title="Instagram">${icons.instagram}</a>
        <button class="social-button copy ${phone ? "" : "disabled"}" type="button" data-copy-phone="${escapeHtml(phone)}" aria-label="Copiar teléfono" title="Copiar teléfono">${icons.copy}</button>
      </div>`;
  }

  function renderRows() {
    const filtered = filteredRows();

    rowsBody.innerHTML = filtered.map((row) => {
      const age = ageFromBirthdate(row.fecha_nacimiento);
      const group = liveCategory(row);
      const ig = String(row.instagram || "").trim();
      const phone = String(row.telefono || "").trim();

      return `
        <tr>
          <td class="person-cell">
            <strong>${escapeHtml(row.nombre)} ${escapeHtml(row.apellido)}</strong>
            <small>${escapeHtml(ig || "Sin Instagram")}</small>
          </td>
          <td><strong>${age}</strong></td>
          <td><span class="badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span></td>
          <td>${escapeHtml(row.genero || "—")}</td>
          <td>${formatDate(row.fecha_nacimiento)}</td>
          <td>
            <div class="contact-stack">
              <span>${escapeHtml(phone || "Sin teléfono")}</span>
              <small>${escapeHtml(ig || "Sin Instagram")}</small>
            </div>
          </td>
          <td>${formatDate(row.creado_en, true)}</td>
          <td class="actions-col">${socialActions(row)}</td>
        </tr>`;
    }).join("");

    cardsList.innerHTML = filtered.map((row) => {
      const age = ageFromBirthdate(row.fecha_nacimiento);
      const group = liveCategory(row);
      const ig = String(row.instagram || "").trim();
      const phone = String(row.telefono || "").trim();

      return `
        <article class="person-card">
          <div class="person-card-head">
            <div>
              <strong>${escapeHtml(row.nombre)} ${escapeHtml(row.apellido)}</strong>
              <small>Registrado: ${formatDate(row.creado_en, true)}</small>
            </div>
            <span class="badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span>
          </div>

          <div class="person-meta">
            <div class="meta-box"><small>Edad</small><span>${age} años</span></div>
            <div class="meta-box"><small>Género</small><span>${escapeHtml(row.genero || "—")}</span></div>
            <div class="meta-box"><small>Nacimiento</small><span>${formatDate(row.fecha_nacimiento)}</span></div>
            <div class="meta-box"><small>Instagram</small><span>${escapeHtml(ig || "—")}</span></div>
            <div class="meta-box"><small>Teléfono</small><span>${escapeHtml(phone || "—")}</span></div>
          </div>

          ${socialActions(row, true)}
        </article>`;
    }).join("");

    visibleCount.textContent = filtered.length === 1
      ? "1 persona"
      : filtered.length + " personas";
    activeFilterText.textContent = activeFilterDescription();
    emptyState.hidden = filtered.length !== 0;
    syncQuickButtons();
  }

  function setLoading(active) {
    loginBtn.disabled = active;
    loginText.textContent = active ? "Abriendo…" : "Abrir base";
    loginSpinner.hidden = !active;
  }

  function setRefreshLoading(active) {
    refreshBtn.disabled = active;
    refreshBtn.querySelector(".button-icon").textContent = active ? "…" : "↻";
  }

  async function loadData(token, { silent = false } = {}) {
    const sb = window.TNT?.sb;
    if (!sb) throw new Error("No se pudo conectar con Supabase.");

    if (!silent) setRefreshLoading(true);
    try {
      const { data, error } = await sb.rpc("perfiles_admin_listar", { p_token: token });
      if (error) throw error;
      registros = Array.isArray(data) ? data : [];
      renderStats();
      renderRows();
      const now = new Intl.DateTimeFormat("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
      updatedBadge.textContent = "Actualizado " + now;
      return true;
    } finally {
      if (!silent) setRefreshLoading(false);
    }
  }

  function clearFilters() {
    searchInput.value = "";
    categoryFilter.value = "";
    genderFilter.value = "";
    contactFilter.value = "";
    sortFilter.value = "recent";
    renderRows();
  }

  function applyQuickFilter(value) {
    categoryFilter.value = "";
    genderFilter.value = "";

    if (value === "Adolescente" || value === "Joven") categoryFilter.value = value;
    if (value === "Mujer" || value === "Varón") genderFilter.value = value;

    renderRows();
  }

  function csvEscape(value) {
    const string = String(value ?? "");
    return '"' + string.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    const filtered = filteredRows();
    if (!filtered.length) {
      showToast("No hay personas para exportar.");
      return;
    }

    const header = [
      "Nombre",
      "Apellido",
      "Fecha de nacimiento",
      "Edad",
      "Grupo",
      "Género",
      "Instagram",
      "Teléfono",
      "Fecha de registro",
    ];

    const lines = [
      header.map(csvEscape).join(";"),
      ...filtered.map((row) => [
        row.nombre,
        row.apellido,
        row.fecha_nacimiento,
        ageFromBirthdate(row.fecha_nacimiento),
        liveCategory(row),
        row.genero,
        row.instagram || "",
        row.telefono || "",
        row.creado_en || "",
      ].map(csvEscape).join(";")),
    ];

    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = "TNT_Perfiles_" + date + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("CSV descargado.");
  }

  async function copyPhone(phone) {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      showToast("Teléfono copiado: " + phone);
    } catch (_) {
      const input = document.createElement("textarea");
      input.value = phone;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      showToast("Teléfono copiado.");
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";

    const clave = claveInput.value;
    if (!clave) {
      loginMessage.textContent = "Ingresá la contraseña.";
      claveInput.focus();
      return;
    }

    setLoading(true);
    try {
      const token = await hashClave(clave);
      accessToken = token;
      await loadData(token, { silent: true });

      claveInput.value = "";
      loginView.hidden = true;
      dashboardView.hidden = false;
      window.scrollTo({ top: 0 });
    } catch (error) {
      console.error(error);
      accessToken = "";
      loginMessage.textContent = error?.code === "42501"
        ? "Contraseña incorrecta."
        : "No se pudieron cargar los datos.";
    } finally {
      setLoading(false);
    }
  });

  toggleClave.addEventListener("click", () => {
    const visible = claveInput.type === "text";
    claveInput.type = visible ? "password" : "text";
    toggleClave.textContent = visible ? "Ver" : "Ocultar";
    claveInput.focus();
  });

  themeToggle.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  searchInput.addEventListener("input", renderRows);
  [categoryFilter, genderFilter, contactFilter, sortFilter].forEach((el) => {
    el.addEventListener("change", renderRows);
  });

  $("clearSearchBtn").addEventListener("click", () => {
    searchInput.value = "";
    renderRows();
    searchInput.focus();
  });

  $("clearFiltersBtn").addEventListener("click", clearFilters);
  $("emptyClearBtn").addEventListener("click", clearFilters);

  document.querySelectorAll("[data-chip]").forEach((button) => {
    button.addEventListener("click", () => applyQuickFilter(button.dataset.chip));
  });

  document.querySelectorAll("[data-quick-filter]").forEach((button) => {
    button.addEventListener("click", () => applyQuickFilter(button.dataset.quickFilter));
  });

  refreshBtn.addEventListener("click", async () => {
    if (!accessToken) return;
    try {
      await loadData(accessToken);
      showToast("Base actualizada.");
    } catch (error) {
      console.error(error);
      showToast("No se pudo actualizar.");
    }
  });

  exportBtn.addEventListener("click", exportCsv);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-phone]");
    if (!button) return;
    copyPhone(button.dataset.copyPhone || "");
  });

  $("logoutBtn").addEventListener("click", () => {
    registros = [];
    accessToken = "";
    dashboardView.hidden = true;
    loginView.hidden = false;
    loginMessage.textContent = "";
    claveInput.value = "";
    clearFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => claveInput.focus(), 150);
  });

  const share = new URLSearchParams(location.search).get("_vercel_share");
  if (share) {
    document.querySelector(".back-button").href =
      "/perfiles?_vercel_share=" + encodeURIComponent(share);
    $("newProfileBtn").href =
      "/perfiles?_vercel_share=" + encodeURIComponent(share);
  }

  loadInitialTheme();
  claveInput.focus();
})();