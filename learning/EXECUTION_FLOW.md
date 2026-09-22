# Execution Flow & Call Map: quiz-json-merger

## Entry Points
- `GET /`: Serves `HTML_TEMPLATE` (UI with drag-and-drop file upload and compiler mode toggle).
- `POST /upload`: Handles multi-file uploads from web form.
- `POST /webhook`: Handles Telegram bot interaction.

## Call Path for Merge
1. `handleWebUpload(request)`
2. Extract files & check `formData.get('compiler_mode')`
3. `mergeJsonFiles(fileContents, { compilerMode })`
   - If `compilerMode === true`: `mergeStandardQuizJson(fileContents)`
     - Parses each file with `extractQuizObject` (extracts from JSON or `<script id="quiz-data">`)
     - Accumulates metadata, deduplicates `passagesMap`, preserves/assigns subjects
     - Renumbers questions sequentially
     - Returns `{ schema_version: "1.0", quiz, passages, questions }`
   - If `compilerMode === false`: `mergeLegacyFlatArray(fileContents)`
     - Extracts questions and returns flat array `[...]`
4. Encodes and streams JSON download with custom headers `X-Merge-Stats`.
