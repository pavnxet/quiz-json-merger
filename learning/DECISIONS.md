# Architecture Decision Records (ADRs): quiz-json-merger

## ADR-001: Dual Mode Quiz Merger (Schema v1.0 vs Legacy Array)
- **Status**: Accepted
- **Context**: `quiz-json-to-html` requires a standardized v1.0 object schema with passages deduplication and subject tagging, whereas older pipelines expect a flat array of questions `[...]`.
- **Decision**: Implement a single Cloudflare Worker that dynamically branches depending on `compiler_mode` flag (default true/ON).
- **Consequences**:
  - Full compatibility with both `quiz-json-to-html` compiler and legacy consumers.
  - Zero disruption to users who need flat question lists (simply uncheck the toggle).
