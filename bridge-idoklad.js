// bridge-idoklad.js — ISOLATED world
// Fetches last-saved order payload from ProfiECU and forwards it to the MAIN world
// content-idoklad.js via window.postMessage. Runs on document_idle on
// https://app.idoklad.cz/IssuedInvoice/Create*.

(function () {
  const API_URL = 'https://profiecu.vercel.app/api/idoklad-data';
  const MAX_ATTEMPTS = 3;
  const RETRY_INTERVAL_MS = 2000;

  // Nonce token z hashe URL (#pe=<nonce>) — data se vydají jen s ním (one-time).
  function readNonce() {
    const m = (location.hash || '').match(/[#&]pe=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  const NONCE = readNonce();

  async function fetchPayload(attempt) {
    attempt = attempt || 1;
    if (!NONCE) {
      console.warn('[iDoklad bridge] Chybí nonce v URL (#pe=…) — autofill přeskočen.');
      return;
    }
    try {
      const res = await fetch(API_URL + '?token=' + encodeURIComponent(NONCE), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data) throw new Error('empty body');
      console.log('[iDoklad bridge] Payload fetched on attempt ' + attempt, data);
      window.postMessage({ type: 'IDOKLAD_PROFIECU_DATA', payload: data }, '*');
    } catch (err) {
      console.warn('[iDoklad bridge] Attempt ' + attempt + ' failed:', err && err.message);
      if (attempt < MAX_ATTEMPTS) {
        setTimeout(function () { fetchPayload(attempt + 1); }, RETRY_INTERVAL_MS);
      } else {
        console.error('[iDoklad bridge] Giving up after ' + MAX_ATTEMPTS + ' attempts');
      }
    }
  }

  console.log('[iDoklad bridge] Loaded, fetching payload...');
  fetchPayload();
})();
