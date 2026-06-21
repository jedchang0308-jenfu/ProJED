# QC-DEV-027F: Mind Map UI Polish

Date: 2026-06-19
Status: Browser QC Passed
Scope: UI/UX correction after DEV-027E relationship-line implementation

## UI Failures Found

- Relationship style panel was rendered inside the zoomed canvas; `position: fixed` was still affected by the transformed ancestor and could overflow the viewport.
- Inline relationship label editor was rendered inside the zoomed canvas, making it unstable or hard to access when the relationship label was near the viewport edge.
- Relationship line and label hit targets scaled down with canvas zoom; on mobile fit mode the label hit target shrank from 96x32 to 48x16, below a reliable finger target.
- Selected relationship arrow marker used `markerUnits="strokeWidth"`, so selected stroke width enlarged the arrow into an oversized blue triangle.
- Existing relationship hitboxes could interfere with target node selection during relationship creation.

## Fix Summary

- Moved relationship style panel to a viewport-level overlay and clamped its position inside the visible viewport.
- Moved inline label editor to a viewport-level overlay and clamped its position.
- Moved relationship line hitbox, label hitbox, endpoints, and Bezier control handles to viewport-level overlays so their target sizes do not shrink with zoom.
- Added scroll-time connector recomputation to keep viewport-level overlays aligned with the zoomed canvas.
- Disabled existing relationship hitbox pointer events while relationship creation mode is active.
- Changed relationship arrow marker to `userSpaceOnUse` so selected line width does not inflate arrow size.

## Screenshot Evidence

- Desktop selected relationship UI: `output/playwright/dev-027F-mindmap-ui-desktop.png`
- Mobile fit-mode UI: `output/playwright/dev-027F-mindmap-ui-mobile.png`

## Verification

| Gate | Command | Status | Notes |
|---|---|---|---|
| Browser UI | `npm.cmd run verify:dev-027f-mindmap-ui-polish-browser` | Pass | Produces desktop/mobile screenshots; checks no visible runtime errors, selected relationship panel viewport safety, fixed hit target sizes, handles, and no hard node overlap. |
| Regression | `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity-browser` | Pass | Confirms relationship creation/edit/style/drag/reconnect/shortcut/right-click still work. |
| Regression | `npm.cmd run verify:dev-027c-xmind-note-relationship-lines-browser` | Pass | Confirms note-only relationship line create/edit/delete/pruning regression still works. |
| Static | `npm.cmd run verify:dev-027e-xmind-note-relationship-line-ux-parity` | Pass | Confirms relationship-line source hooks and documentation gates still match DEV-027E. |
| TypeScript | `npm.cmd exec tsc -- --noEmit` | Pass | Strict type gate passed. |
| Lint | `npm.cmd run lint -- --quiet` | Pass | ESLint quiet gate passed. |
| Build | `npm.cmd run build:test` | Pass | Test-mode Vite build passed; existing chunk-size/dynamic-import warnings remain. |

## QC Decision

Browser QC Passed for this UI polish pass. Remaining broader mobile canvas behavior is horizontal-scroll based; no runtime error or hard overlap was found in the captured viewport.
