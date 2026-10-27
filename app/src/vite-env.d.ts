/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RUNNER_URL?: string;
  readonly VITE_UPDATE_URL?: string;
}

/** app/package.json's version, set by vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
