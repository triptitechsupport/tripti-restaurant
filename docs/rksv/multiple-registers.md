# Multiple cash registers

All registers in this deployment belong to the same merchant organization,
environment and configured SCU. The Fiskaly key/secret, FON credentials, merchant
details and stable `FISKALY_SCU_ID` remain server environment configuration.
`FISKALY_CASH_REGISTER_ID` is the initial/default register, not the only register.
The current Render Free container still rejects LIVE mode.

## Setup without commands

1. Open Admin → RKSV Diagnostics.
2. For the existing environment register, click **Add configured register** if it
   is absent. Then click **Refresh existing register** to verify resources already
   initialized through Fiskaly. Existing database rows also need this first refresh.
3. For another register, enter its name. Keep the generated UUID for a new register,
   or paste an existing Fiskaly register UUID to import it. Click **Add register**.
4. Click **Complete / resume setup**. The server persists the register identity first,
   authenticates FON if needed, creates/initializes the configured shared SCU, creates,
   registers and initializes the cash register, then enables periodic validations.
5. If the SCU is pending or a request times out, retain the saved register and resume
   setup later. Never add a replacement merely because a request timed out.
6. Review initial validation. LIVE availability requires SUCCESS. In TEST, an
   initialized register with an initial receipt may be used when validation is not
   reported. **Validate initial receipt** requests validation of the existing receipt.
7. Click **Make default** for the preferred register.

FON credentials must belong to the dedicated cash-register web service user.
Credentials are never entered in the register form or returned by configuration APIs.
Initialization/registration perform real lifecycle operations in the selected
environment. Do not use them to reset or clear an existing fiscal register.

## Billing and recovery

Each settlement row has a Cash Register dropdown. The server checks the selected
record's environment, SCU, remote identity and readiness. It stores the selected
register in `fiskaly_transactions.cashRegister` before signing and includes its
name and Fiskaly UUID in new receipt snapshots. A pending/queued/failed receipt
cannot be moved to another register. A verified register can still queue during a
temporary Fiskaly outage; an unverified register cannot.

Retries, cancellations and reprints use the saved register. A settlement's unique
business receipt key is independent of the selected register, preventing duplicate
billing on different registers. Safely released rejected attempts remain in history.

DEP7 downloads require a register selection and include its UUID in the filename.
Periodic receipt monitoring and initial validation are scoped to the register
selected in Diagnostics. Existing signed receipt snapshots are not rewritten.

The migration adds availability/default flags, SCU status, initial validation,
last-check time and setup error to the existing `cash_registers` collection.
Use a single API worker. Separate merchants/organizations need a separate
configuration and are outside this multi-register workflow.
