import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// CAP_BUILD=1 erzeugt einen statischen SPA-Build für die Android-App (Capacitor),
// ohne CAP_BUILD bleibt der Node-Build für das Docker-Deployment unverändert.
const adapter = process.env.CAP_BUILD
  ? adapterStatic({ fallback: 'index.html', pages: 'build-static', assets: 'build-static' })
  : adapterNode({ port: 3000 });

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
  },
};

export default config;
