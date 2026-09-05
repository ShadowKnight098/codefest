# UI Spec — MCQ, Waiting, Coding & Termination Screens

Extends the same design system from `UI_SPEC_LOGIN_DASHBOARD.md` across the rest of the participant flow, so all screens read as one product. **Reuse the token table, fonts, radius, and border-over-shadow rules from that file** — this doc only adds the tokens and components that are new to these screens.

---

## 0. New Tokens for This Set

| Token | Value | Use |
|---|---|---|
| `--option-default-bg` | `#FFFFFF` | Answer option card, unselected |
| `--option-default-border` | `--line-strong` (`#C6C1B0`) | — |
| `--option-hover-border` | `--ink` at 40% (`rgba(22,35,63,.4)`) | Hover only, no fill change |
| `--option-selected-bg` | `#EEF1F6` | Selected option fill (cool tint of ink, not accent color — selection ≠ status) |
| `--option-selected-border` | `--ink` (`#16233F`), 2px | Selected option border |
| `--nav-attempted-bg` | `--success-bg` (`#E8F3EC`) | Navigator cell, answered |
| `--nav-attempted-text` | `--success` (`#1E7A46`) | — |
| `--nav-unattempted-bg` | `#FFFFFF` | Navigator cell, unanswered |
| `--nav-unattempted-border` | `--line-strong` | — |
| `--nav-current-border` | `--ink`, 2px | Currently open question |
| `--editor-bg` | `#FCFCFA` | Code editor background — kept light to match the rest of the app, not a dark IDE theme |
| `--editor-line` | `#EDEBE3` | Editor gutter/line separators |
| `--editor-keyword` | `--ink` | Syntax color for keywords |
| `--editor-string` | `#5B7A4F` | Syntax color for strings (muted olive-green, not neon) |
| `--editor-comment` | `--text-faint` | Syntax color for comments |
| `--timer-normal` | `--text` | Timer text, default |
| `--timer-critical` | `--error` | Timer text under 2 minutes remaining |

**Design decision — light-themed editor:** Monaco/CodeMirror ship dark by default, but a dark editor pane dropped into this otherwise light, paper-toned interface would look like two different products stitched together. Configure the editor with a light theme using the tokens above so the whole coding screen stays visually consistent with Login/Dashboard/MCQ.

---

## 1. Shared Header Pattern (MCQ + Coding)

Both assessment screens use the same header bar, so participants don't relearn the chrome between rounds.

```
┌─────────────────────────────────────────────────────────────┐
│  AI & ML DEPARTMENT · TechFest 2026        LEVEL 0X          │
│                                              ROUND NAME       │
│                                                   18:42       │
└─────────────────────────────────────────────────────────────┘
```
- Height: `64px`. Background `--surface`, `1px solid --line` bottom border (flat, no shadow).
- Left: small two-line identity block, same pattern as the dashboard topbar brand block (`AI & ML DEPARTMENT` muted uppercase 12px / `TechFest 2026` serif 16px) — but here it can sit inline rather than stacked, since header height is tighter.
- Right-aligned block: round label (`LEVEL 01` — mono, 12px, `--text-faint`; `MCQ ASSESSMENT` — sans, 13px, 600, `--text`) stacked above the timer.
- **Timer:** `IBM Plex Mono`, 22px, weight 600, `--timer-normal`. Right-aligned, always visible (sticky header). Switches to `--timer-critical` color when remaining time drops below 2 minutes — no flashing/blinking, color change only. Value is rendered from a server-provided `expires_at` timestamp, resynced periodically; never a purely client-side countdown.

---

## 2. MCQ Assessment Screen

### Layout — three-panel desktop grid, `22% / 53% / 25%`

