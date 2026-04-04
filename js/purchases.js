/* global CdvPurchase */
(function () {
  "use strict";

  const TAG = "[IAP]";
  const DEBUG = true;

  const log = (...a) => { if (DEBUG) console.log(TAG, ...a); };
  const warn = (...a) => { if (DEBUG) console.warn(TAG, ...a); };

  function $(id) { return document.getElementById(id); }
  function setText(id, txt) {
    const el = $(id);
    if (el) el.textContent = String(txt || "");
  }

  function t(key, fallback) {
    try {
      if (window.VRI18n && typeof window.VRI18n.t === "function") {
        return window.VRI18n.t(key, fallback);
      }
    } catch (_) {}
    return fallback;
  }

  const CURRENT_UNLOCKABLE_UNIVERSES = [
    "heaven_king",
    "western_president",
    "mega_corp_ceo",
    "new_world_explorer"
  ];

  function universeSku(universeId) {
    return "vuniverse_universe_" + String(universeId || "").trim().toLowerCase();
  }

  const SKU = {
    vuniverse_no_ads:       { kind: "noads" },
    vuniverse_diamond:      { kind: "diamond" },
    vuniverse_coins_1200:   { kind: "vcoins", amount: 1200 },
    vuniverse_coins_3000:   { kind: "vcoins", amount: 3000 },
    vuniverse_jetons_12:    { kind: "jetons", amount: 12 },
    vuniverse_jetons_30:    { kind: "jetons", amount: 30 }
  };

  CURRENT_UNLOCKABLE_UNIVERSES.forEach((id) => {
    SKU[universeSku(id)] = { kind: "universe", universe: id };
  });

  const PRICES_BY_ID = Object.create(null);
  const IN_FLIGHT_TX = new Set();

  const PENDING_KEY  = "vuniverse_iap_pending_v1";
  const CREDITED_KEY = "vuniverse_iap_credited_v1";

  let STORE_READY = false;

  // Garde-fous anti double init / double binding
  let START_RUNNING = false;
  let STORE_REGISTERED = false;
  let STORE_EVENTS_WIRED = false;
  let STORE_INITIALIZED = false;
  let PENDING_REPLAYED = false;
  let TOP_NAV_WIRED = false;
  let SHOP_BUTTONS_WIRED = false;

  const readJson = (k, d = []) => {
    try {
      return JSON.parse(localStorage.getItem(k) || "null") ?? d;
    } catch {
      return d;
    }
  };

  const writeJson = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  };

  function addPending(txId, productId) {
    if (!txId) return;
    const list = readJson(PENDING_KEY, []);
    if (!list.find(x => x.txId === txId)) {
      list.push({ txId, productId, ts: Date.now() });
      writeJson(PENDING_KEY, list.slice(-80));
    }
  }

  function removePending(txId) {
    if (!txId) return;
    writeJson(
      PENDING_KEY,
      readJson(PENDING_KEY, []).filter(x => x.txId !== txId)
    );
  }

  function isCredited(txId) {
    if (!txId) return false;
    const list = readJson(CREDITED_KEY, []);
    return list.includes(txId);
  }

  function markCredited(txId) {
    if (!txId) return;
    const list = readJson(CREDITED_KEY, []);
    if (!list.includes(txId)) {
      list.push(txId);
      writeJson(CREDITED_KEY, list.slice(-250));
    }
  }

  function emit(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    } catch (_) {}
  }

  function bindClickOnce(el, marker, handler) {
    if (!el || typeof handler !== "function") return;
    const attr = "data-vr-bound-" + String(marker || "click");
    if (el.getAttribute(attr) === "1") return;
    el.addEventListener("click", handler);
    el.setAttribute(attr, "1");
  }

  function getPlatform() {
    try {
      return window.CdvPurchase?.Platform?.APPLE_APPSTORE || null;
    } catch (_) {
      return null;
    }
  }

  function getProductTypeApi() {
    try {
      return window.CdvPurchase?.ProductType || null;
    } catch (_) {
      return null;
    }
  }

  window.VRIAP = window.VRIAP || {};
  window.VRIAP.isAvailable = function () {
    return !!window.CdvPurchase?.store;
  };
  window.VRIAP.getPrice = function (productId) {
    return PRICES_BY_ID[String(productId || "")] || "";
  };
  window.VRIAP.order = function (productId) {
    return safeOrder(productId);
  };

  function sbReady() {
    return !!(window.sb && window.sb.auth);
  }

  async function ensureAuthStrict() {
    try {
      try { await window.vrWaitBootstrap?.(); } catch (_) {}

      const uid = await window.VRRemoteStore?.ensureAuth?.();
      if (uid) return uid;

      const sb = window.sb;
      if (!sb?.auth) return null;

      try {
        const s = await sb.auth.getSession();
        const uid2 = s?.data?.session?.user?.id || null;
        if (uid2) return uid2;
      } catch (_) {}

      try {
        const r = await sb.auth.getUser();
        return r?.data?.user?.id || null;
      } catch (_) {}
    } catch (_) {}

    return null;
  }

  async function refreshNoAdsUI() {
    let noAds = false;
    try {
      noAds = !!window.VUserData?.hasNoAds?.();
      if (!noAds && window.VUserData?.refresh) {
        await window.VUserData.refresh().catch(() => false);
        noAds = !!window.VUserData?.hasNoAds?.();
      }
    } catch (_) {}

    setText(
      "noads-status",
      noAds
        ? t("shop.status.noads_on", "✅ No Pub : activé")
        : t("shop.status.noads_off", "ℹ️ No Pub : désactivé")
    );
    return noAds;
  }

  async function applyUniverseEntitlement(universeId) {
    const res = await window.VUserData?.markUniversePurchased?.(universeId);
    if (!res?.ok) throw new Error(res?.reason || "universe_local_unlock_failed");
    try { await window.VUserData?.refresh?.(); } catch (_) {}
    return true;
  }

  async function applyDiamondEntitlement() {
    const res = await window.VUserData?.activateDiamondPurchase?.();
    if (!res?.ok) throw new Error(res?.reason || "diamond_local_unlock_failed");
    try { await window.VUserData?.refresh?.(); } catch (_) {}
    return true;
  }

  async function applyNoAdsEntitlement() {
    const res = await window.VUserData?.activateNoAdsPurchase?.();
    if (!res?.ok) throw new Error(res?.reason || "noads_local_unlock_failed");
    try { await window.VUserData?.refresh?.(); } catch (_) {}
    return true;
  }

  async function creditByProductClientSide(productId, txId) {
    const cfg = SKU[productId];
    if (!cfg) throw new Error("unknown_sku");

    if (cfg.kind === "vcoins") {
      const uid = await ensureAuthStrict();
      if (!uid) throw new Error("no_session");
      const r = await window.VRRemoteStore?.addVcoins?.(cfg.amount);
      if (r === null || r === undefined) throw new Error("credit_vcoins_failed");

    } else if (cfg.kind === "jetons") {
      const uid = await ensureAuthStrict();
      if (!uid) throw new Error("no_session");
      const r = await window.VRRemoteStore?.addJetons?.(cfg.amount);
      if (r === null || r === undefined) throw new Error("credit_jetons_failed");

    } else if (cfg.kind === "noads") {
      await applyNoAdsEntitlement();

    } else if (cfg.kind === "universe") {
      await applyUniverseEntitlement(cfg.universe);

    } else if (cfg.kind === "diamond") {
      await applyDiamondEntitlement();

    } else {
      throw new Error("unknown_kind");
    }

    if (txId) markCredited(txId);

    emit("vr:iap_credited", {
      productId: String(productId || ""),
      kind: String(cfg.kind || ""),
      amount: Number(cfg.amount || 0),
      universeId: String(cfg.universe || ""),
      txId: String(txId || "")
    });

    try {
      await window.VRAnalytics?.log?.("iap_purchase_success", {
        product_id: String(productId || ""),
        kind: String(cfg.kind || ""),
        amount: Number(cfg.amount || 0),
        universe_id: String(cfg.universe || "")
      });
    } catch (_) {}

    return true;
  }

  function parseMaybeJson(x) {
    try {
      if (!x) return null;
      if (typeof x === "object") return x;
      return JSON.parse(x);
    } catch {
      return null;
    }
  }

  function parseMaybeBase64Json(x) {
    if (!x || typeof x !== "string") return null;
    try { return JSON.parse(x); } catch (_) {}
    try { return JSON.parse(atob(x)); } catch (_) {}
    return null;
  }

  function getTxIdFromTx(tx) {
    try {
      if (tx?.transaction?.purchaseToken) return tx.transaction.purchaseToken;
    } catch (_) {}

    try {
      const rec = tx?.transaction?.receipt || tx?.receipt;
      const r = typeof rec === "string" ? parseMaybeBase64Json(rec) : rec;

      if (r?.purchaseToken) return r.purchaseToken;

      if (r?.payload) {
        const p = typeof r.payload === "string" ? parseMaybeBase64Json(r.payload) : r.payload;
        if (p?.purchaseToken) return p.purchaseToken;
      }
    } catch (_) {}

    return (
      tx?.purchaseToken ||
      tx?.androidPurchaseToken ||
      tx?.transactionId ||
      tx?.orderId ||
      tx?.id ||
      null
    );
  }

  function simpleHash(str) {
    const s = String(str || "");
    let h = 5381;
    let i = s.length;
    while (i) h = (h * 33) ^ s.charCodeAt(--i);
    return (h >>> 0).toString(16);
  }

  function getProductIdFromTx(tx) {
    let pid =
      tx?.products?.[0]?.id ||
      tx?.productIds?.[0] ||
      tx?.productId ||
      tx?.sku ||
      tx?.transaction?.productId ||
      tx?.transaction?.lineItems?.[0]?.productId ||
      null;

    if (!pid) {
      const rec = tx?.transaction?.receipt || tx?.receipt;
      const r = typeof rec === "string" ? parseMaybeJson(rec) : rec;

      if (Array.isArray(r?.productIds) && r.productIds[0]) pid = r.productIds[0];
      else if (r?.productId) pid = r.productId;
      else if (r?.payload) {
        const p = typeof r.payload === "string" ? parseMaybeJson(r.payload) : r.payload;
        pid = p?.productId || (Array.isArray(p?.productIds) && p.productIds[0]) || pid;
      }
    }

    return pid || null;
  }

  function updateDisplayedPrices() {
    try {
      document.querySelectorAll(".vr-iap-button[data-product-id]").forEach((btn) => {
        const id = btn.getAttribute("data-product-id");
        const label = btn.querySelector(".vr-iap-label");
        if (!label) return;

        const price = PRICES_BY_ID[id];

        if (price) {
          label.textContent = String(price);
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
        } else {
          label.textContent = t("shop.loading", "Chargement...");
          btn.setAttribute("aria-busy", "true");
        }
      });

      document.querySelectorAll("[data-price-for]").forEach((node) => {
        const id = node.getAttribute("data-price-for");
        const price = PRICES_BY_ID[id];
        node.textContent = price ? `(${price})` : "";
      });
    } catch (_) {}
  }

  window.refreshDisplayedPrices = function () {
    updateDisplayedPrices();
  };

  function getStoreApi() {
    const S = window.CdvPurchase?.store;
    const PLATFORM = getPlatform();
    const PT = getProductTypeApi();
    return { S, PLATFORM, PT };
  }

  function refreshPricesFromStore(S, PLATFORM) {
    try {
      Object.keys(SKU).forEach((id) => {
        const p = S.get ? S.get(id, PLATFORM) : (S.products?.byId?.[id]);
        const price =
          p?.pricing?.price ||
          p?.price ||
          p?.pricing?.formattedPrice ||
          p?.pricing?.priceString ||
          null;

        if (price) {
          PRICES_BY_ID[id] = String(price);
        }
      });

      updateDisplayedPrices();
    } catch (e) {
      warn("refreshPricesFromStore failed", e?.message || e);
    }
  }

  async function replayLocalPending() {
    const pendings = readJson(PENDING_KEY, []);
    if (!pendings.length) return;

    for (const it of pendings) {
      if (!it?.txId || !it?.productId) continue;

      if (isCredited(it.txId)) {
        removePending(it.txId);
        continue;
      }

      try {
        await creditByProductClientSide(it.productId, it.txId);
        removePending(it.txId);
        setText("shop-status", t("shop.status.purchase_restored", "✅ Achat restauré"));
      } catch (e) {
        warn("replay pending failed", it.productId, it.txId, e?.message || e);
      }
    }
  }

  async function start() {
    const { S, PLATFORM, PT } = getStoreApi();
    if (!S || !PLATFORM || !PT) {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        const g = getStoreApi();
        if (g.S && g.PLATFORM && g.PT) {
          clearInterval(timer);
          start().catch((e) => warn("start retry failed", e?.message || e));
        }
        if (tries > 60) clearInterval(timer);
      }, 600);
      return;
    }

    if (START_RUNNING) {
      log("start skipped: already running");
      return;
    }
    START_RUNNING = true;

    try {
      try {
        window.VRAds?.scheduleRewardedPreload?.(0);
      } catch (_) {}

      if (sbReady()) {
        await ensureAuthStrict();
      }

      try {
        if (!STORE_REGISTERED) {
          S.register({ id: "vuniverse_no_ads",     type: PT.NON_CONSUMABLE, platform: PLATFORM });
          S.register({ id: "vuniverse_diamond",    type: PT.NON_CONSUMABLE, platform: PLATFORM });
          S.register({ id: "vuniverse_coins_1200", type: PT.CONSUMABLE,     platform: PLATFORM });
          S.register({ id: "vuniverse_coins_3000", type: PT.CONSUMABLE,     platform: PLATFORM });
          S.register({ id: "vuniverse_jetons_12",  type: PT.CONSUMABLE,     platform: PLATFORM });
          S.register({ id: "vuniverse_jetons_30",  type: PT.CONSUMABLE,     platform: PLATFORM });

          CURRENT_UNLOCKABLE_UNIVERSES.forEach((universeId) => {
            S.register({
              id: universeSku(universeId),
              type: PT.NON_CONSUMABLE,
              platform: PLATFORM
            });
          });

          STORE_REGISTERED = true;
        }
      } catch (e) {
        warn("register failed", e?.message || e);
      }

      if (!STORE_EVENTS_WIRED) {
        S.when()
          .productUpdated((p) => {
            try {
              const id = p?.id;
              const price = p?.pricing?.price || p?.pricing?.formattedPrice || null;
              if (id && price) {
                PRICES_BY_ID[id] = price;
                updateDisplayedPrices();
                emit("vr:iap_price", {
                  productId: String(id),
                  price: String(price)
                });
              }
            } catch (_) {}
          })
          .approved(async (tx) => {
            let txId = getTxIdFromTx(tx);
            const productId = getProductIdFromTx(tx);

            if (!txId) {
              txId = "fallback:" + (
                tx?.orderId ||
                tx?.transactionId ||
                simpleHash(JSON.stringify(tx) || String(Date.now()))
              );
              log("approved without purchaseToken, fallback txId =", txId);
            }

            if (!productId) return;

            if (txId && (IN_FLIGHT_TX.has(txId) || isCredited(txId))) {
              try { await tx.finish(); } catch (_) {}
              return;
            }

            if (txId) {
              IN_FLIGHT_TX.add(txId);
              addPending(txId, productId);
            }

            try {
              setText("shop-status", t("shop.status.pending", "…"));
              await creditByProductClientSide(productId, txId);
              removePending(txId);
              setText("shop-status", t("shop.status.purchase_credited", "✅ Achat crédité"));
            } catch (e) {
              setText("shop-status", t("shop.status.purchase_not_credited", "❌ Achat non crédité"));
              warn("credit failed", productId, txId, e?.message || e);

              emit("vr:iap_credit_failed", {
                productId: String(productId || ""),
                txId: String(txId || ""),
                error: String(e?.message || e || "credit_failed")
              });

              if (txId) IN_FLIGHT_TX.delete(txId);
              return;
            }

            try { await tx.finish(); } catch (e) { warn("finish failed", e?.message || e); }
            if (txId) IN_FLIGHT_TX.delete(txId);

            try { window.VRAds?.refreshNoAds && (await window.VRAds.refreshNoAds()); } catch (_) {}
            try { await refreshNoAdsUI(); } catch (_) {}
          });

        STORE_EVENTS_WIRED = true;
      }

      if (!PENDING_REPLAYED) {
        try {
          await replayLocalPending();
          PENDING_REPLAYED = true;
        } catch (_) {}
      }

      if (!STORE_INITIALIZED) {
        try {
          await S.initialize([PLATFORM]);
          STORE_INITIALIZED = true;
          STORE_READY = true;
        } catch (e) {
          warn("store init failed", e?.message || e);
        }
      }

      if (typeof S.ready === "function") {
        try {
          S.ready(async () => {
            STORE_READY = true;
            refreshPricesFromStore(S, PLATFORM);

            try {
              const noAdsProduct = S.get ? S.get("vuniverse_no_ads", PLATFORM) : null;
              if (noAdsProduct?.owned) {
                try { await window.VRAds?.refreshNoAds?.(); } catch (_) {}
                try { await refreshNoAdsUI(); } catch (_) {}
              }
            } catch (_) {}

            try { await replayLocalPending(); } catch (_) {}
            try { S.update && await S.update(); } catch (_) {}
          });
        } catch (e) {
          warn("store ready hook failed", e?.message || e);
        }
      }

      try {
        await S.update();
        STORE_READY = true;
      } catch (e) {
        warn("store update failed", e?.message || e);
      }

      try { refreshPricesFromStore(S, PLATFORM); } catch (_) {}
      try { await refreshNoAdsUI(); } catch (_) {}

      document.addEventListener("resume", async () => {
        try { await ensureAuthStrict(); } catch (_) {}
        try { S.update ? await S.update() : (S.refresh && await S.refresh()); } catch (_) {}
        try { await replayLocalPending(); } catch (_) {}
        try { refreshPricesFromStore(S, PLATFORM); } catch (_) {}
        try { await refreshNoAdsUI(); } catch (_) {}
      });

    } finally {
      START_RUNNING = false;
    }
  }

  function wireTopNav() {
    if (TOP_NAV_WIRED) return;
    TOP_NAV_WIRED = true;

    const bProfile = $("btn-profile");
    const bSettings = $("btn-settings");
    const bShop = $("btn-shop");

    bindClickOnce(bProfile, "nav-profile", () => { window.location.href = "profile.html"; });
    bindClickOnce(bSettings, "nav-settings", () => { window.location.href = "settings.html"; });
    bindClickOnce(bShop, "nav-shop", () => { window.location.href = "shop.html"; });
  }

  async function doRewarded(placement) {
    const plc = String(placement || "shop");

    const rewardMap = {
      shop_jeton: { kind: "jetons", amount: 1 },
      shop_coins: { kind: "vcoins", amount: 300 }
    };

    const cfg = rewardMap[plc];

    try {
      if (!cfg) {
        setText("shop-status", "❌ Placement reward inconnu");
        return false;
      }

      if (!window.VRAds || typeof window.VRAds.showRewardedAd !== "function") {
        setText("shop-status", t("shop.status.ad_not_ready", "Système de pub indisponible"));
        return false;
      }

      if (!window.VUserData) {
        setText("shop-status", "❌ Wallet indisponible");
        return false;
      }

      const before = cfg.kind === "jetons"
        ? Number(window.VUserData.getJetons?.() || 0)
        : Number(window.VUserData.getVcoins?.() || 0);

      setText("shop-status", t("shop.status.pending", "…"));

      try {
        await window.VRAnalytics?.log?.("shop_reward_ad_click", { placement: plc });
      } catch (_) {}

      const okAd = await window.VRAds.showRewardedAd({ placement: plc });
      if (!okAd) {
        setText("shop-status", t("shop.status.reward_not_validated", "❌ Pub non validée"));
        return false;
      }

      if (cfg.kind === "jetons") {
        if (typeof window.VUserData.addJetonsAsync !== "function") {
          setText("shop-status", "❌ addJetonsAsync indisponible");
          return false;
        }
        await window.VUserData.addJetonsAsync(cfg.amount);
      } else {
        if (typeof window.VUserData.addVcoinsAsync !== "function") {
          setText("shop-status", "❌ addVcoinsAsync indisponible");
          return false;
        }
        await window.VUserData.addVcoinsAsync(cfg.amount);
      }

      try { await window.VUserData.refresh?.(); } catch (_) {}

      const after = cfg.kind === "jetons"
        ? Number(window.VUserData.getJetons?.() || 0)
        : Number(window.VUserData.getVcoins?.() || 0);

      if (after < before + cfg.amount) {
        setText("shop-status", "❌ Pub vue mais crédit non reçu");
        return false;
      }

      setText("shop-status", t("shop.status.reward_validated", "✅ Récompense validée"));
      return true;
    } catch (e) {
      console.error("[shop rewarded] error:", e);
      setText("shop-status", t("shop.status.reward_error", "❌ Erreur pub récompensée"));
      return false;
    }
  }

  async function safeOrder(productId) {
    try {
      await window.VRAnalytics?.log?.("iap_purchase_click", {
        product_id: String(productId || "")
      });
    } catch (_) {}

    const { S, PLATFORM } = getStoreApi();
    if (!S || !PLATFORM) {
      setText("shop-status", t("shop.status.iap_unavailable_web", "⚠️ IAP indisponible sur le web."));
      emit("vr:iap_unavailable", { productId: String(productId || "") });
      return;
    }

    if (sbReady()) {
      await ensureAuthStrict();
    }

    if (!STORE_READY) {
      try {
        await S.update();
        STORE_READY = true;
      } catch (_) {}
    }

    const p = S.get ? S.get(productId, PLATFORM) : null;
    if (!p) {
      setText(
        "shop-status",
        t("shop.status.product_not_found_prefix", "⚠️ Produit introuvable : ") + productId
      );
      emit("vr:iap_order_failed", {
        productId: String(productId || ""),
        error: "product_not_found"
      });
      return;
    }

    const offer = p.getOffer && p.getOffer();
    let err = null;

    if (offer?.order) err = await offer.order();
    else if (p?.order) err = await p.order();

    if (err?.isError) {
      warn("order err", err.code, err.message);
      const errorText = String(err.message || err.code || "order_error");

      emit("vr:iap_order_failed", {
        productId: String(productId || ""),
        error: errorText
      });

      try {
        await window.VRAnalytics?.log?.("iap_purchase_failed", {
          product_id: String(productId || ""),
          error: errorText
        });
      } catch (_) {}

      setText("shop-status", "❌ " + errorText);
      return;
    }

    setText("shop-status", t("shop.status.pending", "…"));
  }

  function getProductIdFromButton(btn) {
    try {
      const pid = btn?.getAttribute?.("data-product-id");
      return pid ? String(pid).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function getRewardPlacementFromButton(btn) {
    try {
      const pl = btn?.getAttribute?.("data-reward-placement");
      return pl ? String(pl).trim() : "";
    } catch (_) {
      return "";
    }
  }

  function wireShopButtons() {
    if (SHOP_BUTTONS_WIRED) return;
    SHOP_BUTTONS_WIRED = true;

    try {
      document.querySelectorAll("[data-product-id]").forEach((btn) => {
        bindClickOnce(btn, "order", () => {
          const pid = getProductIdFromButton(btn);
          if (!pid) return;
          safeOrder(pid);
        });
      });
    } catch (_) {}

    try {
      document.querySelectorAll("[data-reward-placement]").forEach((btn) => {
        bindClickOnce(btn, "reward", () => {
          const placement = getRewardPlacementFromButton(btn);
          if (!placement) return;
          doRewarded(placement);
        });
      });
    } catch (_) {}

    const bRJ = $("btn-reward-jeton");
    const bRC = $("btn-reward-coins");
    const bNoAds = $("btn-buy-noads");
    const bDiamond = $("btn-buy-diamond");

    const bC1200 = $("btn-buy-coins-1200");
    const bC3000 = $("btn-buy-coins-3000");

    const bJ12 = $("btn-buy-jetons-12");
    const bJ30 = $("btn-buy-jetons-30");

    bindClickOnce(bRJ, "reward", () => doRewarded("shop_jeton"));
    bindClickOnce(bRC, "reward", () => doRewarded("shop_coins"));

    bindClickOnce(bNoAds, "order", () => safeOrder("vuniverse_no_ads"));
    bindClickOnce(bDiamond, "order", () => safeOrder("vuniverse_diamond"));

    bindClickOnce(bC1200, "order", () => safeOrder("vuniverse_coins_1200"));
    bindClickOnce(bC3000, "order", () => safeOrder("vuniverse_coins_3000"));

    bindClickOnce(bJ12, "order", () => safeOrder("vuniverse_jetons_12"));
    bindClickOnce(bJ30, "order", () => safeOrder("vuniverse_jetons_30"));
  }

  window.restorePurchases = async function () {
    try {
      const { S } = getStoreApi();

      await replayLocalPending();

      if (S?.restorePurchases) {
        const err = await S.restorePurchases();
        if (err?.isError) {
          warn("restorePurchases failed", err.code, err.message);
          setText("shop-status", "❌ " + String(err.message || err.code || "restore_error"));
          return false;
        }
      }

      if (S?.update) await S.update();

      setText("shop-status", t("shop.status.purchase_restored", "✅ Achats restaurés"));
      return true;
    } catch (e) {
      warn("restorePurchases exception", e?.message || e);
      setText("shop-status", t("shop.status.purchase_not_credited", "❌ Achat non crédité"));
      return false;
    }
  };

  window.safeOrder = safeOrder;
  window.buyProduct = safeOrder;

  function startWhenReady() {
    try {
      wireTopNav();
      wireShopButtons();
    } catch (_) {}

    const fire = () => {
      start().catch((e) => warn("start failed", e?.message || e));
    };

    const already =
      (window.cordova && (
        (window.cordova.deviceready && window.cordova.deviceready.fired) ||
        (window.channel && window.channel.onCordovaReady && window.channel.onCordovaReady.fired)
      )) ||
      window._cordovaReady === true;

    if (already) {
      fire();
    } else {
      document.addEventListener("deviceready", function () {
        window._cordovaReady = true;
        fire();
      }, { once: true });

      setTimeout(() => {
        fire();
      }, 1200);

      setTimeout(() => {
        try { updateDisplayedPrices(); } catch (_) {}
      }, 1500);
    }

    refreshNoAdsUI().catch(() => {});
  }

  startWhenReady();
})();
