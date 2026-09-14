/* ProfiECU Autofill — DPD
 *
 * Přepsáno 14. 9. 2026. DPD Shipping přestavělo formulář
 * /shipments/new-single-page na Chakra UI + react-hook-form. Pole dostala
 * jmenný prefix ("receiver.name", "receiver.zipCode", "services.*") a zmizely
 * kotvy, na kterých stála stará verze (#shipment-additional-services, #amount-1).
 * Stará verze proto nenašla skoro nic — a co hůř, běžela jako jeden řetěz
 * promisů, takže první nenalezená sekce shodila i všechny kroky za ní.
 *
 * Tři zásady, na kterých tenhle skript stojí:
 *   1. Každé pole se hledá seznamem kandidátů: nové názvy → staré názvy →
 *      data-testid → text popisku. Přežije tedy i další přejmenování.
 *   2. Každý krok je samostatný. Když jeden selže, ostatní běží dál.
 *   3. Hodnota se nastavuje nativním setterem. Prosté el.value = x React
 *      ignoruje a při dalším překreslení ji zahodí.
 *
 * Když se něco nepovede, skript vypíše do konzole tabulku polí a soupis
 * všech ovládacích prvků formuláře — z toho jde příště poznat, co DPD
 * přejmenovalo, bez dalšího hádání.
 */

const PE_LOG = '[ProfiECU DPD]';
const FILLABLE = 'input, select, textarea';

function peLog() {
  console.log.apply(console, [PE_LOG].concat(Array.prototype.slice.call(arguments)));
}
function peWarn() {
  console.warn.apply(console, [PE_LOG].concat(Array.prototype.slice.call(arguments)));
}

function sleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// --- nastavení hodnoty, které React nepřepíše ------------------------------

function nativeSet(el, value) {
  var proto = HTMLInputElement.prototype;
  if (el instanceof HTMLTextAreaElement) proto = HTMLTextAreaElement.prototype;
  else if (el instanceof HTMLSelectElement) proto = HTMLSelectElement.prototype;
  var desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
}

function fire(el, types) {
  types.forEach(function (t) {
    el.dispatchEvent(new Event(t, { bubbles: true }));
  });
}

function setVal(el, value) {
  if (!el) return false;
  try { el.focus(); } catch (e) { /* skrytá pole fokus nepřijmou */ }
  nativeSet(el, value);
  fire(el, ['input', 'change']);
  return true;
}

// --- hledání polí ----------------------------------------------------------

function resolve(selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var el = null;
    try { el = document.querySelector(selectors[i]); } catch (e) { continue; }
    if (!el) continue;
    if (el.matches && el.matches(FILLABLE)) return el;
    var inner = el.querySelector ? el.querySelector(FILLABLE) : null;
    if (inner) return inner;
  }
  return null;
}

// Záloha pro případ, že DPD pole zase přejmenuje: hledáme podle popisku.
function byLabel(re) {
  var labels = Array.prototype.slice.call(document.querySelectorAll('label'));
  for (var i = 0; i < labels.length; i++) {
    var l = labels[i];
    var text = (l.textContent || '').trim();
    if (!re.test(text)) continue;
    if (l.htmlFor) {
      var target = document.getElementById(l.htmlFor);
      if (target && target.matches(FILLABLE)) return target;
    }
    var inner = l.querySelector(FILLABLE);
    if (inner) return inner;
    var p = l.parentElement;
    for (var d = 0; d < 3 && p; d++, p = p.parentElement) {
      var cand = p.querySelector(FILLABLE);
      if (cand) return cand;
    }
  }
  return null;
}

function findField(def) {
  var el = def.sel ? resolve(def.sel) : null;
  if (!el && def.label) el = byLabel(def.label);
  return el;
}

function waitField(def, timeout) {
  var deadline = Date.now() + (timeout || 12000);
  return new Promise(function (resolve_) {
    (function tick() {
      var el = findField(def);
      if (el) return resolve_(el);
      if (Date.now() > deadline) return resolve_(null);
      setTimeout(tick, 250);
    })();
  });
}

