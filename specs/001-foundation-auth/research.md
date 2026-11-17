# Research: 001 Foundation, Phone Sign-In, Devices, Profile & Contacts

No `NEEDS CLARIFICATION` items were left in the spec. This file records the technical decisions.

## R1. Repository layout and scaffolding

- **Decision**: Three independent Git repos as sub-folders of the Spec Kit repo: `api/`, `web/`,
  `mobile/`. Each is scaffolded with its official generator at the current stable version:
  `nest new`, `create-next-app` (TypeScript, App Router, Tailwind, ESLint, `src/` dir),
  `flutter create --platforms android --org com.chatapp`.
- **Rationale**: Matches the user's request and constitution "Repository Structure". Generators
  give the supported default setup, so versions are whatever is stable at scaffold time and are
  pinned by each repo's lockfile.
- **Alternatives**: Nx/Turborepo monorepo (rejected by user); git submodules (adds friction with
  no benefit for local dev).

## R2. Sharing the API contract across repos

- **Decision**: `api/contracts/openapi.yaml` and `api/contracts/ws-events.schema.json` are the
  source of truth. `web` runs `openapi-typescript ../api/contracts/openapi.yaml` (path overridable
  with `CONTRACT_PATH`) and commits the generated `src/lib/api/schema.d.ts`. `mobile` keeps
  hand-written Dart models in `lib/core/api/models/` checked by a contract test that decodes the
  OpenAPI examples.
- **Rationale**: No repo imports another's source; generated output is committed so each repo
  builds alone. Dart OpenAPI generators produce heavy code for a small API; a few models plus a
  test against the contract's examples is simpler.
- **Alternatives**: publish an npm package (overkill now); a fourth "contracts" repo (one more repo
  to sync with no gain while the API team owns the contract).

## R3. One-time codes

- **Decision**: 6-digit code from a CSPRNG. Stored as `HMAC-SHA256(pepper, phone || code)` in
  `otp_challenges`, expiry 5 min, `attempts` counter (max 5), `consumed_at`. Comparison is
  constant-time. Delivery through an `SmsSender` interface; the `LogSmsSender` (dev) logs
  `OTP for +255…: 123456`. Production providers are added later behind the same interface.
- **Rate limits** (Redis counters with TTL): 1 request / 60 s and 5 / hour per phone; 20 / hour per
  IP; verify limited to 10 / 10 min per IP.
- **Enumeration**: `request-code` always returns `202` with the same body whether or not the number
  is registered. On web, "account not found" is only returned after a correct code.
- **Alternatives**: TOTP (wrong fit); storing codes in Redis only (loses audit trail; Postgres row
  is cheap).

## R4. Sessions and tokens

- **Decision**: Access token = JWT (HS256, 15 min) with `sub` (user id), `did` (device id),
  `dtype`. Refresh token = 256-bit random opaque string, stored as SHA-256 hash in `sessions`,
  rotated on every refresh, 30-day sliding expiry. Reusing an already-rotated refresh token
  revokes the whole device (theft detection). Each request checks the device is not revoked via a
  Redis-cached device status (TTL 30 s, busted on revoke).
- **Clients**: Android keeps the refresh token in `flutter_secure_storage` (Android Keystore).
  Web receives the refresh token as an `HttpOnly; Secure; SameSite=Strict` cookie scoped to
  `/v1/auth`; the access token lives only in memory. Localhost ports are same-site, so dev works.
- **Clock skew**: clients never read token `exp`; they use the server's `expiresIn` relative value,
  so a wrong device clock cannot break sign-in.
- **Alternatives**: long-lived JWT only (no revocation); server-side session cookies for both
  clients (awkward for mobile and sockets).

## R5. Device rules

- **Decision**: Verifying on Android revokes any other Android device of the account (reason
  `replaced`). Verifying on web creates a web device; if 4 non-revoked web devices exist, the least
  recently active one is revoked (reason `evicted`). Revocation emits `device:revoked` to that
  device's socket room and the client wipes local data and returns to sign-in.
- **Rationale**: Matches FR-005 and US3/US4. Device ids are UUIDs reused later as Signal device
  addresses (FR-010).

