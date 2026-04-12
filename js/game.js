// ===============================================
// VRealms - js/game.js (bundle complet) — VERSION RÉPARÉE + I18N CLEAN
// - Loader univers/decks/i18n
// - UI binding + swipe animé sur les choix (A/B/C)
// - State / Endings / Engine core
// - Popups Jeton & VCoins
// - Popup Personnalisation
// - VRGame + anti-retour navigateur (best-effort)
// - ✅ SAVE LOCAL PAR UNIVERS (reprise session)
// - ✅ EVENTS: toutes les 3 cartes -> 1/10, pool 30, anti-répétition 25/30
// - ✅ Fix: events anti-répétition = 25 DISTINCTS (pas “25 tirages”)
// - ✅ Fix: undo/save restore aussi les jetons UI
// - ✅ FIX(1): swipe = PointerEvents only (+ fallback touch si pas PointerEvent)
// - ✅ FIX(2): _handleDeath() n’empile plus de listeners (bind once + delegation)
// - ✅ FIX(3): events jetons: UI ne bouge que si DB ok + refresh soft après event
// - ✅ FIX(5): i18n overlay event (Continuer / Événement)
// - ✅ COSMETICS: fallback gris + popup perso + application live
// - ✅ FIX POPUP COSMETICS: une seule ligne rerender au scroll, plus de flash global
// - ✅ JETON PEEK: blink/zoom seulement hors-peek + delta +/−% affiché en peek + % jauges mis à jour
// - ✅ FIX CRITIQUE: ne restaure plus une save morte/corrompue
// - ✅ FIX UI: popups jetons/vcoins en cartouches basiques, sans images du jeu
// - ✅ FIX I18N: plus aucun texte visible en dur dans ce fichier
// ===============================================


// -------------------------------------------------------
// Helpers profil (100% Supabase authoritative)
// -------------------------------------------------------
(function () {
  "use strict";

  const _mem = { me: null, ts: 0 };

  async function getMeFresh(maxAgeMs) {
    const now = Date.now();
    const age = now - (_mem.ts || 0);
    if (_mem.me && age <= (maxAgeMs || 0)) return _mem.me;

    try {
      const me = await window.VRRemoteStore?.getMe?.();
      if (me) {
        _mem.me = me;
        _mem.ts = now;
        return me;
      }
    } catch (_) {}

    return _mem.me;
  }

  function n(x) {
    const v = Number(x);
    return Number.isFinite(v) ? v : 0;
  }

  window.VRProfile = window.VRProfile || {
    async getMe(maxAgeMs) { return await getMeFresh(maxAgeMs); },
    _n: n
  };
})();


// -------------------------------------------------------
// ✅ Save system local (par univers) — reprise session
// -------------------------------------------------------
(function () {
  "use strict";

  const SAVE_PREFIX = "vrealms_save_";
  const SAVE_VERSION = 1;

  function _key(universeId) {
    return `${SAVE_PREFIX}${String(universeId || "unknown")}`;
  }

  function _safeParse(raw) {
    try { return JSON.parse(raw); } catch (_) { return null; }
  }

  function load(universeId) {
    try {
      const raw = localStorage.getItem(_key(universeId));
      if (!raw) return null;
      const data = _safeParse(raw);
      if (!data || typeof data !== "object") return null;
      if (data.version !== SAVE_VERSION) return null;
      if (data.universeId !== universeId) return null;
      return data;
    } catch (_) {
      return null;
    }
  }

  function save(universeId, payload) {
    try {
      const data = {
        version: SAVE_VERSION,
        universeId,
        ts: Date.now(),
        ...payload
      };
      localStorage.setItem(_key(universeId), JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clear(universeId) {
    try { localStorage.removeItem(_key(universeId)); } catch (_) {}
  }

  window.VRSave = { load, save, clear, _key };
})();


// -------------------------------------------------------
// Badge thresholds (sans mort)
// -------------------------------------------------------
const VR_BADGE_WOOD_CHOICES = 20;
const VR_BADGE_BRONZE_CHOICES = 40;
const VR_BADGE_SILVER_CHOICES = 60;
const VR_BADGE_GOLD_CHOICES = 100;
const VR_BADGE_CRYSTAL_CHOICES = 150;

const VR_GUIDE_STORAGE_KEY = "vuniverse_guide_seen_v1";

const VR_GUIDE_THRESHOLDS = {
  wood: 20,
  bronze: 40,
  silver: 60,
  gold: 100,
  crystal: 150
};

const VR_GUIDE_IMAGE_MAP = {
  hell_king: "assets/img/guides/hell_king.webp",
  heaven_king: "assets/img/guides/heaven_king.webp",
  vampire_lord: "assets/img/guides/vampire_lord.webp",
  mega_corp_ceo: "assets/img/guides/mega_corp_ceo.webp",
  western_president: "assets/img/guides/western_president.webp",
  new_world_explorer: "assets/img/guides/new_world_explorer.webp"
};

function vrGuideLoadSeen() {
  try {
    return JSON.parse(localStorage.getItem(VR_GUIDE_STORAGE_KEY) || "{}") || {};
  } catch (_) {
    return {};
  }
}

function vrGuideSaveSeen(map) {
  try {
    localStorage.setItem(VR_GUIDE_STORAGE_KEY, JSON.stringify(map || {}));
  } catch (_) {}
}

function vrGuideEnsureUniverse(map, universeId) {
  if (!map[universeId]) {
    map[universeId] = {
      intro: false,
      wood: false,
      bronze: false,
      silver: false,
      gold: false,
      crystal: false
    };
  }
  return map[universeId];
}

function vrGuideGetNextTier(reignLength) {
  const v = Math.max(0, Number(reignLength || 0));
  if (v < 20) return "wood";
  if (v < 40) return "bronze";
  if (v < 60) return "silver";
  if (v < 100) return "gold";
  if (v < 150) return "crystal";
  return null;
}

function vrGuideGetReachedTier(reignLength) {
  const v = Math.max(0, Number(reignLength || 0));
  if (v >= 150) return "crystal";
  if (v >= 100) return "gold";
  if (v >= 60) return "silver";
  if (v >= 40) return "bronze";
  if (v >= 20) return "wood";
  return null;
}


const VR_BADGE_ORDER = ["wood", "bronze", "silver", "gold", "crystal"];

function getStoredBadgeTier(universeId) {
  try {
    const map = window.VUProfileBadges?.getAll?.()?.map || {};
    const row = map[String(universeId || "").trim()] || {};

    if (row.crystal) return "crystal";
    if (row.gold) return "gold";
    if (row.silver) return "silver";
    if (row.bronze) return "bronze";
    if (row.wood) return "wood";
  } catch (_) {}

  return null;
}

function getRankTierFromReignLength(reignLength) {
  const v = Math.max(0, Number(reignLength || 0));
  if (v >= 150) return "crystal";
  if (v >= 100) return "gold";
  if (v >= 60) return "silver";
  if (v >= 40) return "bronze";
  if (v >= 20) return "wood";
  return "wood";
}

function getHigherTier(a, b) {
  const ia = VR_BADGE_ORDER.indexOf(a);
  const ib = VR_BADGE_ORDER.indexOf(b);
  return (ib > ia) ? b : a;
}

function getEffectiveRankTier(universeId, reignLength) {
  const storedTier = getStoredBadgeTier(universeId);
  const currentRunTier = getRankTierFromReignLength(reignLength);

  if (!storedTier) return currentRunTier;
  return getHigherTier(storedTier, currentRunTier);
}

function getRankTargetFromState(universeId, reignLength) {
  const tier = getEffectiveRankTier(universeId, reignLength);

  if (tier === "crystal") return 150;
  if (tier === "gold") return 150;
  if (tier === "silver") return 100;
  if (tier === "bronze") return 60;
  if (tier === "wood") {
    const storedTier = getStoredBadgeTier(universeId);
    return storedTier ? 40 : 20;
  }

  return 20;
}

function getRankProgressLabel(universeId, reignLength) {
  const v = Math.max(0, Number(reignLength || 0));
  const target = getRankTargetFromState(universeId, reignLength);
  return `${Math.min(v, target)}/${target}`;
}

function getRankLabel(universeId, reignLength) {
  const tier = getEffectiveRankTier(universeId, reignLength);
  const key = `jobs.${String(universeId || "").trim()}.${tier}`;
  try {
    const out = window.VRI18n?.t?.(key);
    if (out && out !== key) return out;
  } catch (_) {}
  return tier;
}


// -------------------------------------------------------
// Loader univers / deck / textes / events
// -------------------------------------------------------
(function () {
  "use strict";

  const SCENARIOS_PATH = "data/scenarios";
  const LEGACY_CONFIG_PATH = "data/universes";
  const LEGACY_DECKS_PATH = "data/decks";
  const LEGACY_I18N_PATH = "data/i18n";
  const LEGACY_EVENTS_LOGIC_PATH = "data/events";

  function normalizeScenarioLang(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "en";
    if (s === "pt-br" || s === "ptbr") return "ptbr";
    if (s === "jp" || s === "ja" || s === "ja-jp") return "jp";
    if (s === "in" || s === "id-id") return "id";
    return s.split(/[-_]/)[0] || "en";
  }

  function normalizeUniverseId(raw) {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return "hell_king";

    const cleaned = s
      .replace(/%20/g, " ")
      .replace(/[^\w\s-]/g, " ")
      .replace(/[\s-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");

    const compact = cleaned.replace(/_/g, "");

    const map = {
      intro: "intro",

      hell: "hell_king",
      hell_king: "hell_king",
      hellking: "hell_king",

      heaven: "heaven_king",
      heaven_king: "heaven_king",
      heavenking: "heaven_king",

      vampire: "vampire_lord",
      vampire_lord: "vampire_lord",
      vampirelord: "vampire_lord",

      western: "western_president",
      western_president: "western_president",
      westernpresident: "western_president",

      mega_corp: "mega_corp_ceo",
      megacorp: "mega_corp_ceo",
      mega_corp_ceo: "mega_corp_ceo",
      megacorpceo: "mega_corp_ceo",

      new_world: "new_world_explorer",
      newworld: "new_world_explorer",
      new_world_explorer: "new_world_explorer",
      newworldexplorer: "new_world_explorer"
    };

    return map[cleaned] || map[compact] || cleaned;
  }

  window.normalizeScenarioLang = normalizeScenarioLang;
  window.normalizeUniverseId = normalizeUniverseId;

  const VREventsLoader = {
    async loadUniverseData(universeId, lang) {
      const configPromise = this._loadConfig(universeId);
      const deckPromise = this._loadDeck(universeId);
      const textsPromise = this._loadCardTexts(universeId, lang);

      const [config, deck, cardTexts] = await Promise.all([
        configPromise,
        deckPromise,
        textsPromise
      ]);

      return { config, deck, cardTexts };
    },

    async loadUniverseEvents(universeId, lang) {
      const logicPromise = this._loadEventsLogic(universeId);
      const textsPromise = this._loadEventsTexts(universeId, lang);

      const [logic, texts] = await Promise.all([logicPromise, textsPromise]);

      return { eventsLogic: logic, eventsTexts: texts };
    },
    async loadUniverseMajors(universeId, lang) {
      const logicPromise = this._loadMajorsLogic(universeId);
      const textsPromise = this._loadMajorsTexts(universeId, lang);

      const [logic, texts] = await Promise.all([logicPromise, textsPromise]);

      return { majorsLogic: logic, majorsTexts: texts };
    },

    async _loadConfig(universeId) {
      const urlNew = `${SCENARIOS_PATH}/${universeId}/config.json`;
      let res = await fetch(urlNew, { cache: "no-cache" });

      if (!res.ok) {
        const urlOld = `${LEGACY_CONFIG_PATH}/${universeId}.config.json`;
        res = await fetch(urlOld, { cache: "no-cache" });
      }

      if (!res.ok) {
        throw new Error(`[VREventsLoader] Impossible de charger la config univers ${universeId}`);
      }
      return res.json();
    },

    async _loadDeck(universeId) {
      const urlNew = `${SCENARIOS_PATH}/${universeId}/deck.json`;
      let res = await fetch(urlNew, { cache: "no-cache" });

      if (!res.ok) {
        const urlOld = `${LEGACY_DECKS_PATH}/${universeId}.json`;
        res = await fetch(urlOld, { cache: "no-cache" });
      }

      if (!res.ok) {
        throw new Error(`[VREventsLoader] Impossible de charger le deck pour ${universeId}`);
      }

      const deckJson = await res.json();
      const cards = Array.isArray(deckJson) ? deckJson : (deckJson?.cards || null);

      if (!Array.isArray(cards)) {
        throw new Error(`[VREventsLoader] Deck invalide pour ${universeId} (attendu array ou {cards:[]}).`);
      }
      return cards;
    },

    async _loadCardTexts(universeId, lang) {
      const fileLang = normalizeScenarioLang(lang);

      const tries = [
        `${SCENARIOS_PATH}/${universeId}/cards_${fileLang}.json`,

        fileLang !== "en"
          ? `${SCENARIOS_PATH}/${universeId}/cards_en.json`
          : "",

        fileLang !== "fr"
          ? `${SCENARIOS_PATH}/${universeId}/cards_fr.json`
          : "",

        `${LEGACY_I18N_PATH}/${fileLang}/cards_${universeId}.json`,
        `${LEGACY_I18N_PATH}/cards_${universeId}_${fileLang}.json`,

        fileLang !== "en"
          ? `${LEGACY_I18N_PATH}/en/cards_${universeId}.json`
          : "",

        fileLang !== "en"
          ? `${LEGACY_I18N_PATH}/cards_${universeId}_en.json`
          : "",

        fileLang !== "fr"
          ? `${LEGACY_I18N_PATH}/fr/cards_${universeId}.json`
          : "",

        fileLang !== "fr"
          ? `${LEGACY_I18N_PATH}/cards_${universeId}_fr.json`
          : ""
      ].filter(Boolean);

      for (const url of tries) {
        const res = await fetch(url, { cache: "no-cache" });
        if (res.ok) return res.json();
      }

      throw new Error(`[VREventsLoader] Impossible de charger les cartes de ${universeId} en ${lang}`);
    },

    async _loadEventsLogic(universeId) {
      const urlNew = `${SCENARIOS_PATH}/${universeId}/logic_events.json`;
      let res = await fetch(urlNew, { cache: "no-cache" });

      if (!res.ok) {
        const urlOld = `${LEGACY_EVENTS_LOGIC_PATH}/logic_events_${universeId}.json`;
        res = await fetch(urlOld, { cache: "no-cache" });
      }

      if (!res.ok) return { events: [] };

      const data = await res.json();
      if (Array.isArray(data)) return { events: data };
      if (data && typeof data === "object" && Array.isArray(data.events)) return data;
      return { events: [] };
    },

    async _loadEventsTexts(universeId, lang) {
      const fileLang = normalizeScenarioLang(lang);
      const urlNew = `${SCENARIOS_PATH}/${universeId}/events_${fileLang}.json`;
      const urlOld1 = `${LEGACY_I18N_PATH}/${lang}/events_${universeId}.json`;
      const urlOld2 = `${LEGACY_I18N_PATH}/events_${universeId}_${lang}.json`;

      let res = await fetch(urlNew, { cache: "no-cache" });
      if (!res.ok) res = await fetch(urlOld1, { cache: "no-cache" });
      if (!res.ok) res = await fetch(urlOld2, { cache: "no-cache" });

      if (!res.ok) return {};
      const data = await res.json();
      return (data && typeof data === "object") ? data : {};
    },

    async _loadMajorsLogic(universeId) {
      const url = `${SCENARIOS_PATH}/${universeId}/logic_major_decisions.json`;
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) return { decisions: [] };

      const data = await res.json();
      if (Array.isArray(data)) return { decisions: data };
      if (data && typeof data === "object" && Array.isArray(data.decisions)) return data;
      return { decisions: [] };
    },

    async _loadMajorsTexts(universeId, lang) {
      const fileLang = normalizeScenarioLang(lang);
      const tries = [
        `${SCENARIOS_PATH}/${universeId}/major_decisions_${fileLang}.json`,
        fileLang === "jp" ? `${SCENARIOS_PATH}/${universeId}/major_decisions_ja.json` : "",
        fileLang === "ja" ? `${SCENARIOS_PATH}/${universeId}/major_decisions_jp.json` : "",
        fileLang !== "en" ? `${SCENARIOS_PATH}/${universeId}/major_decisions_en.json` : "",
        fileLang !== "fr" ? `${SCENARIOS_PATH}/${universeId}/major_decisions_fr.json` : ""
      ].filter(Boolean);

      for (const url of tries) {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) continue;
        const data = await res.json();
        return (data && typeof data === "object") ? data : {};
      }

      return {};
    }
  };

  window.VREventsLoader = VREventsLoader;
})();


(function () {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
  const HAS_POINTER = ("PointerEvent" in window);

  const VRUIBinding = {
    updateMeta(kingName, years, coins, tokens) {
      const kingEl = document.getElementById("meta-king-name");
      const yearsEl = document.getElementById("meta-years");
      const coinsEl = document.getElementById("meta-coins");
      const tokensEl = document.getElementById("meta-tokens");
      const currentUniverse = String(document.body?.dataset?.universe || window.VRGame?.currentUniverse || "").trim();
      const isIntro = currentUniverse === "intro";

      if (isIntro) {
        if (kingEl) kingEl.textContent = "";
        if (yearsEl) yearsEl.textContent = "";
        if (coinsEl) coinsEl.textContent = "100";
        if (tokensEl) tokensEl.textContent = "1";
        return;
      }

      const reignLength = Number(window.VRGame?.session?.reignLength || 0);
      const rankLabel = getRankLabel(currentUniverse, reignLength);
      const progressLabel = getRankProgressLabel(currentUniverse, reignLength);

      if (kingEl) kingEl.textContent = rankLabel || "—";
      if (yearsEl) yearsEl.textContent = progressLabel;
      if (coinsEl) coinsEl.textContent = String(coins || 0);
      if (tokensEl) tokensEl.textContent = String(tokens || 0);
    },

    universeConfig: null,
    lang: "en",
    currentCardLogic: null,
    cardTextsDict: null,
    peekRemaining: 0,
    _peekChoiceActive: null,
    _criticalAlarmActive: false,

    init(universeConfig, lang, cardTextsDict) {
      this.universeConfig = universeConfig;
      this.lang = lang || "en";
      this.cardTextsDict = cardTextsDict || {};

      this.peekRemaining = 0;
      this._peekChoiceActive = null;
      this._criticalAlarmActive = false;
      try { document.body?.classList?.remove("vr-peek-mode"); } catch (_) {}
      try { document.getElementById("view-game")?.classList?.remove("vr-critical-alarm"); } catch (_) {}
      try { window.VRAudio?.stopGaugeAlarm?.(); } catch (_) {}

      this._ensurePeekStyles();
      this._setupGaugeLabels();
      this._ensureGaugePreviewBars();
      this.updateGauges();
      this._setupChoiceButtons();
    },

    enablePeek(steps) {
      const n = Math.max(0, Math.min(Number(steps || 0), 99));
      this.peekRemaining = n;

      this._ensurePeekStyles();

      try {
        if (n > 0) document.body.classList.add("vr-peek-mode");
        else document.body.classList.remove("vr-peek-mode");
      } catch (_) {}

      this.updateGauges();
    },

    _ensurePeekStyles() {
      try {
        const ID = "vr_peek_styles";
        if (document.getElementById(ID)) return;

        const style = document.createElement("style");
        style.id = ID;
style.textContent = `
@keyframes vrGaugeBlinkGlow {
  0% {
    filter: brightness(1) contrast(1);
    opacity: 1;
  }
  50% {
    filter: brightness(1.85) contrast(1.2);
    opacity: .82;
  }
  100% {
    filter: brightness(1) contrast(1);
    opacity: 1;
  }
}

@keyframes vrGaugeBlinkPulse {
  0% {
    transform: translateZ(0) scale(1);
  }
  50% {
    transform: translateZ(0) scale(1.08);
  }
  100% {
    transform: translateZ(0) scale(1);
  }
}

.vr-gauge-value{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  min-width:64px;
  line-height:1.05;
  font:900 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  letter-spacing:.2px;
  text-shadow:
  0 0 6px rgba(0,0,0,.22),
  0 1px 10px rgba(0,0,0,.28);
}

body:not(.vr-peek-mode) .vr-gauge-value{
  opacity:0 !important;
  visibility:hidden !important;
}

body.vr-peek-mode .vr-gauge-value{
  opacity:1 !important;
  visibility:visible !important;
}

.vr-gauge-delta:empty{
  display:none !important;
}

body.vr-peek-mode .vr-gauge.vr-peek-up .vr-gauge-delta{
  color:inherit;
}
body.vr-peek-mode .vr-gauge.vr-peek-down .vr-gauge-delta{
  color:inherit;
}

body:not(.vr-peek-mode) .vr-gauge.vr-peek-up .vr-gauge-fill,
body:not(.vr-peek-mode) .vr-gauge.vr-peek-down .vr-gauge-fill{
  transform-origin:50% 50%;
  animation:
    vrGaugeBlinkGlow 620ms ease-in-out infinite,
    vrGaugeBlinkPulse 620ms ease-in-out infinite;
}

body.vr-peek-mode .vr-gauge.vr-peek-up .vr-gauge-fill,
body.vr-peek-mode .vr-gauge.vr-peek-down .vr-gauge-fill{
  animation:none !important;
  filter:brightness(1.12) saturate(1.02);
}

body:not(.vr-peek-mode) .vr-gauge-preview{
  opacity:0 !important;
}
body.vr-peek-mode .vr-gauge-preview{
  position:absolute;
  inset:0;
  pointer-events:none;
  opacity:.55;
  clip-path:inset(calc(100% - var(--vr-pct, 0%)) 0 0 0);
}

@keyframes vrGaugeCriticalLowSoft {
  0%, 100% {
    transform: translateZ(0) scale(1);
    filter: brightness(1) drop-shadow(0 0 0 rgba(255,255,255,0));
    opacity: 1;
  }
  50% {
    transform: translateZ(0) scale(1.035);
    filter: brightness(1.12) drop-shadow(0 0 10px rgba(255,255,255,.18));
    opacity: .96;
  }
}

@keyframes vrGaugeCriticalHighSoft {
  0%, 100% {
    transform: translateZ(0) scale(1);
    filter: brightness(1) saturate(1);
    opacity: 1;
  }
  50% {
    transform: translateZ(0) scale(1.04);
    filter: brightness(1.14) saturate(1.06);
    opacity: .95;
  }
}

.vr-gauge.vr-critical-low .vr-gauge-fill,
.vr-gauge.vr-critical-low .vr-gauge-frame{
  transform-origin: 50% 50%;
  animation: vrGaugeCriticalLowSoft 1.55s ease-in-out infinite;
}

.vr-gauge.vr-critical-high .vr-gauge-fill,
.vr-gauge.vr-critical-high .vr-gauge-frame{
  transform-origin: 50% 50%;
  animation: vrGaugeCriticalHighSoft 1.45s ease-in-out infinite;
}

.vr-gauge.vr-critical-low .vr-gauge-value,
.vr-gauge.vr-critical-high .vr-gauge-value{
  opacity: 1;
}

body.vr-peek-mode .vr-gauge.vr-critical-low .vr-gauge-fill,
body.vr-peek-mode .vr-gauge.vr-critical-low .vr-gauge-frame,
body.vr-peek-mode .vr-gauge.vr-critical-high .vr-gauge-fill,
body.vr-peek-mode .vr-gauge.vr-critical-high .vr-gauge-frame{
  animation-duration: 1.2s;
}

@keyframes vrCriticalAlarmPulseMedium {
  0%, 100% {
    opacity: 0.12;
    transform: scale(1);
  }
  50% {
    opacity: 0.52;
    transform: scale(1.012);
  }
}

@keyframes vrCriticalAlarmFlashMedium {
  0%, 100% {
    opacity: 0.00;
  }
  50% {
    opacity: 0.14;
  }
}

#view-game.vr-critical-alarm::before {
  background:
    radial-gradient(circle at center,
      rgba(255, 0, 0, 0.00) 0%,
      rgba(255, 0, 0, 0.12) 24%,
      rgba(255, 0, 0, 0.24) 48%,
      rgba(190, 0, 0, 0.42) 74%,
      rgba(80, 0, 0, 0.56) 100%);
  box-shadow:
    inset 0 0 50px rgba(255, 0, 0, 0.18),
    inset 0 0 120px rgba(255, 0, 0, 0.22),
    inset 0 0 220px rgba(120, 0, 0, 0.30);
  animation: vrCriticalAlarmPulseMedium 2s ease-in-out infinite;
}

#view-game.vr-critical-alarm::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    linear-gradient(
      180deg,
      rgba(255, 0, 0, 0.00) 0%,
      rgba(255, 40, 40, 0.06) 20%,
      rgba(255, 0, 0, 0.12) 50%,
      rgba(255, 40, 40, 0.06) 80%,
      rgba(255, 0, 0, 0.00) 100%
    );
  animation: vrCriticalAlarmFlashMedium 2s ease-in-out infinite;
}
`;
        (document.head || document.documentElement).appendChild(style);
      } catch (_) {}
    },

    _consumePeekDecision() {
      if (this.peekRemaining <= 0) return;

      this.peekRemaining = Math.max(0, this.peekRemaining - 1);

      if (this.peekRemaining <= 0) {
        this.peekRemaining = 0;
        this._clearPeek();
        try { document.body.classList.remove("vr-peek-mode"); } catch (_) {}
        this.updateGauges();
      }
    },

    _setupGaugeLabels() {
      const gaugesCfg = this.universeConfig?.gauges || [];
      const gaugeEls = document.querySelectorAll(".vr-gauge");
      const universeId = this.universeConfig?.id || "unknown";

      gaugeEls.forEach((el, idx) => {
        const labelEl = el.querySelector(".vr-gauge-label");
        const fillEl = el.querySelector(".vr-gauge-fill");
        const cfg = gaugesCfg[idx];
        if (!cfg) return;

        const gaugeId = cfg.id;

        const i18nKey = `gauges.${universeId}.${gaugeId}`;
        const translated =
          window.VRI18n && typeof window.VRI18n.t === "function"
            ? window.VRI18n.t(i18nKey)
            : null;

        const label =
          (translated && translated !== i18nKey ? translated : null) ||
          cfg?.[`label_${this.lang}`] ||
          cfg?.label ||
          cfg?.id;

        if (labelEl) labelEl.textContent = label || "—";

        if (fillEl) fillEl.dataset.gaugeId = gaugeId;
        el.dataset.gaugeId = gaugeId;
      });
    },

    _setCriticalAlarmState(isActive) {
      const active = !!isActive;
      const wasActive = !!this._criticalAlarmActive;

      try {
        const viewGame = document.getElementById("view-game");
        if (viewGame) viewGame.classList.toggle("vr-critical-alarm", active);
      } catch (_) {}

      if (active && !wasActive) {
        try { window.VRAudio?.startGaugeAlarm?.(); } catch (_) {}
      } else if (!active && wasActive) {
        try { window.VRAudio?.stopGaugeAlarm?.(); } catch (_) {}
      }

      this._criticalAlarmActive = active;
    },

    _ensureGaugePreviewBars() {
      const gaugeEls = document.querySelectorAll(".vr-gauge");

      gaugeEls.forEach((el) => {
        try {
          el.querySelectorAll(".vr-gauge-under").forEach((n) => n.remove());
        } catch (_) {}

        let preview = el.querySelector(".vr-gauge-preview");
        if (!preview) {
          preview = document.createElement("div");
          preview.className = "vr-gauge-preview";
          preview.style.setProperty("--vr-pct", "0%");

          const frame = el.querySelector(".vr-gauge-frame");
          if (frame) {
            try {
              const pos = getComputedStyle(frame).position;
              if (pos === "static") frame.style.position = "relative";
            } catch (_) {}
            frame.appendChild(preview);
          }
        }
      });
    },

    updateGauges() {
      const gaugesCfg = this.universeConfig?.gauges || [];
      const gaugeEls = document.querySelectorAll(".vr-gauge");

      const isPeek = (() => {
        try { return document.body.classList.contains("vr-peek-mode"); }
        catch (_) { return false; }
      })();

      let hasCriticalGauge = false;

      gaugeEls.forEach((gEl, idx) => {
        const cfg = gaugesCfg[idx];
        const gaugeId = gEl?.dataset?.gaugeId || cfg?.id || null;
        if (!gaugeId) return;

        const val =
          (window.VRState?.getGaugeValue?.(gaugeId) ??
            this.universeConfig?.initialGauges?.[gaugeId] ??
            cfg?.start ??
            50);

        const safeVal = clamp(Number(val) || 0, 0, 100);

        const fillEl = gEl.querySelector(".vr-gauge-fill");
        if (fillEl) {
          fillEl.dataset.gaugeId = gaugeId;
          fillEl.style.setProperty("--vr-pct", `${safeVal}%`);
        }

        const valEl = gEl.querySelector(".vr-gauge-val");
        if (valEl) valEl.textContent = isPeek ? `${Math.round(safeVal)}%` : "";

        const deltaEl = gEl.querySelector(".vr-gauge-delta");
        if (deltaEl) deltaEl.textContent = "";

        const previewEl = gEl.querySelector(".vr-gauge-preview");
        if (previewEl) previewEl.style.setProperty("--vr-pct", "0%");

        gEl.classList.remove("vr-critical-low", "vr-critical-high");

        if (safeVal <= 10) {
          gEl.classList.add("vr-critical-low");
          hasCriticalGauge = true;
        } else if (safeVal >= 90) {
          gEl.classList.add("vr-critical-high");
          hasCriticalGauge = true;
        }
      });

      this._setCriticalAlarmState(hasCriticalGauge);
      try { window.VRTokenUI?.maybeOfferCriticalGauge?.(); } catch (_) {}
      this._clearPeekClasses();
    },

    showCard(cardLogic) {
      this.currentCardLogic = cardLogic;
      const texts = this.cardTextsDict?.[cardLogic.id];
      if (!texts) {
        console.error("[VRUIBinding] Textes introuvables pour la carte", cardLogic.id);
        return;
      }

      const cardMain = document.getElementById("vr-card-main");
      const titleEl = document.getElementById("card-title");
      const bodyEl = document.getElementById("card-text");
      const choiceAEl = document.getElementById("choice-A");
      const choiceBEl = document.getElementById("choice-B");
      const choiceCEl = document.getElementById("choice-C");

      if (cardMain) cardMain.classList.remove("is-intro-rich-card");

      if (titleEl) {
        if (texts.title_html) titleEl.innerHTML = texts.title_html;
        else titleEl.textContent = texts.title || "";
      }

      if (bodyEl) {
        if (texts.body_html) bodyEl.innerHTML = texts.body_html;
        else bodyEl.textContent = texts.body || "";
      }

      if (cardMain && texts.title_html) {
        cardMain.classList.add("is-intro-rich-card");
      }

      if (choiceAEl) choiceAEl.textContent = texts.choices?.A || "";
      if (choiceBEl) choiceBEl.textContent = texts.choices?.B || "";
      if (choiceCEl) choiceCEl.textContent = texts.choices?.C || "";

      this._resetChoiceCards();
      this._clearPeek();
      this.updateGauges();
      try { window.VRIntroTutorial?.onCardShown?.(cardLogic); } catch (_) {}
    },

    _resetChoiceCards() {
      const btns = document.querySelectorAll(".vr-choice-button[data-choice]");
      btns.forEach((b) => {
        b.style.transition = "";
        b.style.transform = "";
      });
    },

    _setupChoiceButtons() {
      const buttons = Array.from(document.querySelectorAll(".vr-choice-button[data-choice]"));

      buttons.forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });

        try { btn.style.touchAction = "none"; } catch (_) {}
        this._setupSwipeOnChoiceCard(btn);
      });
    },

    _setupSwipeOnChoiceCard(btn) {
      const TH = 62;
      const ROT_MAX = 12;
      const PREVIEW_TH = 12;
      let startX = 0;
      let startY = 0;
      let lastX = 0;
      let lastY = 0;
      let dragging = false;
      let pointerId = null;

      const getPoint = (e) => {
        if (e.touches && e.touches[0]) {
          return { x: e.touches[0].clientX || 0, y: e.touches[0].clientY || 0 };
        }
        return { x: e.clientX || 0, y: e.clientY || 0 };
      };

      const setTransform = (dx) => {
        const w = Math.max(1, window.innerWidth || 360);
        const p = clamp(dx / (w * 0.45), -1, 1);
        const rot = p * ROT_MAX;
        btn.style.transform = `translateX(${dx}px) rotate(${rot}deg)`;
      };

      const animateBack = () => {
        btn.style.transition = "transform 180ms cubic-bezier(.2,.9,.2,1)";
        btn.style.transform = "translateX(0px) rotate(0deg)";
        window.setTimeout(() => { btn.style.transition = ""; }, 200);
      };

      const animateFlyOut = (dx, choiceId, done) => {
        const dir = dx >= 0 ? 1 : -1;
        const outX = dir * (Math.max(window.innerWidth || 360, 360) * 1.2);

        try {
          const universeId =
            window.VREngine?.universeId ||
            window.VRGame?.currentUniverse ||
            document.body?.dataset?.universe ||
            localStorage.getItem("vrealms_universe") ||
            "hell_king";

          window.VRAudio?.playChoice?.(universeId);
        } catch (_) {}

        btn.style.transition = "transform 220ms cubic-bezier(.2,.9,.2,1)";
        btn.style.transform = `translateX(${outX}px) rotate(${dir * ROT_MAX}deg)`;

        window.setTimeout(() => {
          btn.style.transition = "";
          btn.style.transform = "";
          done && done();
        }, 235);
      };

      const onDown = (e) => {
        if (!this.currentCardLogic) return;

        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}

        dragging = true;
        const p = getPoint(e);
        startX = p.x;
        startY = p.y;
        lastX = p.x;
        lastY = p.y;

        pointerId = e.pointerId ?? null;
        try { if (pointerId != null) btn.setPointerCapture(pointerId); } catch (_) {}
      };

      const onMove = (e) => {
        if (!dragging) return;

        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}

        const p = getPoint(e);
        lastX = p.x;
        lastY = p.y;

        const dx = lastX - startX;
        const dy = lastY - startY;

        if (Math.abs(dy) > Math.abs(dx) * 1.25) {
          this._clearPeek();
          setTransform(dx * 0.25);
          return;
        }

        if (Math.abs(dx) >= PREVIEW_TH) {
          const choiceId = btn.getAttribute("data-choice");
          if (choiceId) {
            if (this.peekRemaining > 0) this._showPeekForChoice(choiceId);
            else this._showBlinkOnlyForChoice(choiceId);
          }
        } else {
          this._clearPeek();
        }

        setTransform(dx);
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;

        const dx = lastX - startX;
        this._clearPeek();

        if (Math.abs(dx) >= TH && this.currentCardLogic) {
          const choiceId = btn.getAttribute("data-choice");
          if (!choiceId) { animateBack(); return; }

          const cardLogic = this.currentCardLogic;

          animateFlyOut(dx, choiceId, () => {
            try {
              window.VREngine.applyChoice(cardLogic, choiceId);
            } catch (e) {
              console.error("[VR APPLY CHOICE ERROR]", e, {
                cardId: cardLogic?.id || null,
                choiceId
              });
            }
          });
        } else {
          animateBack();
        }
      };

      if (HAS_POINTER) {
        btn.addEventListener("pointerdown", onDown, { passive: false });
        btn.addEventListener("pointermove", onMove, { passive: false });
        btn.addEventListener("pointerup", onUp, { passive: true });
        btn.addEventListener("pointercancel", onUp, { passive: true });
      } else {
        btn.addEventListener("touchstart", onDown, { passive: false });
        btn.addEventListener("touchmove", onMove, { passive: false });
        btn.addEventListener("touchend", onUp, { passive: true });
        btn.addEventListener("touchcancel", onUp, { passive: true });
      }
    },

    _clearPeekClasses() {
      try {
        document.querySelectorAll(".vr-gauge").forEach((g) => {
          g.classList.remove("vr-peek-up");
          g.classList.remove("vr-peek-down");
        });
      } catch (_) {}
    },

    _clearPeek() {
      this._peekChoiceActive = null;

      try {
        document.querySelectorAll(".vr-gauge-preview").forEach((previewEl) => {
          previewEl.style.setProperty("--vr-pct", "0%");
        });

        document.querySelectorAll(".vr-gauge-delta").forEach((dEl) => {
          dEl.textContent = "";
        });
      } catch (_) {}

      this._clearPeekClasses();
    },

    _showBlinkOnlyForChoice(choiceId) {
      if (!this.currentCardLogic?.choices?.[choiceId]) return;

      this._clearPeekClasses();
      try {
        document.querySelectorAll(".vr-gauge-delta").forEach((dEl) => {
          dEl.textContent = "";
        });
      } catch (_) {}

      const deltas = this.currentCardLogic.choices[choiceId]?.gaugeDelta || {};
      for (const [gaugeId, delta] of Object.entries(deltas)) {
        if (typeof delta !== "number" || delta === 0) continue;

        const el = document.querySelector(`.vr-gauge[data-gauge-id="${gaugeId}"]`);
        if (!el) continue;

        el.classList.add(delta > 0 ? "vr-peek-up" : "vr-peek-down");
      }
    },

    _showPeekForChoice(choiceId) {
      if (!this.currentCardLogic?.choices?.[choiceId]) return;

      this._peekChoiceActive = choiceId;

      const gaugesCfg = this.universeConfig?.gauges || [];
      const gaugeEls = document.querySelectorAll(".vr-gauge");
      const previewEls = document.querySelectorAll(".vr-gauge-preview");

      gaugeEls.forEach((g, idx) => {
        g.classList.remove("vr-peek-up");
        g.classList.remove("vr-peek-down");

        const cfg = gaugesCfg[idx];
        const gaugeId = g?.dataset?.gaugeId || cfg?.id || null;

        const currentVal =
          (gaugeId != null)
            ? (window.VRState?.getGaugeValue?.(gaugeId) ??
              this.universeConfig?.initialGauges?.[gaugeId] ??
              cfg?.start ??
              50)
            : 50;

        const valEl = g.querySelector(".vr-gauge-val");
        if (valEl) valEl.textContent = `${Math.round(Number(currentVal) || 0)}%`;

        const deltaEl = g.querySelector(".vr-gauge-delta");
        if (deltaEl) deltaEl.textContent = "";
      });

      previewEls.forEach((previewEl, idx) => {
        const cfg = gaugesCfg[idx];
        if (!cfg) return;

        const gaugeId = cfg.id;

        const baseVal =
          (window.VRState?.getGaugeValue?.(gaugeId) ??
            this.universeConfig?.initialGauges?.[gaugeId] ??
            cfg?.start ??
            50);

        const d = this.currentCardLogic.choices[choiceId]?.gaugeDelta?.[gaugeId];
        const delta = (typeof d === "number") ? d : 0;

        const previewVal = clamp((Number(baseVal) || 0) + delta, 0, 100);
        previewEl.style.setProperty("--vr-pct", `${previewVal}%`);

        const gaugeEl = gaugeEls[idx];
        if (!gaugeEl) return;

        if (delta > 0) gaugeEl.classList.add("vr-peek-up");
        else if (delta < 0) gaugeEl.classList.add("vr-peek-down");

        const deltaEl = gaugeEl.querySelector(".vr-gauge-delta");
        if (deltaEl) {
          if (delta > 0) deltaEl.textContent = `+${Math.round(delta)}%`;
          else if (delta < 0) deltaEl.textContent = `-${Math.round(Math.abs(delta))}%`;
          else deltaEl.textContent = "";
        }
      });
    }
  };

  window.VRUIBinding = VRUIBinding;
})();


