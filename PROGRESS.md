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

## Verze 3.4 (14. 9. 2026) — kompletní živé ověření (CZ i SK), maskovací adresa jde první

Majitel: „prvně se vybere maskovací adresa poté až vše další… udělej to nejrychlejší
možnou verzi… dávej pozor na Slovensko“. Testováno přes chrome-devtools MCP na
reálném formuláři (bez odeslání objednávky), dva plné běhy:
- **SK, s dobírkou** (350 Kč→EUR automaticky, DPD Private, maskovací adresa) —
  všech 13 kroků `vyplněno`/`vybráno`/`zaškrtnuto`, **12,2 s celkem**.
- **CZ, bez dobírky** (prepaid scénář) — dobírka správně zůstala nezaškrtnutá
  bez zbytečného otevírání comboboxu, **6,7 s celkem**.

Tři opravy nad v3.3:
1. **Maskovací adresa běží jako úplně první krok** (dřív poslední) — je to
   sekce Odesílatele, v DOM existuje dřív než pole příjemce, takže na ni nic
   nezávisí. `zaskrtniMaskovaciAdresu()` teď sama čeká na checkbox (`waitField`),
   protože se dřív spoléhala na to, že formulář je už dávno načtený.
2. **Detekce „je dobírka zaškrtnutá" byla mrtvá** — hledala CSS třídy
   `tag`/`chip`/`multi`, které živý Chakra formulář vůbec nepoužívá (jen
   hashované `css-xxxxx` třídy). Nahrazeno čtením textu z kontejneru comboboxu
   (`Dobírka, Avizace o doručení, Doplňkové služby` se čte jako obyčejný text,
   dokud je nabídka zavřená). Odebrání dobírky navíc nehledá žádné tlačítko
   „zavřít" (živě ověřeno, že žádné u vybrané položky není) — react-select je
   multiselect, klik na už vybranou položku ji odebere. Zaškrtnutí i odškrtnutí
   je teď stejná akce.
3. **Měna dobírky se u SK řeší sama** — živě ověřeno, že DPD po výběru dobírky
   sama přepne `cod.currency` na EUR podle země příjemce. Ruční zápis do
   skrytého pole byl zbytečný a riskantní (obcházel react-hook-form). Smazáno.

## Co teď funguje ✅ (živě ověřeno v3.4, CZ i SK, s dobírkou i bez)
- Jméno, země, PSČ, město, ulice, **číslo popisné**, e-mail, telefon
- Hlavní služba — vybere DPD Private
- Dobírka: zaškrtne/odškrtne přesně podle stavu appky, žádné zbytečné kliky
- Částka dobírky (měnu řeší DPD samo)
- Maskovací adresa odesílatele + maskované jméno — jako první krok

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
