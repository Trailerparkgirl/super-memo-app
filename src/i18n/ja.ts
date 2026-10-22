function interval(days: number): string {
  if (days < 1) return '今日'
  if (days < 30) return `${days}日`
  if (days < 365) return `${Math.round(days / 30)}ヶ月`
  return `${(days / 365).toFixed(1)}年`
}

export const ja = {
  appName: 'スーパーメモ',
  locale: 'ja-JP',

  /** 間隔の長さ（例: 3日） */
  interval,
  /** 何日後か（例: 今日 / 明日 / 3日後） */
  daysFromNow: (days: number) => (days <= 0 ? '今日' : days === 1 ? '明日' : `${interval(days)}後`),

  common: {
    loadFailed: '読み込みに失敗しました。通信状況を確認してください。',
    retry: '再読み込み',
    saveFailed: '保存できませんでした。通信状況を確認して、もう一度お試しください。',
  },

  login: {
    email: 'メールアドレス',
    password: 'パスワード',
    submit: 'ログイン',
    wrongPassword: 'メールアドレスかパスワードが違います',
    failed: 'ログインできませんでした。通信状況を確認してください。',
  },

  tabs: { review: '復習', memos: 'メモ', newMemo: '新しいメモ', settings: '設定' },
  memoType: { note: 'メモ', qa: '問題' },
  grades: { again: '忘れてた', hard: 'うろ覚え', good: '覚えてた', easy: '簡単' },

  home: {
    welcomeTitle: 'ようこそ！',
    welcomeBody1:
      '人は覚えたことを1日で大半忘れてしまいます（エビングハウスの忘却曲線）。でも、忘れかけたタイミングで振り返るたびに記憶は長持ちするようになります。',
    welcomeBody2: '勉強したことをメモすると、このアプリが最適なタイミングで「振り返りの時間ですよ」と教えてくれます。',
    writeFirstMemo: '最初のメモを書く',
    todaysReview: '今日の復習',
    countUnit: '件',
    startReview: '復習を始める',
    allDone: '🎉 今日の復習は完了！',
    noneToday: '今日の復習はありません',
    stats: (reviewed: number, total: number) => `今日振り返った数: ${reviewed} ・ メモの総数: ${total}`,
    upcoming: 'これからの復習予定',
    noUpcoming: 'この1週間の復習予定はありません',
  },

  review: {
    quit: '✕ 中断',
    doneTitle: (count: number) => (count > 0 ? `${count}件の復習が完了！` : '今日の復習はありません'),
    doneBody: '次の復習タイミングになったら、またここに表示されます。',
    backHome: 'ホームに戻る',
    answer: '答え',
    noBody: '（本文なし）',
    recallQa: 'まず答えを思い出してみましょう。',
    recallNote: 'どんな内容だったか、まず思い出してみましょう。',
    howWell: 'どのくらい覚えていましたか？（下の数字は次の復習まで）',
    showAnswer: '答えを見る',
    showContent: '内容を見る',
  },

  list: {
    title: 'メモ',
    search: '検索（タイトル・本文・タグ）',
    notFound: '見つかりませんでした',
    empty: 'まだメモがありません。下の＋から追加しましょう。',
    dueToday: '今日復習',
    answerPrefix: '答え: ',
    reps: (n: number) => `復習 ${n}回`,
  },

  edit: {
    back: '‹ 戻る',
    titleEdit: 'メモを編集',
    titleNew: '新しいメモ',
    save: '保存',
    typeNote: '自由メモ',
    typeQa: '問題と答え',
    question: '問題',
    title: 'タイトル',
    answer: '答え',
    content: '内容',
    tags: 'タグ（スペース区切り・任意）',
    questionPlaceholder: '例：エビングハウスの忘却曲線で、1日後に忘れる割合は？',
    titlePlaceholder: '例：忘却曲線について',
    answerPlaceholder: '例：約74%',
    contentPlaceholder: '勉強したこと、覚えておきたいことを書きましょう',
    tagsPlaceholder: '例：英語 TOEIC',
    saveExisting: '保存する',
    saveNew: '保存して明日から復習する',
    confirmDelete: 'このメモを削除しますか？',
    confirmReset: '学習状況をリセットして、明日から復習し直しますか？',
    status: '復習の状況',
    nextReview: '次の復習',
    reps: '復習回数',
    lapses: '忘れた回数',
    times: (n: number) => `${n}回`,
    createdAt: '作成日',
    relearn: '覚え直す',
    delete: '削除',
  },

  settings: {
    title: '設定',
    language: '言語',
    installTitle: '📱 ホーム画面に追加しよう',
    installBody:
      'Safariの共有ボタン（□↑）→「ホーム画面に追加」で、アプリのように使えます。アイコンに復習件数が表示されます。',
    accountTitle: 'アカウント',
    loggedInAs: (email: string) => `${email} でログイン中`,
    logout: 'ログアウト',
    backupTitle: 'バックアップ',
    backupBody: 'メモはクラウドに保存されているので、どの端末からでも使えます。念のため、ときどきバックアップしておきましょう。',
    saveBackup: 'バックアップを保存',
    restore: 'バックアップから復元',
    imported: (n: number) => `${n}件のメモを読み込みました`,
    invalidBackup: 'スーパーメモのバックアップファイルではありません',
    importFailed: '読み込みに失敗しました',
    howTitle: '復習のしくみ',
    howBody:
      'メモを書いた翌日に最初の復習があります。その後は振り返ったときの評価に応じて、記憶が薄れかける直前（思い出せる確率が約90%）のタイミングで次の復習が組まれます。覚えているほど間隔は 3日 → 1週間 → 1ヶ月… と伸び、忘れていたら短く戻ります。',
    algorithm: 'アルゴリズム: FSRS（SuperMemo方式の改良版）',
  },
}

export type Messages = typeof ja
