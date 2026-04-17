// Bridge: listens for postMessage from ProfiECU page
// and stores data in chrome.storage.local (shared across origins)

console.log('[DPD Bridge] Loaded on', window.location.hostname);

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'dpd_autofill_set' && event.data.data) {
    console.log('[DPD Bridge] Received data:', event.data.data);
    chrome.storage.local.set({ dpd_autofill: event.data.data }, () => {
      console.log('[DPD Bridge] Saved to chrome.storage.local');
    });
  }
});