function waitAny(selectors, timeout) {
  var deadline = Date.now() + (timeout || 15000);
  return new Promise(function (resolve_) {
    (function tick() {
      for (var i = 0; i < selectors.length; i++) {
        var el = null;
        try { el = document.querySelector(selectors[i]); } catch (e) { /* neplatný selektor */ }
        if (el) return resolve_(el);
      }
      if (Date.now() > deadline) return resolve_(null);
      setTimeout(tick, 250);
    })();
  });
}

// --- protokol o vyplnění ---------------------------------------------------

var report = {};

function zapis(klic, stav, detail) {
  report[klic] = { stav: stav, detail: detail || '' };
}

// --- vyplnění jednoho pole s ověřením --------------------------------------

async function fillField(klic, def, value, opts) {
  opts = opts || {};
  if (value === undefined || value === null || value === '') {
    zapis(klic, 'přeskočeno', 'appka hodnotu neposlala');
    return null;
  }
  var el = await waitField(def, opts.timeout || 12000);
  if (!el) {
    // Nepovinná pole (měna u české dobírky, číslo popisné u adresy bez čísla)
    // se ve formuláři nemusí vůbec objevit — to není chyba k hlášení.
    zapis(klic, opts.nepovinne ? 'není ve formuláři' : 'NENALEZENO', 'pole ve formuláři není');
    if (!opts.nepovinne) peWarn('pole nenalezeno: ' + klic);
    return null;
  }

  if (el.tagName === 'SELECT') {
    var ok = selectOption(el, value, opts.match);
    zapis(klic, ok ? 'vyplněno' : 'NEVYPLNĚNO', ok ? el.value : 'v nabídce není žádná odpovídající položka');
    return el;
  }

  for (var pokus = 1; pokus <= 3; pokus++) {
    setVal(el, value);
    await sleep(200);
    var ted = (el.value || '').trim();
    if (ted === String(value).trim() || (opts.volne && ted.length > 0)) {
      try { el.blur(); } catch (e) { /* nevadí */ }
      fire(el, ['change']);
      zapis(klic, 'vyplněno', ted);
      return el;
    }
    await sleep(300);
  }
  zapis(klic, 'NEUDRŽELO SE', 'hodnota se po zápisu vrátila zpět (React ji přepsal)');
  peWarn('hodnota se neudržela: ' + klic);
  return el;
}

function selectOption(sel, value, matchRe) {
  var opts = Array.prototype.slice.call(sel.options || []);
  var hit = null;
  if (matchRe) hit = opts.find(function (o) { return matchRe.test(o.text || '') || matchRe.test(o.value || ''); });
  if (!hit) hit = opts.find(function (o) { return (o.value || '') === value; });
  if (!hit) hit = opts.find(function (o) { return (o.text || '').trim().toLowerCase() === String(value).trim().toLowerCase(); });
  if (!hit) hit = opts.find(function (o) { return (o.text || '').toLowerCase().indexOf(String(value).toLowerCase()) >= 0; });
  if (!hit) return false;
  nativeSet(sel, hit.value);
  fire(sel, ['input', 'change']);
  return true;
}

