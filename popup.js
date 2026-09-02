function showStatus(msg, type) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status ' + type;
}

function getManualData() {
  return {
    name: document.getElementById('name').value,
    street: document.getElementById('street').value,
    zip: document.getElementById('zip').value,
    city: document.getElementById('city').value,
    phone: document.getElementById('phone').value,
    email: document.getElementById('email').value,
    amount: document.getElementById('amount').value,
    productName: document.getElementById('productName').value,
    houseNo: '',
    vs: ''
  };
}

function injectScript(tabId, data, type) {
  const storageKey = type === 'dpd' ? 'dpd_autofill' : 'idoklad_autofill';
  chrome.scripting.executeScript({
    target: { tabId },
    func: (key, val) => { localStorage.setItem(key, JSON.stringify(val)); },
    args: [storageKey, data]
  }).then(() => {
    showStatus('Data uložena — spouštím autofill...', 'success');
    chrome.tabs.sendMessage(tabId, { action: type === 'dpd' ? 'fillDpd' : 'fillIdoklad' });
  }).catch((err) => {
    showStatus('Chyba: ' + err.message, 'error');
  });
}

document.getElementById('fillDpd').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('shipping.dpdgroup.com')) {
      showStatus('Otevřete DPD stránku a zkuste znovu', 'error');
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => localStorage.getItem('dpd_autofill')
    }).then((results) => {
      const data = results[0]?.result;
      if (!data) {
        showStatus('Žádná data z ProfiECU — použijte ruční zadání', 'error');
        return;
      }
      showStatus('Spouštím autofill DPD...', 'success');
      chrome.tabs.sendMessage(tab.id, { action: 'fillDpd' });
    });
  });
});

document.getElementById('fillIdoklad').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('app.idoklad.cz')) {
      showStatus('Otevřete iDoklad stránku a zkuste znovu', 'error');
      return;
    }
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => localStorage.getItem('idoklad_autofill')
    }).then((results) => {
      const data = results[0]?.result;
      if (!data) {
        showStatus('Žádná data z ProfiECU — použijte ruční zadání', 'error');
        return;
      }
      showStatus('Spouštím autofill iDoklad...', 'success');
      chrome.tabs.sendMessage(tab.id, { action: 'fillIdoklad' });
    });
  });
});

document.getElementById('manualDpd').addEventListener('click', () => {
  const data = getManualData();
  if (!data.name) { showStatus('Vyplňte alespoň jméno', 'error'); return; }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('shipping.dpdgroup.com')) {
      showStatus('Otevřete DPD stránku a zkuste znovu', 'error');
      return;
    }
    injectScript(tab.id, data, 'dpd');
  });
});

document.getElementById('manualIdoklad').addEventListener('click', () => {
  const data = getManualData();
  if (!data.name) { showStatus('Vyplňte alespoň jméno', 'error'); return; }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.url?.includes('app.idoklad.cz')) {
      showStatus('Otevřete iDoklad stránku a zkuste znovu', 'error');
      return;
    }
    injectScript(tab.id, data, 'idoklad');
  });
});
