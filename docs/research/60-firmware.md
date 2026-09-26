# 60 — OP-XY firmware: container, encryption, and TE's SysEx vocabulary

> Research date 2026-09-26. Reference firmware: OS 1.1.33 (see `docs/DECISIONS.md` D3).
> Sources are public only: TE's downloads page, the `.tfw` files it links, and the JavaScript of TE's
> own web apps (the MIDI update utility and the EP sample tool). **Nothing was sent to the owner's
> OP-XY for this work.** Bulky inputs live in git-ignored `research/firmware/` and
> `research/web/firmware/`; re-create them with `scripts/firmware-inventory.py`.

## TL;DR

- **All 22 public OP-XY builds (OS 1.0.9 to 1.1.33) are encrypted.** The `.tfw` file has a small
  plaintext header (versions, SKU, two CRC-16s, a per-build 16-byte IV, the plaintext length) and
  then about 97.5 MB of ciphertext plus a 256-byte trailer. The ciphertext is statistically uniform
  everywhere (entropy 7.9961 to 7.9979 bits/byte on every 64 KiB block, chi-square 264 on 255 d.o.f.),
  holds no strings or file signatures beyond random chance, and two near-identical releases share
  no aligned ciphertext blocks. **No MIDI tables, parameter names, UI assets or USB strings can be
  extracted offline.** Decryption would need the device's key (not public) and so a hardware
  attack. That is out of bounds for this project.
