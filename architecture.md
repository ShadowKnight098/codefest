# ARCHITECTURE.md — System & Data Design

Defines how the system is put together: services, data flow, schema, and the authority boundaries between frontend, backend, and database. Read before writing backend logic.

## 1. Core Principle: Server Authority

The frontend renders state; it never computes it. These values are always backend/DB-authoritative and are only ever *displayed*, never *decided*, client-side:

- Score
- Qualification
- Timer remaining
- Attempt status
- Round availability
- Participant eligibility
- Termination status
- Correct answers

Any endpoint that returns one of these must compute it server-side from the database on every request — not trust a value sent by the client.

## 2. High-Level Components

```
┌─────────────┐      ┌──────────────┐      ┌──────────────────┐
│  Frontend   │◄────►│   Backend    │◄────►│ Supabase Postgres │
│ (React/TS)  │      │  (API layer) │      │  (authoritative)  │
└─────────────┘      └──────┬───────┘      └──────────────────┘
                             │
                    ┌────────┴────────┐
                    │  Redis (queue /  │
                    │  cache, scoped)  │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │  Judge Worker(s) │
                    │  (isolated       │
                    │   sandbox exec)  │
                    └─────────────────┘
```

- **Frontend:** renders UI, sends actions, never holds authoritative state beyond what's needed for optimistic UI feedback (e.g. showing "Saving…" while awaiting confirmation).
- **Backend:** owns all business rules — auth, scoring, qualification, round control, timer computation, security-event evaluation. Stateless where possible so it can scale horizontally behind a load balancer.
- **Supabase Postgres:** the single source of truth. All authoritative reads/writes go through the backend, not directly from the frontend (no client-side Supabase calls that bypass backend rules for anything scored or security-relevant).
- **Redis:** used narrowly — job queue for code execution, rate-limiting counters, ephemeral caching. Never the source of truth for scores or state.
- **Judge Worker:** the only component that executes participant code, fully isolated from the API process.

## 3. Authentication & Sessions

- Credentials: Roll Number + Registered Email + Access PIN (no OTP).
- PINs hashed at rest (bcrypt/argon2-class hashing) — never stored or logged in plaintext.
- On successful login, backend issues an HTTP-only, secure, same-site session cookie. No tokens in localStorage/sessionStorage.
- Session validated server-side on every protected request (not just at login).
- Rate limiting on login attempts per roll number and per IP; escalating lockout on repeated failures.
- Logout invalidates the session server-side (not just client-side cookie clearing).

## 4. Competition State Machine

Each participant's round progress is a server-tracked state, not inferred by the frontend:

```
NOT_STARTED → LEVEL1_IN_PROGRESS → LEVEL1_SUBMITTED
                                        │
                          ┌─────────────┴─────────────┐
                          ▼                             ▼
                    NOT_QUALIFIED                  QUALIFIED
                                                        │
                                              WAITING_FOR_LEVEL2
                                                        │
                                          (organizer opens Level 2)
                                                        ▼
                                             LEVEL2_IN_PROGRESS
                                                        │
                                                        ▼
                                                  LEVEL2_SUBMITTED

Any state → TERMINATED (via security violations)
```

Round availability (`Level 1 open`, `Level 2 open`) lives in `competition_settings` / `rounds`, toggled only by admin actions. The dashboard and assessment entry points always re-check this server-side before allowing entry — a participant cannot enter Level 2 by hitting a URL directly if it isn't open, and cannot re-enter a submitted or terminated attempt.

## 5. MCQ Flow

1. On first entry to Level 1, backend assigns a fixed set of 25 questions from the participant's year-specific pool, randomizes order, and **persists the assignment** (`mcq_attempt_questions`) — so a refresh or reconnect always shows the same set in the same order, not a re-roll.
2. Timer: backend records `attempt.started_at` and `duration`. Remaining time is always computed server-side as `duration - (now - started_at)`; the client polls/receives this value and renders a countdown from it, resyncing periodically so client-side drift never becomes authoritative. If time expires server-side, the backend force-submits the attempt regardless of client state.
3. Each answer selection calls an upsert endpoint: `INSERT ... ON CONFLICT (attempt_id, question_id) DO UPDATE`. This is enforced by a DB constraint `UNIQUE(attempt_id, question_id)`, not just application logic — so even a retried/duplicated request can't create duplicate rows.
4. On submit: backend locks the attempt (`status = SUBMITTED`, further writes rejected), scores it against `mcq_questions.correct_option` server-side, computes qualification against the fixed threshold (18/25), and writes `round_results`. The response returns the result; the frontend never calculates or guesses it.

## 6. Coding Flow

1. Problems and test cases are stored server-side (`coding_problems`, `coding_test_cases`); hidden test cases are flagged and never serialized to the participant-facing API response.
2. Submission flow:
   ```
   Editor → POST /submissions → Backend validates attempt/round state
        → writes coding_submissions (status=QUEUED) → enqueues job (Redis)
        → Judge Worker picks up job → runs in sandbox (resource/time limits)
        → compiles/executes against test cases → writes result back to DB
        → Backend/frontend polls or subscribes for completion
   ```