```
┌───────────────────────────────────────────────────────────┐
│                         HEADER (§1)                         │
├───────────────┬─────────────────────────────┬───────────────┤
│ LEFT 22%      │        CENTER 53%            │  RIGHT 25%    │
│ Event context │  Question content + options  │  Navigator    │
├───────────────┴─────────────────────────────┴───────────────┤
│ ACTIONS: ← Previous     Save & Next →     Review & Submit    │
└───────────────────────────────────────────────────────────┘
```
Below `1100px`, collapse right panel into a collapsible drawer (toggle button in header) rather than stacking — the navigator needs to stay reachable without losing the question in view. Below `880px`, show the "unsuitable viewport" notice per §6 of `DESIGN.md` rather than degrading further.

### Left panel (22%)
Quiet, supporting panel — background `--paper` (not white, to recede visually), `1px solid --line` right border.
- Department/fest name (small, same identity treatment as header, stacked).
- Round context: `Level 1 · MCQ Assessment`.
- A short static note: `Answers save automatically as you go. You can revisit any question before submitting.`

### Center panel (53%) — strongest visual weight
Background `--surface`. Padding `48px 56px`.

```
QUESTION 07
07 / 25

<question text, 18px, --text, line-height 1.6>

[ Option A — full width card ]
[ Option B ]
[ Option C ]
[ Option D ]
```
- `QUESTION 07` — mono, 13px, `--text-faint`, letter-spacing normal (not tracked-out caps-as-decoration; this is a real label).
- `07 / 25` — mono, 13px, `--text-faint`, directly below.
- Question text — 18px, `--text`, max width ~640px for line length.
- Options: each a full-width card, min-height `56px`, padding `16px 20px`, `1px` border, `5px` radius, left-aligned text, entire card clickable (no visible radio circle as the primary control — optionally a small filled/outline indicator on the left edge of the card for scan-ability, but the click target is the whole card).

**Option states:**
| State | Background | Border | Notes |
|---|---|---|---|
| Default | `--option-default-bg` | `--option-default-border`, 1px | — |
| Hover | `--option-default-bg` | `--option-hover-border`, 1px | Cursor pointer, no fill shift (avoids flashing on scroll) |
| Selected | `--option-selected-bg` | `--option-selected-border`, 2px | A small filled dot or check mark at the card's left edge reinforces selection for colorblind users |
| Disabled (post-submit/terminated) | `#F5F5F2` | `--line` | `cursor: not-allowed`, no hover effect |

### Right panel (25%) — Navigator
Background `--paper`, `1px solid --line` left border, padding `24px`.

- 5×5 grid, `8px` gap, each cell `36×36px`, mono numerals, `3px` radius.
- Cell states: attempted (`--nav-attempted-bg` / `--nav-attempted-text`), not attempted (`--nav-unattempted-bg` / `--nav-unattempted-border`), current question (add `--nav-current-border` 2px ring regardless of attempted state).
- Below the grid: progress line — `18 / 25 answered` (14px, 600, `--text`) and `7 remaining` (13px, `--text-faint`) on the next line.
- Every cell is clickable and jumps directly to that question (saves current answer state first if changed).

