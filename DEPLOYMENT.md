# Deployment notes — Hostinger VPS (Ubuntu)

Target layout: **one VPS** running Nginx (HTTPS, serves the React build, proxies `/api` to Node), the Node API (systemd),
and MariaDB. Files live in a private **S3 bucket** (recommended) or on the VPS disk.

```
Internet ──► Nginx :443 ──► /            React build (static files)
                     └───► /api/*        Node API on 127.0.0.1:4000 ──► MariaDB (localhost)
                                                                   └──► S3 (private bucket)
```

> These steps use standard Ubuntu tooling. They have not been executed on a Hostinger server, so do a first run on a
> staging subdomain (or with Razorpay *test* keys) before pointing the real domain at it.

---

## 0. Before you start

| You need | Notes |
|---|---|
| Hostinger VPS | KVM 1 (1 vCPU / 4 GB) is enough to start. Choose the **Ubuntu 22.04 or 24.04** template. |
| Domain | e.g. `sankatmochansaarthi.in`. |
| Razorpay account | Live keys + webhook secret (use test keys first). |
| AWS account | A **private** S3 bucket + an IAM user (see §6). Optional if you accept storing PDFs on the VPS disk. |
| Google / Microsoft OAuth apps | Optional; see README "Social sign-in". |

**DNS (hPanel → Domains → DNS Zone):** add `A` records for `@` and `www` pointing to the VPS IP. Wait for it to resolve
(`dig +short yourdomain.in`) before requesting the TLS certificate.

---

## 1. Server hardening (first login)

```bash
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo deploy            # work as a normal user from now on
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy   # reuse your SSH key
# Firewall: SSH + web only. Port 4000 (API) and 3306 (DB) must NOT be open.
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable
apt install -y fail2ban unattended-upgrades
```
Then disable root/password SSH login (`PermitRootLogin no`, `PasswordAuthentication no` in `/etc/ssh/sshd_config`,
`systemctl restart ssh`). In hPanel's VPS firewall, also allow only 22, 80, 443.

## 2. Install runtime software

```bash
sudo apt install -y nginx mariadb-server git curl build-essential
# Word (.doc/.docx) -> PDF in the "Add notes" flow. Optional but strongly recommended: without it only a basic text-only conversion exists.
sudo apt install -y libreoffice-writer
# Node 20 LTS (Node 18 is end-of-life). The app was developed/tested on Node 18; it uses nothing Node-20-incompatible,
# but run `npm test` (needs a test DB) once on the server's Node version if you want certainty.
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo systemctl enable --now nginx mariadb
sudo mysql_secure_installation          # set root password, remove anonymous users/test DB
```

## 3. Database

```sql
-- sudo mysql
CREATE DATABASE education_site CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'saarthi'@'localhost' IDENTIFIED BY 'A-LONG-RANDOM-PASSWORD';
GRANT ALL PRIVILEGES ON education_site.* TO 'saarthi'@'localhost';
FLUSH PRIVILEGES;
```
MariaDB listens on localhost only by default — keep it that way.

## 4. Get the code and configure

```bash
sudo mkdir -p /var/www/saarthi && sudo chown deploy:deploy /var/www/saarthi
cd /var/www/saarthi && git clone <YOUR_REPO_URL> .          # or rsync the project folder up
cd backend && npm ci                                          # includes tsx, which runs the server
cp .env.example .env && chmod 600 .env && nano .env
```

**`backend/.env` for production** (every value must be real — nothing here may be a placeholder):

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
CORS_ORIGIN=https://yourdomain.in
FRONTEND_URL=https://yourdomain.in
OAUTH_REDIRECT_BASE=https://yourdomain.in

JWT_SECRET=<output of: openssl rand -hex 48>

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=saarthi
DB_PASSWORD=<the DB password from §3>
DB_NAME=education_site

# Default accounts (Administrator / student1 / teacher1) are created by `npm run migrate` — see §4.
# Only needed if you set SEED_DEFAULT_ACCOUNTS=false and want a different Administrator password:
# ADMIN_BOOTSTRAP_PASSWORD=<strong one-time password>
# SEED_DEFAULT_ACCOUNTS=false

STORAGE_DRIVER=s3
AWS_REGION=ap-south-1
S3_BUCKET=<your-private-bucket>
AWS_ACCESS_KEY_ID=<iam user key>
AWS_SECRET_ACCESS_KEY=<iam user secret>
MAX_UPLOAD_MB=25
MAX_UPLOAD_FILES=10                 # files per "Add notes" batch
DRAFT_RETENTION_DAYS=14
DOCX_CONVERTER=auto                # LibreOffice if installed (recommended: see §2), else basic text conversion
ADMIN_JWT_EXPIRES_IN=7d            # Super Admin / Admin session length

PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=<key id>
RAZORPAY_KEY_SECRET=<key secret>
PAYMENT_WEBHOOK_SECRET=<secret you also enter in the Razorpay dashboard>

# optional social sign-in
GOOGLE_CLIENT_ID=  GOOGLE_CLIENT_SECRET=  MICROSOFT_CLIENT_ID=  MICROSOFT_CLIENT_SECRET=
```

Things that behave differently with `NODE_ENV=production`: `JWT_SECRET` becomes mandatory, session cookies are `Secure`
(HTTPS required), and the fake-payment "simulate" endpoint is disabled — so **`PAYMENT_PROVIDER` must be `razorpay`**.

**No S3?** Use `STORAGE_DRIVER=local` and `LOCAL_STORAGE_DIR=/var/lib/saarthi/files` (create it, owned by the service user) —
but then the PDFs live on the VPS disk and **must be part of your backups** (§9).

Create the tables and base data:

```bash
cd /var/www/saarthi/backend
npm run migrate        # creates/updates all tables AND seeds base data + the default accounts
```
`npm run migrate` is safe to re-run. After the tables it seeds: roles, subscription plans, config, classes 9–12, material
types, and these accounts (only if missing — an existing account's password is never overwritten):

| Role | Username | Password |
|---|---|---|
| Administrator | `Administrator` | `Admin@18212004` |
| Student | `student1` | `Student@12345` |
| Teacher | `teacher1` | `Teacher@12345` |
| Admin (CBSE notes only) | `admin_cbse` | `AdminCbse@12345` |
| Admin (ICSE notes only) | `admin_icse` | `AdminIcse@12345` |

> **These passwords are in the source code.** Anyone who can read the repository can log in as the Administrator.
> Keep the repo private, and **change the Administrator password right after the first login** (user menu → Change
> password). Consider disabling or deleting `student1` / `teacher1` once you've tested (Admin → Users). Set
> `SEED_DEFAULT_ACCOUNTS=false` in `.env` to skip creating them.
>
> Do not run `npm run seed -- --demo` or `--samples` on production — they add demo academic data and sample notes.

## 5. Build the frontend

```bash
cd /var/www/saarthi/frontend
npm ci && npm run build            # output: frontend/dist
sudo mkdir -p /var/www/saarthi-site && sudo rsync -a --delete dist/ /var/www/saarthi-site/
```
(The dev-server proxy in `vite.config.ts` is not used in production — Nginx does the proxying.)

## 6. S3 bucket (recommended)

1. Create the bucket, **Block all public access = ON**, default encryption on.
2. Create an IAM user with *only* this policy (replace the bucket name), and put its keys in `.env`:
```json
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["s3:PutObject","s3:GetObject","s3:DeleteObject"], "Resource": "arn:aws:s3:::YOUR-BUCKET/*" },
  { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::YOUR-BUCKET" } ] }
```
3. Enable bucket **versioning** (protects against accidental deletes). PDFs are only ever streamed through the API after a
   permission check; the bucket is never public.

## 7. Run the API as a service (systemd)

`/etc/systemd/system/saarthi-api.service`:
```ini
[Unit]
Description=Sankatmochan Saarthi API
After=network.target mariadb.service

[Service]
User=deploy
WorkingDirectory=/var/www/saarthi/backend
EnvironmentFile=/var/www/saarthi/backend/.env
ExecStart=/var/www/saarthi/backend/node_modules/.bin/tsx src/server.ts
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now saarthi-api
sudo journalctl -u saarthi-api -f          # logs
curl -s http://127.0.0.1:4000/health        # {"status":"ok"}
```
**Run exactly ONE instance** (do not use PM2 cluster mode). The daily log-retention job, payment reconciliation and the
spam rate-limiter all live inside the process.


## 8. Nginx + HTTPS

`/etc/nginx/sites-available/saarthi`:
```nginx
server {
    listen 80;
    server_name yourdomain.in www.yourdomain.in;
    root /var/www/saarthi-site;
    index index.html;

    client_max_body_size 300m;                # >= MAX_UPLOAD_MB x MAX_UPLOAD_FILES (a whole "Add notes" batch in one request)

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_request_buffering on;           # leave the body untouched — payment webhook signatures depend on the raw bytes
    }
    location /health { proxy_pass http://127.0.0.1:4000; }

    location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
    location / { try_files $uri /index.html; }   # React router (SPA) fallback
}
```
```bash
sudo ln -s /etc/nginx/sites-available/saarthi /etc/nginx/sites-enabled/ && sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.in -d www.yourdomain.in     # adds HTTPS + auto-renew; choose "redirect HTTP to HTTPS"
```
The app sets `trust proxy`, so client IPs in the API logs and rate limiter come from `X-Forwarded-For` correctly.

## 9. Backups & maintenance

```bash
# /etc/cron.d/saarthi-backup  — nightly DB dump, keep 14 days
0 2 * * * deploy mysqldump --single-transaction -u saarthi -p'DB_PASSWORD' education_site | gzip > /var/backups/saarthi/db-$(date +\%F).sql.gz && find /var/backups/saarthi -mtime +14 -delete
```
- Copy `/var/backups/saarthi` off the server (S3/another machine) — a backup on the same disk is not a backup.
- Also enable Hostinger's weekly VPS snapshots/backups in hPanel.
- If you use `STORAGE_DRIVER=local`, back up `LOCAL_STORAGE_DIR` too.
- API hit logs purge themselves daily (default 90 days; change in Admin → Settings).

**Deploying an update** (always run `npm run migrate` — new features add tables/columns, and without it you get errors like
`Table 'upload_drafts' doesn't exist`; the API now also logs `DATABASE IS OUT OF DATE` at startup when migrations are pending):
```bash
cd /var/www/saarthi && git pull
cd backend && npm ci && npm run migrate && sudo systemctl restart saarthi-api
cd ../frontend && npm ci && npm run build && sudo rsync -a --delete dist/ /var/www/saarthi-site/
```

## 10. Third-party configuration

- **Razorpay → Settings → Webhooks:** URL `https://yourdomain.in/api/v1/payments/webhook`, secret = `PAYMENT_WEBHOOK_SECRET`,
  events `payment.captured` and `payment.failed`. Test with Razorpay *test* keys first.
- **Google / Microsoft:** redirect URIs `https://yourdomain.in/api/v1/auth/oauth/google/callback` and
  `https://yourdomain.in/api/v1/auth/oauth/microsoft/callback`; `OAUTH_REDIRECT_BASE` must be exactly `https://yourdomain.in`.

## 11. Go-live checklist

- [ ] `curl https://yourdomain.in/health` returns `{"status":"ok"}`; site loads over HTTPS.
- [ ] Create your Admin accounts (Users → Add user → Admin) and tick only the features/boards they need.
- [ ] Log in as `Administrator` and **change the password** (the default is in the source code). Remove or change `student1` / `teacher1` in Admin → Users.
- [ ] Admin → Settings: enter real **contact details** (the page ships with placeholder phone/email/address).
- [ ] Admin → Academic Setup: boards, classes (set which are "coming soon"), subjects, chapters, topics, material types.
- [ ] Upload one PDF, publish it, preview it as a student (3 pages only), "download" it into My Downloads.
- [ ] Make a Razorpay **test** payment end-to-end (note purchase + subscription); confirm the webhook shows as delivered.
- [ ] Switch to Razorpay **live** keys, restart the API, repeat with a small real payment.
- [ ] Admin → API Logs shows requests; ports 4000 and 3306 are not reachable from outside (`nmap`/online port check).
- [ ] A backup has run and a restore has been tried at least once.

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `systemctl status saarthi-api`; `journalctl -u saarthi-api -n 100` (usually a bad `.env` value or DB credentials). |
| Login returns 500 | DB unreachable or migrations not run: `npm run migrate`. |
| Upload fails with 413 | Raise `client_max_body_size` (Nginx) to at least `MAX_UPLOAD_MB` × `MAX_UPLOAD_FILES`. |
| Word files convert with "Basic conversion" | LibreOffice is not installed: `sudo apt install libreoffice-writer`, then restart the API. |
| Payments never complete | Webhook URL/secret mismatch; `PAYMENT_PROVIDER` still `fake`; check Razorpay webhook delivery log. |
| Google/Microsoft "redirect_uri_mismatch" | Redirect URI in the provider console must match `OAUTH_REDIRECT_BASE` exactly (https, no trailing slash). |
| Lost Administrator password | Set `ADMIN_BOOTSTRAP_PASSWORD` in `.env`, then `cd backend && npm run admin:reset -- --keep-password`. |
