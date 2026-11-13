# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mind maps for what you learn at work and while coding. Each map grows from a central theme: branches spread out radially on both sides and items grow from them, laid out automatically.
  Pick a color for each branch that comes out of the theme; everything further out follows that color.
  Drag with one finger to move around, pinch (or scroll on a computer) to zoom, and tap “Fit” to see the whole map. Collapse branches you don’t need right now.
  Run `supabase/schema.sql` again to add the `maps`, `nodes` and `cards` tables.
- Every item has a definition. It isn’t shown on the map; tap the item to read or edit it.
- AI suggestions: when you enter a theme or an item, the AI suggests branches that could grow from it. They appear as dotted items on the map; tap one to add it, or add them all.
  “✨ Write with AI” writes the definition of an item for you.
  Uses the Claude API from a new `ai` edge function, so your API key stays on the server (see “AI” in the README). The model is Claude Opus 5.5 by default and can be changed with `ANTHROPIC_MODEL`.
- Capture (the + tab): jot down something you just learned. Put it in your Inbox, or let the AI turn it into items in the right place on your maps.
  Move any item, with its branches, to another place or another map (“✨ Ask AI where it goes” suggests one).
- Review on your maps: items with a definition get a “definition” card, and items with two or more branches get a “branches” card. Both come up for review from the next day.
  Type or dictate your answer and “✨ Grade my answer” lets the AI check it against your map and suggest a rating (you still choose).
  Review just one map from Home.
- “Memory” on a map colors each item by how likely you are to remember it right now; Home shows a memory forecast for each map, and your Inbox.
- Search all your maps by item name or definition.
- Study several languages separately: English, German and Japanese.
  Each memo has a language (existing memos are English), and a switcher (All / 🇬🇧 / 🇩🇪 / 🇯🇵) on Home, Memos and Flash cards shows only that language's memos, reviews and words. New memos get the selected language.
  Define, Example and 🔊 work for each language: German and Japanese definitions, IPA and native-speaker recordings come from Wiktionary; example sentences from Tatoeba now come with a translation (Japanese when the app is in Japanese, otherwise English); the device voice reads each word in its own language, and the voice can be chosen per language in Settings.
  Words written as “der Hund” or “sich freuen” are looked up as “Hund” / “freuen” but read aloud as written.
  Run `supabase/schema.sql` again to add the `lang` column.
- Import your own word list in Settings → “📥 Import a word list”: choose a CSV / TSV / TXT file or paste the list.
  One word per line as `word,meaning,tags` (tags optional); tab-separated files exported from Excel, Google Sheets, Quizlet and Anki also work.
  Words you already have are skipped, and an example file can be downloaded.
- 🔊 button to hear how a word is pronounced, next to the word in flash cards and in reviews.
  It uses the device’s built-in English voice, so it works offline and needs no setup.
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

- The tabs are now Today / Maps / + (Capture) / Words / Settings. Words, flash cards, the dictionary, examples and pronunciation all live in the Words tab, with the language switcher.
- Your notes and Q&A memos move into the Inbox as items when you run `supabase/schema.sql` again: the title (question) becomes the item and the content (answer) its definition.
  Their review schedule and history come along, so your streak continues. Words don’t change.
- Backups now include your maps (backup version 2). Notes and Q&A memos in older backups are restored into the Inbox.
- The daily reminder counts map reviews as well as words, and opens Home. Deploy `daily-reminder` again to update it.
- The 🔊 pronunciation button sounds more natural: it plays a recording of a real person from the dictionary when there is one,
  and otherwise uses the most natural English voice on the device instead of the default one.
  Settings → “🔊 Pronunciation” lets you choose a female or male voice (or a specific voice) and try it out.
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

- Flash card practice is now full screen like the review: the bottom tab bar is hidden until you tap Quit
- Home no longer shows only "Couldn’t load your data" (with Try again not helping) when the database is missing the `review_days` function.
  Home now loads without the activity calendar; run `supabase/schema.sql` again to bring it back.
- The Define and Example buttons sometimes said they couldn’t load even with a good connection.
  They now retry automatically (up to 3 times, with an 8-second timeout each) before showing the error.

### Removed

- Writing new notes and Q&A memos (map items with definitions replace them)
- Reviewing by tag on Home (review by map instead)
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
