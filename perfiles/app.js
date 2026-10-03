(() => {
  const femaleNames = new Set([
    "abril","agostina","agustina","aldana","alejandra","alexia","alma","amanda","amelia","ana","andrea","angela","antonella","ayelen","barbara","belen","bianca","brenda","camila","candela","carla","carolina","catalina","celeste","chiara","clara","daiana","dai","daniela","delfina","elena","eliana","elisa","emilia","erica","estefania","eugenia","eva","florencia","francesca","gabriela","guadalupe","hannah","irina","isabella","isidora","jazmin","jimena","josefina","julia","juliana","julieta","lara","laura","leila","lola","lucia","luciana","lucrecia","lula","luz","magali","malena","maria","mariana","martina","melina","melisa","micaela","milagros","morena","natalia","nicole","noelia","olivia","paula","pilar","priscila","rebeca","renata","rocio","romina","sabrina","samanta","sara","sofia","sol","tamara","tatiana","valentina","valeria","victoria","violeta","zoe"
  ]);

  const maleNames = new Set([
    "aaron","agustin","alejandro","alex","bautista","benicio","benjamin","bruno","camilo","cristian","daniel","dante","david","diego","eitan","elias","emanuel","emiliano","enzo","ezequiel","facundo","federico","felipe","franco","gabriel","gaspar","gonzalo","ian","ignacio","isaac","ivan","joaquin","joel","jonatan","jonathan","jose","juan","lautaro","leon","leonel","lorenzo","lucas","luciano","manuel","marcos","martin","mateo","matias","maximo","nahuel","nicolas","noah","pablo","ramiro","rodrigo","santiago","santino","tadeo","thiago","tomas","valentin"
  ]);

  const femaleExceptions = new Set(["sol","luz","belen","jazmin","ruth","noa"]);
  const maleExceptions = new Set(["luca","elias","tobias","matias","jeremias","josue","noe","andrea"]);

  const $ = (id) => document.getElementById(id);
  const share = new URLSearchParams(location.search).get("_vercel_share");
  const qrLink = document.querySelector('a[href="/perfiles/qr"]');
  if (share && qrLink) qrLink.href = "/perfiles/qr?_vercel_share=" + encodeURIComponent(share);
  const form = $("profileForm");
  const nombre = $("nombre");
  const apellido = $("apellido");
  const fecha = $("fechaNacimiento");
  const instagram = $("instagram");
  const telefono = $("telefono");
  const message = $("message");
  const submitBtn = $("submitBtn");
  const submitText = $("submitText");
  const spinner = $("spinner");

  let deferredInstallPrompt = null;
  let genderWasManuallyChanged = false;

  const stripAccents = (value) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const toPascalWords = (value) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("es-AR")
      .replace(/(^|[\s'’-])([\p{L}])/gu, (_, sep, letter) => sep + letter.toLocaleUpperCase("es-AR"));

  const getAge = (dateString) => {
    if (!dateString) return null;
    const dob = new Date(dateString + "T12:00:00");
    if (Number.isNaN(dob.getTime())) return null;
    const now = new Date();
    if (dob > now) return null;
    let age = now.getFullYear() - dob.getFullYear();
    const beforeBirthday =
      now.getMonth() < dob.getMonth() ||
      (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
    if (beforeBirthday) age--;
    return age;
  };

  const detectGender = (value) => {
    const first = stripAccents(value.trim().split(/\s+/)[0] || "");
    if (!first) return null;
    if (femaleExceptions.has(first)) return "Mujer";
    if (maleExceptions.has(first)) return "Varón";
    if (femaleNames.has(first)) return "Mujer";
    if (maleNames.has(first)) return "Varón";
    if (/(a|ia|ina|ela|isa|ita|ena|ana)$/.test(first)) return "Mujer";
    return "Varón";
  };

  const setGender = (gender, automatic = true) => {
    if (!gender) return;
    const input = form.querySelector('input[name="genero"][value="' + gender + '"]');
    if (input) input.checked = true;
    $("genderHint").textContent = automatic
      ? "Sugerencia por nombre: " + gender
      : "Elegiste: " + gender;
    $("genderBadge").hidden = !automatic;
  };

  const updateAge = () => {
    const age = getAge(fecha.value);
    if (age === null || age < 0) {
      $("edadPreview").textContent = "—";
      $("categoriaPreview").textContent = "—";
      return;
    }
    $("edadPreview").textContent = age + " años";
    $("categoriaPreview").textContent = age < 18 ? "Adolescente" : "Joven";
  };

  nombre.addEventListener("input", () => {
    if (!genderWasManuallyChanged) {
      const gender = detectGender(nombre.value);
      if (gender) setGender(gender, true);
    }
  });

  nombre.addEventListener("blur", () => {
    nombre.value = toPascalWords(nombre.value);
  });

  apellido.addEventListener("blur", () => {
    apellido.value = toPascalWords(apellido.value);
  });

  fecha.addEventListener("change", updateAge);
  fecha.max = new Date().toISOString().slice(0, 10);

  form.querySelectorAll('input[name="genero"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      genderWasManuallyChanged = true;
      setGender(radio.value, false);
    });
  });

  const setLoading = (loading) => {
    submitBtn.disabled = loading;
    submitText.textContent = loading ? "Guardando..." : "Crear mi perfil";
    spinner.hidden = !loading;
  };

  const showError = (text) => {
    message.className = "message";
    message.textContent = text;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    if ($("website").value) {
      form.reset();
      return;
    }

    nombre.value = toPascalWords(nombre.value);
    apellido.value = toPascalWords(apellido.value);

    const age = getAge(fecha.value);
    const genero = form.querySelector('input[name="genero"]:checked')?.value;
    const consentimiento = $("consentimiento").checked;

    if (!nombre.value || nombre.value.length < 2) return showError("Revisá el nombre.");
    if (!apellido.value || apellido.value.length < 2) return showError("Revisá el apellido.");
    if (age === null) return showError("Revisá la fecha de nacimiento.");
    if (!telefono.value.trim() || telefono.value.replace(/\D/g, "").length < 6) return showError("Revisá el número de teléfono.");
    if (!genero) return showError("Elegí Mujer o Varón.");
    if (!consentimiento) return showError("Necesitamos tu autorización para guardar los datos.");

    const client = window.TNT?.sb;
    if (!client) return showError("No se pudo conectar con la base. Recargá la página e intentá de nuevo.");

    setLoading(true);

    try {
      const { error } = await client.rpc("tnt_create_public_profile", {
        p_first_name: nombre.value,
        p_last_name: apellido.value,
        p_birthday: fecha.value,
        p_instagram: instagram.value.trim() || null,
        p_phone: telefono.value.trim(),
        p_gender: genero,
        p_consent: true
      });
      if (error) throw error;

      $("successName").textContent = nombre.value;
      $("successCategory").textContent = age < 18 ? "Adolescente" : "Joven";
      $("successAge").textContent = age + " años";
      $("formCard").hidden = true;
      $("successCard").hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Perfiles insert error:", error);
      showError(error.message || "No pudimos guardar el perfil. Revisá los datos e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  });

  $("anotherBtn").addEventListener("click", () => {
    form.reset();
    genderWasManuallyChanged = false;
    $("edadPreview").textContent = "—";
    $("categoriaPreview").textContent = "—";
    $("genderHint").textContent = "Escribí tu nombre y te sugerimos una opción.";
    $("genderBadge").hidden = true;
    $("successCard").hidden = true;
    $("formCard").hidden = false;
    showError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $("installBtn").hidden = false;
  });

  $("installBtn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $("installBtn").hidden = true;
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const previous = await navigator.serviceWorker.getRegistration("/perfiles/");
        if (previous?.active && new URL(previous.active.scriptURL).pathname === "/perfiles/sw.js") await previous.unregister();
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {}
    });
  }
})();
