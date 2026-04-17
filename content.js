// DPD ProfiECU — Content Script
// Reads dpd_autofill from ProfiECU localStorage and fills DPD shipping form

(function () {
  'use strict';

  // React-compatible value setter — triggers React's onChange
  function setVal(el, value) {
    if (!el) return;
    const nativeInputValueSetter =
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
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

    // ═══ STEP 2 (1000ms): ZIP code (triggers service loading) ═══
    setTimeout(() => {
      const zipField = find([
        '[name="zipCode"]',
        'input[placeholder*="PSČ"]',
        'input[placeholder*="PSC"]',
        '#zipCode',
      ]);
      setVal(zipField, data.zip);
      console.log('[DPD ProfiECU] Step 2: ZIP =', data.zip);
    }, 1000);

    // ═══ STEP 3 (1600ms): City + Street + Phone + Email ═══
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

      const emailField = find([
        '[name="email"]',
        'input[placeholder*="E-mail"]',
        'input[placeholder*="email"]',
        'input[type="email"]',
        '#email',
      ]);
      setVal(emailField, data.email);

      console.log('[DPD ProfiECU] Step 3: city, street, phone, email');
    }, 1600);

    // ═══ STEP 4 (3200ms): Select DPD Private main product ═══
    setTimeout(() => {
      let found = false;
      // Search all clickable elements containing "DPD Private"
      const allEls = document.querySelectorAll('label, div, span, button, a, li, td');
      for (const el of allEls) {
        const text = el.textContent?.trim() || '';
        if (text.includes('DPD Private') && !text.includes('DPD Private ')) {
          // Click the element itself
          clickEl(el);
          // Also try radio/checkbox inside or nearby
          const inner = el.querySelector('input[type="radio"], input[type="checkbox"]');
          if (inner) clickEl(inner);
          // Try parent click too
          if (el.parentElement) clickEl(el.parentElement);
          console.log('[DPD ProfiECU] Step 4: clicked DPD Private:', text.substring(0, 40));
          found = true;
          break;
        }
      }
      if (!found) {
        // Fallback: try exact match
        for (const el of allEls) {
          if (el.textContent?.trim() === 'DPD Private') {
            clickEl(el);
            console.log('[DPD ProfiECU] Step 4: exact match DPD Private');
            found = true;
            break;
          }
        }
      }
      if (!found) console.log('[DPD ProfiECU] Step 4: DPD Private NOT found');
    }, 3200);

    // ═══ STEP 5 (4800ms): Check COD (Dobírka) in additional services ═══
    setTimeout(() => {
      // Check if COD is already selected
      const alreadySelected = document.querySelector('#shipment-selected-additional');
      if (alreadySelected && alreadySelected.textContent && alreadySelected.textContent.includes('Dobírka')) {
        console.log('[DPD ProfiECU] Step 5: COD already selected, skipping');
        return;
      }

      let clicked = false;
      // Search all labels/elements for "Dobírka"
      const allEls = document.querySelectorAll('label, div, span, li');
      for (const el of allEls) {
        if (el.textContent && el.textContent.includes('Dobírka') && !el.textContent.includes('Pojištění')) {
          const checkbox = el.querySelector('input[type="checkbox"]') || el.previousElementSibling;
          if (checkbox && checkbox.tagName === 'INPUT' && !checkbox.checked) {
            clickEl(checkbox);
            clicked = true;
          } else {
            clickEl(el);
            clicked = true;
          }
          console.log('[DPD ProfiECU] Step 5: COD clicked via:', el.tagName, el.textContent?.substring(0, 30));
          break;
        }
      }
      if (!clicked) console.log('[DPD ProfiECU] Step 5: Dobírka NOT found');
    }, 4800);

    // ═══ STEP 6 (6800ms): Fill COD amount after Dobírka loads (2000ms wait) ═══
    setTimeout(() => {
      const amountField = document.querySelector('#amount-1, [id="amount-1"], input[name="amount-1"]');
      if (amountField && data.amount) {
        amountField.removeAttribute('disabled');
        amountField.removeAttribute('readonly');
        setVal(amountField, data.amount);
        amountField.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log('[DPD ProfiECU] Step 6: COD amount set to', data.amount);
      } else {
        console.log('[DPD ProfiECU] Step 6: amount field not found or no amount data');
      }
      console.log('[DPD ProfiECU] Autofill complete');
    }, 6800);
  }

  // Wait for page to be ready, then fill
  if (document.readyState === 'complete') {
    setTimeout(fillForm, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(fillForm, 1500));
  }
})();
