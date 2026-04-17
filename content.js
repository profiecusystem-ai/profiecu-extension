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
      // Receiver name
      const nameField = find([
        '[name="receiverName"]',
        'input[placeholder*="jméno"]',
        'input[placeholder*="Jméno"]',
        '#receiverName',
      ]);
      setVal(nameField, data.name);

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
      console.log('[DPD ProfiECU] Step 0: name + hide address');
    }, 0);

    // ═══ STEP 1 (600ms): Open mask address dropdown + select first ═══
    setTimeout(() => {
      const maskDropdown = find([
        '[name="maskAddressName"]',
        '#maskAddressName',
        'select[id*="mask"]',
      ]);
      if (maskDropdown && maskDropdown.tagName === 'SELECT') {
        if (maskDropdown.options.length > 1) {
          maskDropdown.selectedIndex = 1;
          maskDropdown.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else if (maskDropdown) {
        clickEl(maskDropdown);
        setTimeout(() => {
          const firstOption = maskDropdown.closest('.dropdown, .select')?.querySelector('li, option, [role="option"]');
          if (firstOption) clickEl(firstOption);
        }, 200);
      }
      console.log('[DPD ProfiECU] Step 1: mask address');
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
      // Look for DPD Private in product selection
      const products = document.querySelectorAll(
        '[class*="product"], [class*="service"], [data-product], .shipment-product, label'
      );
      for (const prod of products) {
        if (prod.textContent && prod.textContent.includes('DPD Private')) {
          clickEl(prod);
          // Also try clicking radio/checkbox inside
          const inner = prod.querySelector('input[type="radio"], input[type="checkbox"]');
          if (inner) clickEl(inner);
          console.log('[DPD ProfiECU] Step 4: selected DPD Private');
          break;
        }
      }
    }, 3200);

    // ═══ STEP 5 (4800ms): Check COD (Dobírka) in additional services ═══
    setTimeout(() => {
      // Check if COD is already selected
      const alreadySelected = document.querySelector('#shipment-selected-additional');
      if (alreadySelected && alreadySelected.textContent && alreadySelected.textContent.includes('Dobírka')) {
        console.log('[DPD ProfiECU] Step 5: COD already selected, skipping');
        return;
      }

      // Find COD checkbox in additional services
      const additionalServices = document.querySelector('#shipment-additional-services');
      if (additionalServices) {
        const labels = additionalServices.querySelectorAll('label');
        for (const label of labels) {
          if (label.textContent && label.textContent.includes('Dobírka')) {
            const checkbox = label.querySelector('input[type="checkbox"]') || label.previousElementSibling;
            if (checkbox && checkbox.tagName === 'INPUT' && !checkbox.checked) {
              clickEl(checkbox);
            } else {
              clickEl(label);
            }
            console.log('[DPD ProfiECU] Step 5: COD checkbox clicked');
            break;
          }
        }
      } else {
        // Fallback: search all checkboxes/labels
        const codLabel = findByText('label', 'Dobírka');
        if (codLabel) {
          const checkbox = codLabel.querySelector('input[type="checkbox"]');
          if (checkbox && !checkbox.checked) clickEl(checkbox);
          else clickEl(codLabel);
          console.log('[DPD ProfiECU] Step 5: COD (fallback)');
        }
      }
    }, 4800);

    setTimeout(() => {
      console.log('[DPD ProfiECU] Autofill complete');
    }, 6000);
  }

  // Wait for page to be ready, then fill
  if (document.readyState === 'complete') {
    setTimeout(fillForm, 1500);
  } else {
    window.addEventListener('load', () => setTimeout(fillForm, 1500));
  }
})();
