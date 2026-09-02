// content-idoklad.js — MAIN world
// Listens for IDOKLAD_PROFIECU_DATA from the ISOLATED-world bridge and fills the
// iDoklad invoice form. Runs in MAIN world so it can bypass React's controlled
// inputs using the native property descriptor setters.

(function () {
  // ─── Helpers ───────────────────────────────────────────────────────────────

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function setNativeValue(el, value) {
    if (!el) return;
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) {
      setter.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function waitForEl(selectorOrFn, timeout) {
    timeout = timeout || 5000;
    const deadline = Date.now() + timeout;
    return new Promise(function (resolve, reject) {
      (function tick() {
        let el = null;
        try {
          el = typeof selectorOrFn === 'function'
            ? selectorOrFn()
            : document.querySelector(selectorOrFn);
        } catch (_) {}
        if (el) return resolve(el);
        if (Date.now() >= deadline) return reject(new Error('waitForEl timeout: ' + selectorOrFn));
        setTimeout(tick, 100);
      })();
    });
  }

  function waitForElObserver(selector, timeout) {
    timeout = timeout || 5000;
    return new Promise(function (resolve, reject) {
      const existing = document.querySelector(selector);
      if (existing) return resolve(existing);
      const observer = new MutationObserver(function () {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () {
        observer.disconnect();
        reject(new Error('waitForElObserver timeout: ' + selector));
      }, timeout);
    });
  }

  function fireMouseEvent(el, type) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    el.dispatchEvent(new PointerEvent(type.replace('mouse', 'pointer'), {
      bubbles: true, cancelable: true, clientX: x, clientY: y,
      pointerType: 'mouse', button: 0,
    }));
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
    }));
  }

  async function trulyOpenDropdown(el) {
    if (!el) return;
    el.focus();
    fireMouseEvent(el, 'mousedown');
    await delay(30);
    fireMouseEvent(el, 'mouseup');
    fireMouseEvent(el, 'click');
  }

  async function trulyClickOption(el) {
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    fireMouseEvent(el, 'mouseover');
    await delay(20);
    fireMouseEvent(el, 'mousedown');
    await delay(20);
    fireMouseEvent(el, 'mouseup');
    fireMouseEvent(el, 'click');
  }

  // ─── Workflow ──────────────────────────────────────────────────────────────

  async function fillInvoice(payload) {
    try {
      console.log('[iDoklad] Starting autofill with payload', payload);

      // Step 1: Select "CAR ELE" template
      await delay(500);
      const tmplDropdown = document.querySelector('[data-ui-id="csw-template"]');
      if (!tmplDropdown) {
        console.warn('[iDoklad] Template dropdown not found, skipping step 1');
      } else {
        console.log('[iDoklad] Step 1a: opening template dropdown');
        await trulyOpenDropdown(tmplDropdown);
        await waitForElObserver('.k-list-item', 3000).catch(function () {});
        const items = Array.from(document.querySelectorAll('.k-list-item'));
        const carEle = items.find(function (el) {
          return el.textContent.trim() === 'CAR ELE';
        });
        if (carEle) {
          console.log('[iDoklad] Step 1b: clicking CAR ELE');
          await trulyClickOption(carEle);
          await delay(800);
        } else {
          console.warn('[iDoklad] CAR ELE option not found');
        }
      }

      // Step 2: Partner — ICO branch or manual popup
      if (payload.ico && String(payload.ico).trim() !== '') {
        console.log('[iDoklad] Step 2A: ICO branch with', payload.ico);
        try {
          const odb = await waitForEl('input[placeholder*="Vyhledat v adresáři"]', 5000);
          setNativeValue(odb, String(payload.ico).trim());
          await delay(1000); // ARES lookup
          const navrh = await waitForEl(function () {
            return document.querySelector('.k-list-item');
          }, 4000);
          await trulyClickOption(navrh);
          await delay(800);
          console.log('[iDoklad] Step 2A done');
        } catch (err) {
          console.error('[iDoklad] Step 2A failed:', err.message);
        }
      } else {
        console.log('[iDoklad] Step 2B: manual popup branch');
        try {
          const plus = document.querySelector('[data-ui-id="csw-create-new-partner"]');
          if (!plus) throw new Error('create-new-partner button not found');
          plus.click();
          await waitForEl('input[name="CompanyName"]', 3000);
          setNativeValue(document.querySelector('input[name="CompanyName"]'), payload.name || '');
          setNativeValue(document.querySelector('input[name="Street"]'), payload.street || '');
          setNativeValue(document.querySelector('input[name="PostalCode"]'), payload.zip || '');
          setNativeValue(document.querySelector('input[name="City"]'), payload.city || '');
          await delay(300);
          const confirm = document.querySelector('[data-ui-id="csw-dialog-confirm"]');
          if (confirm) {
            confirm.click();
          } else {
            console.warn('[iDoklad] Dialog confirm button not found');
          }
          await delay(800);
          console.log('[iDoklad] Step 2B done');
        } catch (err) {
          console.error('[iDoklad] Step 2B failed:', err.message);
        }
      }

      // Step 3: Description + item name
      try {
        const popisText = 'Výrobní číslo produktu: ' + (payload.sn || '');
        const descEl = document.querySelector('textarea[name="Description"]');
        const itemNameEl = document.querySelector('input[name="Items[0].Name"]');
        if (descEl) setNativeValue(descEl, popisText);
        if (itemNameEl) setNativeValue(itemNameEl, popisText);
        console.log('[iDoklad] Step 3: description & item name filled');
      } catch (err) {
        console.error('[iDoklad] Step 3 failed:', err.message);
      }

      // Step 4: Price
      try {
        const priceEl = document.querySelector('input[name="Items[0].Price"]');
        if (priceEl) {
          setNativeValue(priceEl, String(payload.price != null ? payload.price : ''));
          console.log('[iDoklad] Step 4: price filled =', payload.price);
        } else {
          console.warn('[iDoklad] Price input not found');
        }
      } catch (err) {
        console.error('[iDoklad] Step 4 failed:', err.message);
      }

      // Step 5: STOP — user reviews & saves manually
      console.log('[iDoklad] All fields filled, waiting for manual review and Save click');
    } catch (err) {
      console.error('[iDoklad] Autofill fatal error:', err);
    }
  }

  // ─── Message listener ──────────────────────────────────────────────────────

  window.addEventListener('message', function (ev) {
    if (!ev || !ev.data || ev.data.type !== 'IDOKLAD_PROFIECU_DATA') return;
    if (ev.source !== window) return;
    const payload = ev.data.payload;
    if (!payload) {
      console.warn('[iDoklad] Received empty payload');
      return;
    }
    fillInvoice(payload);
  });

  console.log('[iDoklad] Content script loaded in MAIN world, waiting for payload');
})();
