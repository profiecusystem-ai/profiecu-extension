function setVal(el, value) {
  if (!el) return;
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

function setValByName(name, val) {
  var el = document.querySelector('[name="' + name + '"]');
  if (!el) return false;
  setVal(el, val);
  return true;
}

function clickCheckbox(el) {
  if (!el) return;
  if (!el.checked) el.click();
}

function waitForElement(selectors, timeout) {
  if (!timeout) timeout = 15000;
  var list = selectors.split(',').map(function(s) { return s.trim(); });
  return new Promise(function(resolve, reject) {
    var interval = setInterval(function() {
      for (var i = 0; i < list.length; i++) {
        var el = document.querySelector(list[i]);
        if (el) {
          clearInterval(interval);
          resolve(el);
          return;
        }
      }
    }, 300);
    setTimeout(function() {
      clearInterval(interval);
      reject('timeout: ' + selectors);
    }, timeout);
  });
}

function uncheckCheckbox(el) {
  if (!el) return;
  if (el.checked) el.click();
}

// Má se na zásilce zaškrtnout Dobírka? Nový payload posílá explicitní `cod`.
// Starší payload (bez pole) se pozná podle částky — "0" = zásilka zdarma.
function wantsCod(d) {
  if (typeof d.cod === 'boolean') return d.cod;
  return !!d.amount && parseFloat(d.amount) > 0;
}

function fillDpd() {
  var raw = localStorage.getItem('dpd_autofill');
  if (!raw) return;
  var d = JSON.parse(raw);
  var useCod = wantsCod(d);

  // Step 1 (0ms): jméno + skrýt adresu odesílatele
  setValByName('name', d.name);
  var hideAddr = document.querySelector('[name="useMarkedAddress"]');
  clickCheckbox(hideAddr);

  // Step 2 (600ms): otevřít dropdown maskovacích adres + vybrat první
  setTimeout(function() {
    var maskDropdown = document.querySelector('[name="maskAddressName"]');
    if (maskDropdown) {
      maskDropdown.focus();
      if (maskDropdown.tagName === 'SELECT' && maskDropdown.options.length > 1) {
        maskDropdown.selectedIndex = 1;
        maskDropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, 600);

  // Step 3 (1000ms): PSČ (spustí načtení služeb) — disable autocomplete first
  setTimeout(function() {
    var findAddr = document.querySelector('[name="findReceiverAddress"]');
    if (findAddr) findAddr.setAttribute('autocomplete', 'off');
    setValByName('zipCode', d.zip);
  }, 1000);

  // Step 3b (1600ms): město + ulice + telefon + email
  setTimeout(function() {
    setValByName('cityName', d.city);
    setValByName('streetName', d.street);
    setValByName('mobileNumber', d.phone);
    setValByName('email', d.email);
    // fallback email selectory
    if (d.email) {
      setValByName('receiverEmail', d.email);
      setValByName('receiver.email', d.email);
    }
  }, 1600);

  // Step 4: vybrat DPD Private (waitForElement — čeká až se načte po PSČ)
  waitForElement('[name="product.mainProductSelected"]', 15000)
    .then(function(productSelect) {
      var privateOpt = Array.from(productSelect.options || []).find(function(o) {
        return o.text.includes('Private') || o.value.includes('private') || o.value.includes('Private');
      });
      if (privateOpt) {
        productSelect.value = privateOpt.value;
        productSelect.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('[ProfiECU] Step 4: DPD Private selected');
      } else {
        console.log('[ProfiECU] Step 4: DPD Private option not found in dropdown');
      }

      // Step 5: zaškrtnout Dobírku (waitForElement — čeká až se načtou služby po výběru produktu)
      return waitForElement('#shipment-additional-services, [data-service="COD"], .additional-services', 15000);
    })
    .then(function(servicesSection) {
      var selectedServices = document.querySelector('#shipment-selected-additional');
      var alreadyHasCod = selectedServices && selectedServices.textContent.includes('Dobírk');

      // Najdi checkbox služby Dobírka (potřebujeme ho pro obě větve).
      var codCb = null;
      var labels = servicesSection.querySelectorAll('label');
      for (var i = 0; i < labels.length; i++) {
        if (labels[i].textContent.includes('Dobírk') || labels[i].textContent.includes('COD')) {
          codCb = labels[i].querySelector('input[type="checkbox"]') ||
                  labels[i].previousElementSibling;
          break;
        }
      }

      if (!useCod) {
        // Zásilka zdarma (zaplaceno předem / reklamace) — dobírku nezaškrtávat
        // a když ji formulář zdědil z předchozí zásilky, odškrtnout ji.
        uncheckCheckbox(codCb);
        console.log('[ProfiECU] Step 5: Bez dobírky (zaplaceno předem / reklamace)');
        return null;
      }

      if (!alreadyHasCod) {
        if (codCb && !codCb.checked) codCb.click();
        console.log('[ProfiECU] Step 5: Dobírka checked');
      } else {
        console.log('[ProfiECU] Step 5: Dobírka already checked');
      }

      // Step 6: vyplnit částku dobírky (waitForElement — čeká až se zobrazí pole po zaškrtnutí)
      if (d.amount) {
        return waitForElement('#amount-1, [name="codAmount"], [name="cod.amount"], [name="cashOnDeliveryAmount"], .cod-amount input', 15000);
      }
      return null;
    })
    .then(function(amountEl) {
      if (amountEl && useCod && d.amount) {
        setVal(amountEl, d.amount);
        console.log('[ProfiECU] Step 6: Amount filled: ' + d.amount);
      }
    })
    .catch(function(err) {
      console.log('[ProfiECU] Error: ' + err);
    });
}

chrome.runtime.onMessage.addListener(function(msg) {
  if (msg.action === 'fillDpd') fillDpd();
});

// Auto-fetch payload from ProfiECU and trigger fill on page load (no popup click needed)
(function autoFetchAndFill() {
  var API_URL = 'https://profiecu.vercel.app/api/dpd-data';
  var MAX_ATTEMPTS = 4;
  var RETRY_INTERVAL_MS = 1500;

  // Nonce token přečteme z hashe URL (#pe=<nonce>) HNED, než ho SPA případně
  // smaže. Data se vydají jen s ním (jednorázově). Bez nonce se nefetchuje.
  function readNonce() {
    var m = (location.hash || '').match(/[#&]pe=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  var NONCE = readNonce();

  function fetchPayload(attempt) {
    attempt = attempt || 1;
    if (!NONCE) {
      console.warn('[ProfiECU DPD] Chybí nonce v URL (#pe=…) — autofill přeskočen.');
      return;
    }
    fetch(API_URL + '?token=' + encodeURIComponent(NONCE), { cache: 'no-store' })
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        if (!data) throw new Error('empty payload');
        localStorage.setItem('dpd_autofill', JSON.stringify(data));
        console.log('[ProfiECU DPD] Payload loaded on attempt ' + attempt, data);
        // Drobné zpoždění, ať se DOM stihne načíst
        setTimeout(fillDpd, 1500);
      })
      .catch(function(err) {
        console.warn('[ProfiECU DPD] Attempt ' + attempt + ' failed: ' + err.message);
        // Data jsou one-time: po prvním úspěšném GETu jsou smazaná, takže retry
        // po úspěchu nemá smysl. Retry jen dokud se poprvé nenačtou.
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(function() { fetchPayload(attempt + 1); }, RETRY_INTERVAL_MS);
        } else {
          console.error('[ProfiECU DPD] Giving up after ' + MAX_ATTEMPTS + ' attempts');
        }
      });
  }

  console.log('[ProfiECU DPD] Auto-fetch starting...');
  fetchPayload();
})();
