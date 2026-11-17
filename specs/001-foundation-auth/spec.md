# Feature Specification: Foundation, Phone Sign-In, Devices, Profile & Contacts

**Feature Branch**: `001-foundation-auth`

**Created**: 2026-11-17

**Status**: Draft

**Input**: User description: "WhatsApp-style messenger with an Android app and a web app. First feature:
the project foundation (separate backend, web and mobile repositories), phone-number sign-in with a
one-time code, device registration, user profile, and contact discovery."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register and sign in with a phone number on Android (Priority: P1)

A new user installs the Android app, enters their phone number, receives a 6-digit one-time code,
enters it, and lands in the app as a signed-in user. A returning user who reinstalls or moves to a
new phone does the same and gets back into the same account.

**Why this priority**: Nothing else in the product works without an account and a signed-in device.

**Independent Test**: On a fresh install, enter a phone number, read the code (in development it is
shown in the backend log), enter it, and confirm the app shows the signed-in home screen. Restart
the app and confirm the user is still signed in.

**Acceptance Scenarios**:

1. **Given** a phone number never seen before, **When** the user enters it and then the correct
   code, **Then** an account is created, the device is registered, and the profile setup screen
   opens.
2. **Given** an existing account, **When** the user verifies the number on a new Android phone,
   **Then** they are signed in to the same account and the previous Android phone is signed out.
3. **Given** a code was requested, **When** the user enters a wrong code 5 times, **Then** the code
   is invalidated and the user must request a new one.
4. **Given** a code was requested more than 5 minutes ago, **When** the user enters it, **Then** it
   is rejected as expired.
5. **Given** the user is signed in, **When** they reopen the app days later, **Then** they remain
   signed in without entering a code.

---

### User Story 2 - Set up and edit a profile (Priority: P1)

After first sign-in the user sets a display name (required) and optionally a profile photo and an
"about" line. They can change these later in Settings, on either client.

**Why this priority**: Other people need a name and photo to recognise who they are chatting with.

**Independent Test**: Complete profile setup, then change the name and photo from Settings; confirm
the change appears on the other client the user is signed in on.

**Acceptance Scenarios**:

1. **Given** a newly created account, **When** the user saves a display name of 1–25 characters,
   **Then** the profile is stored and the home screen opens.
2. **Given** profile setup, **When** the user tries to continue with an empty name, **Then** they
   are blocked with an explanation.
3. **Given** a signed-in user, **When** they upload a photo (JPEG/PNG/WebP up to 5 MB), **Then** it
   is cropped to a square and shown as their avatar.

---

### User Story 3 - Sign in on the web app (Priority: P2)

A user who already has an account opens the web app in a browser, enters their phone number and
the one-time code, and is signed in as an additional device alongside their phone.

**Why this priority**: The web client is a core platform, but it depends on an account existing.

**Independent Test**: With an account created on Android, sign in on the web app with the same
number and confirm both the phone and the browser are signed in at the same time.

**Acceptance Scenarios**:

1. **Given** an existing account, **When** the user verifies their number in the web app, **Then**
   the browser becomes a signed-in web device and the phone stays signed in.
2. **Given** a phone number with no account, **When** the user tries to sign in on the web,
   **Then** they are told to create the account on the Android app first.
3. **Given** the account already has 4 web devices, **When** a 5th browser signs in, **Then** the
   least recently active web device is signed out.

---

### User Story 4 - Manage signed-in devices (Priority: P2)

The user sees a list of their signed-in devices (type, name such as "Chrome on Windows", last
active time) and can sign out any device, including the current one.

**Why this priority**: Users must be able to remove a lost or shared device.

**Independent Test**: Sign in on a phone and two browsers, sign one browser out from the phone,
and confirm that browser is returned to the sign-in screen within seconds.

**Acceptance Scenarios**:

1. **Given** several signed-in devices, **When** the user opens Linked devices, **Then** each
   device is listed with type, name, and last active time.
2. **Given** a remote device is signed out, **When** that device is online, **Then** it is returned
   to the sign-in screen within 10 seconds; if offline, on its next request.

---

### User Story 5 - Find contacts who use the app (Priority: P3)

On Android the user grants contacts permission and sees which of their phone contacts have an
account. On either client the user can also start from a phone number typed in manually.

**Why this priority**: Needed to start chats (feature 002), but sign-in and profile come first.

