# スーパーメモ

忘却曲線に合わせて、勉強したメモを振り返るタイミングを教えてくれるモバイルWebアプリ（PWA）。

- メモは「自由メモ」「問題と答え」「単語」の3形式
- 単語はフラッシュカードでランダムに何度でも練習できる。評価は通常の復習と同じく次の復習日に反映される。辞書（英語は Free Dictionary API、ドイツ語・日本語は Wiktionary）と 例文（Tatoeba の公開データベース、訳付き）、発音（辞書の録音か端末の音声）付き。どれも API キー不要
- メモごとに勉強している言語（英語・ドイツ語・日本語）があり、ホームなどで言語を切り替えると、その言語のメモだけを復習・練習できる。言語ごとの違いは `src/lib/languages.ts` にまとめてあり、言語を足すときはここに1つ足す（`src/lib/db.ts` の `StudyLang`、`supabase/schema.sql` の `memos_lang_check`、画面の文言の `studyLang` も）
- 書いた翌日に最初の復習。以降は振り返り時の評価（忘れてた / うろ覚え / 覚えてた / 簡単）に応じて FSRS アルゴリズムが次の復習日を決める
- 日本語 / 英語に対応（初回は端末の言語、設定画面で切り替え可）
- データは Supabase（クラウドの Postgres）に保存し、メールとパスワードでログインして使う。設定画面から JSON でバックアップ / 復元できる

## 技術構成

Vite + React + TypeScript / Tailwind CSS / Supabase / ts-fsrs / vite-plugin-pwa。ホスティングは Vercel。

## Supabase の準備

1. Supabase でプロジェクトを作り、SQL Editor で `supabase/schema.sql` を実行する（アップデートで中身が変わったときも、もう一度実行する）
2. Authentication → Users → Add user で自分のユーザーを作り（Auto Confirm User にチェック）、Sign In / Providers で新規登録を無効にする
3. Project URL と publishable key を `.env.local` に書く

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxx
```

Vercel では同じ2つを Project Settings → Environment Variables に設定する。

## 毎日の復習リマインダー（任意）

設定画面から、毎日決まった時刻に「今日の復習」をプッシュ通知で受け取れる（Web Push。iPhone はホーム画面に追加したアプリで、iOS 16.4 以降）。
使わないなら何もしなくてよい（`VITE_VAPID_PUBLIC_KEY` がなければ設定画面に出ない）。

1. 鍵を作る: `npx web-push generate-vapid-keys`
2. 公開鍵を `.env.local` と Vercel の Environment Variables に足す

   ```
   VITE_VAPID_PUBLIC_KEY=BXXXXX...
   ```

3. [Supabase CLI](https://supabase.com/docs/guides/cli) でログインしてプロジェクトをつなぎ（`supabase login` → `supabase link`）、シークレットを設定して関数をデプロイする

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=BXXXXX... VAPID_PRIVATE_KEY=xxxxx VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<長いランダムな文字列>
   supabase functions deploy daily-reminder --no-verify-jwt
   ```

4. SQL Editor で `supabase/schema.sql` をもう一度実行し、`supabase/cron.sql` の `<project-ref>` と `<cron-secret>` を置き換えて実行する（毎時0分に関数が呼ばれる）

## デプロイ（Vercel）

デプロイするのは2つのブランチだけ（`vercel.json` の `git.deploymentEnabled`）。

| ブランチ | 環境 | URL |
|---|---|---|
| `main` | Prod（本番） | 本番の URL |
| `dev` | Dev（確認用） | `dev` ブランチの Preview URL（毎回同じ） |

それ以外のブランチ（`fix/...` など）を push してもデプロイされない。
作業ブランチ → `dev` にマージして確認 → `main` にマージして本番、の順で進める。

## 開発

```sh
npm install
npm run dev      # 開発サーバー（同じWi-Fiのスマホからも http://<PCのIP>:5173 で開ける）
npm run build    # 本番ビルド（dist/）
npm run preview  # ビルド結果の確認
```

画面の文言は `src/i18n/ja.ts` と `src/i18n/en.ts` にある。`ja.ts` に文言を足すと、`en.ts` に訳がない間は型エラーになる。

アイコンを変えるときは `public/logo.svg` を編集して `npx pwa-assets-generator --preset minimal-2023 public/logo.svg` を実行する。