// --- země příjemce -----------------------------------------------------------
// Živě ověřeno 14. 9. 2026: pole nemá name atribut (je to react-select text
// input), jen id "react-select-receiver.countryCode-input" — a nikde u něj
// není popisek „Země"/„Country" k nalezení (aktuální hodnota se zobrazí jako
// prostý text vedle). `[id*=...]` je tu jediná spolehlivá stopa. Hodnotu jde
// nastavit jen kliknutím a výběrem v otevřené nabídce, psaní do pole ji
// vyfiltruje (stovky zemí), ale nevybere.
async function nastavZemi(zeme) {
  var matchRe = zeme === 'SK' ? /^(SK|Slovak|Slovensk)/i : /^(CZ|Czech|Česk)/i;
  var hledej = zeme === 'SK' ? 'Slovensk' : 'Česk';

  var el = await waitField({
    sel: [
      '[id*="receiver.countryCode"]',
      '[name="receiver.countryCode"]',
      '[data-testid="receiver-country"]',
      '[name="receiver.country"]',
      '[name="country"]',
    ],
    label: /^(země|country)$/i,
  }, 15000);

  if (!el) {
    zapis('země', 'NENALEZENO', 'pole ve formuláři není');
    return;
  }

  if (el.tagName === 'SELECT') {
    var ok = selectOption(el, zeme, matchRe);
    zapis('země', ok ? 'vyplněno' : 'NEVYPLNĚNO', ok ? el.value : 'v nabídce není žádná odpovídající položka');
    return;
  }

  el.click();
  await sleep(200);
  setVal(el, hledej);
  await sleep(400);
  var vybrano = await vyberOptionVOtevrenemMenu(el, matchRe, 12);
  zapis('země', vybrano ? 'vyplněno' : 'VYBRAT RUČNĚ', vybrano || 'v nabídce nebyla odpovídající položka');
}

// --- telefon: předvolba je samostatné pole -----------------------------------
// Živě ověřeno 14. 9. 2026: vedle textu na telefon je vlastní combobox s
// předvolbou (+420/+421), skrytě napojený na receiver.mobileCode a předvyplněný
// podle vybrané země. Když appka posílá číslo i s předvolbou ("+421900123456"),
// DPD ji vidí dvakrát a odmítne to („number is too long for the prefix").
function ocistiTelefon(telefon) {
  var t = (telefon || '').replace(/[\s()-]/g, '');
  t = t.replace(/^\+?(420|421)/, '');
  return t;
}

// --- adresa: oddělení čísla popisného od ulice ------------------------------
// Nový formulář má „Číslo popisné" jako samostatné (a často povinné) pole.
// Appka posílá ulici i s číslem, takže když houseNo nedorazí, urveme ho tady.
function splitStreet(street, houseNo) {
  var s = (street || '').trim();
  var h = (houseNo || '').trim();
  if (h) return { street: s, houseNo: h };
  var m = s.match(/^(.*?)[\s,]+(\d[\da-zA-Z]*(?:\s*\/\s*\d[\da-zA-Z]*)?)$/);
  if (m && m[1].trim()) return { street: m[1].trim(), houseNo: m[2].replace(/\s+/g, '') };
  return { street: s, houseNo: '' };
}

// --- dobírka (doplňková služba) --------------------------------------------

function textOf(el) {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

var COD_RE = /dob[ií]rk|cash on delivery|(^|\W)cod(\W|$)/i;

function najdiCodChip() {
  // Už vybraná služba se zobrazuje jako štítek uvnitř multiselectu.
  var boxy = document.querySelectorAll('[class*="tag"], [class*="chip"], [class*="multi"] [class*="value"]');
  for (var i = 0; i < boxy.length; i++) {
    if (COD_RE.test(textOf(boxy[i]))) return boxy[i];
  }
  return null;
}

// Chakra UI comboboxy (doplňkové služby, země, maskovací adresa) nejdou
// vyplnit zápisem hodnoty — je potřeba kliknout na ovládací prvek a pak na
// položku v otevřené nabídce. Sdílený pár funkcí pro všechny tři.
async function otevriComboboxPoLabelu(labelRe, timeout) {
  // Živě ověřeno 14. 9. 2026: hledání „N divů nad inputem" je křehké — u
  // různých polí je popisek v různé hloubce (4 u dobírky, 6 u „Maskované
  // jméno"), a jít dost hluboko na to druhé znamená trefit sousední pole ve
  // společném kontejneru (stalo se to s „Adresa svozu"). Spolehlivější je jít
  // opačně: najít přímo text popisku, a teprve z NĚJ sestoupit k inputu uvnitř
  // stejného chakra-form-control — stejný princip jako byLabel() pro klasická pole.
  //
  // „Maskované jméno" se navíc v DOM objeví až s odstupem PO kliknutí na
  // checkbox (podmíněné vykreslení) — jeden pevný sleep(300) to minul, proto
  // se hledání opakuje, dokud pole nenaběhne, ne jen jednou.
  var deadline = Date.now() + (timeout || 6000);
  var cil = null;
  while (!cil && Date.now() < deadline) {
    var uzly = Array.prototype.slice.call(document.querySelectorAll('label, p, span'));
    var popisek = uzly.find(function (n) {
      return n.children.length === 0 && labelRe.test((n.textContent || '').trim());
    });
    if (popisek) {
      var kontejner = popisek.closest('[class*="chakra-form-control"]') || popisek.parentElement;
      for (var d = 0; d < 6 && kontejner && !cil; d++, kontejner = kontejner.parentElement) {
        cil = kontejner.querySelector('[role="combobox"], [aria-haspopup="listbox"]');
      }
    }
    if (!cil) await sleep(200);
  }
  if (!cil) return null;
  // Živě ověřeno 14. 9. 2026: react-select nabídka se klikem na vstup
  // NEOTEVŘE (žádná reakce, aria-expanded zůstane false) — otevře ji jen
  // klávesa ArrowDown. Bez tohohle kroku byla „Dobírka" i „Maskované jméno"
  // navždy nedosažitelné, i když je selektor správně našel.
  cil.focus();
  try { cil.click(); } catch (e) { /* nevadí */ }
  await sleep(150);
  cil.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 }));
  await sleep(400);
  return cil;
}

