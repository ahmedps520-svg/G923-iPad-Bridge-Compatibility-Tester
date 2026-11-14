/**
 * DEMONSTRATION ONLY. Generates synthetic data so the dashboard can be
 * previewed without hardware. Every frame is flagged `simulated: true`, the
 * device key is "simulation", and it never affects the hardware connection
 * status. It is never used in real hardware testing mode.
 */
import type { RawFrame } from '../core/types';

export const SIMULATION_KEY = 'simulation';

export class SimulationSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private t0 = 0;
  constructor(private onFrame: (f: RawFrame) => void) {}

  get running() {
    return this.timer !== null;
  }

  start() {
    if (this.timer) return;
    this.t0 = performance.now();
    this.timer = setInterval(() => this.tick(), 1000 / 60);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    const t = (performance.now() - this.t0) / 1000;
    const steer = Math.sin(t * 0.7) * 0.8 + Math.sin(t * 2.3) * 0.1;
    const throttle = Math.max(0, Math.sin(t * 0.9));
    const brake = Math.max(0, -Math.sin(t * 0.9 + 0.4)) * 0.8;
    const clutch = Math.max(0, Math.sin(t * 0.35 - 1)) ** 4;
    const pressed = (period: number, phase: number) => (t + phase) % period < 0.25;
    const axis = (name: string, v: number, min: number, max: number) => ({ id: `sim:${name}`, label: `SIMULATED ${name}`, value: v, min, max });
    this.onFrame({
      source: 'simulation',
      deviceKey: SIMULATION_KEY,
      timestamp: performance.now(),
      simulated: true,
      axes: [
        axis('steering', steer, -1, 1),
        axis('throttle', throttle, 0, 1),
        axis('brake', brake, 0, 1),
        axis('clutch', clutch, 0, 1),
      ],
      buttons: Array.from({ length: 12 }, (_, i) => {
        const p = pressed(3 + i * 0.7, i * 0.37);
        return { id: `sim:btn:${i + 1}`, index: i + 1, label: `SIMULATED Button ${i + 1}`, pressed: p, value: p ? 1 : 0 };
      }),
      hats: [{ id: 'sim:hat', label: 'SIMULATED Hat', value: 0, angle: pressed(5, 0) ? 90 * Math.floor((t / 5) % 4) : null }],
    });
  }
}
