// DPD ProfiECU — Content Script
// Reads dpd_autofill from ProfiECU localStorage and fills DPD shipping form

(function () {
  'use strict';

  // Value setter — direct assignment + full event dispatch
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

  // Click helper
  function clickEl(el) {
    if (!el) return;
    el.click();
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }

  // Find element by various selectors
  function find(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Wait for element to appear in DOM (polling every 300ms)
  function waitForElement(selectors, timeout) {
    if (!timeout) timeout = 15000;
    const list = selectors.split(',').map(s => s.trim());
    return new Promise((resolve, reject) => {
      const interval = setInterval(() => {
        for (const sel of list) {
          const el = document.querySelector(sel);
          if (el) {
            clearInterval(interval);
            resolve(el);
            return;
          }
        }
      }, 300);
      setTimeout(() => {
        clearInterval(interval);
        reject('timeout: ' + selectors);
      }, timeout);
    });
  }

  // Find checkbox/label by text content
  function findByText(tag, text) {
    const els = document.querySelectorAll(tag);
    for (const el of els) {
      if (el.textContent && el.textContent.includes(text)) return el;
    }
    return null;
  }

  // Fetch data from ProfiECU API with retry
  const API_URL = 'https://profiecu.vercel.app/api/dpd-data';

  async function fetchData() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log('[DPD ProfiECU] Fetch attempt', attempt, 'from', API_URL);
      try {
        const res = await fetch(API_URL + '?t=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        const data = await res.json();
        console.log('[DPD ProfiECU] Response:', data);
        if (data && data.name) return data;
      } catch (e) {
        console.warn('[DPD ProfiECU] Fetch error:', e);
      }
      if (attempt < 3) {
        console.log('[DPD ProfiECU] Waiting 2s before retry...');
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return null;
  }

  async function fillForm() {
    console.log('[DPD ProfiECU] fillForm() called');
    const data = await fetchData();
    if (!data) {
      console.log('[DPD ProfiECU] No data after 3 attempts');
      return;
    }

    console.log('[DPD ProfiECU] Filling form with:', data);

    // Disable Google Autocomplete on address field
    const addrField = find(['[name="findReceiverAddress"]', '#findReceiverAddress']);
    if (addrField) {
      addrField.setAttribute('autocomplete', 'off');
    }

    // ═══ STEP 0 (0ms): Name + hide sender address ═══
    setTimeout(() => {
      // Receiver name — try multiple selectors
      const allInputs = document.querySelectorAll('input[type="text"]');
      let nameField = find([
        '[name="receiverName"]',
        '#receiverName',
        'input[placeholder*="jméno"]',
        'input[placeholder*="Jméno"]',
        'input[placeholder*="příjemce"]',
        'input[placeholder*="Příjemce"]',
      ]);
      // Fallback: find by label text
      if (!nameField) {
        const labels = document.querySelectorAll('label');
        for (const lbl of labels) {
          if (lbl.textContent && (lbl.textContent.includes('Jméno') || lbl.textContent.includes('jméno') || lbl.textContent.includes('příjemce'))) {
            const forId = lbl.getAttribute('for');
            if (forId) nameField = document.getElementById(forId);
            if (!nameField) nameField = lbl.closest('.form-group, .field, div')?.querySelector('input');
            break;
          }
        }
      }
      if (nameField) {
        setVal(nameField, data.name);
        console.log('[DPD ProfiECU] Step 0: name set to', data.name);
      } else {
        console.log('[DPD ProfiECU] Step 0: name field NOT found, tried', allInputs.length, 'inputs');
      }

      // Check "hide sender address" checkbox
      const hideAddrCheckbox = find([
        '[name="useMarkedAddress"]',
        '#useMarkedAddress',
        'input[type="checkbox"][id*="mask"]',
        'input[type="checkbox"][id*="marked"]',
      ]);
      if (hideAddrCheckbox && !hideAddrCheckbox.checked) {
        clickEl(hideAddrCheckbox);
      }
      console.log('[DPD ProfiECU] Step 0: hide address checkbox done');
    }, 0);

    // ═══ STEP 1 (600ms): Click mask address field to open dropdown ═══
    setTimeout(() => {
      const maskField = find([
        '[name="maskAddressName"]',
        '#maskAddressName',
        'input[id*="mask"]',
        'select[id*="mask"]',
      ]);
      if (maskField) {
        clickEl(maskField);
        maskField.focus && maskField.focus();
        console.log('[DPD ProfiECU] Step 1: clicked mask address field');
      }
      // Wait 600ms for dropdown to appear, then select first option
      setTimeout(() => {
        const firstOption = document.querySelector(
          '.k-list-container li:first-child, ' +
          '.k-popup li:first-child, ' +
          '[role="option"]:first-child, ' +
          '.k-list li:first-child'
        );
        if (firstOption) {
          clickEl(firstOption);
          console.log('[DPD ProfiECU] Step 1b: selected first mask option:', firstOption.textContent);
        } else {
          console.log('[DPD ProfiECU] Step 1b: no dropdown options found');
        }
      }, 600);
    }, 600);

    // ═══ STEP 2 (2000ms): ZIP code (triggers service loading) ═══
    setTimeout(() => {
      const zipField = find([
        '[name="zipCode"]',
        'input[placeholder*="PSČ"]',
        'input[placeholder*="PSC"]',
        '#zipCode',
      ]);
      setVal(zipField, data.zip);
      console.log('[DPD ProfiECU] Step 2: ZIP =', data.zip);
    }, 2000);

    // ═══ STEP 3 (3500ms): City + Street + Phone + Email ═══
    setTimeout(() => {
      const cityField = find([
        '[name="cityName"]',
        'input[placeholder*="Město"]',
        'input[placeholder*="město"]',
        '#cityName',
      ]);
      setVal(cityField, data.city);

      const streetField = find([
        '[name="streetName"]',
        'input[placeholder*="Ulice"]',
        'input[placeholder*="ulice"]',
        '#streetName',
      ]);
      setVal(streetField, data.street);

      const phoneField = find([
        '[name="mobileNumber"]',
        'input[placeholder*="Telefon"]',
        'input[placeholder*="telefon"]',
        'input[type="tel"]',
        '#mobileNumber',
      ]);
      setVal(phoneField, data.phone);

      let emailField = find([
        '[name="receiverEmail"]',
        '[name="receiver.email"]',
        '[name="email"]',
        'input[type="email"]',
        'input[placeholder*="E-mail"]',
        'input[placeholder*="email"]',
        '#email',
      ]);
      // Fallback: find input near label "E-mail"
      if (!emailField) {
        const labels = document.querySelectorAll('label');
        for (const lbl of labels) {
          if (lbl.textContent && (lbl.textContent.trim() === 'E-mail' || lbl.textContent.trim() === 'Email')) {
            const forId = lbl.getAttribute('for');
            if (forId) emailField = document.getElementById(forId);
            if (!emailField) {
              // Try input inside the same parent container
              const parent = lbl.closest('.form-group, .field, .rw-widget, div');
              if (parent) emailField = parent.querySelector('input');
            }
            if (!emailField) {
              // Try next sibling input
              let next = lbl.nextElementSibling;
              while (next) {
                if (next.tagName === 'INPUT') { emailField = next; break; }
                const innerInput = next.querySelector('input');
                if (innerInput) { emailField = innerInput; break; }
                next = next.nextElementSibling;
              }
            }
            console.log('[DPD ProfiECU] Step 3: email label found, for=' + forId + ', input=' + (emailField ? emailField.name || emailField.id || 'unnamed' : 'NOT found'));
            break;
          }
        }
      }
      setVal(emailField, data.email);

      console.log('[DPD ProfiECU] Step 3: city=' + (cityField ? 'OK' : 'MISS') +
        ' street=' + (streetField ? 'OK' : 'MISS') +
        ' phone=' + (phoneField ? 'OK' : 'MISS') +
        ' email=' + (emailField ? (emailField.name || emailField.id || 'found') : 'MISS'));
    }, 3500);

    // ═══ STEP 4 (6000ms): Select DPD Private via rw-dropdown-list ═══
    setTimeout(() => {
      // 1. Open the rw-dropdown by clicking its input
      const hiddenInput = document.querySelector('[name="product.mainProductSelected"]');
      const dropdownContainer = hiddenInput && hiddenInput.closest('.rw-dropdown-list');
      const dropdownInput = dropdownContainer && dropdownContainer.querySelector('.rw-dropdown-list-input');
      if (dropdownInput) {
        dropdownInput.click();
        console.log('[DPD ProfiECU] Step 4a: opened rw-dropdown');
      } else {
        console.log('[DPD ProfiECU] Step 4a: rw-dropdown-list-input NOT found');
      }

      // 2. Wait 500ms for dropdown list to render, then click DPD Private
      setTimeout(() => {
        let found = false;
        const options = document.querySelectorAll('.rw-list-option');
        for (const opt of options) {
          if (opt.textContent && opt.textContent.trim() === 'DPD Private') {
            opt.click();
            found = true;
            console.log('[DPD ProfiECU] Step 4b: DPD Private selected');
            break;
          }
        }
        if (!found) {
          // Fallback: partial match
          for (const opt of options) {
            if (opt.textContent && opt.textContent.includes('Private')) {
              opt.click();
              found = true;
              console.log('[DPD ProfiECU] Step 4b: DPD Private selected (partial match)');
              break;
            }
          }
        }
        if (!found) {
          console.log('[DPD ProfiECU] Step 4b: DPD Private NOT found in', options.length, 'options');
        }
      }, 500);
    }, 6000);

    // ═══ STEP 5: Check COD (Dobírka) — waitForElement until label appears after DPD Private ═══
    // Dobírka label only appears after DPD Private is selected, so poll for it
    (function waitForDobirka() {
      const timeout = 15000;
      const interval = 300;
      const start = Date.now();
      console.log('[DPD ProfiECU] Step 5: waiting for Dobírka label...');

      const poll = setInterval(() => {
        // Check if already selected
        const alreadySelected = document.querySelector('#shipment-selected-additional');
        if (alreadySelected && alreadySelected.textContent && alreadySelected.textContent.includes('Dobírka')) {
          clearInterval(poll);
          console.log('[DPD ProfiECU] Step 5: COD already selected, skipping');
          return;
        }

        // Look for Dobírka label inside #shipment-additional-services
        const labels = document.querySelectorAll('#shipment-additional-services label');
        const dobirkaLabel = Array.from(labels).find(el => el.textContent.trim() === 'Dobírka');

        if (dobirkaLabel) {
          clearInterval(poll);
          dobirkaLabel.click();
          console.log('[DPD ProfiECU] Step 5: Dobírka clicked after ' + (Date.now() - start) + 'ms');
          return;
        }

        if (Date.now() - start > timeout) {
          clearInterval(poll);
          console.log('[DPD ProfiECU] Step 5: Dobírka NOT found after ' + timeout + 'ms, labels found: ' + labels.length);
          for (const lbl of labels) {
            console.log('[DPD ProfiECU] Step 5: label: "' + lbl.textContent.trim() + '"');
          }
        }
      }, interval);
    })();

    // ═══ STEP 6: Fill COD amount (waitForElement — waits for amount field after Dobírka) ═══
    if (data.amount) {
      waitForElement('#amount-1, [name="codAmount"], [name="cod.amount"], [name="cashOnDeliveryAmount"]', 15000)
        .then((amountField) => {
          amountField.removeAttribute('disabled');
          amountField.removeAttribute('readonly');
          setVal(amountField, data.amount);
          console.log('[DPD ProfiECU] Step 6: COD amount set to', data.amount);
          console.log('[DPD ProfiECU] Autofill complete');
        })
        .catch((err) => {
          console.log('[DPD ProfiECU] Step 6 Error:', err);
          console.log('[DPD ProfiECU] Autofill complete (without amount)');
        });
    } else {
      console.log('[DPD ProfiECU] Autofill complete (no amount)');
    }
  }

  // Wait for page to be ready, then fill
  if (document.readyState === 'complete') {
    setTimeout(fillForm, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(fillForm, 1500));
  }
})();