// Živě ověřeno 14. 9. 2026: hledat položku napříč CELOU stránkou
// (`[role="option"], li, ...`) je nebezpečné — na téhle stránce má i horní
// navigace `<li>` prvky ("Přehled zásilek"), a s obecným regexem typu /./ u
// „Maskované jméno" (jediná položka, název neznáme dopředu) skript omylem
// kliknul na položku menu, ne do otevřené nabídky. React-select ale položky
// pojmenovává `<id-comboboxu>-option-N`, tedy stejným prefixem jako samotný
// input (`<id-comboboxu>-input`) — hledání se proto omezí jen na potomky
// TOHOTO konkrétního comboboxu, ne na celou stránku.
async function vyberOptionVOtevrenemMenu(cil, matchRe, pokusu) {
  var prefix = (cil && cil.id) ? cil.id.replace(/-input$/, '') : null;
  for (var pokus = 0; pokus < (pokusu || 12); pokus++) {
    var polozky = Array.prototype.slice.call(document.querySelectorAll('[role="option"]'));
    if (prefix) polozky = polozky.filter(function (el) { return el.id && el.id.indexOf(prefix) === 0; });
    var hit = polozky.find(function (el) {
      return matchRe.test(textOf(el)) && el.offsetParent !== null;
    });
    if (hit) {
      hit.click();
      await sleep(400);
      return textOf(hit);
    }
    await sleep(300);
  }
  return null;
}

async function otevriDoplnkoveSluzby() {
  var box = await waitAny([
    '[name="services.additionalProducts"]',
    '#shipment-services-information',
    '#shipment-additional-services',
  ], 20000);
  if (!box) return null;
  return otevriComboboxPoLabelu(/doplňkov|additional service/i);
}

async function zaskrtniDobirku(chceme) {
  var chip = najdiCodChip();
  if (!chceme) {
    if (!chip) {
      zapis('dobírka', 'v pořádku', 'zásilka je bez dobírky a žádná nastavená nebyla');
      return false;
    }
    var zrus = chip.querySelector('button, [role="button"], [class*="close"], [class*="remove"]');
    if (zrus) {
      zrus.click();
      zapis('dobírka', 'odebráno', 'zásilka je bez dobírky (zaplaceno předem / reklamace)');
      return false;
    }
    zapis('dobírka', 'ZKONTROLOVAT RUČNĚ', 'dobírka je nastavená, ale nešla odebrat');
    return false;
  }

  if (chip) {
    zapis('dobírka', 'v pořádku', 'byla zaškrtnutá už předtím');
    return true;
  }

  var ovladac = await otevriDoplnkoveSluzby();
  if (!ovladac) {
    zapis('dobírka', 'ZAŠKRTNOUT RUČNĚ', 'nabídka doplňkových služeb se nenašla');
    return false;
  }

  var hit = await vyberOptionVOtevrenemMenu(ovladac, COD_RE, 12);
  if (hit) {
    zapis('dobírka', najdiCodChip() ? 'zaškrtnuto' : 'ZKONTROLOVAT RUČNĚ', hit);
    return true;
  }
  zapis('dobírka', 'ZAŠKRTNOUT RUČNĚ', 'v nabídce nebyla položka Dobírka');
  return false;
}