// -------------------------------------------------------
// State
// -------------------------------------------------------
(function () {
  "use strict";

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const VRState = {
    universeId: null,
    gauges: {},
    gaugeOrder: [],
    alive: false,
    lastDeath: null,
    reignYears: 0,
    cardsPlayed: 0,

    initUniverse(universeConfig) {
      this.universeId = universeConfig.id;
      this.gauges = {};
      this.gaugeOrder = [];
      this.alive = true;
      this.lastDeath = null;
      this.reignYears = 0;
      this.cardsPlayed = 0;

      (universeConfig.gauges || []).forEach((g) => {
        this.gauges[g.id] = universeConfig?.initialGauges?.[g.id] ?? g.start ?? 50;
        this.gaugeOrder.push(g.id);
      });
    },

    isAlive() { return this.alive; },
    getGaugeValue(id) { return this.gauges[id]; },

    setGaugeValue(id, val) {
      this.gauges[id] = clamp(Number(val ?? 50), 0, 100);
      this.lastDeath = null;
      this.alive = true;
    },

    applyDeltas(deltaMap) {
      if (!this.alive) return;

      Object.entries(deltaMap || {}).forEach(([gaugeId, delta]) => {
        const current = this.gauges[gaugeId] ?? 50;
        const next = clamp(current + delta, 0, 100);
        this.gauges[gaugeId] = next;
      });

      this.lastDeath = null;
      for (const gaugeId of Object.keys(this.gauges)) {
        const v = this.gauges[gaugeId];
        if (v <= 0) { this.alive = false; this.lastDeath = { gaugeId, direction: "down" }; break; }
        if (v >= 100) { this.alive = false; this.lastDeath = { gaugeId, direction: "up" }; break; }
      }
    },

    tickYear() { if (this.alive) this.reignYears += 1; },
    getReignYears() { return this.reignYears; },
    incrementCardsPlayed() { this.cardsPlayed += 1; },
    getLastDeath() { return this.lastDeath; }
  };

  window.VRState = VRState;
})();


