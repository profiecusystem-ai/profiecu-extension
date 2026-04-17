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

      // Expand "Kontaktní údaje" section
      const rozbalit = Array.from(document.querySelectorAll('button, a, span')).find(
        el => el.textContent.trim().includes('Rozbalit')
      );
      if (rozbalit) {
        rozbalit.click();
        console.log('[DPD ProfiECU] Step 0: clicked "Rozbalit..."');
      }

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

      console.log('[DPD ProfiECU] Step 3: city=' + (cityField ? 'OK' : 'MISS') +
        ' street=' + (streetField ? 'OK' : 'MISS') +
        ' phone=' + (phoneField ? 'OK' : 'MISS'));
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

    // ═══ STEP 5 (8000ms): Open "Doplňkové služby" dropdown, then click "Dobírka" ═══
    setTimeout(() => {
      // Check if already selected
      const alreadySelected = document.querySelector('#shipment-selected-additional');
      if (alreadySelected && alreadySelected.textContent && alreadySelected.textContent.includes('Dobírka')) {
        console.log('[DPD ProfiECU] Step 5: COD already selected, skipping');
        return;
      }

      // 1. Find and click "Doplňkové služby" dropdown input
      const doplnkoveDropdown = Array.from(document.querySelectorAll('label')).find(
        el => el.textContent.trim() === 'Doplňkové služby'
      )?.closest('.rw-dropdown-list')?.querySelector('.rw-dropdown-list-input');

      if (doplnkoveDropdown) {
        doplnkoveDropdown.click();
        console.log('[DPD ProfiECU] Step 5a: Doplňkové služby clicked');
      } else {
        console.log('[DPD ProfiECU] Step 5a: Doplňkové služby dropdown NOT found');
      }

      // 2. Wait 500ms for dropdown list to render, then click "Dobírka"
      setTimeout(() => {
        const options = document.querySelectorAll('.rw-list-option');
        const dobirka = Array.from(options).find(el => el.textContent.trim() === 'Dobírka');
        if (dobirka) {
          dobirka.click();
          console.log('[DPD ProfiECU] Step 5b: Dobírka selected');
        } else {
          // Log all options for debugging
          console.log('[DPD ProfiECU] Step 5b: Dobírka NOT found in ' + options.length + ' options');
          for (const opt of options) {
            console.log('[DPD ProfiECU] Step 5b: option: "' + opt.textContent.trim() + '"');
          }
        }
      }, 500);
    }, 8000);

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

    // ═══ EMAIL (500ms): Fill receiver email early ═══
    setTimeout(() => {
      const ef = document.querySelectorAll('[name="email"]');
      if (ef[1] && data.email) {
        ef[1].focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, data.email);
        console.log('[DPD ProfiECU] email set at 500ms:', data.email);
      } else {
        console.log('[DPD ProfiECU] email MISS at 500ms — fields=' + ef.length);
      }
    }, 500);
  }

  // Wait for page to be ready, then fill
  if (document.readyState === 'complete') {
    setTimeout(fillForm, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(fillForm, 1500));
  }
})();
