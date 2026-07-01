// bridge.js — ISOLATED world
// Fetches data from ProfiECU API and sends to MAIN world via postMessage

(async function () {
  'use strict';

  var API_URL = 'https://profiecu.vercel.app/api/dpd-data';

  // Nonce token z hashe URL (#pe=<nonce>). API vydá data jen s ním a jednorázově
  // (oprava #1 — dřív endpoint vracel PII komukoliv). Bez nonce se nefetchuje.
  var nonceMatch = (location.hash || '').match(/[#&]pe=([^&]+)/);
  var NONCE = nonceMatch ? decodeURIComponent(nonceMatch[1]) : null;
  if (!NONCE) {
    console.warn('[DPD Bridge] Chybi nonce v URL (#pe=...) — autofill preskocen.');
    return;
  }

  for (var attempt = 1; attempt <= 3; attempt++) {
    console.log('[DPD Bridge] Fetch attempt', attempt);
    try {
      var res = await fetch(API_URL + '?token=' + encodeURIComponent(NONCE) + '&t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      var data = await res.json();
      if (data && data.name) {
        console.log('[DPD Bridge] Data received:', data);
        window.postMessage({ type: 'DPD_PROFIECU_DATA', payload: data }, '*');
        return;
      }
    } catch (e) {
      console.warn('[DPD Bridge] Fetch error:', e);
    }
    if (attempt < 3) {
      await new Promise(function (r) { setTimeout(r, 2000); });
    }
  }
  console.log('[DPD Bridge] No data after 3 attempts');
})();
