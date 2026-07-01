// bridge-idoklad.js — ISOLATED world
// Fetches data from ProfiECU API and sends to MAIN world via postMessage

(async function () {
  'use strict';

  var API_URL = 'https://profiecu.vercel.app/api/idoklad-data';

  // Nonce token z hashe URL (#pe=<nonce>). API vydá data jen s ním a jednorázově
  // (oprava #1 — dřív endpoint vracel PII komukoliv). Bez nonce se nefetchuje.
  var nonceMatch = (location.hash || '').match(/[#&]pe=([^&]+)/);
  var NONCE = nonceMatch ? decodeURIComponent(nonceMatch[1]) : null;
  if (!NONCE) {
    console.warn('[iDoklad Bridge] Chybi nonce v URL (#pe=...) — autofill preskocen.');
    return;
  }

  for (var attempt = 1; attempt <= 3; attempt++) {
    console.log('[iDoklad Bridge] Fetch attempt', attempt);
    try {
      var res = await fetch(API_URL + '?token=' + encodeURIComponent(NONCE) + '&t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      var data = await res.json();
      if (data && (data.name || data.sn)) {
        console.log('[iDoklad Bridge] Data received:', data);
        window.postMessage({ type: 'IDOKLAD_PROFIECU_DATA', payload: data }, '*');
        return;
      }
    } catch (e) {
      console.warn('[iDoklad Bridge] Fetch error:', e);
    }
    if (attempt < 3) {
      await new Promise(function (r) { setTimeout(r, 2000); });
    }
  }
  console.log('[iDoklad Bridge] No data after 3 attempts');
})();