3. The judge worker is a separate process/container with no access to the main DB credentials beyond what's needed to write results — it never touches participant auth or scoring tables directly except its own submission-result write path.
4. Failure modes are modeled explicitly and stored per submission: `COMPILE_ERROR`, `RUNTIME_ERROR`, `TIMEOUT`, `MEMORY_LIMIT_EXCEEDED`, `CRASHED`, `WRONG_OUTPUT`. If the judge is unreachable, the submission is still recorded as `QUEUED`/`PENDING_JUDGE` — never silently dropped — and the participant sees "recorded, awaiting judge" rather than an error.
5. Scoring is a pure function of test cases passed (0→0, 1→5, 2→10, 3→15, 4→20 per problem), computed and stored server-side only.

## 7. Security / Tab Monitoring

1. Frontend listens to `document.visibilitychange` during an active attempt and POSTs an event on each transition to hidden.
2. Backend is the single point of truth for violation count: it increments `security_events` for the attempt, using an idempotency key (e.g. client-generated event id + timestamp bucket) so a duplicate/retried request can't double-count.
3. Violation thresholds (1–3 warning, 4 final warning, 5 terminate) are evaluated server-side on each incoming event; the response tells the frontend which banner to show — the frontend does not decide to terminate itself.
4. On the 5th violation, backend sets `attempt.status = TERMINATED`, and every subsequent write endpoint (answer save, code submit) checks status first and rejects with a clear error if terminated.

## 8. Data Model

Core tables and their role:

| Table | Purpose |
|---|---|
| `participants` | Identity, year, hashed PIN, enabled/disabled flag |
| `admin_users` | Admin accounts, separate from participant auth |
| `competitions` | Top-level competition instance/config |
| `rounds` | Level 1 / Level 2 definitions, open/close state |
| `mcq_questions` | Question bank, year/topic/difficulty, correct answer |
| `mcq_attempts` | One per participant per round: status, timing |
| `mcq_attempt_questions` | Persisted 25-question assignment + order per attempt |
| `mcq_answers` | Participant's selected option per question (`UNIQUE(attempt_id, question_id)`) |
| `coding_problems` | Problem statement, difficulty, time limit, marks |
| `coding_test_cases` | Inputs/expected outputs, `is_hidden` flag |
| `coding_attempts` | One per participant per coding round |
| `coding_submissions` | Each run/submit event, status, judge result |
| `round_results` | Final computed result per participant per round |
| `security_events` | Visibility-change violations, with idempotency key |
| `audit_logs` | Admin actions, round transitions, sensitive operations |
| `competition_settings` | Global toggles — round open/close, qualifying threshold, etc. |

Constraints/indexes to enforce, not just document:
- `UNIQUE(attempt_id, question_id)` on `mcq_answers`.
- `UNIQUE(participant_id, round_id)` on attempts tables (no duplicate attempts).
- FKs from every attempt/answer/submission back to `participants` and the relevant round/problem/question.
- Index on `participants(roll_number)`, `participants(email)` for login lookups.
- Index on `mcq_answers(attempt_id)`, `coding_submissions(attempt_id)` for fast per-attempt reads.
- All multi-row writes (assigning questions, recording a submission result, applying a violation) wrapped in transactions.

## 9. Participant Import

CSV/Excel/Sheets export → validation pass (required fields, email format, valid year, duplicate roll number/email within the file and against existing data, malformed rows) → PINs hashed → bulk insert in a transaction, with a per-row error report returned to the admin rather than a partial silent import. The live competition reads only from Postgres afterward — no runtime dependency on the sheet.

## 10. Performance & Scaling (400+ concurrent)

- Connection pooling (e.g. PgBouncer/Supabase pooler) sized for concurrent login + autosave bursts.
- Backend stateless behind a load balancer so it can scale horizontally for round-start spikes.
- Redis used for: code-execution queue, login rate-limit counters, optionally short-lived caching of question banks (not answers/scores).
- Judge workers scaled independently of the API — they're the component most likely to be a bottleneck at round-2 start.
- Autosave and security-event endpoints are the highest-frequency writes; they should be lightweight, indexed, single-row upserts — not run through heavy business logic per call.
- No infrastructure added for theoretical scale beyond this — keep it deployable and operable within the project timeline.

## 11. Deployment Shape

- Frontend: static/SSR build deployed to a CDN-backed host.
- Backend API: containerized, horizontally scalable, environment-configured (no secrets in code).
- Judge workers: separate container/service, isolated network/filesystem access, no inbound access from participants.
- Supabase: managed Postgres, connection pooling enabled, backups configured.
- Redis: managed instance, scoped only to queueing/rate-limiting.
- All environments (dev/staging/prod) configured via environment variables, with prod secrets never committed.