// -------------------------------------------------------
// Endings
// -------------------------------------------------------
(function () {
  "use strict";

  const ENDINGS_BASE_PATH = "data/scenarios";
  const cache = new Map();

  async function loadEndings(universeId, lang) {
    const key = `${universeId}__${lang}`;
    if (cache.has(key)) return cache.get(key);

    const fileLang = (typeof window.normalizeScenarioLang === "function")
      ? window.normalizeScenarioLang(lang)
      : String(lang || "en").trim().toLowerCase().split(/[-_]/)[0];
    const urlNew = `${ENDINGS_BASE_PATH}/${universeId}/endings_${fileLang}.json`;
    const urlOld1 = `data/i18n/${lang}/endings_${universeId}.json`;
    const urlOld2 = `data/i18n/endings_${universeId}_${lang}.json`;

    let res = await fetch(urlNew, { cache: "no-cache" });
    if (!res.ok) res = await fetch(urlOld1, { cache: "no-cache" });
    if (!res.ok) res = await fetch(urlOld2, { cache: "no-cache" });

    if (!res.ok) {
      const empty = {};
      cache.set(key, empty);
      return empty;
    }

    const data = await res.json();
    const safe = data && typeof data === "object" ? data : {};
    cache.set(key, safe);
    return safe;
  }

  async function showEnding(universeConfig, lastDeath) {
    const overlay = document.getElementById("vr-ending-overlay");
    const titleEl = document.getElementById("ending-title");
    const textEl = document.getElementById("ending-text");

    if (!overlay || !titleEl || !textEl) return;

    const universeId =
      universeConfig?.id || localStorage.getItem("vrealms_universe") || "hell_king";

    let lang = "en";
    try {
      const me = await window.VRProfile?.getMe?.(4000);
      lang = (me?.lang || "en").toString();
    } catch (_) {
      lang = localStorage.getItem("vuniverse_lang") || localStorage.getItem("vrealms_lang") || "en";
    }

    const endings = await loadEndings(universeId, lang);

    const gaugeId = lastDeath?.gaugeId || null;
    const direction = lastDeath?.direction || null;

    const candidates = [];
    let value = null;
    if (direction === "down") value = "0";
    if (direction === "up") value = "100";

    if (gaugeId && direction) {
      candidates.push(`${gaugeId}_${direction}`);
    }
    if (gaugeId && value != null) {
      candidates.push(`${gaugeId}_${value}`);
      candidates.push(`end_${gaugeId}_${value}`);

      const esc = String(gaugeId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reEnd = new RegExp(`(^|_)end_${esc}_${value}$`);
      for (const k of Object.keys(endings || {})) {
        if (reEnd.test(k)) candidates.push(k);
      }
    }

    candidates.push("default");

    let ending = null;
    for (const k of candidates) {
      if (k && endings && endings[k]) { ending = endings[k]; break; }
    }

    const t = (key) => {
      try {
        const out = window.VRI18n?.t?.(key);
        if (out && out !== key) return out;
      } catch (_) {}
      return "";
    };

    titleEl.textContent = ending?.title || t("game.ending.title");
    textEl.textContent =
      ending?.text || ending?.body || t("game.ending.body");

    overlay.classList.add("vr-ending-visible");
  }

  function hideEnding() {
    const overlay = document.getElementById("vr-ending-overlay");
    if (!overlay) return;
    overlay.classList.remove("vr-ending-visible");
  }

  window.VREndings = { showEnding, hideEnding };
})();


// -------------------------------------------------------
// Engine core
// -------------------------------------------------------
(function () {
  "use strict";

  const RECENT_MEMORY_SIZE = 4;
  const BASE_COINS_PER_CARD = 5;
  const HISTORY_MAX = 30;

  const CHOICES_PER_YEAR = 4;
  const VCOINS_PER_YEAR = 10;

  function toRoman(num) {
    const n = Math.max(1, Number(num || 1));
    const map = [
      [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
      [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
      [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
    ];

    let rest = n;
    let out = "";

    for (const [value, symbol] of map) {
      while (rest >= value) {
        out += symbol;
        rest -= value;
      }
    }

    return out || "I";
  }

  function getProfilePseudo() {
    try {
      const raw =
        window.VUserData?.getUsername?.() ||
        window.VUserData?.load?.()?.username ||
        "";

      const clean = String(raw || "").trim();
      return clean || "—";
    } catch (_) {
      return "—";
    }
  }

  function getResolvedChoicesCount() {
    try {
      return Math.max(0, Number(window.VRGame?.session?.reignLength || 0));
    } catch (_) {
      return 0;
    }
  }

  function getCompletedYearsCount() {
    return Math.floor(getResolvedChoicesCount() / CHOICES_PER_YEAR);
  }

  function getDisplayedYearIndex() {
    return getCompletedYearsCount() + 1;
  }

  const MUSIC_PROMPT_MIN_CHOICES = 8;
  const MUSIC_PROMPT_PENDING_KEY = "vr_music_pending_index_prompt_v1";
  const MUSIC_PROMPT_SHOWN_KEY = "vr_music_prompt_shown_v1";

  function prepareMusicPromptOnNextIndex(universeId) {
    try {
      if (String(universeId || "").trim() === "intro") return false;

      const alreadyShown = localStorage.getItem(MUSIC_PROMPT_SHOWN_KEY) === "1";
      if (alreadyShown) return false;

      const existingChoice = localStorage.getItem("vrealms_music_enabled");
      if (existingChoice === "1" || existingChoice === "0") return false;

      const choices = getResolvedChoicesCount();
      if (choices < MUSIC_PROMPT_MIN_CHOICES) return false;

      localStorage.setItem(MUSIC_PROMPT_PENDING_KEY, "1");
      return true;
    } catch (_) {
      return false;
    }
  }

  function getYearLabel() {
    let label = "";

    try {
      const out = window.VRI18n?.t?.("game.year_label");
      if (out && out !== "game.year_label") label = out;
    } catch (_) {}

    return label ? `${label} ${toRoman(getDisplayedYearIndex())}` : `${toRoman(getDisplayedYearIndex())}`;
  }

  function getDynastyName() {
    return `${getProfilePseudo()} ${toRoman(getDisplayedYearIndex())}`;
  }

  window.VRRuntimeText = window.VRRuntimeText || {};
  window.VRRuntimeText.getDynastyName = getDynastyName;
  window.VRRuntimeText.getYearLabel = getYearLabel;

  function deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  }

  function asInt(x, fallback) {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : (fallback || 0);
  }

  function ensureEndingEnhancements() {
    try {
      if (!document.getElementById("vr-ending-inline-style")) {
        const style = document.createElement("style");
        style.id = "vr-ending-inline-style";
        style.textContent = `
  #vr-ending-overlay .vr-ending-card{
    text-align:center;
    align-items:stretch;
    gap:10px;
  }

  #vr-ending-overlay .vr-ending-title,
  #vr-ending-overlay .vr-ending-text{
    text-align:center !important;
  }

  #vr-ending-overlay .vr-ending-reward{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    padding:0;
    margin:0 0 2px;
    background:transparent;
    border:none;
    box-shadow:none;
  }

  #vr-ending-overlay .vr-ending-reward img{
    width:24px;
    height:24px;
    object-fit:contain;
    filter:drop-shadow(0 4px 8px rgba(0,0,0,.28));
    transform:translateY(1px);
  }

  #vr-ending-overlay .vr-ending-reward strong{
    font-size:18px;
    font-weight:950;
    letter-spacing:.2px;
    line-height:1;
  }

  #vr-ending-overlay .vr-choice-button{
    width:auto !important;
    min-width:0 !important;
    max-width:max-content !important;
    min-height:0 !important;
    padding:5px 12px !important;
    border-radius:14px !important;
    line-height:1.05 !important;
    display:inline-flex !important;
    align-items:center !important;
    justify-content:center !important;
    align-self:center !important;
    margin-left:auto !important;
    margin-right:auto !important;
  }

  #vr-ending-overlay .vr-choice-button span{
    line-height:1.05 !important;
  }

  #vr-ending-overlay .vr-ending-double{
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:3px;
  width:100%;
  min-height:50px;
  height:50px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:14px;
  padding:8px 12px;
  box-sizing:border-box;
  background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05));
  box-shadow:0 10px 20px rgba(0,0,0,.24);
  color:#fff;
  font:inherit;
  cursor:pointer;
  margin:4px 0 10px;
}

  #vr-ending-overlay .vr-ending-double::before{
    content:"";
    position:absolute;
    inset:0;
    background:radial-gradient(circle at 50% 18%, rgba(255,255,255,.18), transparent 55%);
    pointer-events:none;
  }

  #vr-ending-overlay .vr-ending-double.is-glow{
    animation:vrEndingPulse .8s linear infinite;
  }

  #vr-ending-overlay .vr-ending-double[disabled]{
    opacity:.72;
    cursor:default;
    animation:none !important;
  }

  #vr-ending-overlay .vr-ending-double-title{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    font-size:16px;
    font-weight:950;
    line-height:1.02;
  }

  #vr-ending-overlay .vr-ending-double-title img{
    width:20px;
    height:20px;
    object-fit:contain;
    filter:drop-shadow(0 4px 8px rgba(0,0,0,.34));
  }

  #vr-ending-overlay .vr-ending-double-sub{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  font-size:14px;
  font-weight:900;
  line-height:1.05;
  opacity:1;
}

  #vr-ending-overlay .vr-ending-double-sub img{
    width:14px;
    height:14px;
    object-fit:contain;
    filter:drop-shadow(0 3px 6px rgba(0,0,0,.28));
  }

  #vr-ending-overlay .vr-ending-actions{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
    margin-top:4px;
  }

  #vr-ending-overlay .vr-ending-actions .vr-choice-button{
    width:auto !important;
    max-width:max-content !important;
  }

  #vr-ending-overlay .vr-ending-actions-bottom{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
  }

  @keyframes vrEndingPulse{
  0%,100%{ opacity:1; transform:scale(1); filter:brightness(1); }
  50%{ opacity:.82; transform:scale(1.05); filter:brightness(1.34); }
}

  #vr-ending-overlay #ending-revive-btn,
  #vr-ending-overlay #ending-restart-btn,
  #vr-ending-overlay #ending-return-btn{
    width:100% !important;
    max-width:none !important;
    min-width:0 !important;
    min-height:42px !important;
    height:42px !important;
    padding:5px 10px !important;
    box-sizing:border-box !important;
    border:1px solid rgba(255,255,255,.14) !important;
    border-radius:14px !important;
    background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05)) !important;
    box-shadow:0 10px 20px rgba(0,0,0,.24) !important;
    color:#fff !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    font-size:16px !important;
    font-weight:950 !important;
    line-height:1.02 !important;
    margin:0 !important;
  }
`;
        document.head.appendChild(style);
      }

      const card = document.querySelector("#vr-ending-overlay .vr-ending-card");
      const textEl = document.getElementById("ending-text");
      const restartBtn = document.getElementById("ending-restart-btn");
      const reviveBtn = document.getElementById("ending-revive-btn");
      const returnBtn = document.getElementById("ending-return-btn");
      if (!card || !textEl || !restartBtn || !reviveBtn || !returnBtn) return;

      let reward = document.getElementById("ending-reward-row");
      if (!reward) {
        reward = document.createElement("div");
        reward.id = "ending-reward-row";
        reward.className = "vr-ending-reward";
        reward.innerHTML = `
          <img src="assets/img/ui/vcoins.webp" alt="" draggable="false">
          <strong id="ending-reward-value">+0</strong>
        `;
        textEl.insertAdjacentElement("afterend", reward);
      }

      let doubleBtn = document.getElementById("ending-double-btn");
      if (!doubleBtn) {
        doubleBtn = document.createElement("button");
        doubleBtn.id = "ending-double-btn";
        doubleBtn.type = "button";
        doubleBtn.className = "vr-ending-double is-glow";
        doubleBtn.innerHTML = `
          <span class="vr-ending-double-title" id="ending-double-title-wrap">
            <span id="ending-double-title"></span>
          </span>
          <span class="vr-ending-double-sub" id="ending-double-sub"></span>
        `;
        reward.insertAdjacentElement("afterend", doubleBtn);
      }

      let actions = document.getElementById("ending-actions-wrap");
      if (!actions) {
        actions = document.createElement("div");
        actions.id = "ending-actions-wrap";
        actions.className = "vr-ending-actions";
        doubleBtn.insertAdjacentElement("afterend", actions);
        actions.appendChild(reviveBtn);

        const bottom = document.createElement("div");
        bottom.className = "vr-ending-actions-bottom";
        bottom.appendChild(restartBtn);
        bottom.appendChild(returnBtn);
        actions.appendChild(bottom);
      }
    } catch (_) {}
  }

  const VREngine = {
    universeId: null,
    universeConfig: null,
    deck: [],
    cardTextsDict: {},
    currentCardLogic: null,
    recentCards: [],
    reignIndex: 0,
    coinsStreak: 0,
    lang: "en",
    _reviveUsed: false,
    history: [],
    _uiCoins: 0,
    _uiTokens: 0,
    _restored: false,
    eventsLogic: { events: [] },
    eventsTexts: {},
    _eventById: new Map(),
    _allEventIds: [],
    _seenEvents: [],
    _cardsSinceEventRoll: 0,
    _eventShowing: false,
    _deathUiBound: false,
    _pendingRunBonusCoins: 0,
    _pendingEndReward: 0,
    _pendingEndChoices: 0,
    _pendingEndYears: 0,
    _pendingEndClaimed: false,
    _pendingEndClaimMultiplier: 1,
    _pendingEndClaimAmount: 0,
    _pendingEndFinalized: false,

    _clearPendingEndState() {
      this._pendingEndReward = 0;
      this._pendingEndChoices = 0;
      this._pendingEndYears = 0;
      this._pendingEndClaimed = false;
      this._pendingEndClaimMultiplier = 1;
      this._pendingEndClaimAmount = 0;
      this._pendingEndFinalized = false;
    },

    _preparePendingEndReward() {
      this._pendingEndChoices = getResolvedChoicesCount();
      this._pendingEndYears = getCompletedYearsCount();
      this._pendingEndReward = Math.max(0, (this._pendingEndYears * VCOINS_PER_YEAR) + asInt(this._pendingRunBonusCoins, 0));
      this._pendingEndClaimed = false;
      this._pendingEndClaimMultiplier = 1;
      this._pendingEndClaimAmount = 0;
      this._pendingEndFinalized = false;
      return {
        choices: this._pendingEndChoices,
        years: this._pendingEndYears,
        reward: this._pendingEndReward
      };
    },

    async _claimPendingEndReward(rewardSpec) {
      const base = Math.max(0, asInt(this._pendingEndReward, 0));
      const spec = (rewardSpec && typeof rewardSpec === "object")
        ? rewardSpec
        : { multiplier: rewardSpec };

      const fixedAmount = (spec.fixedAmount == null)
        ? null
        : Math.max(0, asInt(spec.fixedAmount, 0));

      const mult = fixedAmount !== null ? 1 : Math.max(1, asInt(spec.multiplier, 1));

      if (this._pendingEndClaimed) {
        return {
          ok: true,
          amount: Math.max(
            0,
            asInt(
              this._pendingEndClaimAmount,
              fixedAmount !== null
                ? fixedAmount
                : base * Math.max(1, asInt(this._pendingEndClaimMultiplier, 1))
            )
          ),
          already: true
        };
      }

      const amount = fixedAmount !== null
        ? fixedAmount
        : Math.max(0, base * mult);

      if (amount > 0) {
        if (!window.VUserData || typeof window.VUserData.addVcoinsAsync !== "function") {
          return { ok: false, amount: 0 };
        }

        const beforeCoins = Number(window.VUserData.getVcoins?.() || 0);

        try {
          await window.VUserData.addVcoinsAsync(amount);
          await window.VUserData.refresh?.();
        } catch (_) {
          return { ok: false, amount: 0 };
        }

        const afterCoins = Number(window.VUserData.getVcoins?.() || beforeCoins);
        if (afterCoins < beforeCoins + amount) {
          return { ok: false, amount: 0 };
        }
      }

      this._pendingEndClaimed = true;
      this._pendingEndClaimMultiplier = fixedAmount !== null ? 1 : mult;
      this._pendingEndClaimAmount = amount;

      try {
        const me = await window.VRProfile?.getMe?.(0);
        if (me) {
          this._uiCoins = window.VRProfile._n(me.vcoins);
          this._uiTokens = window.VRProfile._n(me.jetons);
        } else {
          this._uiCoins = Number(window.VUserData?.getVcoins?.() || this._uiCoins || 0);
          this._uiTokens = Number(window.VUserData?.getJetons?.() || this._uiTokens || 0);
        }
      } catch (_) {
        this._uiCoins = Number(window.VUserData?.getVcoins?.() || this._uiCoins || 0);
        this._uiTokens = Number(window.VUserData?.getJetons?.() || this._uiTokens || 0);
      }

      try {
        window.VRUIBinding?.updateMeta?.(getDynastyName(), getYearLabel(), this._uiCoins, this._uiTokens);
      } catch (_) {}

      this._saveRunSoft();
      return { ok: true, amount, already: false };
    },

    async _finalizeEndedRun(rewardSpec) {
      if (!this._pendingEndFinalized) {
        const claimed = await this._claimPendingEndReward(rewardSpec || 1);
        if (!claimed?.ok) return { ok: false, amount: 0 };

        await window.VRGame?.onRunEnded?.();
        this._pendingEndFinalized = true;
        this._saveRunSoft();
        return { ok: true, amount: claimed.amount || 0 };
      }

      return {
        ok: true,
        amount: Math.max(
          0,
          asInt(
            this._pendingEndClaimAmount,
            asInt(this._pendingEndReward, 0) * Math.max(1, asInt(this._pendingEndClaimMultiplier, 1))
          )
        )
      };
    },

    _rebuildEventIndex() {
      this._eventById = new Map();
      const arr = Array.isArray(this.eventsLogic?.events) ? this.eventsLogic.events : [];
      arr.forEach((ev) => {
        if (ev && ev.id) this._eventById.set(ev.id, ev);
      });

      this._allEventIds = Array.from(this._eventById.keys());

      if (!Array.isArray(this._seenEvents)) this._seenEvents = [];

      const allow = new Set(this._allEventIds);
      this._seenEvents = this._seenEvents.filter(id => allow.has(id));

      if (!Number.isFinite(this._cardsSinceEventRoll)) this._cardsSinceEventRoll = 0;
    },

    _makeSavePayload() {
      try {
        return {
          state: {
            alive: !!window.VRState?.alive,
            lastDeath: window.VRState?.lastDeath || null,
            reignYears: Number(window.VRState?.reignYears || 0),
            cardsPlayed: Number(window.VRState?.cardsPlayed || 0),
            gauges: deepClone(window.VRState?.gauges || {})
          },
          engine: {
            reignIndex: Number(this.reignIndex || 0),
            recentCards: deepClone(this.recentCards || []),
            coinsStreak: Number(this.coinsStreak || 0),
            currentCardId: this.currentCardLogic?.id || null,
            reviveUsed: !!this._reviveUsed,
            events: {
              cardsSinceRoll: asInt(this._cardsSinceEventRoll, 0),
              seen: Array.isArray(this._seenEvents) ? deepClone(this._seenEvents) : []
            },
            pending: {
              runBonusCoins: asInt(this._pendingRunBonusCoins, 0),
              endReward: asInt(this._pendingEndReward, 0),
              endChoices: asInt(this._pendingEndChoices, 0),
              endYears: asInt(this._pendingEndYears, 0),
              endClaimed: !!this._pendingEndClaimed,
              endClaimMultiplier: asInt(this._pendingEndClaimMultiplier, 1),
              endClaimAmount: asInt(this._pendingEndClaimAmount, 0),
              endFinalized: !!this._pendingEndFinalized
            }
          },
          session: {
            reignLength: Number(window.VRGame?.session?.reignLength || 0)
          }
        };
      } catch (_) {
        return null;
      }
    },

    _saveRunSoft() {
      try {
        const universeId =
          this.universeId ||
          window.VRState?.universeId ||
          localStorage.getItem("vrealms_universe") ||
          "unknown";

        const payload = this._makeSavePayload();
        if (!payload) return;
        window.VRSave?.save?.(universeId, payload);
      } catch (_) {}
    },

    _clearBrokenRunSave() {
      try {
        const universeId =
          this.universeId ||
          window.VRState?.universeId ||
          localStorage.getItem("vrealms_universe") ||
          "unknown";
        window.VRSave?.clear?.(universeId);
      } catch (_) {}
    },

    _isTerminalGaugeState(gauges) {
      try {
        for (const v of Object.values(gauges || {})) {
          const n = Number(v);
          if (!Number.isFinite(n)) return true;
          if (n <= 0 || n >= 100) return true;
        }
      } catch (_) {
        return true;
      }
      return false;
    },

    _restoreFromSaveIfAny() {
      try {
        const universeId = this.universeId;
        if (!universeId) return false;

        const saved = window.VRSave?.load?.(universeId);
        if (!saved) return false;

        const s = saved.state || {};
        const e = saved.engine || {};
        const sess = saved.session || {};

        if (!s || typeof s !== "object" || !s.gauges || typeof s.gauges !== "object") {
          this._clearBrokenRunSave();
          return false;
        }

        if (s.alive === false) {
          this._clearBrokenRunSave();
          return false;
        }

        if (this._isTerminalGaugeState(s.gauges)) {
          this._clearBrokenRunSave();
          return false;
        }

        window.VRState.gauges = deepClone(s.gauges) || window.VRState.gauges;
        window.VRState.alive = true;
        window.VRState.lastDeath = null;
        window.VRState.reignYears = Number(s.reignYears || 0);
        window.VRState.cardsPlayed = Number(s.cardsPlayed || 0);

        this.reignIndex = Math.max(0, Number(e.reignIndex || 0));
        this.recentCards = Array.isArray(e.recentCards) ? deepClone(e.recentCards) : [];
        this.coinsStreak = Number(e.coinsStreak || 0);
        this._reviveUsed = !!e.reviveUsed;

        const evs = e.events || {};
        this._cardsSinceEventRoll = asInt(evs.cardsSinceRoll, 0);
        this._seenEvents = Array.isArray(evs.seen) ? deepClone(evs.seen) : [];

        const pending = e.pending || {};
        this._pendingRunBonusCoins = asInt(pending.runBonusCoins, 0);
        this._pendingEndReward = asInt(pending.endReward, 0);
        this._pendingEndChoices = asInt(pending.endChoices, 0);
        this._pendingEndYears = asInt(pending.endYears, 0);
        this._pendingEndClaimed = !!pending.endClaimed;
        this._pendingEndClaimMultiplier = Math.max(1, asInt(pending.endClaimMultiplier, 1));
        this._pendingEndClaimAmount = asInt(pending.endClaimAmount, 0);
        this._pendingEndFinalized = !!pending.endFinalized;

        if (window.VRGame?.session) {
          window.VRGame.session.reignLength = Number(sess.reignLength || 0);
        }

        const cardId = e.currentCardId || null;
        const card = cardId ? this.deck.find(c => c && c.id === cardId) : null;

        if (card) {
          this.currentCardLogic = card;
          window.VRUIBinding.showCard(card);
        } else {
          const deck = this.deck || [];
          if (!deck.length) {
            this._clearBrokenRunSave();
            return false;
          }

          const candidates = deck.filter(c => c && !this.recentCards.includes(c.id));
          const pool = candidates.length ? candidates : deck;
          const picked = pool[Math.floor(Math.random() * pool.length)];
          if (!picked) {
            this._clearBrokenRunSave();
            return false;
          }

          this.currentCardLogic = picked;
          window.VRUIBinding.showCard(picked);
        }

        window.VRUIBinding.updateGauges();

        const kingName = getDynastyName();
        window.VRUIBinding.updateMeta(
          kingName,
          getYearLabel(),
          this._uiCoins,
          this._uiTokens
        );

        this._restored = true;
        return true;
      } catch (_) {
        this._clearBrokenRunSave();
        return false;
      }
    },

    async init(universeId, lang) {
      this.universeId = universeId;

      let finalLang = (lang || "en").toString();
      try {
        const me = await window.VRProfile?.getMe?.(4000);
        finalLang = (me?.lang || finalLang || "en").toString();
      } catch (_) {}
      this.lang = finalLang;

      const { config, deck, cardTexts } =
        await window.VREventsLoader.loadUniverseData(universeId, this.lang);

      let eventsLogic = { events: [] };
      let eventsTexts = {};
      try {
        const ev = await window.VREventsLoader.loadUniverseEvents(universeId, this.lang);
        eventsLogic = ev?.eventsLogic || { events: [] };
        eventsTexts = ev?.eventsTexts || {};
      } catch (_) {}

      this.universeConfig = config;
      this.deck = Array.isArray(deck) ? deck : [];
      this.cardTextsDict = cardTexts || {};
      this.recentCards = [];
      this.reignIndex = 0;
      this.coinsStreak = 0;
      this.history = [];
      this.currentCardLogic = null;
      this._restored = false;
      this._reviveUsed = false;

      this.eventsLogic = eventsLogic || { events: [] };
      this.eventsTexts = eventsTexts || {};
      this._seenEvents = [];
      this._cardsSinceEventRoll = 0;
      this._eventShowing = false;
      this._pendingRunBonusCoins = 0;
      this._clearPendingEndState();
      this._rebuildEventIndex();

      try {
        const me = await window.VRProfile?.getMe?.(4000);

        if (me) {
          this._uiCoins = window.VRProfile._n(me.vcoins);
          this._uiTokens = window.VRProfile._n(me.jetons);
        } else {
          this._uiCoins = Number(window.VUserData?.getVcoins?.() || 0);
          this._uiTokens = Number(window.VUserData?.getJetons?.() || 0);
        }
      } catch (_) {
        this._uiCoins = Number(window.VUserData?.getVcoins?.() || 0);
        this._uiTokens = Number(window.VUserData?.getJetons?.() || 0);
      }

      if (String(universeId || "").trim() === "intro") {
        this._uiCoins = 100;
        this._uiTokens = 1;
      }

      window.VRState.initUniverse(this.universeConfig);
      window.VRUIBinding.init(this.universeConfig, this.lang, this.cardTextsDict);
      try { window.VRIntroTutorial?.onInit?.(universeId); } catch (_) {}

      const restored = this._restoreFromSaveIfAny();
      this._rebuildEventIndex();

      await this._refreshUIBalancesSoft();
      window.VRUIBinding.updateMeta(
        getDynastyName(),
        getYearLabel(),
        this._uiCoins,
        this._uiTokens
      );

      if (restored) {
      }

      try {
        await window.VRAnalytics?.screen?.("game_" + String(universeId || "unknown"), "GamePage");
      } catch (_) {}

      if (!restored) {
        this._startNewReign();
        this._saveRunSoft();

        if (String(universeId || "").trim() !== "intro") {
          try {
            await window.VRAnalytics?.log?.("game_start", {
              universe_id: String(universeId || "unknown")
            });
          } catch (_) {}
        }
      } else {
        this._saveRunSoft();
      }
    },

    async _refreshUIBalancesSoft() {
      if (String(this.universeId || "").trim() === "intro") return;

      try {
        const me = await window.VRProfile?.getMe?.(4000);
        if (me) {
          this._uiCoins = window.VRProfile._n(me.vcoins);
          this._uiTokens = window.VRProfile._n(me.jetons);
        } else {
          this._uiCoins = Number(window.VUserData?.getVcoins?.() || this._uiCoins || 0);
          this._uiTokens = Number(window.VUserData?.getJetons?.() || this._uiTokens || 0);
        }
      } catch (_) {
        this._uiCoins = Number(window.VUserData?.getVcoins?.() || this._uiCoins || 0);
        this._uiTokens = Number(window.VUserData?.getJetons?.() || this._uiTokens || 0);
      }
    },

    _resetGaugesToInitial() {
      try {
        const cfg = this.universeConfig || {};
        const init = (cfg && cfg.initialGauges) ? cfg.initialGauges : {};
        const gauges = (cfg.gauges || []);
        gauges.forEach((g) => {
          const v = (init && Object.prototype.hasOwnProperty.call(init, g.id)) ? init[g.id] : (g.start ?? 50);
          window.VRState.gauges[g.id] = (Number.isFinite(Number(v)) ? Number(v) : 50);
        });
      } catch (_) {}
    },

    _startNewReign() {
      this.reignIndex += 1;
      window.VRState.alive = true;
      window.VRState.lastDeath = null;
      window.VRState.reignYears = 0;
      window.VRState.cardsPlayed = 0;
      try { window.VRTokenUI?.resetRunHints?.(); } catch (_) {}

      this._resetGaugesToInitial();

      this.recentCards = [];
      this.coinsStreak = 0;
      this.history = [];
      this.currentCardLogic = null;
      this._reviveUsed = false;
      this._cardsSinceEventRoll = 0;
      this._pendingRunBonusCoins = 0;
      this._clearPendingEndState();

      const kingName = getDynastyName();
      const years = getYearLabel();

      window.VRUIBinding.updateMeta(kingName, years, this._uiCoins, this._uiTokens);

      this._nextCard();
      this._saveRunSoft();
    },

    _clearRunSave() {
      try {
        const universeId =
          this.universeId ||
          window.VRState?.universeId ||
          localStorage.getItem("vrealms_universe") ||
          "unknown";
        window.VRSave?.clear?.(universeId);
      } catch (_) {}
    },

    restartRun() {
      try { this._clearRunSave(); } catch (_) {}

      this._reviveUsed = false;
      this.history = [];
      this.recentCards = [];
      this.coinsStreak = 0;
      this.currentCardLogic = null;

      this.reignIndex = 0;
      this._cardsSinceEventRoll = 0;
      this._eventShowing = false;
      this._seenEvents = [];

      if (window.VRGame?.session) window.VRGame.session.reignLength = 0;
      this._startNewReign();
    },

    reviveSecondChance() {
      if (this._reviveUsed) return false;
      this._reviveUsed = true;
      this._clearPendingEndState();

      this._resetGaugesToInitial();
      try {
        window.VRState.alive = true;
        window.VRState.lastDeath = null;
      } catch (_) {}

      try { window.VRUIBinding?.updateGauges?.(); } catch (_) {}

      try { this._nextCard_internalOnly(); } catch (_) { try { this._nextCard(); } catch (_) {} }

      try { this._saveRunSoft(); } catch (_) {}
      return true;
    },

    _nextCard() {
      if (!window.VRState.isAlive()) return;
      if (this._eventShowing) return;

      if (!Array.isArray(this.deck) || this.deck.length === 0) {
        console.error("[VREngine] Deck vide : impossible de piocher une carte.");
        return;
      }

      if (String(this.universeId || "").trim() === "intro") {
        const introOrder = ["intro_001", "intro_002", "intro_003"];
        const currentId = String(this.currentCardLogic?.id || "").trim();
        const currentIndex = introOrder.indexOf(currentId);
        const nextId = currentIndex === -1
          ? introOrder[0]
          : introOrder[Math.min(currentIndex + 1, introOrder.length - 1)];

        const forcedCard = this.deck.find((c) => c && c.id === nextId);
        if (forcedCard) {
          this.currentCardLogic = forcedCard;

          if (forcedCard.id !== currentId) {
            this._rememberCard(forcedCard.id);
            window.VRState.incrementCardsPlayed();
          }

          window.VRUIBinding.showCard(forcedCard);
          this._saveRunSoft();
          return;
        }
      }

      const candidates = this.deck.filter((c) => !this.recentCards.includes(c.id));
      let card = null;

      if (candidates.length > 0) {
        card = candidates[Math.floor(Math.random() * candidates.length)];
      } else {
        card = this.deck[Math.floor(Math.random() * this.deck.length)];
      }

      if (!card) return;

      this.currentCardLogic = card;
      this._rememberCard(card.id);
      window.VRState.incrementCardsPlayed();
      window.VRUIBinding.showCard(card);

      this._saveRunSoft();
    },

    _rememberCard(cardId) {
      this.recentCards.push(cardId);
      if (this.recentCards.length > RECENT_MEMORY_SIZE) this.recentCards.shift();
    },

    _pushHistorySnapshot(cardLogic) {
      const snap = {
        cardId: cardLogic?.id || null,
        gauges: deepClone(window.VRState.gauges),
        alive: true,
        lastDeath: null,
        reignYears: window.VRState.reignYears,
        cardsPlayed: window.VRState.cardsPlayed,
        recentCards: deepClone(this.recentCards),
        coinsStreak: this.coinsStreak,
        uiCoins: this._uiCoins,
        uiTokens: this._uiTokens,
        sessionReignLength: Number(window.VRGame?.session?.reignLength || 0),
        cardsSinceEventRoll: asInt(this._cardsSinceEventRoll, 0),
        seenEvents: deepClone(this._seenEvents || [])
      };
      this.history.push(snap);
      if (this.history.length > HISTORY_MAX) this.history.shift();
    },

    undoChoices(steps) {
      const n = Math.max(1, Math.min(Number(steps || 1), 10));
      if (!this.history.length) return false;

      let snap = null;
      for (let i = 0; i < n; i++) {
        if (!this.history.length) break;
        snap = this.history.pop();
      }
      if (!snap) return false;

      window.VRState.gauges = deepClone(snap.gauges) || window.VRState.gauges;
      window.VRState.alive = true;
      window.VRState.lastDeath = null;
      window.VRState.reignYears = Number(snap.reignYears || 0);
      window.VRState.cardsPlayed = Number(snap.cardsPlayed || 0);

      this.recentCards = deepClone(snap.recentCards) || [];
      this.coinsStreak = Number(snap.coinsStreak || 0);
      this._uiCoins = Number(snap.uiCoins || 0);
      this._uiTokens = Number(snap.uiTokens || 0);

      this._cardsSinceEventRoll = asInt(snap.cardsSinceEventRoll, 0);
      this._seenEvents = Array.isArray(snap.seenEvents) ? deepClone(snap.seenEvents) : this._seenEvents;

      if (window.VRGame?.session) {
        window.VRGame.session.reignLength = Number(snap.sessionReignLength || 0);
      }

      const card = this.deck.find(c => c.id === snap.cardId) || this.currentCardLogic;
      if (card) {
        this.currentCardLogic = card;
        window.VRUIBinding.showCard(card);
      }

      window.VRUIBinding.updateGauges();

      const kingName = getDynastyName();
      window.VRUIBinding.updateMeta(
        kingName,
        getYearLabel(),
        this._uiCoins,
        this._uiTokens
      );

      this._saveRunSoft();
      return true;
    },

    applyChoice(cardLogic, choiceId) {
      if (!cardLogic || !cardLogic.choices || !cardLogic.choices[choiceId]) return;
      try {
        if (window.VRIntroTutorial?.beforeApplyChoice?.(cardLogic, choiceId) === false) return;
      } catch (_) {}

      this._pushHistorySnapshot(cardLogic);

      const choiceData = cardLogic.choices[choiceId];
      const deltas = choiceData.gaugeDelta || {};
      window.VRState.applyDeltas(deltas);

      this.coinsStreak += 1;

      try { window.VROneSignal?.markRealGamePlayed?.(); } catch (_) {}

      window.VRGame?.onCardResolved?.();
      window.VRState.reignYears = getCompletedYearsCount();

      const years = getYearLabel();
      const kingName = getDynastyName();
      window.VRUIBinding.updateMeta(kingName, years, this._uiCoins, this._uiTokens);
      window.VRUIBinding.updateGauges();

      try { window.VRUIBinding?._consumePeekDecision?.(); } catch (_) {}
      try { window.VRGame?.maybeShowInterstitial?.(); } catch (_) {}

      this._saveRunSoft();

      try {
        if (window.VRIntroTutorial?.afterApplyChoice?.(cardLogic, choiceId) === true) return;
      } catch (_) {}
      if (!window.VRState.isAlive()) {
        this._handleDeath();
        return;
      }

      const shouldEvent = this._maybeRollEventAfterCardResolved();
      if (shouldEvent) {
        this._triggerRandomEvent();
        return;
      }

      this._nextCard();
    },

    _nextCard_internalOnly() {
      this._nextCard();
    },

    _bindDeathUIOnce() {
      if (this._deathUiBound) return;
      this._deathUiBound = true;

      const revivePopup = document.getElementById("vr-revive-popup");

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        const rp = document.getElementById("vr-revive-popup");
        if (!rp) return;
        const open = (rp.style && rp.style.display === "flex") || rp.getAttribute("aria-hidden") === "false";
        if (open) {
          try { rp.__close?.(); } catch (_) {}
        }
      });

      if (revivePopup) {
        revivePopup.addEventListener("click", async (e) => {
          if (e.target === revivePopup) {
            try { revivePopup.__close?.(); } catch (_) {}
            return;
          }

          const btn = e.target?.closest?.("[data-revive-action]");
          if (!btn) return;

          const action = btn.getAttribute("data-revive-action");
          if (!action) return;

          try { await (revivePopup.__act?.(action, btn) || Promise.resolve()); } catch (_) {}
        });
      }
    },

    async _handleDeath() {
      const lastDeath = window.VRState.getLastDeath();
      try { window.VRAudio?.playDeath?.(); } catch (_) {}
      this._preparePendingEndReward();

      try {
        await window.VRAnalytics?.log?.("game_over", {
          universe_id: String(this.universeId || "unknown"),
          death_gauge: String(lastDeath?.gaugeId || ""),
          death_direction: String(lastDeath?.direction || ""),
          choices: Number(this._pendingEndChoices || 0),
          years: Number(this._pendingEndYears || 0),
          reward_base: Number(this._pendingEndReward || 0)
        });
      } catch (_) {}
      await window.VREndings.showEnding(this.universeConfig, lastDeath);
      ensureEndingEnhancements();

      const restartBtn = document.getElementById("ending-restart-btn");
      const reviveBtn = document.getElementById("ending-revive-btn");
      const returnBtn = document.getElementById("ending-return-btn");
      const doubleBtn = document.getElementById("ending-double-btn");
      const rewardValueEl = document.getElementById("ending-reward-value");

      const t = (key, fallback) => {
        try {
          const out = window.VRI18n?.t?.(key);
          if (out && out !== key) return out;
        } catch (_) {}
        return typeof fallback === "string" ? fallback : "";
      };

      const renderEndingReward = (displayAmount) => {
        const safeAmount = Math.max(0, asInt(displayAmount, 0));
        if (rewardValueEl) rewardValueEl.textContent = `+${safeAmount}`;
      };

      const getLiveTokenCount = () => {
        try {
          return Math.max(
            0,
            asInt(
              window.VUserData?.getJetons?.(),
              window.VREngine?._uiTokens || 0
            )
          );
        } catch (_) {
          return Math.max(0, asInt(window.VREngine?._uiTokens, 0));
        }
      };

      const syncEndingButtons = () => {
        const baseReward = Math.max(0, asInt(this._pendingEndReward, 0));
        const useFlat100 = baseReward < 100;
        const previewLabelAmount = useFlat100 ? 100 : Math.max(0, baseReward * 2);
        const hasTokenForRevive = getLiveTokenCount() > 0;

        if (doubleBtn) {
          if (this._pendingEndClaimed) {
            doubleBtn.style.display = "none";
          } else {
            doubleBtn.style.display = "";
            doubleBtn.classList.toggle("is-glow", true);
            doubleBtn.disabled = false;

            const titleWrap = doubleBtn.querySelector("#ending-double-title-wrap");
            const title = doubleBtn.querySelector("#ending-double-title");
            const sub = doubleBtn.querySelector("#ending-double-sub");

            if (titleWrap) {
              titleWrap.style.display = useFlat100 ? "none" : "flex";
            }

            if (title) {
              title.textContent = t("game.ending.double_gain", "");
            }

            if (sub) {
              sub.innerHTML = `
                <img src="assets/img/ui/vcoins.webp" alt="" draggable="false">
                <span>+${previewLabelAmount}</span>
              `;
            }
          }
        }

        if (reviveBtn) {
          reviveBtn.textContent = hasTokenForRevive
            ? t("game.ending.revive_token", "")
            : t("game.ending.revive_ad", "");
          reviveBtn.disabled = !!this._reviveUsed;
          reviveBtn.style.display = this._pendingEndClaimed ? "none" : "";
        }

        if (restartBtn) restartBtn.textContent = t("game.restart", "");
        if (returnBtn) returnBtn.textContent = t("game.return", "");
      };

      renderEndingReward(this._pendingEndReward);
      syncEndingButtons();
      this._saveRunSoft();

      if (doubleBtn) {
        doubleBtn.onclick = async () => {
          if (this._pendingEndClaimed) return;

          const baseReward = Math.max(0, asInt(this._pendingEndReward, 0));
          const useFlat100 = baseReward < 100;
          const rewardSpec = useFlat100 ? { fixedAmount: baseReward + 100 } : 2;

          try { doubleBtn.disabled = true; } catch (_) {}

          const okAd = await (window.VRAds?.showRewardedAd?.({
            placement: useFlat100 ? "end_reward_100" : "end_reward_x2"
          }) || Promise.resolve(false));

          if (okAd) {
            try { window.VRAds?.markGameRewardSeen?.(); } catch (_) {}
          }

          if (!okAd) {
            try { window.showToast?.(t("coins.toast.reward_fail", "")); } catch (_) {}
            syncEndingButtons();
            return;
          }

          const out = await this._finalizeEndedRun(rewardSpec);
          if (!out?.ok) {
            try { window.showToast?.(t("common.error_generic", "")); } catch (_) {}
            syncEndingButtons();
            return;
          }

          renderEndingReward(out.amount);

          try {
            await window.VRAnalytics?.log?.("end_reward_doubled", {
              universe_id: String(this.universeId || "unknown"),
              amount: Number(out.amount || 0),
              mode: useFlat100 ? "base_plus_100" : "x2"
            });
          } catch (_) {}

          syncEndingButtons();
        };
      }

      if (reviveBtn) {
        reviveBtn.onclick = async () => {
          if (this._reviveUsed || this._pendingEndClaimed) return;

          try { reviveBtn.disabled = true; } catch (_) {}

          const finishRevive = async () => {
            this._clearPendingEndState();
            window.VREndings.hideEnding();

            const did = this.reviveSecondChance();

            if (did) {
              try {
                await window.VRAnalytics?.log?.("game_revive_used", {
                  universe_id: String(this.universeId || "unknown"),
                  method: getLiveTokenCount() > 0 ? "token_or_fallback" : "rewarded_ad"
                });
              } catch (_) {}
            }

            if (!did) this.restartRun();
          };

          const hadTokenBeforeClick = getLiveTokenCount() > 0;

          if (hadTokenBeforeClick) {
            const ok = await (window.VUserData?.spendJetons?.(1) || Promise.resolve(false));
            if (ok) {
              await finishRevive();
              return;
            }
          }

          const okAd = await (window.VRAds?.showRewardedAd?.({
            placement: "revive"
          }) || Promise.resolve(false));

          if (okAd) {
            try { window.VRAds?.markGameRewardSeen?.(); } catch (_) {}
            await finishRevive();
            return;
          }

          try { window.showToast?.(t("token.toast.reward_fail", "")); } catch (_) {}
          syncEndingButtons();
        };
      }

      if (restartBtn) {
        restartBtn.onclick = async () => {
          if (!this._pendingEndFinalized) {
            const out = await this._finalizeEndedRun(1);
            if (!out?.ok) {
              try { window.showToast?.(t("common.error_generic", "")); } catch (_) {}
              return;
            }
            renderEndingReward(out.amount);
          }

          const skipBecauseRewardAd = !!this._pendingEndClaimed;

          try { window.VRCrossPromo?.notifyCompletedRun?.(); } catch (_) {}
          try {
            await window.VRCrossPromo?.maybeShowPostGamePromo?.({
              skipBecauseRewardAd: skipBecauseRewardAd
            });
          } catch (_) {}

          window.VREndings.hideEnding();
          this.restartRun();
        };
      }

      if (returnBtn) {
        returnBtn.onclick = async () => {
          if (!this._pendingEndFinalized) {
            const out = await this._finalizeEndedRun(1);
            if (!out?.ok) {
              try { window.showToast?.(t("common.error_generic", "")); } catch (_) {}
              return;
            }
            renderEndingReward(out.amount);
          }

          const skipBecauseRewardAd = !!this._pendingEndClaimed;

          try { window.VRCrossPromo?.notifyCompletedRun?.(); } catch (_) {}
          try {
            await window.VRCrossPromo?.maybeShowPostGamePromo?.({
              skipBecauseRewardAd: skipBecauseRewardAd
            });
          } catch (_) {}

          try { await window.VRAds?.maybeShowInterstitialOnReturnToIndex?.(); } catch (_) {}
          try { prepareMusicPromptOnNextIndex(this.universeId); } catch (_) {}
          try { window.VROneSignal?.markPromptPendingOnNextIndex?.(); } catch (_) {}
          try { this._clearRunSave(); } catch (_) {}
          try { window.location.href = "index.html"; } catch (_) {}
        };
      }

      this.coinsStreak = 0;
      this._saveRunSoft();
    }
  };

  window.VREngine = VREngine;
})();

// -------------------------------------------------------
// Event system patch — aligné sur logic_events.json / events_*.json
// -------------------------------------------------------
(function () {
  "use strict";

  const engine = window.VREngine;
  if (!engine) return;

  const clone = (obj) => {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  };

  const asInt = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : (fallback || 0);
  };

  function ensureEventState(ctx) {
    if (!ctx || typeof ctx !== "object") return;
    if (!Array.isArray(ctx._activeEvents)) ctx._activeEvents = [];
    if (!ctx._eventCooldowns || typeof ctx._eventCooldowns !== "object" || Array.isArray(ctx._eventCooldowns)) {
      ctx._eventCooldowns = {};
    }
    if (!Array.isArray(ctx._seenEvents)) ctx._seenEvents = [];
  }

  function sanitizeEventState(ctx) {
    ensureEventState(ctx);

    const allow = new Set(Array.isArray(ctx._allEventIds) ? ctx._allEventIds : []);

    ctx._activeEvents = ctx._activeEvents
      .filter((row) => row && allow.has(row.id))
      .map((row) => ({
        id: row.id,
        remainingCards: Math.max(0, asInt(row.remainingCards, 0)),
        perCardDelta: (row.perCardDelta && typeof row.perCardDelta === "object") ? clone(row.perCardDelta) : {}
      }))
      .filter((row) => row.remainingCards > 0);

    const nextCooldowns = {};
    Object.entries(ctx._eventCooldowns || {}).forEach(([id, value]) => {
      if (!allow.has(id)) return;
      const n = Math.max(0, asInt(value, 0));
      if (n > 0) nextCooldowns[id] = n;
    });
    ctx._eventCooldowns = nextCooldowns;
  }

  function getRollEveryCards(ctx) {
    return Math.max(1, asInt(ctx?.eventsLogic?.roll_every_cards, 3));
  }

  function getTriggerChance(ctx) {
    const raw = Number(ctx?.eventsLogic?.trigger_chance);
    if (!Number.isFinite(raw)) return 0.10;
    return Math.max(0, Math.min(1, raw));
  }

  function getCooldownCards(ctx) {
    return Math.max(0, asInt(ctx?.eventsLogic?.cooldown_cards, 25));
  }

  function getEventTexts(ctx, id) {
    const root = ctx?.eventsTexts;
    if (!root || typeof root !== "object") return null;
    return root?.events?.[id] || root?.[id] || null;
  }

  function getPerCardDelta(ev) {
    const a = ev?.effects?.per_card;
    if (a && typeof a === "object" && !Array.isArray(a)) return clone(a);

    const b = ev?.per_card;
    if (b && typeof b === "object" && !Array.isArray(b)) return clone(b);

    return {};
  }

  function getImmediateDelta(ev) {
    const direct = ev?.gaugeDelta || ev?.deltas || ev?.effects?.immediate || ev?.effects?.gaugeDelta;
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return clone(direct);
    return {};
  }

  function getEventDuration(ev) {
    return Math.max(0, asInt(ev?.duration_cards, ev?.duration || 0));
  }

  function applyActiveEventTicks(ctx) {
    ensureEventState(ctx);
    if (!Array.isArray(ctx._activeEvents) || !ctx._activeEvents.length) return;

    const next = [];

    ctx._activeEvents.forEach((row) => {
      const delta = (row?.perCardDelta && typeof row.perCardDelta === "object") ? row.perCardDelta : {};
      if (Object.keys(delta).length) {
        window.VRState.applyDeltas(delta);
      }

      const remaining = Math.max(0, asInt(row?.remainingCards, 0) - 1);
      if (remaining > 0) {
        next.push({
          id: row.id,
          remainingCards: remaining,
          perCardDelta: clone(delta)
        });
      }
    });

    ctx._activeEvents = next;
  }

  function tickEventCooldowns(ctx) {
    ensureEventState(ctx);
    const next = {};

    Object.entries(ctx._eventCooldowns || {}).forEach(([id, value]) => {
      const remaining = Math.max(0, asInt(value, 0) - 1);
      if (remaining > 0) next[id] = remaining;
    });

    ctx._eventCooldowns = next;
  }

  const originalRebuildEventIndex = engine._rebuildEventIndex;
  engine._rebuildEventIndex = function () {
    const out = originalRebuildEventIndex.apply(this, arguments);
    sanitizeEventState(this);
    return out;
  };

  const originalMakeSavePayload = engine._makeSavePayload;
  engine._makeSavePayload = function () {
    ensureEventState(this);
    const payload = originalMakeSavePayload.apply(this, arguments) || {};
    payload.engine = payload.engine || {};
    payload.engine.events = payload.engine.events || {};
    payload.engine.events.active = clone(this._activeEvents || []);
    payload.engine.events.cooldowns = clone(this._eventCooldowns || {});
    return payload;
  };

  const originalInit = engine.init;
  engine.init = async function () {
    const out = await originalInit.apply(this, arguments);
    ensureEventState(this);

    try {
      const saved = window.VRSave?.load?.(this.universeId);
      const evs = saved?.engine?.events || {};
      if (Array.isArray(evs.active)) this._activeEvents = clone(evs.active);
      if (evs.cooldowns && typeof evs.cooldowns === "object" && !Array.isArray(evs.cooldowns)) {
        this._eventCooldowns = clone(evs.cooldowns);
      }
    } catch (_) {}

    sanitizeEventState(this);
    this._saveRunSoft();
    return out;
  };

  const originalStartNewReign = engine._startNewReign;
  engine._startNewReign = function () {
    this._activeEvents = [];
    this._eventCooldowns = {};
    return originalStartNewReign.apply(this, arguments);
  };

  const originalRestartRun = engine.restartRun;
  engine.restartRun = function () {
    this._activeEvents = [];
    this._eventCooldowns = {};
    return originalRestartRun.apply(this, arguments);
  };

  const originalReviveSecondChance = engine.reviveSecondChance;
  engine.reviveSecondChance = function () {
    this._activeEvents = [];
    this._eventCooldowns = {};
    return originalReviveSecondChance.apply(this, arguments);
  };

  engine._pushHistorySnapshot = function (cardLogic) {
    ensureEventState(this);

    const snap = {
      cardId: cardLogic?.id || null,
      gauges: clone(window.VRState.gauges),
      alive: true,
      lastDeath: null,
      reignYears: window.VRState.reignYears,
      cardsPlayed: window.VRState.cardsPlayed,
      recentCards: clone(this.recentCards),
      coinsStreak: this.coinsStreak,
      uiCoins: this._uiCoins,
      uiTokens: this._uiTokens,
      sessionReignLength: Number(window.VRGame?.session?.reignLength || 0),
      cardsSinceEventRoll: asInt(this._cardsSinceEventRoll, 0),
      seenEvents: clone(this._seenEvents || []),
      activeEvents: clone(this._activeEvents || []),
      eventCooldowns: clone(this._eventCooldowns || {})
    };

    this.history.push(snap);
    if (this.history.length > 30) this.history.shift();
  };

  engine.undoChoices = function (steps) {
    const n = Math.max(1, Math.min(Number(steps || 1), 10));
    if (!this.history.length) return false;

    let snap = null;
    for (let i = 0; i < n; i++) {
      if (!this.history.length) break;
      snap = this.history.pop();
    }
    if (!snap) return false;

    window.VRState.gauges = clone(snap.gauges) || window.VRState.gauges;
    window.VRState.alive = true;
    window.VRState.lastDeath = null;
    window.VRState.reignYears = Number(snap.reignYears || 0);
    window.VRState.cardsPlayed = Number(snap.cardsPlayed || 0);

    this.recentCards = clone(snap.recentCards) || [];
    this.coinsStreak = Number(snap.coinsStreak || 0);
    this._uiCoins = Number(snap.uiCoins || 0);
    this._uiTokens = Number(snap.uiTokens || 0);

    this._cardsSinceEventRoll = asInt(snap.cardsSinceEventRoll, 0);
    this._seenEvents = Array.isArray(snap.seenEvents) ? clone(snap.seenEvents) : this._seenEvents;
    this._activeEvents = Array.isArray(snap.activeEvents) ? clone(snap.activeEvents) : [];
    this._eventCooldowns = (snap.eventCooldowns && typeof snap.eventCooldowns === "object" && !Array.isArray(snap.eventCooldowns))
      ? clone(snap.eventCooldowns)
      : {};

    if (window.VRGame?.session) {
      window.VRGame.session.reignLength = Number(snap.sessionReignLength || 0);
    }

    const card = this.deck.find((c) => c.id === snap.cardId) || this.currentCardLogic;
    if (card) {
      this.currentCardLogic = card;
      window.VRUIBinding.showCard(card);
    }

    sanitizeEventState(this);
    window.VRUIBinding.updateGauges();

    const kingName = window.VRRuntimeText?.getDynastyName?.() || "";
    const years = window.VRRuntimeText?.getYearLabel?.() || "";
    window.VRUIBinding.updateMeta(kingName, years, this._uiCoins, this._uiTokens);

    this._saveRunSoft();
    return true;
  };

  engine._maybeRollEventAfterCardResolved = function () {
    ensureEventState(this);
    this._cardsSinceEventRoll = asInt(this._cardsSinceEventRoll, 0) + 1;

    const rollEvery = getRollEveryCards(this);
    if (this._cardsSinceEventRoll < rollEvery) {
      this._saveRunSoft();
      return false;
    }

    this._cardsSinceEventRoll = 0;

    if (!Array.isArray(this._allEventIds) || !this._allEventIds.length) {
      this._saveRunSoft();
      return false;
    }

    const hit = Math.random() < getTriggerChance(this);
    this._saveRunSoft();
    return hit;
  };

  engine._pickRandomEventId = function () {
    ensureEventState(this);

    const all = Array.isArray(this._allEventIds) ? this._allEventIds.slice() : [];
    if (!all.length) return null;

    const available = all.filter((id) => asInt(this._eventCooldowns?.[id], 0) <= 0);
    const pool = available.length ? available : all;
    const idx = Math.floor(Math.random() * pool.length);
    const id = pool[idx] || null;
    if (id) this._seenEvents.push(id);
    return id;
  };

  engine._triggerRandomEvent = async function () {
    ensureEventState(this);
    if (this._eventShowing) return false;
    if (!window.VRState.isAlive()) return false;

    const id = this._pickRandomEventId();
    if (!id) return false;

    const ev = this._eventById.get(id) || null;
    const texts = getEventTexts(this, id) || {};

    try {
      const immediateDelta = getImmediateDelta(ev);
      if (Object.keys(immediateDelta).length) {
        window.VRState.applyDeltas(immediateDelta);
      }

      const perCardDelta = getPerCardDelta(ev);
      const durationCards = getEventDuration(ev);
      if (Object.keys(perCardDelta).length && durationCards > 0) {
        this._activeEvents.push({
          id,
          remainingCards: durationCards,
          perCardDelta: clone(perCardDelta)
        });
      }

      const cooldownCards = getCooldownCards(this);
      if (cooldownCards > 0) {
        this._eventCooldowns[id] = cooldownCards;
      }

      const dv =
        (typeof ev?.vcoins === "number") ? ev.vcoins :
        (typeof ev?.vcoinsDelta === "number") ? ev.vcoinsDelta :
        0;

      if (dv) {
        this._pendingRunBonusCoins += asInt(dv, 0);
      }

      const dj =
        (typeof ev?.jetons === "number") ? ev.jetons :
        (typeof ev?.jetonsDelta === "number") ? ev.jetonsDelta :
        0;

      if (dj) {
        if (dj > 0) {
          const beforeTokens = Number(window.VUserData?.getJetons?.() || this._uiTokens || 0);

          try {
            await window.VUserData?.addJetonsAsync?.(dj);
            await window.VUserData?.refresh?.();
          } catch (_) {}

          const afterTokens = Number(window.VUserData?.getJetons?.() || beforeTokens);
          if (afterTokens >= beforeTokens + dj) {
            this._uiTokens = afterTokens;
          }
        } else {
          const cost = Math.abs(dj);
          const ok = await (window.VUserData?.spendJetons?.(cost) || Promise.resolve(false));
          if (ok) this._uiTokens -= cost;
        }
      }
    } catch (e) {
      console.error("[VREngine] event apply error:", e);
    }

    sanitizeEventState(this);

    const kingName = window.VRRuntimeText?.getDynastyName?.() || "";
    const years = window.VRRuntimeText?.getYearLabel?.() || "";
    window.VRUIBinding.updateGauges();
    window.VRUIBinding.updateMeta(kingName, years, this._uiCoins, this._uiTokens);

    this._eventShowing = true;
    this._saveRunSoft();

    const title = texts?.title || "";
    const bodyParts = [texts?.body || texts?.text || "", texts?.effect || "", texts?.duration || ""].filter(Boolean);
    const body = bodyParts.join("\n\n");

    try {
      await window.VRGuideMentor?.showEvent?.(
        this.universeId || window.VRGame?.currentUniverse || "",
        title,
        body
      );
    } catch (_) {}

    this._eventShowing = false;

    if (!window.VRState.isAlive()) {
      await this._handleDeath();
      return true;
    }

    this._saveRunSoft();
    this._nextCard();
    return true;
  };

  engine.applyChoice = function (cardLogic, choiceId) {
    if (!cardLogic || !cardLogic.choices || !cardLogic.choices[choiceId]) return;
    try {
      if (window.VRIntroTutorial?.beforeApplyChoice?.(cardLogic, choiceId) === false) return;
    } catch (_) {}

    ensureEventState(this);
    try { if (typeof this._ensureMajorState === "function") this._ensureMajorState(); } catch (_) {}
    this._pushHistorySnapshot(cardLogic);

    const choiceData = cardLogic.choices[choiceId];
    const deltas = choiceData.gaugeDelta || {};
    window.VRState.applyDeltas(deltas);

    if (window.VRState.isAlive()) {
      applyActiveEventTicks(this);
      tickEventCooldowns(this);
      try { this._tickMajorCooldowns?.(); } catch (_) {}
    }

    this.coinsStreak += 1;

    try { window.VROneSignal?.markRealGamePlayed?.(); } catch (_) {}

    window.VRGame?.onCardResolved?.();
    window.VRState.reignYears = Math.floor((Math.max(0, Number(window.VRGame?.session?.reignLength || 0))) / 4);

    const years = window.VRRuntimeText?.getYearLabel?.() || "";
    const kingName = window.VRRuntimeText?.getDynastyName?.() || "";
    window.VRUIBinding.updateMeta(kingName, years, this._uiCoins, this._uiTokens);
    window.VRUIBinding.updateGauges();

    try { window.VRUIBinding?._consumePeekDecision?.(); } catch (_) {}
    try { window.VRGame?.maybeShowInterstitial?.(); } catch (_) {}

    sanitizeEventState(this);
    try { this._sanitizeMajorState?.(); } catch (_) {}
    this._saveRunSoft();

    try {
      if (window.VRIntroTutorial?.afterApplyChoice?.(cardLogic, choiceId) === true) return;
    } catch (_) {}

    if (!window.VRState.isAlive()) {
      this._handleDeath();
      return;
    }

    const shouldMajor = this._maybeRollMajorAfterCardResolved?.();
    if (shouldMajor) {
      this._triggerRandomMajor?.();
      return;
    }

    const shouldEvent = this._maybeRollEventAfterCardResolved();
    if (shouldEvent) {
      this._triggerRandomEvent();
      return;
    }

    this._nextCard();
  };
})();

