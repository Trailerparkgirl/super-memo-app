interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}

/** package.json の version（vite.config.ts で埋め込む） */
declare const __APP_VERSION__: string
