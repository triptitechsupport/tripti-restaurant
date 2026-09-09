# Tripti SIGN AT integration

## Local development

The integration runs inside the existing Express API at `/billing`, reached through
Vite's `/hcgi/api/billing` proxy. Fiscal routes validate `admin_users` tokens against
PocketBase. Credentials remain in `apps/api/.env`; they are never sent to the browser.

Required environment variables (the current local setup uses the POC's TEST account):

```dotenv
FISKALY_ENABLED=true
FISKALY_ENVIRONMENT=TEST
FISKALY_API_KEY=<TEST key>
FISKALY_API_SECRET=<TEST secret>
FISKALY_CASH_REGISTER_ID=<existing register UUID>
FISKALY_SCU_ID=<existing SCU UUID>
FISKALY_VAT_ID=ATU12345678
FISCAL_COMPANY_NAME="Tripti Genusswelt — DEVELOPMENT"
FISCAL_COMPANY_ADDRESS="Musterstraße 1, 1010 Wien (TEST)"
# Only needed for initial FON setup:
FON_PARTICIPANT_ID=<webservice user participant>
FON_USER_ID=<webservice user>
FON_PIN=<webservice PIN>
```

The token's environment is verified before any resource mutation. Changing to LIVE
requires LIVE credentials and actual merchant details; TEST resources cannot be reused
as LIVE resources. Do not run register provisioning again for an initialized register.

### LIVE configuration guard

`docs/rksv/live-config.example` contains blank LIVE settings for deployment. It is
not loaded automatically; copy its values into server configuration, never commit
credentials. Supplying credentials alone does not complete FON/register onboarding
or resolve the payment/fiscalization workflow limitations below.

Development company defaults apply only in TEST. LIVE operations are blocked unless
the server has an explicit legal name/address, a correctly formatted Austrian VAT ID
without known sample values, distinct valid cash-register/SCU UUIDv4 IDs, and API
credentials. Common development/placeholder values are rejected. The operator must
also review the merchant details and explicitly set `FISKALY_LIVE_CONFIRMED=true`.
This flag is a local go-live guard, not a Fiskaly API parameter or a compliance certificate.

Configure these server environment variables when you are ready to go live:

```dotenv
FISKALY_ENABLED=true
FISKALY_ENVIRONMENT=LIVE
FISCAL_COMPANY_NAME=<actual legal name>
FISCAL_COMPANY_ADDRESS=<actual complete business address>
FISKALY_VAT_ID=<actual Austrian VAT ID>
FISKALY_CASH_REGISTER_ID=<LIVE register UUIDv4>
FISKALY_SCU_ID=<LIVE SCU UUIDv4>
FISKALY_API_KEY=<LIVE API key>
FISKALY_API_SECRET=<LIVE API secret>
# Set to true only after replacing and reviewing every placeholder above.
FISKALY_LIVE_CONFIRMED=false
```

The validation checks presence, format and known placeholder patterns; it cannot
establish the legal identity/address or VAT registration of a merchant. Confirm those
details yourself. FON onboarding and resource initialization are still necessary;
stored FON webservice credentials do not need to be re-entered on every API restart.
Refer to https://workspace.fiskaly.com/sign-at/integration-guide .

The API remains available for ordinary KOT work and historical receipt reads when
fiscal configuration is blocked. It logs the blocking settings on startup, returns
non-secret readiness issues from `/billing/configuration`, and shows them in Admin
Billing. The compact environment badge shows **LIVE blocked** where applicable.
No API secrets are returned. All Fiskaly operations check configuration before
authentication and before sending the resource request, including with cached tokens.
An environment or credential change invalidates cached authentication; the returned
token must match the configured environment before any resource mutation.

Generation validates configuration before preparing/locking the order. Retries also
validate saved merchant details: changing current configuration cannot sanitize an
old dummy receipt snapshot. TEST transactions cannot be reused as existing LIVE bills,
and a TEST outage copy cannot be replayed in LIVE. Configuration failures do not create
fallback receipts. Reprints continue to use the original stored receipt and environment.
Correct the configuration and restart the API; review any failed queued receipts before
retrying. Do not edit issued receipt snapshots to bypass these guards.

No database changes are needed for this guard. The current development installation
remains in TEST; no LIVE resources are created by its automated tests.

## Database

`1788912000_add_rksv_billing.js` adds `cash_registers`, `fiskaly_transactions`,
`waiter_orders.fiscalLocked`, and `menu_items.vat_Rate`. VAT defaults requested for
development are STANDARD (20%) for Beverages/Getränke, REDUCED_1 (10%) otherwise.
Menu Management exposes an editable VAT dropdown. New KOTs capture the menu VAT;
legacy KOTs fall back to current menu VAT when the receipt is prepared.

Back up PocketBase before migrating. Restart PocketBase to load the new hooks, and
restart the API to load environment settings. The existing executable requires
`--encryptionEnv=PB_ENCRYPTION_KEY`; load the value from the local API environment.
Do not copy the POC's database or historical migrations into this project.

Fiscal collection writes are backend-only. Admins may read them. The migration
deliberately refuses destructive rollback so signed receipt history is not erased.

## Billing behavior

### Separate bills from waiter settlements

New waiter payment confirmations use the authenticated PocketBase endpoint
`POST /api/payment-settlements/confirm`. The endpoint validates fresh selected KOT
rows, saves their quantities/prices/VAT in an immutable `payment_settlements` record,
marks the corresponding items paid and updates parent payment totals in one database
transaction. A stable request UUID makes retries idempotent; competing confirmations
cannot allocate an item twice. Selecting a 2× row settles both units (quantity splitting
inside a row is not implemented). No Fiskaly request occurs during waiter confirmation.

Admin Billing now shows one row per settlement, including closed parent orders.
The admin chooses the payment type and generates a receipt for that row through
`POST /billing/settlements/:id/generate`. The receipt contains only the saved settlement
items, uses a unique UUID and business key, and retains the settlement ID in its
metadata and printed receipt. Generation never recalculates selected items from the
current menu. Each settlement has separate generation, cancellation and printing
actions. Recovery archives only that settlement's rejected attempt; it does not unlock
settled items. Settled items remain immutable, while unallocated items remain editable.
Pay, End Order and Free Table remain independent of fiscal generation.

The legacy whole-order view is available under a separate button for pre-existing
receipts and recorded payments. Existing issued receipts are not converted into new
settlements or fiscalized again. Already-finalized legacy orders can still record waiter
payment through the previous settlement path, without creating another bill. Historic
payments made before this migration have no reconstructable split-group history and
are not automatically split. Before deploying to another database, reconcile any
historic partially-paid orders without receipts before taking further split payments.

Deployment: back up PocketBase, apply `1789100000_add_payment_settlements.js`, load
`payment-settlements.pb.js` and the updated fiscal guard/recovery hooks, then restart
PocketBase and the API and deploy the frontend. The migration adds the
`payment_settlements` collection and `fiskaly_transactions.settlement` relation.
Existing fiscal records are retained. Local backup before this migration:
`before-rksv-1788948187483.zip`. No new credentials are required.

`node --env-file=apps/api/.env scripts/rksv/verify-settlements.mjs` tests only the
isolated port-8091 database, using mocked Fiskaly responses. It verifies atomicity,
duplicate/concurrent confirmation protection, immutable items, separate receipt IDs,
recovery and cancellation scoped to one settlement. Never point it at production.

The legacy Billing view flags orders whose waiter `paymentStatus` is `paid` and which have no issued
NORMAL fiscal receipt. The warning count includes closed orders even when they are
hidden; a button reveals those orders. Desktop rows and mobile cards show the same
warning. Pending, queued (including fallback copies), failed and superseded attempts
do not count as issued. Signed or issued SCU-outage receipts clear the warning.
An issued receipt later cancelled is not classified as never generated. This is an
admin reminder only; waiter payment, End Order and Free Table remain independent.

- New payments use one NORMAL receipt per settlement, with one selected payment method.
  Existing legacy whole-order bills retain their original one-receipt-per-order behavior.
- Legacy whole-order amount is recalculated in integer cents from KOTs. Cancelled KOTs are
  excluded; `cleared` means paid and those lines remain on the final receipt.
- Preparing a receipt atomically saves its immutable UUID, request and company/item
  snapshot. New settlement items are protected from payment confirmation onward;
  legacy whole-order receipts continue to lock the entire order.
- `billingStatus` is a legacy independent field without a current update workflow.
  Generating a receipt does not charge a card or mark items paid.
- Include closed orders to retrieve historical receipts. Printing uses the stored
  snapshot and original QR code; it never signs again. Printing opens the browser's
  print dialog (select the thermal printer and 80mm paper in the driver).
- A full cancellation creates a separate negative receipt referencing the original.
  It does not erase the original, unlock the order, refund a payment or update waiter
  settlement figures. Record any actual refund separately.
- TRAINING receipts are available through the API for unfinalized orders only in TEST and do not
  finalize the order. They are not used for settlement billing. Partial refunds and
  mixed payment methods within one settlement are not implemented.

## Reliability and operations

The API polls the durable queue every 30 seconds. Failed network requests/408/429/5xx
use capped exponential backoff. Before signing, the worker retrieves the same UUID;
a timeout or failed local save therefore does not produce a second receipt. Permanent
errors remain visible for administrator action. Retry preserves the UUID and payload.
Pending receipts survive API restarts. Run one API worker for this single-register
deployment; horizontal scaling needs a distributed queue lease before rollout.

### Failed receipt recovery

Queue processing isolates errors per receipt, including database lookup/save failures.
A mismatched environment is recorded as a failure; later eligible receipts continue.
Signing, retry changes and recovery checks are serialized by the single local worker,
which reloads each receipt before processing it so stale queue entries cannot revive
released attempts.

For configuration/authentication errors, correct the reported issue and use **Retry
generation**. This preserves the UUID and original payload. Legacy failures without
structured error evidence also need a retry before a release can be considered.

For a confirmed SIGN AT payload rejection (`E_BAD_REQUEST`, HTTP 400 from the receipt
PUT), Billing offers **Release rejected bill** when no signed receipt or outage copy
has been retained. Admin must enter a reason. The backend verifies the original
register/environment, then retrieves the original receipt UUID. Only the specific
`E_RECEIPT_NOT_FOUND` response authorizes release. A generic 404, unavailable service,
wrong environment, or uncertain result leaves the order locked. If a receipt is found,
it is reconciled locally instead of being released.

Release atomically archives the failed attempt as `superseded`, retains its original
UUID/payload plus administrator/reason/verification evidence, frees the business key,
and unlocks a NORMAL order. Correct the order through the existing order workflow and/or
payment selection, then generate a new bill. The replacement receives a new UUID; the
archived UUID can never be retried. Released history remains visible in Billing.
The original order's open/closed and payment states are unchanged by recovery.

**Release rejected cancellation** uses the same checks and permits a new cancellation
attempt without unlocking the original sale. Signed receipts and retained outage copies
are never eligible for release. Their existing cancellation/reconciliation workflows
remain in force; this is not a bypass for an uncertain signing result.

Deploy `1789000100_add_fiscal_recovery.js` and `fiscal-recovery.pb.js` with the API/UI
changes. The migration adds `failureDetails`, `recoveryDetails` and the `superseded`
status to `fiskaly_transactions`; no new collection is required. Back up and restart
PocketBase before restarting the API. `POST /billing/transactions/:id/recover` is
admin-authenticated and accepts `{reason}`.

SCU outage receipts supplied by SIGN AT are stored with `outage` status and their
original `hints` text is printed. If SIGN AT cannot be reached (network failure,
408/429/5xx), the worker saves a customer outage copy together with the queued state.
Billing then offers **Print outage receipt**. The saved copy includes the original
company/items/VAT/payment, a fixed issue timestamp and a unique local reference.
It omits the fiscal receipt number and register identifier, and prints
`Sicherheitseinrichtung ausgefallen` both as text and as the QR content. This QR is
an outage notice, not an RKSV signature. The copy is retained before printing is
enabled; authentication/configuration/payload errors do not create outage copies.

The queue retries the unchanged original payload and UUID. After successful signing,
Billing offers the signed receipt and **Print outage copy** separately. The original
outage copy cannot be modified or deleted, including by backend API writes. Cancellation
requests that encounter an outage retain a separate negative outage copy. A cancellation
of a still-queued sale must wait for its fiscalization; the normal retry continues.
The system retains the receipt contents, not confirmation that the printer produced
paper. Browser print cancellation can always be followed by printing the same saved copy.

This handles a SIGN AT/network outage while the local API and PocketBase remain
available. It does not implement a fully disconnected browser POS or receipt issuance
when the local database cannot save the receipt. Free Table remains independent of
fiscal status, as agreed.

Deploy `1789000000_add_fiscal_fallback_receipt.js` and `fiscal-fallback.pb.js`, back up
PocketBase, and restart PocketBase to apply the migration/load the hook before restarting
the API. The migration adds one JSON field, `fiskaly_transactions.fallbackReceipt`;
no new collection is required. Existing queued receipts acquire a copy on their next
eligible failed attempt. Run only one API worker for this local deployment.

Reference: https://workspace.fiskaly.com/countries/austria/faq/sign-at-what-happens-if-i-cannot-reach-the-sign-at-api-4961028134546/

Billing shows a standalone Download DEP7 button and a small TEST badge in the test
environment. Setup, status and training receipt controls are not shown in Billing.
The backend retains FON authentication, SCU/register setup, register outage/recovery,
monthly/yearly validation configuration and deliberate decommissioning through its
admin-protected setup endpoints. Fiskaly manages SCU outage handling and special
periodic receipts; `GET /billing/status` exposes whether periodic validation is
enabled. Decommissioning is never automatic. API receipt validation is available at
`POST /billing/transactions/:id/validate`.

`GET /billing/dep7` supports optional `start_receipt_number`, `end_receipt_number`,
`start_time_signature`, and `end_time_signature`. Export and retain backups according
to the merchant's retention process; this change does not create offsite backups.

Automatic DEP7 backups are explicitly deferred (2026-09-09): no backup storage
destination is currently available. Admins manually use **Download DEP7** in Billing
and are responsible for retaining the resulting files. The Billing button requests
the full export without date or receipt-number filters. There is no scheduled export,
server-side backup archive, or automatic independent copy; the backup-process gap
therefore remains open. No additional database collection or migration is needed
for this manual workflow.

## Verification

### Periodic receipt visibility

The separate RKSV Diagnostics admin tab includes periodic validation status. While that tab
is open it reads `GET /billing/periodic-receipts` every minute. The admin-only endpoint
reads the configured register's MONTHLY_CLOSE and YEARLY_CLOSE receipts across all
pages and the organization's automatic validation flags. Successful snapshots are
cached for 60 seconds; errors are surfaced, and the UI labels retained results outdated.
Refresh status can reuse that one-minute cache. There is no polling when RKSV Diagnostics is
closed and no email/background alert delivery.

The display shows receipt numbers, signing timestamps in Europe/Vienna, and all
reported FON validation attempts. The latest attempt determines success/failure.
Absent validation data is **Not reported**, never implicit success or a confirmed
pending job. Empty history means no periodic receipts were found; it does not certify
that all expected periods are present. Disabled or unavailable validation settings
and failed checks remain visible in the collapsed summary. An administrator can
review failures with Fiskaly and enable validations through the existing maintenance
endpoint. This monitor performs GET requests only; it does not generate periodic
receipts, retry validation automatically, or modify billing/order status. No database
changes or additional credentials are needed.

### Register lifecycle maintenance

Lifecycle operations remain admin-authenticated API operations; the removed technical
setup panel is not restored to Billing. Use `POST /billing/setup/:action` with an
admin bearer token and a JSON body. Credentials stay in server environment variables.

For a new installation, use `authenticate-fon`, `create-scu`, `initialize-scu`,
`create-register`, `register`, `initialize-register`, then `enable-validations`.
Each transition reads the current remote state and checks prerequisites. Retrying a
completed transition returns the existing resource. Resource creation only proceeds
after the specific Fiskaly resource-not-found response; it reuses the configured UUID.

For a physical register outage, use `report-outage`; after repair use
`restore-register`. The operator must report a register defect within the 48-hour
window described in Fiskaly's guide. Network/SIGN AT failures alone do not trigger
this transition, and SCU outages are handled by Fiskaly. This application cannot
detect physical register failures while it is offline.

For planned retirement, resolve all pending/queued/failed receipts first, then use
`decommission-register` with `{"confirmation":"DECOMMISSION"}`. For an irreparable
register use `defective-register` with `{"confirmation":"DEFECTIVE"}`. Both are
permanent; a replacement needs a new stable register UUID and the normal setup flow.
Keep the old register's records and exported DEP7. No resource is deleted or replaced
automatically. Export the final DEP7 manually before changing configured register IDs.

For organization offboarding, retire **all** organization cash registers before
`decommission-scu` with `{"confirmation":"DECOMMISSION"}`. The application checks
every page of Fiskaly's register list and rejects SCU retirement while any register
is nonterminal. Maintenance and local receipt operations share the one-worker lock;
run one API instance. External tools changing resources require operational coordination.

On a transition timeout, the backend retrieves the resource to reconcile a completed
change. If still uncertain it returns an explicit error: refresh `GET /billing/status`
and retry the same action after Fiskaly/FON synchronization. Do not create replacement
resources to work around a timeout.

`GET /billing/lifecycle/receipts` retrieves the configured register's initialization
and decommission receipts, including Fiskaly's validation information. Fiskaly creates
and validates these receipts; review their results after setup/offboarding. An explicit
validation retry is available at `POST /billing/lifecycle/receipts/initialization/validate`
or `POST /billing/lifecycle/receipts/decommission/validate` with an empty JSON body.

Known API limitation: the prose guide mentions SCU `DEFECTIVE`, but the published
v1.2.6 update-SCU schema permits only `INITIALIZED` and `DECOMMISSIONED`. The application
does not send an unsupported SCU transition; contact Fiskaly for a permanently defective
SCU procedure. No database migration is needed for these lifecycle changes.

Reference: https://workspace.fiskaly.com/api/rksv/v1/

`npm run test:rksv --workspace apps/api` runs calculation, schema, retry, reconciliation,
outage, cancellation and environment-guard tests. `scripts/rksv/smoke.mjs` targets an
isolated PocketBase copy on **8091 only**, creates synthetic test items, and checks
database guards. `--remote` additionally signs and reverses ONLY its newly created
synthetic fixture against the configured TEST register and checks DEP7.

The checked-in `sign-at.openapi.json` was downloaded from
https://workspace.fiskaly.com/specs/spec-sign-at.json on 2026-09-09 (API 1.2.6).
The integration uses the OpenAPI `standard_v1` schema. Its fields are directly under
`standard_v1`; do not add the extra `receipt` nesting shown in the prose quick-start.

`node --env-file=apps/api/.env scripts/rksv/verify-outage.mjs` verifies the migration,
retained-copy guards, restart recovery, and cancellation outage handling against an
isolated PocketBase backup copy on **8091 only**. It creates synthetic data and uses
a simulated Fiskaly transport; no requests are sent to Fiskaly. Its browser fixture
is written to `.rksv-test/outage-preview.json`.

`node --env-file=apps/api/.env scripts/rksv/verify-recovery.mjs` uses the same isolated
8091 database with a simulated Fiskaly transport to verify atomic release, retained
history, stale-proof rejection, correction/rebilling, cancellation recovery, and remote
receipt reconciliation. It never contacts Fiskaly or changes the live-local database.

Reference: https://workspace.fiskaly.com/api/rksv/v1

Production readiness still requires actual merchant/FON setup, verified tax treatment,
payment/refund workflow review, receipt/printer acceptance, backup/retention and outage
procedures. Passing TEST API calls is not a compliance certification.