// -------------------------------------------------------
// Major system patch — aligné sur logic_major_decisions.json / major_decisions_*.json
// -------------------------------------------------------
(function () {
  "use strict";

  const engine = window.VREngine;
  if (!engine) return;

  const clone = (obj) => {
    try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return obj; }
  };

  const asInt = (x, fallback) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : (fallback || 0);
  };

  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  function toast(msg) {
    try {
      if (typeof window.showToast === "function") return window.showToast(msg);
    } catch (_) {}
  }

  function ensureMajorState(ctx) {
    if (!ctx || typeof ctx !== "object") return;
    if (!ctx._majorById || typeof ctx._majorById?.get !== "function") ctx._majorById = new Map();
    if (!Array.isArray(ctx._allMajorIds)) ctx._allMajorIds = [];
    if (!Array.isArray(ctx._seenMajors)) ctx._seenMajors = [];
    if (!ctx._majorCooldowns || typeof ctx._majorCooldowns !== "object" || Array.isArray(ctx._majorCooldowns)) {
      ctx._majorCooldowns = {};
    }
    if (!Number.isFinite(ctx._cardsSinceMajorRoll)) ctx._cardsSinceMajorRoll = 0;
    if (typeof ctx._majorShowing !== "boolean") ctx._majorShowing = false;
    if (!ctx.majorsLogic || typeof ctx.majorsLogic !== "object") ctx.majorsLogic = { decisions: [] };
    if (!ctx.majorsTexts || typeof ctx.majorsTexts !== "object") ctx.majorsTexts = {};
  }

  function sanitizeMajorState(ctx) {
    ensureMajorState(ctx);
    const allow = new Set(Array.isArray(ctx._allMajorIds) ? ctx._allMajorIds : []);
    ctx._seenMajors = ctx._seenMajors.filter((id) => allow.has(id));

    const nextCooldowns = {};
    Object.entries(ctx._majorCooldowns || {}).forEach(([id, value]) => {
      if (!allow.has(id)) return;
      const n = Math.max(0, asInt(value, 0));
      if (n > 0) nextCooldowns[id] = n;
    });
    ctx._majorCooldowns = nextCooldowns;
  }

  function getMajorRollEveryCards(ctx) {
    return Math.max(1, asInt(ctx?.majorsLogic?.roll_every_cards, 5));
  }

  function getMajorTriggerChance(ctx) {
    const raw = Number(ctx?.majorsLogic?.trigger_chance);
    if (!Number.isFinite(raw)) return 0.18;
    return Math.max(0, Math.min(1, raw));
  }

  function getMajorGlobalCooldownCards(ctx) {
    return Math.max(0, asInt(ctx?.majorsLogic?.cooldown_cards, 10));
  }

  function getMajorDecisionCooldown(ctx, decision) {
    return Math.max(0, asInt(decision?.cooldown_cards, getMajorGlobalCooldownCards(ctx)));
  }

  function getMajorTexts(ctx, id) {
    const root = ctx?.majorsTexts;
    if (!root || typeof root !== "object") return null;
    return root?.decisions?.[id] || root?.[id] || null;
  }

  function isMajorEligible(ctx, decision) {
    if (!decision?.id) return false;
    if (Math.max(0, asInt(ctx?._majorCooldowns?.[decision.id], 0)) > 0) return false;
    const cardsPlayed = asInt(window.VRState?.cardsPlayed, 0);
    return cardsPlayed >= Math.max(0, asInt(decision?.min_cards_played, 0));
  }

  function finalizeGaugeState() {
    try {
      window.VRState.lastDeath = null;
      window.VRState.alive = true;
      for (const gaugeId of Object.keys(window.VRState?.gauges || {})) {
        const v = Number(window.VRState.gauges[gaugeId]);
        if (!Number.isFinite(v)) {
          window.VRState.alive = false;
          window.VRState.lastDeath = { gaugeId, direction: "down" };
          break;
        }
        if (v <= 0) {
          window.VRState.alive = false;
          window.VRState.lastDeath = { gaugeId, direction: "down" };
          break;
        }
        if (v >= 100) {
          window.VRState.alive = false;
          window.VRState.lastDeath = { gaugeId, direction: "up" };
          break;
        }
      }
    } catch (_) {}
  }

  engine._ensureMajorState = function () {
    ensureMajorState(this);
  };

  engine._sanitizeMajorState = function () {
    sanitizeMajorState(this);
  };

  engine._tickMajorCooldowns = function () {
    ensureMajorState(this);
    const next = {};
    Object.entries(this._majorCooldowns || {}).forEach(([id, value]) => {
      const remaining = Math.max(0, asInt(value, 0) - 1);
      if (remaining > 0) next[id] = remaining;
    });
    this._majorCooldowns = next;
  };

  engine._rebuildMajorIndex = function () {
    ensureMajorState(this);
    this._majorById = new Map();

    const arr = Array.isArray(this.majorsLogic?.decisions) ? this.majorsLogic.decisions : [];
    arr.forEach((decision) => {
      if (decision && decision.id) this._majorById.set(decision.id, decision);
    });

    this._allMajorIds = Array.from(this._majorById.keys());
    sanitizeMajorState(this);
  };

  const originalMakeSavePayload = engine._makeSavePayload;
  engine._makeSavePayload = function () {
    ensureMajorState(this);
    const payload = originalMakeSavePayload.apply(this, arguments) || {};
    payload.engine = payload.engine || {};
    payload.engine.majors = {
      cardsSinceRoll: asInt(this._cardsSinceMajorRoll, 0),
      seen: clone(this._seenMajors || []),
      cooldowns: clone(this._majorCooldowns || {}),
      demoShown: !!this._firstMajorDemoShown
    };
    return payload;
  };

  const originalInit = engine.init;
  engine.init = async function () {
    const out = await originalInit.apply(this, arguments);
    ensureMajorState(this);

    let majorsLogic = { decisions: [] };
    let majorsTexts = {};
    try {
      if (String(this.universeId || "").trim() !== "intro") {
        const data = await window.VREventsLoader?.loadUniverseMajors?.(this.universeId, this.lang);
        majorsLogic = data?.majorsLogic || { decisions: [] };
        majorsTexts = data?.majorsTexts || {};
      }
    } catch (_) {}

    this.majorsLogic = majorsLogic || { decisions: [] };
    this.majorsTexts = majorsTexts || {};
    this._majorById = new Map();
    this._allMajorIds = [];
    this._seenMajors = [];
    this._cardsSinceMajorRoll = 0;
    this._majorCooldowns = {};
    this._majorShowing = false;
    this._firstMajorDemoShown = false;
    this._forceFirstMajorNow = false;
    this._rebuildMajorIndex();

    try {
      const saved = window.VRSave?.load?.(this.universeId);
      const majors = saved?.engine?.majors || {};
      this._cardsSinceMajorRoll = Math.max(0, asInt(majors.cardsSinceRoll, 0));
      this._seenMajors = Array.isArray(majors.seen) ? clone(majors.seen) : [];
      if (majors.cooldowns && typeof majors.cooldowns === "object" && !Array.isArray(majors.cooldowns)) {
        this._majorCooldowns = clone(majors.cooldowns);
      }
      this._firstMajorDemoShown = !!majors.demoShown;
      this._forceFirstMajorNow = false;
    } catch (_) {}

    sanitizeMajorState(this);
    this._saveRunSoft();
    return out;
  };

  const originalStartNewReign = engine._startNewReign;
  engine._startNewReign = function () {
    this._seenMajors = [];
    this._cardsSinceMajorRoll = 0;
    this._majorCooldowns = {};
    this._majorShowing = false;
    this._forceFirstMajorNow = false;
    return originalStartNewReign.apply(this, arguments);
  };

  const originalRestartRun = engine.restartRun;
  engine.restartRun = function () {
    this._seenMajors = [];
    this._cardsSinceMajorRoll = 0;
    this._majorCooldowns = {};
    this._majorShowing = false;
    this._forceFirstMajorNow = false;
    return originalRestartRun.apply(this, arguments);
  };

  const originalReviveSecondChance = engine.reviveSecondChance;
  engine.reviveSecondChance = function () {
    this._seenMajors = [];
    this._cardsSinceMajorRoll = 0;
    this._majorCooldowns = {};
    this._majorShowing = false;
    this._forceFirstMajorNow = false;
    return originalReviveSecondChance.apply(this, arguments);
  };

  engine._maybeRollMajorAfterCardResolved = function () {
    ensureMajorState(this);
    if (this._majorShowing) return false;
    if (!window.VRState?.isAlive?.()) return false;
    if (!Array.isArray(this._allMajorIds) || !this._allMajorIds.length) {
      this._cardsSinceMajorRoll = 0;
      return false;
    }

    this._cardsSinceMajorRoll += 1;
    if (this._cardsSinceMajorRoll < getMajorRollEveryCards(this)) {
      this._saveRunSoft();
      return false;
    }

    this._cardsSinceMajorRoll = 0;

    const eligible = (Array.isArray(this.majorsLogic?.decisions) ? this.majorsLogic.decisions : [])
      .filter((decision) => isMajorEligible(this, decision));

    if (!eligible.length) {
      this._saveRunSoft();
      return false;
    }

    // Démo obligatoire : premier major montré une seule fois par univers
    if (!this._firstMajorDemoShown) {
      this._forceFirstMajorNow = true;
      this._saveRunSoft();
      return true;
    }

    this._forceFirstMajorNow = false;
    const hit = Math.random() < getMajorTriggerChance(this);
    this._saveRunSoft();
    return hit;
  };

  engine._pickRandomMajorId = function () {
    ensureMajorState(this);
    const eligible = (Array.isArray(this.majorsLogic?.decisions) ? this.majorsLogic.decisions : [])
      .filter((decision) => isMajorEligible(this, decision));

    if (!eligible.length) return null;
    const picked = eligible[Math.floor(Math.random() * eligible.length)] || null;
    return picked?.id || null;
  };

  engine._applyMajorOutcome = async function (spec) {
    const outcome = (spec && typeof spec === "object") ? spec : {};

    if (outcome.gameOver) {
      const gaugeId = (window.VRState?.gaugeOrder || Object.keys(window.VRState?.gauges || {}))[0] || "g0";
      if (gaugeId) {
        window.VRState.gauges[gaugeId] = 0;
        window.VRState.lastDeath = { gaugeId, direction: "down" };
      }
      window.VRState.alive = false;
      return;
    }

    if (outcome.setGauge && typeof outcome.setGauge === "object") {
      Object.entries(outcome.setGauge).forEach(([gaugeId, value]) => {
        try { window.VRState?.setGaugeValue?.(gaugeId, value); } catch (_) {}
      });
    }

    if (outcome.scaleGauge && typeof outcome.scaleGauge === "object") {
      Object.entries(outcome.scaleGauge).forEach(([gaugeId, factor]) => {
        const current = Number(window.VRState?.getGaugeValue?.(gaugeId) ?? 50);
        const next = clamp(current * Number(factor || 1), 0, 100);
        try { window.VRState?.setGaugeValue?.(gaugeId, next); } catch (_) {}
      });
    }

    finalizeGaugeState();
  };

  engine._triggerRandomMajor = async function () {
    ensureMajorState(this);
    if (this._majorShowing) return false;
    if (!window.VRState?.isAlive?.()) return false;

    const id = this._pickRandomMajorId();
    if (!id) {
      this._forceFirstMajorNow = false;
      return false;
    }

    const decision = this._majorById.get(id) || null;
    const texts = getMajorTexts(this, id) || {};
    if (!decision) {
      this._forceFirstMajorNow = false;
      return false;
    }

    this._majorShowing = true;
    this._seenMajors.push(id);

    if (this._forceFirstMajorNow) {
      this._firstMajorDemoShown = true;
      this._forceFirstMajorNow = false;
    }

    const globalCooldown = getMajorGlobalCooldownCards(this);
    if (globalCooldown > 0) {
      (this._allMajorIds || []).forEach((majorId) => {
        this._majorCooldowns[majorId] = Math.max(asInt(this._majorCooldowns[majorId], 0), globalCooldown);
      });
    }

    const specificCooldown = getMajorDecisionCooldown(this, decision);
    this._majorCooldowns[id] = Math.max(asInt(this._majorCooldowns[id], 0), specificCooldown);
    sanitizeMajorState(this);
    this._saveRunSoft();

    const yesLabel = String(texts?.yes_label || "Oui").trim() || "Oui";
    const noLabel = String(texts?.no_label || "Non").trim() || "Non";
    const previewLabel = String(texts?.preview_hint || "").trim();
    const previewLines = previewLabel
      ? [
          `${yesLabel} : ${String(texts?.outcome_yes_title || "").trim()}${texts?.outcome_yes_title && texts?.outcome_yes_body ? " — " : ""}${String(texts?.outcome_yes_body || "").trim()}`,
          `${noLabel} : ${String(texts?.outcome_no_title || "").trim()}${texts?.outcome_no_title && texts?.outcome_no_body ? " — " : ""}${String(texts?.outcome_no_body || "").trim()}`
        ].filter((line) => String(line || "").replace(/^\s+|\s+$/g, "") !== ":")
      : [];

    const choice = await window.VRGuideMentor?.showMajorDecision?.(this.universeId || window.VRGame?.currentUniverse || "", {
      title: texts?.title || "",
      body: texts?.body || "",
      yesLabel,
      noLabel,
      previewLabel,
      previewLines,
      onPreview: async () => {
        const okSpend = await window.VUserData?.spendJetons?.(1);
        if (!okSpend) {
          toast(window.VRI18n?.t?.("token.toast.no_tokens_offer") || "");
          try { window.VRTokenUI?.openMenu?.(); } catch (_) {}
          return false;
        }

        try { await this._refreshUIBalancesSoft?.(); } catch (_) {}
        try {
          window.VRUIBinding?.updateMeta?.(
            window.VRRuntimeText?.getDynastyName?.() || "",
            window.VRRuntimeText?.getYearLabel?.() || "",
            this._uiCoins,
            this._uiTokens
          );
        } catch (_) {}
        return true;
      }
    });

    if (choice !== "yes" && choice !== "no") {
      this._majorShowing = false;
      this._saveRunSoft();
      return false;
    }

    const outcomeSpec = clone(decision?.[choice] || {});
    await this._applyMajorOutcome(outcomeSpec);

    try { await this._refreshUIBalancesSoft?.(); } catch (_) {}
    try {
      window.VRUIBinding?.updateGauges?.();
      window.VRUIBinding?.updateMeta?.(
        window.VRRuntimeText?.getDynastyName?.() || "",
        window.VRRuntimeText?.getYearLabel?.() || "",
        this._uiCoins,
        this._uiTokens
      );
    } catch (_) {}

    await window.VRGuideMentor?.showMajorOutcome?.(
      this.universeId || window.VRGame?.currentUniverse || "",
      choice === "yes" ? (texts?.outcome_yes_title || "") : (texts?.outcome_no_title || ""),
      choice === "yes" ? (texts?.outcome_yes_body || "") : (texts?.outcome_no_body || "")
    );

    this._majorShowing = false;

    if (!window.VRState?.isAlive?.()) {
      await this._handleDeath();
      return true;
    }

    this._saveRunSoft();
    this._nextCard();
    return true;
  };
})();