### Bottom action bar
Full-width bar, `1px solid --line` top border, `16px 56px` padding, flex space-between.
- Left: `← Previous` — ghost button style (same as dashboard's `btn-ghost`), disabled on question 1.
- Right: `Save & Next →` (primary `--ink` button) and `Review & Submit` (secondary — outline `--ink` border, `--ink` text, transparent background) side by side. `Save & Next` never triggers final submission — it only advances after the current answer's save confirms.

### Autosave indicator
Small inline indicator near the options, not a full banner — e.g. top-right of the center panel:
- On selection: `Saving…` (13px, `--text-faint`, with a small spinner).
- On confirmed write: `✓ Answer saved` (13px, `--success`), persists briefly then fades to neutral (e.g. just disappears after ~2s, doesn't need to stay forever).
- On failure: `Unable to save answer. Retrying…` (13px, `--error`) — retry automatically; do not show "saved" until the backend actually confirms.

### Review screen (modal, triggered by "Review & Submit")
Centered modal, max-width `480px`, `--surface` background, `6px` radius, `1px solid --line`.
```
Review your answers

18 Answered        7 Not Answered

[ list or grid of question numbers, clicking one closes the
  modal and jumps to that question ]

[ Cancel ]              [ Submit Assessment ]
```
- `18 Answered` in `--success`, `7 Not Answered` in `--warn` (or `--text-faint` if zero unanswered — no need to alarm when everything's answered).
- `Submit Assessment` is the only path to final submission, and itself requires a second confirmation step (e.g. the button becomes `Confirm Submission` on first click, or a follow-up inline prompt: `This cannot be undone. Submit anyway?`) — never a single accidental click away from locking the attempt.

### Post-submit
Options and navigator become disabled per the states above; action bar is replaced with a simple confirmation state (`Assessment submitted.`) before the participant is redirected to the dashboard, which will now reflect the qualification result once scored.

---

## 3. Waiting Screen

Simple, calm, centered state — no dense layout needed.

```
┌─────────────────────────────────────────────┐
│                                               │
│        LEVEL 01 COMPLETE                     │
│  You have qualified for the next round.      │
│                                               │
│  ────────────────────────                    │
│                                               │
│        LEVEL 02                              │
│        CODING ASSESSMENT                     │
│                                               │
│      Waiting for organizer                   │
│                                               │
└─────────────────────────────────────────────┘
```
- Centered card, max-width `440px`, `--surface` background, `1px solid --line`, `6px` radius, generous padding (`56px 48px`).
- `LEVEL 01 COMPLETE` — mono, 13px, `--text-faint`, letter-spacing normal.
- `You have qualified for the next round.` — serif, 20px, 600, `--text`.
- Divider rule, same style as the login identity panel's rule.
- `LEVEL 02` (mono, 12px, `--text-faint`) / `CODING ASSESSMENT` (serif, 22px, 600).
- Status line: `Waiting for organizer` — a `status-badge`-style pill using the `progress`/warn color set, since it's an active waiting state, not a static label.
- Below the card, small muted text: `This page updates automatically once Level 2 opens — no need to refresh.` Implement this literally (poll or subscribe server-side status), since the copy promises it.
- No countdown, no spinner implying imminent action — the organizer controls timing, and the UI shouldn't imply otherwise.

---

## 4. Coding Assessment Screen

### Layout
```
┌───────────────────────────────────────────────────────────┐
│                    HEADER (§1, with timer)                  │
├──────────────────────────┬────────────────────────────────┤
│ PROBLEM PANEL ~38%       │ EDITOR PANEL ~62%               │
│ - Title, difficulty,     │ (Monaco/CodeMirror, light theme)│
│   marks, time allotted   │                                  │
│ - Description            │                                  │
│ - Examples                │                                  │
│ - Constraints             │                                  │
├──────────────────────────┴────────────────────────────────┤
│ LANGUAGE ▾   [ Run ]  [ Submit ]        TEST RESULTS         │
└───────────────────────────────────────────────────────────┘
```

### Problem panel
Background `--paper`, `1px solid --line` right border, padding `32px`, independently scrollable.
- Header block: problem title (serif, 20px, 600), then a row of small meta tags — difficulty (`Easy`/`Hard`), time allotted, marks — styled as compact outlined chips (`1px solid --line-strong`, `3px` radius, 12px mono text), not colored badges (difficulty isn't a status, so it shouldn't borrow the status-badge palette).
- Description, Examples, Constraints as clearly labeled sections (serif 15px section labels, sans 14px body). Example input/output rendered in mono in a bordered code block (`--editor-bg` background, `1px solid --editor-line`).

### Editor panel
- Monaco/CodeMirror configured with a **light theme** using the editor tokens in §0 — keywords in `--ink`, strings in `--editor-string`, comments in `--editor-comment`, background `--editor-bg`.
- Standard chrome: line numbers, current-line highlight (very subtle, `#F1F1EC`), no minimap (unnecessary at this content length and distracting in a focused assessment).

### Bottom bar
- Language selector: simple `<select>`-style control, bordered, mono text, options Python / C / C++ / Java.
- `Run` — secondary/outline button (test against visible sample cases only, does not affect score or submission count).
- `Submit` — primary `--ink` button, requires a lightweight confirm (`Submit this solution for Problem 1?`) since it's the scored action. Disabled while a submission is in flight.
- Test results panel: right-aligned or below the button row, listing each **visible** test case with a pass/fail chip (success/error color set) — hidden test case results are never shown individually, only reflected in the final score after submission.

**Result / failure states (each with distinct copy, none exposing raw internals):**
| State | Chip color | Copy shown |
|---|---|---|
| Passed | success | `Passed` |
| Failed (wrong output) | error | `Failed` |
| Compile error | error | `Compilation failed` — show the compiler message only if it originates from the participant's own code (not stack traces from the judge infrastructure) |
| Runtime error | error | `Runtime error` |
| Timeout | warn | `Time limit exceeded` |
| Memory limit | warn | `Memory limit exceeded` |
| Judge unavailable | locked/grey | `Judge unavailable. Your submission has been recorded and will be scored shortly.` |

### Small-viewport handling
If the viewport can't reasonably fit this layout, show a full-screen notice rather than a squeezed layout: `This assessment requires a larger screen. Please continue on a laptop or desktop.` — styled like the Termination screen (§5) minus the finality, i.e. calm, centered, no assessment chrome behind it.

---

## 5. Termination Screen

Full-screen, unambiguous, not a dismissible modal.

```
┌─────────────────────────────────────────────┐
│                                               │
│           ASSESSMENT TERMINATED              │
│                                               │
│  Your attempt was terminated due to          │
│  repeated tab-switch violations during       │
│  the assessment.                             │
│                                               │
│  If you believe this is an error, contact    │
│  your event coordinator.                     │
│                                               │
│         [ Return to Dashboard ]              │
│                                               │
└─────────────────────────────────────────────┘
```
- Full viewport takeover, background `--paper`, centered content card using the `--error` palette restrained to a single accent line (e.g. a `4px` top border in `--error` on the card) rather than washing the whole screen in red — serious, not alarming.
- Heading: `ASSESSMENT TERMINATED` — mono, 14px, `--error`, letter-spacing normal (this is a status label, caps here is warranted for gravity, not decoration).
- Body copy, serif or sans 15px, `--text`, matches the specific reason (tab-switch violations here; reuse this same pattern for any other termination reason the backend might report — the copy should reflect the actual reason returned by the API, not a generic string).
- Single action: `Return to Dashboard` (outline `--ink` button) — no other interactive assessment controls are rendered on this screen at all, since the attempt is locked.

---

## 6. Cross-Screen Consistency Checklist

- Header identity block (`AI & ML DEPARTMENT` / `TechFest 2026`) uses the same two-tier typographic treatment everywhere it appears: Login identity panel, Dashboard topbar, MCQ/Coding header.
- Button hierarchy is consistent across all screens: primary = filled `--ink`; secondary = outline `--ink`; ghost = bordered neutral, used for low-emphasis actions like `Previous`/`Log out`.
- Status/result color meaning is fixed everywhere: success=green, warning/in-progress=amber, error/terminated=red, locked/unavailable=grey. Never repurpose these colors for anything else (e.g. don't use the amber "in progress" color for a plain informational note).
- All timers (MCQ, Coding) use the identical header timer component from §1 — same font, size, position, and critical-time color change.
- Every new interactive element introduced in these screens (option cards, navigator cells, run/submit buttons, language selector) gets the same state coverage required in `DESIGN.md §4`: default, hover, focus, active/selected, disabled, loading where relevant.
