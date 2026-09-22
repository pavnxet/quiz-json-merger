# Learnings & Domain Knowledge: quiz-json-merger

## 1. Schema Compatibility
- **Quiz HTML Compiler Standard**: Requires root `{ schema_version: "1.0", quiz: {...}, questions: [...] }`, with optional `passages: [...]`.
- **Legacy Raw Arrays**: Many external tools and scripts produce flat arrays of questions `[...]`.
- **Toggle Strategy**: Enabled by default in Web UI (`#compiler_mode`) and API (`compiler_mode=1`), but toggleable to ensure full backward compatibility.

## 2. Ingestion Flexibility
- Users may upload raw `.json` files or standalone exported `.html` quiz files.
- Standalone HTML quizzes store the JSON model inside `<script type="application/json" id="quiz-data">...<\/script>`.
- `extractQuizObject` extracts the valid JSON payload regardless of wrapper type.
