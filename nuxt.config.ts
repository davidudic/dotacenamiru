// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-10-22',

  // This is a fully client-interactive tool (everything is behind user actions
  // and client-side fetches), so it runs as an SPA. The Nitro server still
  // handles the /api routes and serves the app shell from the Worker.
  ssr: false,

  modules: [
    '@nuxt/ui',
    // Populates `event.context.cloudflare.env` (KV/D1/secrets) during `nuxt dev`
    // using Wrangler/Miniflare + .dev.vars, so local dev matches production.
    'nitro-cloudflare-dev',
  ],

  css: ['~/assets/css/main.css'],

  devtools: { enabled: false },

  // Bundle icons locally (collections installed as devDeps) so SSR and client
  // render identically (no hydration mismatch) and no icons are fetched at
  // runtime on the edge.
  icon: {
    serverBundle: 'local',
  },

  // Non-secret, build-time defaults. Real secrets are read at runtime from
  // `event.context.cloudflare.env` (Worker secrets) — see server/utils/env.ts.
  runtimeConfig: {
    public: {
      // Default platform shown in the UI; purely cosmetic.
      defaultPlatform: 'youtube',
    },
  },

  nitro: {
    preset: 'cloudflare_module',
    cloudflare: {
      // We commit an explicit wrangler.toml instead of letting Nitro generate one,
      // so the deploy config is reviewable in the repo.
      deployConfig: false,
      nodeCompat: true,
    },
  },

  ui: {
    colorMode: false,
  },
})
