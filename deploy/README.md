# Render Free TEST deployment

This image deliberately refuses LIVE Fiskaly mode. Its `/data` directory is
ephemeral on Render Free. Orders, uploaded files, settlements, and fiscal mappings
are lost on restart, redeploy, or idle shutdown. Remote Fiskaly receipts survive.
Do not use this image for actual restaurant operations or restore a production
database into it.

## Push this branch

From the repository root (the repository must be private):

```powershell
git push origin rksv-platform
```

Do not add `.env`, `pb_data`, or backups. The image seeds only what is in
committed migrations. Nothing in this image depends on Hostinger.

## Render settings

- New **Web Service**, GitHub repository `triptitechsupport/tripti-restaurant`.
- Branch `rksv-platform`; runtime **Docker**; instance **Free**.
- Root Directory empty; Dockerfile `./Dockerfile`; context `.`.
- Docker Command empty; no separate build/start command.
- No disk; disable Auto-Deploy initially.
- Health Check Path `/hcgi/api/health`.
- Add all non-optional values from `deploy/render.env.example` as environment
  variables. Use unique passwords of at least 16 characters and a random
  32-character ASCII encryption key. Never use the example as a secret file in Git.
- Keep `FISKALY_ENABLED=false` for the first startup, or supply the matching TEST
  credentials, register and SCU before enabling it. No LIVE credentials.
- The public port defaults to 10000; internal API/PocketBase use 3001/8090.
- No Stripe key is required. Stripe routes respond 503 when unconfigured.

At first boot, PocketBase runs migrations, then bootstrap replaces passwords for
all seeded non-superuser auth accounts. The three usable logins are:

| UI | Login | Password environment variable |
| --- | --- | --- |
| Admin | `DEMO_ADMIN_EMAIL` value | `DEMO_ADMIN_PASSWORD` |
| Waiter | `waiter001` | `DEMO_WAITER_PASSWORD` |
| Kitchen | `kds001` | `DEMO_KDS_PASSWORD` |
| Kitchen manager | `manager001` | `DEMO_KITCHEN_MANAGER_PASSWORD`, else `DEMO_KDS_PASSWORD` |
| Cashier | `cashier001` | `DEMO_CASHIER_PASSWORD`, else `DEMO_WAITER_PASSWORD` |
| Stock manager | `stock001` | `DEMO_STOCK_PASSWORD`, else `DEMO_KDS_PASSWORD` |

Other seeded accounts receive unknown random passwords. The three configured
logins are checked before the public listener opens. This only happens for a fresh
database; passwords edited in the UI remain until the ephemeral disk resets.
The superuser account is separate from Admin UI login.

On a fresh database the setup also switches online ordering on, so the test
site takes pickup orders right after each deploy. Set `DEMO_ORDERING=off` to
keep it off.

## Verification

Check Logs for migration success, demo login configuration completion, API startup,
and successful nginx configuration. Open the Render URL and verify all three
logins, order creation, waiter settlement, Admin Billing, TEST receipt printing,
RKSV Diagnostics and DEP7 export. Browser deep links and realtime updates should
work through the same public origin.

Docker is not required on your PC: Render builds the image. If Docker is installed,
build using `docker build -t tripti-render-test .` and run with a private env file:
`docker run --rm --env-file YOUR_PRIVATE_ENV_FILE -p 10000:10000 tripti-render-test`.
No local database is mounted by these commands.

After the Render URL works, add your custom domain in Render, configure its DNS,
then set `CORS_ORIGIN` to the full custom HTTPS origin. Saving environment changes
may redeploy and reset the demo database.