**Independent Test**: With two accounts, put account B's number in account A's phone address book,
refresh contacts on A, and confirm B appears with B's name and photo.

**Acceptance Scenarios**:

1. **Given** contacts permission is granted, **When** the contact list refreshes, **Then** contacts
   who have accounts are shown with their profile name, photo and about line.
2. **Given** contacts permission is denied, **When** the user opens New chat, **Then** they can
   still enter a phone number to look up one account.
3. **Given** a looked-up number has no account, **When** the lookup finishes, **Then** the user is
   told the number is not on the app.

---

### Edge Cases

- Phone numbers typed in local format are normalised to international format using the country
  the user picked; invalid numbers are rejected before a code is sent.
- Code requests are rate limited: at most one per 60 seconds and 5 per hour per phone number, and
  a per-network-address limit to stop number enumeration.
- Sign-in fails on a device whose clock is far off; errors must say so rather than "invalid code".
- If a user is signed in on Android and the account is moved to another phone, all of the old
  phone's local data is cleared on its next connection.
- Contact discovery must not reveal anything about numbers that are not registered.
- A user with no network sees a clear offline state and retries automatically when back online.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in**
- **FR-001**: Users MUST be able to request a 6-digit one-time code for a phone number in
  international format.
- **FR-002**: Codes MUST expire after 5 minutes, allow at most 5 wrong attempts, and be single use.
- **FR-003**: In development, the code MUST be written to the backend log; delivery MUST go through
  a replaceable SMS delivery component so a real provider can be added without client changes.
- **FR-004**: Verifying a code on Android MUST create the account if it does not exist; verifying
  on web MUST NOT create an account.
- **FR-005**: Each account MUST have at most one Android device and at most 4 web devices.
- **FR-006**: A signed-in device MUST stay signed in until signed out, replaced, or inactive for
  30 days, with short-lived access that refreshes silently.
- **FR-007**: The system MUST rate limit code requests per phone number and per network address.

**Devices**
- **FR-008**: Each device MUST be registered with a type (android/web), a readable name, and a
  last-active time.
- **FR-009**: Users MUST be able to list devices and sign out any of them; signed-out devices MUST
  lose access immediately.
- **FR-010**: Each device MUST have a stable device identifier that later features use to address
  encrypted messages to that device.

**Profile**
- **FR-011**: Users MUST set a display name (1–25 characters) before using the app and MAY set an
  about line (up to 140 characters) and a profile photo (JPEG/PNG/WebP, up to 5 MB).
- **FR-012**: Profile changes MUST appear on the user's other devices and to their contacts within
  10 seconds while online.

**Contacts**
- **FR-013**: The Android app MUST let users discover which address-book contacts have accounts,
  re-checking when the app opens and at most once per hour.
- **FR-014**: Both clients MUST let users look up a single phone number.
- **FR-015**: The server MUST NOT keep uploaded address-book numbers that do not match an account.

**Foundation**
- **FR-016**: The backend, web client and mobile client MUST each live in their own repository
  with its own README, environment example and test command.
- **FR-017**: The backend and its services MUST start locally with a single command.

### Key Entities

- **User / Account**: one per phone number; has phone number, display name, about, photo,
  created time.
- **Device**: belongs to one user; type (android/web), name, last active time, signed-in status.
- **One-time code**: phone number, hashed code, expiry, attempt count, used flag.
- **Session**: belongs to one device; refreshable access, revocable.
- **Contact link**: a user's record that another account is in their contacts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can go from opening the app to the home screen in under 90 seconds.
- **SC-002**: 95% of sign-in requests (code request and verify) complete in under 1 second on the
  server, excluding SMS delivery time.
- **SC-003**: Signing out a remote device takes effect on that device within 10 seconds if online.
- **SC-004**: Contact discovery for an address book of 1,000 numbers completes in under 3 seconds.
- **SC-005**: A developer with Docker, Node and Flutter installed can start the backend and either
  client by following each repo's README in under 15 minutes.

## Assumptions

- Profile name, photo and about line are public profile data, not message content, so they are
  stored on the server unencrypted (as other messengers do). Message content is covered by the
  E2EE rules in feature 002.
- Web devices sign in with the phone number and code rather than by scanning a QR code from the
  phone; QR linking can be added later.
- Android is the only mobile target for now; iOS is out of scope.
- A real SMS provider is out of scope for this feature; only the development log delivery is built.
- Privacy settings (who sees last seen, photo, about) are handled in feature 002 with presence.
