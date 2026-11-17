# Quickstart & Validation: 001 Foundation, Phone Sign-In, Devices, Profile & Contacts

## Prerequisites

- Docker Desktop running
- Node.js 24 + npm
- Flutter (stable) with an Android emulator (API 24+)
- The three repos checked out side by side inside the Spec Kit folder:
  `chat app/api`, `chat app/web`, `chat app/mobile`

## 1. Start the backend (api repo)

```bash
cd api
cp .env.example .env
docker compose up -d          # postgres:16-trixie, redis, minio (+ bucket init)
npm install
npx prisma migrate dev
npm run start:dev             # http://localhost:3000/v1
```

Check: `docker compose exec postgres psql -U chat -c "select version();"` prints PostgreSQL 16.x
on Debian (trixie).

## 2. Automated checks

| Repo | Command | Expected |
|---|---|---|
| api | `npm run lint && npm test` | unit tests pass |
| api | `npm run test:e2e` | e2e tests (Testcontainers, `postgres:16-trixie`) pass; responses match `contracts/openapi.yaml` |
| web | `npm run lint && npm test` | Vitest passes |
| web | `npm run test:e2e` | Playwright passes against a running API |
| mobile | `flutter analyze && flutter test` | no issues, tests pass |
| mobile | `flutter test integration_test` | passes on emulator with API running |

## 3. Manual scenarios

Codes are printed in the API log as `OTP for +2557…: 123456`.

1. **Android sign-up (US1, US2)**: `cd mobile && flutter run --dart-define=API_URL=http://10.0.2.2:3000`.
   Pick a country, enter a number, enter the code, set a name and photo → home screen. Kill and
   reopen the app → still signed in.
2. **Wrong code (US1-3)**: request a code, enter a wrong one 5 times → "Too many attempts".
3. **Web sign-in (US3)**: `cd web && npm run dev` → http://localhost:3001. Sign in with the same
   number → home screen; the phone is still signed in.
4. **Unknown number on web (US3-2)**: use a new number → after the correct code, the page says to
   create the account on Android first.
5. **Device management (US4)**: on the phone open Settings → Linked devices, sign out the browser
   → within 10 s the browser returns to the sign-in page.
6. **Profile sync (FR-012)**: change the display name on web → the phone's Settings shows the new
   name within 10 s.
7. **Contacts (US5)**: create a second account (second emulator, or web is not enough since web
   cannot create accounts). Add its number to the first emulator's address book, open New chat →
   the second account is listed with its name and photo. Look up an unregistered number → "not on
   the app".
8. **Android replacement (US1-2)**: verify the same number on a second emulator → the first one is
   returned to the sign-in screen and its local data is cleared.

## 4. Privacy checks

- `docker compose exec postgres psql -U chat -c "select count(*) from contacts;"` only counts
  matched contacts after discovery with unregistered numbers.
- API logs contain no access/refresh tokens and no OTP codes when `NODE_ENV=production`.
