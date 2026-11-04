# QA Execution Report — Sankatmochan Saarthi exam platform

Run date: 2026-11-02. Method: black-box HTTP calls against a freshly migrated local API (fake AI provider, fake payment provider, in-memory storage), logging in as each role. **No application code was modified.** Script: `qa.mjs` (scratchpad). Browser UI was **not** re-exercised in this run (see Not Tested).

## Summary
| Metric | Result |
|---|---|
| Cases executed | 110 |
| PASS | 88 |
| FAIL | 12 |
| BLOCKED | 3 |
| NOT IMPLEMENTED | 7 |
| Spec cases not run at all (NOT TESTED) | the remaining ~600 of the ~750 IDs in the brief — see "Not tested" |
| P0 | 0 |
| P1 | 0 |
| P2 | 4 |
| P3 | 6 |

Accounts used: Administrator (Super Admin), admin_cbse (delegated Admin), two fresh organisations A and B each with owner, 1 teacher, 2 students. Cross-tenant checks ran A→B in both directions for questions, papers, exams, results, reports, notifications, sheet files.

## Bugs
| ID | Sev | Role | Module | Finding | Evidence / test |
|---|---|---|---|---|---|
| BUG-001 | P2 | Anonymous | Auth | **No rate limiting on /auth/login** (only org-register and callback-requests are limited). 25 consecutive wrong passwords all return 401. Brute force is unthrottled. Fix: add rateLimit per IP+username on login and change-password. | SEC-037 |
| BUG-002 | P2 | Org Admin | Users | **Removing a member only soft-deletes the organisation_members row; the user account stays active** and can still log in (HTTP 200) as a Teacher/Student with no organisation. Expected: block the account or clearly define "removed". Also affects CROSS-021 semantics for org-level revocation. | ORG-TEACH-007b |
| BUG-003 | P2 | Teacher | Question bank | **Teacher class/subject assignments are not enforced.** A teacher assigned only to (class, subject 1) created a question for subject 2 → 201. Known gap from the build, now confirmed. | TEACH-ACA-006 |
| BUG-004 | P2 | Teacher | Question bank | **Duplicate MCQ options accepted** ("same"/"same") → 201. Students cannot distinguish the options. Add case-insensitive uniqueness check in questionSchema. | SA-QB-014 |
| BUG-005 | P3 | Org Admin | Users | Duplicate **email** accepted for different users (no unique index on users.email; only username is unique). No mobile field exists at all, so the mobile-duplicate cases cannot be run. | ADMIN-016 |
| BUG-006 | P3 | Teacher | Exams | Exam can be scheduled with a window entirely in the past (201). | TEACH-EXAM-003 |
| BUG-007 | P3 | Student | Offline | Corrupt PDF with a valid "%PDF" header and garbage body is accepted (magic-byte check only; no parse). Zero-byte, renamed exe/sh, oversize were correctly rejected. Parse with pdf-lib on upload or flag at AI stage. | STU-OFFLINE-013 |
| BUG-008 | P3 | Any staff | API | Body validation runs **before** authorisation/ownership: a cross-tenant PUT or a student POST with an invalid body returns 400 instead of 403/404. No data was read or changed (valid-body variants return 403/404), so this is information-shape only. | SEC-006, CROSS-014, CROSS-014b |
| BUG-009 | P3 | Admin | Dashboard | Delegated Admin without exams/organisations permission gets 403 on /reports/dashboard, so their landing view may error. | STU-DASH-011 |
| BUG-010 | P3 | Super Admin | Audit | Audit log has entries for academic setup and user block/access, but **none for organisations, questions, papers, exams, publish, payments**. | SEC-040 |

## Not implemented (confirmed by probing the API)
- Organisation edit / deactivate / delete by Super Admin (PATCH/DELETE /organisations/:id → 404) — SA-PLATFORM-003/004/007/008.
- Create / edit / disable subscription plans and prices (only GET /subscription-plans) — SA-SUB-001…018.
- Forgot-password / reset-token flow — STU-AUTH-009/010/011.
- Organisation logo upload; question image upload.
- Subscription-expiry notification; email/SMS/WhatsApp channels.

