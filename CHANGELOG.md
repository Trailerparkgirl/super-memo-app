# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Cloud storage with Supabase, so memos can be used from any device
- Email and password login, and a logout button in Settings
- Retry screen when data fails to load, and an alert when saving fails
- Each review now also stores the full FSRS log and the card before the review, to support undo later
- Version number shown at the bottom of Settings
- `vercel.json` so page refreshes work when hosted on Vercel

### Changed

- Memos and review history are stored in Supabase instead of the browser (IndexedDB).
  Backups from v0.1.0 can be restored into the new version.
- Save buttons are disabled while saving, to prevent duplicate memos

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