// -------------------------------------------------------
// Token UI
// -------------------------------------------------------
(function () {
  "use strict";

  function t(key, fallback) {
    try {
      const out = window.VRI18n?.t?.(key);
      if (out && out !== key) return out;
    } catch (_) {}
    return typeof fallback === "string" ? fallback : "";
  }

  function toast(msg) {
    try {
      if (typeof window.showToast === "function") return window.showToast(msg);
    } catch (_) {}

    try {
      const id = "__vr_toast";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;left:50%;bottom:12%;transform:translateX(-50%);" +
          "background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:12px;" +
          "font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
          "z-index:2147483647;max-width:84vw;text-align:center";
        document.body.appendChild(el);
      }
      el.textContent = String(msg || "");
      el.style.opacity = "1";
      clearTimeout(el.__t1); clearTimeout(el.__t2);
      el.__t1 = setTimeout(() => { el.style.transition = "opacity .25s"; el.style.opacity = "0"; }, 2200);
      el.__t2 = setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
    } catch (_) {}
  }

  function runtimeDynastyName() {
    try { return window.VRRuntimeText?.getDynastyName?.() || ""; } catch (_) { return ""; }
  }

  function runtimeYearLabel() {
    try { return window.VRRuntimeText?.getYearLabel?.() || ""; } catch (_) { return ""; }
  }

  function ensureBasicPopupCardStyles() {
    try {
      const ID = "vr-basic-popup-card-style";
      if (document.getElementById(ID)) return;

      const style = document.createElement("style");
      style.id = ID;
      style.textContent = `
#vr-coins-popup [data-coins-action]{
  background-image:none !important;
}

/* shell popup = même esprit visuel que index */
#vr-token-popup .vr-popup-inner,
#vr-coins-popup .vr-popup-inner{
  width:min(560px, 94vw) !important;
  max-height:min(80vh, 720px) !important;
  overflow:auto !important;
  display:flex !important;
  flex-direction:column !important;
  gap:10px !important;
  padding:16px 14px 14px !important;
  box-sizing:border-box !important;

  border-radius:18px !important;
  background:
    linear-gradient(
      180deg,
      rgba(8, 18, 48, 0.96) 0%,
      rgba(14, 31, 74, 0.95) 45%,
      rgba(28, 56, 118, 0.93) 100%
    ) !important;
  border:1px solid rgba(255,255,255,.16) !important;
  box-shadow:
    0 14px 40px rgba(0,0,0,.35),
    inset 0 1px 0 rgba(255,255,255,.06) !important;
  backdrop-filter:blur(6px) !important;
  -webkit-backdrop-filter:blur(6px) !important;
  color:#fff !important;
}

/* vrai conteneur des actions */
#vr-token-popup .vr-token-view[data-token-view="menu"],
#vr-coins-popup .vr-token-view[data-coins-view="menu"]{
  display:flex !important;
  flex-direction:column !important;
  gap:14px !important;
}

#vr-token-popup .vr-popup-title,
#vr-coins-popup .vr-popup-title{
  margin:0 0 2px 0 !important;
  font-size:18px !important;
  font-weight:900 !important;
  line-height:1.15 !important;
  text-align:center !important;
  color:#fff !important;
}

#vr-token-popup .vr-card,
#vr-token-popup .vr-token-card,
#vr-token-popup .vr-token-basic-card,
#vr-coins-popup .vr-card,
#vr-coins-popup .vr-coins-basic-card{
  position:relative !important;
  display:block !important;
  width:100% !important;
  margin:0 !important;
  padding:10px 14px !important;
  border:1px solid var(--vr-card-border) !important;
  border-radius:var(--vr-radius-xl) !important;
  background:var(--vr-card-bg) !important;
  box-shadow:var(--vr-shadow-soft) !important;
  overflow:hidden !important;
  text-align:left !important;
}

/* cartouches = même esprit que index */
#vr-token-popup .vr-card-content,
#vr-token-popup .vr-token-basic-card .vr-card-content,
#vr-coins-popup .vr-card-content{
  position:relative !important;
  z-index:1 !important;
  display:flex !important;
  flex-direction:column !important;
  align-items:center !important;
  justify-content:center !important;
  text-align:center !important;

  min-height:auto !important;
  padding:0 !important;
  box-sizing:border-box !important;

  border:none !important;
  border-radius:0 !important;
  background:none !important;
  box-shadow:none !important;
}


#vr-token-popup .vr-card-title,
#vr-token-popup .vr-token-basic-card .vr-card-title,
#vr-coins-popup .vr-card-title{
  margin:0 0 4px 0 !important;
  color:#fff !important;
  font:900 15px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  text-shadow:none !important;
  text-align:center !important;
}

#vr-token-popup .vr-card-text,
#vr-token-popup .vr-token-basic-card .vr-card-text,
#vr-coins-popup .vr-card-text{
  margin:0 !important;
  color:rgba(255,255,255,.92) !important;
  font:700 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  text-shadow:none !important;
  text-align:center !important;
}

/* ANNULER = texte simple, hors cartouche */
#vr-token-popup .vr-token-close-plain{
  appearance:none !important;
  -webkit-appearance:none !important;
  display:block !important;
  width:auto !important;
  align-self:center !important;
  margin:0 auto !important;
  padding:0 !important;
  border:none !important;
  background:none !important;
  box-shadow:none !important;
  color:rgba(255,255,255,.96) !important;
  font:800 15px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  text-align:center !important;
  cursor:pointer !important;
}

#vr-token-popup .vr-token-close-plain:focus-visible{
  outline:2px solid rgba(255,255,255,.65) !important;
  outline-offset:4px !important;
  border-radius:10px !important;
}

/* retire le bleu spécial sur gauge50 */
#vr-token-gauge-overlay .vr-token-gauge-card{
  background:
    linear-gradient(
      180deg,
      rgba(8, 18, 48, 0.96) 0%,
      rgba(14, 31, 74, 0.95) 45%,
      rgba(28, 56, 118, 0.93) 100%
    ) !important;
  border-color:rgba(255,255,255,.16) !important;
  box-shadow:0 14px 40px rgba(0,0,0,.35) !important;
}

#vr-token-popup img,
#vr-coins-popup img{
  object-fit:contain !important;
}

#vr-token-popup .vr-token-ad-card .vr-card-content{
  gap:6px !important;
  padding:2px 0 !important;
}

#vr-token-popup .vr-token-reward-top{
  display:flex !important;
  align-items:center !important;
  justify-content:center !important;
  gap:10px !important;
}

#vr-token-popup .vr-token-reward-top img{
  width:30px !important;
  height:30px !important;
  object-fit:contain !important;
  filter:drop-shadow(0 4px 8px rgba(0,0,0,.28)) !important;
}

#vr-token-popup .vr-token-reward-amount{
  color:#fff !important;
  font:950 24px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  text-shadow:none !important;
}

#vr-token-popup .vr-token-reward-sub{
  margin:0 !important;
  color:rgba(255,255,255,.92) !important;
  font:600 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  text-align:center !important;
}

#vr-token-popup .vr-soft-pulse{
  animation:vrSoftTokenPulse 1.6s ease-in-out infinite !important;
}

@keyframes vrSoftTokenPulse{
  0%,100%{ transform:scale(1); filter:brightness(1); }
  50%{ transform:scale(1.025); filter:brightness(1.12); }
}

@media (max-width: 480px){
  #vr-token-popup .vr-popup-inner,
  #vr-coins-popup .vr-popup-inner{
    width:min(96vw, 560px) !important;
    padding:14px 12px 12px !important;
    border-radius:16px !important;
  }

  #vr-token-popup .vr-token-view[data-token-view="menu"],
  #vr-coins-popup .vr-token-view[data-coins-view="menu"]{
    gap:12px !important;
  }

  #vr-token-popup .vr-popup-title,
  #vr-coins-popup .vr-popup-title{
    font-size:17px !important;
  }

  #vr-token-popup .vr-card-content,
  #vr-token-popup .vr-token-basic-card .vr-card-content,
  #vr-coins-popup .vr-card-content{
    min-height:50px !important;
    padding:9px 12px !important;
    border-radius:14px !important;
  }

  #vr-token-popup .vr-card-title,
  #vr-token-popup .vr-token-basic-card .vr-card-title,
  #vr-coins-popup .vr-card-title{
    margin:0 0 3px 0 !important;
    font:900 14px/1.08 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  }

  #vr-token-popup .vr-card-text,
  #vr-token-popup .vr-token-basic-card .vr-card-text,
  #vr-coins-popup .vr-card-text{
    font:700 11px/1.18 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  }

  #vr-token-popup .vr-token-close-plain{
    font:800 14px/1.1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif !important;
  }
}
`;
      document.head.appendChild(style);
    } catch (_) {}
  }

  const VRTokenUI = {
    selectMode: false,
    gaugeSelectBusy: false,
    criticalGaugeOfferShownThisRun: false,
    criticalGaugeOfferChecks: 0,
    lastCriticalGaugeCheckCard: 0,

    init() {
      ensureBasicPopupCardStyles();

      const btnJeton = document.getElementById("btn-jeton");
      const popup = document.getElementById("vr-token-popup");
      const overlay = document.getElementById("vr-token-gauge-overlay");
      const cancelGaugeBtn = document.getElementById("btn-cancel-gauge-select");
      const gaugesRow = document.getElementById("vr-gauges-row");
      const isGaugeOverlayLocked = () => {
        try { return window.VRIntroTutorial?.isGaugeSelectionLocked?.() === true; }
        catch (_) { return false; }
      };

      const syncGaugeOverlayLockUI = () => {
        if (!cancelGaugeBtn) return;
        cancelGaugeBtn.style.display = isGaugeOverlayLocked() ? "none" : "";
      };

      if (!btnJeton || !popup) return;

      try {
        const vg = document.getElementById("view-game");
        if (vg) {
          if (popup && vg.contains(popup)) document.body.appendChild(popup);
          if (overlay && vg.contains(overlay)) document.body.appendChild(overlay);
        }
      } catch (_) {}

      const _showDialog = (el, focusEl) => {
        if (!el) return;
        try { el.removeAttribute("inert"); } catch (_) {}
        el.setAttribute("aria-hidden", "false");
        el.style.display = "flex";
        try { focusEl?.focus?.({ preventScroll: true }); } catch (_) {}
      };

      const _hideDialog = (el, focusBackEl) => {
        if (!el) return;
        const active = document.activeElement;
        if (active && el.contains(active)) {
          try { active.blur(); } catch (_) {}
          try { focusBackEl?.focus?.({ preventScroll: true }); } catch (_) {}
        }
        try { el.setAttribute("inert", ""); } catch (_) {}
        el.setAttribute("aria-hidden", "true");
        el.style.display = "none";
      };

      const openPopup = () => {
        if (this.selectMode) return;
        const first = popup?.querySelector?.("[data-token-action]");
        _showDialog(popup, first || btnJeton);
      };

      const closePopup = () => {
        _hideDialog(popup, btnJeton);
      };

      this.openMenu = () => {
        if (this.selectMode) return false;
        openPopup();
        return true;
      };

      this.resetRunHints = () => {
        this.criticalGaugeOfferShownThisRun = false;
        this.criticalGaugeOfferChecks = 0;
        this.lastCriticalGaugeCheckCard = 0;
      };

      this.maybeOfferCriticalGauge = () => {
        if (this.selectMode) return false;
        if (this.criticalGaugeOfferShownThisRun) return false;

        const currentUniverse = String(window.VRGame?.currentUniverse || document.body?.dataset?.universe || "").trim();
        if (!currentUniverse || currentUniverse === "intro") return false;

        const cardsPlayed = Number(window.VRState?.cardsPlayed || 0);
        if (cardsPlayed < 3) return false;
        if (cardsPlayed === this.lastCriticalGaugeCheckCard) return false;
        this.lastCriticalGaugeCheckCard = cardsPlayed;

        const popupOpen = popup?.getAttribute?.("aria-hidden") === "false";
        const overlayOpen = overlay?.getAttribute?.("aria-hidden") === "false";
        const endingOpen = document.getElementById("vr-ending-overlay")?.getAttribute("aria-hidden") === "false";
        if (popupOpen || overlayOpen || endingOpen) return false;

        let hasCriticalGauge = false;
        for (const gaugeId of (window.VRState?.gaugeOrder || [])) {
          const val = Number(window.VRState?.getGaugeValue?.(gaugeId) ?? 50);
          if (val <= 5 || val >= 95) {
            hasCriticalGauge = true;
            break;
          }
        }

        if (!hasCriticalGauge) return false;

        this.criticalGaugeOfferChecks += 1;

        if (this.criticalGaugeOfferChecks % 4 !== 0) return false;

        this.criticalGaugeOfferShownThisRun = true;

        try { toast(t("token.toast.gauge_warning", "")); } catch (_) {}
        openPopup();
        return true;
      };

      const openGaugeOverlay = () => {
        if (!overlay) return;
        syncGaugeOverlayLockUI();
        const focusTarget =
          !isGaugeOverlayLocked() && cancelGaugeBtn
            ? cancelGaugeBtn
            : overlay.querySelector(".vr-token-gauge-card");
        _showDialog(overlay, focusTarget || btnJeton);
      };

      const closeGaugeOverlay = () => {
        if (!overlay) return;
        _hideDialog(overlay, btnJeton);
      };

      const startSelectGauge50 = () => {
        this.selectMode = true;
        this.gaugeSelectBusy = false;
        document.body.classList.add("vr-token-select-mode");
        closePopup();
        openGaugeOverlay();
        toast(t("token.toast.select_gauge", ""));
      };

      const stopSelectGauge50 = (force = false) => {
        if (!force && isGaugeOverlayLocked()) return;
        this.selectMode = false;
        this.gaugeSelectBusy = false;
        document.body.classList.remove("vr-token-select-mode");
        closeGaugeOverlay();
      };

      btnJeton.addEventListener("click", () => {
        openPopup();
        window.setTimeout(() => {
          try { window.VRIntroTutorial?.onTokenPopupOpened?.(); } catch (_) {}
        }, 30);
      });

      popup.addEventListener("click", (e) => {
        if (e.target === popup) closePopup();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;

        if (this.selectMode) {
          if (!isGaugeOverlayLocked()) stopSelectGauge50();
          return;
        }

        closePopup();
      });

      try {
        const host = (popup.querySelector("[data-token-action]")?.parentElement) || popup;

        if (host && !host.querySelector('[data-token-action="peek15"]')) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "vr-token-basic-card";
          btn.setAttribute("data-token-action", "peek15");

          const content = document.createElement("div");
          content.className = "vr-card-content";

          const title = document.createElement("h4");
          title.className = "vr-card-title";
          title.textContent = t("token.popup.peek.title", "");

          const desc = document.createElement("p");
          desc.className = "vr-card-text";
          desc.textContent = t("token.popup.peek.text", "");

          content.appendChild(title);
          content.appendChild(desc);
          btn.appendChild(content);

          const before =
            host.querySelector('[data-token-action="gauge50"]') ||
            host.querySelector('[data-token-action="back3"]') ||
            host.querySelector('[data-token-action="close"]');

          if (before && before.parentNode === host) host.insertBefore(btn, before);
          else host.appendChild(btn);
        }
      } catch (_) {}

      popup.querySelectorAll("[data-token-action]").forEach((el) => {
        el.addEventListener("click", async () => {
          const action = el.getAttribute("data-token-action");
          if (!action) return;
          try {
            if (window.VRIntroTutorial?.beforeTokenAction?.(action) === false) return;
          } catch (_) {}

          if (action === "close") { closePopup(); return; }

          if (action === "open_shop") {
            closePopup();
            try { window.location.href = "shop.html"; } catch (_) {}
            return;
          }

          if (action === "adtoken" || action === "ad_token") {
            closePopup();

            const ok = await (window.VRAds?.showRewardedAd?.({ placement: "token" }) || Promise.resolve(false));
            if (ok) {
              try { window.VRAds?.markGameRewardSeen?.(); } catch (_) {}
              const beforeTokens = Number(window.VUserData?.getJetons?.() || 0);

              try {
                await window.VUserData?.addJetonsAsync?.(1);
                await window.VUserData?.refresh?.();
              } catch (_) {}

              const afterTokens = Number(window.VUserData?.getJetons?.() || beforeTokens);
              if (afterTokens < beforeTokens + 1) {
                toast(t("token.toast.reward_fail", ""));
                return;
              }


              try {
                const me = await window.VRProfile?.getMe?.(0);
                if (me) {
                  window.VREngine._uiCoins = window.VRProfile._n(me.vcoins);
                  window.VREngine._uiTokens = window.VRProfile._n(me.jetons);
                }
              } catch (_) {}

              const kingName = runtimeDynastyName();
              window.VRUIBinding?.updateMeta?.(
                kingName,
                runtimeYearLabel(),
                window.VREngine?._uiCoins || 0,
                window.VREngine?._uiTokens || 0
              );

              toast(t("token.toast.reward_ok", ""));
            } else {
              toast(t("token.toast.reward_fail", ""));
            }
            return;
          }

          if (action === "peek15") {
            const okSpend = await window.VUserData?.spendJetons?.(1);
            if (!okSpend) {
              toast(t("token.toast.no_tokens_offer", ""));
              openPopup();
              return;
            }

            closePopup();
            try { window.VRUIBinding?.enablePeek?.(15); } catch (_) {}
            toast(t("token.toast.peek_on", ""));
            return;
          }

          if (action === "gauge50") {
            const isIntro = String(window.VRGame?.currentUniverse || document.body?.dataset?.universe || "").trim() === "intro";

            if (!isIntro) {
              const me = await window.VRProfile?.getMe?.(0);
              if (window.VRProfile._n(me?.jetons) <= 0) {
                toast(t("token.toast.no_tokens_offer", ""));
                openPopup();
                return;
              }
            }

            startSelectGauge50();
            window.setTimeout(() => {
              try { window.VRIntroTutorial?.onGaugeOverlayOpened?.(); } catch (_) {}
            }, 30);
            return;
          }

          if (action === "back3") {
            const okSpend = await window.VUserData?.spendJetons?.(1);
            if (!okSpend) {
              toast(t("token.toast.no_tokens_offer", ""));
              openPopup();
              return;
            }

            closePopup();

            const ok = window.VREngine?.undoChoices?.(3);
            if (!ok) {
              try {
                await window.VUserData?.addJetonsAsync?.(1);
                await window.VUserData?.refresh?.();
              } catch (_) {}
              toast(t("token.toast.undo_fail", ""));
              try {
                await window.VREventOverlay?.showEvent?.(
                  t("token.undo.fail.title", ""),
                  t("token.undo.fail.body", "")
                );
              } catch (_) {}
            } else {
              toast(t("token.toast.undo_done", ""));
              try {
                await window.VREventOverlay?.showEvent?.(
                  t("token.undo.ok.title", ""),
                  t("token.undo.ok.body", "")
                );
              } catch (_) {}
            }

            try {
              const me2 = await window.VRProfile?.getMe?.(0);
              if (me2) {
                window.VREngine._uiCoins = window.VRProfile._n(me2.vcoins);
                window.VREngine._uiTokens = window.VRProfile._n(me2.jetons);
              }
            } catch (_) {}

            const kingName = runtimeDynastyName();
            window.VRUIBinding?.updateMeta?.(
              kingName,
              runtimeYearLabel(),
              window.VREngine?._uiCoins || 0,
              window.VREngine?._uiTokens || 0
            );

            return;
          }

          if (action === "back_menu") {
            closePopup();

            try { await window.VRAds?.maybeShowInterstitialOnReturnToIndex?.(); } catch (_) {}
            try { prepareMusicPromptOnNextIndex(this.universeId); } catch (_) {}
            try { window.VROneSignal?.markPromptPendingOnNextIndex?.(); } catch (_) {}
            try { window.location.href = "index.html"; } catch (_) {}
            return;
          }
        });
      });

      if (cancelGaugeBtn) {
        cancelGaugeBtn.addEventListener("click", () => {
          if (isGaugeOverlayLocked()) return;
          stopSelectGauge50();
        });
      }

      if (overlay) {
        overlay.addEventListener("click", (e) => {
          if (e.target !== overlay) return;
          if (isGaugeOverlayLocked()) return;
          stopSelectGauge50();
        });
      }

      if (gaugesRow) {
        gaugesRow.addEventListener("click", async (e) => {
          if (!this.selectMode || this.gaugeSelectBusy) return;

          const gaugeEl = e.target?.closest?.(".vr-gauge");
          if (!gaugeEl) return;

          const gaugeId = String(gaugeEl.dataset.gaugeId || "").trim();
          if (!gaugeId) return;

          const isIntroGaugeTutorial =
            String(window.VRGame?.currentUniverse || document.body?.dataset?.universe || "").trim() === "intro" &&
            window.VRIntroTutorial?.isGaugeSelectionLocked?.();

          if (isIntroGaugeTutorial && gaugeId !== "balance") return;

          this.gaugeSelectBusy = true;
          stopSelectGauge50();

          if (!isIntroGaugeTutorial) {
            const spent = await window.VUserData?.spendJetons?.(1);
            if (!spent) {
              this.gaugeSelectBusy = false;
              toast(t("token.toast.no_tokens_offer", ""));
              openPopup();
              return;
            }
          }

          window.VRState?.setGaugeValue?.(gaugeId, 50);
          window.VRUIBinding?.updateGauges?.();

          try { window.VREngine?._saveRunSoft?.(); } catch (_) {}

          try {
            const me = await window.VRProfile?.getMe?.(0);
            if (me) {
              window.VREngine._uiCoins = window.VRProfile._n(me.vcoins);
              window.VREngine._uiTokens = window.VRProfile._n(me.jetons);
            }
          } catch (_) {}

          const kingName = runtimeDynastyName();
          window.VRUIBinding?.updateMeta?.(
            kingName,
            runtimeYearLabel(),
            window.VREngine?._uiCoins || 0,
            window.VREngine?._uiTokens || 0
          );

          toast(t("token.toast.gauge_set_50", ""));
          this.gaugeSelectBusy = false;

          try { window.VRIntroTutorial?.onGaugeSet?.(gaugeId); } catch (_) {}
        });
      }
    }
  };

  window.VRTokenUI = VRTokenUI;
})();


