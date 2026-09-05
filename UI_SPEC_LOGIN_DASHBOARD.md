# UI Spec — Login & Dashboard

Implementation-ready spec for the two screens prototyped in `login-dashboard.html`. Use this to rebuild in your actual stack (React, etc.) — it captures every token, state, and copy string so nothing has to be reverse-engineered from the HTML.

---

## 1. Design Tokens

### Color

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#16233F` | Primary brand color — headers, primary buttons, identity panel bg |
| `--ink-soft` | `#25355B` | Hover state for ink elements |
| `--paper` | `#F6F6F2` | Page background |
| `--surface` | `#FFFFFF` | Cards, panels, form background |
| `--line` | `#DBD7C9` | Default hairline borders |
| `--line-strong` | `#C6C1B0` | Input borders, dividers needing more contrast |
| `--text` | `#1B2029` | Primary text |
| `--text-muted` | `#59626F` | Secondary text, labels |
| `--text-faint` | `#8B93A0` | Tertiary text, placeholders, sub-labels |
| `--accent` | `#9C5B12` | "Available" status, highlights (burnt ochre — deliberately not terracotta/orange) |
| `--accent-bg` | `#F3E7D5` | Accent background fill |
| `--success` | `#1E7A46` | Completed/qualified state |
| `--success-bg` | `#E8F3EC` | — |
| `--success-line` | `#BEDFCB` | — |
| `--error` | `#AE2E22` | Errors, terminated, not-qualified |
| `--error-bg` | `#FBEAE8` | — |
| `--error-line` | `#EFC5BF` | — |
| `--warn` | `#8A5A00` | In-progress state, lockout warning |
| `--warn-bg` | `#FBF1DD` | — |
| `--warn-line` | `#E9D6A3` | — |
| `--locked` | `#7B8492` | Locked/unavailable rounds |
| `--locked-bg` | `#EFEFEC` | — |

### Typography

| Role | Family | Notes |
|---|---|---|
| Display / identity headings | **Spectral** (serif) | Weights 500/600/700. Used for fest name, section headings, form title. Academic/editorial tone — deliberately not a high-contrast display serif. |
| UI / body text | **IBM Plex Sans** | Weights 400/500/600/700. All labels, buttons, body copy. |
| Codes / numerics | **IBM Plex Mono** | Weights 400–600. Roll numbers, PINs, round numbers, timers (timer used on later screens). Reserved for genuinely numeric/code content only — not decorative. |

Google Fonts import:
```css
@import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
```

Type scale in use: `12 / 12.5 / 13 / 14 / 14.5 / 15 / 16 / 18 / 19 / 27 / 38px`.

### Spacing & Shape

- Border radius: `3px` (inputs, buttons, badges) / `6px` (cards, panels). No large radii.
- Borders over shadows: panels are distinguished with `1px solid` borders, not drop shadows.
- Card padding: `18–24px`. Panel padding: `40–64px` depending on breakpoint.

---

## 2. Screen: Login

### Layout
Two-column grid, **44% / 56%** (identity panel / form panel). Below `880px` viewport width, collapses to a single stacked column (identity panel first, form panel second).

### Identity panel content (exact copy)
- Line 1: `Department of AI & Machine Learning`
- Line 2 (smaller, muted): `RGM College of Engineering & Technology`
- Fest name (large serif, two lines): `TechFest` / `2026`
- Thin horizontal rule (44px wide, 1px, `rgba(255,255,255,.3)`)
- Round list (numbered, mono numerals):
  - `01` MCQ Assessment
  - `02` Coding Assessment
  - `03` Presentation
- Footer note (after a hairline top border): `Access is restricted to registered participants. If you have not received your credentials, contact your event coordinator.`

### Form fields
| Field | Input type | Font | Validation |
|---|---|---|---|
| Roll number | text | mono | Required, non-empty |
| Registered email | text | sans | Required, must match `^[^\s@]+@[^\s@]+\.[^\s@]+$` |
| Access PIN | password | mono, `maxlength=6` | Required, exactly 6 digits (`^\d{6}$`) |

Each field: label above input (13px, `--text-muted`, weight 600), 44px-tall input, `3px` radius, `1px solid --line-strong` border.

### Button — "Sign in"
- Full-width, 46px tall, `--ink` background, white text, 3px radius.
- Hover: `--ink-soft`.
- Loading: disabled, background dims to `#5C6579`, label replaced with a spinner + `Signing in…`.
- Disabled (lockout): same disabled treatment, non-interactive.

