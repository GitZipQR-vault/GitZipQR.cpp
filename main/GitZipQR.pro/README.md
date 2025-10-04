# LICENSE
GitZipQR Proprietary License
============================

© 2025–Настоящее время Daniil V [RestlessByte]. Все права защищены.  
© 2025–Present Daniil V [RestlessByte]. All rights reserved.  

[RU]

1. Настоящее приложение "GitZipQR" (включая исходный код, собранные бинарные файлы,
   дистрибутивы и любую связанную документацию) является интеллектуальной собственностью
   автора: Daniil V [RestlessByte].

2. Запрещается:
   • Копировать, изменять, распространять приложение или его части без письменного согласия автора.
   • Использовать проект или его идеи для создания аналогичных приложений, прототипов
     или производных продуктов.
   • Публиковать, предоставлять или продавать проект от своего имени, либо выдавать его за
     собственную разработку.
   • Производить реверс-инжиниринг, декомпиляцию, дизассемблирование или иное вскрытие
     приложения и его компонентов.
   • Любые действия, направленные на обход технических средств защиты или ограничений лицензии.

3. Разрешается:
   • Использование приложения только в личных целях (без распространения и публикации).
   • Ознакомление с функциональностью исключительно в пользовательском режиме (без вмешательства
     в код или бинарные файлы).

4. Нарушение:
   • Любое нарушение настоящей лицензии влечёт юридическую ответственность в
     соответствии с Гражданским кодексом РФ (Часть IV), законами Российской Федерации
     об авторском праве, а также международными нормами (Бернская конвенция 1886 г.).
   • В случае обнаружения незаконного копирования, модификации, реверс-инжиниринга или
     иного нарушения автор имеет право незамедлительно обратиться в суд и к юристам для
     защиты своих прав.

5. Принудительное исполнение:
   • Автор вправе требовать удаления всех незаконных копий, компенсации убытков, а также
     применения санкций в соответствии с DMCA (Digital Millennium Copyright Act) и
     международным авторским правом.

---

[ENG]

1. This application "GitZipQR" (including source code, compiled binaries, distributions,
   and any related documentation) is the intellectual property of the author:
   Daniil V [RestlessByte].

2. Prohibited:
   • Copying, modifying, distributing this application or any part of it without the
     author’s written consent.
   • Using the project or its ideas to create similar applications, prototypes, or
     derivative products.
   • Publishing, providing, or selling this project under your own name, or claiming it as
     your own work.
   • Reverse engineering, decompiling, disassembling, or otherwise attempting to
     tamper with the application or its components.
   • Any attempt to bypass technical protection measures or the restrictions of this license.

3. Allowed:
   • Use of the application for personal purposes only (no distribution or publication).
   • Reviewing the functionality exclusively in user mode (without tampering with source
     code or binaries).

4. Violation:
   • Any violation of this license entails legal liability under the Civil Code of the
     Russian Federation (Part IV), Russian copyright law, and international agreements
     (Berne Convention of 1886).
   • In the event of unlawful copying, modification, reverse engineering, or other
     violations, the author reserves the right to immediately seek legal counsel and pursue
     judicial remedies.

5. Enforcement:
   • The author may demand the removal of all illegal copies, compensation for damages,
     and the application of penalties under the DMCA (Digital Millennium Copyright Act)
     and applicable international law.

# GitZipQR Pro — Electron + Next.js shell

**Core idea:** ship a hardened UI around your existing C++ binaries (`encode`/`decode`), add A4 PDF packing, Live Scan, and a licensing check via ETH/USDT on your address. This repo avoids touching your C++ core.

## Features
- Runs your binaries for Encode/Decode.
- Packs PNG chunks into A4 PDF (3x3 grid).
- Live Scan: assemble chunks from a line-feed barcode scanner.
- License: machine fingerprint + payment check (USDT>=1500 or ETH>=0.5).
- Hardening: `asar`, minification, JS obfuscation, optional AES-GCM layer for a bootstrap file.

> No protection is absolute. Keys live in memory at runtime. This stack raises attacker cost.

## Dev
1. Copy `.env.example` to `.env`, set:
   - `ETH_RPC`
   - `BIN_ENC` / `BIN_DEC` (your built C++ binaries)
2. `./start-dev.sh`

## Build
- Linux AppImage: `bun run dist:linux`
- Windows NSIS .exe: `bun run dist:win`

Artifacts are placed in `packages/app/release/`.

## Commands
- `bun run dev` — run Next (UI) + Electron.
- `bun run pack-a4 <dir> <out.pdf>` — build A4 sheets.
- `bun run scan-live` — collect chunks from scanner (stdin).

## Notes on hardening
- `electron-builder` with `asar: true`.
- `javascript-obfuscator` passes: control-flow, dead-code, string-array, debug-protection.
- Optional AES-GCM: decrypt a small bootstrap at runtime with a key derived from machineHash + secret.
- Consider code signing and a commercial native protector for Windows if you need more (VM-based).
