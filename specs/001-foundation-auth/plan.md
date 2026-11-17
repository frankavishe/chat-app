# Implementation Plan: Foundation, Phone Sign-In, Devices, Profile & Contacts

**Branch**: `001-foundation-auth` | **Date**: 2026-11-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-foundation-auth/spec.md`

## Summary

Set up the three code repositories (`api`, `web`, `mobile`) and deliver account creation and
sign-in by phone number + one-time code, device management with live sign-out, profile setup and
editing, and contact discovery. The NestJS API issues short-lived JWT access tokens plus rotating
device-bound refresh tokens, stores data in PostgreSQL 16 (`postgres:16-trixie`), uses Redis for
rate limits and Socket.IO fan-out, and MinIO for profile photos. Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript (Node.js 24) for `api` and `web`; Dart 3.12 / Flutter 3.44 for `mobile`

**Primary Dependencies**: NestJS, Prisma, Socket.IO (+ Redis adapter), sharp, libphonenumber-js;
Next.js (App Router), Tailwind, TanStack Query, openapi-fetch; Flutter Riverpod, go_router, dio,
socket_io_client, flutter_secure_storage, flutter_contacts

**Storage**: PostgreSQL 16 (`postgres:16-trixie`), Redis 7 (ephemeral), MinIO (avatars)

**Testing**: Jest + supertest + Testcontainers (api); Vitest + Playwright (web);
flutter_test + integration_test (mobile)

**Target Platform**: Linux containers (api); evergreen desktop browsers (web); Android 7.0+ / API 24 (mobile)

**Project Type**: mobile app + web app + web service, in three separate repositories

**Performance Goals**: p95 < 1 s for request-code and verify (SC-002); discover 1,000 numbers < 3 s (SC-004)

**Constraints**: device sign-out effective < 10 s (SC-003); no secrets/OTP/tokens in production
logs; at most 1 Android + 4 web devices per account

**Scale/Scope**: MVP; ~10k users target; 3 repos; ~10 screens across both clients

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. E2EE by default | PASS | No message content in this feature. Profile data is public profile info (spec Assumptions). Device ids are designed as future Signal addresses. |
| II. Contract-first | PASS | `contracts/openapi.yaml` + `ws-events.schema.json` written first; copied to `api/contracts/`; web generates types; mobile models tested against contract examples. |
| III. Test-first | PASS | OTP, token rotation/reuse and device-limit logic are security-critical → written test-first. e2e on `postgres:16-trixie` via Testcontainers. No crypto in this feature, so interop/no-plaintext tests start in 002. |
| IV. Platform parity | PASS (documented limit) | Account creation is Android-only by spec (US3-2); every other story ships on both clients. |
| V. Simplicity | PASS | Postgres, Redis, MinIO only. coturn deferred to 006. |
| Repository structure | PASS | `api/`, `web/`, `mobile/` are separate repos, git-ignored by the Spec Kit repo. |

**Post-design re-check**: still PASS. The design adds no services or cross-repo imports.

## Project Structure

### Documentation (this feature)

```text
specs/001-foundation-auth/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── ws-events.schema.json
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code

```text
api/                                  # own git repo
├── contracts/                        # canonical openapi.yaml + ws-events.schema.json
├── docker-compose.yml                # postgres:16-trixie, redis, minio, minio-init, api
├── Dockerfile
├── .env.example
├── prisma/schema.prisma
├── src/
│   ├── main.ts, app.module.ts
│   ├── config/                       # env validation
│   ├── common/                       # error filter, rate-limit service, phone util, auth guard
│   ├── prisma/                       # PrismaService
│   ├── redis/                        # Redis client provider
│   ├── auth/                         # request-code, verify, refresh, sign-out; otp, tokens, sms/
│   ├── devices/                      # list, revoke, limits
│   ├── users/                        # /me, avatar upload, /avatars/:key, lookup
│   ├── contacts/                     # discover, list
│   ├── storage/                      # S3/MinIO client
│   └── realtime/                     # Socket.IO gateway (/rt) + RealtimeService.emit*
└── test/                             # e2e (Testcontainers) + jest-openapi

web/                                  # own git repo
├── .env.example                      # NEXT_PUBLIC_API_URL
├── src/
│   ├── app/
│   │   ├── (auth)/sign-in/page.tsx   # phone → code
│   │   ├── (app)/layout.tsx          # guarded shell
│   │   ├── (app)/page.tsx            # home (empty chat list for now)
│   │   ├── (app)/settings/profile/page.tsx
│   │   ├── (app)/settings/devices/page.tsx
│   │   └── (app)/new-chat/page.tsx   # lookup by number
│   ├── lib/api/                      # schema.d.ts (generated), client.ts (refresh on 401)
│   ├── lib/realtime/socket.ts
│   ├── stores/auth.ts
│   └── components/
└── tests/                            # vitest + playwright

mobile/                               # own git repo
├── lib/
│   ├── main.dart, app.dart, router.dart
│   ├── core/api/                     # dio client, auth interceptor, models/
│   ├── core/realtime/socket_service.dart
│   ├── core/storage/secure_store.dart
│   └── features/
│       ├── auth/                     # phone_screen, code_screen, auth_controller
│       ├── profile/                  # profile_setup_screen, profile_edit_screen
│       ├── devices/                  # linked_devices_screen
│       ├── contacts/                 # contacts_repository, new_chat_screen
│       └── home/                     # tabs: Chats / Updates / Calls (placeholders)
├── test/
└── integration_test/
```

**Structure Decision**: three independent repositories under the Spec Kit folder, as required by
the constitution's Repository Structure section. The API repo owns the contract and the local
infrastructure.

## Complexity Tracking

No violations.