### Banners (shown below the button, one at a time)
| Banner | Style | Copy |
|---|---|---|
| Invalid credentials | error (`--error-bg` / `--error-line` / `--error` text) | `The roll number, email, or PIN you entered is incorrect.` |
| Lockout | warn | `Too many failed attempts. Access is temporarily locked — try again shortly or contact your event coordinator.` |
| Success | success | `Signed in — redirecting to your dashboard…` |

### Behavior
1. On submit: validate all three fields client-side; show field-level errors and stop if any fail.
2. If valid: enter loading state (disable inputs + button, show spinner).
3. Backend responds (simulate ~1.1s in prototype):
   - **Correct credentials** → success banner → brief pause → navigate to dashboard.
   - **Incorrect credentials** → increment fail counter, re-enable form, show invalid-credentials banner.
   - **3rd consecutive failure** → show lockout banner instead, keep form disabled.
4. Real implementation: replace the `setTimeout` simulation with the actual login API call; the fail-counter and lockout copy should reflect the backend's actual rate-limit response, not a hardcoded client-side count.

### Footer
Centered below the form: `Trouble signing in? Contact your event coordinator.` (link text underlined).

---

## 3. Screen: Dashboard

### Layout
Max content width `880px`, centered, `40px` top padding.

### Topbar
- Left: two-line brand block — `AI & ML DEPARTMENT` (small, uppercase, muted) / `TechFest 2026` (serif, 18px, bold).
- Right: `Signed in as {participant name}` + ghost-style `Log out` button (`1px solid --line-strong` border, transparent bg, hover border `--ink`).

### Credential strip
Bordered panel (`1px solid --line`, `6px` radius), three equal-width blocks separated by vertical dividers (horizontal on mobile):
| Label | Example value | Font |
|---|---|---|
| Name | Anjali Rao | sans, 600 |
| Roll number | 21A91A6127 | mono, 500 |
| Academic year | III Year | sans, 600 |

### Round rows
Each round: bordered row (`1px solid --line`, `6px` radius, `18px 20px` padding) containing:
- **Left:** a `30×30px` bordered square with the mono round number (`01`/`02`/`03`), then title (15px, 600) and a sub-line (12.5px, muted) — score, progress, or availability note.
- **Right:** a status badge and, when applicable, a primary action button (`Enter Assessment` or `Resume`).

### Status panel
A single callout box below the round list, styled per state (`default` / `warn` / `error` / `success`), with a bold title line and a short explanatory sentence.

### Full state matrix (backend-driven)
| State | Round 01 (MCQ) | Round 02 (Coding) | Round 03 (Presentation) | Status panel |
|---|---|---|---|---|
| **Level 1 Available** | Available — "25 questions · 30 minutes" — *Enter Assessment* | Locked — "Opens after Level 1 results" | Locked — "Evaluated manually" | *Level 1 is open* — "The MCQ assessment is available. You may begin any time before the round closes — once started, the timer cannot be paused." |
| **Level 1 In Progress** | In Progress — "12 of 25 answered" — *Resume* | Locked | Locked | *Assessment in progress* (warn) — "Your Level 1 attempt is currently active. Return to the assessment to continue — closing this tab does not pause your timer." |
| **Not Qualified** | Completed — "Score: 14 / 25" | Locked — "Not qualified" | Locked — "Not qualified" | *Not qualified* (error) — "You scored 14 / 25 on Level 1. The qualifying score for Level 2 was 18 / 25. Thank you for participating in TechFest 2026." |
| **Qualified — Waiting for Level 2** | Completed — "Score: 20 / 25 · Qualified" | Locked — "Not yet opened" | Locked | *Qualified — waiting for Level 2* — "You qualified for Level 2 with a score of 20 / 25. The coding round has not been opened yet. This page will update automatically once your organizer starts it." |
| **Level 2 Available** | Completed — "Score: 20 / 25 · Qualified" | Available — "2 problems · 50 minutes total" — *Enter Assessment* | Locked | *Level 2 is open* — "The coding assessment is available. You may begin any time before the round closes — once started, the timer cannot be paused." |
| **Level 2 In Progress** | Completed | In Progress — "Problem 1 of 2" — *Resume* | Locked | *Assessment in progress* (warn) — "Your Level 2 attempt is currently active. Return to the assessment to continue." |
| **Completed** | Completed — "Score: 20 / 25 · Qualified" | Completed — "Submitted · 32 / 40" | Locked — "Manually evaluated" | *Both rounds completed* (success) — "You have completed Level 1 and Level 2. Level 3 (Presentation) is evaluated manually — your coordinator will share scheduling details separately." |
| **Terminated** | Completed — "Score: 20 / 25 · Qualified" | Terminated | Locked — "Not applicable" | *Attempt terminated* (error) — "Your Level 2 attempt was terminated due to repeated tab-switch violations. Contact your event coordinator if you believe this is an error." |
