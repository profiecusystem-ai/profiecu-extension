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

  // ═══ Open rw-dropdown by label text, click option by text ═══
  function openDropdownByLabel(labelText, optionText, callback) {
    var label = Array.from(document.querySelectorAll('label')).find(
      function (el) { return el.textContent.trim() === labelText; }
    );
    var container = label && label.closest('.rw-dropdown-list');
    var input = container && container.querySelector('.rw-dropdown-list-input');
    if (input) {
      input.click();
      console.log('[DPD] Opened dropdown:', labelText);
    } else {
      console.log('[DPD] Dropdown NOT found:', labelText);
      if (callback) callback(false);
      return;
    }
    setTimeout(function () {
      var options = document.querySelectorAll('.rw-list-option');
      var found = false;
      for (var i = 0; i < options.length; i++) {
        if (options[i].textContent.trim() === optionText) {
          options[i].click();
          found = true;
          console.log('[DPD] Selected:', optionText);
          break;
        }
      }
      if (!found) {
        // Partial match fallback
        for (var j = 0; j < options.length; j++) {
          if (options[j].textContent.includes(optionText)) {
            options[j].click();
            found = true;
            console.log('[DPD] Selected (partial):', options[j].textContent.trim());
            break;
          }
        }
      }
      if (!found) {
        console.log('[DPD] Option NOT found:', optionText, 'in', options.length, 'options');
      }
      if (callback) callback(found);
    }, 500);
  }

  // ═══ Wait for element to appear in DOM ═══
  function waitFor(selector, timeout, cb) {
    var start = Date.now();
    var check = function () {
      var el = document.querySelector(selector);
      if (el) return cb(el);
      if (Date.now() - start > timeout) {
        console.log('[DPD] waitFor timeout:', selector);
        return;
      }
      setTimeout(check, 300);
    };
    check();
  }

  // ═══ Fill form with data ═══
  function fillForm(data) {
    console.log('[DPD] fillForm() — MAIN world, data:', data);

    // Disable Google Autocomplete
    var addrField = document.querySelector('[name="findReceiverAddress"]');
    if (addrField) addrField.setAttribute('autocomplete', 'off');

    // ═══ STEP 0 (0ms): Name + hide sender address + expand contacts ═══
    var nameField = document.querySelector('[name="receiverName"]');
    if (nameField) {
      setNativeValue(nameField, data.name);
      console.log('[DPD] Step 0: name =', data.name);
    }

    var hideCheckbox = document.querySelector('[name="useMarkedAddress"]');
    if (hideCheckbox && !hideCheckbox.checked) {
      hideCheckbox.click();
      console.log('[DPD] Step 0: hide address checked');
    }

    // Expand contact details
    var rozbalit = Array.from(document.querySelectorAll('button, a, span')).find(
      function (el) { return el.textContent.trim().includes('Rozbalit'); }
    );
    if (rozbalit) {
      rozbalit.click();
      console.log('[DPD] Step 0: expanded contacts');
    }

    // ═══ STEP 1 (600ms): Maskovací jméno dropdown → first option ═══
    setTimeout(function () {
      openDropdownByLabel('Maskovací jméno', '', function () {
        // Select first option regardless of text
        var options = document.querySelectorAll('.rw-list-option');
        if (options.length > 0) {
          options[0].click();
          console.log('[DPD] Step 1: mask =', options[0].textContent.trim());
        }
      });
    }, 600);

    // ═══ STEP 2 (2000ms): ZIP code ═══
    setTimeout(function () {
      var zipField = document.querySelector('[name="zipCode"]');
      setNativeValue(zipField, data.zip);
      console.log('[DPD] Step 2: zip =', data.zip);
    }, 2000);

    // ═══ STEP 3 (3500ms): City + Street + Phone + Email ═══
    setTimeout(function () {
      setNativeValue(document.querySelector('[name="cityName"]'), data.city);
      setNativeValue(document.querySelector('[name="streetName"]'), data.street);
      setNativeValue(document.querySelector('[name="mobileNumber"]'), data.phone);
      console.log('[DPD] Step 3: city/street/phone done');

      // Email — receiver field
      var emailField = document.querySelector('[name="email"][data-testid="receiver-email"]');
      if (emailField && data.email) {
        emailField.focus();
        emailField.select();
        document.execCommand('insertText', false, data.email);
        console.log('[DPD] Step 3: email =', data.email);
      } else {
        console.log('[DPD] Step 3: email field not ready, will retry');
        // Retry after 1s
        setTimeout(function () {
          var el = document.querySelector('[name="email"][data-testid="receiver-email"]');
          if (el && data.email) {
            el.focus();
            el.select();
            document.execCommand('insertText', false, data.email);
            console.log('[DPD] Step 3b: email =', data.email);
          }
        }, 1000);
      }
    }, 3500);

    // ═══ STEP 4 (6000ms): DPD Private ═══
    setTimeout(function () {
      openDropdownByLabel('Hlavní produkt', 'DPD Private', function (found) {
        if (!found) {
          // Fallback: try hidden input approach
          var hiddenInput = document.querySelector('[name="product.mainProductSelected"]');
          var container = hiddenInput && hiddenInput.closest('.rw-dropdown-list');
          var input = container && container.querySelector('.rw-dropdown-list-input');
          if (input) {
            input.click();
            setTimeout(function () {
              var opts = document.querySelectorAll('.rw-list-option');
              for (var i = 0; i < opts.length; i++) {
                if (opts[i].textContent.includes('Private')) {
                  opts[i].click();
                  console.log('[DPD] Step 4 fallback: DPD Private selected');
                  break;
                }
              }
            }, 500);
          }
        }
      });
    }, 6000);

    // ═══ STEP 5 (8000ms): Doplňkové služby → Dobírka ═══
    setTimeout(function () {
      var alreadySelected = document.querySelector('#shipment-selected-additional');
      if (alreadySelected && alreadySelected.textContent && alreadySelected.textContent.includes('Dobírka')) {
        console.log('[DPD] Step 5: Dobírka already selected');
        return;
      }
      openDropdownByLabel('Doplňkové služby', 'Dobírka');
    }, 8000);

    // ═══ STEP 6 (10000ms): COD amount ═══
    if (data.amount) {
      waitFor('#amount-1', 15000, function (amountField) {
        amountField.removeAttribute('disabled');
        amountField.removeAttribute('readonly');
        setNativeValue(amountField, data.amount);
        console.log('[DPD] Step 6: amount =', data.amount);
      });
    }

    console.log('[DPD] All steps scheduled');
  }

  // ═══ Listen for data from bridge.js (ISOLATED world) ═══
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'DPD_PROFIECU_DATA') {
      console.log('[DPD] Received data from bridge');
      fillForm(event.data.payload);
    }
  });

  console.log('[DPD] Content script loaded (MAIN world), waiting for bridge data...');
})();
