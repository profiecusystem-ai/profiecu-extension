# DPD Extension — Stav implementace

## Verze 3.0 (14. 9. 2026) — přepis kvůli aktualizaci DPD

DPD Shipping přestavělo formulář `/shipments/new-single-page` na Chakra UI +
react-hook-form. Pole dostala jmenný prefix a zmizely kotvy, na kterých stála
verze 2.x:

| Dřív | Teď |
|------|-----|
| `name` | `receiver.name` |
| `zipCode` | `receiver.zipCode` |
| `cityName` | `receiver.cityName` |
| `streetName` | `receiver.streetName` |
| — | `receiver.houseNo` (nové, povinné) |
| `email` | `receiver.email` |
| `mobileNumber` | `receiver.mobileNumber` |
| — | `receiver.countryCode` |
| `product.mainProductSelected` | `services.mainService` |
| `#shipment-additional-services` | `#shipment-services-information` |
| `#amount-1` | `services.additionalServices.cod.amount` |

Kromě přejmenování byla druhá chyba v samotné stavbě skriptu: všechny kroky
visely na jednom řetězu promisů, takže první nenalezená sekce shodila i kroky
za ní. Proto se „nevyplnilo skoro nic", i když šlo jen o pár polí.

## Verze 3.3 (14. 9. 2026) — hlavní služba (DPD Private) byla mrtvý kód

Symptom po v3.2: kontaktní pole se vyplnila hned, ale dobírka a maskovací
adresa se doplnily až s cca 20-30s odstupem, a hlavní služba se na DPD
Private nikdy nepřepnula.

Příčina: sekce „hlavní služba" počítala s klasickým `<select>`, ale živý
formulář má (stejně jako země/dobírka/maskovací adresa) Chakra combobox bez
`<label>` tagu — jen `p`/`span` text. `byLabel()` prohledává jen `<label>`,
takže pole nikdy nenašla a `waitField` čekala naplno 20000 ms, než se vzdala.
Teprve pak běžely dobírka a maskovací adresa dál — odtud ten pozorovaný
odstup. A protože se pole nenašlo, DPD Private se nikdy nezaškrtlo.

Oprava: hlavní služba teď jde stejnou cestou jako ostatní comboboxy
(`otevriComboboxPoLabelu` + `vyberOptionVOtevrenemMenu` s `/private/i`),
krátká zkouška na klasický `<select>` zůstává jen jako fallback (2000 ms
místo 20000 ms). Zatím NEOVĚŘENO živě — čeká na test u reálné objednávky.

## Co teď funguje ✅ (živě ověřeno k v3.2, hlavní služba čeká na ověření v3.3)
- Jméno, země, PSČ, město, ulice, **číslo popisné**, e-mail, telefon
- Hlavní služba (vybere DPD Private, jinak první nabídku) — **v3.3, neověřeno živě**
- Dobírka: zaškrtne, u zásilky zdarma naopak odškrtne zděděnou dobírku
- Částka dobírky, měna u slovenských zásilek
- Maskovací adresa odesílatele (pokud je ve formuláři)

## Jak je to postavené
1. Každé pole se hledá seznamem kandidátů: nové názvy → staré názvy →
   `data-testid` → **text popisku**. Přežije to i další přejmenování.
2. Každý krok je samostatný — když jeden selže, ostatní běží dál.
3. Hodnota se nastavuje nativním setterem. Prosté `el.value = x` React
   ignoruje a při dalším překreslení hodnotu zahodí.
4. Po doběhnutí se do konzole vypíše tabulka „co se vyplnilo". Když něco
   nevyjde, přidá se soupis všech polí formuláře — z toho je příště hned
   vidět, co DPD změnilo.

## Diagnostika
Tlačítko **🔍 Diagnostika DPD polí** v popupu rozšíření vypíše do konzole
DPD stránky (F12 → Console) soupis všech polí: název, `data-testid`, id.

## Instalace na nový Mac
1. Jdi na: github.com/profiecusystem-ai/profiecu-extension
2. Zelené tlačítko Code → Download ZIP
3. Rozbal ZIP
4. Chrome → chrome://extensions
5. Zapni Developer mode (vpravo nahoře)
6. Load unpacked → vyber rozbalenou složku

## Po každé změně souborů
chrome://extensions → ProfiECU Autofill → ikona ↻ (Reload).
Bez toho běží Chrome pořád na staré kopii.
