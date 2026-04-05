// js/supabaseBootstrap.js
// Initialise window.sb + bootstrapAuthAndProfile() pour VRealms.
// ⚠️ Utilise une ANON KEY (ok côté client). Ne jamais mettre la service_role key ici.

(function () {
  "use strict";

  // --- Config Supabase (ton projet) ---
  const SUPABASE_URL = "https://fbkbqfkgdjkjdfijmggd.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZia2JxZmtnZGpramRmaWptZ2dkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5MTIyOTgsImV4cCI6MjA4MTQ4ODI5OH0.ylBfBeXBWliR13GumJrFazRjP57RyBR3mzaebF7Iy24";

  // --- Client ---
  let _bootstrapPromise = null;
  let _lastBootstrapUid = null;

  function getCreateClient() {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return window.supabase.createClient;
    }
    if (window.supabaseJs && typeof window.supabaseJs.createClient === "function") {
      return window.supabaseJs.createClient;
    }
    return null;
  }

  function initClient() {
    if (window.sb) return window.sb;
    const createClient = getCreateClient();
    if (!createClient) return null;

    window.sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });

    return window.sb;
  }

  async function waitInitialSession(sb, timeoutMs = 1200) {
    if (!sb?.auth?.onAuthStateChange) return;

    await new Promise((resolve) => {
      let done = false;
      let timer = null;
      let sub = null;

      function finish() {
        if (done) return;
        done = true;
        try { clearTimeout(timer); } catch (_) {}
        try { sub?.data?.subscription?.unsubscribe?.(); } catch (_) {}
        resolve();
      }

      try {
        timer = setTimeout(finish, timeoutMs);

        sub = sb.auth.onAuthStateChange((event, session) => {
          if (session?.user?.id) {
            _lastBootstrapUid = session.user.id;
          }

          if (
            event === "INITIAL_SESSION" ||
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED"
          ) {
            setTimeout(finish, 0);
          }

          if (event === "SIGNED_OUT") {
            _lastBootstrapUid = null;
          }
        });
      } catch (_) {
        finish();
      }
    });
  }

  async function getUid(sb) {
    try {
      const s = await sb.auth.getSession();
      const uid = s?.data?.session?.user?.id || null;
      if (uid) return uid;
    } catch (_) {}

    try {
      const r = await sb.auth.getUser();
      const uid = r?.data?.user?.id || null;
      if (uid) return uid;
    } catch (_) {}

    return null;
  }

  async function fetchProfile(sb) {
    if (navigator.onLine === false) return null;

    try {
      const prof = await sb.rpc("secure_get_me");
      if (!prof?.error && prof?.data) return prof.data;
    } catch (_) {}

    return null;
  }

  async function runBootstrap(options = {}) {
    const sb = initClient();
    if (!sb) return null;

    const fetchRemoteProfile = !!options.fetchProfile && !options.skipProfileFetch;

    await waitInitialSession(sb);

    let uid = await getUid(sb);

    if (!uid) {
      try {
        const r = await sb.auth.signInAnonymously();
        uid = r?.data?.user?.id || r?.data?.session?.user?.id || null;
      } catch (_) {}
    }

    if (!uid) return null;

    _lastBootstrapUid = uid;

    if (fetchRemoteProfile) {
      const prof = await fetchProfile(sb);
      if (prof && typeof prof === "object") return prof;
    }

    return { id: uid };
  }

  async function bootstrapAuthAndProfile(options = {}) {
    const force = !!options.force;
    const fetchProfile = !!options.fetchProfile;
    const skipProfileFetch = !!options.skipProfileFetch;

    if (force) {
      _bootstrapPromise = null;
      _lastBootstrapUid = null;
    }

    if (_bootstrapPromise) {
      return _bootstrapPromise;
    }

    _bootstrapPromise = (async () => {
      try {
        return await runBootstrap({ fetchProfile, skipProfileFetch });
      } finally {
        _bootstrapPromise = null;
      }
    })();

    return _bootstrapPromise;
  }

  window.bootstrapAuthAndProfile = bootstrapAuthAndProfile;
  window.vrWaitBootstrap = bootstrapAuthAndProfile;

  try {
    const sb = initClient();
    if (sb?.auth?.onAuthStateChange) {
      sb.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          _lastBootstrapUid = null;
        } else if (session?.user?.id) {
          _lastBootstrapUid = session.user.id;
        }
      });
    }
  } catch (_) {}

  try { initClient(); } catch (_) {}
})();
