---
description: "Task list for 001-foundation-auth"
---

# Tasks: Foundation, Phone Sign-In, Devices, Profile & Contacts

**Input**: Design documents from `/specs/001-foundation-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Required (Vitest in all TS repos). The constitution (III) makes OTP, token and device-limit logic test-first, and
every API module needs e2e tests on `postgres:16-trixie`.

**Organization**: Grouped by user story. Paths are relative to the Spec Kit folder; `api/`, `web/`
and `mobile/` are three separate Git repositories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Scaffold NestJS 12 app in `api/` (`nest new api --package-manager npm --strict`; ESM + Vitest), `git init`, branch `001-foundation-auth`, add `api/.gitignore`
- [X] T002 [P] Scaffold Next.js app in `web/` (`create-next-app` with TypeScript, App Router, Tailwind, ESLint, `src/`), `git init`, branch `001-foundation-auth`
- [X] T003 [P] Scaffold Flutter app in `mobile/` (`flutter create --platforms android --org com.chatapp --project-name chat_app mobile`), `git init`, branch `001-foundation-auth`, set Android minSdk 24
- [X] T004 Copy contracts to `api/contracts/openapi.yaml` and `api/contracts/ws-events.schema.json`
- [X] T005 Create `api/docker-compose.yml` (postgres:16-trixie, redis:7-alpine, minio, minio-init creating `avatars` bucket, healthchecks) and `api/.env.example`
- [X] T006 [P] Add `api/Dockerfile` (multi-stage, node:24-trixie-slim) and `api` service in compose under profile `full`
- [X] T007 [P] Add API deps (prisma, @prisma/client, @prisma/adapter-pg, @nestjs/jwt, @nestjs/config, @nestjs/schedule, zod, ioredis, @nestjs/platform-socket.io, @nestjs/websockets, socket.io, @socket.io/redis-adapter, @aws-sdk/client-s3, sharp, libphonenumber-js, nestjs-pino, pino-http, cookie-parser, uuid) and dev deps (@testcontainers/postgresql, @testcontainers/redis, ajv, ajv-formats, yaml, socket.io-client, @types/multer, @types/cookie-parser)
- [X] T008 [P] Add web deps (@tanstack/react-query, zustand, openapi-fetch, openapi-typescript, socket.io-client, libphonenumber-js, react-easy-crop, vitest, @testing-library/react, jsdom, @playwright/test) and `web/.env.example`
- [X] T009 [P] Add mobile deps (flutter_riverpod, go_router, dio, socket_io_client, flutter_secure_storage, flutter_contacts, permission_handler, image_picker, image_cropper, phone_numbers_parser, cached_network_image, device_info_plus) and Android permissions (INTERNET, READ_CONTACTS)
- [X] T010 [P] Write a README in each repo (`api/README.md`, `web/README.md`, `mobile/README.md`) with setup, run and test commands (FR-016)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story work starts until this phase is complete.**

- [X] T011 Write Prisma schema for users, devices, sessions, otp_challenges, contacts per data-model.md in `api/prisma/schema.prisma`; create first migration
- [X] T012 [P] Env config with validation (DATABASE_URL, REDIS_URL, JWT_SECRET, OTP_PEPPER, S3_*, PUBLIC_URL, WEB_ORIGIN) in `api/src/config/`
- [X] T013 [P] PrismaService in `api/src/prisma/` and Redis provider in `api/src/redis/`
- [X] T014 [P] Global error filter returning contract `Error` shape + global `StandardSchemaValidationPipe` (Zod) whose `exceptionFactory` maps to `VALIDATION_FAILED` in `api/src/common/`
- [X] T015 [P] pino logger with redaction of authorization, cookie, code, refreshToken in `api/src/main.ts` / `app.module.ts`
- [X] T016 [P] Test-first: unit tests for `RateLimitService` (fixed-window Redis counters, Retry-After) in `api/src/common/rate-limit.service.spec.ts`, then implement
- [X] T017 [P] Test-first: unit tests for phone normalisation util in `api/src/common/phone.spec.ts`, then implement with libphonenumber-js
- [X] T018 Test-first: unit tests for `TokenService` (sign access JWT with sub/did/dtype, 15 min; generate + hash refresh tokens) in `api/src/auth/token.service.spec.ts`, then implement
- [X] T019 `JwtAuthGuard` checking signature + device active (Redis cache `dev:status:*`, fallback DB) in `api/src/common/auth.guard.ts`
- [X] T020 Realtime gateway on namespace `/rt` with handshake auth in `server.use()` middleware, rooms `user:*`/`device:*`, Redis adapter, and `RealtimeService.emitToDevice/emitToUsers` in `api/src/realtime/`
- [X] T021 e2e harness: Testcontainers postgres:16-trixie + redis, run migrations, boot app, contract matcher (Ajv 2020 over `contracts/openapi.yaml` components) in `api/test/support/`
- [X] T022 [P] Web: API client from generated types (`npm run gen:api` → `src/lib/api/schema.d.ts`), fetch wrapper with `credentials: 'include'` and single-flight refresh on 401 in `web/src/lib/api/client.ts`
- [X] T023 [P] Web: auth store (access token in memory, user, device) in `web/src/stores/auth.ts`; QueryClient provider in `web/src/app/providers.tsx`
- [X] T024 [P] Web: socket client with reconnect + token refresh on `auth:expired`/`connect_error` in `web/src/lib/realtime/socket.ts`
- [X] T025 [P] Mobile: Dart models matching contract schemas in `mobile/lib/core/api/models/` + test decoding OpenAPI examples in `mobile/test/contract_models_test.dart`
- [X] T026 [P] Mobile: dio client with auth interceptor (refresh via secure-stored refresh token, single-flight) in `mobile/lib/core/api/api_client.dart`; secure store wrapper in `mobile/lib/core/storage/secure_store.dart`
- [X] T027 [P] Mobile: socket service in `mobile/lib/core/realtime/socket_service.dart`
- [X] T028 [P] Mobile: app theme (original palette), go_router with auth redirect, Riverpod root in `mobile/lib/app.dart`, `mobile/lib/router.dart`

**Checkpoint**: compose stack up, migrations applied, empty app shells run on web and Android.

---

## Phase 3: User Story 1 – Register and sign in on Android (P1) 🎯 MVP

**Goal**: phone + code → account + Android device; stays signed in.

**Independent Test**: fresh install → sign up with code from API log → home; restart → still signed in.

### Tests (write first, must fail)

- [X] T029 [P] [US1] Unit tests for `OtpService` (6 digits, HMAC storage, 5-min expiry, 5 attempts, single use, newer challenge invalidates older, constant-time compare) in `api/src/auth/otp.service.spec.ts`
- [X] T030 [P] [US1] Unit tests for `DevicesService.registerAndroid` (revokes other Android device with `replaced`) in `api/src/devices/devices.service.spec.ts`
- [X] T031 [P] [US1] Unit tests for refresh rotation and reuse detection (`token_reuse` revokes device; expired → `inactive`) in `api/src/auth/session.service.spec.ts`
- [X] T032 [US1] e2e: request-code (202, same body for unknown numbers, 429 limits), verify android (new + existing account), refresh rotate + reuse, sign-out in `api/test/auth.e2e-spec.ts`

### Implementation

- [X] T033 [US1] `SmsSender` interface + `LogSmsSender` in `api/src/auth/sms/`
- [X] T034 [US1] Implement `OtpService` in `api/src/auth/otp.service.ts`
- [X] T035 [US1] Implement `SessionService` (create, rotate, revoke) in `api/src/auth/session.service.ts`
- [X] T036 [US1] Implement `DevicesService.registerAndroid` in a transaction with user row lock; emit `device:revoked` to replaced device
- [X] T037 [US1] `AuthController` `POST /auth/request-code|verify|refresh|sign-out` with rate limits in `api/src/auth/auth.controller.ts`
- [ ] T038 [P] [US1] Mobile: phone entry screen with country picker + validation in `mobile/lib/features/auth/phone_screen.dart`
- [ ] T039 [P] [US1] Mobile: code screen (6-digit input, resend countdown, error messages for each error code) in `mobile/lib/features/auth/code_screen.dart`
- [ ] T040 [US1] Mobile: `AuthController` (Riverpod) — verify, persist tokens, restore session on start, handle `device:revoked` (wipe storage, go to sign-in) in `mobile/lib/features/auth/auth_controller.dart`
- [ ] T041 [US1] Mobile: home with Chats / Updates / Calls tabs (placeholders) in `mobile/lib/features/home/home_screen.dart`
- [ ] T042 [US1] Mobile widget tests for phone and code screens in `mobile/test/auth_screens_test.dart`

**Checkpoint**: US1 independently testable on emulator.

---

## Phase 4: User Story 2 – Profile setup and editing (P1)

**Goal**: required name, optional about + photo; edits sync to other devices.

**Independent Test**: complete setup, change name/photo; the other signed-in client updates within 10 s.

### Tests

- [X] T043 [P] [US2] e2e: `GET/PATCH /me` validation (1–25 / 140), avatar upload type/size checks (magic bytes, 413), `GET /avatars/:key`, `profile:updated` emitted in `api/test/profile.e2e-spec.ts`

### Implementation

- [X] T044 [P] [US2] `StorageService` (S3 client for MinIO: put/get/delete) in `api/src/storage/storage.service.ts`
- [X] T045 [US2] `UsersService` + `MeController` (`GET/PATCH /me`, `PUT/DELETE /me/avatar` with sharp 640/96 WebP) and `AvatarsController` in `api/src/users/`
- [X] T046 [US2] Emit `profile:updated` to the user and to users who have them as a contact
- [ ] T047 [P] [US2] Mobile: profile setup screen (name required, photo pick + crop) shown when `profileComplete=false` in `mobile/lib/features/profile/profile_setup_screen.dart`
- [ ] T048 [P] [US2] Mobile: Settings → Profile edit screen in `mobile/lib/features/profile/profile_edit_screen.dart`; apply `profile:updated`
- [X] T049 [P] [US2] Web: Settings → Profile page with crop (react-easy-crop) in `web/src/app/(app)/settings/profile/page.tsx`; apply `profile:updated` to the auth store

**Checkpoint**: US1 + US2 = usable MVP on Android.

---

## Phase 5: User Story 3 – Sign in on the web app (P2)

**Goal**: existing account signs in on web as an extra device; 4-web-device limit.

**Independent Test**: account from Android signs in on web; both stay signed in.

### Tests

- [X] T050 [P] [US3] Unit tests for `DevicesService.registerWeb` (no account → ACCOUNT_NOT_FOUND after correct code; 5th web device evicts least recently active with `evicted`) in `api/src/devices/devices.service.spec.ts`
- [X] T051 [US3] e2e: verify with `deviceType: web` sets HttpOnly `rt` cookie and omits `refreshToken`; refresh via cookie; CORS with credentials from `WEB_ORIGIN` in `api/test/auth-web.e2e-spec.ts`

### Implementation

- [X] T052 [US3] Implement `registerWeb` + cookie handling in `AuthController`; enable CORS with credentials for `WEB_ORIGIN`
- [X] T053 [P] [US3] Web: sign-in page (country + phone, then code, resend countdown, error states incl. "create your account on the Android app first") in `web/src/app/(auth)/sign-in/page.tsx`
- [X] T054 [US3] Web: guarded `(app)` layout that restores session via `/auth/refresh` on load, redirects to sign-in, opens socket, handles `device:revoked` in `web/src/app/(app)/layout.tsx`
- [X] T055 [P] [US3] Web: home shell (left chat list placeholder, right empty state, original design) in `web/src/app/(app)/page.tsx`
- [X] T056 [P] [US3] Web: Vitest tests for phone validation and the sign-in form in `web/tests/sign-in.test.tsx`

---

## Phase 6: User Story 4 – Manage signed-in devices (P2)

**Goal**: list devices, sign out any; remote device leaves within 10 s.

**Independent Test**: phone + 2 browsers; sign one browser out from the phone; it returns to sign-in.

### Tests

- [X] T057 [US4] e2e: `GET /devices` (current flag), `DELETE /devices/:id` (own only, 404 otherwise), revoked device's next request → 401 `SESSION_REVOKED`, socket receives `device:revoked` in `api/test/devices.e2e-spec.ts`

### Implementation

- [X] T058 [US4] `DevicesController` (`GET /devices`, `DELETE /devices/:id`), update `last_active_at` at most once a minute in guard, bust `dev:status` cache on revoke in `api/src/devices/`
- [ ] T059 [P] [US4] Mobile: Settings → Linked devices screen in `mobile/lib/features/devices/linked_devices_screen.dart`
- [X] T060 [P] [US4] Web: Settings → Devices page in `web/src/app/(app)/settings/devices/page.tsx`
- [ ] T061 [US4] Playwright: two browser contexts; revoke one from the other; it lands on sign-in within 10 s in `web/tests/e2e/devices.spec.ts` — spec written, not yet run (needs local API on :3000)

---

## Phase 7: User Story 5 – Find contacts (P3)

**Goal**: address-book discovery on Android; single-number lookup on both clients.

**Independent Test**: B's number in A's address book → B appears in A's New chat.

### Tests

- [X] T062 [US5] e2e: discover (≤1,000 numbers, only matches returned, unmatched not stored, self excluded, 429), `GET /contacts`, `GET /users/lookup` (404 USER_NOT_FOUND) in `api/test/contacts.e2e-spec.ts`

### Implementation

- [X] T063 [US5] `ContactsService` + controllers (`POST /contacts/discover`, `GET /contacts`, `GET /users/lookup`) in `api/src/contacts/`
- [ ] T064 [P] [US5] Mobile: contacts repository (permission, read + normalise numbers, discover on app open at most hourly) in `mobile/lib/features/contacts/contacts_repository.dart`
- [ ] T065 [P] [US5] Mobile: New chat screen (contact list + "enter number" lookup, permission-denied state) in `mobile/lib/features/contacts/new_chat_screen.dart`
- [X] T066 [P] [US5] Web: New chat page with number lookup and contacts list in `web/src/app/(app)/new-chat/page.tsx`

---

## Phase 8: Polish & Cross-Cutting

- [X] T067 [P] OTP cleanup job (delete challenges > 24 h) and 30-day inactive device sweep in `api/src/auth/cleanup.service.ts`
- [ ] T068 [P] Playwright full sign-in flow (reads OTP via a dev-only `GET /v1/dev/last-otp` enabled only when `NODE_ENV=development`) in `web/tests/e2e/sign-in.spec.ts` — spec written, not yet run (needs local API on :3000)
- [ ] T069 [P] Mobile integration test: sign up → profile → home → restart in `mobile/integration_test/sign_in_test.dart`
- [X] T070 [P] Verify production logs contain no tokens/OTP (e2e with `NODE_ENV=production` logger capture) in `api/test/logging.e2e-spec.ts`
- [ ] T071 Run all checks from quickstart.md §2 and manual scenarios §3; fix failures
- [ ] T072 [P] CI workflow per repo: `api/.github/workflows/ci.yml`, `web/.github/workflows/ci.yml`, `mobile/.github/workflows/ci.yml`

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → user stories.
- **US1** first (creates accounts). **US2** needs US1. **US3** needs US1 (accounts exist).
  **US4** needs US1; its web half needs US3. **US5** needs US1 + US2 (names/photos to show).
- Polish after all stories.

```text
Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish
                              └──────→ US3 (can start after US1)
```

## Parallel Examples

- Setup: T002, T003 alongside T001; T007–T010 together.
- Foundational: T012–T017 together; web T022–T024 and mobile T025–T028 in parallel with API work.
- US1: tests T029–T031 together; mobile screens T038/T039 while API T033–T037 are built.
- US2: T044 alongside T047–T049.

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US2 → Android sign-up with profile. Validate with
   quickstart scenarios 1–2.
2. Add US3 (web sign-in) → US4 (devices) → US5 (contacts), validating each with its independent test.
3. Polish, CI, then start feature `002-e2ee-1to1-messaging`.
