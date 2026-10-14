# スーパーメモ

忘却曲線に合わせて、勉強したメモを振り返るタイミングを教えてくれるモバイルWebアプリ（PWA）。

- メモは「自由メモ」か「問題と答え」の2形式
- 書いた翌日に最初の復習。以降は振り返り時の評価（忘れてた / うろ覚え / 覚えてた / 簡単）に応じて FSRS アルゴリズムが次の復習日を決める
- 日本語 / 英語に対応（初回は端末の言語、設定画面で切り替え可）
- データは端末内（IndexedDB）に保存。設定画面から JSON でバックアップ / 復元できる

## 技術構成

Vite + React + TypeScript / Tailwind CSS / Dexie.js（IndexedDB）/ ts-fsrs / vite-plugin-pwa

## 開発

```sh
npm install
npm run dev      # 開発サーバー（同じWi-Fiのスマホからも http://<PCのIP>:5173 で開ける）
npm run build    # 本番ビルド（dist/）
npm run preview  # ビルド結果の確認
```

画面の文言は `src/i18n/ja.ts` と `src/i18n/en.ts` にある。`ja.ts` に文言を足すと、`en.ts` に訳がない間は型エラーになる。

アイコンを変えるときは `public/logo.svg` を編集して `npx pwa-assets-generator --preset minimal-2023 public/logo.svg` を実行する。
