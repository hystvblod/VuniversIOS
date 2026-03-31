(function () {
  "use strict";

  let _plugin = null;
  let _pluginTried = false;

  function getPlugin() {
    if (_pluginTried) return _plugin;
    _pluginTried = true;

    try {
      if (window.FirebaseAnalytics && typeof window.FirebaseAnalytics.logEvent === "function") {
        _plugin = window.FirebaseAnalytics;
        return _plugin;
      }
    } catch (_) {}

    try {
      if (window.Capacitor?.Plugins?.FirebaseAnalytics &&
          typeof window.Capacitor.Plugins.FirebaseAnalytics.logEvent === "function") {
        _plugin = window.Capacitor.Plugins.FirebaseAnalytics;
        return _plugin;
      }
    } catch (_) {}

    try {
      if (window.Capacitor?.registerPlugin) {
        const p = window.Capacitor.registerPlugin("FirebaseAnalytics");
        if (p) {
          _plugin = p;
          return _plugin;
        }
      }
    } catch (_) {}

    return null;
  }

  function normalizeValue(v) {
    if (v === undefined || v === null) return null;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v === "string") return v.slice(0, 100);
    return String(v).slice(0, 100);
  }

  function normalizeParams(params) {
    const out = {};
    if (!params || typeof params !== "object") return out;

    Object.keys(params).forEach((key) => {
      const value = normalizeValue(params[key]);
      if (value !== null && value !== "") out[key] = value;
    });

    return out;
  }

  function getPageName() {
    try {
      const bodyPage = document.body?.dataset?.page;
      if (bodyPage) return String(bodyPage).trim().replace(/-/g, "_");
    } catch (_) {}

    try {
      const file = String(window.location.pathname || "").split("/").pop() || "";
      const clean = file.replace(/\.html$/i, "").trim().replace(/-/g, "_");
      if (clean) return clean;
    } catch (_) {}

    return "unknown";
  }

  async function log(name, params) {
    try {
      const plugin = getPlugin();
      if (!plugin || typeof plugin.logEvent !== "function") return false;

      await plugin.logEvent({
        name: String(name || "").trim(),
        params: normalizeParams(params)
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function screen(screenName, screenClassOverride) {
    const safeName = String(screenName || "unknown").trim() || "unknown";
    const safeClass = String(screenClassOverride || "WebViewPage").trim() || "WebViewPage";

    try {
      const plugin = getPlugin();
      if (!plugin) return false;

      if (typeof plugin.setCurrentScreen === "function") {
        await plugin.setCurrentScreen({
          screenName: safeName,
          screenClassOverride: safeClass
        });
        return true;
      }

      if (typeof plugin.logEvent === "function") {
        await plugin.logEvent({
          name: "screen_view",
          params: {
            firebase_screen: safeName,
            firebase_screen_class: safeClass
          }
        });
        return true;
      }

      return false;
    } catch (_) {
      return false;
    }
  }

  async function setUserId(userId) {
    try {
      const plugin = getPlugin();
      if (!plugin || typeof plugin.setUserId !== "function") return false;

      const safeUserId = String(userId || "").trim();
      if (!safeUserId) return false;

      await plugin.setUserId({ userId: safeUserId });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function setUserProperty(key, value) {
    try {
      const plugin = getPlugin();
      if (!plugin || typeof plugin.setUserProperty !== "function") return false;

      const safeKey = String(key || "").trim();
      const safeValue = String(value || "").trim();

      if (!safeKey || !safeValue) return false;

      await plugin.setUserProperty({
        key: safeKey,
        value: safeValue
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  async function syncUserContext() {
    let uid = "";
    let lang = "";

    try {
      const prof = await window.bootstrapAuthAndProfile?.();
      uid = String(prof?.id || "").trim();
      lang = String(prof?.lang || "").trim();
    } catch (_) {}

    if (!uid) {
      try {
        const s = await window.sb?.auth?.getSession?.();
        uid = String(s?.data?.session?.user?.id || "").trim();
      } catch (_) {}
    }

    if (!lang) {
      try {
        lang = String(window.VRI18n?.getLang?.() || "").trim();
      } catch (_) {}
    }

    if (!lang) {
      try {
        lang = String(document.documentElement.lang || "").trim();
      } catch (_) {}
    }

    if (uid) await setUserId(uid);
    if (lang) await setUserProperty("lang", lang);
  }

  async function trackPageView(forcedPageName) {
    const pageName = String(forcedPageName || getPageName()).trim() || "unknown";
    await screen(pageName, "WebViewPage");
    await log("page_view_app", { page_name: pageName });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      syncUserContext().catch(() => {});
      trackPageView().catch(() => {});
    }, 0);
  });

  window.VRAnalytics = {
    log,
    screen,
    setUserId,
    setUserProperty,
    syncUserContext,
    trackPageView,
    isAvailable() {
      const plugin = getPlugin();
      return !!(plugin && typeof plugin.logEvent === "function");
    }
  };
})();
