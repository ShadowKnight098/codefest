# IMPLEMENT.md — Build Plan & Quality Bar

How this gets built, in what order, and what "done" means at each step. Pairs with `DESIGN.md` (what it looks like) and `ARCHITECTURE.md` (how it's structured).

## 1. Strategy: Vertical Slices

Do not build every frontend screen first and wire the backend up after. Each slice below must be **fully functional end-to-end** — UI, API, DB — before starting the next one.

```
Slice 1 — Login          → Session → DB → Dashboard
Slice 2 — MCQ             → Questions → Answers → Autosave → Timer → Submit → Score
Slice 3 — Qualification   → Waiting screen → Level 2 activation
Slice 4 — Coding          → Problem → Editor → Submission → Judge → Score
Slice 5 — Security        → Tab monitoring → Security events → Termination
Slice 6 — Admin           → Participants → Questions → Competition control → Results
Slice 7 — Testing         → Load test → Security test → Deployment
```

## 2. Phased Detail

### Phase 1 — Foundation
- Initialize project structure (frontend + backend + shared types if applicable).
- Configure TypeScript, Tailwind, component/design-token system per `DESIGN.md`.
- Configure environment variables (no secrets committed) for dev/staging/prod.
- Configure Supabase project, connection pooling, migration tooling.
- Establish API structure/conventions (routing, error format, auth middleware).

**Done when:** a clean project boots locally, connects to Supabase, and has a defined migration workflow.

### Phase 2 — Authentication
- `participants` schema + hashed PIN storage.
- Login endpoint: validate Roll Number + Email + PIN, issue HTTP-only session cookie.
- Session validation middleware for all protected routes.
- Logout (server-side session invalidation).
- Rate limiting + failed-login lockout.

**Done when:** a seeded participant can log in, land on the dashboard, refresh without losing session, and log out; brute-force attempts are throttled.

### Phase 3 — MCQ
- `mcq_questions` schema with year/topic/difficulty; year-specific pools.
- Assignment logic: 25 questions per attempt, randomized, **persisted** (`mcq_attempt_questions`) on first entry.
- Question UI: three-panel layout, option cards, navigator (per `DESIGN.md`).
- Answer selection → upsert endpoint → `Saving…` / `✓ Answer saved`, backed by `UNIQUE(attempt_id, question_id)`.
- Server-authoritative timer (compute remaining from `started_at` + `duration`; force-submit on expiry).
- Review screen, confirm-to-submit.
- Server-side scoring + qualification (18/25 cutoff) on submit; attempt locked after.

**Done when:** a participant can complete a full MCQ attempt, refresh mid-attempt with no data loss, get force-submitted on timeout, and receive a correct, backend-computed qualification result.

### Phase 4 — Participant State
- Qualified / Not Qualified / Waiting / Level 2 Available / Terminated states wired to the state machine in `ARCHITECTURE.md`.
- Dashboard reflects live state on load (no stale/cached client assumptions).
- Level 2 entry blocked until admin opens the round, even via direct URL access.

**Done when:** every dashboard state in `DESIGN.md §3.2` is reachable and correctly gated server-side.

### Phase 5 — Coding
- `coding_problems` / `coding_test_cases` schema, hidden-test-case flag enforced at the API layer (never serialized to participants).
- Coding UI: problem panel + Monaco editor + language selector + run/submit + results panel.
- Submission API → queue → judge worker → sandboxed compile/execute → result written back.
- All failure modes surfaced distinctly: compile error, runtime error, timeout, memory limit, crash, invalid output, judge-unavailable.
- Scoring per test cases passed (0/5/10/15/20), server-computed.

**Done when:** submissions in all 4 languages execute correctly in isolation from the API process, hidden tests never leak, and every failure mode has a distinct, honest UI state.

### Phase 6 — Security
- `visibilitychange` listener during active attempts.
- Security-event endpoint with idempotency key to prevent double-counting.
- Server-side violation counting and threshold evaluation (1–3 warning, 4 final warning, 5 terminate).
- Termination: lock attempt, reject further writes, show termination screen.

**Done when:** rapid duplicate tab-switch events don't over-count, and termination is enforced at the API level even if the frontend is bypassed.

### Phase 7 — Admin
- Participants: import (with per-row validation/error report), search, view, enable/disable.
- MCQ management: add/edit/archive, year/topic/difficulty assignment.
- Coding management: add/edit problems, test cases, limits.
- Competition control: open/close Level 1 and Level 2.
- Monitoring: active participants, completed attempts, qualified/eliminated/terminated counts, security events.
- Results: view + export.

**Done when:** an admin can run the entire competition lifecycle — import participants, open Level 1, monitor live, open Level 2, export final results — without touching the database directly.

### Phase 8 — Testing
Functional coverage: authentication, MCQ, timers, autosave, qualification, security, coding, admin, database constraints.

Then: concurrent load testing at 400+ simulated participants across the highest-risk moments — login spikes, round-open, question load, autosave bursts, final submission, Level 2 activation, code-submission bursts.

**Done when:** the system holds correct state and acceptable latency under simulated full-scale load, with no data loss on autosave or duplicate scoring under retry/duplicate requests.

## 3. Code Quality Rules

- Strong typing throughout (TypeScript on the frontend, Pydantic schemas on the backend).
- Service/repository separation where it genuinely reduces complexity — not as a default pattern everywhere.
- Clear, documented API contracts between frontend and backend.
- Reusable UI components matching the `DESIGN.md` token system — no one-off styled components duplicating existing patterns.
- Consistent naming across DB, API, and frontend for the same concept.
- Environment-based configuration; no hardcoded URLs/secrets.
- Proper error handling at every I/O boundary; structured logging (not console.log-only) for anything security- or scoring-relevant.
- No unnecessary abstraction layers. No duplicated business logic between frontend and backend (frontend may mirror validation for UX, but the backend re-validates independently). No single file carrying unrelated responsibilities.

## 4. Definition of Done (project-level)

- Every value in `ARCHITECTURE.md §1` (score, qualification, timer, attempt status, round availability, eligibility, termination, correct answers) is verifiably backend-computed — check this explicitly per feature, not just assumed.
- Every screen in `DESIGN.md` has its full state set (loading/success/error/empty/disabled) implemented, not just the happy path.
- The system has been through Phase 8 load testing at target scale before being considered ready.
- No feature exists in the codebase that isn't required for Level 1 + Level 2 of the current competition flow.