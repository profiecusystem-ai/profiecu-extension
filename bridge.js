// Bridge: reads DPD autofill data from a hidden DOM element
// written by ProfiECU page, and saves it to chrome.storage.local
// (DOM is shared between page JS and content script)

console.log('[DPD Bridge] Loaded on', window.location.hostname);

function checkAndSave() {
  const el = document.getElementById('dpd-autofill-data');
  if (el && el.textContent) {
    try {
      const data = JSON.parse(el.textContent);
      chrome.storage.local.set({ dpd_autofill: data }, () => {
        console.log('[DPD Bridge] Saved to chrome.storage.local:', data.name);
      });
    } catch (e) {
      console.warn('[DPD Bridge] Parse error:', e);
    }
  }
}

// Check immediately (element might already exist)
checkAndSave();

// Watch for new elements or text changes
const observer = new MutationObserver(() => {
  checkAndSave();
});
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
