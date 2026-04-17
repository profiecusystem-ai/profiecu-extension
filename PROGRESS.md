# DPD Extension — Stav implementace

## Funguje ✅
- Jméno příjemce
- Maskovací adresa (PROFIECU SUPPLIER s.r.o.)
- PSČ, město, ulice
- Telefon
- DPD Private výběr

## Nedodělano ❌
- Dobírka — dropdown .rw-dropdown-list se otevře ale .rw-list-option s textem "Dobírka" se nenajde. Poslední pokus: klik na dropdown input + 500ms + hledání .rw-list-option
- Email příjemce — log říká email=email ale pole zůstává prázdné
- Částka dobírky — React disabled pole, nelze automaticky, vždy ručně

## Instalace na nový Mac
1. Jdi na: github.com/profiecusystem-ai/profiecu-extension
2. Zelené tlačítko Code → Download ZIP
3. Rozbal ZIP
4. Chrome → chrome://extensions
5. Zapni Developer mode (vpravo nahoře)
6. Load unpacked → vyber rozbalenou složku
