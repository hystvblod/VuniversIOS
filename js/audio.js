// ===============================================
// VRealms - js/audio.js
// Version fiable pour fond musical auto au chargement d'un univers
// - BGM via HTMLAudioElement
// - pas de verrou par interaction
// - SFX simples
// - reprise propre du menu_bg entre pages menu
// ===============================================
(function () {
  "use strict";

  const AUDIO_BANK = {
    common: {
      death: "assets/audio/common/death_common.m4a",
      choice: "assets/audio/common/choice.m4a",
      gaugeAlarm: "assets/audio/common/critical_alarm_loop.m4a"
    },

    ui: {
      menu: {
        bg: "assets/audio/ui/menu_bg.m4a"
      }
    },

    universes: {
      intro: {
        bg: "assets/audio/universes/intro/bg_loop.m4a"
      },
      hell_king: {
        bg: "assets/audio/universes/hell_king/bg_loop.m4a"
      },
      heaven_king: {
        bg: "assets/audio/universes/heaven_king/bg_loop.m4a"
      },
      mega_corp_ceo: {
        bg: "assets/audio/universes/mega_corp_ceo/bg_loop.m4a"
      },
      new_world_explorer: {
        bg: "assets/audio/universes/new_world_explorer/bg_loop.m4a"
      },
      vampire_lord: {
        bg: "assets/audio/universes/vampire_lord/bg_loop.m4a"
      },
      western_president: {
        bg: "assets/audio/universes/western_president/bg_loop.m4a"
      }
    }
  };

  const MENU_BG_RESUME_KEY = "vrealms_menu_bg_resume_v1";
  const MENU_BG_MAX_RESUME_AGE_MS = 8000;

  const state = {
    currentUniverse: null,
    bg: null,
    bgPath: "",
    pendingBgRetry: false,

    alarmA: null,
    alarmB: null,
    alarmPath: "",
    alarmTimer: null,
    alarmActive: false,
    alarmRunId: 0,

    musicEnabled: readBool("vrealms_music_enabled", true),
    sfxEnabled: readBool("vrealms_sfx_enabled", true),

    musicVolume: readNumber("vrealms_music_volume", 0.32),
    sfxVolume: readNumber("vrealms_sfx_volume", 0.82)
  };

  function clamp(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function readBool(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return !!fallback;
      return raw === "1";
    } catch (_) {
      return !!fallback;
    }
  }

  function writeBool(key, value) {
    try { localStorage.setItem(key, value ? "1" : "0"); } catch (_) {}
  }

  function readNumber(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getMenuBgAbsolutePath() {
    const path = AUDIO_BANK.ui?.menu?.bg || "";
    return path ? new URL(path, document.baseURI).href : "";
  }

  function readSessionJSON(key) {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeSessionJSON(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function clearMenuBgResume() {
    try { sessionStorage.removeItem(MENU_BG_RESUME_KEY); } catch (_) {}
  }

  function isCurrentBgMenuTrack() {
    const menuAbsolute = getMenuBgAbsolutePath();
    if (!menuAbsolute) return false;
    return state.bgPath === menuAbsolute;
  }

  function saveMenuBgResume() {
    const a = state.bg;
    if (!a) return;
    if (!isCurrentBgMenuTrack()) return;

    const currentTime = Number(a.currentTime || 0);
    if (!Number.isFinite(currentTime) || currentTime < 0) return;

    writeSessionJSON(MENU_BG_RESUME_KEY, {
      currentTime,
      savedAt: Date.now()
    });
  }

  function getMenuBgResumeTime(duration) {
    const payload = readSessionJSON(MENU_BG_RESUME_KEY);
    if (!payload) return null;

    const savedAt = Number(payload.savedAt || 0);
    const currentTime = Number(payload.currentTime || 0);

    if (!Number.isFinite(savedAt) || !Number.isFinite(currentTime)) return null;

    const ageMs = Date.now() - savedAt;
    if (ageMs < 0 || ageMs > MENU_BG_MAX_RESUME_AGE_MS) return null;

    let resumeTime = currentTime + (ageMs / 1000);

    if (Number.isFinite(duration) && duration > 0) {
      resumeTime = resumeTime % duration;
    }

    return Math.max(0, resumeTime);
  }

  function applyMenuResumeIfNeeded(audioEl) {
    if (!audioEl) return;
    if (!isCurrentBgMenuTrack()) return;

    const doApply = () => {
      const t = getMenuBgResumeTime(audioEl.duration);
      if (t == null) return;
      try {
        audioEl.currentTime = t;
      } catch (_) {}
    };

    if (audioEl.readyState >= 1) {
      doApply();
      return;
    }

    audioEl.addEventListener("loadedmetadata", doApply, { once: true });
  }

  function fadeBgTo(target, ms = 120) {
    const a = state.bg;
    if (!a) return;

    const start = Number(a.volume || 0);
    const end = clamp(target, 0, 1);
    const duration = Math.max(0, Number(ms) || 0);

    if (duration <= 0 || start === end) {
      a.volume = end;
      return;
    }

    const steps = Math.max(1, Math.round(duration / 16));
    const delta = (end - start) / steps;
    let currentStep = 0;

    const timer = window.setInterval(() => {
      currentStep += 1;
      if (currentStep >= steps) {
        window.clearInterval(timer);
        a.volume = end;
        return;
      }
      a.volume = clamp(start + (delta * currentStep), 0, 1);
    }, Math.max(10, Math.floor(duration / steps)));
  }

  function resolveUniverseId(universeId) {
    const id = String(
      universeId ||
      state.currentUniverse ||
      document.body?.dataset?.universe ||
      localStorage.getItem("vrealms_universe") ||
      "hell_king"
    ).trim();

    return id || "hell_king";
  }

  function getUniverseAudio(universeId) {
    return AUDIO_BANK.universes[resolveUniverseId(universeId)] || null;
  }

  function ensureBg() {
    if (state.bg) return state.bg;

    let a = document.getElementById("vr-bg-music");
    if (!a) {
      a = document.createElement("audio");
      a.id = "vr-bg-music";
      a.hidden = true;
      document.body.appendChild(a);
    }

    a.preload = "auto";
    a.loop = true;
    a.autoplay = false;
    a.playsInline = true;
    a.setAttribute("playsinline", "");
    a.setAttribute("webkit-playsinline", "");

    a.addEventListener("canplay", () => {
      if (state.pendingBgRetry && state.musicEnabled && !document.hidden) {
        tryPlayBg();
      }
    });

    a.addEventListener("loadeddata", () => {
      if (state.pendingBgRetry && state.musicEnabled && !document.hidden) {
        tryPlayBg();
      }
    });

    state.bg = a;
    state.bg.volume = state.musicEnabled ? state.musicVolume : 0;

    return a;
  }


  function ensureAlarmPlayers() {
    if (state.alarmA && state.alarmB) {
      return { a: state.alarmA, b: state.alarmB };
    }

    let a = document.getElementById("vr-gauge-alarm-a");
    let b = document.getElementById("vr-gauge-alarm-b");

    if (!a) {
      a = document.createElement("audio");
      a.id = "vr-gauge-alarm-a";
      a.hidden = true;
      document.body.appendChild(a);
    }

    if (!b) {
      b = document.createElement("audio");
      b.id = "vr-gauge-alarm-b";
      b.hidden = true;
      document.body.appendChild(b);
    }

    [a, b].forEach((el) => {
      el.preload = "auto";
      el.loop = false;
      el.autoplay = false;
      el.playsInline = true;
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "");
      el.volume = 0;
    });

    state.alarmA = a;
    state.alarmB = b;
    return { a, b };
  }

  function getAlarmTargetVolume() {
    if (!state.sfxEnabled) return 0;
    return clamp(state.sfxVolume * 0.55, 0, 1);
  }

  function clearAlarmTimer() {
    if (state.alarmTimer) {
      window.clearTimeout(state.alarmTimer);
      state.alarmTimer = null;
    }
  }

  function stopAndResetAlarmEl(el) {
    if (!el) return;
    try { el.pause(); } catch (_) {}
    try { el.currentTime = 0; } catch (_) {}
    try { el.volume = 0; } catch (_) {}
  }

  function fadeAudioVolume(el, from, to, ms) {
    if (!el) return;
    const start = clamp(from, 0, 1);
    const end = clamp(to, 0, 1);
    const duration = Math.max(0, Number(ms) || 0);

    if (duration <= 0 || start === end) {
      el.volume = end;
      return;
    }

    const steps = Math.max(1, Math.round(duration / 16));
    const delta = (end - start) / steps;
    let currentStep = 0;

    const timer = window.setInterval(() => {
      currentStep += 1;
      if (currentStep >= steps) {
        window.clearInterval(timer);
        try { el.volume = end; } catch (_) {}
        return;
      }
      try {
        el.volume = clamp(start + (delta * currentStep), 0, 1);
      } catch (_) {}
    }, Math.max(10, Math.floor(duration / steps)));
  }

  function scheduleNextAlarmLoop(runId, currentEl, nextEl) {
    if (!state.alarmActive) return;
    if (runId !== state.alarmRunId) return;
    if (!currentEl || !nextEl) return;

    const crossfadeMs = 220;
    const durationSec = Number(currentEl.duration || 0);
    const waitMs =
      Number.isFinite(durationSec) && durationSec > 0
        ? Math.max(300, Math.round(durationSec * 1000) - crossfadeMs - 30)
        : 1200;

    clearAlarmTimer();

    state.alarmTimer = window.setTimeout(async () => {
      if (!state.alarmActive) return;
      if (runId !== state.alarmRunId) return;

      const target = getAlarmTargetVolume();

      try {
        nextEl.currentTime = 0;
        nextEl.volume = 0;
        const p = nextEl.play();
        if (p && typeof p.then === "function") await p;
      } catch (_) {
        return;
      }

      fadeAudioVolume(nextEl, 0, target, crossfadeMs);
      fadeAudioVolume(currentEl, Number(currentEl.volume || target), 0, crossfadeMs);

      window.setTimeout(() => {
        if (runId !== state.alarmRunId) return;
        stopAndResetAlarmEl(currentEl);
      }, crossfadeMs + 40);

      scheduleNextAlarmLoop(runId, nextEl, currentEl);
    }, waitMs);
  }

  async function tryPlayBg(opts = {}) {
    const { fadeIn = false } = opts || {};

    const a = ensureBg();
    if (!state.musicEnabled) return;
    if (!a.src) return;

    const targetVolume = clamp(state.musicVolume, 0, 1);
    a.volume = fadeIn ? 0 : targetVolume;

    try {
      const p = a.play();
      if (p && typeof p.then === "function") {
        await p;
      }
      state.pendingBgRetry = false;

      if (fadeIn) {
        fadeBgTo(targetVolume, 120);
      }
    } catch (err) {
      state.pendingBgRetry = true;
      console.warn("[VRAudio] autoplay bg bloqué :", err);
    }
  }

  function stopBackground() {
    const a = ensureBg();
    state.pendingBgRetry = false;

    try { a.pause(); } catch (_) {}
    try { a.currentTime = 0; } catch (_) {}
  }

  function shouldUseUniverseBg() {
    return document.body?.dataset?.page === "game";
  }

  async function startMenuBg() {
    if (!state.musicEnabled) {
      stopBackground();
      return;
    }

    const path = AUDIO_BANK.ui?.menu?.bg || "";
    if (!path) {
      stopBackground();
      return;
    }

    const a = ensureBg();
    const absolute = new URL(path, document.baseURI).href;

    if (state.bgPath === absolute && !a.paused) {
      a.volume = clamp(state.musicVolume, 0, 1);
      return;
    }

    const isTrackChange = state.bgPath !== absolute;

    try { a.pause(); } catch (_) {}

    if (isTrackChange) {
      a.src = path;
      state.bgPath = absolute;
      applyMenuResumeIfNeeded(a);
      a.load();
    }

    a.volume = 0;
    await tryPlayBg({ fadeIn: true });
  }

  async function startUniverseBg(universeId, opts = {}) {
    const { forceRestart = false } = opts || {};

    state.currentUniverse = resolveUniverseId(universeId);

    if (!state.musicEnabled) {
      stopBackground();
      return;
    }

    const cfg = getUniverseAudio(state.currentUniverse);
    const path = cfg?.bg || "";
    if (!path) {
      stopBackground();
      return;
    }

    const a = ensureBg();
    const absolute = new URL(path, document.baseURI).href;

    if (!forceRestart && state.bgPath === absolute && !a.paused) {
      a.volume = clamp(state.musicVolume, 0, 1);
      return;
    }

    if (state.bgPath !== absolute) {
      try { a.pause(); } catch (_) {}
      a.src = path;
      a.load();
      state.bgPath = absolute;
    }

    a.volume = clamp(state.musicVolume, 0, 1);
    await tryPlayBg();
  }

  function playPath(path, volume) {
    if (!path) return;

    try {
      const a = new Audio(path);
      a.preload = "auto";
      a.playsInline = true;
      a.volume = clamp(volume, 0, 1);
      const p = a.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch (_) {}
  }

  function duckBackground(ms = 1200, factor = 0.22) {
    const a = ensureBg();
    if (!state.musicEnabled) return;
    if (!a || !a.src) return;

    const base = clamp(state.musicVolume, 0, 1);
    const ducked = clamp(base * factor, 0, 1);

    a.volume = ducked;

    window.setTimeout(() => {
      try {
        if (state.musicEnabled) a.volume = base;
      } catch (_) {}
    }, ms);
  }

  function playChoice(universeId) {
    if (!state.sfxEnabled) return;

    const path = AUDIO_BANK.common.choice || "";
    playPath(path, state.sfxVolume);
  }

  function playDeath() {
    if (!state.sfxEnabled) return;

    duckBackground(1200, 0.22);
    playPath(AUDIO_BANK.common.death, Math.min(1, state.sfxVolume + 0.08));
  }


  async function startGaugeAlarm() {
    if (!state.sfxEnabled) return;

    const path = AUDIO_BANK.common.gaugeAlarm || "";
    if (!path) return;

    const absolute = new URL(path, document.baseURI).href;
    const { a, b } = ensureAlarmPlayers();
    const target = getAlarmTargetVolume();

    if (state.alarmActive && state.alarmPath === absolute) {
      return;
    }

    state.alarmActive = true;
    state.alarmRunId += 1;
    const runId = state.alarmRunId;
    state.alarmPath = absolute;

    clearAlarmTimer();

    [a, b].forEach((el) => {
      if (el.dataset.absSrc !== absolute) {
        stopAndResetAlarmEl(el);
        el.src = path;
        el.load();
        el.dataset.absSrc = absolute;
      } else {
        stopAndResetAlarmEl(el);
      }
    });

    a.volume = 0;
    b.volume = 0;

    try {
      const p = a.play();
      if (p && typeof p.then === "function") await p;
    } catch (_) {
      return;
    }

    fadeAudioVolume(a, 0, target, 180);
    scheduleNextAlarmLoop(runId, a, b);
  }

  function stopGaugeAlarm() {
    state.alarmActive = false;
    state.alarmRunId += 1;
    clearAlarmTimer();

    const { a, b } = ensureAlarmPlayers();
    const fadeMs = 220;

    fadeAudioVolume(a, Number(a.volume || 0), 0, fadeMs);
    fadeAudioVolume(b, Number(b.volume || 0), 0, fadeMs);

    window.setTimeout(() => {
      stopAndResetAlarmEl(a);
      stopAndResetAlarmEl(b);
    }, fadeMs + 40);
  }

  function setMusicEnabled(enabled) {
    state.musicEnabled = !!enabled;
    writeBool("vrealms_music_enabled", state.musicEnabled);

    const a = ensureBg();

    if (!state.musicEnabled) {
      saveMenuBgResume();
      try { a.pause(); } catch (_) {}
      a.volume = 0;
      return;
    }

    a.volume = clamp(state.musicVolume, 0, 1);

    if (shouldUseUniverseBg()) {
      startUniverseBg(state.currentUniverse || localStorage.getItem("vrealms_universe") || "hell_king");
      return;
    }

    startMenuBg();
  }

  function setSfxEnabled(enabled) {
    state.sfxEnabled = !!enabled;
    writeBool("vrealms_sfx_enabled", state.sfxEnabled);

    if (!state.sfxEnabled) {
      stopGaugeAlarm();
    }
  }

  function setMusicVolume(value) {
    state.musicVolume = clamp(value, 0, 1);
    try { localStorage.setItem("vrealms_music_volume", String(state.musicVolume)); } catch (_) {}

    const a = ensureBg();
    if (state.musicEnabled) {
      a.volume = state.musicVolume;
    }
  }

  function setSfxVolume(value) {
    state.sfxVolume = clamp(value, 0, 1);
    try { localStorage.setItem("vrealms_sfx_volume", String(state.sfxVolume)); } catch (_) {}

    const target = getAlarmTargetVolume();
    try {
      if (state.alarmA && !state.alarmA.paused) {
        state.alarmA.volume = Math.min(state.alarmA.volume || target, target);
      }
      if (state.alarmB && !state.alarmB.paused) {
        state.alarmB.volume = Math.min(state.alarmB.volume || target, target);
      }
    } catch (_) {}
  }

  function init() {
    ensureBg();

    window.addEventListener("pagehide", () => {
      saveMenuBgResume();
    });

    window.addEventListener("pageshow", () => {
      if (state.musicEnabled && !document.hidden) {
        tryPlayBg();
      }
    });

    document.addEventListener("visibilitychange", () => {
      const a = ensureBg();

      if (document.hidden) {
        saveMenuBgResume();
        try { a.pause(); } catch (_) {}
        return;
      }

      if (state.musicEnabled) {
        tryPlayBg();
      }
    });
  }

  init();

  window.VRAudio = {
    onUniverseSelected(universeId) {
      state.currentUniverse = resolveUniverseId(universeId);
      startUniverseBg(state.currentUniverse);
    },

    startUniverseBg,
    startMenuBg,
    stopBackground,

    playChoice(universeId) {
      playChoice(universeId);
    },

    playDeath() {
      playDeath();
    },

    startGaugeAlarm,
    stopGaugeAlarm,

    setMusicEnabled,
    setSfxEnabled,
    setMusicVolume,
    setSfxVolume,

    isMusicEnabled() {
      return !!state.musicEnabled;
    },

    isSfxEnabled() {
      return !!state.sfxEnabled;
    }
  };
})();
