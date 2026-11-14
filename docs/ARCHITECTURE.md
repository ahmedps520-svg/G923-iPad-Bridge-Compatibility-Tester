# Architecture

```
src/
├─ core/                 ← platform-agnostic, no DOM — portable to Swift / firmware
│  ├─ types.ts           RawFrame, DeviceProfile, TranslatedState, physical button ids
│  ├─ hidUsages.ts       names from the public USB-IF HID Usage Tables
│  ├─ hidReportParser.ts descriptor → bit layout → decoded axes/buttons/hats
│  ├─ translation.ts     normalisation, dead-zones, smoothing, mapping, virtual-gamepad output
│  ├─ calibration.ts     wizard steps + "which axis moved" solver
│  ├─ profileStore.ts    localStorage persistence
│  └─ core.test.ts       unit tests (generic fixture, not a G923 descriptor)
├─ platform/             ← browser adapters
│  ├─ capabilities.ts    feature detection + environment info
│  ├─ hidSource.ts       WebHID: request, open, decode, reconnect (read-only)
│  ├─ usbInspector.ts    WebUSB: descriptor inspection only
│  ├─ gamepadSource.ts   Gamepad API polling
│  ├─ forceFeedback.ts   capability assessment, clamped rumble test, emergency stop
│  └─ simulationSource.ts clearly-labelled demo generator
├─ state/                ← app hub, logs, diagnostics report
├─ components/ pages/    ← React UI
```

## Data flow

```
Device ──► Source (WebHID | Gamepad | Simulation)
              │  RawFrame { axes[], buttons[], hats[], simulated }
              ▼
         translate(frame, DeviceProfile, prevState)   ← pure, src/core/translation.ts
              │  TranslatedState { steering, throttle, brake, clutch, buttons }
              ├─► Dashboard / Button tester / Calibration
              └─► toVirtualGamepad()  → bridge output format (W3C standard gamepad)
```

Hardware status (`connected / disconnected / unsupported`) is derived only from real sources. The simulation
source has its own device key (`simulation`), sets `simulated: true` on every frame, and cannot change the status.

## Reusing the core in other implementations

| Target | What to reuse | What to replace |
|---|---|---|
| Native iPadOS app + USBDriverKit dext | `hidReportParser` logic (bit extraction, layout from descriptor), `translation`, `calibration` | The descriptor comes from the USB configuration's HID descriptor (parse report-descriptor bytes yourself). Input comes from interrupt-IN transfers forwarded by the dext through an `IOUserClient`. |
| External microcontroller bridge | `translation.ts` maths, `toVirtualGamepad` mapping, exported profile JSON | USB-host HID stack on the MCU; output as a controller type iPadOS supports |
| Desktop companion (Chrome/Edge) | Everything, unchanged | Transport if you forward state to your own app |

The exported **bridge profile** (`Bridge Options → Export profile JSON`) contains the calibration points, axis ids,
button map and processing settings, so a native or firmware implementation can apply identical normalisation.

## Safety invariants
- No `sendReport`, `sendFeatureReport`, `receiveFeatureReport`, `claimInterface`, or OUT transfers exist in the codebase.
- Rumble is only via `GamepadHapticActuator.playEffect`, clamped to 25 % / 400 ms in code, and reset afterwards.
- A global emergency stop calls `reset()` on every actuator.