- The container is **byte-for-byte the same layout as the OP-1 field's** and uses the same outer
  and inner headers as the EP series. We decoded every header field and confirmed both checksums
  (CRC-16/XMODEM) on all five builds we downloaded. See [Container format](#2-container-format-tfw).
- **The real payoff is TE's update utility** (`teenage.engineering/apps/update`). Its JavaScript
  contains TE's shared SysEx client library and lists the OP-XY (`TE033AS001`) as a supported device.
  From it we documented the TE SysEx frame format, request IDs, status codes, 7-bit packing and the
  commands **GREET (0x01), ECHO (0x02), DFU (0x03), SETTINGS (0x06)**. The EP sample tool adds
  **FILE (0x05)**. Machine-readable version: `knowledge/firmware/te-sysex.json`.
- **GREET is how our app can read the OS version.** The standard MIDI identity reply from the
  owner's unit has zeroed version bytes (see `90-device-probe.md`). TE's updater gets the version
  from a GREET reply (`os_version:…;sku:…;serial:…`). The exact request bytes for the owner's unit
  are `F0 00 20 76 21 40 60 01 01 F7`. This is the top candidate for the next read-only probe, but
  it needs the owner's approval first because it has never been sent.
- **SETTINGS (0x06)** returns a device's settings as typed JSON (ids, ranges, choices). **FILE
  (0x05)** is a small filesystem over SysEx. We don't yet know whether the OP-XY implements either.
  If it does, we could read device settings or even project files over plain MIDI. Worth testing,
  with the owner's approval.
- The **DFU command (0x03) must never be sent.** A single `DFU ENTER` frame reboots the unit into
  TE Boot. Our MIDI transport should hard-block any outgoing frame matching
  `F0 00 20 76 ?? 40 ?? ?? 03`.
- **Architecture** (TE's official spec plus inference): dual **Analog Devices Blackfin** cores, each
  with its own DDR, a triple-core DSP co-processor, and two small MCUs (wireless and low-power IO).
  So it is not ARM and not Linux: a bare-metal/RTOS Blackfin system booted by **TE Boot**, in the
  same lineage as the OP-Z (Blackfin 70x) and the original OP-1.

---

## 1. Download inventory

Source page: <https://teenage.engineering/downloads/op-xy> (saved to
`research/web/firmware/downloads-op-xy.html`, text in `downloads-op-xy.txt`). Download URL pattern:
`https://teenage.engineering/_software/op-xy/opxy_firmware_<major>_<minor>_<patch>.tfw`.
Machine-readable feed: `https://teenage.engineering/_software/releases.json` lists the latest build
per SKU (OP-XY: `TE033AS001` → `1.1.33`, with `fw_url`, `link` and `release_notes`). It sends **no
CORS headers**, so our static web app can't read it from the browser. Snapshot it at build time or
fetch it from the agent's server side.

Five builds were downloaded in full to `research/firmware/<version>/`. For the other 17 we fetched
only the first 1 KiB with HTTP Range requests (`research/firmware/headers/`). Every row is in
`knowledge/firmware/opxy-firmware-inventory.json`.

| OS     | Date       | File bytes | Plaintext bytes | IV (first 4 B) | Local copy / SHA-256                                                                                                                          |
| ------ | ---------- | ---------: | --------------: | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.9  | 2024-11-14 | 97,541,216 |      97,540,057 | `8f96be4c`     | `d66fc1d3c413f907aabe4b043121cc73a9945012ddcadcd3c15caaaae19c133e`                                                                            |
| 1.0.13 | 2024-12-05 | 97,551,760 |      97,550,593 | `806d6be4`     | header only                                                                                                                                   |
| 1.0.15 | 2024-12-18 | 97,563,216 |      97,562,063 | `cf02bb54`     | header only                                                                                                                                   |
| 1.0.21 | 2025-01-16 | 97,563,456 |      97,562,296 | `b65e2b01`     | header only                                                                                                                                   |
| 1.0.25 | 2025-02-03 | 97,493,264 |      97,492,099 | `761e9753`     | header only                                                                                                                                   |
| 1.0.29 | 2025-02-25 | 97,520,320 |      97,519,158 | `559fe2b9`     | header only. **Withdrawn**: marked "unavailable" on the page but still downloadable. It corrupted files > 64 KB copied off the unit over MTP. |
| 1.0.32 | 2025-03-11 | 97,525,440 |      97,524,279 | `5a4bdf9c`     | header only                                                                                                                                   |
| 1.0.36 | 2025-03-21 | 97,525,968 |      97,524,809 | `74b7e7be`     | header only                                                                                                                                   |
| 1.0.38 | 2025-04-01 | 97,528,672 |      97,527,518 | `ce5232f9`     | header only                                                                                                                                   |
| 1.0.40 | 2025-05-06 | 97,529,056 |      97,527,896 | `fb960919`     | header only                                                                                                                                   |
| 1.0.45 | 2025-06-27 | 97,534,224 |      97,533,063 | `9c8f18ad`     | header only                                                                                                                                   |
| 1.0.50 | 2025-08-26 | 97,541,200 |      97,540,041 | `3b8c4316`     | header only                                                                                                                                   |
| 1.1.0  | 2025-10-15 | 97,553,600 |      97,552,447 | `0f63258e`     | `01bb6b235e95d84454d57102398ca2a96c00c4a31fd068cb487f2cd4979642f8`                                                                            |
| 1.1.3  | 2026-02-10 | 97,556,608 |      97,555,447 | `e7e82eb4`     | header only                                                                                                                                   |
| 1.1.4  | 2026-02-17 | 97,556,688 |      97,555,524 | `000345a8`     | header only                                                                                                                                   |
| 1.1.15 | 2026-07-01 | 97,696,832 |      97,695,679 | `2bfe152b`     | `fb91b5884a626d77d8fee16fbdc7611802de86409c91f9ba3a56bf58a870da41`                                                                            |
| 1.1.17 | 2026-07-05 | 97,698,560 |      97,697,403 | `f3b47db4`     | header only                                                                                                                                   |
| 1.1.18 | 2026-07-06 | 97,699,424 |      97,698,267 | `30631fe6`     | header only                                                                                                                                   |
| 1.1.21 | 2026-07-11 | 97,701,232 |      97,700,078 | `5f3e63b6`     | header only                                                                                                                                   |
| 1.1.25 | 2026-08-19 | 97,701,536 |      97,700,377 | `c32bdfc3`     | header only                                                                                                                                   |
| 1.1.32 | 2026-09-01 | 97,707,920 |      97,706,762 | `8c0dbea2`     | `2a8f4eb19735bfb84ca0e5fb7458c0eb0f1dd23a0e69975e673be967127a37c7`                                                                            |
| 1.1.33 | 2026-09-02 | 97,707,984 |      97,706,817 | `daa772fd`     | `b9fd56529e4833d4f30d9b28a63866d4fb361fd0d046b04e7ecca9be7da77139`                                                                            |

Notes:

- The image barely changes size between releases (tens of KB, and +140 KB for the big 1.1.15
  feature release). So most of the ~97.5 MB is presumably static data (content, graphics, DSP/MCU
  images) rather than code. That is an inference, since we can't see inside.
- TE also publishes other products in `releases.json`: TX-6, OP-1 field, CM-15, TP-7, EP-133,
  EP-1320, EP-40, EP-136, and `spider` (a `.bin`).

## 2. Container format (`.tfw`)

Field map (also in `knowledge/firmware/tfw-container.json`). It holds for **all 22 builds**, with
every byte not listed below equal to zero before `0x380`:

| Offset    | Size        | Field            | OP-XY 1.1.33 value / rule                                                             |
| --------- | ----------- | ---------------- | ------------------------------------------------------------------------------------- |
| `0x00`    | 4           | outer magic      | `BA BE CA FE`                                                                         |
| `0x04`    | 1           | outer type       | `00`. The updater forwards it as `firmware_type` in DFU BEGIN.                        |
| `0x05`    | 2           | outer CRC        | **CRC-16/XMODEM of `file[0x40:]`**, big-endian (`59 00`)                              |
| `0x07`    | 8           | version          | 4 × u16 BE = `1.1.33.0` (4th field = build; printed as `+n` when non-zero)            |
| `0x0F`    | 4           | SKU              | u32 BE bitfield `00 08 40 01` → family 33, kind 0 = "AS", member 1 → **`TE033AS001`** |
| `0x40`    | 4           | inner magic      | `BE EF CA FE`                                                                         |
| `0x44`    | 1           | inner type       | `01` (same on OP-1 field)                                                             |
| `0x45`    | 4           | inner body size  | u32 BE = file length − `0x80`                                                         |
| `0x49`    | 2           | inner CRC        | **CRC-16/XMODEM of `file[0x80:]`**, big-endian (`50 A6`)                              |
| `0x4B`    | 8           | version (copy)   | same encoding as `0x07`                                                               |
| `0x57`    | 4           | SKU (copy)       | same encoding as `0x0F`                                                               |
| `0x84`    | 1           | key index        | `00` on every OP-XY build (see below)                                                 |
| `0xF0`    | 16          | IV               | random-looking, different in every build                                              |
| `0x100`   | 4           | plaintext length | u32 **LE** (`97,706,817`)                                                             |
| `0x380`   | ⌈len/16⌉·16 | ciphertext       | AES-style block cipher output, padded to 16 bytes                                     |
| end − 256 | 256         | trailer          | opaque and uniform; RSA-2048-sized (signature or wrapped key, unknown)                |

Checks we ran:

- Both CRCs verified on the five complete files. The outer CRC deliberately skips the outer header,
  so the outer SKU/version bytes aren't covered by it. The EP community exploits exactly that to
  cross-flash EP units; see prior art below.
- Every invariant held across all 22 headers: types `00`/`01`, body size = length − 0x80,
  version/SKU copies equal the outer fields, key index 0, trailer exactly 256 bytes.
- **Encryption evidence** (1.1.33, 97,707,088 payload bytes from `0x380`):
  - entropy per 1 MiB block ≥ 7.99908 and per 64 KiB block 7.9961 to 7.9979 (median 7.9972, which
    is the theoretical value for random bytes);
  - chi-square over the byte histogram 264 (df 255). Compressed-but-unencrypted images usually
    score far higher and show low-entropy islands, and there are none here;
  - `strings -n 6` finds 169,672 hits against ~160,000 expected from random bytes, and ≥ 10
    chars finds 3,336 against ~3,043. No meaningful words appear (the only "matches" for
    `.xy`/`midi`-style keywords are noise like `D@.XYC!W`);
  - 3-byte signatures (gzip `1F 8B 08`, `BZh`, LZMA `5D 00 00`) occur 3 to 9 times, which is the
    random expectation of ~5.8. No 4-byte magic (ELF, xz, zstd, squashfs, FIT, uImage, LZ4, ZIP,
    RIFF, PNG…) occurs anywhere. zlib/raw-deflate/gzip/xz/LZMA/bzip2 decoders fail at every
    candidate offset;
  - no repeated 16-byte blocks in the first 20 MB, which rules out ECB. 1.1.32 and 1.1.33 (a
    one-line fix apart) share **zero** aligned 16-byte blocks: the per-build IV/key changes the
    whole ciphertext;
  - the ciphertext length is always the plaintext length rounded **up to 16**. That fits a padded
    block mode such as AES-CBC and argues against a stream mode like CTR.
- **Key index `0x84`.** The OP-1 field archive (`op1hacks/op1-field-fw-archive`) has `FF` at `0x84`
  in builds 1.1.2 and 1.1.4 and `00` from 1.1.6 on. Community researcher `_bt` (OP-Forums "Custom
  Firmware on the OP-1", May 2023 and Jan 2024) reported that OP-1 field ≤ 1.1.5 was encrypted with
  the OP-Z's key, recovered through a decrypt oracle plus a bootloader dump, and that the key changed
  at 1.1.6. The OP-XY has always used index `00`, the newer key. No public source has that key.

### How it compares with TE's other formats (prior art)

| Product                   | Container                                                                                                   | Payload                                                    | Public status                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP-1 (original, Blackfin) | `.op1` = CRC-32 (LE) + LZMA-compressed tar holding `te-boot.ldr`, `OP1_vdk.ldr` and `content/display/*.svg` | unencrypted                                                | fully unpackable/repackable ([op1hacks/op1repacker](https://github.com/op1hacks/op1repacker)); UI graphics were plain SVGs                                                                                                                                  |
| OP-Z (Blackfin 70x)       | `.zfw`, IV at `0x70`, encrypted filename block at `0x300`                                                   | AES-CBC                                                    | key recovered by `_bt` via a device oracle + bootloader dump (OP-Forums); not published                                                                                                                                                                     |
| OP-1 field                | `.tfw`, **identical layout to OP-XY**                                                                       | AES; key index `FF` (≤ 1.1.5, OP-Z key) then `00`          | `_bt` reports decrypting ≤ 1.1.5 with the OP-Z key; later builds not                                                                                                                                                                                        |
| EP-133 / EP-40 / EP-1320  | `.tfw` with the same `babecafe`/`beefcafe` headers and CRCs, but a **MCUboot image** at `0x80`              | MCUboot AES-128-CTR, per-image key wrapped with ECIES-P256 | not decryptable offline ([seajaysec/ep-unity research notes](https://github.com/seajaysec/ep-unity); CRC identified by Charles Vestal); [wmealing's EP-133 entropy write-up](https://wmealing.bluegum.systems/reverse-engineering-teenage-engineering.html) |
| **OP-XY**                 | `.tfw`, OP-1-field layout, key index `00`                                                                   | AES block mode, per-build IV                               | **not decryptable offline**                                                                                                                                                                                                                                 |

Techniques that worked elsewhere, and why they don't apply here:

- op1repacker-style unpacking needs an unencrypted image.
- The OP-Z key recovery used a device-side decrypt oracle plus a bootloader dump. That means
  tampering with hardware and running unusual update traffic, which our "never harm the device"
  rule forbids.
- The EP work stopped at the same wall and names an SWD/JTAG dump of a running unit as the only
  remaining path. Also off-limits for us.

## 3. How updates reach the device

1. **TE Boot, mass storage** (official guide, chapter 24): power on while holding COM → TE Boot menu
   (1 upload firmware, 7 factory reset, 8 system menu) → press track 1 → the unit mounts as a USB
   disk → copy the whole `.tfw` → eject → it installs.
2. **MIDI DFU** via TE's browser update utility: it streams `file[0x40:]` (inner header plus body)
   in TE SysEx DFU chunks. The device decrypts and verifies on-board. The host-side JavaScript has no
   crypto code.

## 4. The TE SysEx protocol (byte level)

We derived this from the update utility's bundle (`/apps/update/assets/index-C4sb_ae6.js`, SHA-256
`7effff13…ad05ef9`, Sentry release `41b8af14…`) and the EP sample tool bundle
(`index-C1wBjhTa.js`, `d032b3a1…cb5d7a98`). Both embed the same TE client library. Pretty-printed
copies live in `research/web/firmware/*/index.pretty.js` (the protocol code is around lines
21,770–22,950 of the updater). Community captures on EP devices
([kmorrill/ep-series-sysex](https://github.com/kmorrill/ep-series-sysex)) agree with everything
below.

### 4.1 Discovery: Universal Identity, then GREET

For each MIDI output port it sees, the updater sends the universal identity request
`F0 7E 7F 06 01 F7` (up to 10 tries, 500 ms apart). It accepts a 17-byte reply with manufacturer
`00 20 76` at bytes 5–7 and decodes:

- `device_id = reply[2]`. This byte is echoed into **byte 4 of every TE SysEx frame** sent to that
  device.
- `SKU = "TE" + pad3(reply[8] | reply[9] << 7) + "AS" + pad3(reply[10] | reply[11] << 7)`.

The owner's unit replied `F0 7E 21 06 02 00 20 76 21 00 01 00 00 00 00 00 F7` (`90-device-probe.md`),
which gives `device_id = 0x21` and **SKU `TE033AS001`**, exactly the value the updater expects for
the OP-XY. Next the updater sends **GREET** and parses the ASCII reply
`key:value;key:value;…`. It keeps these keys: `chip_id`, `mode` (`normal` | `bootloader` | `test`),
`os_version`, `product`, `serial`, `sku`, `sw_version`, `base_sku`. On the EP series `base_sku`
is the firmware lineage and `sku` the board revision; DFU must announce the lineage.

### 4.2 Frame format

```text
request : F0 00 20 76 <dev> 40 <0x60 | rid[11:7]> <rid[6:0]> <cmd> <packed7 payload…> F7
response: F0 00 20 76 <dev> 40 <0x20 | rid[11:7]> <rid[6:0]> <cmd> <status> <packed7 payload…> F7
debug   : F0 00 20 76 <dev> 33 <ASCII log text…> F7
```

- Byte 5 `0x40` marks a TE protocol frame. `0x33` marks a firmware **debug log line**; the EP
  community treats these as "stop all traffic, power-cycle".
- Byte 6 flags: `0x40` = is-request, `0x20` = request-id present. Its low 5 bits and byte 7 hold a
  **12-bit request id**. TE starts each port at a random 0–4094 and increments mod 4096. Responses
  echo the id and command and clear the is-request bit.
- Frames without a request id are unsolicited events (for example FILE events on EP devices).
- **Status byte** (responses only, _outside_ the packed payload): `0` ok, `1` error, `2` command
  not found, `3` bad request, `16–63` command-specific error, `≥ 64` command-specific success or
  "still working". In the last case the request stays open and the timeout restarts. Error payloads
  decode to an ASCII reason.
- **packed7:** each group of up to 7 raw bytes becomes one flag byte followed by 7 data bytes; bit
  _i_ of the flag holds the high bit of raw byte _i_. Encoded length = n + ⌈n/7⌉. Example: raw
  `07 D0 00 2C` → `02 07 50 00 2C`. Multi-byte integers inside payloads are big-endian.
- Timeouts in TE's client: 20 s by default, 500 ms per DFU chunk, 1 s for DFU EXIT.

### 4.3 Commands

| Cmd    | Name                  | Payload → reply                   | Our safety class                                                 |
| ------ | --------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `0x01` | **GREET**             | none → ASCII metadata (4.1)       | read-only; first probe to run, after owner approval              |
| `0x02` | ECHO                  | any bytes → the same bytes        | read-only link test                                              |
| `0x03` | **DFU**               | sub-commands below                | **forbidden** — block in the transport                           |
| `0x05` | FILE (EP sample tool) | filesystem sub-commands           | LIST/GET/INFO/META-GET read; PUT/DELETE/META-SET/MOVE/PLAY write |
| `0x06` | SETTINGS              | INIT / GET_ALL / SET              | INIT + GET_ALL read; SET writes                                  |
| `0x7F` | PRODUCT_SPECIFIC      | defined, never used by either app | never send                                                       |

**SETTINGS (0x06)** (sent automatically by the update utility to every device it finds):

- INIT `[01, 03, E8]` (1000). Status 0 means "settings supported" and makes the utility show a
  "settings" panel on the device card.
- GET_ALL `[02, page_hi, page_lo]`. Each reply is 2 bytes followed by a NUL-terminated JSON
  fragment. Concatenate pages until one comes back empty. Result:
  `{settings: [{desc, settings: [{id, desc, value, range?: {min, max, step}, choices?}]}]}`.
- SET `[03, id_hi, id_lo, <JSON value as ASCII>, 00]`.

If the OP-XY supports it, this would give us typed system settings with ranges for free.

**FILE (0x05)** (full detail in `te-sysex.json`): INIT `[01, flags, maxlen u32]` (flag 1 =
subscribe to events), LIST `[04, page u16, node u16]`, GET `[03, 00, id u16, offset u32]` then
`[03, 01, page u16]`, PUT `[02, 00, flags, id, parent, size u32, name, 00]` then data pages,
DELETE `[06, id]`, METADATA `[07, 01|02|04, …]`, INFO `[0B, id]`, MOVE `[0C, id, parent, new]`,
PLAYBACK `[05, 1|2, id, offset, len]`. Node flags: file 1, dir 2, read 4, write 8, delete 16,
move 32, playback 64. Events: 3 metadata-updated, 8 added, 9 updated, 10 deleted, 13 moved. On EP
units the FILE subsystem is single-threaded, and overlapping sessions wedge the device.

**DFU (0x03) — documented so we can recognise and block it, never to use:**

1. BEGIN `[02, version(8), B0, sku(4), size u32 (= file length − 64), firmware_type]` (19 raw bytes).
   The reply's first two bytes are the device's max message size (`max_msg`); chunk payload =
   ⌈max_msg × 7/8⌉ − 12 (default 235). A first byte of `0x40` makes the updater log "performing
   update in app". If BEGIN is rejected with status 3 (bad request), the updater treats that as
   "reboot to the bootloader first": it sends **ENTER** `[01, 01, 00, C8]` (the trailing 200 is
   probably a delay), closes the port, waits up to 20 s for the unit to come back with
   `mode:bootloader`, and retries BEGIN.
2. CHUNK `[03, n mod 256, next bytes of file[64:]]`, one outstanding at a time.
3. PERFORM `[04]`. Progress replies (status ≥ 64) carry a percentage in `data[0]` and a `[step]`
   label in ASCII.
4. EXIT `[05]`. Reply `data[0] × 3` = seconds to wait for the reboot (default 60). The updater then
   re-GREETs and compares `os_version` with the file.

Worked examples for the owner's unit (`dev = 0x21`, rid 1–6). **Computed offline and never sent:**

```text
GREET              F0 00 20 76 21 40 60 01 01 F7
ECHO DE AD BE EF   F0 00 20 76 21 40 60 02 02 0F 5E 2D 3E 6F F7
SETTINGS INIT      F0 00 20 76 21 40 60 03 06 04 01 03 68 F7
SETTINGS GET_ALL 0 F0 00 20 76 21 40 60 04 06 00 02 00 00 F7
FILE INIT (read)   F0 00 20 76 21 40 60 05 05 00 01 00 00 40 00 00 F7
FILE LIST p0 n0    F0 00 20 76 21 40 60 06 05 00 04 00 00 00 00 F7
```

### 4.4 Implementation notes for our MIDI layer

- **Echo.** The owner's unit echoed our identity request back to the host (`90-device-probe.md`).
  Drop any incoming TE frame whose byte 6 has the is-request bit (`0x40`) set; otherwise our own
  request comes back looking like a malformed reply. TE's client would reject such an echo as an
  error, which hints that the OP-XY does not echo TE frames. Verify during the GREET probe.
- Keep one TE request in flight per device, match replies by (command, request id), and honour
  status ≥ 64 as "keep waiting".
- On any `…33…` debug frame, stop all TE traffic and tell the user.
- The OP-XY's `COM` settings (clock/notes/"other" send/receive, echo) may filter SysEx. Probe with
  the unit in stock settings.
- The update utility warns that **Chrome 152 on macOS broke Web MIDI** (ports present, no devices).
  TE's advice is to update Chrome (153 was due 2026-09-10) or use the beta. Our onboarding should
  detect and explain this case too.
- Firmware awareness: compare GREET `os_version` against `releases.json` (latest) and against
  `knowledge/firmware/changelog-midi-usb.json` (behaviour changes per version).

## 5. Architecture findings

- **TE's own spec** (product page, "hardware"): dual Blackfin processing cores, dual DDR memory, a
  triple-core DSP co-processor, and two controller MCUs "for wireless & low power IO domain".
  Marketing copy calls it "dual-cpu". Other specs: 480 × 222 IPS TFT, 6-axis IMU, BLE MIDI,
  USB-C audio/MIDI host and device.
- **Inference (unconfirmed):** two single-core Blackfin+ parts, each with its own DDR (hence "dual
  DDR"). The OP-Z spec names an "analog devices blackfin 70X" plus a "cirrus logic audio
  co-processor", so the OP-XY's triple-core DSP is plausibly a Cirrus-class audio DSP. The two MCUs
  are probably a BLE radio SoC and a key/LED/power controller.
- Consequences: **no ARM, no Linux.** Code is Blackfin machine code under a bare-metal or RTOS
  runtime. The original OP-1 shipped Blackfin LDR boot streams (`te-boot.ldr`, plus `OP1_vdk.ldr`,
  whose name suggests ADI's VisualDSP++ Kernel), and the OP-XY's TE Boot comes from the same
  bootloader family. Stock Ghidra has no Blackfin processor module (GNU binutils' `bfin` target
  historically disassembles it). All moot while the image is encrypted, so we did **not** run
  Ghidra.
- **USB** (from `90-device-probe.md`, not from the firmware): VID `0x2367`, PID `0x8021`,
  bcdDevice `0x0257` (meaning unknown), class-compliant UAC1 audio plus USB-MIDI, no MTP interface
  in normal mode (MTP is a separate mode).
- FCC ID **Z23033A** is TE's OP-XY filing. Its internal photos would identify the chips, but the
  public mirrors sit behind bot checks, so the owner can look manually in a browser.

## 6. String and table findings, by usefulness to us

| Area                                         | What we got                                                                                                                                                                                                                                                                                                                                                                         | Where                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **MIDI / SysEx (high)**                      | TE SysEx frame + command vocabulary with safety classes; identity decode; OP-XY device id `0x21`, SKU `TE033AS001`; GREET metadata keys                                                                                                                                                                                                                                             | `knowledge/firmware/te-sysex.json`, §4                                    |
| **Firmware-dependent MIDI behaviour (high)** | 45 paraphrased changelog items. Examples: a MIDI CC can trigger **project loads** (repeated requests crashed < 1.0.40, so rate-limit them); a **delayed-scene MIDI command** (≥ 1.1.0); a crash on certain SysEx fixed in 1.0.29; a **MIDI monitor** in the system menu (≥ 1.1.15), handy for verifying our output; BLE MIDI clock (≥ 1.0.29); patterns per track 9 → 16 (≥ 1.1.15) | `knowledge/firmware/changelog-midi-usb.json`                              |
| **Firmware metadata (medium)**               | per-build version, date, size, IV, plaintext length, hashes; container field map; `releases.json` feed                                                                                                                                                                                                                                                                              | `knowledge/firmware/opxy-firmware-inventory.json`, `tfw-container.json`   |
| TE product SKUs (low)                        | CM-15 `TE029AS001`, OP-1 field `TE002AS002`, TP-7 `TE025AS001`, TX-6 `TE028AS001`, EP-136 `TE032AS101`, EP-133 `TE032AS001`, EP-1320 `TE032AS005`, EP-40 `TE032AS006`, **OP-XY `TE033AS001`**                                                                                                                                                                                       | updater bundle                                                            |
| CC tables / NRPN                             | **not in reach** (encrypted). Use the online guide's MIDI reference plus device probes                                                                                                                                                                                                                                                                                              | guide chapter "midi reference" (rendered client-side; another workstream) |
| Engine parameters, `patch.json`, `.xy`       | **not in reach**. Use `kmorrill/xy-format`, the patch tools in `research/repos/`, and MTP exports                                                                                                                                                                                                                                                                                   | —                                                                         |
| UI fonts / icons / bitmaps                   | **not in reach**. The original OP-1 kept its screens as SVGs in `content/display/`, and the OP-XY's 97 MB image likely bundles similar assets, but they are encrypted                                                                                                                                                                                                               | `research/ui-reference/` (other workstream)                               |

## 7. What is and isn't feasible next

Feasible and useful, roughly in priority order. Every device step needs the owner's go-ahead and
gets logged in `90-device-probe.md`:

1. **GREET probe** (one frame, read-only by all evidence) → `os_version`, `serial`, `sku`,
   `base_sku`, `chip_id`, `sw_version`, and confirmation that the OP-XY speaks TE SysEx on USB.
   It also tells us whether the unit echoes TE frames.
2. **ECHO probe** to validate our packed7 codec end-to-end.
3. **SETTINGS INIT → GET_ALL** (TE's own utility sends INIT on connect). A zero-code alternative:
   the owner opens `teenage.engineering/apps/update` in Chrome with the unit connected and checks
   whether a "settings" link appears on the device card. They must not click update, and must not
   press `U` (it toggles "update anyway").
4. **FILE INIT (read, no subscribe) → LIST node 0.** If supported, we could read projects/presets
   over MIDI without switching to MTP. Status 2 ("command not found") would be a clean no.
5. Offline and safe now: a TypeScript `te-sysex` codec (packed7, framing, request-id matcher, status
   decoding, a **DFU deny-list** in the transport) with unit tests built from the examples in §4.3.
6. A firmware watch: poll `releases.json` plus the downloads page (build time or server side),
   diff the changelog, and flag the `.xy`/CC-map profiles as "unverified" on new OS versions.

Not feasible (or not acceptable):

- Offline decryption: the key is device-side and no public source has it.
- Ghidra or strings work on the payload, and any extraction of CC tables, parameter lists, string
  tables or UI assets from the firmware.
- Key recovery the way the OP-Z key was recovered (update-path oracle, bootloader dump) or via
  SWD/JTAG. That would mean tampering with the owner's hardware, which is against the project rules.

## 8. Safety rules (binding for all code and agents)

1. **Never send TE SysEx command `0x03` (DFU) in any form.** Enforce it in the MIDI transport: refuse
   any outgoing message starting `F0 00 20 76 xx 40 xx xx 03`. Also refuse `0x7F` (PRODUCT_SPECIFIC)
   and any TE command number we haven't documented.
2. Never run TE's update utility on the owner's behalf, never press its "update anyway" (`U`), never
   put the unit into TE Boot, never copy a `.tfw` to it, never trigger a factory reset.
3. SETTINGS SET and every FILE write (PUT, DELETE, METADATA SET, MOVE) change device state. Each one
   needs explicit owner approval, a fresh backup, and a revision entry (undo is sacred).
4. Read-only probes (GREET, ECHO, SETTINGS INIT/GET_ALL, FILE INIT/LIST/INFO/GET) still get
   announced and logged the first time. Keep one request in flight, stop on debug frames, and filter
   echoes.
5. Rate-limit program/project-load style CCs: older firmware crashed on repeated project-load
   requests.
6. Never recommend or supply OS 1.0.29, and treat MTP backups made on it as suspect.
7. Never modify, repack or cross-flash firmware. Never commit or redistribute `.tfw` files; they
   stay in git-ignored `research/firmware/`.

## 9. Open questions

> **Update 2026-09-26 (device probe, `90-device-probe.md`):** GREET ✅ (`os_version:1.1.33`,
> `hw_rev:2`, `dsp_serial` key present; no `chip_id`/`base_sku`), ECHO ✅, SETTINGS ❌ (status 2),
> **FILE ✅** (chunk 128 KiB; root = `drum`, `synth`, both empty and writable). TE-protocol requests
> are not echoed by the device.

- Does the OP-XY answer GREET, ECHO, SETTINGS and FILE over USB MIDI? What do `chip_id`,
  `sw_version` and `base_sku` hold?
- Does MIDI echo reflect TE SysEx requests too, or only foreign messages?
- Which AES variant and mode is used (128 or 256; CBC)? Is the 256-byte trailer a signature, a
  wrapped key, or encrypted metadata like the OP-Z's filename block?
- Is the OP-XY's key-index-0 key the same one the OP-1 field uses since 1.1.6?
- What fills the ~97.5 MB image: factory content, UI assets, DSP and MCU images?
- What does bcdDevice `0x0257` encode (bootloader or USB stack version)?
- Exact silicon: which Blackfin parts, which DSP, which MCUs? (FCC ID Z23033A internal photos.)

## 10. Files and reproduction

| Path                                                                                       | What                                                                                                                                   | Committed?      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `docs/research/60-firmware.md`                                                             | this document                                                                                                                          | yes             |
| `knowledge/firmware/te-sysex.json`                                                         | TE SysEx vocabulary + safety classes                                                                                                   | yes             |
| `knowledge/firmware/tfw-container.json`                                                    | `.tfw` field map                                                                                                                       | yes             |
| `knowledge/firmware/opxy-firmware-inventory.json`                                          | 22 builds: header fields, sizes, hashes                                                                                                | yes (generated) |
| `knowledge/firmware/changelog-midi-usb.json`                                               | MIDI/USB/MTP/SysEx changelog items, paraphrased                                                                                        | yes             |
| `scripts/firmware-inventory.py`                                                            | stdlib-only fetcher/parser/CRC verifier (HTTPS only, never touches MIDI/USB)                                                           | yes             |
| `research/firmware/<ver>/*.tfw`, `SHA256SUMS`, `headers/*.head1k`, `1.1.33/strings-n6.txt` | firmware bytes and dumps                                                                                                               | no (ignored)    |
| `research/web/firmware/`                                                                   | downloads page, `releases.json`, TE Boot / MIDI guide pages, update-utility and EP-sample-tool bundles (raw + pretty-printed), sitemap | no (ignored)    |

Reproduce: `python3 scripts/firmware-inventory.py --download 1.1.33` (headers for every build plus
one full file, CRCs verified). Parse any local file with `--parse path/to/file.tfw`.
