import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build
export default defineConfig({
  site: 'https://peil.demo',
  server: { port: 4377, host: true },
  vite: {
    plugins: [tailwindcss()],
  },
});
