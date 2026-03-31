(function () {
  "use strict";

  const FETCHED_KEY = "vuniverse_install_referrer_fetched_v1";
  const PENDING_INVITER_KEY = "vuniverse_install_referrer_pending_inviter_v1";
  const PENDING_RAW_KEY = "vuniverse_install_referrer_pending_raw_v1";

  const PLAY_URL_BASE = "https://play.google.com/store/apps/details?id=com.vboldstudio.vuniverse";

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
    const raw = "inviter_uuid=" + encodeURIComponent(uid);
    return PLAY_URL_BASE + "&referrer=" + encodeURIComponent(raw);
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

  async function fetchReferrerOnceFromNative() {
    if (!isNativeAndroid()) return;
    if (localStorage.getItem(FETCHED_KEY) === "1") return;

    const plugin = getInstallReferrerPlugin();
    if (!plugin?.getInstallReferrer) return;

    try {
      const data = await plugin.getInstallReferrer();

      if (data?.canRetry) return;

      localStorage.setItem(FETCHED_KEY, "1");

      const inviterUuid = String(data?.inviterUuid || "").trim();
      const rawReferrer = String(data?.rawReferrer || "").trim();

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
        await showAndroidOnlyInvitePopup();
        await shareInvite();
      });
    });
  }

  async function bootReferral() {
    await fetchReferrerOnceFromNative();
    await claimPendingReferral();
    bindInviteButtons();
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootReferral().catch(() => {});
  });

  window.VReferral = {
    shareInvite,
    bootReferral
  };
})();
