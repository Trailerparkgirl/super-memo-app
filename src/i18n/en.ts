import type { Messages } from './ja'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function interval(days: number): string {
  if (days < 1) return 'today'
  if (days < 30) return plural(days, 'day')
  if (days < 365) return plural(Math.round(days / 30), 'month')
  return `${(days / 365).toFixed(1)} years`
}

export const en: Messages = {
  appName: 'Super Memo',
  locale: 'en-US',

  interval,
  daysFromNow: (days) => (days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${interval(days)}`),

  tabs: { review: 'Review', memos: 'Memos', newMemo: 'New memo', settings: 'Settings' },
  memoType: { note: 'Note', qa: 'Q&A' },
  grades: { again: 'Forgot', hard: 'Hard', good: 'Good', easy: 'Easy' },

  home: {
    welcomeTitle: 'Welcome!',
    welcomeBody1:
      'We forget most of what we learn within a day (Ebbinghaus’s forgetting curve). But every time you review right before you forget, the memory lasts longer.',
    welcomeBody2: 'Write down what you study, and this app tells you exactly when it’s time to look back at it.',
    writeFirstMemo: 'Write your first memo',
    todaysReview: 'Due today',
    countUnit: '',
    startReview: 'Start review',
    allDone: '🎉 All done for today!',
    noneToday: 'Nothing to review today',
    stats: (reviewed, total) => `Reviewed today: ${reviewed} · Total memos: ${total}`,
    upcoming: 'Upcoming reviews',
    noUpcoming: 'No reviews in the next 7 days',
  },

  review: {
    quit: '✕ Quit',
    doneTitle: (count) => (count > 0 ? `Reviewed ${plural(count, 'memo')}!` : 'Nothing to review today'),
    doneBody: 'Memos will show up here again when their next review is due.',
    backHome: 'Back to home',
    answer: 'Answer',
    noBody: '(No content)',
    recallQa: 'Try to recall the answer first.',
    recallNote: 'Try to recall what this memo was about first.',
    howWell: 'How well did you remember? (time until next review)',
    showAnswer: 'Show answer',
    showContent: 'Show content',
  },

  list: {
    title: 'Memos',
    search: 'Search titles, content, tags',
    notFound: 'No matches',
    empty: 'No memos yet. Tap + below to add one.',
    dueToday: 'Due today',
    answerPrefix: 'A: ',
    reps: (n) => `Reviewed ${n}×`,
  },

  edit: {
    back: '‹ Back',
    titleEdit: 'Edit memo',
    titleNew: 'New memo',
    save: 'Save',
    typeNote: 'Note',
    typeQa: 'Q&A',
    question: 'Question',
    title: 'Title',
    answer: 'Answer',
    content: 'Content',
    tags: 'Tags (space-separated, optional)',
    questionPlaceholder: 'e.g. What does “ephemeral” mean?',
    titlePlaceholder: 'e.g. The forgetting curve',
    answerPlaceholder: 'e.g. Lasting a very short time',
    contentPlaceholder: 'Write down what you learned and want to remember',
    tagsPlaceholder: 'e.g. English vocabulary',
    saveExisting: 'Save',
    saveNew: 'Save — first review tomorrow',
    confirmDelete: 'Delete this memo?',
    confirmReset: 'Reset your progress and start reviewing again from tomorrow?',
    status: 'Review status',
    nextReview: 'Next review',
    reps: 'Reviews',
    lapses: 'Forgotten',
    times: (n) => `${n}`,
    createdAt: 'Created',
    relearn: 'Relearn',
    delete: 'Delete',
  },

  settings: {
    title: 'Settings',
    language: 'Language',
    installTitle: '📱 Add to Home Screen',
    installBody:
      'In Safari, tap Share (□↑) → “Add to Home Screen” to use this like an app. It works offline, shows your due count on the icon, and keeps your data safer.',
    backupTitle: 'Backup',
    backupBody: 'Your memos are stored only on this device. Back them up from time to time in case you switch phones.',
    saveBackup: 'Save backup',
    restore: 'Restore from backup',
    imported: (n) => `Imported ${plural(n, 'memo')}`,
    invalidBackup: 'This is not a Super Memo backup file',
    importFailed: 'Import failed',
    persist: 'Keep data safe (request persistent storage)',
    howTitle: 'How reviews work',
    howBody:
      'Your first review comes the day after you write a memo. After that, each review is scheduled based on how well you remembered — right before you’d start forgetting (about 90% recall). The better you know it, the longer the gap: 3 days → 1 week → 1 month…; if you forgot, it shrinks again.',
    algorithm: 'Algorithm: FSRS (an improved SuperMemo-style scheduler)',
  },
}
