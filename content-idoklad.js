// content-idoklad.js — MAIN world
// Listens for IDOKLAD_PROFIECU_DATA from the ISOLATED-world bridge and fills the
// iDoklad invoice form. Runs in MAIN world so it can bypass React's controlled
// inputs using the native property descriptor setters.
//
// 22. 9. 2026: rozšíření se ukázalo, že v profilu, kde běžela předchozí ladění,
// vůbec nebylo nainstalované — jakmile bylo doinstalováno, DPD autofill fungoval
// napoprvé, ale tenhle iDoklad skript ne. Živě ověřeno (data-ui-id i name atributy
// v aktuálním DOM existují přesně tak, jak je skript hledá), takže nešlo o
// bit-rot selektorů, ale o závod: první jednorázový querySelector po startu
// skriptu narazil na formulář, který ještě SPA nestihlo vykreslit. Všechny čtyři
// úvodní vyhledávání (šablona, tlačítko nového odběratele, popis/název položky,
// cena) teď čekají přes waitForEl místo jednoho pokusu.

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

      // Step 1: Select the invoice template
      // Formulář se vykresluje asynchronně (SPA) — jednorázový querySelector hned
      // po startu skriptu často narazí na prázdný DOM. waitForEl počká, než se
      // prvek objeví, místo aby to vzdal na první pokus.
      //
      // 22. 9. 2026: šablona "CAR ELE" (stav z dubna) v účtu už neexistuje —
      // živě ověřeno, že dropdown teď nabízí jen "Bez šablony" (výchozí
      // placeholder) a jednu skutečnou šablonu jménem "PROFIECU.CZ". Napevno
      // zadané jméno je křehké (příští přejmenování by tenhle krok zase potichu
      // shodilo) — místo přesné shody bere skript první položku, která NENÍ
      // "Bez šablony". Funguje to, dokud je v účtu jen jedna reálná šablona.
      const tmplDropdown = await waitForEl('[data-ui-id="csw-template"]', 6000).catch(function () { return null; });
      if (!tmplDropdown) {
        console.warn('[iDoklad] Template dropdown not found, skipping step 1');
      } else {
        // 22. 9. 2026, 3. kolo: existence uzlu [data-ui-id="csw-template"] jen
        // znamená, že React ho vykreslil — Kendo si na něj ještě může navěsit
        // click handler o zlomek sekundy později. Jeden pokus o otevření pak
        // dopadne na "úspěšně" (žádná JS chyba), ale seznam se nikdy neobjeví,
        // waitForElObserver vyprší, krok se tiše přeskočí a formulář se stejně
        // doplní dál (přesně to uživatel hlásil: vyplní se, šablona neklikne).
        // Živě ověřeno mimo rozšíření fungovalo, protože tam už byl widget
        // dávno hydratovaný. Oprava: až 3 pokusy s rostoucí prodlevou místo
        // jednoho — první neúspěšný klik nic nerozbije, jen se zopakuje.
        let realTemplate = null;
        for (let attempt = 1; attempt <= 3 && !realTemplate; attempt++) {
          console.log('[iDoklad] Step 1a: opening template dropdown, attempt', attempt);
          await trulyOpenDropdown(tmplDropdown);
          realTemplate = await waitForElObserver('.k-list-item', 1500)
            .then(function () {
              const items = Array.from(document.querySelectorAll('.k-list-item'));
              return items.find(function (el) {
                const text = el.textContent.trim();
                return text !== '' && text !== 'Bez šablony';
              }) || null;
            })
            .catch(function () { return null; });
          if (!realTemplate) {
            console.warn('[iDoklad] Step 1a attempt ' + attempt + ': list did not open, retrying');
            await delay(400 * attempt);
          }
        }
        if (realTemplate) {
          console.log('[iDoklad] Step 1b: clicking template', realTemplate.textContent.trim());
          await trulyClickOption(realTemplate);
          await delay(800);
        } else {
          console.warn('[iDoklad] No real template option found after 3 attempts (only "Bez šablony"?)');
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
          const plus = await waitForEl('[data-ui-id="csw-create-new-partner"]', 6000).catch(function () { return null; });
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
        const descEl = await waitForEl('textarea[name="Description"]', 6000).catch(function () { return null; });
        const itemNameEl = await waitForEl('input[name="Items[0].Name"]', 6000).catch(function () { return null; });
        if (descEl) setNativeValue(descEl, popisText);
        if (itemNameEl) setNativeValue(itemNameEl, popisText);
        if (descEl || itemNameEl) {
          console.log('[iDoklad] Step 3: description & item name filled');
        } else {
          console.warn('[iDoklad] Step 3: neither description nor item name field found');
        }
      } catch (err) {
        console.error('[iDoklad] Step 3 failed:', err.message);
      }

      // Step 4: Price
      try {
        const priceEl = await waitForEl('input[name="Items[0].Price"]', 6000).catch(function () { return null; });
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
