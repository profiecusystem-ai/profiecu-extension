// Bridge: listens for dpd_autofill events from ProfiECU page
// and stores data in chrome.storage.local (shared across origins)

window.addEventListener('dpd_autofill_set', (e) => {
  if (e.detail && chrome?.storage?.local) {
    chrome.storage.local.set({ dpd_autofill: e.detail }, () => {
      console.log('[DPD Bridge] Data saved to chrome.storage.local');
    });
  }
});

// Signal to the page that the extension is available
window.dispatchEvent(new CustomEvent('dpd_extension_ready'));
