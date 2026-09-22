# Session Execution History: quiz-json-merger

## 2026-09-22 - Quiz Tool Compatibility & Toggle Implementation
- **Goal**: Make `quiz-json-merger` compatible with `quiz-json-to-html` compiler schema v1.0, with an on/off toggle so that legacy raw array merges are still fully supported.
- **Actions**:
  - Implemented `extractQuizObject` supporting raw JSON, schema v1.0 JSON, and embedded `<script id="quiz-data">` in HTML quiz files.
  - Implemented `mergeStandardQuizJson` to produce valid `{ schema_version: "1.0", quiz, passages, questions }`.
  - Added toggleable `compiler_mode` in `handleWebUpload` and `HTML_TEMPLATE`.
  - Updated Telegram bot file handler to accept both `.json` and exported `.html` quiz files.
  - Initialized isolated project memory files in `learning/`.
  - Verified with comprehensive integration tests in Node.js.
