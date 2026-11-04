# Education Notes — Phase 1

Study-material (PDF notes) platform: Node.js + Express + MySQL backend, React + Tailwind frontend.
Implements `Phase_1_Technical_Implementation_Guide_v2_S3_Taxonomy_Query_Params.md`.

## Quick start

```bash
# 1. Backend
cd backend
cp .env.example .env            # then edit DB_*, JWT_SECRET, ADMIN_BOOTSTRAP_PASSWORD
npm install
npm run migrate                 # creates tables + seeds base data and the default accounts (needs the DB in DB_NAME to exist)
npm run seed -- --demo          # optional: demo academic data (add --samples for 50 sample notes) — development only
npm run dev                     # http://localhost:4000

# 2. Frontend
cd frontend && npm install && npm run dev    # http://localhost:5173 (proxies /api to :4000)
```

* **Default accounts** (created by `npm run migrate` if missing, never overwritten): `Administrator` / `Admin@18212004`, `student1` / `Student@12345`, `teacher1` / `Teacher@12345`; demo school `org1` / `Org@12345` (with `org_teacher1` / `OrgTeacher@12345` and `org_student1` / `OrgStudent@12345`).
  `npm run seed -- --demo` also gives the demo school a question bank, a published paper and a free exam.
  These are in source control — keep the repo private and change the Administrator password on a live site. `SEED_DEFAULT_ACCOUNTS=false` skips them.
* Local dev uses `STORAGE_DRIVER=local` (files under `backend/storage-data`) and `PAYMENT_PROVIDER=fake`
  (a "Simulate payment" button appears in checkout). Production: `STORAGE_DRIVER=s3` + a **private** bucket,
  `PAYMENT_PROVIDER=razorpay`.

## Examination platform

Organisations (schools/institutes) manage teachers and students; teachers build a **question bank** (MCQ, short, medium, long; duplicates blocked; versioned),
generate **question papers** (automatic by pattern or manual, several sets, PDF + answer key), **schedule exams** (online with server-side timer and autosave, or
offline with handwritten answer-sheet upload), and review **AI-suggested marks** before publishing results. Students see dashboards, tests, results and progress;
paid tests use the payment flow. API tests: `backend/tests/{organisations,question-bank,papers,exams,academic}`. AI service contract: `DEPLOYMENT.md` §11b.

## Social sign-in (Google / Microsoft)

Standard OAuth 2.0 "authorization code" flow, handled entirely by the backend (the client secret never reaches the browser):

1. The user clicks **Google** or **Microsoft** → the browser goes to `/api/v1/auth/oauth/<provider>/start`.
2. The backend redirects to the provider with a signed, 10-minute `state` and sets an httpOnly nonce cookie (CSRF protection).
3. The user signs in at the provider, which redirects back to `/api/v1/auth/oauth/<provider>/callback?code=…&state=…`.
4. The backend verifies `state` + cookie, exchanges the `code` for the user's profile (server-to-server), then:
   - **known Google/Microsoft account** → signs that user in;
   - **Google only, with a Google-verified email matching an existing account** → links it and signs in;
   - **otherwise** → creates a new Student (or Teacher, if chosen on the sign-up page) with an unusable random password.
   Identities are stored in `user_identities`; users in `users`. Blocked users are refused; Administrator accounts can never be linked or signed in this way.
5. The backend redirects to `/oauth/callback#token=<jwt>`; the frontend stores the token and opens the user's home page.

**Setup** (put the values in `backend/.env`; leave blank to disable a provider):

| | Google | Microsoft |
|---|---|---|
| Where | Google Cloud Console → APIs & Services → Credentials → *OAuth client ID* (Web application) | Azure Portal → Microsoft Entra ID → App registrations → *New registration* → Certificates & secrets → *New client secret* |
| Redirect URI | `http://localhost:5173/api/v1/auth/oauth/google/callback` | `http://localhost:5173/api/v1/auth/oauth/microsoft/callback` (platform: *Web*) |
| Env vars | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (+ `MICROSOFT_TENANT`, default `common` = any Microsoft account) |

In production set `OAUTH_REDIRECT_BASE` / `FRONTEND_URL` to your public site URL and register those redirect URIs instead. Buttons for providers without credentials are shown greyed out.

## Administrator password

`npm run admin:reset` (in `backend/`) resets the `Administrator` password to `ADMIN_BOOTSTRAP_PASSWORD` from `.env`
(add `-- --keep-password` to skip the forced change at next login). Use it if the password is lost.

## Super Admin, Admins and what they can do

- The **Administrator** account is the **Super Admin**: every feature, no restrictions, the only one who can create Admin accounts
  and read the API hit logs.
