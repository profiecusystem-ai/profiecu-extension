// content.js — MAIN world
// Has access to page's JS context (React internals, native prototypes)

(function () {
  'use strict';

  // ═══ Native value setter — works with React controlled inputs ═══
  var nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;

  function setNativeValue(el, value) {
    if (!el) return;
    el.focus();
    nativeInputSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // ═══ React checkbox click ═══
  function reactCheckboxClick(el) {
    var setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'checked'
    ).set;
    setter.call(el, !el.checked);
    el.dispatchEvent(new Event('click', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // ═══ React dropdown click (mousedown + mouseup + click) ═══
  function reactDropdownClick(el) {
    var opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  // ═══ Wait for element (Promise-based) ═══
  function waitForEl(predicate, timeout, interval) {
    timeout = timeout || 5000;
    interval = interval || 100;
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var check = function () {
        var result = typeof predicate === 'string'
          ? document.querySelector(predicate)
          : predicate();
        if (result) return resolve(result);
        if (Date.now() - start >= timeout) {
          return reject(new Error('waitForEl timeout: ' + predicate));
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  // ═══ Delay helper ═══
  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // ═══ Wait for element via MutationObserver ═══
  function waitForElObserver(selector, timeout) {
    timeout = timeout || 5000;
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      var obs = new MutationObserver(function () {
        var el = document.querySelector(selector);
        if (el) { obs.disconnect(); resolve(el); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        obs.disconnect();
        reject(new Error('Observer timeout: ' + selector));
      }, timeout);
    });
  }

  // ═══ Main async run ═══
  async function run(data) {
    console.log('[DPD] run() start, data:', data);

    // Disable Google Autocomplete
    var addrField = document.querySelector('[name="findReceiverAddress"]');
    if (addrField) addrField.setAttribute('autocomplete', 'off');

    // Step 0 — jméno
    var nameField = await waitForEl('[name="name"]', 10000);
    setNativeValue(nameField, data.name);
    await delay(200);
    if (nameField.value !== data.name) {
      setNativeValue(nameField, data.name);
    }
    console.log('[DPD] name set:', nameField.value);

    // Step 0 — expand contacts
    var rozbalit = Array.from(document.querySelectorAll('button, a, span')).find(
      function (el) { return el.textContent.trim().includes('Rozbalit'); }
    );
    if (rozbalit) {
      rozbalit.click();
      console.log('[DPD] expanded contacts');
    }

    // Step 0 — checkbox
    var hideCheckbox = await waitForEl('[name="useMarkedAddress"]', 5000);
    if (!hideCheckbox.checked) {
      reactCheckboxClick(hideCheckbox);
      console.log('[DPD] checkbox clicked');
    }

    // Wait for React to render maskAddressName after checkbox
    await delay(1000);

    // Step 1 — maskovací adresa (ArrowDown opens, mousedown+click selects)
    var maskField = await waitForEl('[name="maskAddressName"]', 10000);
    console.log('[DPD] maskAddressName found');
    var maskDropdownInput = maskField.closest('.rw-dropdown-list')
      .querySelector('.rw-dropdown-list-input');
    maskDropdownInput.focus();
    maskDropdownInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
    await delay(500);
    var maskOption = document.querySelector('.rw-list-option');
    if (maskOption) {
      maskOption.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      maskOption.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      console.log('[DPD] mask address selected');
    } else {
      console.log('[DPD] mask option not found after ArrowDown');
    }

    // Step 2 — PSČ
    await delay(1000);
    var zipField = await waitForEl('[name="zipCode"]', 5000);
    setNativeValue(zipField, data.zip);
    console.log('[DPD] zip set:', data.zip);

    // Step 3 — město + ulice + telefon + email
    await delay(1500);
    setNativeValue(document.querySelector('[name="cityName"]'), data.city);
    setNativeValue(document.querySelector('[name="streetName"]'), data.street);
    setNativeValue(document.querySelector('[name="mobileNumber"]'), data.phone);
    console.log('[DPD] city/street/phone set');

    var emailField = document.querySelector('[name="email"][data-testid="receiver-email"]');
    if (emailField && data.email) {
      emailField.focus();
      emailField.select();
      document.execCommand('insertText', false, data.email);
      console.log('[DPD] email set:', data.email);
    }

    // Step 4 — DPD Private (ArrowDown opens, find option, mousedown+click)
    await delay(2500);
    var mainDropdown = document.querySelector('[name="product.mainProductSelected"]');
    if (mainDropdown) {
      var mainDropdownInput = mainDropdown.closest('.rw-dropdown-list')
        .querySelector('.rw-dropdown-list-input');
      mainDropdownInput.focus();
      mainDropdownInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
      await delay(500);
      var dpdPrivate = Array.from(document.querySelectorAll('.rw-list-option'))
        .find(function (o) { return o.textContent.trim() === 'DPD Private'; });
      if (dpdPrivate) {
        dpdPrivate.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        dpdPrivate.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        console.log('[DPD] DPD Private selected');
      } else {
        console.log('[DPD] DPD Private not found');
      }
    }

    // Step 5 — Dobírka (ArrowDown opens, find option, mousedown+click)
    await delay(1500);
    var addDropdown = document.querySelector('[name="product.additionalProductSelected"]');
    if (addDropdown) {
      var addDropdownInput = addDropdown.closest('.rw-dropdown-list')
        .querySelector('.rw-dropdown-list-input');
      addDropdownInput.focus();
      addDropdownInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
      await delay(500);
      var dobirka = Array.from(document.querySelectorAll('.rw-list-option'))
        .find(function (o) { return o.textContent.trim() === 'Dobírka'; });
      if (dobirka) {
        dobirka.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        dobirka.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        console.log('[DPD] Dobírka selected');
      } else {
        console.log('[DPD] Dobírka not found');
      }
    }

    console.log('[DPD] All steps complete');
  }

  // ═══ Listen for data from bridge.js (ISOLATED world) ═══
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'DPD_PROFIECU_DATA') {
      console.log('[DPD] Received data from bridge');
      run(event.data.payload).catch(function (err) {
        console.error('[DPD] run() error:', err);
      });
    }
  });

  console.log('[DPD] Content script loaded (MAIN world), waiting for bridge data...');
})();
