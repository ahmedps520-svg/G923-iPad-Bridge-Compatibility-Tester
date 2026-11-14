import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `--mode https` serves over a self-signed certificate so that an iPad on the
// same network gets a secure context (required for WebHID/WebUSB, and for the
// Gamepad API in some browsers). `base: './'` keeps the build portable
// (GitHub Pages sub-path, any static host).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
