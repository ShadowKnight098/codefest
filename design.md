# DESIGN.md — Visual System & Screens

Source of truth for look, feel, and screen layout. Read before writing any UI code.

## 1. Direction

**Feel:** official · modern · technical · academic · premium · clean · purpose-built. This should read like software a university department actually procured for a serious technical competition — not a hackathon side project.

**Avoid:**
- AI-generated / generic-SaaS look
- Cyberpunk, gaming, or "esports" styling
- Gradients used decoratively, glassmorphism, glow/neon effects, particles
- Giant hero illustrations, mascots, decorative empty-space filler
- Excessive border-radius, bouncy/animated transitions
- Anything that competes visually with the assessment content

When in doubt, choose the more restrained option.

## 2. Foundations

**Color:** a small, disciplined palette — one primary (institutional, not "startup blue"), one neutral scale (backgrounds/text/borders), and a small semantic set (success/warning/error/info). No decorative gradients. Reserve saturated color for state and action, not decoration.

**Typography:** one type family for UI, optionally a second for numerals/code (monospace for timers, question numbers, code editor). A clear, limited scale (e.g. 12/14/16/20/24/32) — no random sizes. Weight does more work than size for hierarchy.

**Spacing:** one spacing scale (4/8px base). Consistent padding within card types. No ad-hoc margins.

**Radius:** small and consistent (e.g. 4–8px). Not pill-shaped buttons, not heavily rounded cards.

**Elevation:** flat-first. Use border + subtle shadow to separate panels rather than heavy drop shadows.

**Motion:** functional only — state transitions, loading indicators, autosave confirmation. No entrance animations, parallax, or decorative motion.

**States required on every interactive element:** default, hover, focus (visible, keyboard-accessible), active, disabled, loading (where applicable), error (where applicable).

## 3. Screens

### 3.1 Login
- AI/ML department + fest identity, clearly but not loudly branded.
- Fields: Roll Number, Registered Email, Access PIN. No OTP.
- Inline validation per field; a single login action with a loading state (disabled + spinner/label change, not a full-page blocker).
- Error state for invalid credentials, locked account, and rate-limiting — each with distinct, honest copy (no generic "something went wrong").
- Should feel trustworthy first, attractive second: no marketing copy, no unrelated imagery.

### 3.2 Dashboard
Displays (all backend-sourced, never computed client-side):
- Participant name, roll number, academic year.
- Current round + round availability.
- Previous result (if any).
- Next-round status.

**States to design explicitly:** `Level 1 Available`, `Level 1 In Progress`, `Level 1 Completed`, `Qualified`, `Not Qualified`, `Waiting for Level 2`, `Level 2 Available`, `Level 2 In Progress`, `Completed`, `Terminated`. Each state needs its own copy and visual treatment (e.g. `Terminated` should look distinctly serious/locked, not styled like a normal disabled state).

### 3.3 MCQ Assessment — highest design priority

**Layout:** three-panel desktop grid.

```
┌───────────────────────────────────────────────────────────┐
│ HEADER — dept/fest identity · round label · timer          │
├────────────┬─────────────────────────────┬─────────────────┤
│ LEFT ~22%  │        CENTER ~53%          │  RIGHT ~25%     │
│ Event /    │  Question content            │  Question       │
│ department │  Answer options              │  navigator      │
│ context    │                              │                 │
├────────────┴─────────────────────────────┴─────────────────┤
│ ACTIONS — Previous / Save & Next / Review & Submit          │
└───────────────────────────────────────────────────────────┘
```

Center panel carries the strongest visual weight (largest type, most whitespace, primary focal point). Left and right are supporting, lower-contrast panels.

**Header:** dept name, fest name, round label (`LEVEL 01 · MCQ ASSESSMENT`), and a persistent, monospace countdown timer. Timer display is client-rendered but value is server-sourced (see ARCHITECTURE.md) — never let it silently drift or reset on re-render.

**Question area:**
```
QUESTION 07
07 / 25

<question text>

[ Option A ]
[ Option B ]
[ Option C ]
[ Option D ]
```
Options are large, full-width clickable cards — the entire card is the hit target, not a small radio circle. Distinct visual states: default, hover, selected (clear, high-contrast), disabled (post-submit/terminated).

**Navigator (right panel):** 5×5 grid of question numbers. Visual distinction for attempted / not-attempted / current. Progress line: `18 / 25 answered` and `7 remaining`. Clicking any number jumps directly to that question.

**Autosave feedback:** on selection → `Saving…` → `✓ Answer saved`, driven by the actual backend write completing, not optimistically shown before the request resolves. On failure, show a retry state (`Unable to save answer. Retrying…`) rather than a false success.

**Bottom actions:** `← Previous`, `Save & Next →`, `Review & Submit`. `Save & Next` never triggers full submission.

**Review screen/modal:** `18 Answered` / `7 Not Answered` summary, with the ability to jump back to any unanswered or answered question. Final submit requires an explicit confirm step (not a single accidental click).

**Post-submit:** locked, read-only state — no further option interaction, no misleading "editable" affordances.

### 3.4 Waiting Screen
Shown after qualifying, before Level 2 opens:
```
LEVEL 01 COMPLETE
You have qualified for the next round.

LEVEL 02
CODING ASSESSMENT
WAITING FOR ORGANIZER
```
Calm, static state — no countdown implying auto-start, since the organizer controls activation. Consider a subtle "checking status" indicator rather than a spinner that implies imminent action.

### 3.5 Coding Assessment
```
┌───────────────────────────────────────────────────────────┐
│ HEADER                                          TIMER       │
├──────────────────────────┬────────────────────────────────┤
│ PROBLEM STATEMENT        │ MONACO EDITOR                   │
│ - Description            │                                  │
│ - Examples                │                                  │
│ - Constraints             │                                  │
├──────────────────────────┴────────────────────────────────┤
│ LANGUAGE ▾      [ Run ]  [ Submit ]      TEST RESULTS       │
└───────────────────────────────────────────────────────────┘
```
- Problem panel: fixed-width, scrollable independently of the editor.
- Editor: Monaco, language selector (Python/C/C++/Java), sensible defaults (font size, line numbers, syntax highlighting matching the palette — not a default neon theme).
- Run vs Submit are visually distinct in weight (Run = secondary, Submit = primary, ideally with a confirm on submit given it's scored).
- Test results panel: shows pass/fail per visible test case, with clear states for compile error, runtime error, timeout, and "judge unavailable — submission recorded" — never a raw stack trace.
- Timer in header, same visual treatment as MCQ for consistency.

### 3.6 Termination Screen
A distinct, unambiguous full-screen state — not a modal that can be dismissed. States the reason in plain language, confirms the attempt is locked, and gives no further interactive assessment controls.

### 3.7 Admin
Utilitarian, data-dense, table-first — a different register from the participant-facing screens (more like an internal ops tool). Consistent table/list patterns across Participants, MCQ, Coding, Competition Control, Monitoring, and Results sections so admins don't relearn the UI per section. Every destructive/high-stakes action (open/close a round, disable a participant) needs a confirm step.

## 4. Cross-Cutting UI Rules

- No inconsistent spacing, no random font sizes, no unnecessary decorative cards.
- No placeholder or fake data anywhere in a production flow.
- No broken or awkward empty states — every list/table has a designed empty state.
- No generic dashboard template appearance — screens should look purpose-built for this competition, not a reskinned admin template.
- Minimal, functional animation only.
- Responsive priority: desktop → laptop → large tablet. MCQ and coding screens should not be squeezed into a mobile layout; if the viewport genuinely can't support the coding environment, show a clear, explicit message rather than a broken layout.

