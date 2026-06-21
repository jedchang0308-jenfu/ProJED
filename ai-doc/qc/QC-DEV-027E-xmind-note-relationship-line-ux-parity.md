# QC-DEV-027E: Xmind-like Note Relationship Line UX Parity

Date: 2026-06-19
Status: Browser QC Passed
QA plan: `ai-doc/qa/QA-DEV-027E-xmind-note-relationship-line-ux-parity.md`
Spec: `ai-doc/specs/SPEC-027E-xmind-note-relationship-line-ux-parity.md`

## QC Scope

QC verified that ProJED note relationship lines now behave as Xmind-like canvas objects while remaining note-only:
- Inline label creation and editing, without prompt as the main flow.
- Line-body and label selection.
- Space / double-click inline edit.
- Delete / Backspace removal.
- Circular endpoint handles and square Bezier control handles.
- Endpoint reconnect to another task.
- Style panel controls for color, width, dash, arrows, label size, and reset.
- Toolbar selected-node flow, `Ctrl+Shift+R`, and task right-click start flow.
- Zoom geometry stability.
- Regression coverage for DEV-027B, DEV-027C, and DEV-027D.

## Evidence

| Gate | Command | Status | Notes |
|---|---|---|---|
| Static | `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity` | Pass | 15 checks passed; data model, DOM hooks, inline flow, style panel, shortcut/right-click, and docs covered. |
| Browser UI | `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser` | Pass | Verifies inline creation/edit, line selection, style update, control-point drag, endpoint reconnect, zoom, shortcut, and right-click. |
| TypeScript | `npm.cmd exec tsc -- --noEmit` | Pass | Strict type gate passed. |
| Lint | `npm.cmd run lint -- --quiet` | Pass | ESLint quiet gate passed. |
| Build | `npm.cmd run build:test` | Pass | Test-mode Vite build passed; existing chunk-size/dynamic-import warnings remain. |
| Regression | `npm.cmd run verify:dev-027c-xmind-note-relationship-lines` | Pass | Updated static regression for DEV-027E data-driven style and HTML hitboxes. |
| Regression | `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser` | Pass | Updated browser regression to inline flow; endpoint pruning still passes. |
| Regression | `npm.cmd run verify:dev-027b-xmind-interaction-polish-browser` | Pass | Keyboard, zoom, connector, and drag-preview behavior preserved. |
| Regression | `npm.cmd run verify:dev-027d-mindmap-date-display-filter-browser` | Pass | Date display and filter behavior preserved. |

## UI Findings Closed

- The SVG relationship overlay originally intercepted task clicks. This was corrected by moving user interaction to HTML hitboxes/handles and making SVG transparent paths non-interactive.
- DEV-027C browser tests still assumed prompt-based creation. They were updated to validate the new inline label flow while keeping DEV-027C note-only regression coverage.
- Browser gates must run sequentially because local Playwright sessions share the same local test storage. Parallel DEV-027C/DEV-027E browser gates can interfere with each other.

## Residual Risk

- The style controls are implemented as a compact popover near the selected relationship, not a full right-side Format Panel. This matches the DEV-027E fallback scope and keeps the future panel upgrade path open.
- Xmind import/export, summary boundary, marker, attachment, floating topic, and dependency semantics remain out of scope.

## QC Decision

Browser QC Passed. DEV-027E can be treated as implemented and verified for the requested Xmind-like note relationship line UI/UX parity scope.