## Blocked
- Real OCR/Gemini evaluation accuracy (AI-001…AI-044): no OCR service yet; only the fake evaluator and the HTTP contract were exercised. The pipeline states (upload → finalize → evaluation_pending → evaluate 202) work.
- Razorpay sandbox order/verify/webhook: fake provider only. Signature-rejection on the webhook and amount tampering were tested.

## Not tested in this run
Browser/UI checks (visibility of menus per role, mobile layout, PDF visual layout, upload progress, timer UI, offline reconnect), concurrency/load (EDGE-029…038), clock-timezone and month-end subscription cases, DB-interruption, hundreds-of-pages PDFs, real notification e-mail, backup/restore, and most of the ~750 individual IDs in the brief that have no API surface here. These are **not** counted as passed. The earlier Playwright scripts did cover the main online and offline student/teacher journeys, but they are not part of this run.

## Positive results worth knowing
Cross-tenant isolation held for questions, papers, exams, attempts, results, reports, notifications, sheet files and member/assignment management in both directions. Student payloads never contained is_correct / expected answers. Timer deadline is server-issued. Submit is idempotent. Max-marks overflow rejected. Unpublished results hidden until a teacher marks descriptive answers and publishes. Deactivated user tokens rejected immediately. Webhook with bad signature rejected. Passwords not in responses; helmet headers present; CORS did not echo an untrusted origin.

