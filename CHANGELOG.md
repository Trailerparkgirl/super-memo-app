# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Daily review reminder: turn it on in Settings to get a push notification at a chosen hour when memos are due that day.
  Needs VAPID keys, the `daily-reminder` edge function and `supabase/cron.sql` (see README). Run `supabase/schema.sql` again to add `push_subscriptions`.
- When more than 30 memos are due (e.g. after time away), the review asks "Do 20 now" or "Do all", and offers "Do 20 more" when a batch is done.
  The rest stay due with their dates unchanged, so a backlog spreads over the next days.
- Review by tag: Home lists the tags of today's due memos, and tapping one starts a review of only those memos
- Home shows your review streak ("🔥 12 days in a row"), your longest streak, and a calendar of the last 17 weeks of reviews.
  Run `supabase/schema.sql` again to add the `review_days` function.
- "Save & add another" on the new memo screen: saves and clears the form, keeping the type and tags, for quick vocabulary entry
- Leaving the memo edit screen with unsaved changes (Back button, tab bar, reload) now asks before discarding them
- Memos rated "Forgot" come back at the end of the review ("2 more to retry") until you get them.
  This is practice only and doesn't change the next review date.
- "↶ Undo" button in reviews and flash cards to take back the last rating (restores the schedule and removes the review record)
- Show/hide button on the password field of the login screen
- Delete a memo from the edit form in flash cards and in reviews
- Edit a memo's title and body right from the review screen, without leaving the review
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

- Example sentences for words now come from [Tatoeba](https://tatoeba.org), a free public database of sentences written by people.
  No API key is needed, so the Gemini API key setting was removed. Each example shows its author and license.
  Run `supabase/schema.sql` again to remove the `user_settings` table that stored the key.
- Flash cards are now the same size as review cards, with the rating buttons at the bottom of the screen
- The flash cards "Finish" button is now "Quit", matching the review screen, and both Quit buttons are now easier to see
- Memos and review history are stored in Supabase instead of the browser (IndexedDB).
  Backups from v0.1.0 can be restored into the new version.
- Save buttons are disabled while saving, to prevent duplicate memos
- Reviewing a memo after its due date now brings the next review earlier by the number of days it was late
  (never sooner than the next day). The review screen shows how many days late it was.

### Fixed

- Home no longer shows only "Couldn’t load your data" (with Try again not helping) when the database is missing the `review_days` function.
  Home now loads without the activity calendar; run `supabase/schema.sql` again to bring it back.

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