// --- maskovací adresa odesílatele -------------------------------------------
// `[name="useMarkedAddress"]` byl název ze staré verze formuláře. Živě
// ověřeno 14. 9. 2026: nové jméno je "maskedAddress.applyMaskedAddress" a je
// to normální checkbox (na rozdíl od země) — jen ho starý selektor nenašel a
// mlčel stejně jako úspěch, protože chyběl zápis do NENALEZENO.
//
// Zaškrtnutím se navíc odemkne NOVÉ povinné pole „Maskované jméno" (react-select
// s jedinou položkou — název firmy, pod kterým se zásilka maskuje). Bez
// vyplnění by formulář nešlo odeslat, i když checkbox sám sedí.
async function zaskrtniMaskovaciAdresu() {
  var checkbox = document.querySelector('[name="maskedAddress.applyMaskedAddress"]') ||
    document.querySelector('[name="useMarkedAddress"]') ||
    byLabel(/masko/i);

  var checknuto = false;
  if (checkbox && checkbox.type === 'checkbox') {
    if (checkbox.checked) {
      zapis('maskovací adresa', 'v pořádku', 'byla zaškrtnutá už předtím');
      checknuto = true;
    } else {
      checkbox.click();
      await sleep(300);
      zapis('maskovací adresa', checkbox.checked ? 'zaškrtnuto' : 'ZKONTROLOVAT RUČNĚ', '');
      checknuto = checkbox.checked;
    }
  } else {
    var ovladac = await otevriComboboxPoLabelu(/masko/i);
    if (ovladac) {
      var vysledek = await vyberOptionVOtevrenemMenu(ovladac, /masko/i, 6);
      zapis('maskovací adresa', vysledek ? 'zaškrtnuto' : 'ZAŠKRTNOUT RUČNĚ', vysledek || 'položka v otevřené nabídce nenalezena');
      checknuto = !!vysledek;
    } else {
      zapis('maskovací adresa', 'NENALEZENO', 'pole ve formuláři není nebo bylo přejmenováno (formulář DPD se přestavěl)');
    }
  }

  if (!checknuto) return;

  var jmenoOvladac = await otevriComboboxPoLabelu(/maskovan[eé] jm[eé]no|masked name/i);
  if (!jmenoOvladac) {
    zapis('maskované jméno', 'ZKONTROLOVAT RUČNĚ', 'nabídka se po zaškrtnutí neobjevila');
    return;
  }
  var vybranoJmeno = await vyberOptionVOtevrenemMenu(jmenoOvladac, /./, 8);
  zapis('maskované jméno', vybranoJmeno ? 'vyplněno' : 'VYBRAT RUČNĚ', vybranoJmeno || 'v otevřené nabídce nebyla žádná položka');
}

// --- diagnostika -----------------------------------------------------------

function scan() {
  var prvky = Array.prototype.slice.call(document.querySelectorAll(FILLABLE));
  var radky = prvky
    .filter(function (el) { return el.type !== 'hidden'; })
    .map(function (el) {
      return {
        name: el.getAttribute('name') || '',
        testid: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || '',
        id: el.id || '',
        tag: el.tagName.toLowerCase(),
        typ: el.type || '',
        hodnota: (el.value || '').slice(0, 30),
      };
    });
  peLog('Soupis polí formuláře (' + radky.length + '):');
  console.table(radky);
  return radky;
}

