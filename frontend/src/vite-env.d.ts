/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_JS_KEY: string;
  readonly VITE_AMAP_SECURITY_CODE: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_COMMUTE_RECORDING_ENABLED?: string;
  readonly VITE_EPHEMERAL_RECORDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
