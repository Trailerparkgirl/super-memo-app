interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
  /** 復習リマインダー（Web Push）の VAPID 公開鍵。未設定なら設定画面にリマインダーを出さない */
  readonly VITE_VAPID_PUBLIC_KEY?: string
}

/** package.json の version（vite.config.ts で埋め込む） */
declare const __APP_VERSION__: string
