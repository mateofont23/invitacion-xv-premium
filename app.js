(() => {
  const config = window.XV_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const APPS_SCRIPT_URL = String(config.appsScriptUrl || "").trim();

  const params = new URLSearchParams(window.location.search);
  const invitedName = (params.get("invitado") || "").trim();
  const celebrant = config.celebrant || "Laura Sofía Andrade Ramírez";

  $("#celebrant-name").textContent = celebrant;
  $("#final-name").textContent = celebrant;
  $("#date-title").textContent = config.dateDisplay || "Fecha por confirmar";
  $("#event-time").textContent = config.timeDisplay || "Hora por confirmar";
  $("#venue-name").textContent = config.venue || "Lugar por confirmar";
  $("#venue-address").textContent = config.address || "";
  $("#event-venue").textContent = config.venue || "Lugar por confirmar";
  $("#event-city").textContent = config.address || "Ciudad por confirmar";

  const mapsLink = $("#maps-link");
  if (config.mapsUrl) {
    mapsLink.href = config.mapsUrl;
    mapsLink.textContent = "Ver ubicación";
    mapsLink.target = "_blank";
    mapsLink.rel = "noopener noreferrer";
    mapsLink.removeAttribute("aria-disabled");
    mapsLink.removeAttribute("tabindex");
  }

  if (invitedName) {
    $("#personal-greeting").textContent = `${invitedName}, me encantará compartir contigo esta noche tan especial.`;
    $("#guest-name").value = invitedName;
  }

  const companions = $("#companions");
  const maxCompanions = Math.min(7, Math.max(0, Number(config.maxCompanions) || 7));
  for (const option of [...companions.options]) {
    option.disabled = Number(option.value) > maxCompanions;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });
  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

  $("#open-invite").addEventListener("click", () => {
    $("#celebracion").scrollIntoView({ behavior: "smooth" });
  });

  const date = new Date(config.dateISO || "2026-12-19T20:00:00-05:00");
  const pad = (value) => String(Math.max(0, value)).padStart(2, "0");
  const renderCountdown = () => {
    const diff = Math.max(0, date.getTime() - Date.now());
    const totalSeconds = Math.floor(diff / 1000);
    $("#cd-days").textContent = pad(Math.floor(totalSeconds / 86400));
    $("#cd-hours").textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
    $("#cd-minutes").textContent = pad(Math.floor((totalSeconds % 3600) / 60));
    $("#cd-seconds").textContent = pad(totalSeconds % 60);
  };
  renderCountdown();
  setInterval(renderCountdown, 1000);

  const postPayload = async (payload) => {
    const isRSVP = payload.type === "rsvp";
    if (isRSVP) console.log("[RSVP] Sending payload:", payload);

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow"
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (error) {
      if (isRSVP) console.log("[RSVP] Backend response:", responseText);
      throw new Error(`Respuesta JSON inválida del backend (HTTP ${response.status}): ${responseText || "sin contenido"}`, { cause: error });
    }

    if (isRSVP) console.log("[RSVP] Backend response:", result);
    if (isRSVP && result.duplicate === true) return result;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${result.message || result.error || "La solicitud no pudo completarse."}`);
    }
    if (result.ok === false || (isRSVP && result.ok !== true)) {
      throw new Error(result.message || result.error || "El backend no confirmó el registro.");
    }
    return result;
  };

  const createRequestId = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
      const value = Math.floor(Math.random() * 16);
      return (character === "x" ? value : (value & 0x3) | 0x8).toString(16);
    });
  };

  const submitRSVP = async (payload) => {
    if (!APPS_SCRIPT_URL) {
      console.info("RSVP válido en modo demo; falta conectar el endpoint.", payload);
      return { demo: true };
    }
    return { ...(await postPayload(payload)), demo: false };
  };

  const form = $("#rsvp-form");
  const status = $("#form-status");
  const nameInput = form.elements.namedItem("nombre");
  const surnameInput = form.elements.namedItem("apellido");
  const phoneInput = form.elements.namedItem("telefono");
  const attendanceInputs = [...form.querySelectorAll('input[name="asiste"]')];
  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton.textContent;
  let isSubmitting = false;
  let pendingPayload = null;
  let pendingPayloadKey = "";

  const buildPayload = () => {
    const formData = new FormData(form);
    const nombre = String(formData.get("nombre") || "").trim();
    const apellido = String(formData.get("apellido") || "").trim();
    const telefono = String(formData.get("telefono") || "").trim();
    const asiste = String(formData.get("asiste") || "");
    const observaciones = String(formData.get("observaciones") || "").trim();
    const digits = telefono.replace(/\D/g, "");
    const nationalPhone = digits.length === 12 && digits.startsWith("57") ? digits.slice(2) : digits;
    const validColombianPhone = /^3\d{9}$/.test(nationalPhone) || /^[1-8]\d{6,9}$/.test(nationalPhone);
    const acompanantes = Number(companions.value);

    nameInput.setCustomValidity(nombre ? "" : "Escribe tu nombre.");
    surnameInput.setCustomValidity(apellido ? "" : "Escribe tu apellido.");
    phoneInput.setCustomValidity(validColombianPhone ? "" : "Ingresa un teléfono colombiano válido.");
    attendanceInputs[0].setCustomValidity(["si", "no"].includes(asiste) ? "" : "Selecciona si asistirás.");
    companions.setCustomValidity(Number.isInteger(acompanantes) && acompanantes >= 0 && acompanantes <= 7
      ? ""
      : "Elige entre 0 y 7 acompañantes.");

    if (!form.reportValidity()) return null;

    nameInput.value = nombre;
    surnameInput.value = apellido;
    phoneInput.value = telefono;

    return {
      type: "rsvp",
      nombre,
      apellido,
      telefono,
      asiste,
      acompanantes: asiste === "no" ? 0 : acompanantes,
      observaciones
    };
  };

  form.addEventListener("input", (event) => event.target.setCustomValidity(""));
  form.addEventListener("change", (event) => {
    if (event.target.name !== "asiste") return;
    const attending = event.target.value === "si";
    $("#companions-field").style.opacity = attending ? "1" : ".45";
    companions.disabled = !attending;
    if (!attending) companions.value = "0";
    companions.setCustomValidity("");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    const payload = buildPayload();
    if (!payload) {
      status.textContent = "Revisa los campos señalados antes de continuar.";
      return;
    }

    const payloadKey = JSON.stringify(payload);
    if (!pendingPayload || pendingPayloadKey !== payloadKey) {
      pendingPayload = {
        ...payload,
        requestId: createRequestId(),
        submittedAt: new Date().toISOString()
      };
      pendingPayloadKey = payloadKey;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Enviando…";
    status.textContent = "Enviando tu confirmación…";
    try {
      const result = await submitRSVP(pendingPayload);
      form.reset();
      companions.disabled = false;
      $("#companions-field").style.opacity = "1";
      pendingPayload = null;
      pendingPayloadKey = "";
      status.textContent = result.message || "¡Gracias! Tu confirmación ha sido registrada.";
    } catch (error) {
      console.error("[RSVP] Submission error:", error);
      status.textContent = "No pudimos registrar tu confirmación. Inténtalo nuevamente.";
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
    }
  });

  form.addEventListener("reset", () => {
    companions.disabled = false;
    $("#companions-field").style.opacity = "1";
    nameInput.setCustomValidity("");
    surnameInput.setCustomValidity("");
    phoneInput.setCustomValidity("");
    attendanceInputs[0].setCustomValidity("");
    companions.setCustomValidity("");
  });

  const memoryForm = $("#memory-form");
  const memoryStatus = $("#memory-status");
  const memoryMessage = memoryForm.elements.namedItem("recuerdo_mensaje");
  const photoInput = memoryForm.elements.namedItem("recuerdo_foto");
  const videoInput = memoryForm.elements.namedItem("recuerdo_video");
  const memorySubmit = memoryForm.querySelector('button[type="submit"]');
  const photoName = $("#photo-file-name");
  const videoName = $("#video-file-name");
  const removePhoto = $("#remove-photo");
  const removeVideo = $("#remove-video");
  const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
  const photoLimit = 5 * 1024 * 1024;
  const videoLimit = 15 * 1024 * 1024;
  let pendingMemoryDraft = null;
  let memorySubmitting = false;

  const selectedFile = (input) => input.files && input.files[0] ? input.files[0] : null;
  const updateMemoryFileName = (input, output, removeButton) => {
    const file = selectedFile(input);
    output.textContent = file ? file.name : "";
    output.hidden = !file;
    removeButton.hidden = !file;
  };

  const clearPendingMemory = () => {
    if (!memorySubmitting) pendingMemoryDraft = null;
  };

  const validateMemoryFile = (file, kind) => {
    if (!file) return "";
    const allowedTypes = kind === "photo" ? allowedPhotoTypes : allowedVideoTypes;
    const limit = kind === "photo" ? photoLimit : videoLimit;
    if (!allowedTypes.has(file.type.toLowerCase())) {
      return kind === "photo"
        ? "Elige una foto JPG, PNG, WebP, HEIC o HEIF."
        : "Elige un video MP4, WebM o MOV.";
    }
    if (file.size > limit) {
      return kind === "photo" ? "La foto debe pesar máximo 5 MB." : "El video debe pesar máximo 15 MB.";
    }
    return "";
  };

  const fileToPayload = (file) => new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No fue posible leer uno de los archivos."));
    reader.readAsDataURL(file);
  });

  memoryForm.addEventListener("input", clearPendingMemory);
  memoryForm.addEventListener("change", (event) => {
    clearPendingMemory();
    if (event.target === photoInput) updateMemoryFileName(photoInput, photoName, removePhoto);
    if (event.target === videoInput) updateMemoryFileName(videoInput, videoName, removeVideo);
  });

  removePhoto.addEventListener("click", () => {
    photoInput.value = "";
    updateMemoryFileName(photoInput, photoName, removePhoto);
    clearPendingMemory();
    memoryStatus.textContent = "";
  });

  removeVideo.addEventListener("click", () => {
    videoInput.value = "";
    updateMemoryFileName(videoInput, videoName, removeVideo);
    clearPendingMemory();
    memoryStatus.textContent = "";
  });

  memoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (memorySubmitting) return;

    const message = String(memoryMessage.value || "").trim();
    const photoFile = selectedFile(photoInput);
    const videoFile = selectedFile(videoInput);
    if (message.length > 3000) {
      memoryStatus.textContent = "El mensaje puede tener máximo 3000 caracteres.";
      return;
    }
    if (!message && !photoFile && !videoFile) {
      memoryStatus.textContent = "Comparte un mensaje, una foto o un video antes de enviar.";
      return;
    }

    const photoError = validateMemoryFile(photoFile, "photo");
    const videoError = validateMemoryFile(videoFile, "video");
    if (photoError || videoError) {
      memoryStatus.textContent = photoError || videoError;
      return;
    }

    if (!APPS_SCRIPT_URL) {
      memoryStatus.textContent = "No pudimos guardar tu recuerdo. Inténtalo nuevamente.";
      console.error("[MEMORY] Submission error:", new Error("appsScriptUrl no está configurado."));
      return;
    }

    if (!pendingMemoryDraft
      || pendingMemoryDraft.message !== message
      || pendingMemoryDraft.photoFile !== photoFile
      || pendingMemoryDraft.videoFile !== videoFile) {
      pendingMemoryDraft = {
        requestId: createRequestId(),
        submittedAt: new Date().toISOString(),
        message,
        photoFile,
        videoFile
      };
    }

    memorySubmitting = true;
    memorySubmit.disabled = true;
    memoryStatus.textContent = "Preparando tu recuerdo…";
    try {
      const photoBase64 = await fileToPayload(pendingMemoryDraft.photoFile);
      const videoBase64 = await fileToPayload(pendingMemoryDraft.videoFile);
      const payload = {
        type: "memory",
        requestId: pendingMemoryDraft.requestId,
        submittedAt: pendingMemoryDraft.submittedAt,
        nombre: "Anónimo",
        mensaje: pendingMemoryDraft.message,
        photo: pendingMemoryDraft.photoFile
          ? {
              name: pendingMemoryDraft.photoFile.name,
              mimeType: pendingMemoryDraft.photoFile.type,
              base64: photoBase64
            }
          : null,
        video: pendingMemoryDraft.videoFile
          ? {
              name: pendingMemoryDraft.videoFile.name,
              mimeType: pendingMemoryDraft.videoFile.type,
              base64: videoBase64
            }
          : null
      };

      console.log("[MEMORY] payload:", {
        type: payload.type,
        requestId: payload.requestId,
        nombre: payload.nombre,
        mensajeLength: payload.mensaje?.length || 0,
        photo: payload.photo ? {
          name: payload.photo.name,
          mimeType: payload.photo.mimeType,
          base64Length: payload.photo.base64?.length
        } : null,
        video: payload.video ? {
          name: payload.video.name,
          mimeType: payload.video.mimeType,
          base64Length: payload.video.base64?.length
        } : null
      });

      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow"
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Respuesta JSON inválida del backend (HTTP ${response.status}): ${responseText || "sin contenido"}`);
      }
      console.log("[MEMORY] Backend response:", result);
      if (!response.ok || result.ok !== true) {
        throw new Error(result.message || result.error || `El backend no confirmó el recuerdo (HTTP ${response.status}).`);
      }

      memoryForm.reset();
      updateMemoryFileName(photoInput, photoName, removePhoto);
      updateMemoryFileName(videoInput, videoName, removeVideo);
      pendingMemoryDraft = null;
      memoryStatus.textContent = "¡Gracias! Tu recuerdo ha sido guardado.";
    } catch (error) {
      console.error("[MEMORY] Submission error:", error);
      memoryStatus.textContent = "No pudimos guardar tu recuerdo. Inténtalo nuevamente.";
    } finally {
      memorySubmitting = false;
      memorySubmit.disabled = false;
    }
  });

  memoryForm.addEventListener("reset", () => {
    pendingMemoryDraft = null;
    updateMemoryFileName(photoInput, photoName, removePhoto);
    updateMemoryFileName(videoInput, videoName, removeVideo);
  });
})();
