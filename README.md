# G923 iPad Bridge & Compatibility Tester

A browser-only web app (React + TypeScript + Vite, no backend) that tests whether a **Logitech G923 Racing Wheel,
PlayStation/PC edition** can talk to an **Apple iPad Pro (M5, iPadOS 27)** over a USB-A → USB-C adapter. It
reads everything the browser actually exposes and reports exactly what is blocked.

> **Honest expectation:** iPadOS Safari (and every other iPadOS browser, all of which use WebKit) does **not** implement
> WebHID or WebUSB. On the iPad the app will almost certainly report **Unsupported** and explain why.
> The same app works fully on desktop Chrome/Edge, where it can open and decode the wheel for real. See
> [docs/FINDINGS.md](docs/FINDINGS.md) for the research and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Features

| Area | What it does |
|---|---|
| **Connection status** | Connected / Disconnected / Unsupported, from real sources only. Shows device name, VID/PID (when exposed), connection method, browser, OS, report rate. |
| **Capability detection** | WebHID, WebUSB, Gamepad API, vibration actuator, Web Serial, Web Bluetooth, secure context, Permissions-Policy, iframe, storage. Each failure says which API or permission is missing. |
| **Device discovery** | WebHID with Logitech vendor ID `0x046D` (the product ID is read from the device, never assumed), WebUSB read-only descriptor inspection, and Gamepad API enumeration. |
| **Input decoding** | Generic HID report parser driven by the device's own descriptor. Report-length validation, raw byte log, changed-byte highlighter. |
| **Live dashboard** | Steering −100…+100 % with an animated wheel, accelerator/brake/clutch 0…100 %, raw values, and every discovered axis. |
| **Button tester** | G923 PS wheel diagram that you teach by tapping a control and pressing it. Highlights pressed controls, shows identifiers and state, and keeps an event log. |
| **Force feedback** | Availability report (Gamepad rumble, HID output and PID descriptors), a clamped low-strength rumble test only if the documented API exists, and an always-visible **STOP**. Never sends HID output reports. |
| **Calibration** | The 7 required steps plus optional clutch. Axis roles are learned from movement. Dead-zones, saturation, smoothing and inversion. Saved locally per device. |
| **Diagnostics** | Stage-by-stage "what actually works" verdicts and a full report with **JSON export**. |
| **Bridge options** | Realistic paths to make the wheel usable for iPad games, plus live translation-layer output and profile export. |
| **Simulation demo** | Optional synthetic data with a striped banner and SIMULATED tags everywhere. It never changes the hardware status. |

## Setup

Requirements: Node.js 20+ (tested with 22).

```bash
npm install
npm test            # unit tests for the parser / translation / calibration core
npm run build       # type-check + production build into dist/
```

### Run on the iPad (needs HTTPS)

Device APIs only exist in a **secure context**. Two options:

**A. GitHub Pages (simplest).** In the repository settings, set **Pages → Source: GitHub Actions**. Then run the *Deploy to GitHub Pages*
workflow (it runs on pushes to `main`, or manually via *Run workflow*). Open the published `https://…github.io/…` URL in
Safari on the iPad.

**B. Local network with a self-signed certificate.**
```bash
npm run dev:https     # prints https://<your-computer-ip>:5173
```
Open that URL on the iPad (same Wi-Fi) and accept the certificate warning.

(Plain `npm run dev` gives `http://` on the LAN. It is not a secure context, so the app will report that.)

## Testing procedure

1. Connect the G923 to its **power adapter** and wait for the centring rotation. That only shows it has power.
2. Connect the wheel's USB cable through the USB-A → USB-C adapter to the iPad.
3. Open the app in Safari. Check the **Dashboard** status and the capability list.
4. Press several wheel buttons (the Gamepad API only reports a controller after a button press).
5. If WebHID is available (desktop Chrome/Edge): tap **Connect via WebHID**, pick the wheel, and confirm frames arrive.
6. **Calibration:** follow the steps. **Button Tester:** tap each control and press it to map it.
7. **Diagnostics → Export JSON** and keep the report. Fill in the table at the bottom of `docs/FINDINGS.md`.

### Validate the wheel and cable on a computer
Open the same URL in **Chrome or Edge on macOS/Windows/Linux**, connect the wheel, and use *Connect via WebHID*.
This exercises the whole pipeline for real: discovery, descriptor, decoding, calibration. It confirms the wheel, cable
and adapter work independently of iPadOS limits.

## What a browser cannot do

- It cannot create a virtual game controller that iPadOS or other apps can see. This app **does not** make unsupported games
  recognise the G923.
- It cannot read USB devices on iPadOS (no WebHID or WebUSB in WebKit).
- It cannot read the exact iPad model, chip or (with Safari's default desktop UA) the exact iPadOS version. The app shows
  an *inferred* version and labels it.

For iPad game support, see **Bridge Options** in the app: a native USBDriverKit app (unverified, needs Apple
entitlements, only your own app benefits), an external hardware bridge (presents a gamepad, not a wheel), or streaming from a
PS5/PC that has the wheel connected (works today, with force feedback).

## Safety

- No HID output or feature reports and no USB OUT transfers exist anywhere in the code.
- Rumble is only via the W3C `playEffect()` API, clamped to 25 % strength and 400 ms in code.
- **STOP** (header and Force Feedback page) resets every actuator. If the wheel ever moves unexpectedly, unplug its power.

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The `src/core` folder has no browser dependencies, so it can be ported to a
native Swift app, a DriverKit companion, or bridge firmware.
