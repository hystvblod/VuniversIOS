(function () {
  "use strict";

  // === CONFIG ===
  const BASE_PATH = "data/ui";
  const DEFAULT_LANG = "en";
  const STORAGE_KEY = "vuniverse_lang";
  const LEGACY_STORAGE_KEY = "vrealms_lang";
  const LANG_SELECTED_KEY = "vuniverse_lang_selected";
  const LEGACY_LANG_SELECTED_KEY = "vrealms_lang_selected";
  const USER_DATA_KEY = "vuniverse_user_data";
  const USER_DATA_LEGACY_KEY = "vrealms_user_data";

  // ✅ on ne charge PLUS "cards" / "endings" ici
  // (les cartes et les fins sont chargées par le moteur: events-loader + VREndings)
  const UI_BUNDLES = ["ui"];
  const SUPPORTED_LANGS = ["en", "fr", "de", "es", "eslatam", "pt", "ptbr", "it", "ko", "ja", "id"];
  const LANGUAGE_CHOICES = [
    { code: "en", ui: "English" },
    { code: "fr", ui: "Français" },
    { code: "de", ui: "Deutsch" },
    { code: "es", ui: "Español" },
    { code: "eslatam", ui: "Español LATAM" },
    { code: "pt", ui: "Português" },
    { code: "ptbr", ui: "Português BR" },
    { code: "it", ui: "Italiano" },
    { code: "ko", ui: "한국어" },
    { code: "ja", ui: "日本語" },
    { code: "id", ui: "Bahasa Indonesia" }
  ];
  const LANGUAGE_FLAGS = {
    fr: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="10" height="20" x="0" y="0" fill="#1f4fbf"/><rect width="10" height="20" x="10" y="0" fill="#ffffff"/><rect width="10" height="20" x="20" y="0" fill="#d11f2e"/></svg>`,
    en: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#fff"/><g fill="#b22234"><rect y="0" width="30" height="1.538"/><rect y="3.076" width="30" height="1.538"/><rect y="6.152" width="30" height="1.538"/><rect y="9.228" width="30" height="1.538"/><rect y="12.304" width="30" height="1.538"/><rect y="15.38" width="30" height="1.538"/><rect y="18.456" width="30" height="1.544"/></g><rect width="12.6" height="10.77" fill="#3c3b6e"/><g fill="#fff" opacity="0.95"><circle cx="1.8" cy="1.6" r=".35"/><circle cx="3.6" cy="1.6" r=".35"/><circle cx="5.4" cy="1.6" r=".35"/><circle cx="7.2" cy="1.6" r=".35"/><circle cx="9.0" cy="1.6" r=".35"/><circle cx="10.8" cy="1.6" r=".35"/><circle cx="2.7" cy="2.8" r=".35"/><circle cx="4.5" cy="2.8" r=".35"/><circle cx="6.3" cy="2.8" r=".35"/><circle cx="8.1" cy="2.8" r=".35"/><circle cx="9.9" cy="2.8" r=".35"/><circle cx="1.8" cy="4.0" r=".35"/><circle cx="3.6" cy="4.0" r=".35"/><circle cx="5.4" cy="4.0" r=".35"/><circle cx="7.2" cy="4.0" r=".35"/><circle cx="9.0" cy="4.0" r=".35"/><circle cx="10.8" cy="4.0" r=".35"/><circle cx="2.7" cy="5.2" r=".35"/><circle cx="4.5" cy="5.2" r=".35"/><circle cx="6.3" cy="5.2" r=".35"/><circle cx="8.1" cy="5.2" r=".35"/><circle cx="9.9" cy="5.2" r=".35"/><circle cx="1.8" cy="6.4" r=".35"/><circle cx="3.6" cy="6.4" r=".35"/><circle cx="5.4" cy="6.4" r=".35"/><circle cx="7.2" cy="6.4" r=".35"/><circle cx="9.0" cy="6.4" r=".35"/><circle cx="10.8" cy="6.4" r=".35"/><circle cx="2.7" cy="7.6" r=".35"/><circle cx="4.5" cy="7.6" r=".35"/><circle cx="6.3" cy="7.6" r=".35"/><circle cx="8.1" cy="7.6" r=".35"/><circle cx="9.9" cy="7.6" r=".35"/><circle cx="1.8" cy="8.8" r=".35"/><circle cx="3.6" cy="8.8" r=".35"/><circle cx="5.4" cy="8.8" r=".35"/><circle cx="7.2" cy="8.8" r=".35"/><circle cx="9.0" cy="8.8" r=".35"/><circle cx="10.8" cy="8.8" r=".35"/></g></svg>`,
    de: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="6.67" y="0" fill="#111"/><rect width="30" height="6.67" y="6.67" fill="#d11f2e"/><rect width="30" height="6.66" y="13.34" fill="#f4c300"/></svg>`,
    es: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="5" y="0" fill="#c8102e"/><rect width="30" height="10" y="5" fill="#f4c300"/><rect width="30" height="5" y="15" fill="#c8102e"/></svg>`,
    eslatam: `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="30" height="20" fill="#ffffff"/>
  <g transform="translate(7.2 1.65) scale(0.06)">
    <path
      d="M 143.9 157.2 L 130.3 148.1 L 115.0 123.2 L 119.3 113.0 L 115.9 108.3 L 127.1 94.0 L 124.0 80.9 L 120.0 79.1 L 116.1 84.1 L 102.1 76.2 L 96.7 66.3 L 49.9 51.7 L 21.6 14.0 L 16.4 13.3 L 31.3 38.4 L 16.1 24.1 L 18.7 21.6 L 10.0 10.0 L 41.1 12.3 L 48.6 19.6 L 57.3 19.2 L 63.0 28.0 L 68.5 29.5 L 66.9 41.1 L 76.4 52.1 L 87.1 48.8 L 88.6 43.8 L 98.0 42.2 L 92.5 58.7 L 108.7 60.5 L 107.5 72.7 L 112.2 78.9 L 119.9 77.1 L 127.9 79.9 L 133.6 72.8 L 142.8 68.8 L 143.0 78.7 L 148.1 69.6 L 153.2 74.3 L 171.7 74.1 L 178.3 79.4 L 180.4 72.7 L 180.9 80.7 L 185.4 83.7 L 186.3 82.2 L 184.3 77.9 L 187.0 76.2 L 185.4 74.0 L 192.3 76.7 L 191.8 79.7 L 197.6 79.0 L 203.1 82.7 L 205.8 88.8 L 214.3 92.4 L 225.7 95.2 L 231.7 100.0 L 235.2 107.8 L 243.8 116.3 L 250.0 124.7 L 249.9 141.1 L 241.5 149.4 L 237.5 164.9 L 234.6 179.4 L 223.3 184.8 L 209.0 189.3 L 204.1 198.5 L 191.8 213.9 L 185.6 222.2 L 171.9 227.2 L 169.1 231.5 L 160.4 235.5 L 160.0 240.5 L 155.7 245.3 L 158.9 249.3 L 150.8 255.7 L 153.0 257.0 L 152.3 261.5 L 142.8 268.3 L 125.3 261.8 L 123.2 250.7 L 129.0 240.4 L 126.6 239.1 L 131.2 228.6 L 132.8 224.2 L 137.6 202.8 L 142.5 185.5 L 142.2 168.0 L 135.6 161.0 Z"
      fill="none"
      stroke="#174e6a"
      stroke-width="12"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>
</svg>`,
    pt: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="12" height="20" x="0" y="0" fill="#1a7f3b"/><rect width="18" height="20" x="12" y="0" fill="#c8102e"/><circle cx="12" cy="10" r="4.5" fill="#f4c300" opacity="0.95"/></svg>`,
    ptbr: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#1a7f3b"/><path d="M15 3 L26 10 L15 17 L4 10 Z" fill="#f4c300"/><circle cx="15" cy="10" r="4" fill="#1f4fbf"/></svg>`,
    it: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="10" height="20" x="0" y="0" fill="#1a7f3b"/><rect width="10" height="20" x="10" y="0" fill="#ffffff"/><rect width="10" height="20" x="20" y="0" fill="#c8102e"/></svg>`,
    ko: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#ffffff"/><circle cx="15" cy="10" r="5" fill="#c8102e"/><path d="M15 5a5 5 0 0 0 0 10a2.5 2.5 0 0 1 0-5a2.5 2.5 0 0 0 0-5Z" fill="#0a3a87" opacity="0.95"/></svg>`,
    ja: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#ffffff"/><circle cx="15" cy="10" r="5" fill="#d11f2e"/></svg>`,
    id: `<svg viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="10" y="0" fill="#d11f2e"/><rect width="30" height="10" y="10" fill="#ffffff"/></svg>`
  };

  let _lang = DEFAULT_LANG;
  let _dict = {};
  let _bootPromise = null;
  let _languagePickerPromise = null;

  function normalizeLang(raw) {
    const s0 = String(raw || "").trim().toLowerCase();
    if (!s0) return DEFAULT_LANG;

    if (s0 === "pt-br" || s0 === "ptbr") return "ptbr";
    if (s0 === "pt-pt" || s0 === "pt_pt") return "pt";
    if (s0 === "jp" || s0 === "ja-jp") return "ja";
    if (s0 === "kr" || s0 === "ko-kr") return "ko";
    if (s0 === "in" || s0 === "id-id") return "id";

    const base = s0.split(/[-_]/)[0];
    if (base === "pt" && (s0.includes("br") || s0.includes("ptbr"))) return "ptbr";
    return base || DEFAULT_LANG;
  }

  function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    for (const k of Object.keys(source)) {
      const sv = source[k];
      const tv = target[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv)) {
        target[k] = deepMerge(tv && typeof tv === "object" ? tv : {}, sv);
      } else {
        target[k] = sv;
      }
    }
    return target;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`i18n fetch failed: ${url} (${res.status})`);
    return res.json();
  }

