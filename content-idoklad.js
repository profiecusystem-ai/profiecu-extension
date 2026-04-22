// content-idoklad.js — MAIN world
// Has access to page's JS context (React internals, native prototypes)

(function () {
  'use strict';

  // ═══ Native value setter — works with React controlled inputs ═══
  var nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  var nativeTextareaSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  ).set;

  function setNativeValue(el, value) {
    if (!el) return;
    el.focus();
    var setter = el instanceof HTMLTextAreaElement
      ? nativeTextareaSetter
      : nativeInputSetter;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
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
    console.log('[iDoklad] run() start, data:', data);

    // Step 1 — wait for Kendo init, then open template dropdown & pick CAR ELE
    await delay(500);
    try {
      var tmplDropdown = await waitForEl('[data-ui-id="csw-template"]', 5000);
      console.log('[iDoklad] Step 1a: opening template dropdown');
      await trulyOpenDropdown(tmplDropdown);

      await waitForElObserver('.k-list-item', 3000);
      var carEle = Array.from(document.querySelectorAll('.k-list-item'))
        .find(function (el) { return el.textContent.trim() === 'CAR ELE'; });

      if (carEle) {
        console.log('[iDoklad] Step 1b: clicking CAR ELE');
        await trulyClickOption(carEle);
        await delay(800);
      } else {
        console.warn('[iDoklad] CAR ELE option not found');
      }
    } catch (e) {
      console.warn('[iDoklad] Step 1 failed:', e.message);
    }

    // Step 2 — Partner: ICO branch (ARES) or manual popup
    if (data.ico && String(data.ico).trim() !== '') {
      console.log('[iDoklad] Step 2A: ICO branch with', data.ico);
      try {
        var odb = await waitForEl('input[placeholder*="Vyhledat v adresáři"]', 5000);
        setNativeValue(odb, String(data.ico).trim());
        await delay(1000); // ARES lookup
        var navrh = await waitForEl(function () {
          return document.querySelector('.k-list-item');
        }, 4000);
        await trulyClickOption(navrh);
        await delay(800);
        console.log('[iDoklad] Step 2A done');
      } catch (e) {
        console.error('[iDoklad] Step 2A failed:', e.message);
      }
    } else {
      console.log('[iDoklad] Step 2B: manual popup branch');
      try {
        var plus = document.querySelector('[data-ui-id="csw-create-new-partner"]');
        if (!plus) throw new Error('create-new-partner button not found');
        plus.click();
        await waitForEl('input[name="CompanyName"]', 3000);
        setNativeValue(document.querySelector('input[name="CompanyName"]'), data.name || '');
        setNativeValue(document.querySelector('input[name="Street"]'), data.street || '');
        setNativeValue(document.querySelector('input[name="PostalCode"]'), data.zip || '');
        setNativeValue(document.querySelector('input[name="City"]'), data.city || '');
        await delay(300);
        var confirm = document.querySelector('[data-ui-id="csw-dialog-confirm"]');
        if (confirm) {
          confirm.click();
        } else {
          console.warn('[iDoklad] Dialog confirm button not found');
        }
        await delay(800);
        console.log('[iDoklad] Step 2B done');
      } catch (e) {
        console.error('[iDoklad] Step 2B failed:', e.message);
      }
    }

    // Step 3 — Description + item name
    try {
      var popisText = 'Výrobní číslo produktu: ' + (data.sn || '');
      var descEl = document.querySelector('textarea[name="Description"]');
      var itemNameEl = document.querySelector('input[name="Items[0].Name"]');
      if (descEl) setNativeValue(descEl, popisText);
      if (itemNameEl) setNativeValue(itemNameEl, popisText);
      console.log('[iDoklad] Step 3: description & item name filled');
    } catch (e) {
      console.error('[iDoklad] Step 3 failed:', e.message);
    }

    // Step 4 — Price
    try {
      var priceEl = document.querySelector('input[name="Items[0].Price"]');
      if (priceEl) {
        setNativeValue(priceEl, String(data.price != null ? data.price : ''));
        console.log('[iDoklad] Step 4: price filled =', data.price);
      } else {
        console.warn('[iDoklad] Price input not found');
      }
    } catch (e) {
      console.error('[iDoklad] Step 4 failed:', e.message);
    }

    // Step 5 — STOP (manual review & save)
    console.log('[iDoklad] All fields filled, waiting for manual review and Save click');
  }

  // ═══ Listen for data from bridge-idoklad.js (ISOLATED world) ═══
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'IDOKLAD_PROFIECU_DATA') {
      console.log('[iDoklad] Received data from bridge');
      run(event.data.payload).catch(function (err) {
        console.error('[iDoklad] run() error:', err);
      });
    }
  });

  console.log('[iDoklad] Content script loaded (MAIN world), waiting for bridge data...');
})();