## R6. Realtime channel

- **Decision**: Socket.IO namespace `/rt` on the API, authenticated by the access token in the
  handshake `auth.token`. Each socket joins rooms `user:{userId}` and `device:{deviceId}`. Redis
  adapter (`@socket.io/redis-adapter`) so multiple API instances share rooms. Events in this
  feature: `device:revoked`, `profile:updated`. Clients reconnect with exponential backoff and a
  fresh access token.
- **Alternatives**: raw WebSocket (have to rebuild rooms, acks and reconnection); SSE (one-way,
  and feature 002 needs two-way).

## R7. Phone number handling

- **Decision**: Store E.164 only. Server validates with `libphonenumber-js` (max metadata). Web
  uses the same library for the input; Android uses `phone_numbers_parser`. The user picks a
  country; numbers typed in local format are converted before sending.

## R8. Profile photos

- **Decision**: `PUT /v1/me/avatar` multipart upload (≤5 MB, JPEG/PNG/WebP, checked by magic
  bytes). API uses `sharp` to center-crop to 640×640 WebP and a 96×96 thumbnail, stores them in the
  MinIO bucket `avatars` under a random key, and returns URLs served by `GET /v1/avatars/{key}`
  (API streams from MinIO with long cache headers; new key on every change). Clients also offer a
  crop UI before upload (`image_cropper` on Android, `react-easy-crop` on web).
- **Rationale**: Profile data is public profile data (spec Assumptions), so it does not go through
  the E2EE media path from feature 004.

## R9. Contact discovery

- **Decision**: `POST /v1/contacts/discover` takes up to 1,000 E.164 numbers per call and returns
  only matching accounts (id, phone, name, about, avatar). Matches are upserted into `contacts`;
  non-matching numbers are never written or logged. Rate limit: 10 calls / hour / device. Android
  reads the address book with `flutter_contacts`; re-runs on app open, at most once an hour.
  `GET /v1/users/lookup?phone=` serves the single-number lookup (rate limited 60 / hour / device).
- **Alternatives**: sending hashes of numbers (phone numbers are a small space, so hashes are
  easily reversed and give no real privacy); private set intersection (too complex for now).

## R10. Backend libraries

- **Decision**: NestJS (current stable) with: Prisma (ORM + migrations), `@nestjs/jwt`,
  `class-validator`/`class-transformer` for DTOs, `ioredis`, `@nestjs/platform-socket.io` +
  `@socket.io/redis-adapter`, `@aws-sdk/client-s3` for MinIO, `sharp`, `libphonenumber-js`,
  `nestjs-pino` for structured logs with redaction of `authorization`, `cookie`, `code`,
  `refreshToken`.
- **Testing**: Jest unit tests; e2e with `supertest` + `@testcontainers/postgresql` using image
  `postgres:16-trixie` and `@testcontainers/redis`. Responses checked against `openapi.yaml` with
  `jest-openapi`.

## R11. Web libraries

- **Decision**: Next.js App Router (client-rendered app shell; no server-side session), Tailwind,
  TanStack Query, Zustand for auth state, `openapi-fetch` with the generated schema,
  `socket.io-client`, `libphonenumber-js`, `react-easy-crop`. Tests: Vitest + Testing Library;
  Playwright for e2e against a running API.

## R12. Mobile libraries

- **Decision**: Flutter (Android, minSdk 24) with Riverpod, go_router, dio (+ refresh interceptor),
  `socket_io_client`, `flutter_secure_storage`, `flutter_contacts`, `permission_handler`,
  `image_picker` + `image_cropper`, `phone_numbers_parser`, `cached_network_image`. Tests:
  `flutter_test` unit/widget tests, `integration_test` against a running API (emulator reaches the
  host at `10.0.2.2`).

## R13. Local infrastructure

- **Decision**: `api/docker-compose.yml` with `postgres:16-trixie`, `redis:7-alpine`, `minio/minio`
  (+ a one-shot `minio/mc` job creating the `avatars` bucket), and the `api` service (dev profile
  uses `npm run start:dev` with a bind mount). coturn is added in feature 006. Healthchecks gate
  startup order; Prisma migrations run on API start in dev.