// -------------------------------------------------------
// INTRO TUTORIAL
// -------------------------------------------------------
(function () {
  "use strict";

  const INTRO_ID = "intro";
  const LOW_GAUGE_ID = "balance";
  const INTRO_REWARD_VCOINS = 200;
  const INTRO_REWARD_TOKENS = 1;
  const INTRO_LOW_GAUGE_VALUE = 8;
  const INTRO_HAND_SRC = "assets/img/ui/hand.webp";

  let enabled = false;
  let currentCardId = "";
  let finishing = false;
  let introGuidePromise = null;
  let introHintTimer1 = 0;
  let introHintTimer2 = 0;

  function isIntroUniverse() {
    if (!enabled) return false;
    try {
      const a = String(window.VRGame?.currentUniverse || "").trim();
      const b = String(window.VREngine?.universeId || "").trim();
      const c = String(document.body?.dataset?.universe || "").trim();
      return a === INTRO_ID || b === INTRO_ID || c === INTRO_ID;
    } catch (_) {
      return false;
    }
  }

  function t(key, fallback) {
    try {
      const out = window.VRI18n?.t?.(key);
      if (out && out !== key) return out;
    } catch (_) {}
    return typeof fallback === "string" ? fallback : "";
  }

  function ensureStyles() {
    if (document.getElementById("vr-intro-inline-style")) return;

    const style = document.createElement("style");
    style.id = "vr-intro-inline-style";
    style.textContent = `
        .vr-intro-pulse{
          animation: vrIntroChoiceGlow 1.45s ease-in-out infinite;
          filter: drop-shadow(0 0 10px rgba(255,220,120,.42));
        }

        .vr-intro-tilt{
          transform-origin: center center !important;
          animation: vrIntroChoiceSway 1.28s cubic-bezier(.4,0,.2,1) infinite !important;
          will-change: transform;
          backface-visibility: hidden;
          transform: translateZ(0);
        }

        .vr-intro-dim{ opacity: .28 !important; pointer-events: none !important; }
        .vr-intro-hide{ opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; }

        #vr-card-main.vr-intro-card-hidden{
          opacity:0 !important;
          visibility:hidden !important;
          pointer-events:none !important;
          transform:scale(.985) !important;
        }

        #vr-intro-swipe-hint,
        #vr-intro-gauge-hint{
          position:fixed;
          left:50%;
          z-index:120001;
          width:min(88vw, 520px);
          display:flex;
          justify-content:center;
          pointer-events:none;
          opacity:0;
          transform:translate3d(-50%, 0, 0) scale(.96);
          transition:opacity .22s ease, transform .22s ease;
        }

        #vr-intro-swipe-hint{
          top:50%;
        }

        #vr-intro-gauge-hint{
          bottom:max(18px, calc(env(safe-area-inset-bottom) + 16px));
        }

        #vr-intro-swipe-hint.is-visible,
        #vr-intro-gauge-hint.is-visible{
          opacity:1;
          transform:translate3d(-50%, 0, 0) scale(1);
        }

        .vr-intro-hint-text{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          text-align:center;
          color:#fff;
          font-weight:900;
          line-height:1.2;
        }

        #vr-intro-swipe-hint .vr-intro-hint-text{
          padding:0;
          min-height:0;
          background:none;
          border:none;
          box-shadow:none;
          backdrop-filter:none;
          color:#fff;
          font-size:clamp(24px, 8vw, 40px);
          text-shadow:
            0 2px 8px rgba(0,0,0,.35),
            0 0 18px rgba(255,255,255,.10);
          animation:vrIntroHintZoom 1.2s ease-in-out infinite;
        }

        #vr-intro-gauge-hint .vr-intro-hint-text{
          min-height:46px;
          padding:10px 16px;
          border-radius:16px;
          background:rgba(10,16,32,.78);
          border:1px solid rgba(255,255,255,.18);
          box-shadow:0 14px 36px rgba(0,0,0,.28);
          backdrop-filter:blur(10px);
          font-size:clamp(14px, 4vw, 18px);
          max-width:min(88vw, 420px);
        }

        .vr-intro-gauge-focus{
          position: relative;
          z-index: 3;
          animation: vrIntroGauge .72s cubic-bezier(.22,.61,.36,1) infinite;
        }

        .vr-intro-gauge-focus .vr-gauge-frame{
          filter:
            drop-shadow(0 0 12px rgba(255,220,120,.95))
            drop-shadow(0 0 28px rgba(255,220,120,.78));
        }

        .vr-intro-gauge-focus::after{
          content:"";
          position:absolute;
          inset:-8px;
          border-radius:999px;
          pointer-events:none;
          animation: vrIntroGaugeRing .72s cubic-bezier(.22,.61,.36,1) infinite;
        }

        #vr-intro-hand{
          position: absolute;
          left: 0;
          top: 0;
          width: clamp(52px, 12vw, 74px);
          height: auto;
          z-index: 120000;
          pointer-events: none;
          display: none;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,.28));
          transform: translate3d(0,0,0) rotate(-10deg);
          transform-origin: center center;
          will-change: transform, opacity;
        }

        #vr-intro-hand.is-visible{
          display: block;
          animation: vrIntroHandSwipe 1s cubic-bezier(.4,0,.2,1) infinite;
        }

        body.vr-body-game .vr-hud-item{
          overflow: visible !important;
        }

        #vr-card-main.is-intro-rich-card{
          width: min(500px, 88vw) !important;
          min-height: auto !important;
          height: auto !important;
          margin: 0 auto !important;
          padding:
            clamp(18px, 4.2vw, 24px)
            clamp(24px, 6.2vw, 36px)
            clamp(22px, 5vw, 30px) !important;
          box-sizing: border-box !important;
          background-size: 96% 96% !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: flex-start !important;
          overflow: hidden !important;
        }

        #vr-card-main.is-intro-rich-card .vr-card-title{
          display: block !important;
          min-height: auto !important;
          width: 100% !important;
          max-width: clamp(170px, 46vw, 250px) !important;
          margin: 0 auto 10px !important;
          text-align: center !important;
          line-height: 1.06 !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
          hyphens: auto !important;
        }

        #vr-card-main.is-intro-rich-card .vr-card-text,
        #vr-card-main.is-intro-rich-card .vr-intro-rewards-copy{
          display: block !important;
          width: 100% !important;
          max-width: clamp(170px, 50vw, 260px) !important;
          margin: 0 auto !important;
          font-size: clamp(12px, 3.1vw, 15px) !important;
          line-height: 1.24 !important;
          text-align: center !important;
          overflow-wrap: break-word !important;
          word-break: normal !important;
          hyphens: auto !important;
        }

        #vr-card-main.is-intro-rich-card .vr-intro-rewards-copy p{
          margin: 0 0 10px 0 !important;
        }

        #vr-card-main.is-intro-rich-card .vr-intro-rewards-copy p:last-child{
          margin-bottom: 0 !important;
        }

        .vr-intro-inline-icon{
          display: inline-block;
          width: clamp(18px, 2vw, 24px);
          height: clamp(18px, 2vw, 24px);
          object-fit: contain;
          vertical-align: middle;
          transform: translateY(-1px);
          filter: none;
        }

        .vr-intro-inline-icon--big{
          width: clamp(24px, 2.5vw, 30px);
          height: clamp(24px, 2.5vw, 30px);
          transform: translateY(-1px);
        }

        @media (max-width: 540px){
          #vr-card-main.is-intro-rich-card{
            width: min(88vw, 460px) !important;
            padding: 16px 20px 20px !important;
            background-size: 94% 94% !important;
          }

          #vr-card-main.is-intro-rich-card .vr-card-title{
            max-width: 72% !important;
            margin-bottom: 8px !important;
          }

          #vr-card-main.is-intro-rich-card .vr-card-text,
          #vr-card-main.is-intro-rich-card .vr-intro-rewards-copy{
            max-width: 72% !important;
            font-size: 12.5px !important;
            line-height: 1.22 !important;
          }
        }

        @media (min-width: 900px){
          #vr-card-main.is-intro-rich-card{
            width: min(520px, 72vw) !important;
            padding: 24px 38px 28px !important;
          }

          #vr-card-main.is-intro-rich-card .vr-card-title{
            max-width: 260px !important;
          }

          #vr-card-main.is-intro-rich-card .vr-card-text,
          #vr-card-main.is-intro-rich-card .vr-intro-rewards-copy{
            max-width: 280px !important;
          }
        }

        #vr-intro-finish-overlay .vr-intro-finish-card{
          width:min(340px, calc(100vw - 28px));
          min-height:auto;
          padding:20px 18px 18px;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:12px;
          border-radius:20px;
        }

        #vr-intro-finish-overlay .vr-intro-finish-title{
          margin:0;
          text-align:center;
          font-size:clamp(23px, 6.2vw, 30px);
          font-weight:1000;
          line-height:1.06;
          color:#fff;
        }

        #vr-intro-finish-overlay .vr-intro-finish-text,
        #vr-intro-finish-overlay .vr-intro-finish-gift-text{
          margin:0;
          text-align:center;
          font-size:clamp(14px, 4vw, 17px);
          line-height:1.38;
          font-weight:800;
          color:#fff;
        }

        #vr-intro-finish-overlay #vr-intro-finish-info{
          width:100%;
        }

        #vr-intro-finish-overlay #vr-intro-finish-info .vr-intro-rewards-copy{
          width:100%;
          max-width:280px;
          margin:6px 0 0;
          font-size:clamp(13px, 3.55vw, 15px);
          line-height:1.52;
          font-weight:700;
          color:#fff;
          text-align:justify;
          text-justify:inter-word;
          text-align-last:left;
          word-break:normal;
          overflow-wrap:normal;
          hyphens:none;
        }

        #vr-intro-finish-overlay #vr-intro-finish-info .vr-intro-rewards-copy p{
          margin:0 0 8px;
        }

        #vr-intro-finish-overlay #vr-intro-finish-info .vr-intro-rewards-copy p:last-child{
          margin-bottom:0;
        }

        #vr-intro-finish-overlay #vr-intro-finish-info .vr-intro-inline-icon{
          width:1.95em;
          height:1.95em;
          margin:0 0.12em;
          vertical-align:-0.56em;
          object-fit:contain;
          filter:drop-shadow(0 4px 10px rgba(0,0,0,.22));
        }

        #vr-intro-finish-overlay .vr-intro-finish-rewards{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:7px;
          width:100%;
          margin:2px 0 3px;
        }

        #vr-intro-finish-overlay .vr-intro-finish-line{
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          min-height:34px;
          color:#fff;
        }

        #vr-intro-finish-overlay .vr-intro-finish-line strong{
          font-size:clamp(22px, 6.4vw, 30px);
          line-height:1;
          font-weight:1000;
          color:#fff;
        }

        #vr-intro-finish-overlay .vr-intro-finish-line img{
          width:clamp(42px, 10.5vw, 52px);
          height:clamp(42px, 10.5vw, 52px);
          object-fit:contain;
          transform:translateY(3px);
          filter:drop-shadow(0 6px 14px rgba(0,0,0,.28));
        }

        #vr-intro-finish-overlay .vr-intro-name-block{
          width:100%;
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:10px;
          margin-top:8px;
        }

        #vr-intro-finish-overlay .vr-intro-name-title{
          margin:0;
          text-align:center;
          font-size:clamp(16px, 4.6vw, 20px);
          line-height:1.25;
          font-weight:900;
          color:#fff;
        }

        #vr-intro-finish-overlay .vr-intro-name-input{
          width:min(248px, 100%);
          min-height:52px;
          padding:0 16px;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.18);
          background:rgba(255,255,255,.08);
          color:#fff;
          font-size:clamp(16px, 4.2vw, 18px);
          font-weight:800;
          text-align:center;
          outline:none;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
        }

        #vr-intro-finish-overlay .vr-intro-name-input::placeholder{
          color:rgba(255,255,255,.66);
        }

        #vr-intro-finish-overlay .vr-intro-name-input:focus{
          border-color:rgba(255,255,255,.34);
          box-shadow:
            0 0 0 3px rgba(255,255,255,.08),
            inset 0 1px 0 rgba(255,255,255,.08);
        }

        #vr-intro-finish-overlay .vr-intro-name-msg{
          min-height:18px;
          width:min(270px, 100%);
          text-align:center;
          font-size:12px;
          line-height:1.35;
          font-weight:700;
          color:rgba(255,255,255,.86);
        }

        #vr-intro-finish-overlay .vr-intro-name-msg.is-error{
          color:#ffd4d4;
        }

        #vr-intro-finish-overlay .vr-intro-name-msg.is-ok{
          color:#d8ffd8;
        }

        #vr-intro-finish-overlay #vr-intro-finish-close{
          width:100% !important;
          max-width:none !important;
          min-width:0 !important;

          height:auto !important;
          min-height:0 !important;

          margin:6px 0 0 !important;
          padding:8px 14px !important;

          align-self:stretch !important;
          flex:0 0 auto !important;

          border:1px solid rgba(255,255,255,.24) !important;
          border-radius:14px !important;
          background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.05)) !important;
          box-shadow:
            0 8px 22px rgba(0,0,0,.22),
            inset 0 1px 0 rgba(255,255,255,.10) !important;

          display:flex !important;
          align-items:center !important;
          justify-content:center !important;

          color:#fff !important;
          font-size:clamp(16px, 4.2vw, 22px) !important;
          font-weight:900 !important;
          line-height:1 !important;
          text-shadow:0 2px 8px rgba(0,0,0,.35) !important;
        }

        #vr-intro-finish-overlay #vr-intro-finish-close[disabled]{
          opacity:.66;
          pointer-events:none;
        }

        @keyframes vrIntroChoiceGlow{
          0%,100%{ opacity:1; filter: drop-shadow(0 0 8px rgba(255,220,120,.28)); }
          50%{ opacity:.92; filter: drop-shadow(0 0 16px rgba(255,220,120,.58)); }
        }

        @keyframes vrIntroChoiceSway{
          0%,100%{ transform: translate3d(0,0,0) rotate(0deg); }
          50%{ transform: translate3d(8px,0,0) rotate(1.35deg); }
        }

        @keyframes vrIntroGauge{
          0%,100%{
            transform: scale(1);
            filter: brightness(1) drop-shadow(0 0 0 rgba(255,220,120,0));
          }
          50%{
            transform: scale(1.06);
            filter: brightness(1.18) drop-shadow(0 0 24px rgba(255,220,120,.95));
          }
        }

        @keyframes vrIntroGaugeRing{
          0%{
            opacity:0;
            box-shadow:0 0 0 0 rgba(255,220,120,0);
          }
          45%{
            opacity:1;
            box-shadow:
              0 0 0 5px rgba(255,220,120,.34),
              0 0 20px 8px rgba(255,220,120,.34);
          }
          100%{
            opacity:0;
            box-shadow:
              0 0 0 14px rgba(255,220,120,0),
              0 0 30px 14px rgba(255,220,120,0);
          }
        }

        @keyframes vrIntroHandSwipe{
          0%,100%{ transform: translate3d(0,0,0) rotate(-10deg) scale(1); opacity:1; }
          50%{ transform: translate3d(-16px,0,0) rotate(-10deg) scale(.97); opacity:.92; }
        }

        @keyframes vrIntroHintZoom{
          0%,100%{ transform:scale(1); }
          50%{ transform:scale(1.08); }
        }
      `;
    document.head.appendChild(style);
  }

  function allChoiceButtons() {
    return Array.from(document.querySelectorAll(".vr-choice-button[data-choice]"));
  }

  function clearClasses() {
    try {
      document.querySelectorAll(".vr-intro-pulse, .vr-intro-tilt, .vr-intro-dim, .vr-intro-hide, .vr-intro-gauge-focus").forEach((el) => {
        el.classList.remove("vr-intro-pulse", "vr-intro-tilt", "vr-intro-dim", "vr-intro-hide", "vr-intro-gauge-focus");
      });
    } catch (_) {}
  }

function resetUIState() {
  clearClasses();
  hideIntroHand();
  clearIntroTimers();
  hideSwipeHint();
  hideGaugeHint();
  showIntroCardMain();

  const choicesWrap = document.querySelector(".vr-card-choices");
  if (choicesWrap) {
    choicesWrap.style.pointerEvents = "";
    choicesWrap.style.opacity = "";
    choicesWrap.style.visibility = "";
  }

  allChoiceButtons().forEach((btn) => {
    btn.style.pointerEvents = "";
    btn.style.opacity = "";
    btn.style.visibility = "";
  });

  document.querySelectorAll("#vr-token-popup [data-token-action]").forEach((btn) => {
    btn.style.pointerEvents = "";
    btn.style.opacity = "";
    btn.style.visibility = "";
  });

  const gaugeOverlay = document.getElementById("vr-token-gauge-overlay");
  if (gaugeOverlay) {
    try { gaugeOverlay.setAttribute("inert", ""); } catch (_) {}
    gaugeOverlay.setAttribute("aria-hidden", "true");
    gaugeOverlay.style.display = "none";
  }

  try {
    document.body.classList.remove("vr-token-select-mode");
  } catch (_) {}

  try {
    if (window.VRTokenUI) {
      window.VRTokenUI.selectMode = false;
      window.VRTokenUI.gaugeSelectBusy = false;
    }
  } catch (_) {}
}

  function getChoiceButton(choiceId) {
    return document.querySelector(`.vr-choice-button[data-choice="${choiceId}"]`);
  }

  function ensureIntroHand() {
    let hand = document.getElementById("vr-intro-hand");
    if (hand) return hand;

    hand = document.createElement("img");
    hand.id = "vr-intro-hand";
    hand.src = INTRO_HAND_SRC;
    hand.alt = "";
    hand.draggable = false;
    hand.dataset.bound = "0";
    document.body.appendChild(hand);
    return hand;
  }

  function hideIntroHand() {
    const hand = document.getElementById("vr-intro-hand");
    if (!hand) return;
    hand.classList.remove("is-visible");
    hand.style.display = "none";
  }

  function positionIntroHandOnJeton() {
    const btn = document.getElementById("btn-jeton");
    if (!btn) return;

    const host =
      btn.closest(".vr-hud-item") ||
      btn.parentElement ||
      document.body;

    const hand = ensureIntroHand();

    if (hand.parentElement !== host) {
      host.appendChild(hand);
    }

    const rect = btn.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const size = Math.max(58, Math.min(80, Math.round(rect.width * 1.2)));

    hand.style.width = `${size}px`;
    hand.style.left = `${Math.round((rect.left - hostRect.left) - (size * 0.46))}px`;
    hand.style.top = `${Math.round((rect.top - hostRect.top) + (rect.height * 0.46))}px`;
  }

  function clearIntroTimers() {
    if (introHintTimer1) {
      clearTimeout(introHintTimer1);
      introHintTimer1 = 0;
    }
    if (introHintTimer2) {
      clearTimeout(introHintTimer2);
      introHintTimer2 = 0;
    }
  }

  function getCardMain() {
    return document.getElementById("vr-card-main");
  }

  function hideIntroCardMain() {
    const cardMain = getCardMain();
    if (cardMain) cardMain.classList.add("vr-intro-card-hidden");
  }

  function showIntroCardMain() {
    const cardMain = getCardMain();
    if (cardMain) cardMain.classList.remove("vr-intro-card-hidden");
  }

  function ensureIntroHintEls() {
    let swipeEl = document.getElementById("vr-intro-swipe-hint");
    if (!swipeEl) {
      swipeEl = document.createElement("div");
      swipeEl.id = "vr-intro-swipe-hint";
      swipeEl.innerHTML = '<div class="vr-intro-hint-text"></div>';
      document.body.appendChild(swipeEl);
    }

    let gaugeEl = document.getElementById("vr-intro-gauge-hint");
    if (!gaugeEl) {
      gaugeEl = document.createElement("div");
      gaugeEl.id = "vr-intro-gauge-hint";
      gaugeEl.innerHTML = '<div class="vr-intro-hint-text"></div>';
      document.body.appendChild(gaugeEl);
    }

    return { swipeEl, gaugeEl };
  }

  function hideSwipeHint() {
    const el = document.getElementById("vr-intro-swipe-hint");
    if (!el) return;
    el.classList.remove("is-visible");
  }

  function showSwipeHint(text) {
    const { swipeEl } = ensureIntroHintEls();
    const inner = swipeEl.querySelector(".vr-intro-hint-text");
    if (inner) inner.textContent = String(text || "");
    swipeEl.classList.add("is-visible");
  }

  function hideGaugeHint() {
    const el = document.getElementById("vr-intro-gauge-hint");
    if (!el) return;
    el.classList.remove("is-visible");
  }

  function showGaugeHint(text) {
    const { gaugeEl } = ensureIntroHintEls();
    const inner = gaugeEl.querySelector(".vr-intro-hint-text");
    if (inner) inner.textContent = String(text || "");
    gaugeEl.classList.add("is-visible");
  }

  function startIntroSwipeSequence() {
    clearIntroTimers();
    hideGaugeHint();

    const btn = getChoiceButton("A");
    if (btn) {
      btn.classList.remove("vr-intro-pulse", "vr-intro-dim", "vr-intro-hide");
      btn.classList.add("vr-intro-tilt");
    }

    showSwipeHint("Swipe");
  }

  function showIntroHandOnJeton() {
    const btn = document.getElementById("btn-jeton");
    if (!btn) return;

    const hand = ensureIntroHand();

    const syncHand = () => {
      const current = document.getElementById("vr-intro-hand");
      if (!current || !current.classList.contains("is-visible")) return;
      positionIntroHandOnJeton();
    };

    if (hand.dataset.bound !== "1") {
      window.addEventListener("resize", syncHand, { passive: true });
      window.addEventListener("orientationchange", syncHand, { passive: true });

      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", syncHand, { passive: true });
        window.visualViewport.addEventListener("scroll", syncHand, { passive: true });
      }

      hand.dataset.bound = "1";
    }

    positionIntroHandOnJeton();
    hand.style.display = "block";
    hand.classList.add("is-visible");

    requestAnimationFrame(() => {
      positionIntroHandOnJeton();
      requestAnimationFrame(() => {
        positionIntroHandOnJeton();
      });
    });
  }

  function focusOnlyChoice(choiceId) {
    const target = getChoiceButton(choiceId);
    allChoiceButtons().forEach((btn) => {
      const label = btn.querySelector(".vr-choice-label")?.textContent?.trim?.() || "";
      const id = String(btn.getAttribute("data-choice") || "").trim();
      btn.classList.remove("vr-intro-tilt", "vr-intro-pulse", "vr-intro-dim", "vr-intro-hide");

      if (btn === target) {
        btn.classList.add("vr-intro-tilt");
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
        return;
      }

      if (id === "B" && choiceId === "A") {
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
        return;
      }

      btn.style.pointerEvents = "none";
      if (!label) btn.classList.add("vr-intro-hide");
      else btn.classList.add("vr-intro-dim");
    });
  }

  function showNormalChoices(choiceIds) {
    const allow = new Set((choiceIds || []).map((v) => String(v || "").trim()));
    allChoiceButtons().forEach((btn) => {
      const label = btn.querySelector(".vr-choice-label")?.textContent?.trim?.() || "";
      const id = String(btn.getAttribute("data-choice") || "").trim();
      btn.classList.remove("vr-intro-tilt", "vr-intro-pulse", "vr-intro-dim", "vr-intro-hide");

      if (allow.has(id)) {
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
        return;
      }

      btn.style.pointerEvents = "none";
      if (!label) btn.classList.add("vr-intro-hide");
      else btn.classList.add("vr-intro-dim");
    });
  }

  function hideAllChoices() {
    allChoiceButtons().forEach((btn) => {
      btn.style.pointerEvents = "none";
      btn.classList.add("vr-intro-hide");
    });
  }

  function pulseGauge(gaugeId) {
    const gauge = document.querySelector(`.vr-gauge[data-gauge-id="${gaugeId}"]`);
    if (gauge) gauge.classList.add("vr-intro-gauge-focus");
  }

  function pulseEl(el) {
    if (el) el.classList.add("vr-intro-pulse");
  }

  function getShopButton() {
    return document.querySelector('.vr-top-actions-game .vr-icon-button[href="shop.html"]');
  }

  function dimTokenPopupExcept(actionToKeep) {
    document.querySelectorAll("#vr-token-popup [data-token-action]").forEach((btn) => {
      const action = String(btn.getAttribute("data-token-action") || "").trim();
      if (action === actionToKeep) {
        btn.classList.add("vr-intro-pulse");
        btn.style.pointerEvents = "auto";
        btn.style.opacity = "1";
      } else {
        btn.classList.add("vr-intro-dim");
        btn.style.pointerEvents = "none";
      }
    });
  }

  function onInit(universeId) {
    const isIntro = String(universeId || "").trim() === INTRO_ID;
    const alreadyDone = (() => {
      try { return localStorage.getItem("vrealms_intro_done") === "1"; }
      catch (_) { return false; }
    })();
    enabled = isIntro && !alreadyDone;
    currentCardId = "";
    finishing = false;
    resetUIState();

    if (isIntro && alreadyDone) {
      try { localStorage.setItem("vrealms_universe", "hell_king"); } catch (_) {}
      try { window.location.href = "index.html"; } catch (_) {}
      return;
    }

    if (!enabled) return;
    ensureStyles();
    introGuidePromise = null;
    clearIntroTimers();
    try { window.VRSave?.clear?.(INTRO_ID); } catch (_) {}
  }

  function onCardShown(cardLogic) {
    if (!isIntroUniverse()) return;
    resetUIState();
    currentCardId = String(cardLogic?.id || "").trim();

    if (currentCardId === "intro_001") {
      hideAllChoices();
      hideIntroCardMain();

      if (!introGuidePromise) {
        introGuidePromise = Promise.resolve(
          window.VRGuideMentor?._open?.(
            "heaven_king",
            [
              t("intro.guide.welcome_title", "Bienvenue"),
              t("intro.guide.welcome_body", "Ah, un nouveau dirigeant pour s’occuper des mondes. Prêt à le faire ?")
            ],
            {
              mode: "rank",
              isEvent: false,
              confetti: true,
              playBell: false
            }
          )
        );

        introGuidePromise.finally(() => {
          introGuidePromise = null;

          if (!isIntroUniverse() || currentCardId !== "intro_001") return;

          showIntroCardMain();
          window.setTimeout(() => {
            try { window.VREngine?._nextCard?.(); } catch (_) {}
          }, 40);
        });
      }
      return;
    }

    if (currentCardId === "intro_002") {
      showNormalChoices(["A"]);
      startIntroSwipeSequence();
      return;
    }

    if (currentCardId === "intro_003") {
      try { window.VRState?.setGaugeValue?.(LOW_GAUGE_ID, INTRO_LOW_GAUGE_VALUE); } catch (_) {}
      try { window.VRUIBinding?.updateGauges?.(); } catch (_) {}
      hideAllChoices();
      pulseGauge(LOW_GAUGE_ID);
      pulseEl(document.getElementById("btn-jeton"));
      showIntroHandOnJeton();
      return;
    }

  }

  function beforeApplyChoice(cardLogic, choiceId) {
    if (!isIntroUniverse()) return true;
    const id = String(cardLogic?.id || currentCardId || "").trim();
    if (id === "intro_001") return false;
    if (id === "intro_002") return choiceId === "A";
    if (id === "intro_003") return false;
    return true;
  }

  function afterApplyChoice(cardLogic, choiceId) {
    if (!isIntroUniverse()) return false;

    const id = String(cardLogic?.id || currentCardId || "").trim();

    if (id === "intro_002" && choiceId === "A") {
      clearIntroTimers();
      hideSwipeHint();
      hideGaugeHint();

      const btn = getChoiceButton("A");
      if (btn) {
        btn.classList.remove("vr-intro-tilt", "vr-intro-pulse");
      }

      window.setTimeout(() => {
        try { pulseGauge(LOW_GAUGE_ID); } catch (_) {}
      }, 180);

      return false;
    }

    return false;
  }

function onTokenPopupOpened() {
  if (!isIntroUniverse()) return;
  if (currentCardId !== "intro_003") return;
  resetUIState();
  hideAllChoices();
  dimTokenPopupExcept("gauge50");
}

function beforeTokenAction(action) {
  if (!isIntroUniverse()) return true;
  if (currentCardId !== "intro_003") return true;
  return action === "gauge50";
}

function isGaugeSelectionLocked() {
  return isIntroUniverse() && currentCardId === "intro_003";
}

function onGaugeOverlayOpened() {
  if (!isIntroUniverse()) return;
  if (currentCardId !== "intro_003") return;

  hideIntroHand();
  clearClasses();
  hideAllChoices();
  pulseGauge(LOW_GAUGE_ID);
}

function onGaugeSet(gaugeId) {
  if (!isIntroUniverse()) return;
  if (currentCardId !== "intro_003") return;
  if (String(gaugeId || "").trim() !== LOW_GAUGE_ID) return;

  resetUIState();
  hideAllChoices();

  const choicesWrap = document.querySelector(".vr-card-choices");
  if (choicesWrap) {
    choicesWrap.style.pointerEvents = "none";
    choicesWrap.style.opacity = "0";
    choicesWrap.style.visibility = "hidden";
  }

  window.setTimeout(() => {
    finishIntro();
  }, 60);
}

  function ensureFinishPopup() {
    let overlay = document.getElementById("vr-intro-finish-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "vr-intro-finish-overlay";
    overlay.className = "vr-ending-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="vr-ending-card vr-intro-finish-card" role="dialog" aria-modal="true">
        <h3 class="vr-intro-finish-title" id="vr-intro-finish-title"></h3>
        <p class="vr-intro-finish-text" id="vr-intro-finish-text"></p>

        <div id="vr-intro-finish-info"></div>

        <p class="vr-intro-finish-gift-text" id="vr-intro-finish-gift-text"></p>

        <div class="vr-intro-finish-rewards">
          <div class="vr-intro-finish-line">
            <strong>+${INTRO_REWARD_VCOINS}</strong>
            <img src="assets/img/ui/vcoins.webp" alt="" draggable="false">
          </div>
          <div class="vr-intro-finish-line">
            <strong>+${INTRO_REWARD_TOKENS}</strong>
            <img src="assets/img/ui/jeton.webp" alt="" draggable="false">
          </div>
        </div>

        <div class="vr-intro-name-block">
          <p class="vr-intro-name-title" id="vr-intro-name-title"></p>
          <input
            id="vr-intro-name-input"
            class="vr-intro-name-input"
            type="text"
            maxlength="20"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
          />
          <div class="vr-intro-name-msg" id="vr-intro-name-msg" aria-live="polite"></div>
        </div>

        <button id="vr-intro-finish-close" class="vr-choice-button" type="button"></button>
      </div>

      <div class="vr-popup" id="vr-intro-name-confirm-popup" role="dialog" aria-modal="true" aria-hidden="true" inert>
        <div class="vr-popup-inner">
          <p
            class="vr-card-text"
            id="vr-intro-name-confirm-text"
            style="text-align:center; margin:4px 0 6px;"
          ></p>

          <button
            class="vr-card vr-token-card vr-token-card-big"
            type="button"
            data-intro-name-confirm="yes"
          >
            <div class="vr-card-content">
              <h4 class="vr-card-title" id="vr-intro-name-confirm-yes"></h4>
            </div>
          </button>

          <button
            class="vr-card vr-token-card"
            type="button"
            data-intro-name-confirm="no"
          >
            <div class="vr-card-content">
              <h4 class="vr-card-title" id="vr-intro-name-confirm-no"></h4>
            </div>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }

  function fillFinishPopupTexts() {
    const titleEl = document.getElementById("vr-intro-finish-title");
    const textEl = document.getElementById("vr-intro-finish-text");
    const infoEl = document.getElementById("vr-intro-finish-info");
    const giftEl = document.getElementById("vr-intro-finish-gift-text");
    const nameTitleEl = document.getElementById("vr-intro-name-title");
    const nameInput = document.getElementById("vr-intro-name-input");
    const msgEl = document.getElementById("vr-intro-name-msg");
    const submitBtn = document.getElementById("vr-intro-finish-close");
    const nameBlock = document.querySelector("#vr-intro-finish-overlay .vr-intro-name-block");

    if (titleEl) titleEl.textContent = t("intro.finish.title", "Bravo");
    if (textEl) textEl.textContent = t("intro.finish.body", "Tu es prêt à gouverner de nombreux univers.");
    if (infoEl) infoEl.innerHTML = t("intro.finish.info_html", "");
    if (giftEl) giftEl.textContent = t("intro.finish.gift", "Pour commencer ton aventure, voici :");
    if (nameTitleEl) nameTitleEl.textContent = "";
    if (nameBlock) nameBlock.style.display = "none";

    if (nameInput) {
      nameInput.placeholder = "";
      nameInput.value = "";
    }

    if (msgEl) {
      msgEl.textContent = "";
      msgEl.className = "vr-intro-name-msg";
    }

    if (submitBtn) {
      submitBtn.textContent = t("intro.finish.cta", "Commencer");
    }
  }

  function setIntroNameMsg(kind, text) {
    const el = document.getElementById("vr-intro-name-msg");
    if (!el) return;
    el.textContent = String(text || "");
    el.className = "vr-intro-name-msg" + (
      kind === "error" ? " is-error" :
      kind === "ok" ? " is-ok" : ""
    );
  }

  function showIntroNameConfirmPopup(name, focusBackEl) {
  const popup = document.getElementById("vr-intro-name-confirm-popup");
  const textEl = document.getElementById("vr-intro-name-confirm-text");
  const yesLabel = document.getElementById("vr-intro-name-confirm-yes");
  const noLabel = document.getElementById("vr-intro-name-confirm-no");
  const yesBtn = popup?.querySelector?.('[data-intro-name-confirm="yes"]');
  const noBtn = popup?.querySelector?.('[data-intro-name-confirm="no"]');

  if (!popup || !yesBtn || !noBtn) {
    return Promise.resolve(true);
  }

  if (textEl) {
    textEl.textContent = t(
      "intro.finish.name_confirm",
      "Es-tu sûr de vouloir garder ce nom : {name} ?"
    ).replace("{name}", name);
  }

  if (yesLabel) {
    yesLabel.textContent = t("intro.finish.name_save", "Valider");
  }

  if (noLabel) {
    noLabel.textContent = t("common.cancel", "Annuler");
  }

  return new Promise((resolve) => {
    const closePopup = () => {
      popup.onclick = null;
      popup.onkeydown = null;
      yesBtn.onclick = null;
      noBtn.onclick = null;

      const active = document.activeElement;
      if (active && popup.contains(active)) {
        try { active.blur(); } catch (_) {}
      }

      try { popup.setAttribute("inert", ""); } catch (_) {}
      popup.setAttribute("aria-hidden", "true");
      popup.style.display = "none";

      try { focusBackEl?.focus?.({ preventScroll: true }); } catch (_) {}
    };

    const decide = (value) => {
      closePopup();
      resolve(!!value);
    };

    yesBtn.onclick = () => decide(true);
    noBtn.onclick = () => decide(false);

    popup.onclick = (e) => {
      if (e.target === popup) decide(false);
    };

    popup.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        decide(false);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        decide(true);
      }
    };

    try { popup.removeAttribute("inert"); } catch (_) {}
    popup.setAttribute("aria-hidden", "false");
    popup.style.display = "flex";

    try { yesBtn.focus({ preventScroll: true }); } catch (_) {}
  });
}

  function buildRandomIntroName() {
    const prefixes = ["Nova", "Astra", "Orion", "Vega", "Luma", "Echo", "Kairo", "Nexa"];
    const suffix = String(1000 + Math.floor(Math.random() * 9000));
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}_${suffix}`;
  }

  async function saveRandomIntroName() {
    const currentName =
      String(
        window.VUserData?.getUsername?.() ||
        window.VUserData?.load?.()?.username ||
        ""
      ).trim();

    if (currentName) {
      return { ok: true, name: currentName };
    }

    for (let i = 0; i < 8; i += 1) {
      const candidate = buildRandomIntroName();

      let res = null;
      try {
        res = await window.VUserData?.setUsername?.(candidate);
      } catch (_) {
        res = { ok: false, reason: "exception" };
      }

      if (res?.ok) return { ok: true, name: candidate };
      if (String(res?.reason || "") === "taken") continue;

      return { ok: false, reason: String(res?.reason || "generic") };
    }

    return { ok: false, reason: "taken" };
  }

  function showFinishPopup() {
    const overlay = ensureFinishPopup();
    fillFinishPopupTexts();

    return new Promise((resolve) => {
      const submitBtn = document.getElementById("vr-intro-finish-close");
      const input = document.getElementById("vr-intro-name-input");
      const nameBlock = overlay.querySelector(".vr-intro-name-block");

      if (nameBlock) nameBlock.style.display = "none";

      const closeAndResolve = () => {
        overlay.classList.remove("vr-ending-visible");
        overlay.setAttribute("aria-hidden", "true");
        resolve(true);
      };

      const setBusy = (busy) => {
        if (submitBtn) submitBtn.disabled = !!busy;
        if (input) input.disabled = !!busy;
      };

      const submit = async () => {
        setIntroNameMsg("ok", t("intro.finish.name_working", "Enregistrement..."));
        setBusy(true);

        const res = await saveRandomIntroName();

        setBusy(false);

        if (res?.ok) {
          closeAndResolve();
          return;
        }

        setIntroNameMsg("error", t("intro.finish.name_err_generic", "Impossible d’enregistrer le nom."));
      };

      overlay.onclick = null;

      if (submitBtn) {
        submitBtn.onclick = submit;
      }

      if (input) {
        input.onkeydown = (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        };
      }

      overlay.setAttribute("aria-hidden", "false");
      overlay.classList.add("vr-ending-visible");

      setBusy(false);
      setIntroNameMsg("", "");

      try { submitBtn?.focus?.({ preventScroll: true }); } catch (_) {}
    });
  }

  async function finishIntro() {
    if (finishing) return;
    finishing = true;
    resetUIState();
    hideAllChoices();

    const choicesWrap = document.querySelector(".vr-card-choices");
    if (choicesWrap) {
      choicesWrap.style.pointerEvents = "none";
      choicesWrap.style.opacity = "0";
      choicesWrap.style.visibility = "hidden";
    }

    const closed = await showFinishPopup();
    if (!closed) {
      finishing = false;
      return;
    }

    let vcoinsOk = false;
    let jetonsOk = false;

    try {
      const v = await window.VUserData?.addVcoinsAsync?.(INTRO_REWARD_VCOINS);
      vcoinsOk = typeof v === "number" && !Number.isNaN(v);
    } catch (_) {}

    try {
      const j = await window.VUserData?.addJetonsAsync?.(INTRO_REWARD_TOKENS);
      jetonsOk = typeof j === "number" && !Number.isNaN(j);
    } catch (_) {}

    if (!vcoinsOk || !jetonsOk) {
      finishing = false;
      return;
    }

    try { window.VRSave?.clear?.(INTRO_ID); } catch (_) {}
    try { localStorage.setItem("vrealms_intro_done", "1"); } catch (_) {}
    try { localStorage.setItem("vrealms_intro_just_finished", "1"); } catch (_) {}
    try { window.VROneSignal?.markPromptPendingOnNextIndex?.(); } catch (_) {}
    try { localStorage.setItem("vrealms_universe", "hell_king"); } catch (_) {}
    try { window.location.href = "index.html"; } catch (_) {}
  }

  window.VRIntroTutorial = {
    onInit,
    onCardShown,
    beforeApplyChoice,
    afterApplyChoice,
    onTokenPopupOpened,
    beforeTokenAction,
    onGaugeOverlayOpened,
    onGaugeSet,
    isGaugeSelectionLocked
  };
})();


// -------------------------------------------------------
// VCoins UI
// -------------------------------------------------------
(function () {
  "use strict";

  function t(key, fallback) {
    try {
      const out = window.VRI18n?.t?.(key);
      if (out && out !== key) return out;
    } catch (_) {}
    return typeof fallback === "string" ? fallback : "";
  }

  function toast(msg) {
    try {
      if (typeof window.showToast === "function") return window.showToast(msg);
    } catch (_) {}

    try {
      const id = "__vr_toast";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;left:50%;bottom:12%;transform:translateX(-50%);" +
          "background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:12px;" +
          "font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
          "z-index:2147483647;max-width:84vw;text-align:center";
        document.body.appendChild(el);
      }
      el.textContent = String(msg || "");
      el.style.opacity = "1";
      clearTimeout(el.__t1); clearTimeout(el.__t2);
      el.__t1 = setTimeout(() => { el.style.transition = "opacity .25s"; el.style.opacity = "0"; }, 2200);
      el.__t2 = setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
    } catch (_) {}
  }

  function runtimeDynastyName() {
    try { return window.VRRuntimeText?.getDynastyName?.() || ""; } catch (_) { return ""; }
  }

  function runtimeYearLabel() {
    try { return window.VRRuntimeText?.getYearLabel?.() || ""; } catch (_) { return ""; }
  }

  const VRCoinUI = {
    init() {
      const btnVcoins = document.getElementById("btn-vcoins");
      const popup = document.getElementById("vr-coins-popup");
      if (!btnVcoins || !popup) return;

      try {
        const vg = document.getElementById("view-game");
        if (vg && popup && vg.contains(popup)) document.body.appendChild(popup);
      } catch (_) {}

      const _showDialog = (el, focusEl) => {
        if (!el) return;
        try { el.removeAttribute("inert"); } catch (_) {}
        el.setAttribute("aria-hidden", "false");
        el.style.display = "flex";
        try { focusEl?.focus?.({ preventScroll: true }); } catch (_) {}
      };

      const _hideDialog = (el, focusBackEl) => {
        if (!el) return;
        const active = document.activeElement;
        if (active && el.contains(active)) {
          try { active.blur(); } catch (_) {}
          try { focusBackEl?.focus?.({ preventScroll: true }); } catch (_) {}
        }
        try { el.setAttribute("inert", ""); } catch (_) {}
        el.setAttribute("aria-hidden", "true");
        el.style.display = "none";
      };

      const openPopup = () => {
        const first = popup?.querySelector?.("[data-coins-action]");
        _showDialog(popup, first || btnVcoins);
      };

      const closePopup = () => {
        _hideDialog(popup, btnVcoins);
      };

      btnVcoins.addEventListener("click", () => openPopup());

      popup.addEventListener("click", (e) => {
        if (e.target === popup) closePopup();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closePopup();
      });

      popup.querySelectorAll("[data-coins-action]").forEach((el) => {
        el.addEventListener("click", async () => {
          const action = el.getAttribute("data-coins-action");
          if (!action) return;

          if (action === "close") { closePopup(); return; }

          if (action === "open_shop") {
            closePopup();
            try { window.location.href = "shop.html"; } catch (_) {}
            return;
          }

    if (action === "adcoins") {
  closePopup();

  const ok = await (window.VRAds?.showRewardedAd?.({ placement: "coins_100" }) || Promise.resolve(false));
  if (ok) {
    try { window.VRAds?.markGameRewardSeen?.(); } catch (_) {}
    const beforeCoins = Number(window.VUserData?.getVcoins?.() || 0);

    try {
      await window.VUserData?.addVcoinsAsync?.(100);
      await window.VUserData?.refresh?.();
    } catch (_) {}

    const afterCoins = Number(window.VUserData?.getVcoins?.() || beforeCoins);
    if (afterCoins < beforeCoins + 100) {
      toast(t("coins.toast.reward_fail", "Pub indisponible"));
      return;
    }


    try {
      const me = await window.VRProfile?.getMe?.(0);
      if (me) {
        window.VREngine._uiCoins = window.VRProfile._n(me.vcoins);
        window.VREngine._uiTokens = window.VRProfile._n(me.jetons);
      }
    } catch (_) {}

    const kingName = runtimeDynastyName();
    window.VRUIBinding?.updateMeta?.(
      kingName,
      runtimeYearLabel(),
      window.VREngine?._uiCoins || 0,
      window.VREngine?._uiTokens || 0
    );

    toast(t("coins.toast.reward_ok", "+100 pièces ajoutées"));
  } else {
    toast(t("coins.toast.reward_fail", "Pub indisponible"));
  }
  return;
}
        });
      });
    }
  };

  window.VRCoinUI = VRCoinUI;
})();


// -------------------------------------------------------
// COSMETICS GAME
// -------------------------------------------------------
(function () {
  "use strict";

  const DEFAULT_GRAY_ASSETS = {
    hell_king: {
      background: "assets/img/backgrounds/hell_default_gray.webp",
      message: "assets/img/ui/hell_msg_default_gray.webp",
      choice: "assets/img/ui/hell_choice_default_gray.webp"
    },
    heaven_king: {
      background: "assets/img/backgrounds/heaven_default_gray.webp",
      message: "assets/img/ui/heaven_msg_default_gray.webp",
      choice: "assets/img/ui/heaven_choice_default_gray.webp"
    },
    western_president: {
      background: "assets/img/backgrounds/west_default_gray.webp",
      message: "assets/img/ui/west_msg_default_grey.webp",
      choice: "assets/img/ui/west_choice_default_grey.webp"
    },
    mega_corp_ceo: {
      background: "assets/img/backgrounds/corp_default_gray.webp",
      message: "assets/img/ui/corp_msg_default_gray.webp",
      choice: "assets/img/ui/corp_choice_default_gray.webp"
    },
    new_world_explorer: {
      background: "assets/img/backgrounds/explorer_default_gray.webp",
      message: "assets/img/ui/explorer_msg_default_gray.webp",
      choice: "assets/img/ui/explorer_choice_default_gray.webp"
    },
    vampire_lord: {
      background: "assets/img/backgrounds/vampire_default_gray.webp",
      message: "assets/img/ui/vampire_msg_default_gray.webp",
      choice: "assets/img/ui/vampire_choice_default_gray.webp"
    },
    intro: {
      background: "assets/img/backgrounds/intro_default_gray.webp",
      message: "assets/img/ui/intro_msg_default_gray.webp",
      choice: "assets/img/ui/intro_choice_default_gray.webp"
    }
  };

  const _state = {
    open: false,
    universeId: "",
    index: {
      background: 0,
      message: 0,
      choice: 0
    }
  };

  function t(key, fallback) {
    try {
      const out = window.VRI18n?.t?.(key);
      if (out && out !== key) return out;
    } catch (_) {}
    return typeof fallback === "string" ? fallback : "";
  }

  function toast(msg) {
    try {
      if (typeof window.showToast === "function") return window.showToast(msg);
    } catch (_) {}

    try {
      const id = "__vr_toast";
      let el = document.getElementById(id);
      if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.cssText =
          "position:fixed;left:50%;bottom:12%;transform:translateX(-50%);" +
          "background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:12px;" +
          "font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
          "z-index:2147483647;max-width:84vw;text-align:center";
        document.body.appendChild(el);
      }
      el.textContent = String(msg || "");
      el.style.opacity = "1";
      clearTimeout(el.__t1); clearTimeout(el.__t2);
      el.__t1 = setTimeout(() => { el.style.transition = "opacity .25s"; el.style.opacity = "0"; }, 2200);
      el.__t2 = setTimeout(() => { try { el.remove(); } catch (_) {} }, 2600);
    } catch (_) {}
  }

  function ensureStyles() {
    if (document.getElementById("vr-customize-inline-style")) return;

    const style = document.createElement("style");
    style.id = "vr-customize-inline-style";
   style.textContent = `
  #vr-ending-overlay .vr-ending-card{
    text-align:center;
    align-items:stretch;
    gap:10px;
  }

  #vr-ending-overlay .vr-ending-title,
  #vr-ending-overlay .vr-ending-text{
    text-align:center !important;
  }

  #vr-ending-overlay .vr-ending-reward{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    padding:0;
    margin:0 0 2px;
    background:transparent;
    border:none;
    box-shadow:none;
  }

  #vr-ending-overlay .vr-ending-reward img{
    width:24px;
    height:24px;
    object-fit:contain;
    filter:drop-shadow(0 4px 8px rgba(0,0,0,.28));
    transform:translateY(1px);
  }

  #vr-ending-overlay .vr-ending-reward strong{
    font-size:18px;
    font-weight:950;
    letter-spacing:.2px;
    line-height:1;
  }

  #vr-ending-overlay .vr-ending-double{
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:3px;
  width:100%;
  min-height:50px;
  height:50px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:14px;
  padding:8px 12px;
  box-sizing:border-box;
  background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05));
  box-shadow:0 10px 20px rgba(0,0,0,.24);
  color:#fff;
  font:inherit;
  cursor:pointer;
  margin:4px 0 10px;
}

  #vr-ending-overlay .vr-ending-double::before{
    content:"";
    position:absolute;
    inset:0;
    background:radial-gradient(circle at 50% 18%, rgba(255,255,255,.18), transparent 55%);
    pointer-events:none;
  }

  #vr-ending-overlay .vr-ending-double.is-glow{
    animation:vrEndingPulse .8s linear infinite;
  }

  #vr-ending-overlay .vr-ending-double[disabled]{
    opacity:.72;
    cursor:default;
    animation:none !important;
  }

  #vr-ending-overlay .vr-ending-double-title{
    display:flex;
    align-items:center;
    justify-content:center;
    gap:6px;
    font-size:16px;
    font-weight:950;
    line-height:1.02;
  }

  #vr-ending-overlay .vr-ending-double-title img{
    width:20px;
    height:20px;
    object-fit:contain;
    filter:drop-shadow(0 4px 8px rgba(0,0,0,.34));
  }

  #vr-ending-overlay .vr-ending-double-sub{
  display:flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  font-size:14px;
  font-weight:900;
  line-height:1.05;
  opacity:1;
}

  #vr-ending-overlay .vr-ending-double-sub img{
    width:14px;
    height:14px;
    object-fit:contain;
    filter:drop-shadow(0 3px 6px rgba(0,0,0,.28));
  }

  #vr-ending-overlay .vr-ending-actions{
    display:flex !important;
    flex-direction:column !important;
    gap:6px !important;
    margin-top:4px !important;
    width:100% !important;
    max-width:none !important;
    align-items:stretch !important;
  }

  #vr-ending-overlay .vr-ending-actions-bottom{
    display:flex !important;
    flex-direction:column !important;
    gap:6px !important;
    width:100% !important;
    max-width:none !important;
    align-self:stretch !important;
    align-items:stretch !important;
    margin:0 !important;
  }

  #vr-ending-overlay .vr-ending-actions-bottom .vr-choice-button{
    width:100% !important;
    max-width:none !important;
    min-width:0 !important;
    align-self:stretch !important;
  }

  #vr-ending-overlay #ending-revive-btn,
  #vr-ending-overlay #ending-restart-btn,
  #vr-ending-overlay #ending-return-btn{
    width:100% !important;
    max-width:none !important;
    min-width:0 !important;
    min-height:42px !important;
    height:42px !important;
    padding:5px 10px !important;
    box-sizing:border-box !important;
    border:1px solid rgba(255,255,255,.14) !important;
    border-radius:14px !important;
    background:linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05)) !important;
    box-shadow:0 10px 20px rgba(0,0,0,.24) !important;
    color:#fff !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important;
    align-self:stretch !important;
    margin:0 !important;
    font-size:16px !important;
    font-weight:950 !important;
    line-height:1.02 !important;
  }

  @keyframes vrEndingPulse{
  0%,100%{ opacity:1; transform:scale(1); filter:brightness(1); }
  50%{ opacity:.82; transform:scale(1.05); filter:brightness(1.34); }
}
`;
    document.head.appendChild(style);
  }

  function getPopup() {
    return document.getElementById("vr-customize-popup");
  }

  function getContent() {
    return document.getElementById("vr-customize-content");
  }

  function getUniverse(universeId) {
    try {
      return window.VRCosmeticsCatalog?.getUniverse?.(universeId) || null;
    } catch (_) {
      return null;
    }
  }

  function getItem(universeId, category, itemId) {
    try {
      return window.VRCosmeticsCatalog?.getItem?.(universeId, category, itemId) || null;
    } catch (_) {
      return null;
    }
  }

  function getItems(universeId, category) {
    const universe = getUniverse(universeId);
    return Array.isArray(universe?.categories?.[category]) ? universe.categories[category] : [];
  }

  function getDefaultAsset(universeId, category) {
    return DEFAULT_GRAY_ASSETS?.[universeId]?.[category] || "";
  }

  function getEquippedItem(universeId, category) {
    const equippedId = String(window.VUserData?.getEquippedCosmetic?.(universeId, category) || "");
    if (!equippedId) return null;
    return getItem(universeId, category, equippedId);
  }

  function resolveAppliedAsset(universeId, category) {
    const equippedItem = getEquippedItem(universeId, category);
    if (equippedItem?.img) return equippedItem.img;
    return getDefaultAsset(universeId, category);
  }

  function applyUniverseCosmetics(universeId) {
    const viewGame = document.getElementById("view-game");
    const cardMain = document.getElementById("vr-card-main");
    const choiceBtns = document.querySelectorAll(".vr-choice-button[data-choice]");
    if (!viewGame || !universeId) return;

    const bg = resolveAppliedAsset(universeId, "background");
    const message = resolveAppliedAsset(universeId, "message");
    const choice = resolveAppliedAsset(universeId, "choice");

    if (bg) {
      viewGame.style.backgroundImage = `url("${bg}")`;
      viewGame.style.backgroundSize = "100% 100%";
      viewGame.style.backgroundPosition = "center center";
      viewGame.style.backgroundRepeat = "no-repeat";
    }

    if (cardMain && message) {
      cardMain.style.backgroundImage = `url("${message}")`;
      cardMain.style.backgroundSize = "100% 100%";
      cardMain.style.backgroundPosition = "center center";
      cardMain.style.backgroundRepeat = "no-repeat";
    }

    choiceBtns.forEach((btn) => {
      if (!choice) return;
      btn.style.backgroundImage = `url("${choice}")`;
      btn.style.backgroundSize = "100% 100%";
      btn.style.backgroundPosition = "center center";
      btn.style.backgroundRepeat = "no-repeat";
    });
  }

  function getActionMeta(universeId, category, item) {
    const owned = !!window.VUserData?.isCosmeticOwned?.(universeId, category, item.id);
    const equippedId = String(window.VUserData?.getEquippedCosmetic?.(universeId, category) || "");
    const equipped = owned && equippedId === item.id;

    if (equipped) {
      return {
        text: t("common.equipped", ""),
        className: "vr-customize-action is-equipped"
      };
    }
    if (owned) {
      return {
        text: t("common.use", ""),
        className: "vr-customize-action is-owned"
      };
    }
    return {
      text: `${t("common.buy", "")} · ${item.price}`,
      className: "vr-customize-action"
    };
  }

  function clampIndex(category, max) {
    const raw = Number(_state.index[category] || 0);
    if (max <= 0) return 0;
    return Math.max(0, Math.min(max - 1, raw));
  }

  function renderRow(universeId, category) {
    const items = getItems(universeId, category);
    const idx = clampIndex(category, items.length);
    _state.index[category] = idx;

    const subtitleKey = window.VRCosmeticsCatalog?.CATEGORY_KEYS?.[category] || category;

    if (!items.length) {
      return `
        <div class="vr-customize-row" data-category="${category}">
          <div class="vr-customize-subtitle">${t(subtitleKey, "")}</div>
          <div class="vr-customize-note">${t("common.unavailable", "")}</div>
        </div>
      `;
    }

    const item = items[idx];
    const action = getActionMeta(universeId, category, item);

    return `
      <div class="vr-customize-row" data-category="${category}">
        <div class="vr-customize-subtitle">${t(subtitleKey, "")}</div>

        <div class="vr-customize-carousel">
          <button class="vr-customize-arrow" type="button" data-cus-nav="prev" data-category="${category}" ${idx <= 0 ? "disabled" : ""}>‹</button>

          <div class="vr-customize-card ${item.kind === "ui" ? "is-ui" : ""}">
            <img src="${item.img}" alt="" draggable="false">
            <div class="vr-customize-overlay">
              <div class="vr-customize-name">${t(item.nameKey, "")}</div>
              <div class="vr-customize-bottom">
                <div class="vr-customize-price">
                  <img src="assets/img/ui/vcoins.webp" alt="" draggable="false">
                  <span>${item.price}</span>
                </div>
                <div class="vr-customize-count">${idx + 1} / ${items.length}</div>
              </div>
              <button
                class="${action.className}"
                type="button"
                data-cus-action="item"
                data-universe="${universeId}"
                data-category="${category}"
                data-item-id="${item.id}"
                data-price="${item.price}"
              >${action.text}</button>
            </div>
          </div>

          <button class="vr-customize-arrow" type="button" data-cus-nav="next" data-category="${category}" ${idx >= items.length - 1 ? "disabled" : ""}>›</button>
        </div>
      </div>
    `;
  }

  function ensurePopupShell(universeId) {
    const content = getContent();
    if (!content) return null;

    if (!content.querySelector("#vr-customize-title")) {
      content.innerHTML = `
        <div class="vr-customize-universe-title" id="vr-customize-title"></div>
        <div id="vr-customize-rows"></div>
      `;
    }

    const universe = getUniverse(universeId);
    const titleEl = content.querySelector("#vr-customize-title");
    if (titleEl) {
      titleEl.textContent = t(universe?.labelKey || "", "");
    }

    return content.querySelector("#vr-customize-rows");
  }

  function renderRowOnly(category) {
    const universeId = _state.universeId || window.VRGame?.currentUniverse || localStorage.getItem("vrealms_universe") || "hell_king";
    const rowsRoot = ensurePopupShell(universeId);
    if (!rowsRoot) return;

    const html = renderRow(universeId, category);
    const holder = document.createElement("div");
    holder.innerHTML = html.trim();
    const freshRow = holder.firstElementChild;
    if (!freshRow) return;

    const existing = rowsRoot.querySelector(`.vr-customize-row[data-category="${category}"]`);
    if (existing) {
      existing.replaceWith(freshRow);
    } else {
      const order = ["background", "message", "choice"];
      const idx = order.indexOf(category);
      if (idx < 0 || idx >= rowsRoot.children.length) {
        rowsRoot.appendChild(freshRow);
      } else {
        const ref = rowsRoot.children[idx];
        if (ref) rowsRoot.insertBefore(freshRow, ref);
        else rowsRoot.appendChild(freshRow);
      }
    }
  }

  function renderPopup() {
    const universeId = _state.universeId || window.VRGame?.currentUniverse || localStorage.getItem("vrealms_universe") || "hell_king";
    ensurePopupShell(universeId);
    renderRowOnly("background");
    renderRowOnly("message");
    renderRowOnly("choice");
  }

  function showDialog(el, focusEl) {
    if (!el) return;
    try { el.removeAttribute("inert"); } catch (_) {}
    el.setAttribute("aria-hidden", "false");
    el.style.display = "flex";
    try { focusEl?.focus?.({ preventScroll: true }); } catch (_) {}
  }

  function hideDialog(el, focusBackEl) {
    if (!el) return;
    const active = document.activeElement;
    if (active && el.contains(active)) {
      try { active.blur(); } catch (_) {}
      try { focusBackEl?.focus?.({ preventScroll: true }); } catch (_) {}
    }
    try { el.setAttribute("inert", ""); } catch (_) {}
    el.setAttribute("aria-hidden", "true");
    el.style.display = "none";
  }

  function openPopup() {
    const popup = getPopup();
    const btn = document.getElementById("btn-customize");
    _state.universeId = window.VRGame?.currentUniverse || localStorage.getItem("vrealms_universe") || "hell_king";
    renderPopup();
    showDialog(popup, popup?.querySelector?.("[data-cus-nav], [data-cus-action]") || btn);
    _state.open = true;
  }

  function closePopup() {
    const popup = getPopup();
    const btn = document.getElementById("btn-customize");
    hideDialog(popup, btn);
    _state.open = false;
  }

  async function handleItemAction(btn) {
    const universeId = String(btn?.dataset?.universe || "").trim();
    const category = String(btn?.dataset?.category || "").trim();
    const itemId = String(btn?.dataset?.itemId || "").trim();
    const price = Number(btn?.dataset?.price || 0);

    if (!universeId || !category || !itemId) return;
    btn.disabled = true;

    try {
      const owned = !!window.VUserData?.isCosmeticOwned?.(universeId, category, itemId);
      let res = null;

      if (!owned) {
        res = await window.VUserData?.buyCosmetic?.({
          universeId,
          category,
          itemId,
          price
        }, { autoEquip: true });
      } else {
        res = await window.VUserData?.equipCosmetic?.(universeId, category, itemId);
      }

      if (!res?.ok) {
        if (res?.reason === "insufficient_vcoins") {
          toast(t("shop.toast.insufficient_vcoins", ""));
          try {
            await window.VRCrossPromo?.showLowVcoinsPopupNow?.();
          } catch (_) {}
        } else if (res?.reason === "not_owned") {
          toast(t("shop.toast.not_owned", ""));
        } else {
          toast(t("common.error_generic", ""));
        }
      } else {
        applyUniverseCosmetics(universeId);
        renderRowOnly(category);
      }
    } catch (_) {
      toast(t("common.error_generic", ""));
    } finally {
      btn.disabled = false;
    }
  }

  function init() {
    ensureStyles();

    const btn = document.getElementById("btn-customize");
    const popup = getPopup();

    if (!btn || !popup) return;
    function ensureCloseX() {
      const inner = popup.querySelector(".vr-popup-inner");
      if (!inner) return;

      if (inner.querySelector(".vr-customize-x")) return;

      const x = document.createElement("button");
      x.type = "button";
      x.className = "vr-customize-x";

      x.setAttribute("data-customize-action", "close");
      x.setAttribute("aria-label", "");
      x.setAttribute("data-i18n-aria", "common.close");

      inner.insertBefore(x, inner.firstChild);
    }

    ensureCloseX();

    btn.addEventListener("click", () => openPopup());

    popup.addEventListener("click", async (e) => {
      if (e.target === popup) {
        closePopup();
        return;
      }

      const closeBtn = e.target?.closest?.("[data-customize-action='close']");
      if (closeBtn) {
        closePopup();
        return;
      }

      const navBtn = e.target?.closest?.("[data-cus-nav]");
      if (navBtn) {
        const dir = String(navBtn.dataset.cusNav || "");
        const category = String(navBtn.dataset.category || "");
        const items = getItems(_state.universeId, category);
        if (!items.length) return;

        let next = Number(_state.index[category] || 0);
        if (dir === "prev") next -= 1;
        if (dir === "next") next += 1;
        _state.index[category] = Math.max(0, Math.min(items.length - 1, next));

        renderRowOnly(category);
        return;
      }

      const actionBtn = e.target?.closest?.("[data-cus-action='item']");
      if (actionBtn) {
        await handleItemAction(actionBtn);
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && _state.open) closePopup();
    });

    window.addEventListener("vr:profile", () => {
      const universeId = window.VRGame?.currentUniverse || localStorage.getItem("vrealms_universe") || "hell_king";
      applyUniverseCosmetics(universeId);

      if (_state.open) {
        renderPopup();
      }
    });
  }

  window.VRCosmeticsGame = {
    init,
    open: openPopup,
    close: closePopup,
    render: renderPopup,
    renderRowOnly,
    apply: applyUniverseCosmetics
  };
})();


// -------------------------------------------------------
// PREVIEW MODE (iframe depuis la boutique)
// -------------------------------------------------------
(function () {
  "use strict";

  const PREVIEW_DEFAULT_ASSETS = {
    hell_king: {
      background: "assets/img/backgrounds/hell_default_gray.webp",
      message: "assets/img/ui/hell_msg_default_gray.webp",
      choice: "assets/img/ui/hell_choice_default_gray.webp"
    },
    heaven_king: {
      background: "assets/img/backgrounds/heaven_default_gray.webp",
      message: "assets/img/ui/heaven_msg_default_gray.webp",
      choice: "assets/img/ui/heaven_choice_default_gray.webp"
    },
    western_president: {
      background: "assets/img/backgrounds/west_default_gray.webp",
      message: "assets/img/ui/west_msg_default_grey.webp",
      choice: "assets/img/ui/west_choice_default_grey.webp"
    },
    mega_corp_ceo: {
      background: "assets/img/backgrounds/corp_default_gray.webp",
      message: "assets/img/ui/corp_msg_default_gray.webp",
      choice: "assets/img/ui/corp_choice_default_gray.webp"
    },
    new_world_explorer: {
      background: "assets/img/backgrounds/explorer_default_gray.webp",
      message: "assets/img/ui/explorer_msg_default_gray.webp",
      choice: "assets/img/ui/explorer_choice_default_gray.webp"
    },
    vampire_lord: {
      background: "assets/img/backgrounds/vampire_default_gray.webp",
      message: "assets/img/ui/vampire_msg_default_gray.webp",
      choice: "assets/img/ui/vampire_choice_default_gray.webp"
    },
    intro: {
      background: "assets/img/backgrounds/intro_default_gray.webp",
      message: "assets/img/ui/intro_msg_default_gray.webp",
      choice: "assets/img/ui/intro_choice_default_gray.webp"
    }
  };

  function tt(key, fallback) {
    try {
      const out = window.VRI18n?.t?.(key);
      if (out && out !== key) return out;
    } catch (_) {}
    return typeof fallback === "string" ? fallback : "";
  }

  function getPreviewConfig() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      return {
        enabled: params.get("preview") === "1" || window.__VR_PREVIEW_MODE === true,
        universeId: String(params.get("universe") || localStorage.getItem("vrealms_universe") || "hell_king").trim(),
        category: String(params.get("category") || "").trim(),
        itemId: String(params.get("itemId") || "").trim(),
        src: String(params.get("src") || "").trim()
      };
    } catch (_) {
      return {
        enabled: false,
        universeId: "hell_king",
        category: "",
        itemId: "",
        src: ""
      };
    }
  }

  function getPreviewLang() {
    try {
      const l = window.VRI18n?.getLang?.();
      if (l) return String(l).trim();
    } catch (_) {}

    try {
      const l = localStorage.getItem("vuniverse_lang") || localStorage.getItem("vrealms_lang");
      if (l) return String(l).trim();
    } catch (_) {}

    return "en";
  }

  function getDefaultPreviewAsset(universeId, category) {
    return PREVIEW_DEFAULT_ASSETS?.[universeId]?.[category] || "";
  }

function resolvePreviewAssets(cfg) {
  function getEquippedOrDefault(category) {
    try {
      const equippedId = String(window.VUserData?.getEquippedCosmetic?.(cfg.universeId, category) || "");
      if (equippedId) {
        const item = window.VRCosmeticsCatalog?.getItem?.(cfg.universeId, category, equippedId);
        if (item?.img) return item.img;
      }
    } catch (_) {}

    return getDefaultPreviewAsset(cfg.universeId, category);
  }

  return {
    background:
      cfg.category === "background" && cfg.src
        ? cfg.src
        : getEquippedOrDefault("background"),

    message:
      cfg.category === "message" && cfg.src
        ? cfg.src
        : getEquippedOrDefault("message"),

    choice:
      cfg.category === "choice" && cfg.src
        ? cfg.src
        : getEquippedOrDefault("choice")
  };
  }

  function setBgImage(el, src) {
    if (!el || !src) return;
    el.style.backgroundImage = `url("${src}")`;
    el.style.backgroundSize = "100% 100%";
    el.style.backgroundPosition = "center center";
    el.style.backgroundRepeat = "no-repeat";
  }

  function ensurePreviewStyles() {
    if (document.getElementById("vr-preview-inline-style")) return;

    const style = document.createElement("style");
    style.id = "vr-preview-inline-style";
    style.textContent = `
    html.vr-preview-mode,
    body.vr-preview-mode{
      width:100% !important;
      height:100% !important;
      margin:0 !important;
      overflow:hidden !important;
      overscroll-behavior:none !important;
      background:#0b1220 !important;
    }

    body.vr-preview-mode > a.vr-icon-button,
    body.vr-preview-mode > button#btn-customize,
    body.vr-preview-mode .vr-popup,
    body.vr-preview-mode #vr-ending-overlay,
    body.vr-preview-mode #vr-token-gauge-overlay{
      display:none !important;
    }

    body.vr-preview-mode .vr-main{
      position:relative !important;
      left:auto !important;
      top:auto !important;
      width:100% !important;
      min-width:0 !important;
      max-width:none !important;
      height:100% !important;
      min-height:100% !important;
      max-height:none !important;
      padding:0 !important;
      margin:0 !important;
      overflow:hidden !important;
      transform:none !important;
      transform-origin:center center !important;
    }

    body.vr-preview-mode #view-game{
      width:100% !important;
      height:100% !important;
      min-height:100% !important;
      overflow:hidden !important;
    }

    body.vr-preview-mode a,
    body.vr-preview-mode button{
      pointer-events:none !important;
    }
  `;
    document.head.appendChild(style);
  }

  function updatePreviewScale() {
    if (!document.body.classList.contains("vr-preview-mode")) return;

    const baseW = 430;
    const baseH = 932;
    const pad = 8;

    const availW = Math.max(0, window.innerWidth - (pad * 2));
    const availH = Math.max(0, window.innerHeight - (pad * 2));

    const scale = Math.min(availW / baseW, availH / baseH);

    document.body.style.setProperty("--vr-preview-scale", String(Math.max(0.1, scale)));
  }

  function resetPreviewMeta() {
    const coins = document.getElementById("meta-coins");
    const tokens = document.getElementById("meta-tokens");
    const name = document.getElementById("meta-king-name");
    const years = document.getElementById("meta-years");

    if (coins) coins.textContent = "0";
    if (tokens) tokens.textContent = "0";
    if (name) name.textContent = "—";
    if (years) years.textContent = "";
  }

  function fillPreviewFallbackTexts() {
    const title = document.getElementById("card-title");
    const text = document.getElementById("card-text");
    const a = document.getElementById("choice-A");
    const b = document.getElementById("choice-B");
    const c = document.getElementById("choice-C");

    if (title) title.textContent = tt("shop.preview.sample_title", "Décision");
    if (text) text.textContent = tt("shop.preview.sample_text", "Aperçu en situation du cosmétique sélectionné.");
    if (a) a.textContent = tt("shop.preview.sample_choice_a", "Accepter");
    if (b) b.textContent = tt("shop.preview.sample_choice_b", "Refuser");
    if (c) c.textContent = tt("shop.preview.sample_choice_c", "Reporter");
  }

  function pickSampleCard(deck, cardTexts) {
    if (!Array.isArray(deck) || !deck.length) return null;

    for (const card of deck) {
      if (card && card.id && cardTexts && cardTexts[card.id]) {
        return card;
      }
    }

    return deck[0] || null;
  }

  function applyPreviewCosmetics(cfg) {
    const viewGame = document.getElementById("view-game");
    const cardMain = document.getElementById("vr-card-main");
    const choiceBtns = document.querySelectorAll(".vr-choice-button[data-choice]");
    if (!viewGame) return;

    try {
      document.body.dataset.universe = cfg.universeId;
    } catch (_) {}

    try {
      window.VRGame.currentUniverse = cfg.universeId;
    } catch (_) {}

    try {
      window.VRGame?.applyUniverseBackground?.(cfg.universeId);
    } catch (_) {}

    try {
      window.VRCosmeticsGame?.apply?.(cfg.universeId);
    } catch (_) {}

    const assets = resolvePreviewAssets(cfg);

    if (assets.background) setBgImage(viewGame, assets.background);
    if (assets.message) setBgImage(cardMain, assets.message);

    choiceBtns.forEach(function (btn) {
      if (assets.choice) setBgImage(btn, assets.choice);
    });
  }

  async function initPreviewMode() {
    const cfg = getPreviewConfig();
    if (!cfg.enabled) return false;

    ensurePreviewStyles();

    document.documentElement.classList.add("vr-preview-mode");
    document.body.classList.add("vr-preview-mode");

    try { await window.VUserData?.init?.(); } catch (_) {}

    const lang = getPreviewLang();


    try {
      const loaded = await window.VREventsLoader.loadUniverseData(cfg.universeId, lang);
      const config = loaded?.config || null;
      const deck = loaded?.deck || [];
      const cardTexts = loaded?.cardTexts || {};

      if (config) {
        try { window.VRState?.initUniverse?.(config); } catch (_) {}
        try { window.VRUIBinding?.init?.(config, lang, cardTexts); } catch (_) {}

        const sampleCard = pickSampleCard(deck, cardTexts);
        if (sampleCard) {
          try { window.VRUIBinding?.showCard?.(sampleCard); } catch (_) {
            fillPreviewFallbackTexts();
          }
        } else {
          fillPreviewFallbackTexts();
        }

        try { window.VRUIBinding?.updateGauges?.(); } catch (_) {}
      } else {
        fillPreviewFallbackTexts();
      }
    } catch (e) {
      console.error("[VRPreview] init error:", e);
      fillPreviewFallbackTexts();
    }

    applyPreviewCosmetics(cfg);

    return true;
  }

  window.VRPreviewMode = {
    getConfig: getPreviewConfig,
    init: initPreviewMode
  };
})();


// -------------------------------------------------------
// VRGame
// -------------------------------------------------------

window.VRGuideMentor = {
  _hideTimer: null,
  _finalTimer: null,
  _confettiCleanupTimer: null,
  _enableNextTimer: null,
  _dismissEnabledAt: 0,
  _dismissResolver: null,

  _els() {
    return {
      overlay: document.getElementById("vr-guide-overlay"),
      image: document.getElementById("vr-guide-image"),
      bubble: document.getElementById("vr-guide-bubble-text"),
      fit: document.getElementById("vr-guide-bubble-fit"),
      nextWrap: document.getElementById("vr-guide-actions-next"),
      nextBtn: document.getElementById("vr-guide-next-btn"),
      majorChoiceWrap: document.getElementById("vr-guide-actions-major-choice"),
      majorPreviewBtn: document.getElementById("vr-guide-major-preview-btn"),
      majorYesBtn: document.getElementById("vr-guide-major-yes-btn"),
      majorNoBtn: document.getElementById("vr-guide-major-no-btn"),
      majorResultWrap: document.getElementById("vr-guide-actions-major-result"),
      majorCloseBtn: document.getElementById("vr-guide-major-close-btn"),
      view: document.getElementById("view-game")
    };
  },

  _t(key, fallback, vars) {
    let out = "";

    try {
      out = window.VRI18n?.t?.(key) || fallback || key;
    } catch (_) {
      out = fallback || key;
    }

    if (vars && typeof out === "string") {
      Object.keys(vars).forEach((k) => {
        const value = String(vars[k]);
        out = out.replaceAll(`{${k}}`, value);
      });
    }

    return out;
  },

  _rankKey(universeId, tier) {
    return `guideMentor.${universeId}.ranks.${tier}`;
  },

  _messageKey(universeId, tierOrIntro) {
    return `guideMentor.${universeId}.${tierOrIntro}`;
  },

  _setText(lines, mode = "rank") {
    const { fit } = this._els();
    if (!fit) return;

    const items = Array.isArray(lines)
      ? lines.map(v => String(v || "").trim()).filter(Boolean)
      : [String(lines || "").trim()].filter(Boolean);

    fit.innerHTML = "";

    items.forEach((line, index) => {
      const div = document.createElement("div");

      if (index === 0) {
        div.className = "vr-guide-line vr-guide-line--title";
      } else if (index === 1) {
        div.className = "vr-guide-line vr-guide-line--lead";
      } else {
        div.className = "vr-guide-line vr-guide-line--body";
      }

      if ((mode === "event" || mode === "major") && index > 0) {
        div.style.whiteSpace = "pre-wrap";
      }

      div.textContent = line;
      fit.appendChild(div);
    });
  },

  _setActionMode(mode, payload = {}) {
    const {
      overlay,
      nextWrap,
      nextBtn,
      majorChoiceWrap,
      majorPreviewBtn,
      majorYesBtn,
      majorNoBtn,
      majorResultWrap,
      majorCloseBtn
    } = this._els();

    if (!overlay) return;

    overlay.classList.toggle("is-event", mode === "event");
    overlay.classList.toggle("is-major-choice", mode === "major-choice");
    overlay.classList.toggle("is-major-result", mode === "major-result");

    nextWrap?.classList.toggle("is-hidden", mode !== "default" && mode !== "event");
    majorChoiceWrap?.classList.toggle("is-hidden", mode !== "major-choice");
    majorResultWrap?.classList.toggle("is-hidden", mode !== "major-result");

    if (nextBtn) {
      nextBtn.setAttribute("aria-label", this._t("guideMentor.common.nextButton", "Next"));
      const isEventPopup = mode === "event";
      nextBtn.disabled = isEventPopup;
      nextBtn.setAttribute("aria-disabled", isEventPopup ? "true" : "false");
    }

    if (majorYesBtn) {
      majorYesBtn.textContent = String(payload.yesLabel || this._t("common.yes", "Oui"));
      majorYesBtn.disabled = false;
      majorYesBtn.removeAttribute("aria-disabled");
    }

    if (majorNoBtn) {
      majorNoBtn.textContent = String(payload.noLabel || this._t("common.no", "Non"));
      majorNoBtn.disabled = false;
      majorNoBtn.removeAttribute("aria-disabled");
    }

    if (majorPreviewBtn) {
      const previewLabel = String(payload.previewLabel || "").trim();
      const previewVisible = !!previewLabel && mode === "major-choice";
      majorPreviewBtn.textContent = previewLabel;
      majorPreviewBtn.classList.toggle("is-hidden", !previewVisible);
      majorPreviewBtn.disabled = false;
      majorPreviewBtn.removeAttribute("aria-disabled");
    }

    if (majorCloseBtn) {
      majorCloseBtn.textContent = String(payload.closeLabel || "X");
      majorCloseBtn.disabled = false;
      majorCloseBtn.removeAttribute("aria-disabled");
    }
  },

  _resolveDismiss() {
    const fn = this._dismissResolver;
    this._dismissResolver = null;

    if (typeof fn === "function") {
      try { fn(); } catch (_) {}
    }
  },

  _createDismissPromise() {
    this._resolveDismiss();

    return new Promise((resolve) => {
      this._dismissResolver = resolve;
    });
  },

  _ensureDismissBinding() {
    const {
      overlay,
      nextBtn,
      majorYesBtn,
      majorNoBtn,
      majorPreviewBtn,
      majorCloseBtn
    } = this._els();

    if (!overlay || overlay.__vrGuideDismissBound) return;

    const onDismiss = (e) => {
      if (!overlay.classList.contains("is-visible")) return;
      if (Date.now() < (this._dismissEnabledAt || 0)) return;

      const isEventPopup = overlay.classList.contains("is-event");
      const isMajorChoice = overlay.classList.contains("is-major-choice");
      const isMajorResult = overlay.classList.contains("is-major-result");

      if (e?.type === "keydown") {
        const k = String(e.key || "");
        if (isMajorChoice) {
          return;
        }
        if (isEventPopup || isMajorResult) {
          if (k !== "Escape") return;
        } else {
          if (k !== "Escape" && k !== "Enter" && k !== " ") return;
        }
      } else if (isEventPopup || isMajorChoice || isMajorResult) {
        return;
      }

      this.hide();
    };

    overlay.__vrGuideDismissBound = true;
    overlay.setAttribute("tabindex", "-1");
    overlay.addEventListener("pointerdown", onDismiss);
    overlay.addEventListener("click", onDismiss);
    overlay.addEventListener("keydown", onDismiss);

    if (nextBtn && !nextBtn.__vrGuideDismissBound) {
      nextBtn.__vrGuideDismissBound = true;
      nextBtn.addEventListener("click", (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        if (!overlay.classList.contains("is-visible")) return;
        if (Date.now() < (this._dismissEnabledAt || 0)) return;
        this.hide();
      });
    }

    if (majorCloseBtn && !majorCloseBtn.__vrGuideDismissBound) {
      majorCloseBtn.__vrGuideDismissBound = true;
      majorCloseBtn.addEventListener("click", (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        if (!overlay.classList.contains("is-visible")) return;
        if (Date.now() < (this._dismissEnabledAt || 0)) return;
        this.hide();
      });
    }

    if (majorYesBtn && !majorYesBtn.__vrGuideActionBound) {
      majorYesBtn.__vrGuideActionBound = true;
      majorYesBtn.addEventListener("click", (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        const fn = overlay.__vrGuideMajorYes;
        if (typeof fn === "function") fn();
      });
    }

    if (majorNoBtn && !majorNoBtn.__vrGuideActionBound) {
      majorNoBtn.__vrGuideActionBound = true;
      majorNoBtn.addEventListener("click", (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        const fn = overlay.__vrGuideMajorNo;
        if (typeof fn === "function") fn();
      });
    }

    if (majorPreviewBtn && !majorPreviewBtn.__vrGuideActionBound) {
      majorPreviewBtn.__vrGuideActionBound = true;
      majorPreviewBtn.addEventListener("click", async (e) => {
        try { e.preventDefault(); } catch (_) {}
        try { e.stopPropagation(); } catch (_) {}
        const fn = overlay.__vrGuideMajorPreview;
        if (typeof fn === "function") await fn();
      });
    }
  },

  _ensureConfettiLayer() {
    const { overlay } = this._els();
    if (!overlay) return null;

    let layer = overlay.querySelector(".vr-guide-confetti-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "vr-guide-confetti-layer";
      overlay.insertBefore(layer, overlay.firstChild || null);
    }

    return layer;
  },

  _burstConfetti() {
    const layer = this._ensureConfettiLayer();
    if (!layer) return;

    layer.innerHTML = "";

    if (this._confettiRaf) {
      cancelAnimationFrame(this._confettiRaf);
      this._confettiRaf = null;
    }
    clearTimeout(this._confettiCleanupTimer);

    const colors = [
      "#ffffff",
      "#f4d35e",
      "#ff6b6b",
      "#b8f2e6",
      "#d0bfff",
      "#7dd3fc",
      "#f9a8d4"
    ];

    const rect = layer.getBoundingClientRect();
    const W = Math.max(1, rect.width || window.innerWidth || 360);
    const H = Math.max(1, rect.height || window.innerHeight || 640);

    const count = 170;
    const gravity = 1550;
    const pieces = [];

    for (let i = 0; i < count; i += 1) {
      const el = document.createElement("span");
      el.className = "vr-guide-confetti-piece";

      const w = 5 + Math.random() * 8;
      const h = 10 + Math.random() * 16;
      const x = Math.random() * W;
      const y = H + 20 + Math.random() * 60;

      const vx = -260 + Math.random() * 520;
      const vy = -(980 + Math.random() * 720);
      const spin = -720 + Math.random() * 1440;
      const rot = Math.random() * 360;
      const life = 3.8 + Math.random() * 1.4;
      const fadeStart = life * 0.72;

      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.borderRadius = `${2 + Math.random() * 3}px`;
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.opacity = "1";
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;

      layer.appendChild(el);

      pieces.push({
        el,
        x,
        y,
        vx,
        vy,
        rot,
        spin,
        age: 0,
        life,
        fadeStart
      });
    }

    let last = performance.now();

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      let alive = 0;

      for (const p of pieces) {
        p.age += dt;
        if (p.age >= p.life) {
          p.el.style.opacity = "0";
          continue;
        }

        p.vy += gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;

        const fade =
          p.age < p.fadeStart
            ? 1
            : Math.max(0, 1 - ((p.age - p.fadeStart) / (p.life - p.fadeStart)));

        p.el.style.opacity = String(fade);
        p.el.style.transform =
          `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg)`;

        alive += 1;
      }

      if (alive > 0) {
        this._confettiRaf = requestAnimationFrame(tick);
      } else {
        this._confettiRaf = null;
        try { layer.innerHTML = ""; } catch (_) {}
      }
    };

    this._confettiRaf = requestAnimationFrame(tick);

    this._confettiCleanupTimer = setTimeout(() => {
      if (this._confettiRaf) {
        cancelAnimationFrame(this._confettiRaf);
        this._confettiRaf = null;
      }
      try { layer.innerHTML = ""; } catch (_) {}
    }, 6500);
  },

  _fitTextAndScale() {
    const { overlay, fit, view } = this._els();
    if (!overlay || !fit || !view) return;

    const viewWidth = view.clientWidth || window.innerWidth || 360;
    const minFont = viewWidth <= 420 ? 10 : 11;
    const maxFont = viewWidth >= 1200 ? 22 : viewWidth >= 900 ? 20 : viewWidth >= 680 ? 18 : 16;

    overlay.style.width = "";

    const textFits = () => {
      return (
        fit.scrollWidth <= fit.clientWidth + 1 &&
        fit.scrollHeight <= fit.clientHeight + 1
      );
    };

    let low = minFont;
    let high = maxFont;
    let best = minFont;

    fit.style.lineHeight = viewWidth <= 600 ? "1.06" : "1.08";

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      fit.style.fontSize = mid + "px";

      if (textFits()) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    fit.style.fontSize = best + "px";

    while (!textFits() && best > 10) {
      best -= 1;
      fit.style.fontSize = best + "px";
    }
  },

  _open(universeId, lines, opts = {}) {
    const { overlay, image, nextBtn } = this._els();
    if (!overlay || !image) return Promise.resolve();

    overlay.style.width = "";

    const src = VR_GUIDE_IMAGE_MAP[universeId];
    if (!src) return Promise.resolve();

    image.src = src;
    image.alt = universeId;

    const actionMode = String(opts.actionMode || (opts.isEvent ? "event" : "default"));
    const isEventPopup = actionMode === "event";

    overlay.__vrGuideMajorYes = null;
    overlay.__vrGuideMajorNo = null;
    overlay.__vrGuideMajorPreview = null;

    const textLines = (Array.isArray(lines) ? lines : [])
      .map(v => String(v || "").trim())
      .filter(Boolean);

    this._setText(textLines, opts.mode || "rank");
    this._setActionMode(actionMode, opts.actionLabels || {});
    this._ensureDismissBinding();

    overlay.classList.add("is-visible");
    overlay.classList.remove("is-final");
    overlay.setAttribute("aria-hidden", "false");

    clearTimeout(this._hideTimer);
    clearTimeout(this._finalTimer);

    if (opts.playBell) {
      try { window.VRAudio?.playDeath?.(); } catch (_) {}
    }

    if (opts.confetti) {
      this._burstConfetti();
    }

    clearTimeout(this._enableNextTimer);

    this._dismissEnabledAt = Date.now() + (isEventPopup ? 1200 : 220);

    if (isEventPopup && nextBtn) {
      this._enableNextTimer = setTimeout(() => {
        nextBtn.disabled = false;
        nextBtn.setAttribute("aria-disabled", "false");
      }, 1200);
    }
    const wait = this._createDismissPromise();

    requestAnimationFrame(() => {
      this._fitTextAndScale();
      try { overlay.focus({ preventScroll: true }); } catch (_) {}
    });

    this._finalTimer = setTimeout(() => {
      overlay.classList.add("is-final");
      this._fitTextAndScale();
    }, 120);

    return wait;
  },

  show(universeId, lines) {
    return this._open(universeId, lines, {
      mode: "rank",
      isEvent: false,
      confetti: false,
      playBell: false
    });
  },

  showEvent(universeId, title, body) {
    const parts = [
      String(title || "").trim(),
      ...String(body || "")
        .split(/\n\s*\n/)
        .map(v => String(v || "").trim())
        .filter(Boolean)
    ].filter(Boolean);

    return this._open(universeId, parts, {
      mode: "event",
      isEvent: true,
      actionMode: "event",
      confetti: false,
      playBell: true
    });
  },

  showMajorDecision(universeId, payload = {}) {
    const { overlay } = this._els();
    if (!overlay) return Promise.resolve(null);

    const baseParts = [
      String(payload.title || "").trim(),
      ...String(payload.body || "")
        .split(/\n\s*\n/)
        .map(v => String(v || "").trim())
        .filter(Boolean)
    ].filter(Boolean);

    const previewLines = Array.isArray(payload.previewLines)
      ? payload.previewLines.map(v => String(v || "").trim()).filter(Boolean)
      : [];

    return new Promise((resolve) => {
      const finish = (value) => {
        overlay.__vrGuideMajorYes = null;
        overlay.__vrGuideMajorNo = null;
        overlay.__vrGuideMajorPreview = null;
        resolve(value);
      };

      this._open(universeId, baseParts, {
        mode: "major",
        actionMode: "major-choice",
        actionLabels: {
          yesLabel: payload.yesLabel,
          noLabel: payload.noLabel,
          previewLabel: payload.previewLabel
        },
        confetti: false,
        playBell: true
      });

      overlay.__vrGuideMajorYes = () => finish("yes");
      overlay.__vrGuideMajorNo = () => finish("no");
      overlay.__vrGuideMajorPreview = async () => {
        if (!previewLines.length) return;
        const ok = await (payload.onPreview?.() || Promise.resolve(false));
        if (!ok) return;

        const nextLines = [...baseParts, ...previewLines].filter(Boolean);
        this._setText(nextLines, "major");
        this._fitTextAndScale();

        const { majorPreviewBtn } = this._els();
        if (majorPreviewBtn) {
          majorPreviewBtn.disabled = true;
          majorPreviewBtn.setAttribute("aria-disabled", "true");
        }
      };
    });
  },

  showMajorOutcome(universeId, title, body) {
    const parts = [
      String(title || "").trim(),
      ...String(body || "")
        .split(/\n\s*\n/)
        .map(v => String(v || "").trim())
        .filter(Boolean)
    ].filter(Boolean);

    return this._open(universeId, parts, {
      mode: "major",
      actionMode: "major-result",
      actionLabels: {
        closeLabel: "X"
      },
      confetti: false,
      playBell: true
    });
  },

  hide() {
    const {
      overlay,
      nextBtn,
      majorPreviewBtn,
      majorYesBtn,
      majorNoBtn,
      majorCloseBtn
    } = this._els();

    if (!overlay) return;

    clearTimeout(this._hideTimer);
    clearTimeout(this._finalTimer);
    clearTimeout(this._enableNextTimer);

    overlay.__vrGuideMajorYes = null;
    overlay.__vrGuideMajorNo = null;
    overlay.__vrGuideMajorPreview = null;

    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.setAttribute("aria-disabled", "false");
    }

    [majorPreviewBtn, majorYesBtn, majorNoBtn, majorCloseBtn].forEach((btn) => {
      if (!btn) return;
      btn.disabled = false;
      btn.removeAttribute("aria-disabled");
    });

    overlay.classList.remove("is-visible", "is-event", "is-major-choice", "is-major-result");
    overlay.setAttribute("aria-hidden", "true");
    this._setActionMode("default");

    const layer = overlay.querySelector(".vr-guide-confetti-layer");
    if (layer) {
      setTimeout(() => {
        try { layer.innerHTML = ""; } catch (_) {}
      }, 180);
    }

    this._resolveDismiss();
  },

  markSeen(universeId, key) {
    const all = vrGuideLoadSeen();
    const u = vrGuideEnsureUniverse(all, universeId);
    u[key] = true;
    vrGuideSaveSeen(all);
  },

  hasSeen(universeId, key) {
    const all = vrGuideLoadSeen();
    const u = vrGuideEnsureUniverse(all, universeId);
    return !!u[key];
  },

  maybeShowIntro(universeId) {
    if (!universeId || universeId === "intro") return;
    if (this.hasSeen(universeId, "intro")) return;

    const universeTitle = this._t(`universe.${universeId}.title`, "");
    const rankPrefix = this._t("game.rank", "Rang");
    const currentRank = getRankLabel(universeId, 0);

    const lines = [
      universeTitle,
      this._t(this._messageKey(universeId, "intro"), ""),
      `${rankPrefix} : ${currentRank}`,
      this._t("guideMentor.common.introGoal", "", { target: 20 })
    ].filter(Boolean);

    this.show(universeId, lines);
    this.markSeen(universeId, "intro");
  },

  maybeShowTierMessage(universeId, reignLength) {
    if (!universeId || universeId === "intro") return;

    const reachedTier = vrGuideGetReachedTier(reignLength);
    if (!reachedTier) return;
    if (this.hasSeen(universeId, reachedTier)) return;

    const rankLabel = this._t(this._rankKey(universeId, reachedTier), reachedTier);
    const nextTier = vrGuideGetNextTier(reignLength);
    const nextTarget = nextTier ? VR_GUIDE_THRESHOLDS[nextTier] : null;
    const remaining = nextTarget ? Math.max(0, nextTarget - Number(reignLength || 0)) : 0;

    const badgeLabel = this._t(`guideMentor.common.badgeTier.${reachedTier}`, reachedTier);

    const lines = [
      this._t("guideMentor.common.promotionNow", "", { rank: rankLabel }),
      this._t("guideMentor.common.badgeWonProfile", "", { badge: badgeLabel }),
      this._t(this._messageKey(universeId, reachedTier), ""),
      nextTier
        ? this._t("guideMentor.common.nextGoal", "", { remaining })
        : this._t("guideMentor.common.maxGoal", "")
    ];

    this._open(universeId, lines, {
      mode: "rank",
      isEvent: false,
      confetti: true,
      playBell: false
    });

    this.markSeen(universeId, reachedTier);
  },

  refresh() {
    this._fitTextAndScale();
  }
};

window.addEventListener("resize", () => {
  try { window.VRGuideMentor?.refresh?.(); } catch (_) {}
});


window.VRGame = {
  currentUniverse: null,
  session: { reignLength: 0 },

  async onUniverseSelected(universeId) {
    universeId = (typeof window.normalizeUniverseId === "function")
      ? window.normalizeUniverseId(universeId)
      : String(universeId || "").trim();

    try { localStorage.setItem("vrealms_universe", universeId); } catch (_) {}

    this.currentUniverse = universeId;
    this.session.reignLength = 0;
    try { window.VRAds?.resetGameRewardSeen?.(); } catch (_) {}

    this.applyUniverseBackground(universeId);
    try { window.VRAudio?.onUniverseSelected?.(universeId); } catch (_) {}
    this.applyUniverseCosmetics(universeId);

    let lang = "en";
    try {
      const me = await window.VRProfile?.getMe?.(0);
      lang = (me?.lang || "en").toString();
    } catch (_) {
      lang = localStorage.getItem("vuniverse_lang") || localStorage.getItem("vrealms_lang") || "en";
    }

    let hadSavedBeforeInit = false;
    try {
      hadSavedBeforeInit = !!window.VRSave?.load?.(universeId);
    } catch (_) {
      hadSavedBeforeInit = false;
    }

    try {
      await window.VREngine.init(universeId, lang);
    } catch (e) {
      console.error("[VRGame] Erreur init moteur:", e);
    }

    try {
      if (!hadSavedBeforeInit) {
        setTimeout(() => {
          window.VRGuideMentor?.maybeShowIntro?.(universeId);
        }, 450);
      }
    } catch (_) {}

    this.applyUniverseCosmetics(universeId);
    if (String(universeId || "").trim() !== "intro") {
      try { window.VRCosmeticsGame?.render?.(); } catch (_) {}
    }
  },

  applyUniverseBackground(universeId) {
    const viewGame = document.getElementById("view-game");
    if (!viewGame) return;

    if (universeId) document.body.dataset.universe = universeId;
    else delete document.body.dataset.universe;

    Array.from(viewGame.classList).forEach((cls) => {
      if (cls.startsWith("vr-bg-")) viewGame.classList.remove(cls);
    });

    if (universeId) viewGame.classList.add(`vr-bg-${universeId}`);
  },

  applyUniverseCosmetics(universeId) {
    try { window.VRCosmeticsGame?.apply?.(universeId); } catch (_) {}
  },

  async maybeShowInterstitial() {
    try {
      await (window.VRAds?.incrementActionsCount?.() || Promise.resolve(0));
    } catch (e) {
      console.warn("[VRGame] interstitial skipped:", e);
    }
  },

  async maybeUnlockRunBadges() {
    try {
      if (!window.VRState?.isAlive?.()) return;

      const reign = Number(this.session?.reignLength || 0);
      const universeId = String(this.currentUniverse || localStorage.getItem("vrealms_universe") || "").trim();
      if (!universeId) return;

      const all = window.VUProfileBadges?.getAll?.() || { map: {} };
      const row = (all.map && all.map[universeId]) ? all.map[universeId] : {};

      if (reign >= VR_BADGE_WOOD_CHOICES && !row.wood) {
        await window.VUProfileBadges?.setBadge?.(universeId, "wood", true);
      }
      if (reign >= VR_BADGE_BRONZE_CHOICES && !row.bronze) {
        await window.VUProfileBadges?.setBadge?.(universeId, "bronze", true);
      }
      if (reign >= VR_BADGE_SILVER_CHOICES && !row.silver) {
        await window.VUProfileBadges?.setBadge?.(universeId, "silver", true);
      }
      if (reign >= VR_BADGE_GOLD_CHOICES && !row.gold) {
        await window.VUProfileBadges?.setBadge?.(universeId, "gold", true);
      }
      if (reign >= VR_BADGE_CRYSTAL_CHOICES && !row.crystal) {
        await window.VUProfileBadges?.setBadge?.(universeId, "crystal", true);
      }
    } catch (e) {
      console.warn("[VRGame] badge unlock skipped:", e);
    }
  },

  onCardResolved() {
    this.session.reignLength += 1;
    Promise.resolve().then(() => this.maybeUnlockRunBadges());
    Promise.resolve().then(() => {
      window.VRGuideMentor?.maybeShowTierMessage?.(
        this.currentUniverse,
        this.session.reignLength
      );
    });
  },

  async onRunEnded() {
    try {
      const reign = Number(this.session.reignLength || 0);

      const sb = window.sb;
      if (sb && typeof sb.rpc === "function") {
        let did = false;
        try {
          const r = await sb.rpc("secure_finish_run", { p_reign_length: reign });
          if (!r?.error) did = true;
        } catch (_) {}

        if (!did) {
          try { await sb.rpc("secure_inc_total_runs", { p_delta: 1 }); } catch (_) {}
          try { await sb.rpc("secure_set_best_reign_length", { p_value: reign }); } catch (_) {}
        }
      }

      try {
        const me = await window.VRProfile?.getMe?.(0);
        if (me) {
          window.VREngine._uiCoins = window.VRProfile._n(me.vcoins);
          window.VREngine._uiTokens = window.VRProfile._n(me.jetons);
        }
      } catch (_) {}
    } catch (e) {
      console.error("[VRGame] onRunEnded error:", e);
    }
  }
};


// -------------------------------------------------------
// Init page jeu seule
// -------------------------------------------------------
(function () {
  function setupNavigationGuards() {
    try {
      history.pushState({ vr_game: 1 }, "", location.href);
      history.pushState({ vr_game: 2 }, "", location.href);

      window.addEventListener("popstate", () => {
        try { history.pushState({ vr_game: 3 }, "", location.href); } catch (_) {}
      });
    } catch (_) {}

    const EDGE = 18;
    const blockEdge = (e) => {
      try {
        const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        if (typeof x === "number" && x <= EDGE) {
          e.preventDefault();
          e.stopPropagation();
        }
      } catch (_) {}
    };

    try { document.addEventListener("touchstart", blockEdge, { passive: false, capture: true }); } catch (_) {}
    try { document.addEventListener("pointerdown", blockEdge, { passive: false, capture: true }); } catch (_) {}

    try { document.documentElement.style.overscrollBehavior = "none"; } catch (_) {}
    try { document.body.style.overscrollBehavior = "none"; } catch (_) {}
  }

  function setupSaveGuards() {
    const flush = () => {
      try { window.VREngine?._saveRunSoft?.(); } catch (_) {}
    };

    try {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
    } catch (_) {}

    try { window.addEventListener("pagehide", () => flush()); } catch (_) {}
    try { window.addEventListener("beforeunload", () => flush()); } catch (_) {}
  }

function extractCssUrls(value) {
  const out = [];
  const re = /url\((['"]?)(.*?)\1\)/g;
  let match;

  while ((match = re.exec(String(value || "")))) {
    if (match[2]) out.push(match[2]);
  }

  return out;
}

function preloadImage(url, timeout = 1500) {
  return new Promise((resolve) => {
    if (!url || url.startsWith("data:")) return resolve();

    const img = new Image();
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const timer = setTimeout(finish, timeout);

    img.onload = () => {
      clearTimeout(timer);
      finish();
    };

    img.onerror = () => {
      clearTimeout(timer);
      finish();
    };

    img.src = url;

    try {
      if (typeof img.decode === "function") {
        img.decode()
          .then(() => {
            clearTimeout(timer);
            finish();
          })
          .catch(() => {});
      }
    } catch (_) {}
  });
}

async function preloadCurrentUniverseVisuals() {
  const selectors = [
    "#view-game",
    "#vr-card-main",
    ".vr-choice-button",
    ".vr-gauge-frame",
    ".vr-gauge-fill",
    ".vr-gauge-preview",
    ".vr-top-actions-game",
    "body > a.vr-icon-button[aria-label='Accueil']",
    "#btn-customize"
  ];

  const urls = new Set();

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      try {
        const base = getComputedStyle(el);
        extractCssUrls(base.backgroundImage).forEach((u) => urls.add(u));

        const before = getComputedStyle(el, "::before");
        extractCssUrls(before.backgroundImage).forEach((u) => urls.add(u));

        const after = getComputedStyle(el, "::after");
        extractCssUrls(after.backgroundImage).forEach((u) => urls.add(u));
      } catch (_) {}
    });
  });

  await Promise.all([...urls].map((url) => preloadImage(url)));

  try {
    if (document.fonts && document.fonts.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 800))
      ]);
    }
  } catch (_) {}

  await new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function getBootOverlayLabel() {
  try {
    const txt = window.VRI18n?.t?.("ui.loading");
    if (txt && txt !== "ui.loading") return txt;
  } catch (_) {}
  return "Loading...";
}

function showBootOverlay() {
  try {
    document.body.classList.remove("vr-ready");

    const overlay = document.getElementById("vr-boot-overlay");
    const textEl = document.getElementById("vr-boot-overlay-text");

    if (textEl) {
      textEl.textContent = getBootOverlayLabel();
    }

    if (overlay) {
      overlay.style.display = "";
      overlay.setAttribute("aria-hidden", "false");
    }
  } catch (_) {}
}

function hideBootOverlay() {
  try {
    document.body.classList.add("vr-ready");

    const overlay = document.getElementById("vr-boot-overlay");
    if (overlay) {
      overlay.setAttribute("aria-hidden", "true");

      setTimeout(() => {
        overlay.style.display = "none";
      }, 280);
    }
  } catch (_) {}
}

  async function initApp() {
    setupNavigationGuards();
    setupSaveGuards();

    try { await window.__VR_BOOT_READY; } catch (_) {}

    const hasGameView = !!document.getElementById("view-game");
    if (!hasGameView) return;

    const previewCfg = window.VRPreviewMode?.getConfig?.() || { enabled: false };
    if (previewCfg.enabled) {
      showBootOverlay();

      try {
        if (window.VRI18n && typeof window.VRI18n.initI18n === "function") {
          await window.VRI18n.initI18n();
        }
      } catch (_) {}

      try {
        await window.VRPreviewMode.init();
      } catch (e) {
        console.error("[VRealms] preview mode error:", e);
      } finally {
        hideBootOverlay();
      }
      return;
    }

    try {
      if (window.VRI18n && typeof window.VRI18n.initI18n === "function") {
        await window.VRI18n.initI18n();
      }
    } catch (e) {
      console.error("[VRealms] Erreur init i18n:", e);
    }

    try {
      if (window.VUserData && typeof window.VUserData.init === "function") {
        await window.VUserData.init();
      }
    } catch (_) {}

    try { window.VRTokenUI?.init?.(); } catch (_) {}
    try { window.VRCoinUI?.init?.(); } catch (_) {}
    try { window.VRCosmeticsGame?.init?.(); } catch (_) {}

    let universeId = localStorage.getItem("vrealms_universe") || "hell_king";
    try {
      const params = new URLSearchParams(window.location.search || "");
      const qUniverse = String(params.get("universe") || "").trim();
      if (qUniverse) universeId = qUniverse;
    } catch (_) {}
    showBootOverlay();

    try {
      try {
        window.VRAds?.scheduleRewardedPreload?.(0);
      } catch (_) {}

      if (window.VRGame && typeof window.VRGame.onUniverseSelected === "function") {
        await window.VRGame.onUniverseSelected(universeId);
        await preloadCurrentUniverseVisuals();
      }
    } finally {
      hideBootOverlay();
    }
  }

  document.addEventListener("DOMContentLoaded", initApp);
})();
