import { Card, Notice, SimTag, downloadJson } from '../components/ui';
import { toVirtualGamepad } from '../core/translation';
import { app, useLive } from '../state/app';
import { useStore } from '../state/store';

type Feas = 'no' | 'yes' | 'limited' | 'unverified';
const FEAS: Record<Feas, [string, string]> = {
  no: ['no', 'Not possible'],
  yes: ['ok', 'Works'],
  limited: ['warn', 'Possible with limits'],
  unverified: ['info', 'Needs prototyping'],
};

function Option({ title, feas, children }: { title: string; feas: Feas; children: React.ReactNode }) {
  return (
    <div className="option">
      <h3>
        {title} <span className={`tag ${FEAS[feas][0]}`}>{FEAS[feas][1]}</span>
      </h3>
      {children}
    </div>
  );
}

export function Bridge() {
  const { state, profile, simulated } = useLive();
  const caps = useStore(app, (s) => s.caps);
  const vg = state ? toVirtualGamepad(state) : null;

  return (
    <div className="grid g2">
      <div className="span2">
        <Notice kind="err" title="A web page cannot make iPad games see the G923">
          Browsers have no API to register a virtual game controller with iPadOS. Even where a browser can read the wheel (desktop
          Chrome via WebHID), the data stays inside that web page. Making unmodified iPad games recognise the wheel needs a
          system-level integration, which only the options below can provide.
        </Notice>
      </div>

      <Card title="Realistic options" className="span2">
        <div className="stack">
          <Option title="1 · This web app on iPadOS Safari" feas={caps.hid ? 'limited' : 'no'}>
            <ul>
              <li>WebHID and WebUSB are not implemented by WebKit on iOS/iPadOS{caps.env.isIOSFamily ? ` — confirmed on this device: navigator.hid is ${caps.hid ? 'present' : 'undefined'}, navigator.usb is ${caps.usb ? 'present' : 'undefined'}` : ''}.</li>
              <li>Safari's Gamepad API on iPadOS only exposes controllers the GameController framework supports, so the wheel only appears if iPadOS itself recognises it. The Dashboard shows whether it does.</li>
            </ul>
          </Option>

          <Option title="2 · Native iPadOS app with GameController framework" feas="no">
            <ul>
              <li>Apple's racing-wheel class <code>GCRacingWheel</code> is documented for macOS 13+ and Mac Catalyst 16+, with no iPadOS availability.</li>
              <li>If the Gamepad API test here detects nothing, a native <code>GCController</code> app will most likely see nothing either, because WebKit on iPadOS takes its gamepads from the same framework.</li>
            </ul>
          </Option>

          <Option title="3 · Native app + USBDriverKit driver extension (M-series iPad)" feas="unverified">
            <ul>
              <li>iPadOS 16+ supports DriverKit (USBDriverKit, PCIDriverKit, AudioDriverKit) on M-series iPads, so an M5 iPad Pro qualifies. <b>HIDDriverKit is not available on iPadOS</b>, so the driver would read the wheel's USB interrupt endpoint and parse HID reports itself. The parser in <code>src/core</code> was written to be ported for exactly this.</li>
              <li>Requires DriverKit entitlements approved by Apple for the device's USB vendor ID. The user turns the driver on in <i>Settings → General → Drivers</i>.</li>
              <li>Open risk: whether the system's own HID stack keeps the interface, which would stop a third-party driver from matching. Only a prototype on real hardware can answer this.</li>
              <li>Even if it works, only <b>your app</b>, or apps that integrate with your driver (<code>allow-third-party-userclients</code>), get the inputs. It does not create a system controller for other games.</li>
              <li>Force feedback would need Logitech's protocol, which isn't publicly documented, so it isn't feasible safely.</li>
            </ul>
          </Option>

          <Option title="4 · External hardware bridge (USB host microcontroller)" feas="limited">
            <ul>
              <li>A small board with a USB host port reads the G923 as a standard HID device. It applies the same normalisation and calibration as <code>src/core/translation.ts</code>, then presents itself to the iPad as a controller iPadOS already supports.</li>
              <li>Games then see a <b>gamepad, not a wheel</b>: steering becomes the left stick X axis, accelerator the right trigger and brake the left trigger. See the live output on the right. Analog resolution and wheel-specific features are reduced, and there is no force feedback.</li>
              <li>iPadOS only accepts specific controller types, such as MFi, Xbox, DualShock/DualSense and Switch Pro. Copying a licensed controller's identity raises legal and terms-of-service issues. The proper path for a commercial product is Apple's MFi programme.</li>
            </ul>
          </Option>

          <Option title="5 · Stream the game from a PS5 or PC" feas="yes">
            <ul>
              <li>Plug the G923 (PlayStation edition) into a PS5 or a PC, where it is natively supported with full force feedback. Then stream the game to the iPad with a remote-play or game-streaming app.</li>
              <li>The wheel never needs to talk to the iPad. This is the only route today that gives full wheel and force-feedback support on the iPad screen. The cost is added latency.</li>
            </ul>
          </Option>

          <Option title="6 · Use this app on desktop Chrome or Edge to validate the pipeline" feas="yes">
            <ul>
              <li>On macOS, Windows, Linux or ChromeOS, WebHID can open the wheel. Every stage of this app (discovery, decoding, calibration, mapping) can then be tested for real, and the exported profile reused by a native or hardware bridge.</li>
            </ul>
          </Option>
        </div>
      </Card>

      <Card title="Translation layer output (bridge format)" right={simulated ? <SimTag /> : null}>
        {!vg ? (
          <p className="muted">No live input to translate.</p>
        ) : (
          <>
            <p className="small muted">
              <code>toVirtualGamepad()</code> output in the W3C standard-gamepad layout. A hardware or native bridge would emit this shape.
              It is shown here only — nothing is sent anywhere.
            </p>
            <pre className="json">{JSON.stringify({ ...vg, leftStickX: +vg.leftStickX.toFixed(4), leftTrigger: +vg.leftTrigger.toFixed(4), rightTrigger: +vg.rightTrigger.toFixed(4), rightStickY: +vg.rightStickY.toFixed(4), buttons: vg.buttons.map((b, i) => (b ? i : null)).filter((x) => x !== null) }, null, 2)}</pre>
          </>
        )}
      </Card>

      <Card title="Export bridge profile">
        <p className="small muted">
          Exports the calibration, axis assignments, button mapping and processing settings as JSON. A native Swift app or bridge
          firmware can load it so it doesn't need re-calibrating.
        </p>
        <button
          className="btn primary"
          disabled={!profile}
          onClick={() =>
            profile &&
            downloadJson(`g923-bridge-profile-${Date.now()}.json`, {
              format: 'g923-bridge-profile/1',
              simulated,
              profile,
              outputLayout: 'w3c-standard-gamepad: steering→axes[0], brake→buttons[6] (LT), throttle→buttons[7] (RT), clutch→axes[3]',
            })
          }
        >
          Export profile JSON
        </button>
        {simulated && <p className="small" style={{ color: 'var(--sim)' }}>The current profile belongs to the SIMULATION source.</p>}
      </Card>
    </div>
  );
}
