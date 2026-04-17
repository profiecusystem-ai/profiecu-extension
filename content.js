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

  // ═══ Truly open dropdown — full pointer event sequence with coordinates ═══
  function trulyOpenDropdown(dropdownInput) {
    return new Promise(function (resolve) {
      dropdownInput.scrollIntoView({ block: 'center', behavior: 'instant' });
      setTimeout(function () {
        var rect = dropdownInput.getBoundingClientRect();
        function fireEvent(type, EventCtor) {
          EventCtor = EventCtor || MouseEvent;
          var evt = new EventCtor(type, {
            bubbles: true, cancelable: true, composed: true,
            view: window, button: 0, buttons: 1,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            pointerType: 'mouse'
          });
          dropdownInput.dispatchEvent(evt);
        }
        dropdownInput.focus();
        fireEvent('pointerdown', PointerEvent);
        fireEvent('mousedown');
        fireEvent('pointerup', PointerEvent);
        fireEvent('mouseup');
        fireEvent('click');
        resolve();
      }, 50);
    });
  }

  // ═══ Truly click option — full pointer event sequence with coordinates ═══
  function trulyClickOption(option) {
    return new Promise(function (resolve) {
      option.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      setTimeout(function () {
        var rect = option.getBoundingClientRect();
        function fireEvent(type, EventCtor) {
          EventCtor = EventCtor || MouseEvent;
          option.dispatchEvent(new EventCtor(type, {
            bubbles: true, cancelable: true, composed: true,
            view: window, button: 0, buttons: 1,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
            pointerType: 'mouse'
          }));
        }
        fireEvent('pointerdown', PointerEvent);
        fireEvent('mousedown');
        fireEvent('pointerup', PointerEvent);
        fireEvent('mouseup');
        fireEvent('click');
        resolve();
      }, 50);
    });
  }

  // ═══ Wait for element (Promise-based polling) ═══
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
        reject(new Error('observer timeout: ' + selector));
      }, timeout);
    });
  }

  // ═══ Delay helper ═══
  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
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

    // Step 1 — maskovací adresa
    var maskField = await waitForEl('[name="maskAddressName"]', 10000);
    console.log('[DPD] maskAddressName found');
    var maskDropdownInput = maskField.closest('.rw-dropdown-list')
      .querySelector('.rw-dropdown-list-input');
    await trulyOpenDropdown(maskDropdownInput);
    console.log('[DPD] mask dropdown opened');
    var maskOption = await waitForElObserver('.rw-list-option', 5000);
    console.log('[DPD] mask option appeared');
    await trulyClickOption(maskOption);
    console.log('[DPD] mask selected:', maskField.value);

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

    // Step 4 — DPD Private
    await delay(2500);
    var mainDropdown = document.querySelector('[name="product.mainProductSelected"]');
    if (mainDropdown) {
      var mainDropdownInput = mainDropdown.closest('.rw-dropdown-list')
        .querySelector('.rw-dropdown-list-input');
      await trulyOpenDropdown(mainDropdownInput);
      console.log('[DPD] main product dropdown opened');
      try {
        var dpdPrivate = await waitForEl(function () {
          return Array.from(document.querySelectorAll('.rw-list-option'))
            .find(function (o) { return o.textContent.trim() === 'DPD Private'; });
        }, 5000);
        await trulyClickOption(dpdPrivate);
        console.log('[DPD] DPD Private selected');
      } catch (e) {
        console.log('[DPD] DPD Private not found:', e.message);
      }
    }

    // Step 5 — Dobírka
    await delay(1500);
    var addDropdown = document.querySelector('[name="product.additionalProductSelected"]');
    if (addDropdown) {
      var addDropdownInput = addDropdown.closest('.rw-dropdown-list')
        .querySelector('.rw-dropdown-list-input');
      await trulyOpenDropdown(addDropdownInput);
      console.log('[DPD] additional services dropdown opened');
      try {
        var dobirka = await waitForEl(function () {
          return Array.from(document.querySelectorAll('.rw-list-option'))
            .find(function (o) { return o.textContent.trim() === 'Dobírka'; });
        }, 5000);
        if (dobirka) {
          await trulyClickOption(dobirka);
          console.log('[DPD] Dobírka selected');
        }
      } catch (e) {
        console.log('[DPD] Dobírka not found:', e.message);
      }
    }

    // Step 5b — zaškrtni Dobírku přes label click
    await delay(500);
    var allLabels = document.querySelectorAll('label');
    var dobirkaLabel = null;

    // Try index 43 first
    if (allLabels[43] && allLabels[43].textContent.trim() === 'Dobírka') {
      dobirkaLabel = allLabels[43];
    } else {
      // Fallback — find by text
      dobirkaLabel = Array.from(allLabels).find(function (l) {
        return l.textContent.trim() === 'Dobírka';
      });
    }

    if (dobirkaLabel) {
      var labelRect = dobirkaLabel.getBoundingClientRect();
      dobirkaLabel.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: labelRect.left + labelRect.width / 2,
        clientY: labelRect.top + labelRect.height / 2
      }));
      dobirkaLabel.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true,
        clientX: labelRect.left + labelRect.width / 2,
        clientY: labelRect.top + labelRect.height / 2
      }));
      console.log('[DPD] Dobírka checkbox clicked');
    }

    // Step 6 — částka dobírky
    await delay(1000);
    var amountField = document.querySelector('[name*="AMOUNT"][name*="additionProducts"]');
    if (amountField && data.amount) {
      amountField.focus();
      amountField.select();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, data.amount);
      console.log('[DPD] amount set:', data.amount);
    } else {
      console.log('[DPD] amount field not found or no amount data');
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
