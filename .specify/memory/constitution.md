<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (MINOR: new section, expanded guidance)
- Modified principles: II. Contract-First Protocol (contract lives in the api repo);
  V. Simplicity & Reproducible Infrastructure (compose file lives in the api repo)
- Added sections: Repository Structure (separate api, web, mobile repos + Spec Kit repo)
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no template edits required
- Deferred TODOs: none
-->

# Chat App Constitution

## Core Principles

### I. End-to-End Encryption by Default

- Message bodies, attachments, voice notes, status posts and group metadata visible to members
  MUST be encrypted on the sender's device with the Signal protocol (X3DH + Double Ratchet) and
  decrypted only on recipient devices.
- The server MUST NOT receive, log, or persist plaintext content, media keys, or private keys.
  It stores only public key material, routing metadata, and ciphertext.
- Media MUST be encrypted client-side (AES-256-GCM, random per-file key) before upload; the key
  and digest travel only inside an E2EE message.
- Call media MUST be peer-to-peer DTLS-SRTP; the server relays signaling and TURN traffic only.
- Plaintext history lives only in each device's encrypted local store.

Rationale: the product promise is private messaging; any server-side plaintext path is a defect.

### II. Contract-First Protocol

- `contracts/` in the `api` repository (OpenAPI for REST, JSON Schema for WebSocket events) is the
  single source of truth for every client–server interaction.
- Contract changes MUST land in the `api` repo before or with the implementing code. The `web` and
  `mobile` repos generate their types from that contract and MUST regenerate them in the matching
  change on their side.
- Breaking contract changes MUST bump the protocol version and keep the previous version working
  until both clients have shipped the new one.

Rationale: three codebases in two languages stay compatible only through one shared contract.

### III. Test-First for Protocol & Crypto (NON-NEGOTIABLE)

- Encryption, session handling, key management, envelope delivery and acknowledgement code MUST be
  written test-first: tests written, seen failing, then implemented.
- A cross-platform interop test (Dart client ↔ TypeScript client) MUST pass before any messaging
  feature is considered done.
- A "no plaintext at rest" test MUST send a known marker string and assert it does not appear in
  the database or object storage.
- Every API module MUST have e2e tests against a real `postgres:16-trixie` container.

Rationale: crypto bugs are silent and catastrophic; only tests catch them before users do.

### IV. Platform Parity

- Every user-facing feature MUST ship on both the Flutter Android app and the Next.js web app,
  unless the spec explicitly documents a platform limitation.
- Both clients MUST interoperate: any message, media item, status, or call started on one platform
  MUST work on the other.
- The visual design is original; WhatsApp names, logos, and assets MUST NOT be used.

Rationale: users mix devices; a feature that works on one platform only is a broken feature.

### V. Simplicity & Reproducible Infrastructure

- Runtime dependencies are limited to PostgreSQL 16 (`postgres:16-trixie`), Redis, S3-compatible
  object storage (MinIO in development), and coturn. Adding another stateful service requires a
  documented justification in the plan's Complexity Tracking table.
- The backend and its services MUST start with one `docker compose up` from the `api` repo using
  its `docker-compose.yml` and `.env.example` defaults; each client repo MUST start with a single
  documented command pointed at that backend.
- Prefer the smallest design that satisfies the spec (YAGNI). Sender keys, SFUs, and multi-region
  deployment are out of scope until a spec requires them.

Rationale: a small, reproducible stack is easier to secure, test, and run.

## Repository Structure

- Four independent Git repositories:
  - this Spec Kit repo (`chat app/`): constitution, specs, plans, tasks — no application code;
  - `api/`: NestJS backend, Prisma schema, `contracts/`, and the `docker-compose.yml` for
    PostgreSQL, Redis, MinIO and coturn;
  - `web/`: Next.js web client;
  - `mobile/`: Flutter Android client.
- The three code repos live as sub-folders of the Spec Kit repo for local development and are
  listed in its `.gitignore`; each has its own history, README, CI and `.env.example`.
- A feature uses the same branch name (e.g. `001-foundation-auth`) in every repo it touches.
- No code repo may import source from another; sharing happens only through the API contract.

## Technology & Security Constraints

- Backend: NestJS 11 (TypeScript), Prisma migrations, Socket.IO with the Redis adapter.
- Web: Next.js 15 App Router, TypeScript, Tailwind; local data in IndexedDB.
- Mobile: Flutter (Android target), Riverpod, drift with SQLCipher for the local store.
- Database: PostgreSQL 16 on Debian trixie (`postgres:16-trixie`), no other database engine.
- Authentication: phone number + one-time code. In development the code is written to the API log;
  production delivery goes through a pluggable SMS provider. Sessions use short-lived JWT access
  tokens plus rotating refresh tokens bound to a device.
- Secrets MUST come from environment variables; none are committed. Logs MUST NOT contain tokens,
  OTP codes outside development, key material, or ciphertext bodies.
- All network traffic in non-development environments MUST use TLS.

## Development Workflow & Quality Gates

- Work follows Spec Kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement`, one feature branch per spec.
- A feature is done only when: lint and type checks pass on all three apps; unit and e2e tests
  pass; the interop and no-plaintext tests pass where applicable; and the feature's quickstart
  scenarios have been run on both clients.
- Every plan MUST include a Constitution Check against principles I–V; any violation needs an entry
  in Complexity Tracking with a justification.
- Commits are small and scoped to one task or a coherent group of tasks.

## Governance

- This constitution supersedes other project conventions. Where a spec or plan conflicts with it,
  the constitution wins until it is amended.
- Amendments are made through `/speckit-constitution`, recorded with a Sync Impact Report, and
  versioned with semantic versioning: MAJOR for removed or redefined principles, MINOR for new
  principles or materially expanded guidance, PATCH for clarifications.
- `/speckit-analyze` and code review MUST verify compliance before `/speckit-implement` completes.

**Version**: 1.1.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-17