## Full case list
| ID | Module | Role | Scenario | Status | Actual |
|---|---|---|---|---|---|
| SA-AUTH-001 | Auth | Super Admin | Valid login | PASS | status 200 |
| SA-AUTH-002 | Auth | Super Admin | Wrong password | PASS | status 401 |
| SA-AUTH-003 | Auth | Any | Unknown user | PASS | 401/401; msgs Invalid username or password \| Invalid username or password |
| SA-AUTH-004 | Auth | Any | Empty username/password | PASS | status 400 |
| SEC-001 | Security | Anonymous | Protected APIs without token | PASS | /organisations/me:401 /question-bank/questions:401 /papers:401 /exams/mine:401 /reports/dashboard:401 /admin/users:401 /notifications:401 /payments/me |
| SEC-003 | Security | Anonymous | Invalid/forged JWT | PASS | 401/401 |
| SEC-015 | Security | Anonymous | SQL injection in login | PASS | status 401 |
| SEC-023 | Security | Anonymous | Malformed JSON body | PASS | status 400 |
| SEC-019 | Security | Anonymous | Unexpected properties on register (role escalation) | PASS | status 201 role=Student |
| SEC-037 | Security | Anonymous | Login rate limiting / brute force | FAIL | status after 25 failed logins: 401 |
| SEC-034 | Security | Anonymous | Login response leaks password hash | PASS | checked response text |
| SEC-038 | Security | Anonymous | CORS from disallowed origin | PASS | ACAO=http://localhost:5173 |
| SEC-005 | RBAC | Teacher | Teacher calls admin/user-management APIs | PASS | 403,403,403,403,403 |
| SEC-006 | RBAC | Student | Student calls teacher/org APIs | FAIL | 403,400,403,400,403 |
| ORG-ISO-001 | RBAC | Org Admin | Org admin cannot hit platform-admin APIs | PASS | 403,403,403 |
| ADMIN-001 | RBAC | Admin | Delegated Admin cannot create Super Admin / manage out-of-scope users | PASS | status 403 |
| ADMIN-002 | RBAC | Admin | Admin may list organisations (organisations.manage?) | PASS | status 403 |
| SA-PLATFORM-001 | Organisations | Super Admin | List orgs shows both QA orgs | PASS | status 200, ids 13 |
| SA-PLATFORM-005 | Organisations | Anonymous | Duplicate owner username on org registration | PASS | status 409 |
| SA-PLATFORM-006 | Organisations | Anonymous | Org registration with missing name / weak password | PASS | 400/400 |
| ORG-001 | Organisations | Org Admin | Owner login + must-change-password flag | PASS | login 200, must_change_password=false |
| ORG-004 | Organisations | Org Admin | Update own profile | PASS | status 200 |
| ORG-008 | Organisations | Org Admin | Empty/invalid profile (name too short, bad email) | PASS | status 400 |
| ORG-005 | Organisations | Org Admin | Upload organisation logo | NOT IMPLEMENTED | No logo upload endpoint exists (PATCH /organisations/me takes text fields only) |
| ORG-TEACH-009 | Users | Org Admin | Duplicate member username | PASS | status 409 |
| ADMIN-016 | Users | Org Admin | Duplicate mobile / email on member | FAIL | first 201, second 201 |
| ORG-TEACH-011 | Users | Org Admin | Org A cannot list/delete Org B members | PASS | leak=false, delete status 404 |
| SEC-007 | Isolation | Org Admin | Org A cross-tenant batch / teacher-assignment on Org B teacher | PASS | status 404 |
| ORG-TEACH-003 | Users | Org Admin | Assign teacher to class+subject | PASS | status 200 |
| TEACH-ACA-006 | RBAC | Teacher | Teacher creates question for UNASSIGNED subject | FAIL | status 201 (taxonomy consistency may also reject) |
| ORG-TEACH-007 | Users | Org Admin | Create duplicate student in same name already (case-insens.) | PASS | status 409 |
| TEACH-QB-001 | QuestionBank | Teacher | Create MCQ single correct | PASS | status 201 |
| TEACH-QB-002 | QuestionBank | Teacher | Create multi-correct MCQ | PASS | status 201 |
| TEACH-QB-002b | QuestionBank | Teacher | Create short with reference answer, keywords, rubric | PASS | status 201 |
| TEACH-QB-003 | QuestionBank | Teacher | Create medium with reference answer, keywords, rubric | PASS | status 201 |
| TEACH-QB-004 | QuestionBank | Teacher | Create long with reference answer, keywords, rubric | PASS | status 201 |
| SA-QB-011 | QuestionBank | Teacher | Question missing subject | PASS | status 400 |
| SA-QB-013 | QuestionBank | Teacher | Zero / negative / huge marks | PASS | statuses for 0,-3,1e9: 400,400,400 |
| SA-QB-014 | QuestionBank | Teacher | Duplicate options in MCQ | FAIL | status 201 |
| SA-QB-015 | QuestionBank | Teacher | MCQ with no correct option | PASS | status 400 |
| SA-QB-016 | QuestionBank | Teacher | MCQ with every option correct | PASS | status 400 (accepted = no guard against all-correct) |
| SA-QB-022 | QuestionBank | Teacher | Duplicate question detection | PASS | status 409 |
| SA-QB-009 | QuestionBank | Teacher | Upload image to a question | NOT IMPLEMENTED | image_key column exists; no upload endpoint or UI |
| SA-QB-021 | QuestionBank | Teacher | Bulk import with malformed rows | PASS | status 200 {"created":1,"duplicates":0,"errors":2,"results":[{"row":1,"status":"created","id":68},{"row":2,"status":"error","messag |
| SEC-016 | Security | Teacher | XSS payload stored in question body is returned inert (JSON) and not executed server-side | PASS | status 201; frontend renders via React text nodes (not verified in browser) |
| SEC-018 | Security | Teacher | Excessively long body (50k chars) | PASS | status 400 |
| CROSS-016 | Isolation | Teacher B | Read / edit / delete Org A's private question | PASS | 404,404,404,404 |
| SA-QB-027 | Isolation | Teacher B | Question search/list doesn't expose Org A questions | PASS | status 200 items 0 |
| TEACH-QB-009 | QuestionBank | Teacher | Edit question creates a version | PASS | update 200, versions 2 |
| SA-QB-028 | QuestionBank | Teacher | Pagination bounds (page_size=100000, page=-1, page=abc) | PASS | 400,400,400 |
| TEACH-PAPER-007 | Papers | Teacher | Auto-select with insufficient questions | PASS | create 201; select 422 |
| TEACH-PAPER-013 | Papers | Teacher | Impossible patterns: count 0, negative, unknown type | PASS | statuses 400,400,400,400 |
| TEACH-PAPER-006 | Papers | Teacher | Auto-select MCQ+short, no duplicates, marks total | PASS | select 200, 6 qs, unique 6, marks 9 |
| CROSS-014 | Isolation | Teacher B | Access Org A paper (get/edit/pdf/publish/delete) | FAIL | 404,400,404,404,404 |
| TEACH-PDF-001 | PDF | Teacher | Publish paper and download PDF + key | PASS | publish 200, pdf 200 1892B ct=application/pdf |
| TEACH-PDF-014 | PDF | Student | Student downloads question paper / answer key | PASS | student GET /papers/:id/pdf -> 403 (offline students use exam endpoint) |
| TEACH-PAPER-022 | Papers | Teacher | Edit a PUBLISHED paper's questions | PASS | status 409 |
| TEACH-EXAM-004 | Exams | Teacher | start > end | PASS | status 400 |
| TEACH-EXAM-005 | Exams | Teacher | zero / negative duration & attempts | PASS | statuses 400,400,400,400 |
| TEACH-EXAM-003 | Exams | Teacher | Schedule exam entirely in the past | FAIL | status 201 (201 = accepts windows already over) |
| CROSS-007 | Exams | Teacher | Schedule live exam using own paper + assign class to org students | PASS | create 201, assign 200 |
| CROSS-014b | Isolation | Teacher B | Access Org A exam (get/assign/review/publish/cancel) | FAIL | 404,404,400,400,404,404 |
| STU-EXAM-025 | Isolation | Student A2 / B1 | Unassigned/cross-org student opens or starts exam | PASS | 403,404,404 |
| STU-EXAM-003 | Exams | Student A1 | Start exam | PASS | status 201 |
| STU-EXAM-026 | Security | Student A1 | Answer key / is_correct / expected_answer leaked in start/attempt payload | PASS | no key fields |
| STU-EXAM-015 | Exams | Student A1 | Autosave then submit; second submit idempotent | PASS | save 200, submit 200, resubmit 200 |
| STU-EXAM-023 | Exams | Student A1 | Start again beyond max attempts (default 1) | PASS | status 409 |
| STU-RESULT-009 | Results | Student A1 | Result before publication | PASS | status 409 |
| TEACH-EVAL-001 | Evaluation | Teacher A | Review list shows submission | PASS | status 200 |
| TEACH-EVAL-008 | Evaluation | Teacher A | Award marks greater than maximum | PASS | status 400 |
| TEACH-EVAL-015 | Results | Student A2 | Student cannot publish / review | PASS | 403,403 |
| TEACH-EVAL-003 | Evaluation | Teacher A | Teacher marks the descriptive answers; MCQs stay auto-graded | PASS | status 200, 1 descriptive marked |
| CROSS-011 | Results | Teacher A | Publish results | PASS | status 200 |
| CROSS-012 | Results | Student A1 | View published result | PASS | status 200 |
| CROSS-013 | Isolation | Student A2 / B1 | Other student reads A1's result and report | PASS | 404,404,404,404 |
| STU-EXAM-002 | Exams | Student | Start exam before its start time | PASS | status 409 |
| STU-EXAM-022 | Exams | Student | Start after exam window closed | PASS | create 201; start 409 |
| STU-EXAM-021 | Exams | Student | Client clock skew cannot extend the timer (server-side deadline) | PASS | deadline_at=2026-11-02T14:43:45.344Z; server_now=2026-11-02T13:43:45.346Z |
| STU-OFFLINE-003 | Offline | Student | Upload valid PDF answer sheet | PASS | status 201 |
| STU-OFFLINE-015 | Security | Student | Renamed executable as .pdf / .png | PASS | 400/400/400 |
| STU-OFFLINE-012 | Offline | Student | Zero-byte file | PASS | status 400 |
| STU-OFFLINE-013 | Offline | Student | Corrupted PDF (valid header, garbage body) | FAIL | status 201 |
| SEC-027 | Security | Student | Double extension / path traversal in filename | PASS | 201/400 (stored under generated key; name only metadata) |
| STU-OFFLINE-016 | Offline | Student | Oversized file (>MAX_UPLOAD_MB) | PASS | status 413 |
| STU-OFFLINE-023 | Isolation | Student A1 / B1 | Upload / read sheets for exam where not assigned | PASS | 404,404 |
| STU-OFFLINE-026 | Offline | Student | Sheet file of student 2 not readable by student 1/teacher B | PASS | sheet 7: 404,404,404 |
| AI-064 | AI | Teacher | Finalize sheets -> AI pipeline (fake provider); AI failure does not zero-mark | PASS | finalize 200, evaluate 202, review 200 |
| AI-PROD | AI | Teacher | Real OCR/Gemini pipeline accuracy (AI-001…AI-044) | BLOCKED | Real OCR service not available; only fake evaluator & HTTP-contract mocks exercised |
| PAY-016 | Payments | Student | Client-supplied amount in checkout is ignored/rejected | PASS | status 400 |
| PAY-015 | Payments | Anonymous | Webhook with invalid signature | PASS | status 401 |
| PAY-018 | Payments | Student B1 | Read another user's payment record | BLOCKED | no payment to probe (checkout for free exam creates none) |
| PAY-GW | Payments | Student | Live Razorpay sandbox order/verify/webhook | BLOCKED | Fake payment provider only; no Razorpay sandbox keys in this environment |
| SUB-016 | Subscriptions | Student | Plans list visible; disabled plan not listed | PASS | status 200, 3 plans |
| SA-SUB-001 | Subscriptions | Super Admin | Create/edit plans (monthly/quarterly/yearly, negative price) | NOT IMPLEMENTED | Only GET /subscription-plans exists in the API; no endpoint to create/edit/disable plans or change price (seed-only configuration) |
| NOTIF-017 | Notifications | Student A2 | Cannot see/mark other users' notifications | PASS | A1 has 3; leak=false; foreign mark-read 200 |
| NOTIF-001 | Notifications | Student A1 | Assignment & result-publication notifications created | PASS | 3 notifications: exam_assigned,result_published,exam_assigned |
| NOTIF-009 | Notifications | Teacher A | Teacher notified of submissions | PASS | 2 notifications |
| NOTIF-007 | Notifications | Student | Subscription-expiry notification | NOT IMPLEMENTED | No expiry-reminder job/notification type in notifications or scheduler |
| NOTIF-015 | Notifications | Any | Email/SMS/WhatsApp channels | NOT IMPLEMENTED | In-app only |
| ADMIN-028 | Reports | Super Admin | Overview totals vs database | PASS | status 200 {"range":{"format":"json"},"totals":{"students":53,"teachers":19,"organisations":13,"exams":21,"completed_tests":2,"purchases":0,"revenue_m |
| TEACH-REPORT-011 | Reports | Teacher B | Org B teacher views Org A exam report | PASS | status 404 |
| STU-DASH-011 | Dashboard | Student A1 | Dashboard loads for every role (from DB) | FAIL | sa:200 admin:403 orgA:200 teacher:200 student:200 |
| ADMIN-027 | Reports | Super Admin | CSV export + CSV injection check | PASS | status 200, ct=text/csv; charset=utf-8, formula-cells=false |
| CROSS-021 | RBAC | Teacher A | Deactivated user's existing token is rejected | PASS | block 200; old token 401; relogin 401 |
| ORG-TEACH-007b | Users | Org Admin | Org admin can deactivate/remove own member (DELETE /members/:id) | FAIL | delete 200; login after removal 200 (200 means removed member still has an active account) |
| SA-PLATFORM-007 | Organisations | Super Admin | Deactivate / delete / edit organisation via API | NOT IMPLEMENTED | PATCH 404, DELETE 404 — no admin edit/deactivate/delete route for organisations |
| SA-AUTH-010 | Auth | Any | Change password; old password stops working | PASS | change 200, old 401, new 200 |
| SA-AUTH-008 | Auth | Any | Forgot-password / reset token flow | NOT IMPLEMENTED | status 404 — no forgot/reset-password endpoint |
| SEC-040 | Security | Super Admin | Audit log records admin actions on exams/organisations/questions | FAIL | audit actions: subjects.create	10; chapters.create	6; boards.create	5; user.block	5; classes.create	5; admin.access-set	2;  |
| SEC-042 | Security | Anonymous | Security headers (helmet) and stack-trace leakage on 500s | PASS | nosniff=nosniff powered-by=null |
