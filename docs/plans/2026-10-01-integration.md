# Emergency QR integration

User request: read all four TXT specifications and Word master, fully verify and deliver the complete project.

The three TXT common contracts are identical. The Word master matches the earlier specification; differences in extracted paragraphs are line-break grouping. Existing backend.zip and database.zip were inspected and extracted without overwriting frontend or original archives.

## Deliverables and ownership
- Database audit agent: database only, real SQLite tests and fixes.
- Backend audit agent: backend only, strict API/security/static integration tests and fixes.
- Frontend audit agent: frontend review and fixes, no replacement of already working UI.
- Parent: root scripts/configuration, real browser + API + SQLite lifecycle tests, local start, documentation and release ZIP.

## Acceptance
- [x] All three typechecks and relevant test suites pass.
- [x] Website served by real backend; browser create produces a real SQLite row.
- [x] Second browser context reads public data without secret or hidden note.
- [x] Edit, disable/enable, rotation and deletion work through the UI and API.
- [x] Backend process restart preserves card and access; deletion removes row.
- [x] Missing/private token cannot edit; unknown/disabled/retired public tokens return equivalent 404.
- [x] Header/static path checks and actual QR decoding succeed.
- [x] LAN configuration uses physical Wi-Fi address, not a virtual adapter.
- [x] Setup/start instructions and complete source ZIP exclude data, secrets and dependencies.

Native device execution, second physical phone scanning, public deployment and APK/IPA are separate from a tested local demo. Report only actually verified outcomes.
