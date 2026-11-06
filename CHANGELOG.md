# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Show/hide button on the password field of the login screen
- New memo type "Word" (word + meaning) for vocabulary. The memo list switches between memos and words.
  Run `supabase/schema.sql` again to allow the new type.
- Flash cards tab: practice your words in endless random order, word → meaning or meaning → word, optionally by tag.
  Ratings (Forgot / Hard / Good / Easy) update the review schedule like regular reviews,
  and words you rated low come up more often.
- Dictionary definitions for words (Free Dictionary API), plus a button to open Google's definition.
  Also shown on words in regular reviews.
- AI example sentences for words with Google Gemini's free tier (API key set in Settings, stored only on the device)
- Cloud storage with Supabase, so memos can be used from any device
- Email and password login, and a logout button in Settings
- Retry screen when data fails to load, and an alert when saving fails
- Each review now also stores the full FSRS log and the card before the review, to support undo later
- Version number shown at the bottom of Settings
- `vercel.json` so page refreshes work when hosted on Vercel
- Edit a word or its meaning right from a flash card, without leaving the practice session

### Changed

- The Gemini API key is saved to your account instead of only on the device, so it works on every device you log in to.
  A key already saved on a device is moved to the account automatically.
  Run `supabase/schema.sql` again to create the new `user_settings` table.
- Memos and review history are stored in Supabase instead of the browser (IndexedDB).
  Backups from v0.1.0 can be restored into the new version.
- Save buttons are disabled while saving, to prevent duplicate memos
- Reviewing a memo after its due date now brings the next review earlier by the number of days it was late
  (never sooner than the next day). The review screen shows how many days late it was.

### Removed

- "Keep data safe" persistent storage request in Settings, which only applied to browser storage

## [0.1.0] - 2026-10-15

### Added

- Two memo types: free notes and question & answer
- Review scheduling with the FSRS algorithm (first review the day after writing)
- Home screen with today's review count and a 7-day forecast
- Memo list with search, and review history for each memo
- Japanese and English UI
- JSON backup and restore
- Data stored on the device (IndexedDB)

[Unreleased]: https://github.com/Trailerparkgirl/super-memo-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Trailerparkgirl/super-memo-app/releases/tag/v0.1.0
