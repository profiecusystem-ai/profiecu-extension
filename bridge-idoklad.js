// bridge-idoklad.js — ISOLATED world
// Fetches data from ProfiECU API and sends to MAIN world via postMessage

(async function () {
  'use strict';

  var API_URL = 'https://profiecu.vercel.app/api/idoklad-data';

  for (var attempt = 1; attempt <= 3; attempt++) {
    console.log('[iDoklad Bridge] Fetch attempt', attempt);
    try {
      var res = await fetch(API_URL + '?t=' + Date.now(), {
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
