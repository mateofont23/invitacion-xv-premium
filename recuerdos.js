(() => {
  const $ = (selector) => document.querySelector(selector);
  const config = window.XV_CONFIG || {};
  const endpoint = String(config.appsScriptUrl || "").trim();
  const sessionKey = "xvMemoryAccess";
  const screens = ["#access-screen", "#intro-screen", "#empty-screen", "#error-screen", "#viewer-screen"];
  const accessForm = $("#access-form");
  const accessTokenInput = $("#access-token");
  const accessSubmit = $("#access-submit");
  const accessStatus = $("#access-status");
  const errorTitle = $("#error-title");
  const sceneContent = $("#scene-content");
  const sceneCount = $("#scene-count");
  const introCount = $("#intro-count");
  const progressFill = $("#progress-fill");
  const announcer = $("#viewer-announcer");
  const music = $("#memory-music");

  const durations = { message: 8000, photo: 7000, photoMessage: 9000, photoVideo: 5600 };
  const finalMessage = "Laura Sofía,\n\nque estos recuerdos te acompañen siempre\ny te recuerden cuánto cariño hay a tu alrededor.\n\nQue esta nueva etapa esté llena de sueños,\nalegría y momentos que valga la pena\nguardar para siempre.\n\nFelices XV.";
  let memories = [];
  let currentIndex = 0;
  let currentBeat = "main";
  let isFinalScene = false;
  let isPlaying = false;
  let currentVideo = null;
  let currentVideoCleanup = null;
  let currentFrame = null;
  let progressTimer = null;
  let progressFrame = null;
  let progressStarted = 0;
  let progressDuration = 0;
  let progressElapsed = 0;
  let progressCallback = null;
  let progressPaused = false;
  let idleTimer = null;
  let touchStartX = null;
  let touchStartY = null;
  let audioAttempted = false;
  let audioMuted = false;
  let audioFadeFrame = null;
  let audioTargetVolume = 0.22;
  let selectedPhotoPreload = null;

  class AccessDeniedError extends Error {}
  class FeedError extends Error {}

  function showScreen(selector) {
    screens.forEach((screen) => {
      $(screen).hidden = screen !== selector;
    });
    document.body.classList.toggle("viewer-open", selector === "#viewer-screen");
  }

  function safeMediaUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      return url.href;
    } catch {
      return "";
    }
  }

  async function requestGallery(token) {
    if (!endpoint) throw new FeedError("gallery endpoint unavailable");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let response;
    let responseText;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        redirect: "follow",
        body: JSON.stringify({ type: "gallery", action: "list", token }),
        signal: controller.signal
      });
      responseText = await response.text();
    } catch (error) {
      throw new FeedError(error && error.name === "AbortError" ? "gallery request timeout" : "gallery request failed");
    } finally {
      window.clearTimeout(timeout);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new FeedError("gallery response was not valid JSON");
    }

    const message = String(result && result.message || "");
    if (result && result.ok === false && /acceso no autorizado|unauthorized|invalid token/i.test(message)) {
      throw new AccessDeniedError("access denied");
    }
    if (!response.ok || !result || result.ok !== true || !Array.isArray(result.memories)) {
      throw new FeedError("gallery request failed");
    }
    return result.memories;
  }

  function showIntro() {
    introCount.textContent = `${memories.length} ${memories.length === 1 ? "recuerdo" : "recuerdos"}`;
    if (memories.length === 0) showScreen("#empty-screen");
    else showScreen("#intro-screen");
  }

  async function loadAccess(token, source) {
    accessSubmit.disabled = true;
    accessSubmit.textContent = "Comprobando…";
    accessStatus.textContent = source === "session" ? "Abriendo tus recuerdos…" : "";
    try {
      const feed = await requestGallery(token);
      memories = feed;
      sessionStorage.setItem(sessionKey, token);
      currentIndex = 0;
      currentBeat = "main";
      accessTokenInput.value = "";
      accessStatus.textContent = "";
      console.log("[MEMORIES] feed loaded:", memories.length);
      showIntro();
    } catch (error) {
      if (error instanceof AccessDeniedError) {
        sessionStorage.removeItem(sessionKey);
        accessTokenInput.value = "";
        showScreen("#access-screen");
        accessStatus.textContent = "Clave incorrecta. Inténtalo nuevamente.";
      } else {
        errorTitle.textContent = "No pudimos cargar los recuerdos en este momento.";
        showScreen("#error-screen");
      }
    } finally {
      accessSubmit.disabled = false;
      accessSubmit.textContent = "Entrar";
    }
  }

  accessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const token = accessTokenInput.value.trim();
    if (!token) {
      accessStatus.textContent = "Escribe la clave de acceso.";
      accessTokenInput.focus();
      return;
    }
    loadAccess(token, "form");
  });

  $("#token-toggle").addEventListener("click", (event) => {
    const button = event.currentTarget;
    const reveal = accessTokenInput.type === "password";
    accessTokenInput.type = reveal ? "text" : "password";
    button.setAttribute("aria-pressed", String(reveal));
    button.setAttribute("aria-label", reveal ? "Ocultar clave" : "Mostrar clave");
    button.title = reveal ? "Ocultar clave" : "Mostrar clave";
    accessTokenInput.focus();
  });

  $("#retry-access").addEventListener("click", () => {
    let sessionToken = "";
    try { sessionToken = sessionStorage.getItem(sessionKey) || ""; } catch { sessionToken = ""; }
    const token = accessTokenInput.value.trim() || sessionToken;
    if (token) loadAccess(token, "retry");
    else {
      showScreen("#access-screen");
      accessStatus.textContent = "Escribe la clave de acceso para continuar.";
      accessTokenInput.focus();
    }
  });

  $("#logout-intro").addEventListener("click", logout);
  $("#logout-viewer").addEventListener("click", logout);
  $("#empty-back").addEventListener("click", () => showScreen("#intro-screen"));
  $("#start-experience").addEventListener("click", startExperience);
  $("#close-viewer").addEventListener("click", closeViewer);
  $("#previous-memory").addEventListener("click", previousMemory);
  $("#next-memory").addEventListener("click", nextMemory);
  $("#toggle-play").addEventListener("click", togglePlayback);
  $("#toggle-mute").addEventListener("click", toggleMute);
  $("#toggle-fullscreen").addEventListener("click", toggleFullscreen);

  function driveFileId(value) {
    const url = safeMediaUrl(value);
    if (!url) return "";
    try {
      const parsed = new URL(url);
      if (!/(^|\.)drive\.google\.com$/i.test(parsed.hostname)) return "";
      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
      return parsed.searchParams.get("id") || (pathMatch ? pathMatch[1] : "");
    } catch {
      return "";
    }
  }

  function photoSources(memory) {
    const sources = [];
    const add = (value, method) => {
      const url = safeMediaUrl(value);
      if (url && !sources.some((source) => source.url === url)) sources.push({ url, method });
    };
    add(memory.photoThumbnailUrl, "photoThumbnailUrl");
    add(memory.photoUrl, "photoUrl");
    const fileId = driveFileId(memory.photoThumbnailUrl) || driveFileId(memory.photoUrl);
    if (fileId) add(`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`, "derived Drive thumbnail");
    return sources;
  }

  function mediaFlags(memory) {
    const photos = photoSources(memory);
    const videoUrl = safeMediaUrl(memory.videoUrl);
    const previewUrl = safeMediaUrl(memory.videoPreviewUrl);
    return {
      photos,
      videoUrl,
      previewUrl,
      hasPhoto: Boolean(memory.hasPhoto || photos.length),
      hasVideo: Boolean(memory.hasVideo || videoUrl || previewUrl),
      message: typeof memory.message === "string" ? memory.message.trim() : ""
    };
  }

  function clearProgress() {
    if (progressTimer !== null) window.clearTimeout(progressTimer);
    if (progressFrame !== null) window.cancelAnimationFrame(progressFrame);
    progressTimer = null;
    progressFrame = null;
    progressStarted = 0;
    progressDuration = 0;
    progressElapsed = 0;
    progressCallback = null;
    progressPaused = false;
    progressFill.style.transition = "none";
    progressFill.style.width = "0%";
  }

  function clearSceneResources() {
    clearProgress();
    discardCurrentVideo();
    if (currentFrame) {
      currentFrame.src = "about:blank";
      currentFrame.remove();
      currentFrame = null;
    }
    if (selectedPhotoPreload) {
      selectedPhotoPreload.src = "";
      selectedPhotoPreload = null;
    }
    sceneContent.replaceChildren();
  }

  function scheduleProgress(remaining) {
    if (!isPlaying || !progressCallback || remaining <= 0) return;
    progressStarted = performance.now();
    progressTimer = window.setTimeout(() => {
      progressTimer = null;
      if (!isPlaying) return;
      const callback = progressCallback;
      clearProgress();
      callback();
    }, remaining);

    const ratio = progressDuration > 0 ? progressElapsed / progressDuration : 0;
    progressFill.style.transition = "none";
    progressFill.style.width = `${Math.min(100, ratio * 100)}%`;
    progressFrame = window.requestAnimationFrame(() => {
      progressFrame = null;
      progressFill.style.transition = `width ${remaining}ms linear`;
      progressFill.style.width = "100%";
    });
  }

  function startProgress(duration, callback, elapsed = 0) {
    clearProgress();
    progressDuration = duration;
    progressElapsed = elapsed;
    progressCallback = callback;
    progressPaused = false;
    scheduleProgress(Math.max(0, duration - elapsed));
  }

  function pauseProgress() {
    if (progressTimer === null || progressPaused) return;
    progressElapsed = Math.min(progressDuration, progressElapsed + performance.now() - progressStarted);
    window.clearTimeout(progressTimer);
    progressTimer = null;
    if (progressFrame !== null) window.cancelAnimationFrame(progressFrame);
    progressFrame = null;
    progressPaused = true;
    progressFill.style.transition = "none";
    progressFill.style.width = `${Math.min(100, progressElapsed / progressDuration * 100)}%`;
  }

  function resumeProgress() {
    if (!progressCallback || !progressPaused) return;
    progressPaused = false;
    scheduleProgress(Math.max(0, progressDuration - progressElapsed));
  }

  function updatePlayControl() {
    $("#play-icon").textContent = isPlaying ? "Ⅱ" : "▶";
    $("#toggle-play").setAttribute("aria-label", isPlaying ? "Pausar presentación" : "Reanudar presentación");
    $("#toggle-play").title = isPlaying ? "Pausar" : "Reanudar";
  }

  function startExperience() {
    if (!memories.length) {
      showScreen("#empty-screen");
      return;
    }
    currentIndex = 0;
    currentBeat = "main";
    isFinalScene = false;
    $("#viewer-screen").classList.remove("is-final-scene");
    $("#toggle-play").disabled = false;
    $("#next-memory").disabled = false;
    isPlaying = true;
    updatePlayControl();
    showScreen("#viewer-screen");
    startMusic();
    renderCurrentMemory(true);
    activateControls();
  }

  function closeViewer() {
    isPlaying = false;
    isFinalScene = false;
    clearSceneResources();
    pauseMusic();
    $("#viewer-screen").classList.remove("is-final-scene");
    $("#toggle-play").disabled = false;
    $("#next-memory").disabled = false;
    updatePlayControl();
    showIntro();
  }

  function logout() {
    isPlaying = false;
    clearSceneResources();
    stopMusic();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    try { sessionStorage.removeItem(sessionKey); } catch { /* session storage can be unavailable */ }
    memories = [];
    currentIndex = 0;
    currentBeat = "main";
    isFinalScene = false;
    accessTokenInput.value = "";
    accessStatus.textContent = "";
    introCount.textContent = "";
    showScreen("#access-screen");
  }

  function previousMemory() {
    if (!memories.length) return;
    if (isFinalScene) {
      isFinalScene = false;
      currentIndex = memories.length - 1;
      currentBeat = "main";
      isPlaying = true;
      updatePlayControl();
      renderCurrentMemory(true);
      activateControls();
      return;
    }
    const wasPlaying = isPlaying;
    currentIndex = (currentIndex - 1 + memories.length) % memories.length;
    currentBeat = "main";
    renderCurrentMemory(wasPlaying);
    activateControls();
  }

  function nextMemory() {
    if (!memories.length || isFinalScene) return;
    if (currentIndex === memories.length - 1) {
      enterFinalScene();
      return;
    }
    const wasPlaying = isPlaying;
    currentIndex = (currentIndex + 1) % memories.length;
    currentBeat = "main";
    renderCurrentMemory(wasPlaying);
    activateControls();
  }

  function enterFinalScene() {
    isPlaying = false;
    isFinalScene = true;
    clearSceneResources();
    updatePlayControl();
    renderFinalScene();
    activateControls();
  }

  function renderFinalScene() {
    sceneContent.className = "scene-content scene-content--final";
    sceneCount.textContent = "Final";
    announcer.textContent = "Mensaje final para Laura Sofía";
    $("#viewer-screen").classList.add("is-final-scene");
    $("#toggle-play").disabled = true;
    $("#next-memory").disabled = true;

    const scene = document.createElement("article");
    scene.className = "memory-scene final-memory-scene";
    const mark = document.createElement("p");
    mark.className = "final-memory-mark";
    mark.textContent = "XV";
    const heading = document.createElement("h1");
    heading.className = "final-memory-heading";
    heading.textContent = "Para Laura Sofía";
    const message = document.createElement("p");
    message.className = "final-memory-message";
    message.textContent = finalMessage;
    const actions = document.createElement("div");
    actions.className = "final-memory-actions";
    const replay = document.createElement("button");
    replay.className = "primary-button";
    replay.type = "button";
    replay.textContent = "Volver a ver";
    replay.addEventListener("click", () => {
      isFinalScene = false;
      currentIndex = 0;
      currentBeat = "main";
      isPlaying = true;
      updatePlayControl();
      startMusic();
      renderCurrentMemory(true);
      activateControls();
    });
    const finish = document.createElement("button");
    finish.className = "text-button final-memory-finish";
    finish.type = "button";
    finish.textContent = "Finalizar";
    finish.addEventListener("click", closeViewer);
    actions.append(replay, finish);
    scene.append(mark, heading, message, actions);
    sceneContent.replaceChildren(scene);
  }

  function togglePlayback() {
    if (isPlaying) {
      isPlaying = false;
      pauseProgress();
      if (currentVideo && !currentVideo.paused) currentVideo.pause();
    } else {
      isPlaying = true;
      if (currentVideo) {
        if (currentVideo.ended) nextMemory();
        else playNativeVideo(currentVideo, sceneContent.querySelector(".video-play-overlay"));
      } else resumeProgress();
    }
    updatePlayControl();
    activateControls();
  }

  function toggleFullscreen() {
    const target = $("#viewer-screen");
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
      return;
    }
    target.requestFullscreen?.().catch(() => {});
  }

  function updateFullscreenControl() {
    const active = Boolean(document.fullscreenElement);
    $("#toggle-fullscreen").setAttribute("aria-label", active ? "Salir de pantalla completa" : "Activar pantalla completa");
    $("#toggle-fullscreen").title = active ? "Salir de pantalla completa" : "Pantalla completa";
  }
  document.addEventListener("fullscreenchange", updateFullscreenControl);

  function startMusic() {
    if (audioAttempted) {
      if (music.paused && !audioMuted) music.play().catch(() => {});
      return;
    }
    audioAttempted = true;
    music.volume = 0;
    music.loop = true;
    music.play().then(() => fadeMusic(audioMuted ? 0 : audioTargetVolume, 1800)).catch(() => {});
  }

  function fadeMusic(target, duration = 900) {
    if (!music || music.paused || audioMuted) return;
    if (audioFadeFrame !== null) window.cancelAnimationFrame(audioFadeFrame);
    const initial = music.volume;
    const started = performance.now();
    const step = (now) => {
      const ratio = Math.min(1, (now - started) / duration);
      music.volume = Math.max(0, Math.min(1, initial + (target - initial) * ratio));
      if (ratio < 1) audioFadeFrame = window.requestAnimationFrame(step);
      else audioFadeFrame = null;
    };
    audioFadeFrame = window.requestAnimationFrame(step);
  }

  function pauseMusic() {
    if (audioFadeFrame !== null) window.cancelAnimationFrame(audioFadeFrame);
    audioFadeFrame = null;
    music.pause();
    music.currentTime = 0;
    audioAttempted = false;
  }

  function stopMusic() {
    pauseMusic();
    music.volume = 0;
    audioMuted = false;
    updateMuteControl();
  }

  function lowerMusicForVideo() {
    if (music.paused || audioMuted) return;
    fadeMusic(.045, 500);
  }

  function restoreMusicAfterVideo() {
    if (music.paused || audioMuted) return;
    fadeMusic(audioTargetVolume, 850);
  }

  function toggleMute() {
    audioMuted = !audioMuted;
    if (audioMuted) {
      music.muted = true;
    } else {
      music.muted = false;
      if (isPlaying) startMusic();
    }
    updateMuteControl();
    activateControls();
  }

  function updateMuteControl() {
    $("#mute-icon").textContent = audioMuted ? "♪̸" : "♫";
    $("#toggle-mute").setAttribute("aria-label", audioMuted ? "Activar música" : "Silenciar música");
    $("#toggle-mute").setAttribute("aria-pressed", String(audioMuted));
    $("#toggle-mute").title = audioMuted ? "Activar música" : "Silenciar música";
  }

  function activateControls() {
    const controls = $("#viewer-controls");
    controls.classList.add("is-active");
    if (idleTimer !== null) window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => controls.classList.remove("is-active"), 2800);
  }

  function preloadNextPhoto() {
    if (selectedPhotoPreload) selectedPhotoPreload.src = "";
    selectedPhotoPreload = null;
    for (let offset = 1; offset <= memories.length; offset += 1) {
      const candidate = memories[(currentIndex + offset) % memories.length];
      const url = photoSources(candidate)[0]?.url || "";
      if (url) {
        selectedPhotoPreload = new Image();
        selectedPhotoPreload.decoding = "async";
        selectedPhotoPreload.src = url;
        return;
      }
    }
  }

  function updateSceneCount(memory, index) {
    sceneCount.textContent = `${index + 1} / ${memories.length}`;
    announcer.textContent = `Recuerdo ${index + 1} de ${memories.length}`;
  }

  function renderCurrentMemory(allowVideoPlay = false) {
    if (isFinalScene) {
      clearSceneResources();
      renderFinalScene();
      return;
    }
    if (!memories.length) {
      showScreen("#empty-screen");
      return;
    }
    $("#viewer-screen").classList.remove("is-final-scene");
    $("#toggle-play").disabled = false;
    $("#next-memory").disabled = false;
    clearSceneResources();
    const memory = memories[currentIndex];
    const flags = mediaFlags(memory);
    updateSceneCount(memory, currentIndex);
    console.log("[MEMORIES] scene index:", currentIndex + 1);
    sceneContent.className = "scene-content";
    preloadNextPhoto();

    if (flags.hasPhoto && flags.hasVideo) {
      if (currentBeat !== "video") {
        renderPhotoScene(memory, flags, true);
        if (isPlaying) startProgress(durations.photoVideo, () => {
          currentBeat = "video";
          renderCurrentMemory(allowVideoPlay);
        });
      } else {
        renderVideoScene(memory, flags, allowVideoPlay);
      }
      return;
    }

    if (flags.hasVideo) {
      renderVideoScene(memory, flags, allowVideoPlay);
      return;
    }
    if (flags.hasPhoto) {
      renderPhotoScene(memory, flags, false);
      if (isPlaying) startProgress(flags.message ? durations.photoMessage : durations.photo, nextMemory);
      return;
    }
    if (flags.message) {
      renderMessageScene(flags.message);
      if (isPlaying) startProgress(durations.message, nextMemory);
      return;
    }
    renderFallback("Este recuerdo no pudo cargarse.");
    if (isPlaying) startProgress(durations.message, nextMemory);
  }

  function renderMessageScene(message) {
    const scene = document.createElement("article");
    scene.className = "memory-scene message-scene";
    const quote = document.createElement("blockquote");
    quote.className = "message-quote";
    quote.textContent = message;
    scene.append(quote);
    sceneContent.append(scene);
  }

  function renderPhotoScene(memory, flags, hasVideoBeat) {
    const scene = document.createElement("figure");
    scene.className = hasVideoBeat ? "memory-scene scene-photo scene-photo--editorial" : flags.message ? "memory-scene scene-photo scene-photo--editorial" : "memory-scene scene-photo";
    if (flags.photos.length) {
      const image = document.createElement("img");
      image.alt = "Recuerdo fotográfico para Laura Sofía";
      image.decoding = "async";
      scene.append(image);
      tryPhotoSource(image, scene, flags, 0);
    } else {
      showPhotoFallback(scene, flags);
    }

    if (flags.message && flags.photos.length) {
      const caption = document.createElement("p");
      caption.className = "scene-caption";
      caption.textContent = flags.message;
      scene.append(caption);
    }
    sceneContent.append(scene);
  }

  function tryPhotoSource(image, scene, flags, sourceIndex) {
    const source = flags.photos[sourceIndex];
    if (!source) {
      showPhotoFallback(scene, flags);
      return;
    }

    const onLoad = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      image.dataset.sourceMethod = source.method;
      console.log("[MEMORIES] photo loaded");
      console.log("[MEMORIES] photo source:", source.method);
    };
    const onError = () => {
      image.removeEventListener("load", onLoad);
      image.removeEventListener("error", onError);
      image.removeAttribute("src");
      console.log(`[MEMORIES] photo source ${sourceIndex + 1} failed`);
      if (sourceIndex + 1 < flags.photos.length) {
        console.log("[MEMORIES] trying photo fallback");
        tryPhotoSource(image, scene, flags, sourceIndex + 1);
      } else {
        showPhotoFallback(scene, flags);
      }
    };
    image.addEventListener("load", onLoad, { once: true });
    image.addEventListener("error", onError, { once: true });
    image.src = source.url;
  }

  function showPhotoFallback(scene, flags) {
    scene.className = flags.message ? "memory-scene message-scene" : "memory-scene scene-fallback-scene";
    scene.replaceChildren();
    if (flags.message) {
      const quote = document.createElement("blockquote");
      quote.className = "message-quote";
      quote.textContent = flags.message;
      scene.append(quote);
      return;
    }
    const fallback = document.createElement("p");
    fallback.className = "scene-fallback";
    fallback.textContent = "Este recuerdo no pudo cargarse.";
    scene.append(fallback);
  }

  function renderVideoScene(memory, flags, allowVideoPlay) {
    const scene = document.createElement("article");
    scene.className = "memory-scene video-scene";
    const wrap = document.createElement("div");
    wrap.className = "video-wrap";
    const url = flags.videoUrl;

    if (url) {
      const video = document.createElement("video");
      video.playsInline = true;
      video.controls = true;
      video.preload = "metadata";
      video.dataset.previewUrl = flags.previewUrl;
      video.setAttribute("aria-label", "Video de recuerdo para Laura Sofía");
      const playOverlay = document.createElement("button");
      playOverlay.className = "video-play-overlay";
      playOverlay.type = "button";
      playOverlay.setAttribute("aria-label", "Reproducir video");
      playOverlay.innerHTML = '<span class="video-play-overlay__icon" aria-hidden="true">&#9654;</span><span>Reproducir video</span>';
      playOverlay.hidden = true;
      playOverlay.addEventListener("click", () => {
        isPlaying = true;
        updatePlayControl();
        playNativeVideo(video, playOverlay);
      });

      const onPlay = () => {
        playOverlay.hidden = true;
        lowerMusicForVideo();
        clearProgress();
      };
      const onPause = () => {
        if (!video.ended) restoreMusicAfterVideo();
      };
      const onEnded = () => {
        restoreMusicAfterVideo();
        if (isPlaying) nextMemory();
      };
      let metadataCheck = null;
      const clearMetadataCheck = () => {
        if (metadataCheck !== null) window.clearInterval(metadataCheck);
        metadataCheck = null;
      };
      const onError = () => {
        clearMetadataCheck();
        console.log("[MEMORIES] native video failed, using preview");
        activateVideoFallback(flags.previewUrl, wrap, playOverlay);
      };
      const onLoadedMetadata = () => {
        if (video.dataset.metadataHandled === "true") return;
        clearMetadataCheck();
        video.dataset.metadataHandled = "true";
        if (allowVideoPlay && isPlaying) playNativeVideo(video, playOverlay);
        else playOverlay.hidden = false;
      };
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onEnded);
      video.addEventListener("error", onError);
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      currentVideoCleanup = () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        clearMetadataCheck();
      };
      wrap.append(video, playOverlay);
      currentVideo = video;
      video.src = url;
      video.load();
      if (video.readyState >= 1) onLoadedMetadata();
      else if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) onError();
      else metadataCheck = window.setInterval(() => {
        if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) onError();
        else if (video.readyState >= 1) onLoadedMetadata();
      }, 500);
    } else if (flags.previewUrl) {
      activateVideoFallback(flags.previewUrl, wrap);
    } else {
      const fallback = document.createElement("p");
      fallback.className = "scene-fallback";
      fallback.textContent = flags.message || "Este recuerdo no pudo cargarse.";
      wrap.append(fallback);
    }

    if (flags.message) {
      const caption = document.createElement("p");
      caption.className = "video-caption";
      caption.textContent = flags.message;
      scene.append(wrap, caption);
    } else {
      scene.append(wrap);
    }
    sceneContent.append(scene);
  }

  function playNativeVideo(video, overlay = null) {
    video.play().then(() => {
      if (overlay) overlay.hidden = true;
    }).catch(() => {
      if (overlay && video.isConnected) overlay.hidden = false;
    });
  }

  function activateVideoFallback(previewUrl, target = null, overlay = null) {
    if (!previewUrl) {
      discardCurrentVideo();
      const fallback = document.createElement("p");
      fallback.className = "scene-fallback";
      fallback.textContent = mediaFlags(memories[currentIndex]).message || "Este recuerdo no pudo cargarse.";
      (target || sceneContent.querySelector(".video-wrap") || sceneContent).replaceChildren(fallback);
      restoreMusicAfterVideo();
      return;
    }
    discardCurrentVideo();
    if (currentFrame) currentFrame.remove();
    if (overlay) overlay.remove();
    const frame = document.createElement("iframe");
    frame.src = previewUrl;
    frame.title = "Video de recuerdo para Laura Sofía";
    frame.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    frame.allowFullscreen = true;
    frame.loading = "lazy";
    frame.addEventListener("load", () => {
      frame.dataset.loaded = "true";
    }, { once: true });
    frame.addEventListener("error", () => showVideoFailureFallback(target), { once: true });
    currentFrame = frame;
    (target || sceneContent.querySelector(".video-wrap") || sceneContent).replaceChildren(frame);
    restoreMusicAfterVideo();
  }

  function discardCurrentVideo() {
    if (!currentVideo) return;
    try { currentVideo.pause(); } catch { /* media can already be detached */ }
    try { if (currentVideo.readyState > 0) currentVideo.currentTime = 0; } catch { /* metadata may not be available yet */ }
    if (currentVideoCleanup) currentVideoCleanup();
    currentVideoCleanup = null;
    currentVideo.removeAttribute("src");
    try { currentVideo.load(); } catch { /* the source may already be unavailable */ }
    currentVideo.remove();
    currentVideo = null;
  }

  function showVideoFailureFallback(target) {
    if (currentFrame) currentFrame.remove();
    currentFrame = null;
    const message = mediaFlags(memories[currentIndex]).message;
    const fallback = document.createElement("p");
    fallback.className = "scene-fallback";
    fallback.textContent = message || "Este recuerdo no pudo cargarse.";
    (target || sceneContent.querySelector(".video-wrap") || sceneContent).replaceChildren(fallback);
  }

  function renderFallback(message) {
    const scene = document.createElement("article");
    scene.className = "memory-scene message-scene";
    const fallback = document.createElement("p");
    fallback.className = "scene-fallback scene-fallback--light";
    fallback.textContent = message;
    scene.append(fallback);
    sceneContent.append(scene);
  }

  function startProgressBeatForCurrent() {
    const flags = mediaFlags(memories[currentIndex]);
    if (flags.hasPhoto && flags.hasVideo && currentBeat !== "video") {
      startProgress(durations.photoVideo, () => {
        currentBeat = "video";
        renderCurrentMemory(true);
      });
    } else if (flags.hasPhoto && !flags.hasVideo) {
      startProgress(flags.message ? durations.photoMessage : durations.photo, nextMemory);
    } else if (!flags.hasPhoto && !flags.hasVideo && flags.message) {
      startProgress(durations.message, nextMemory);
    }
  }

  function handleViewerKey(event) {
    if ($("#viewer-screen").hidden) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, video, iframe")) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      previousMemory();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nextMemory();
    } else if (event.code === "Space") {
      event.preventDefault();
      togglePlayback();
    } else if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      toggleFullscreen();
    } else if (event.key === "Escape") {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      else closeViewer();
    }
  }
  document.addEventListener("keydown", handleViewerKey);

  const viewerStage = $("#viewer-stage");
  viewerStage.addEventListener("pointermove", activateControls, { passive: true });
  viewerStage.addEventListener("pointerdown", activateControls, { passive: true });
  viewerStage.addEventListener("touchstart", (event) => {
    activateControls();
    const target = event.target;
    if (target instanceof Element && target.closest("video, iframe, button, input")) {
      touchStartX = null;
      touchStartY = null;
      return;
    }
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
  }, { passive: true });
  viewerStage.addEventListener("touchend", (event) => {
    if (touchStartX === null || touchStartY === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < 0) nextMemory();
    else previousMemory();
  }, { passive: true });

  window.addEventListener("pagehide", () => {
    clearSceneResources();
    music.pause();
  });

  updateMuteControl();
  updatePlayControl();
  showScreen("#access-screen");

  let savedToken = "";
  try { savedToken = sessionStorage.getItem(sessionKey) || ""; } catch { savedToken = ""; }
  if (savedToken.trim()) loadAccess(savedToken.trim(), "session");
})();
