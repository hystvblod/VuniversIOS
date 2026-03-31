(function () {
  "use strict";

  const STORAGE_KEY = "vuniverse_crosspromo_state";
  const REWARD_AMOUNT = 600;
  const COOLDOWN_AFTER_TWO_DISMISSES_MS = 21 * 24 * 60 * 60 * 1000;
  const POSTGAME_MIN_DELAY_MS = 12 * 60 * 60 * 1000;
  const POSTGAME_MIN_SESSION_STARTS = 5;
  const POSTGAME_OFFERS = [
    { appId: "vblocks", popupIndex: 2 },
    { appId: "vchronicles", popupIndex: 2 },
    { appId: "vblocks", popupIndex: 3 },
    { appId: "vchronicles", popupIndex: 3 }
  ];

  const APPS = {
    vblocks: {
      id: "vblocks",
      packageName: "com.vboldstudio.VBlocks",
      iosScheme: "vblocks://",
      storeUrlAndroid: "https://play.google.com/store/apps/details?id=com.vboldstudio.VBlocks",
      storeUrlIOS: "https://apps.apple.com/app/idXXXXXXXXXX",
      cover: "assets/img/crosspromo/vblocks_cover.webp",
      shots: [
        "assets/img/crosspromo/vblocks_01.webp",
        "assets/img/crosspromo/vblocks_02.webp",
        "assets/img/crosspromo/vblocks_03.webp"
      ],
      titleKey: "crosspromo.apps.vblocks.name",
      descKey: "crosspromo.apps.vblocks.store_desc",
      popup1TitleKey: "crosspromo.apps.vblocks.popup1.title",
      popup1BodyKey: "crosspromo.apps.vblocks.popup1.body",
      popup2TitleKey: "crosspromo.apps.vblocks.popup2.title",
      popup2BodyKey: "crosspromo.apps.vblocks.popup2.body",
      popup3TitleKey: "crosspromo.apps.vblocks.popup3.title",
      popup3BodyKey: "crosspromo.apps.vblocks.popup3.body"
    },
    vchronicles: {
      id: "vchronicles",
      packageName: "com.vboldstudio.vchronicles",
      iosScheme: "vchronicles://",
      storeUrlAndroid: "https://play.google.com/store/apps/details?id=com.vboldstudio.vchronicles",
      storeUrlIOS: "https://apps.apple.com/app/idYYYYYYYYYY",
      cover: "assets/img/crosspromo/vchronicles_cover.webp",
      shots: [
        "assets/img/crosspromo/vchronicles_01.webp",
        "assets/img/crosspromo/vchronicles_02.webp",
        "assets/img/crosspromo/vchronicles_03.webp"
      ],
      titleKey: "crosspromo.apps.vchronicles.name",
      descKey: "crosspromo.apps.vchronicles.store_desc",
      popup1TitleKey: "crosspromo.apps.vchronicles.popup1.title",
      popup1BodyKey: "crosspromo.apps.vchronicles.popup1.body",
      popup2TitleKey: "crosspromo.apps.vchronicles.popup2.title",
      popup2BodyKey: "crosspromo.apps.vchronicles.popup2.body",
      popup3TitleKey: "crosspromo.apps.vchronicles.popup3.title",
      popup3BodyKey: "crosspromo.apps.vchronicles.popup3.body"
    }
  };

  function t(key, vars) {
    let out = "";
    try {
      if (window.VRI18n && typeof window.VRI18n.t === "function") {
        out = window.VRI18n.t(key) || "";
      }
    } catch (_) {}

    if (vars && out) {
      Object.keys(vars).forEach((k) => {
        out = out.split("{" + k + "}").join(String(vars[k]));
      });
    }

    return out;
  }

  function isNativeApp() {
    try {
      return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    } catch (_) {
      return false;
    }
  }

  function getPlatform() {
    try {
      if (!window.Capacitor || !window.Capacitor.getPlatform) return "web";
      return window.Capacitor.getPlatform();
    } catch (_) {
      return "web";
    }
  }

  function isAndroid() {
    return getPlatform() === "android";
  }

  function isIOS() {
    return getPlatform() === "ios";
  }

  function nowTs() {
    return Date.now();
  }

  function defaultAppState() {
    return {
      wave: 1,
      dismissInWave: 0,
      cooldownUntilTs: 0,
      permanentlyBlocked: false,
      rewardClaimed: false,
      rewardClaiming: false,
      installedDetected: false,
      clickedStore: false,
      pendingInstallCheck: false
    };
  }

  function defaultState() {
    return {
      lowVcoinsNextApp: "vblocks",
      nextPostGameOfferIndex: 0,
      lastCrossPromoAt: 0,
      sessionStartsSinceLastPromo: 0,
      apps: {
        vblocks: defaultAppState(),
        vchronicles: defaultAppState()
      }
    };
  }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function normalizeAppState(src) {
    const s = src && typeof src === "object" ? src : {};
    return {
      wave: Number(s.wave || 1) === 2 ? 2 : 1,
      dismissInWave: Math.max(0, Number(s.dismissInWave || 0) || 0),
      cooldownUntilTs: Math.max(0, Number(s.cooldownUntilTs || 0) || 0),
      permanentlyBlocked: !!s.permanentlyBlocked,
      rewardClaimed: !!s.rewardClaimed,
      rewardClaiming: !!s.rewardClaiming,
      installedDetected: !!s.installedDetected,
      clickedStore: !!s.clickedStore,
      pendingInstallCheck: !!s.pendingInstallCheck
    };
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();

      const parsed = safeParse(raw);
      if (!parsed || typeof parsed !== "object") return defaultState();

      return {
        lowVcoinsNextApp: parsed.lowVcoinsNextApp === "vchronicles" ? "vchronicles" : "vblocks",
        nextPostGameOfferIndex: Math.max(0, Number(parsed.nextPostGameOfferIndex || 0) || 0) % POSTGAME_OFFERS.length,
        lastCrossPromoAt: Math.max(0, Number(parsed.lastCrossPromoAt || 0) || 0),
        sessionStartsSinceLastPromo: Math.max(0, Number(parsed.sessionStartsSinceLastPromo || 0) || 0),
        apps: {
          vblocks: normalizeAppState(parsed.apps && parsed.apps.vblocks),
          vchronicles: normalizeAppState(parsed.apps && parsed.apps.vchronicles)
        }
      };
    } catch (_) {
      return defaultState();
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function isAppUnavailable(row) {
    if (!row) return true;
    if (row.rewardClaimed) return true;
    if (row.installedDetected) return true;
    if (row.permanentlyBlocked) return true;
    if (Number(row.cooldownUntilTs || 0) > nowTs()) return true;
    return false;
  }

  function canShowForApp(row) {
    return !isAppUnavailable(row);
  }

  async function canOpenTargetApp(app) {
    if (!isNativeApp()) return false;

    try {
      const AppLauncher = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppLauncher;
      if (!AppLauncher || typeof AppLauncher.canOpenUrl !== "function") return false;

      if (isAndroid()) {
        const res = await AppLauncher.canOpenUrl({ url: app.packageName });
        return !!(res && res.value);
      }

      if (isIOS()) {
        const res = await AppLauncher.canOpenUrl({ url: app.iosScheme });
        return !!(res && res.value);
      }

      return false;
    } catch (_) {
      return false;
    }
  }

  async function refreshInstalledStatus(appId) {
    const app = APPS[appId];
    if (!app) return false;

    const state = readState();
    const installed = await canOpenTargetApp(app);

    if (state.apps && state.apps[appId]) {
      state.apps[appId].installedDetected = installed;
      writeState(state);
    }

    return installed;
  }

  function getStoreUrl(app) {
    if (isIOS()) return app.storeUrlIOS;
    return app.storeUrlAndroid;
  }

  async function openStore(app) {
    const url = String(getStoreUrl(app) || "").trim();
    if (!url) return false;

    try {
      const Browser = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if (Browser && typeof Browser.open === "function") {
        await Browser.open({ url: url });
        return true;
      }
    } catch (_) {}

    try {
      window.location.href = url;
      return true;
    } catch (_) {}

    try {
      window.open(url, "_blank");
      return true;
    } catch (_) {}

    return false;
  }

  async function claimRewardIfEligible(appId) {
    const state = readState();
    const row = state.apps[appId];
    if (!row) return false;
    if (row.rewardClaimed) return false;
    if (row.rewardClaiming) return false;

    if (!row.installedDetected) {
      const installedNow = await refreshInstalledStatus(appId);
      if (!installedNow) return false;
    }

    const freshState = readState();
    const freshRow = freshState.apps[appId];
    if (!freshRow) return false;
    if (freshRow.rewardClaimed) return false;
    if (freshRow.rewardClaiming) return false;
    if (!freshRow.installedDetected) return false;

    freshRow.rewardClaiming = true;
    writeState(freshState);

    try {
      if (!window.VUserData || typeof window.VUserData.addVcoinsAsync !== "function") {
        freshRow.rewardClaiming = false;
        writeState(freshState);
        return false;
      }

      const beforeCoins = Number(window.VUserData.getVcoins?.() || 0);

      await window.VUserData.addVcoinsAsync(REWARD_AMOUNT);

      if (window.VUserData && typeof window.VUserData.refresh === "function") {
        await window.VUserData.refresh();
      }

      const afterCoins = Number(window.VUserData.getVcoins?.() || beforeCoins);
      if (afterCoins < beforeCoins + REWARD_AMOUNT) {
        freshRow.rewardClaiming = false;
        writeState(freshState);
        return false;
      }

      freshRow.rewardClaimed = true;
      freshRow.rewardClaiming = false;
      freshRow.pendingInstallCheck = false;
      freshRow.clickedStore = false;
      writeState(freshState);

      showRewardToast(appId);

      try {
        await window.VRAnalytics?.log?.("crosspromo_reward_claimed", {
          app_id: appId,
          amount: REWARD_AMOUNT
        });
      } catch (_) {}

      return true;
    } catch (_) {
      freshRow.rewardClaiming = false;
      writeState(freshState);
      return false;
    }
  }

  function showRewardToast(appId) {
    const appKey = appId === "vblocks"
      ? "crosspromo.apps.vblocks.name"
      : "crosspromo.apps.vchronicles.name";

    const appName = t(appKey);
    const msg = t("crosspromo.reward_granted", { app: appName, amount: REWARD_AMOUNT });

    const el = document.createElement("div");
    el.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:24px",
      "transform:translateX(-50%)",
      "z-index:200000",
      "padding:12px 16px",
      "border-radius:16px",
      "background:rgba(12,18,30,.94)",
      "border:1px solid rgba(255,255,255,.14)",
      "color:#fff",
      "font-weight:900",
      "font-size:14px",
      "box-shadow:0 14px 30px rgba(0,0,0,.34)"
    ].join(";");

    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(() => {
      try {
        el.remove();
      } catch (_) {}
    }, 2800);
  }

  function setPendingStoreClick(appId) {
    const state = readState();
    const row = state.apps[appId];
    if (!row) return;

    row.clickedStore = true;
    row.pendingInstallCheck = true;
    writeState(state);
  }

  function registerDismiss(appId) {
    const state = readState();
    const row = state.apps[appId];
    if (!row) return;

    row.dismissInWave += 1;

    if (row.wave === 1 && row.dismissInWave >= 2) {
      row.wave = 2;
      row.dismissInWave = 0;
      row.cooldownUntilTs = nowTs() + COOLDOWN_AFTER_TWO_DISMISSES_MS;
    } else if (row.wave === 2 && row.dismissInWave >= 2) {
      row.permanentlyBlocked = true;
    }

    writeState(state);
  }

  function registerShown() {
    const state = readState();
    state.lastCrossPromoAt = nowTs();
    state.sessionStartsSinceLastPromo = 0;
    writeState(state);
  }

  function notifySessionStart() {
    const state = readState();
    state.sessionStartsSinceLastPromo += 1;
    writeState(state);
  }

  function canShowPostGamePromo(skipBecauseRewardAd) {
    if (skipBecauseRewardAd) return false;

    const state = readState();
    if (state.sessionStartsSinceLastPromo < POSTGAME_MIN_SESSION_STARTS) return false;
    if ((nowTs() - Number(state.lastCrossPromoAt || 0)) < POSTGAME_MIN_DELAY_MS) return false;

    return true;
  }

  function getOtherAppId(appId) {
    return appId === "vblocks" ? "vchronicles" : "vblocks";
  }

  function chooseLowVcoinsOffer() {
    const state = readState();
    const firstChoice = state.lowVcoinsNextApp === "vchronicles" ? "vchronicles" : "vblocks";
    const secondChoice = getOtherAppId(firstChoice);

    const firstRow = state.apps[firstChoice];
    const secondRow = state.apps[secondChoice];

    if (canShowForApp(firstRow)) {
      state.lowVcoinsNextApp = secondChoice;
      writeState(state);
      return { appId: firstChoice, popupIndex: 1 };
    }

    if (canShowForApp(secondRow)) {
      state.lowVcoinsNextApp = firstChoice;
      writeState(state);
      return { appId: secondChoice, popupIndex: 1 };
    }

    return null;
  }

  function chooseNextPostGameOffer() {
    const state = readState();
    const start = Math.max(0, Number(state.nextPostGameOfferIndex || 0) || 0) % POSTGAME_OFFERS.length;

    for (let i = 0; i < POSTGAME_OFFERS.length; i += 1) {
      const idx = (start + i) % POSTGAME_OFFERS.length;
      const offer = POSTGAME_OFFERS[idx];
      const row = state.apps[offer.appId];

      if (canShowForApp(row)) {
        state.nextPostGameOfferIndex = (idx + 1) % POSTGAME_OFFERS.length;
        writeState(state);
        return offer;
      }
    }

    return null;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getValidShots(app) {
    return (Array.isArray(app.shots) ? app.shots : [])
      .filter(Boolean)
      .slice(0, 3);
  }

  function buildShotsHtml(app) {
    const shots = getValidShots(app);
    const openImageAria = escapeHtml(t("crosspromo.aria.open_image"));

    return shots.map((src) => {
      return '<button class="vr-crosspromo-shot" type="button" data-shot-open="' + escapeHtml(src) + '" aria-label="' + openImageAria + '"><img src="' + escapeHtml(src) + '" alt="" draggable="false" /></button>';
    }).join("");
  }

  function buildPopupRoot() {
    let root = document.getElementById("vr-crosspromo-popup");
    if (root) return root;

    root = document.createElement("div");
    root.id = "vr-crosspromo-popup";
    root.style.cssText = [
      "position:fixed",
      "inset:0",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "padding:18px",
      "z-index:200000",
      "background:rgba(0,0,0,.56)",
      "backdrop-filter:blur(6px)",
      "-webkit-backdrop-filter:blur(6px)"
    ].join(";");

    root.innerHTML = [
      '<div style="position:relative;width:min(520px, calc(100vw - 32px));padding:16px;border-radius:22px;background:rgba(10,16,28,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 16px 40px rgba(0,0,0,.3);">',
      '  <button id="vr-crosspromo-close" type="button" style="position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-size:20px;font-weight:900;">×</button>',
      '  <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">',
      '    <img id="vr-crosspromo-cover" src="" alt="" style="width:72px;height:72px;border-radius:18px;object-fit:cover;border:1px solid rgba(255,255,255,.14);" />',
      '    <div>',
      '      <div id="vr-crosspromo-appname" style="font-size:13px;font-weight:900;opacity:.86;color:#fff;"></div>',
      '      <div id="vr-crosspromo-title" style="margin-top:4px;font-size:20px;line-height:1.1;font-weight:950;color:#fff;"></div>',
      '    </div>',
      '  </div>',
      '  <div id="vr-crosspromo-body" style="font-size:14px;line-height:1.42;color:rgba(255,255,255,.92);margin-bottom:14px;"></div>',
      '  <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);width:max-content;">',
      '    <span id="vr-crosspromo-reward-prefix" style="font-size:13px;font-weight:900;color:#fff;"></span>',
      '    <img src="assets/img/ui/vcoins.webp" alt="" style="width:28px;height:28px;object-fit:contain;" />',
      '    <span id="vr-crosspromo-reward-value" style="font-size:13px;font-weight:900;color:#fff;"></span>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:1fr;gap:10px;">',
      '    <button id="vr-crosspromo-primary" type="button" style="min-height:52px;border-radius:16px;border:1px solid rgba(122,167,255,.34);background:rgba(122,167,255,.24);color:#fff;font-weight:900;"></button>',
      '    <button id="vr-crosspromo-secondary" type="button" style="min-height:50px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#fff;font-weight:900;"></button>',
      '  </div>',
      '</div>'
    ].join("");

    document.body.appendChild(root);

    const closeBtn = document.getElementById("vr-crosspromo-close");
    if (closeBtn) {
      closeBtn.setAttribute("aria-label", t("crosspromo.aria.close"));
      closeBtn.setAttribute("title", t("crosspromo.aria.close"));
    }

    return root;
  }

  function getPopupText(app, popupIndex) {
    if (popupIndex === 1) {
      return {
        title: t(app.popup1TitleKey),
        body: t(app.popup1BodyKey)
      };
    }
    if (popupIndex === 2) {
      return {
        title: t(app.popup2TitleKey),
        body: t(app.popup2BodyKey)
      };
    }
    return {
      title: t(app.popup3TitleKey),
      body: t(app.popup3BodyKey)
    };
  }

  function openPromoPopup(appId, popupIndex) {
    const app = APPS[appId];
    if (!app) return Promise.resolve(false);

    const state = readState();
    const row = state.apps[appId];
    if (!canShowForApp(row)) return Promise.resolve(false);

    return new Promise(async (resolve) => {
      const isInstalled = await refreshInstalledStatus(appId);
      if (isInstalled) {
        resolve(false);
        return;
      }

      const popupText = getPopupText(app, popupIndex);
      registerShown();

      try {
        await window.VRAnalytics?.log?.("crosspromo_popup_shown", {
          app_id: appId,
          popup_index: popupIndex
        });
      } catch (_) {}

      const root = buildPopupRoot();
      const cover = document.getElementById("vr-crosspromo-cover");
      const appName = document.getElementById("vr-crosspromo-appname");
      const title = document.getElementById("vr-crosspromo-title");
      const body = document.getElementById("vr-crosspromo-body");
      const rewardPrefix = document.getElementById("vr-crosspromo-reward-prefix");
      const rewardValue = document.getElementById("vr-crosspromo-reward-value");
      const primary = document.getElementById("vr-crosspromo-primary");
      const secondary = document.getElementById("vr-crosspromo-secondary");
      const closeBtn = document.getElementById("vr-crosspromo-close");

      let done = false;

      function finish(result, countDismiss) {
        if (done) return;
        done = true;

        if (countDismiss) {
          registerDismiss(appId);
        }

        root.style.display = "none";
        primary.onclick = null;
        secondary.onclick = null;
        closeBtn.onclick = null;
        root.onclick = null;
        resolve(result);
      }

      cover.src = app.cover;
      appName.textContent = t(app.titleKey);
      title.textContent = popupText.title;
      body.textContent = popupText.body;
      rewardPrefix.textContent = t("crosspromo.reward_prefix");
      rewardValue.textContent = String(REWARD_AMOUNT);
      primary.textContent = t("crosspromo.cta_install");
      secondary.textContent = t("crosspromo.cta_later");
      closeBtn.setAttribute("aria-label", t("crosspromo.aria.close"));
      closeBtn.setAttribute("title", t("crosspromo.aria.close"));

      primary.onclick = async function () {
        try {
          await window.VRAnalytics?.log?.("crosspromo_install_click", {
            app_id: appId,
            popup_index: popupIndex,
            source: "popup"
          });
        } catch (_) {}

        setPendingStoreClick(appId);
        finish("install", false);
        await openStore(app);
      };

      secondary.onclick = async function () {
        try {
          await window.VRAnalytics?.log?.("crosspromo_popup_dismiss", {
            app_id: appId,
            popup_index: popupIndex,
            reason: "later"
          });
        } catch (_) {}

        finish("later", true);
      };

      closeBtn.onclick = async function () {
        try {
          await window.VRAnalytics?.log?.("crosspromo_popup_dismiss", {
            app_id: appId,
            popup_index: popupIndex,
            reason: "close"
          });
        } catch (_) {}

        finish("close", true);
      };

      root.onclick = async function (e) {
        if (e.target === root) {
          try {
            await window.VRAnalytics?.log?.("crosspromo_popup_dismiss", {
              app_id: appId,
              popup_index: popupIndex,
              reason: "outside"
            });
          } catch (_) {}

          finish("outside", true);
        }
      };

      root.style.display = "flex";
    });
  }

  async function showLowVcoinsPopupNow() {
    const offer = chooseLowVcoinsOffer();
    if (!offer) return false;
    return openPromoPopup(offer.appId, offer.popupIndex);
  }

  async function maybeShowPostGamePromo(opts) {
    const skipBecauseRewardAd = !!(opts && opts.skipBecauseRewardAd);
    if (!canShowPostGamePromo(skipBecauseRewardAd)) return false;

    const offer = chooseNextPostGameOffer();
    if (!offer) return false;

    return openPromoPopup(offer.appId, offer.popupIndex);
  }

  async function maybeShowPopupFromContext(context) {
    if (!context) return false;

    if (context === "low_vcoins") {
      return showLowVcoinsPopupNow();
    }

    return false;
  }

  async function bootRewardChecks() {
    await refreshInstalledStatus("vblocks");
    await refreshInstalledStatus("vchronicles");

    await claimRewardIfEligible("vblocks");
    await claimRewardIfEligible("vchronicles");
  }

  async function getStoreActionState(appId) {
    const stateBefore = readState();
    const rowBefore = stateBefore.apps[appId];
    if (!rowBefore) {
      return {
        key: "crosspromo.cta_install",
        disabled: false
      };
    }

    if (rowBefore.rewardClaimed) {
      return {
        key: "crosspromo.cta_claimed",
        disabled: true
      };
    }

    if (rowBefore.rewardClaiming) {
      return {
        key: "crosspromo.cta_claiming",
        disabled: true
      };
    }

    const installed = await refreshInstalledStatus(appId);
    const stateAfter = readState();
    const rowAfter = stateAfter.apps[appId];

    if (!rowAfter) {
      return {
        key: "crosspromo.cta_install",
        disabled: false
      };
    }

    if (rowAfter.rewardClaimed) {
      return {
        key: "crosspromo.cta_claimed",
        disabled: true
      };
    }

    if (rowAfter.rewardClaiming) {
      return {
        key: "crosspromo.cta_claiming",
        disabled: true
      };
    }

    if (installed) {
      return {
        key: "crosspromo.cta_claim",
        disabled: false
      };
    }

    return {
      key: "crosspromo.cta_install",
      disabled: false
    };
  }

  function bindResumeChecks() {
    async function handleResume() {
      await bootRewardChecks();

      const host = document.getElementById("vr-crosspromo-grid");
      if (host) {
        await renderStorePage();
      }
    }

    document.addEventListener("visibilitychange", async function () {
      if (document.visibilityState === "visible") {
        await handleResume();
      }
    });

    try {
      const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (App && typeof App.addListener === "function") {
        App.addListener("appStateChange", async function (state) {
          if (state && state.isActive) {
            await handleResume();
          }
        });
      }
    } catch (_) {}
  }

  function bindShotViewer(host) {
    const viewer = document.getElementById("vr-shot-viewer");
    const viewerImg = document.getElementById("vr-shot-viewer-img");
    const viewerClose = document.getElementById("vr-shot-viewer-close");

    if (!viewer || !viewerImg || !viewerClose || !host) return;

    function closeViewer() {
      viewer.classList.remove("is-open");
      viewer.setAttribute("aria-hidden", "true");
      viewerImg.src = "";
    }

    viewerClose.setAttribute("aria-label", t("crosspromo.aria.close"));
    viewerClose.setAttribute("title", t("crosspromo.aria.close"));

    host.querySelectorAll("[data-shot-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const src = btn.getAttribute("data-shot-open") || "";
        if (!src) return;
        viewerImg.src = src;
        viewer.classList.add("is-open");
        viewer.setAttribute("aria-hidden", "false");
      });
    });

    viewerClose.onclick = closeViewer;

    viewer.onclick = function (e) {
      if (e.target === viewer) {
        closeViewer();
      }
    };

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && viewer.classList.contains("is-open")) {
        closeViewer();
      }
    });
  }

  async function renderStorePage() {
    const host = document.getElementById("vr-crosspromo-grid");
    if (!host) return;

    const ids = ["vchronicles", "vblocks"];
    const rows = [];

    for (const id of ids) {
      const app = APPS[id];
      const actionState = await getStoreActionState(id);

      rows.push([
        '<article class="vr-crosspromo-card">',
        '  <div class="vr-crosspromo-hero">',
        '    <img src="' + escapeHtml(app.cover) + '" alt="" draggable="false" />',
        '  </div>',
        '  <div class="vr-crosspromo-content">',
        '    <div class="vr-crosspromo-head vr-crosspromo-head--reward-only">',
        '      <div class="vr-crosspromo-reward">',
        '        <span class="vr-crosspromo-reward-label">' + escapeHtml(t("crosspromo.reward_prefix")) + '</span>',
        '        <img src="assets/img/ui/vcoins.webp" alt="" draggable="false" />',
        '        <span class="vr-crosspromo-reward-value">' + escapeHtml(String(REWARD_AMOUNT)) + '</span>',
        '      </div>',
        '    </div>',
        '    <p class="vr-crosspromo-desc">' + escapeHtml(t(app.descKey)) + '</p>',
        '    <div class="vr-crosspromo-gallery">',
               buildShotsHtml(app),
        '    </div>',
        '    <div class="vr-crosspromo-actions">',
        '      <button class="vr-crosspromo-btn primary" type="button" data-crosspromo-action="' + escapeHtml(id) + '"' + (actionState.disabled ? ' disabled="disabled"' : "") + '>' + escapeHtml(t(actionState.key)) + '</button>',
        '    </div>',
        '  </div>',
        '</article>'
      ].join(""));
    }

    host.innerHTML = rows.join("");
    bindShotViewer(host);

    host.querySelectorAll("[data-crosspromo-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-crosspromo-action");
        const app = APPS[id];
        if (!app) return;

        const actionState = await getStoreActionState(id);
        if (actionState.disabled) return;

        if (actionState.key === "crosspromo.cta_claim") {
          btn.disabled = true;
          btn.textContent = t("crosspromo.cta_claiming");

          const ok = await claimRewardIfEligible(id);
          await renderStorePage();

          if (!ok) {
            await refreshInstalledStatus(id);
            await renderStorePage();
          }
          return;
        }

        const alreadyInstalled = await refreshInstalledStatus(id);
        if (alreadyInstalled) {
          await renderStorePage();
          return;
        }

        try {
          await window.VRAnalytics?.log?.("crosspromo_install_click", {
            app_id: id,
            source: "store_page"
          });
        } catch (_) {}

        setPendingStoreClick(id);
        await openStore(app);
      });
    });
  }

  async function bootIndexPopupFlow() {
    const context = sessionStorage.getItem("vr_crosspromo_context") || "";
    if (!context) return;

    sessionStorage.removeItem("vr_crosspromo_context");
    await maybeShowPopupFromContext(context);
  }

  function exposeApi() {
    window.VRCrossPromo = {
      maybeShowPopupFromContext: maybeShowPopupFromContext,
      refreshInstalledStatus: refreshInstalledStatus,
      claimRewardIfEligible: claimRewardIfEligible,
      showLowVcoinsPopupNow: showLowVcoinsPopupNow,
      notifySessionStart: notifySessionStart,
      canShowPostGamePromo: canShowPostGamePromo,
      maybeShowPostGamePromo: maybeShowPostGamePromo,
      async openOrInstall(appId) {
        const app = APPS[appId];
        if (!app) return false;

        const actionState = await getStoreActionState(appId);

        if (actionState.key === "crosspromo.cta_claim" && !actionState.disabled) {
          return claimRewardIfEligible(appId);
        }

        if (actionState.key === "crosspromo.cta_claimed" || actionState.key === "crosspromo.cta_claiming") {
          return false;
        }

        const alreadyInstalled = await refreshInstalledStatus(appId);
        if (alreadyInstalled) {
          return claimRewardIfEligible(appId);
        }

        setPendingStoreClick(appId);
        await openStore(app);
        return true;
      }
    };
  }

  document.addEventListener("DOMContentLoaded", async function () {
    exposeApi();

    try {
      if (window.VRI18n && typeof window.VRI18n.initI18n === "function") {
        await window.VRI18n.initI18n();
      }
    } catch (_) {}

    await bootRewardChecks();
    bindResumeChecks();
    await renderStorePage();

    const pathname = String(window.location.pathname || "");
    const isIndex =
      pathname.endsWith("/index.html") ||
      pathname.endsWith("index.html") ||
      pathname === "/" ||
      pathname === "";

    if (isIndex) {
      await bootIndexPopupFlow();
    }
  });
})();