async function tryLoadUiBundle(bundle, lang) {
  const url = `${BASE_PATH}/${bundle}_${lang}.json`;
  try {
    return await fetchJson(url);
  } catch (_) {
    return null;
  }
}
  async function loadUi(lang) {
    const l = normalizeLang(lang);

    // 1) tente la langue demandée
    const out = {};
    for (const b of UI_BUNDLES) {
      const j = await tryLoadUiBundle(b, l);
      if (j) deepMerge(out, j);
    }

    // 2) fallback sur fr si rien n’a chargé
    if (Object.keys(out).length === 0 && l !== DEFAULT_LANG) {
      for (const b of UI_BUNDLES) {
        const j = await tryLoadUiBundle(b, DEFAULT_LANG);
        if (j) deepMerge(out, j);
      }
      return { dict: out, lang: DEFAULT_LANG };
    }

    return { dict: out, lang: l };
  }

  function resolveKey(obj, key) {
    if (!obj || !key) return null;
    const parts = key.split(".");
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
      else return null;
    }
    return cur;
  }

  function applyTranslations(dict) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = resolveKey(dict, key);
      if (typeof val === "string") el.textContent = val;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = resolveKey(dict, key);
      if (typeof val === "string") el.setAttribute("placeholder", val);
    });

    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      const val = resolveKey(dict, key);
      if (typeof val === "string") el.setAttribute("title", val);
    });

    document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria");
      const val = resolveKey(dict, key);
      if (typeof val === "string") el.setAttribute("aria-label", val);
    });
  }

  function normalizeMaybeLang(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    return normalizeLang(s);
  }

  function isSupportedLang(raw) {
    const l = normalizeMaybeLang(raw);
    return !!l && SUPPORTED_LANGS.includes(l);
  }

  function detectDeviceLang() {
    try {
      const list = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language];

      for (const cand of list) {
        const l = normalizeMaybeLang(cand);
        if (l && SUPPORTED_LANGS.includes(l)) return l;
      }
    } catch (_) {}

    return "";
  }

  function readLangFromUserDataStorage() {
    const keys = [USER_DATA_KEY, USER_DATA_LEGACY_KEY];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const parsed = JSON.parse(raw);
        const rawLang = String(parsed?.lang ?? "").trim();
        if (!rawLang) continue;

        const lang = normalizeLang(rawLang);
        if (lang && SUPPORTED_LANGS.includes(lang)) return lang;
      } catch (_) {}
    }
    return "";
  }

  function getSavedLang(forcedLang) {
    const forced = normalizeMaybeLang(forcedLang);
    if (forced && SUPPORTED_LANGS.includes(forced)) return forced;

    try {
      const ls1 = localStorage.getItem(STORAGE_KEY);
      if (ls1 && isSupportedLang(ls1)) return normalizeLang(ls1);
    } catch (_) {}

    try {
      const ls2 = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (ls2 && isSupportedLang(ls2)) return normalizeLang(ls2);
    } catch (_) {}

    const fromUserDataStorage = readLangFromUserDataStorage();
    if (fromUserDataStorage) return fromUserDataStorage;

    return "";
  }

  function hasExplicitLanguageChoice() {
    try {
      const a = localStorage.getItem(LANG_SELECTED_KEY);
      const b = localStorage.getItem(LEGACY_LANG_SELECTED_KEY);
      return a === "1" || b === "1";
    } catch (_) {
      return false;
    }
  }

  function markExplicitLanguageChoice() {
    try { localStorage.setItem(LANG_SELECTED_KEY, "1"); } catch (_) {}
    try { localStorage.setItem(LEGACY_LANG_SELECTED_KEY, "1"); } catch (_) {}
  }

  function ensureLanguagePickerStyles() {
    if (document.getElementById("vr-language-picker-style")) return;

    const style = document.createElement("style");
    style.id = "vr-language-picker-style";
    style.textContent = `
      .vrLangOverlay{
        position:fixed;
        inset:0;
        z-index:999999;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:16px;
        background:rgba(7,10,18,.82);
        backdrop-filter:blur(10px);
      }

      .vrLangModal{
        width:min(92vw,560px);
        background:linear-gradient(180deg,rgba(18,25,43,.98),rgba(11,16,28,.98));
        border:1px solid rgba(255,255,255,.12);
        border-radius:24px;
        box-shadow:0 20px 60px rgba(0,0,0,.45);
        padding:18px 16px 16px;
        color:#fff;
      }

      .vrLangTitle{
        text-align:center;
        font-weight:900;
        font-size:clamp(24px,4.8vw,34px);
        line-height:1.1;
        margin:0 0 16px;
      }

      /* ===== EXACT LOGIQUE SETTINGS ===== */
      .vrLangOverlay .vr-langGrid{
        display:grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap:10px;
        margin-top:22px;
        margin-bottom:6px;
      }

      @media (min-width: 520px){
        .vrLangOverlay .vr-langGrid{
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      .vrLangOverlay .vr-langBtn{
        width:100%;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
        gap:8px;
        padding:10px 6px 12px;
        border-radius:14px;
        border:0 !important;
        background:transparent !important;
        box-shadow:none !important;
        color:inherit;
        cursor:pointer;
        -webkit-tap-highlight-color: transparent;
        text-align:center;
        appearance:none;
      }

      .vrLangOverlay .vr-langBtn:active{
        transform:scale(.98);
      }

      .vrLangOverlay .vr-langBtn.isActive{
        outline:0;
        box-shadow:0 0 0 2px rgba(255,255,255,.22), 0 14px 34px rgba(0,0,0,.26) !important;
        background:transparent !important;
        border:0 !important;
      }

      .vrLangOverlay .vr-flagBox{
        width:46px;
        height:32px;
        border-radius:8px;
        overflow:hidden;
        border:0 !important;
        outline:0 !important;
        box-shadow:none !important;
        background:transparent !important;
        flex:0 0 auto;
      }

      .vrLangOverlay .vr-flagBox svg{
        width:100%;
        height:100%;
        display:block;
      }

      .vrLangOverlay .vr-langText{
        display:flex !important;
        align-items:center;
        justify-content:center;
        min-height:30px;
        font-size:clamp(11px,2.8vw,13px);
        font-weight:800;
        line-height:1.15;
        color:rgba(255,255,255,.96);
        text-align:center;
        word-break:break-word;
      }

      .vrLangOverlay .vr-langText > div{
        max-width:100%;
      }

      .vrLangActions{
        display:flex;
        justify-content:center;
        margin-top:18px;
      }

      .vrLangConfirm{
        width:68px;
        height:68px;
        min-width:68px;
        min-height:68px;
        padding:0;
        border:0;
        border-radius:18px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#0b1020;
        background:#ffffff;
        box-shadow:0 12px 30px rgba(0,0,0,.28);
        cursor:pointer;
        transition:transform .12s ease, opacity .12s ease, box-shadow .12s ease;
      }

      .vrLangConfirm:active{
        transform:scale(.98);
      }

      .vrLangConfirm[disabled]{
        opacity:.45;
        cursor:default;
        transform:none;
        box-shadow:none;
      }

      .vrLangConfirm svg{
        width:34px;
        height:34px;
        display:block;
      }
    `;
    document.head.appendChild(style);
  }

  function showLanguagePicker() {
    if (_languagePickerPromise) return _languagePickerPromise;

    _languagePickerPromise = (async () => {
      ensureLanguagePickerStyles();

      const active = detectDeviceLang() || DEFAULT_LANG;
      let selected = active;

      const confirmCache = {};
      async function getConfirmLabel(lang) {
        const l = normalizeLang(lang || DEFAULT_LANG);
        if (confirmCache[l]) return confirmCache[l];

        try {
          const { dict } = await loadUi(l);
          const txt =
            resolveKey(dict, "auth.username.cta") ||
            resolveKey(dict, "intro.finish.name_save") ||
            "Confirm";
          confirmCache[l] = txt;
          return txt;
        } catch (_) {
          return "Confirm";
        }
      }

      const initialConfirmLabel = await getConfirmLabel(active);

      return await new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "vrLangOverlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Choose your language");

        const modal = document.createElement("div");
        modal.className = "vrLangModal";

        const title = document.createElement("div");
        title.className = "vrLangTitle";
        title.textContent = "Choose your language";
        modal.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "vr-langGrid";

        const buttons = [];
        let confirmBtn = null;

        function refreshActiveState() {
          buttons.forEach((btn) => {
            const isOn = btn.getAttribute("data-lang") === selected;
            btn.classList.toggle("isActive", isOn);
          });
          if (confirmBtn) confirmBtn.disabled = !selected;
        }

        LANGUAGE_CHOICES.forEach((item) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "vr-langBtn" + (active === item.code ? " isActive" : "");
          btn.setAttribute("data-lang", item.code);
          btn.setAttribute("aria-label", item.ui);

          const flag = document.createElement("div");
          flag.className = "vr-flagBox";
          flag.innerHTML = LANGUAGE_FLAGS[item.code] || LANGUAGE_FLAGS.en;

          const txt = document.createElement("div");
          txt.className = "vr-langText";

          const code = document.createElement("div");
          code.textContent = item.ui;

          txt.appendChild(code);
          btn.appendChild(flag);
          btn.appendChild(txt);

          btn.addEventListener("click", async () => {
            selected = item.code;
            refreshActiveState();
            if (confirmBtn) {
              confirmBtn.setAttribute("aria-label", await getConfirmLabel(selected));
            }
          });

          buttons.push(btn);
          grid.appendChild(btn);
        });

        modal.appendChild(grid);

        const actions = document.createElement("div");
        actions.className = "vrLangActions";

        confirmBtn = document.createElement("button");
        confirmBtn.type = "button";
        confirmBtn.className = "vrLangConfirm";
        confirmBtn.disabled = !selected;
        confirmBtn.setAttribute("aria-label", initialConfirmLabel);
        confirmBtn.innerHTML = `
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 12.5L9.5 17L19 7.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        `;

        confirmBtn.addEventListener("click", async () => {
          const chosen = normalizeLang(selected || active || DEFAULT_LANG);

          saveLangLocal(chosen);
          markExplicitLanguageChoice();

          try {
            if (window.VRRemoteStore?.setLang) {
              await window.VRRemoteStore.setLang(chosen);
            }
          } catch (_) {}

          overlay.remove();
          _languagePickerPromise = null;
          resolve(chosen);
        });

        actions.appendChild(confirmBtn);
        modal.appendChild(actions);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        refreshActiveState();
      });
    })();

    return _languagePickerPromise;
  }

  async function resolveInitialLang(forcedLang) {
    const forced = normalizeMaybeLang(forcedLang);
    if (forced && SUPPORTED_LANGS.includes(forced)) return forced;

    const saved = getSavedLang("");
    if (saved && hasExplicitLanguageChoice()) return saved;

    return await showLanguagePicker();
  }

  function saveLangLocal(lang) {
    const l = normalizeLang(lang);

    try { localStorage.setItem(STORAGE_KEY, l); } catch (_) {}
    try { localStorage.setItem(LEGACY_STORAGE_KEY, l); } catch (_) {}

    try {
      const raw = localStorage.getItem(USER_DATA_KEY) || localStorage.getItem(USER_DATA_LEGACY_KEY);
      const parsed = raw ? (JSON.parse(raw) || {}) : {};
      parsed.lang = l;
      try { localStorage.setItem(USER_DATA_KEY, JSON.stringify(parsed)); } catch (_) {}
      try { localStorage.setItem(USER_DATA_LEGACY_KEY, JSON.stringify(parsed)); } catch (_) {}
    } catch (_) {}

    try {
      if (window.VUserData?.load && window.VUserData?.save) {
        const u = window.VUserData.load();
        window.VUserData.save({ ...u, lang: l }, { silent: true });
      }
    } catch (_) {}

    return l;
  }

  function emitLanguageChanged() {
    try {
      window.dispatchEvent(new CustomEvent("vr:i18n:changed", {
        detail: {
          lang: _lang,
          dict: _dict
        }
      }));
    } catch (_) {}
  }

  async function initI18n(forcedLang) {
    const wanted = await resolveInitialLang(forcedLang);
    const { dict, lang } = await loadUi(wanted);

    _lang = lang || wanted || DEFAULT_LANG;
    _dict = dict || {};

    applyTranslations(_dict);
    document.documentElement.lang = _lang;
    emitLanguageChanged();

    return _lang;
  }

  async function setLang(lang) {
    const l = saveLangLocal(lang);
    markExplicitLanguageChoice();
    const { dict, lang: resolvedLang } = await loadUi(l);

    _lang = resolvedLang || l;
    _dict = dict || {};

    applyTranslations(_dict);
    document.documentElement.lang = _lang;

    try {
      if (window.VRRemoteStore?.setLang) await window.VRRemoteStore.setLang(_lang);
    } catch (e) {
      console.warn("[VRI18n] saveLang remote failed", e);
    }

    emitLanguageChanged();
    return _lang;
  }

  window.VRI18n = {
    initI18n: (forcedLang) => forcedLang ? initI18n(forcedLang) : boot(),
    setLang,
    getLang: () => _lang,
    normalizeLang,
    t: (key, fallback) => {
      const v = resolveKey(_dict, key);
      return typeof v === "string" ? v : String(fallback || "");
    }
  };

  // auto init
  function boot() {
    if (_bootPromise) return _bootPromise;
    _bootPromise = initI18n().catch((e) => {
      console.warn(e);
      return DEFAULT_LANG;
    });
    return _bootPromise;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
