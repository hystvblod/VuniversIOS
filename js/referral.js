(function () {
  "use strict";

  const FETCHED_KEY = "vuniverse_install_referrer_fetched_v1";
  const PENDING_INVITER_KEY = "vuniverse_install_referrer_pending_inviter_v1";
  const PENDING_RAW_KEY = "vuniverse_install_referrer_pending_raw_v1";
  const LOCAL_INVITER_CREDITS_KEY = "vuniverse_referral_local_inviter_credits_v1";
  const LOCAL_INVITER_LIMIT = 5;

  const INVITE_BASE_URL = "https://hystvblod.github.io/vuniverse-invite/invite.html";

  const INDEX_SHARE_PROMPT_STATE_KEY = "vrealms_referral_index_share_state_v1";
  const INDEX_SHARE_PROMPT_QUEUE_KEY = "vrealms_referral_index_share_queue_v1";
  const INDEX_SHARE_PROMPT_MIN_RUNS = 12;
  const INDEX_SHARE_PROMPT_MIN_MS = 3 * 24 * 60 * 60 * 1000;

  function t(key, fallback) {
    try {
      return window.VRI18n?.t?.(key, fallback) || String(fallback || "");
    } catch (_) {
      return String(fallback || "");
    }
  }

  function isNativeAndroid() {
    try {
      return !!window.Capacitor?.isNativePlatform?.() &&
             window.Capacitor?.getPlatform?.() === "android";
    } catch (_) {
      return false;
    }
  }

  function getInstallReferrerPlugin() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("InstallReferrer");
      }
      return window.Capacitor?.Plugins?.InstallReferrer || null;
    } catch (_) {
      return null;
    }
  }

  function getSharePlugin() {
    try {
      if (window.Capacitor?.registerPlugin) {
        return window.Capacitor.registerPlugin("Share");
      }
      return window.Capacitor?.Plugins?.Share || null;
    } catch (_) {
      return null;
    }
  }

  function getSourcePage() {
    try {
      const page = document.body?.dataset?.page;
      if (page) return String(page).trim().replace(/-/g, "_");
    } catch (_) {}

    try {
      const file = String(window.location.pathname || "").split("/").pop() || "";
      const clean = file.replace(/\.html$/i, "").trim().replace(/-/g, "_");
      if (clean) return clean;
    } catch (_) {}

    return "unknown";
  }

  async function getCurrentUid() {
    try { await window.bootstrapAuthAndProfile?.(); } catch (_) {}

    const sb = window.sb;
    if (!sb?.auth) return "";

    try {
      const s = await sb.auth.getSession();
      const uid = s?.data?.session?.user?.id || "";
      if (uid) return uid;
    } catch (_) {}

    try {
      const r = await sb.auth.getUser();
      return r?.data?.user?.id || "";
    } catch (_) {
      return "";
    }
  }

  function buildInviteUrl(uid) {
    return INVITE_BASE_URL + "?inviter_uuid=" + encodeURIComponent(uid);
  }

  async function shareInvite() {
    const uid = await getCurrentUid();
    if (!uid) return false;

    const source = getSourcePage();
    const url = buildInviteUrl(uid);
    const text = t("referral.share_text", "Télécharge VUniverse ici : {url}")
      .replaceAll("{url}", url);

    try {
      await window.VRAnalytics?.log?.("referral_share_click", {
        source: source
      });
    } catch (_) {}

    try {
      const Share = getSharePlugin();
      if (Share?.share) {
        await Share.share({
          title: t("referral.share_title", "Inviter un ami"),
          text,
          dialogTitle: t("referral.share_title", "Inviter un ami")
        });

        try {
          await window.VRAnalytics?.log?.("referral_share_success", {
            source: source,
            method: "capacitor_share"
          });
        } catch (_) {}

        return true;
      }
    } catch (_) {}

    try {
      if (navigator.share) {
        await navigator.share({
          title: t("referral.share_title", "Inviter un ami"),
          text
        });

        try {
          await window.VRAnalytics?.log?.("referral_share_success", {
            source: source,
            method: "navigator_share"
          });
        } catch (_) {}

        return true;
      }
    } catch (_) {}

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        try { window.showToast?.(t("referral.link_copied", "Lien copié")); } catch (_) {}

        try {
          await window.VRAnalytics?.log?.("referral_share_success", {
            source: source,
            method: "clipboard"
          });
        } catch (_) {}

        return true;
      }
    } catch (_) {}

    try {
      await window.VRAnalytics?.log?.("referral_share_failed", {
        source: source
      });
    } catch (_) {}

    return false;
  }

  function readIndexSharePromptState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(INDEX_SHARE_PROMPT_STATE_KEY) || "{}");
      return {
        completedRuns: Math.max(0, Number(parsed.completedRuns || 0) || 0),
        lastShownRun: Math.max(0, Number(parsed.lastShownRun || 0) || 0),
        lastShownAt: Math.max(0, Number(parsed.lastShownAt || 0) || 0)
      };
    } catch (_) {
      return {
        completedRuns: 0,
        lastShownRun: 0,
        lastShownAt: 0
      };
    }
  }

  function writeIndexSharePromptState(state) {
    try {
      localStorage.setItem(INDEX_SHARE_PROMPT_STATE_KEY, JSON.stringify({
        completedRuns: Math.max(0, Number(state?.completedRuns || 0) || 0),
        lastShownRun: Math.max(0, Number(state?.lastShownRun || 0) || 0),
        lastShownAt: Math.max(0, Number(state?.lastShownAt || 0) || 0)
      }));
    } catch (_) {}
  }

  function registerCompletedRun() {
    const state = readIndexSharePromptState();
    state.completedRuns += 1;
    writeIndexSharePromptState(state);
    return state;
  }

  function canShowIndexSharePrompt(state) {
    const st = state || readIndexSharePromptState();
    if (!st.lastShownRun && !st.lastShownAt) return true;

    const enoughRuns =
      (Math.max(0, Number(st.completedRuns || 0) || 0) - Math.max(0, Number(st.lastShownRun || 0) || 0)) >= INDEX_SHARE_PROMPT_MIN_RUNS;
    const enoughTime =
      (Date.now() - Math.max(0, Number(st.lastShownAt || 0) || 0)) >= INDEX_SHARE_PROMPT_MIN_MS;

    return enoughRuns && enoughTime;
  }

  function maybeQueueIndexSharePrompt() {
    const state = readIndexSharePromptState();
    if (!canShowIndexSharePrompt(state)) return false;
    try { sessionStorage.setItem(INDEX_SHARE_PROMPT_QUEUE_KEY, "1"); } catch (_) {}
    return true;
  }

  function markIndexSharePromptShown() {
    const state = readIndexSharePromptState();
    state.lastShownRun = Math.max(0, Number(state.completedRuns || 0) || 0);
    state.lastShownAt = Date.now();
    writeIndexSharePromptState(state);
    return state;
  }

  function showIndexSharePromptPopup() {
    return new Promise((resolve) => {
      let root = document.getElementById("vr-referral-index-share-popup");
      const inviteRewardAmount = Number(window.REFERRAL_INVITE_VCOINS || 200);

      if (!root) {
        root = document.createElement("div");
        root.id = "vr-referral-index-share-popup";
        root.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:100260",
          "display:none",
          "align-items:center",
          "justify-content:center",
          "padding:18px",
          "background:rgba(5,10,18,.72)",
          "backdrop-filter:blur(10px)"
        ].join(";");

        root.innerHTML = `
          <div role="dialog" aria-modal="true" style="position:relative;width:min(460px,94vw);border-radius:24px;padding:20px 18px;background:linear-gradient(180deg, rgba(22,31,54,.98), rgba(12,18,34,.98));border:1px solid rgba(255,255,255,.12);box-shadow:0 22px 56px rgba(0,0,0,.42);color:#fff;overflow:hidden;">
            <button id="vr-referral-index-share-popup-close" type="button" style="position:absolute;top:12px;right:12px;width:38px;height:38px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:900;font-size:18px;cursor:pointer;">×</button>
            <div style="padding-right:42px;">
              <div id="vr-referral-index-share-popup-title" style="font-size:24px;font-weight:900;line-height:1.15;margin-bottom:10px;"></div>
              <div id="vr-referral-index-share-popup-body" style="font-size:14px;line-height:1.5;color:rgba(255,255,255,.9);margin-bottom:14px;"></div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:linear-gradient(180deg, rgba(126,195,255,.18), rgba(84,133,255,.16));border:1px solid rgba(126,195,255,.28);margin-bottom:14px;">
              <span style="font-weight:900;">${t("referral.invite_and_earn_title", "Inviter et gagner :")}</span>
              <img src="assets/img/ui/vcoins.webp" alt="" draggable="false" style="width:24px;height:24px;object-fit:contain;">
              <span style="font-weight:900;">+${inviteRewardAmount}</span>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              <button id="vr-referral-index-share-popup-main" type="button" style="flex:1 1 220px;min-height:48px;border:0;border-radius:16px;background:linear-gradient(135deg,#70b7ff,#4a80ff);color:#fff;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 12px 26px rgba(74,128,255,.34);">${t("referral.invite_btn", "Inviter")}</button>
              <button id="vr-referral-index-share-popup-later" type="button" style="flex:1 1 120px;min-height:48px;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(255,255,255,.06);color:#fff;font-weight:800;font-size:14px;cursor:pointer;">${t("common.later", "Plus tard")}</button>
            </div>
          </div>
        `;

        document.body.appendChild(root);
      }

      const titleEl = document.getElementById("vr-referral-index-share-popup-title");
      const bodyEl = document.getElementById("vr-referral-index-share-popup-body");
      const closeBtn = document.getElementById("vr-referral-index-share-popup-close");
      const mainBtn = document.getElementById("vr-referral-index-share-popup-main");
      const laterBtn = document.getElementById("vr-referral-index-share-popup-later");

      if (titleEl) titleEl.textContent = t("referral.share_popup_title", "Tu aimes VUniverse ?");
      if (bodyEl) bodyEl.textContent = t("referral.share_popup_body", "Partage l’application avec tes proches, fais-leur découvrir le jeu et gagne des VCoins quand une invitation est validée.");

      const close = () => {
        root.style.display = "none";
        root.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (mainBtn) mainBtn.onclick = null;
        if (laterBtn) laterBtn.onclick = null;
        document.removeEventListener("keydown", onKeyDown);
        resolve(true);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };

      root.onclick = (e) => {
        if (e.target === root) close();
      };
      if (closeBtn) closeBtn.onclick = close;
      if (laterBtn) laterBtn.onclick = close;
      if (mainBtn) {
        mainBtn.onclick = async () => {
          try { await shareInvite(); } catch (_) {}
          close();
        };
      }

      root.style.display = "flex";
      document.addEventListener("keydown", onKeyDown);
      setTimeout(() => mainBtn?.focus?.(), 0);
    });
  }

  async function maybeShowQueuedIndexSharePrompt() {
    if (getSourcePage() !== "index") return false;

    let queued = false;
    try {
      queued = sessionStorage.getItem(INDEX_SHARE_PROMPT_QUEUE_KEY) === "1";
    } catch (_) {}
    if (!queued) return false;

    try { sessionStorage.removeItem(INDEX_SHARE_PROMPT_QUEUE_KEY); } catch (_) {}

    const state = readIndexSharePromptState();
    if (!canShowIndexSharePrompt(state)) return false;

    markIndexSharePromptShown();
    await showIndexSharePromptPopup();
    return true;
  }

  function parseInviterUuidFromRawReferrer(rawReferrer) {
    const raw = String(rawReferrer || "").trim();
    if (!raw) return "";

    try {
      const params = new URLSearchParams(raw);
      return String(params.get("inviter_uuid") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function getLocalReferralCreditsCount() {
    const raw = localStorage.getItem(LOCAL_INVITER_CREDITS_KEY);
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function setLocalReferralCreditsCount(value) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    localStorage.setItem(LOCAL_INVITER_CREDITS_KEY, String(n));
  }

  function incrementLocalReferralCreditsCount() {
    const next = getLocalReferralCreditsCount() + 1;
    setLocalReferralCreditsCount(next);
    return next;
  }

  function hasReachedLocalReferralLimit() {
    return getLocalReferralCreditsCount() >= LOCAL_INVITER_LIMIT;
  }

  async function fetchReferrerOnceFromNative() {
    if (!isNativeAndroid()) return;
    if (localStorage.getItem(FETCHED_KEY) === "1") return;

    const plugin = getInstallReferrerPlugin();
    if (!plugin?.getInstallReferrer) return;

    try {
      const data = await plugin.getInstallReferrer();

      if (data?.canRetry) return;

      const rawReferrer = String(data?.rawReferrer || "").trim();
      let inviterUuid = String(data?.inviterUuid || "").trim();

      if (!inviterUuid && rawReferrer) {
        inviterUuid = parseInviterUuidFromRawReferrer(rawReferrer);
      }

      localStorage.setItem(FETCHED_KEY, "1");

      if (inviterUuid) {
        localStorage.setItem(PENDING_INVITER_KEY, inviterUuid);
        localStorage.setItem(PENDING_RAW_KEY, rawReferrer);
      }
    } catch (_) {
    }
  }

  async function claimPendingReferral() {
    const pendingInviter = String(localStorage.getItem(PENDING_INVITER_KEY) || "").trim();
    if (!pendingInviter) return;
    if (hasReachedLocalReferralLimit()) {
      localStorage.removeItem(PENDING_INVITER_KEY);
      localStorage.removeItem(PENDING_RAW_KEY);
      return;
    }

    const pendingRaw = String(localStorage.getItem(PENDING_RAW_KEY) || "").trim();

    try { await window.bootstrapAuthAndProfile?.(); } catch (_) {}

    const sb = window.sb;
    if (!sb?.rpc) return;

    try {
      const { data, error } = await sb.rpc("secure_claim_referral_install", {
        p_inviter: pendingInviter,
        p_raw: pendingRaw || null
      });

      if (error) return;

      const reason = String(data?.reason || "");

      try {
        await window.VRAnalytics?.log?.("referral_install_claim_result", {
          ok: !!data?.ok,
          reason: reason || "unknown"
        });
      } catch (_) {}

      if (data?.ok && (reason === "claimed" || reason === "already_processed")) {
        incrementLocalReferralCreditsCount();
        localStorage.removeItem(PENDING_INVITER_KEY);
        localStorage.removeItem(PENDING_RAW_KEY);

        try { await window.VUserData?.refresh?.(); } catch (_) {}
        return;
      }

      if (
        reason === "self_referral" ||
        reason === "invalid_inviter" ||
        reason === "inviter_limit_reached"
      ) {
        localStorage.removeItem(PENDING_INVITER_KEY);
        localStorage.removeItem(PENDING_RAW_KEY);
      }
    } catch (_) {
    }
  }

  function showAndroidOnlyInvitePopup() {
    return new Promise((resolve) => {
      let root = document.getElementById("vr-referral-platform-popup");

      if (!root) {
        root = document.createElement("div");
        root.id = "vr-referral-platform-popup";
        root.style.cssText = [
          "position:fixed",
          "inset:0",
          "z-index:99999",
          "display:none",
          "align-items:center",
          "justify-content:center",
          "padding:20px",
          "background:rgba(5,10,20,.66)",
          "backdrop-filter:blur(10px)"
        ].join(";");

        root.innerHTML = `
          <div role="dialog" aria-modal="true" style="width:min(420px,92vw);border-radius:22px;padding:20px 18px;background:linear-gradient(180deg, rgba(24,33,58,.98), rgba(13,20,39,.98));border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 46px rgba(0,0,0,.42);color:#fff;">
            <div id="vr-referral-platform-popup-text" style="font-size:14px;line-height:1.45;color:rgba(255,255,255,.92);margin-bottom:16px;"></div>
            <button id="vr-referral-platform-popup-ok" type="button" style="width:100%;min-height:48px;border:0;border-radius:14px;background:linear-gradient(135deg,#70b7ff,#4a80ff);color:#fff;font-weight:900;font-size:14px;cursor:pointer;"></button>
          </div>
        `;

        document.body.appendChild(root);
      }

      const textEl = document.getElementById("vr-referral-platform-popup-text");
      const okBtn = document.getElementById("vr-referral-platform-popup-ok");

      if (textEl) {
        textEl.textContent = t(
          "referral.android_only_popup.text",
          "Seule la version Android est disponible pour le moment. La version iOS est en cours et ne peut donc pas être téléchargée pour le moment."
        );
      }

      if (okBtn) {
        okBtn.textContent = t("common.continue", "Continuer");
      }

      const close = () => {
        root.style.display = "none";
        root.onclick = null;
        if (okBtn) okBtn.onclick = null;
        document.removeEventListener("keydown", onKeyDown);
        resolve(true);
      };

      const onKeyDown = (e) => {
        if (e.key === "Escape") close();
      };

      root.onclick = (e) => {
        if (e.target === root) close();
      };

      if (okBtn) okBtn.onclick = close;

      root.style.display = "flex";
      document.addEventListener("keydown", onKeyDown);
      setTimeout(() => okBtn?.focus?.(), 0);
    });
  }

  function bindInviteButtons() {
    const ids = ["pf_invite_btn", "cp_invite_btn", "pf_invite_top_btn"];

    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn || btn.dataset.referralBound === "1") return;

      btn.dataset.referralBound = "1";
      btn.addEventListener("click", async () => {
        await shareInvite();
      });
    });
  }

  async function bootReferral() {
    await fetchReferrerOnceFromNative();
    await claimPendingReferral();
    bindInviteButtons();
    await maybeShowQueuedIndexSharePrompt();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootReferral().catch(() => {});
  });

  window.VReferral = {
    shareInvite,
    bootReferral,
    registerCompletedRun,
    maybeQueueIndexSharePrompt,
    showIndexSharePromptPopup
  };
})();