- Super Admin creates **Admin** accounts in *Users → Add user → Admin*, ticking a checkbox for each feature
  (view/upload/edit/publish/delete notes, academic setup, learner accounts, callback requests, contact details, settings).
  **Users → Access** changes those boxes later; changes apply on the Admin's very next request.
- An Admin can also be limited to **boards, classes and subjects** (e.g. "CBSE only", "Class 12 only", "ICSE + Class 10").
  Nothing ticked in a group = no restriction in that group; ticked groups combine (board AND class AND subject).
  Scope applies to notes: the Admin's list, preview, upload, edit, publish and delete.
- Super Admin and Admin sessions last **7 days** (`ADMIN_JWT_EXPIRES_IN`); learners keep `JWT_EXPIRES_IN`.
- Not grantable: managing Admin accounts and the API hit logs.

## Adding notes (PDF, JPG, PNG, DOC, DOCX)

*Manage Notes → Add notes*: choose up to 10 files and the shared details; each file is converted to PDF on the server, you
**preview every converted PDF**, then **Accept** (saves the note) or **Discard**. Converted-but-unreviewed files are stored as
drafts per user (kept `DRAFT_RETENTION_DAYS`), and the form is remembered in the browser, so going back or reloading loses nothing.
Word files use LibreOffice when it is installed (`sudo apt install libreoffice-writer`); without it a basic text-only conversion
is used (formatting, pictures and non-Latin scripts such as Hindi are not kept) and the review step says so. Old `.doc` files need LibreOffice.

## Tests

```bash
cd backend
TEST_DB_HOST=127.0.0.1 TEST_DB_PORT=3306 TEST_DB_USER=root TEST_DB_PASSWORD=... npm test
```
Tests need a real MySQL/MariaDB and **drop/recreate** the database `TEST_DB_NAME` (default `edu_test`) — use a disposable server.
Tests are grouped per feature in `backend/tests/{study-materials,academic,payments,subscriptions,api-hit-logs,common}`.

## Layout

```
backend/src
  config/            env, global config defaults, roles
  common/            auth, errors, validation (query params), logging (API hit log), idempotency, audit
  modules/           auth, academic (taxonomy), study-materials, payments (+ provider wrapper), subscriptions,
                     entitlements (access policy), api-hit-logs, settings
  infrastructure/    database (pool, transaction, migrations), storage (S3/local/memory), scheduler (cron jobs)
  seeds/             one idempotent seed per concern
backend/migrations/  SQL migrations
frontend/src
  shared/            components (AppButton, AppTable, …), http-client, auth guard, utils
  features/          study-materials, academic, payments, subscriptions, administrator
```

## How the requirements map to the code

| Requirement | Where |
|---|---|
| Atomic APIs | `infrastructure/database/transaction.ts` — every multi-row write runs in `withTransaction`; storage/provider side effects use compensation + post-commit hooks |
| API hit log | `common/logging/*` (single `recordApiHit`), table `api_hit_logs`, admin UI `features/administrator` |
| Administrator-only logs | `modules/api-hit-logs/api-hit-logs.routes.ts` (`requireAdministrator`); Administrator passes every `requireRole` |
| Retention (3 months default, runtime-configurable, daily cron) | `config/global-config.ts` (default 90 days), `modules/settings`, `infrastructure/scheduler/api-log-retention.job.ts` |
| Idempotency | `Idempotency-Key` on checkout (unique per user), webhook event ids, unique provider/payment ids, one entitlement per payment |
| Payment wrapper | `modules/payments/payment-provider.interface.ts` + `providers/*` + `payment-provider.factory.ts`; contract test in `tests/payments/provider-wrapper.test.ts` |
| Soft deletes | `deleted_at` everywhere except `api_hit_logs` (retention job) |
| Query-parameter lists | `common/validation/query.ts`; every list endpoint validates/allow-lists/caps |
| Common UI | `frontend/src/shared/components` |
| Separate seeds | `backend/src/seeds` |

## Decisions made where the guide left options open (section 18)

* Subscriptions are **fixed-duration passes paid once** (30/90/365 days), not auto-renewing; a new purchase stacks after the current one. Cancelling stops access immediately (no refund logic).
* Authentication is required to browse/preview (no anonymous access).
* Taxonomy list endpoints are readable by any logged-in user (active values only) so learners can filter; create/update/delete are Administrator-only.
* Retention is stored in **days** (default 90).
* PDFs are streamed through the backend after policy checks (no presigned URLs).
* The backend runs TypeScript through `tsx` (`npm start`); `npm run typecheck` runs `tsc`.
