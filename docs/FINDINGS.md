# Findings: Logitech G923 (PlayStation edition) ↔ iPad Pro M5 / iPadOS 27

**Status of this document:** this is research based on public Apple and WebKit documentation as of November 2026.
It has **not** yet been verified on your hardware. The app measures each item at runtime. Open
**Diagnostics → Export JSON** on the iPad with the wheel connected to get the verified result, and record it in the
table at the bottom.

## Short answer

| Question | Expected answer on iPadOS 27 Safari | Confidence |
|---|---|---|
| Can a web page open the G923 over USB/HID? | **No.** WebKit on iOS/iPadOS implements neither WebHID nor WebUSB, and every iPadOS browser uses WebKit (outside the EU alternative-engine programme). | High: the app checks `navigator.hid` / `navigator.usb` directly |
| Can a web page see it through the Gamepad API? | **Almost certainly not.** WebKit's iPadOS gamepad support comes from the GameController framework, which supports specific controllers (Xbox, DualShock/DualSense, MFi, …) and offers its racing-wheel class only on macOS / Mac Catalyst. | Medium–high: the app tests this live (press a wheel button) |
| Can a native Swift app read the wheel? | **Possibly**, with a USBDriverKit driver extension on an M-series iPad, Apple-approved entitlements, and raw USB parsing (HIDDriverKit is not available on iPadOS). Not proven for this device. | Unverified: needs a prototype |
| Can iPad games use the wheel? | **Not through any software on the iPad itself.** There is no public API to create a system-wide virtual controller. Options: an external hardware bridge presenting a supported gamepad, or streaming from a PS5/PC that has the wheel. | High |
| Is force feedback reachable? | **No** on iPadOS. The G923's force-feedback protocol is not publicly documented, and this app never sends guessed commands. | High |

## Stage-by-stage

### Stage 1: iPadOS browser API investigation
- **WebHID:** not available in Safari or any WebKit browser on iPadOS. Apple has not shipped it, and WebKit has no public plan to.
- **WebUSB:** not available. WebUSB has received a negative standards position from at least one browser vendor.
- **Gamepad API:** available in Safari. On iPadOS it only lists controllers the system GameController framework recognises. A controller appears only after a button press (fingerprinting protection).
- **Secure context:** device APIs need HTTPS. Use the GitHub Pages build or `npm run dev:https`.
- **Device identity:** web pages cannot read the iPad model, the chip (M5), or (with the default desktop-class UA) the exact iPadOS version. The app infers the version from Safari's major version and labels it as inferred.

### Stage 2: Feature detection (implemented)
`src/platform/capabilities.ts` checks `navigator.hid`, `navigator.usb`, `navigator.getGamepads`, the vibration actuator, Web Serial,
Web Bluetooth, secure context, Permissions-Policy, iframe embedding and storage. Every "unavailable" result explains
which API is missing and why.

### Stage 3: Real device discovery (implemented)
- WebHID: `requestDevice({filters:[{vendorId:0x046D}]})`. Logitech's vendor ID is the only identifier used. The product ID
  is read from the device and never assumed. "Any device" mode is available for investigation.
- WebUSB: read-only descriptor inspection (device/interface classes, endpoints). No interface is claimed and no transfer is made.
- Gamepad API: lists all pads and flags wheel-like IDs. Chromium includes `Vendor: 046d Product: xxxx` in the ID string.
- **Expected on iPad:** WebHID and WebUSB buttons are disabled (APIs absent). Gamepad list is empty.

### Stage 4: Input decoding (implemented, verified with a mock device)
- The report layout is built from the descriptor the browser exposes (`HIDCollectionInfo`). Axes, buttons, hat switches
  and vendor fields are decoded generically using the standard HID usage tables.
- The first report of each ID is checked against the descriptor's predicted size, and any mismatch is shown.
- The raw byte view highlights bytes that change, so controls can be located even if a descriptor is unusual.
- Verified in headless Chromium against an injected mock HID device with a generic, hand-written descriptor (not the
  G923's), and by 14 unit tests. **Not yet verified against a physical G923.**

### Stage 5: Live dashboard (implemented)
Steering (−100…+100 %), accelerator, brake and clutch (0…100 %), with numbers, animated bars, raw values and the
list of all discovered axes. Panels stay empty, never filled with placeholders, until real data arrives.

### Stage 6: Calibration and diagnostics (implemented)
- The 7 required steps plus 2 optional clutch steps. The axis for each role is **learned from which axis moved**, so no
  axis numbering is assumed. Results are saved to `localStorage` per device (VID:PID).
- Diagnostic report with JSON export: device and browser info, API availability, detection results, axes, buttons,
  force feedback, stage verdicts, errors.

### Stage 7: Making inputs available to iPad games
See the **Bridge Options** page and [ARCHITECTURE.md](ARCHITECTURE.md). Summary:

1. **Web app:** cannot inject a controller into iPadOS.
2. **Native GameController app:** the G923 isn't a supported iPadOS controller, and `GCRacingWheel` is macOS / Mac Catalyst only.
3. **Native app + USBDriverKit driver:** the most promising iPad-only route, but only *your* app (or apps that
   integrate with your driver) receive input. It needs Apple entitlements for the vendor ID. Open question: whether the system HID driver
   prevents a third-party driver from matching. No force feedback.
4. **External hardware bridge** (a microcontroller with USB host reads the wheel and presents a supported controller): games
   see a gamepad, not a wheel. There are legal and licensing considerations around controller identity (MFi is the
   proper route for a product).
5. **Streaming from a PS5 or PC:** works today with full force feedback. The wheel is connected to the host, not the iPad.

## Physical-layer notes for testing
- The G923 performs its centring rotation as soon as it has external power, and **that only proves it has power**. It says
  nothing about USB data reaching the iPad.
- If USB-A → USB-C adapters are under suspicion, try another one. The iPad should supply bus power to a USB-A device,
  but iPadOS shows no list of USB devices it has enumerated. This app (WebHID absent) cannot see the device either way,
  so a working adapter cannot be confirmed from Safari.
- To validate the wheel, adapter and cable independently, open the same app in Chrome or Edge on a Mac/PC: WebHID will
  list and decode the wheel there.

## Verified results (fill in from the exported report)

| Item | Result on iPad Pro M5 / iPadOS 27 | Date |
|---|---|---|
| `navigator.hid` present | | |
| `navigator.usb` present | | |
| Gamepad API lists the G923 after button press | | |
| Real input frames received | | |
| Force-feedback API available | | |

## Sources
- WebKit / Safari support status for WebHID: https://caniuse.com/webhid
- WebUSB standards status: https://web-platform-dx.github.io/web-features-explorer/features/webusb
- Apple `GCRacingWheel` availability: https://developer.apple.com/documentation/gamecontroller/gcracingwheel
- Creating drivers for iPadOS (DriverKit families, M-series requirement, entitlements): https://developer.apple.com/documentation/driverkit/creating-drivers-for-ipados
- HIDDriverKit not available on iPadOS (Apple Developer Forums): https://developer.apple.com/forums/thread/707559 and https://developer.apple.com/forums/thread/743193
- macOS Ventura racing wheel support (G29/G920): https://www.macrumors.com/2022/06/07/macos-ventura-supports-racing-wheels-and-pedals/