// --- hlavní běh ------------------------------------------------------------

async function fillDpd() {
  var raw = localStorage.getItem('dpd_autofill');
  if (!raw) {
    peWarn('v localStorage nejsou žádná data (dpd_autofill) — není co vyplnit');
    return;
  }
  var d;
  try { d = JSON.parse(raw); } catch (e) {
    peWarn('data v localStorage se nepodařilo přečíst: ' + e.message);
    return;
  }
  report = {};

  var koren = await waitAny([
    '[name="receiver.name"]',
    '#shipment-receiver-information',
    '#receiver-address-fields',
    '[name="name"]',
  ], 30000);
  if (!koren) {
    peWarn('formulář zásilky se nenačetl do 30 s — autofill se nespustil');
    scan();
    return;
  }

  var adresa = splitStreet(d.street, d.houseNo);
  var zeme = d.country || 'CZ';
  var chceDobirku = typeof d.cod === 'boolean' ? d.cod : (!!d.amount && parseFloat(d.amount) > 0);

  // Země jako první: její změna přepíná validace PSČ i nabídku služeb.
  await nastavZemi(zeme);

  await fillField('jméno', {
    sel: ['[name="receiver.name"]', '[data-testid="receiver-address-name"]', '#receiverName', '[name="name"]'],
    label: /^(jméno|name)$/i,
  }, d.name);

  // PSČ spouští načtení měst, hlavní služby i doplňkových služeb.
  await fillField('PSČ', {
    sel: ['[name="receiver.zipCode"]', '[data-testid="receiver-zip-code"]', '[name="zipCode"]'],
    label: /^(psč|zip|post)/i,
  }, d.zip);
  await sleep(1200);

  await fillField('město', {
    sel: ['[name="receiver.cityName"]', '[data-testid="receiver-city"]', '[name="cityName"]'],
    label: /^(město|city|town)/i,
  }, d.city, { volne: true });

  // Živě ověřeno 14. 9. 2026: pole se jmenuje „Ulice a číslo popisné" a je
  // POVINNÉ — DPD ho chce jako jeden řetězec s číslem uvnitř, ne holou ulici.
  // Samostatné „Číslo domu" je navíc a NEpovinné (appka ho dřív brala jako
  // hlavní povinné pole, ale živý formulář to popírá) — vyplní se jen jako bonus.
  var uliceSCislem = adresa.houseNo ? (adresa.street + ' ' + adresa.houseNo) : adresa.street;
  await fillField('ulice a číslo popisné', {
    sel: ['[name="receiver.streetName"]', '[data-testid="receiver-street"]', '[name="streetName"]'],
    label: /^(ulice|street)/i,
  }, uliceSCislem);

  await fillField('číslo popisné (vlastní pole)', {
    sel: ['[name="receiver.houseNo"]', '[data-testid="receiver-house-no"]', '[name="houseNo"]'],
    label: /(číslo popisné|house no)/i,
  }, adresa.houseNo, { nepovinne: true });

  await fillField('e-mail', {
    sel: ['[name="receiver.email"]', '[data-testid="receiver-email"]', '[name="email"]'],
    label: /^(e-?mail)/i,
  }, d.email);

  await fillField('telefon', {
    sel: ['[name="receiver.mobileNumber"]', '[data-testid="receiver-mobile"]', '[name="receiver.mobile"]', '[name="mobileNumber"]'],
    label: /^(mobil|telefon|mobile|phone)/i,
  }, ocistiTelefon(d.phone));

  // Hlavní služba: v nové verzi "services.mainService", ve staré
  // "product.mainProductSelected". Vybíráme DPD Private, jinak první nabídku.
  var sluzba = await waitField({
    sel: ['[name="services.mainService"]', '[name="product.mainProductSelected"]', '[data-testid="shipment-main-service"]'],
    label: /(hlavní služba|main service)/i,
  }, 20000);
  if (sluzba && sluzba.tagName === 'SELECT') {
    var vybrano = selectOption(sluzba, '', /private/i);
    if (!vybrano) {
      var prvni = Array.prototype.slice.call(sluzba.options || []).find(function (o) { return o.value; });
      if (prvni) { nativeSet(sluzba, prvni.value); fire(sluzba, ['input', 'change']); vybrano = true; }
    }
    zapis('hlavní služba', vybrano ? 'vybráno' : 'VYBRAT RUČNĚ', sluzba.value);
  } else {
    zapis('hlavní služba', sluzba ? 'VYBRAT RUČNĚ' : 'NENALEZENO', sluzba ? 'není to klasický výběr' : '');
  }
  await sleep(800);

  await zaskrtniDobirku(chceDobirku);

  if (chceDobirku) {
    await sleep(600);
    await fillField('částka dobírky', {
      sel: [
        '[name="services.additionalServices.cod.amount"]',
        '[data-testid="cod-amount"]',
        '[name="codAmount"]',
        '#amount-1',
      ],
      label: /(částka dobírky|cod amount)/i,
    }, d.amount, { timeout: 8000 });

    // Měnu řešíme jen u slovenských zásilek (EUR). U českých je CZK výchozí
    // a sahat na ni je zbytečné riziko.
    if (d.currency && d.currency !== 'CZK') {
      await fillField('měna dobírky', {
        sel: ['[name="services.additionalServices.cod.currency"]', '[name="codCurrency"]'],
        label: /(měna|currency)/i,
      }, d.currency, { timeout: 4000, match: new RegExp(d.currency, 'i'), nepovinne: true });
    }
  }

  await zaskrtniMaskovaciAdresu();

  window.__profiecuDpdReport = report;
  peLog('Hotovo. Přehled vyplnění:');
  console.table(report);

  var problemy = Object.keys(report).filter(function (k) {
    return /NENALEZENO|NEUDRŽELO|NEVYPLNĚNO|RUČNĚ/.test(report[k].stav);
  });
  if (problemy.length) {
    peWarn('Ručně zkontroluj: ' + problemy.join(', '));
    scan();
  }
}

