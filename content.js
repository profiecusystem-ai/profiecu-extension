// content.js — MAIN world — DPD Shipping new-single-page (DPD 1.118.9+)
// Has access to page's JS context (React internals, native prototypes)

(function () {
  'use strict';

  // ═══ Native value setter — works with React controlled inputs ═══
  var nativeInputSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;

  function setNativeValue(el, value) {
    if (!el) return false;
    el.focus();
    nativeInputSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    return true;
  }

  function reactCheckboxClick(el) {
    if (!el || el.checked) return;
    var setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'checked'
    ).set;
    setter.call(el, true);
    el.dispatchEvent(new Event('click', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function delay(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function waitForEl(predicate, timeout, interval) {
    timeout = timeout || 10000;
    interval = interval || 200;
    return new Promise(function (resolve, reject) {
      var start = Date.now();
      var check = function () {
        var result = typeof predicate === 'string'
          ? document.querySelector(predicate)
          : predicate();
        if (result) return resolve(result);
        if (Date.now() - start >= timeout) {
          return reject(new Error('waitForEl timeout: ' + (predicate.toString().slice(0, 80))));
        }
        setTimeout(check, interval);
      };
      check();
    });
  }

  // ═══ Najdi react-select input podle textu labelu uvnitř kontejneru ═══
  function findReactSelectInputByLabel(labelText) {
    var labels = Array.from(document.querySelectorAll('label, [class*="label"]'));
    var lbl = labels.find(function (l) {
      var t = (l.textContent || '').trim();
      return t === labelText || t.indexOf(labelText) === 0;
    });
    if (!lbl) return null;
    var walk = lbl;
    for (var i = 0; i < 12; i++) {
      walk = walk.parentElement;
      if (!walk) break;
      var input = walk.querySelector('input[role="combobox"][id^="react-select"]');
      if (input) return input;
    }
    return null;
  }

  // ═══ Otevři react-select dropdown přes klávesnici (spolehlivější než klik) ═══
  async function openReactSelect(input) {
    input.scrollIntoView({ block: 'center', behavior: 'instant' });
    await delay(150);
    input.focus();
    // ArrowDown spolehlivě otevře react-select menu
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40,
      bubbles: true, cancelable: true, composed: true
    }));
    await delay(400);
  }

  // ═══ Klikni na option element (sdílená logika) ═══
  function clickOptionElement(option) {
    option.scrollIntoView({ block: 'nearest' });
    var rect = option.getBoundingClientRect();
    var coords = {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true, cancelable: true, composed: true,
      button: 0, view: window
    };
    option.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ pointerType: 'mouse', buttons: 1 }, coords)));
    option.dispatchEvent(new MouseEvent('mousedown', Object.assign({ buttons: 1 }, coords)));
    option.dispatchEvent(new PointerEvent('pointerup', Object.assign({ pointerType: 'mouse' }, coords)));
    option.dispatchEvent(new MouseEvent('mouseup', coords));
    option.dispatchEvent(new MouseEvent('click', coords));
  }

  // ═══ Vyber option podle viditelného textu ═══
  async function pickOption(input, optionText) {
    var inputIdPrefix = input.id.replace('-input', '');
    var optionSelectorPrefix = '[id^="' + inputIdPrefix + '-option-"]';
    var option = await waitForEl(function () {
      return Array.from(document.querySelectorAll(optionSelectorPrefix))
        .find(function (o) { return (o.textContent || '').trim() === optionText; });
    }, 5000);
    clickOptionElement(option);
  }

  // ═══ Vyber první (option-0) z react-select bez ohledu na text ═══
  async function pickFirstOption(input) {
    var inputIdPrefix = input.id.replace('-input', '');
    var option = await waitForEl(function () {
      return document.getElementById(inputIdPrefix + '-option-0');
    }, 5000);
    clickOptionElement(option);
  }

  // ═══ Napiš text do react-select inputu (postupně, aby filtroval) ═══
  async function typeIntoReactSelect(input, text) {
    input.focus();
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      // react-select reaguje na input event s nativeInputSetter
      nativeInputSetter.call(input, (input.value || '') + ch);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await delay(40);
    }
    await delay(200);
  }

  // ═══ Najdi country react-select PRO PŘÍJEMCE ═══
  // DPD Shipping 1.118.9 používá deterministický ID:
  //   react-select-receiver.countryCode-input  (potvrzeno v Playwrightu)
  // Pokud DPD ID v budoucnu změní, máme label-based fallback.
  function findReceiverCountrySelect() {
    // Primary: deterministický ID
    var input = document.querySelector('[id="react-select-receiver.countryCode-input"]');
    if (input) {
      console.log('[DPD] country select found via deterministic ID');
      return input;
    }
    // Fallback: hledej v sekci s [name="receiver.name"]
    console.log('[DPD] deterministic ID not found, trying label-based fallback');
    var labelCandidates = ['Země', 'Stát', 'Country', 'Země doručení', 'Země příjemce'];
    var labels = Array.from(document.querySelectorAll('label, [class*="label"]'));
    var matchingLabels = labels.filter(function (l) {
      var t = (l.textContent || '').trim();
      return labelCandidates.some(function (c) { return t === c || t.indexOf(c) === 0; });
    });
    for (var i = 0; i < matchingLabels.length; i++) {
      var lbl = matchingLabels[i];
      var walk = lbl;
      for (var k = 0; k < 12; k++) {
        walk = walk.parentElement;
        if (!walk) break;
        var rs = walk.querySelector('input[role="combobox"][id^="react-select"]');
        if (rs && rs.id.indexOf('receiver') !== -1) return rs;
      }
    }
    return null;
  }

  // ═══ Vyber Slovensko z react-select dropdown ═══
  async function selectSkCountry(countryInput) {
    await openReactSelect(countryInput);

    // Try 1: type "slo" pro filtrování → vyber první výsledek
    await typeIntoReactSelect(countryInput, 'slo');

    var inputIdPrefix = countryInput.id.replace('-input', '');
    var optionSelector = '[id^="' + inputIdPrefix + '-option-"]';

    // Hledej option s textem obsahujícím "Slovens" (covers Slovensko + Slovenská republika)
    var matchOption = null;
    try {
      matchOption = await waitForEl(function () {
        return Array.from(document.querySelectorAll(optionSelector))
          .find(function (o) {
            var t = (o.textContent || '').trim().toLowerCase();
            return t.indexOf('slovens') === 0 || t.indexOf('slovak') === 0;
          });
      }, 2500);
      console.log('[DPD] country: found Slovensko option:', (matchOption.textContent || '').trim());
    } catch (_) {
      console.log('[DPD] country: no Slovensko option after type "slo", falling back to first option');
      matchOption = document.getElementById(inputIdPrefix + '-option-0');
    }

    if (matchOption) {
      clickOptionElement(matchOption);
      return true;
    }
    console.log('[DPD] country: no option to click');
    return false;
  }

  // ═══ Strip mezinárodní předvolby z telefonu (defense in depth) ═══
  // Frontend by měl posílat telefon už bez prefixu, ale jistota je jistota.
  function stripPhonePrefix(phone) {
    if (!phone) return '';
    var digits = String(phone).replace(/[\s\-.()]/g, '');
    digits = digits.replace(/^\+?(00)?42[01]/, '');
    digits = digits.replace(/^\+/, '');
    return digits;
  }

  // ═══ "Ulice 123" → { street: "Ulice", houseNo: "123" } ═══
  function splitStreet(combined) {
    if (!combined) return { street: '', houseNo: '' };
    var m = combined.match(/^(.*?)\s+(\d+[a-zA-Z]?(?:[\/\-]\d+[a-zA-Z]?)?)\s*$/);
    if (m) return { street: m[1].trim(), houseNo: m[2].trim() };
    return { street: combined.trim(), houseNo: '' };
  }

  // ═══ Main run ═══
  async function run(data) {
    console.log('[DPD] run() start (v2.11 — deterministic country selector), data:', data);

    // Step 1 — jméno příjemce
    var nameField = await waitForEl('[name="receiver.name"]', 15000);
    setNativeValue(nameField, data.name || '');
    console.log('[DPD] name set:', nameField.value);

    // Step 1b — disable Google autocomplete na "Vyhledat adresu pomocí Googlu"
    var findAddr = document.querySelector('[name="receiver.findReceiverAddress"]');
    if (findAddr) findAddr.setAttribute('autocomplete', 'off');

    // Step 1c — ZEMĚ (PŘED PSČ/městem/ulicí/telefonem)
    //
    // PRO SK objednávky musíme přepnout zemi JAKO PRVNÍ KROK, jinak:
    //  - DPD validuje PSČ/město podle defaultní země (CZ)
    //  - Měna dobírky zůstává v Kč (chceme EUR pro SK)
    //  - Telefonní předvolba se nedoplní automaticky
    //
    // Flow: najdi country react-select PRO PŘÍJEMCE (ne odesílatele)
    //       → otevři → napiš "slo" → klikni na option obsahující "Slovens"
    //       Fallback: pokud find by-label selže, zkusit znovu po krátkém delay.
    if (data.country === 'SK') {
      console.log('[DPD] country=SK → switching country dropdown FIRST');
      var countryInput = null;
      try {
        countryInput = await waitForEl(findReceiverCountrySelect, 8000);
        console.log('[DPD] country input id=' + countryInput.id);
      } catch (e) {
        console.log('[DPD] country react-select NOT FOUND in 8s. Dumping all react-select inputs:');
        var allRs = Array.from(document.querySelectorAll('input[role="combobox"][id^="react-select"]'));
        allRs.forEach(function (rs, idx) {
          var siblingText = '';
          var w = rs;
          for (var s = 0; s < 8; s++) {
            w = w.parentElement;
            if (!w) break;
            var l = w.querySelector('label, [class*="label"]');
            if (l) { siblingText = (l.textContent || '').trim().slice(0, 60); break; }
          }
          console.log('  [' + idx + '] id=' + rs.id + ' nearestLabel="' + siblingText + '"');
        });
      }

      if (countryInput) {
        try {
          var ok = await selectSkCountry(countryInput);
          if (ok) {
            console.log('[DPD] country: Slovensko vybráno');
          } else {
            console.warn('[DPD] country: selectSkCountry vrátil false');
          }
          await delay(800);
        } catch (e) {
          console.warn('[DPD] country selection error: ' + e.message);
        }
      }
    }

    // Step 2 — Maskování adresy svozu a odesílatele
    //   (zaškrtnout checkbox + vybrat první možnost z "Maskované jméno" dropdownu)
    try {
      var maskCb = document.querySelector('[name="maskedAddress.applyMaskedAddress"]');
      if (maskCb && !maskCb.checked) {
        reactCheckboxClick(maskCb);
        console.log('[DPD] mask checkbox checked');
      }
      var maskInput = await waitForEl(function () {
        return findReactSelectInputByLabel('Maskované jméno');
      }, 5000);
      await openReactSelect(maskInput);
      await pickFirstOption(maskInput);
      console.log('[DPD] mask address: first option selected');
    } catch (e) {
      console.log('[DPD] mask address step skipped:', e.message);
    }

    // Step 3 — PSČ (spustí načítání zón/služeb)
    await delay(250);
    var zip = document.querySelector('[name="receiver.zipCode"]');
    if (zip) setNativeValue(zip, data.zip || '');

    // Step 4 — město
    await delay(300);
    var city = document.querySelector('[name="receiver.cityName"]');
    if (city) setNativeValue(city, data.city || '');

    // Step 5 — ulice + číslo domu (split z combined "Ulice 123")
    var parts = data.houseNo
      ? { street: data.street || '', houseNo: data.houseNo }
      : splitStreet(data.street || '');
    var streetEl = document.querySelector('[name="receiver.streetName"]');
    if (streetEl) setNativeValue(streetEl, parts.street);
    var houseEl = document.querySelector('[name="receiver.houseNo"]');
    if (houseEl) setNativeValue(houseEl, parts.houseNo);

    // Step 6 — mobil + email
    // Telefon: defensive strip prefixu (+420/+421) — DPD si doplní podle země.
    var mobile = document.querySelector('[name="receiver.mobileNumber"]');
    if (mobile && data.phone) setNativeValue(mobile, stripPhonePrefix(data.phone));
    var email = document.querySelector('[name="receiver.email"]');
    if (email && data.email) setNativeValue(email, data.email);
    console.log('[DPD] basic fields filled');

    // Step 7 — Hlavní služba: DPD Private
    await delay(2000);
    try {
      var mainServiceInput = await waitForEl(function () {
        return findReactSelectInputByLabel('Vyberte službu');
      }, 10000);
      await openReactSelect(mainServiceInput);
      await pickOption(mainServiceInput, 'DPD Private');
      console.log('[DPD] DPD Private selected');
    } catch (e) {
      console.log('[DPD] main service select failed:', e.message);
    }

    // Step 8 — Doplňková služba: Dobírka
    await delay(800);
    try {
      var addServiceInput = await waitForEl(function () {
        return findReactSelectInputByLabel('Doplňkové služby');
      }, 10000);
      await openReactSelect(addServiceInput);
      await pickOption(addServiceInput, 'Dobírka');
      console.log('[DPD] Dobírka selected');
    } catch (e) {
      console.log('[DPD] additional service select failed:', e.message);
    }

    // Step 9 — Částka dobírky (mirroruje se do parcels.parcelList.0.codAmount)
    if (data.amount) {
      await delay(800);
      try {
        var codAmount = await waitForEl('[name="services.additionalServices.cod.amount"]', 5000);
        setNativeValue(codAmount, String(data.amount));
        console.log('[DPD] COD amount set:', data.amount);
      } catch (e) {
        console.log('[DPD] COD amount field not found:', e.message);
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

  console.log('[DPD] Content script loaded v2.11 (MAIN world), waiting for bridge data...');
})();
