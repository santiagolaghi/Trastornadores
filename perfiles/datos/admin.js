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
  const rowsBody = $("rowsBody");
  const cardsList = $("cardsList");
  const emptyState = $("emptyState");
  const visibleCount = $("visibleCount");

  let registros = [];

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
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit"
    } : {
      day: "2-digit", month: "2-digit", year: "numeric"
    }).format(date);
  }

  function filteredRows() {
    const q = normalize(searchInput.value);
    return registros.filter((row) => {
      const text = normalize([row.nombre, row.apellido, row.instagram, row.telefono].filter(Boolean).join(" "));
      if (q && !text.includes(q)) return false;
      if (categoryFilter.value && liveCategory(row) !== categoryFilter.value) return false;
      if (genderFilter.value && row.genero !== genderFilter.value) return false;
      return true;
    });
  }

  function renderStats() {
    const adolescentes = registros.filter((r) => liveCategory(r) === "Adolescente").length;
    const jovenes = registros.length - adolescentes;
    const mujeres = registros.filter((r) => r.genero === "Mujer").length;
    const varones = registros.filter((r) => r.genero === "Varón").length;

    $("statTotal").textContent = registros.length;
    $("statAdolescentes").textContent = adolescentes;
    $("statJovenes").textContent = jovenes;
    $("statGenero").textContent = mujeres + " / " + varones;
    $("summaryText").textContent = registros.length === 1
      ? "Hay 1 perfil guardado en la base."
      : "Hay " + registros.length + " perfiles guardados en la base.";
  }

  function renderRows() {
    const filtered = filteredRows();

    rowsBody.innerHTML = filtered.map((row) => {
      const age = ageFromBirthdate(row.fecha_nacimiento);
      const group = liveCategory(row);
      const ig = String(row.instagram || "").trim();
      const phone = String(row.telefono || "").trim();
      const igUser = ig.replace(/^@+/, "");
      const igUrl = igUser ? "https://www.instagram.com/" + encodeURIComponent(igUser) : "";
      const telUrl = phone ? "tel:" + phone.replace(/[^0-9+]/g, "") : "";

      return `
        <tr>
          <td class="person-cell"><strong>${escapeHtml(row.nombre)} ${escapeHtml(row.apellido)}</strong></td>
          <td>${age}</td>
          <td><span class="badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span></td>
          <td>${escapeHtml(row.genero || "—")}</td>
          <td>${ig ? `<a class="data-link" href="${igUrl}" target="_blank" rel="noopener">${escapeHtml(ig)}</a>` : '<span class="muted">—</span>'}</td>
          <td>${phone ? `<a class="data-link" href="${telUrl}">${escapeHtml(phone)}</a>` : '<span class="muted">—</span>'}</td>
          <td>${formatDate(row.fecha_nacimiento)}</td>
          <td>${formatDate(row.creado_en, true)}</td>
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
            <div><strong>${escapeHtml(row.nombre)} ${escapeHtml(row.apellido)}</strong><small>Registrado: ${formatDate(row.creado_en, true)}</small></div>
            <span class="badge ${group === "Adolescente" ? "teen" : "young"}">${group}</span>
          </div>
          <div class="person-meta">
            <div class="meta-box"><small>Edad</small><span>${age} años</span></div>
            <div class="meta-box"><small>Género</small><span>${escapeHtml(row.genero || "—")}</span></div>
            <div class="meta-box"><small>Nacimiento</small><span>${formatDate(row.fecha_nacimiento)}</span></div>
            <div class="meta-box"><small>Instagram</small><span>${escapeHtml(ig || "—")}</span></div>
            <div class="meta-box"><small>Teléfono</small><span>${escapeHtml(phone || "—")}</span></div>
          </div>
        </article>`;
    }).join("");

    visibleCount.textContent = filtered.length === 1 ? "1 registro" : filtered.length + " registros";
    emptyState.hidden = filtered.length !== 0;
  }

  function setLoading(active) {
    loginBtn.disabled = active;
    loginText.textContent = active ? "Abriendo…" : "Abrir datos";
    loginSpinner.hidden = !active;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginMessage.textContent = "";
    const clave = claveInput.value;
    if (!clave) {
      loginMessage.textContent = "Ingresá la contraseña.";
      return;
    }

    const sb = window.TNT?.sb;
    if (!sb) {
      loginMessage.textContent = "No se pudo conectar con la base. Recargá la página.";
      return;
    }

    setLoading(true);
    try {
      const token = await hashClave(clave);
      const { data, error } = await sb.rpc("perfiles_admin_listar", { p_token: token });
      if (error) {
        loginMessage.textContent = error.code === "42501"
          ? "Contraseña incorrecta."
          : "No se pudieron cargar los datos.";
        return;
      }
      registros = Array.isArray(data) ? data : [];
      claveInput.value = "";
      loginView.hidden = true;
      dashboardView.hidden = false;
      renderStats();
      renderRows();
    } catch (error) {
      console.error(error);
      loginMessage.textContent = "No se pudieron cargar los datos.";
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

  [searchInput, categoryFilter, genderFilter].forEach((el) => {
    el.addEventListener(el.tagName === "INPUT" ? "input" : "change", renderRows);
  });

  $("clearFiltersBtn").addEventListener("click", () => {
    searchInput.value = "";
    categoryFilter.value = "";
    genderFilter.value = "";
    renderRows();
  });

  $("logoutBtn").addEventListener("click", () => {
    registros = [];
    dashboardView.hidden = true;
    loginView.hidden = false;
    loginMessage.textContent = "";
    claveInput.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => claveInput.focus(), 150);
  });

  const share = new URLSearchParams(location.search).get("_vercel_share");
  if (share) {
    document.querySelector(".back-button").href =
      "/perfiles?_vercel_share=" + encodeURIComponent(share);
  }

  claveInput.focus();
})();