chrome.runtime.onMessage.addListener(function (msg) {
  if (msg.action === 'fillDpd') fillDpd();
  if (msg.action === 'scanDpd') scan();
});

// Data z ProfiECU se stáhnou jednorázovým nonce tokenem z adresy (#pe=…)
// a autofill se spustí sám, jakmile je formulář na stránce.
(function autoFetchAndFill() {
  var API_URL = 'https://profiecu.vercel.app/api/dpd-data';
  var MAX_ATTEMPTS = 4;
  var RETRY_INTERVAL_MS = 1500;

  function readNonce() {
    var m = (location.hash || '').match(/[#&]pe=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  var NONCE = readNonce();

  function fetchPayload(attempt) {
    attempt = attempt || 1;
    if (!NONCE) {
      peWarn('Chybí nonce v adrese (#pe=…) — autofill přeskočen.');
      return;
    }
    fetch(API_URL + '?token=' + encodeURIComponent(NONCE), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data) throw new Error('prázdná data');
        localStorage.setItem('dpd_autofill', JSON.stringify(data));
        peLog('Data z ProfiECU načtena (pokus ' + attempt + ').');
        fillDpd();
      })
      .catch(function (err) {
        peWarn('Pokus ' + attempt + ' o načtení dat selhal: ' + err.message);
        // Data jsou jednorázová: po prvním úspěšném stažení je server smaže,
        // takže opakovat má smysl jen dokud se poprvé nenačtou.
        if (attempt < MAX_ATTEMPTS) {
          setTimeout(function () { fetchPayload(attempt + 1); }, RETRY_INTERVAL_MS);
        } else {
          console.error(PE_LOG, 'Data se nepodařilo načíst ani na ' + MAX_ATTEMPTS + '. pokus.');
        }
      });
  }

  peLog('Rozšíření naběhlo, stahuji data z ProfiECU…');
  fetchPayload();
})();
