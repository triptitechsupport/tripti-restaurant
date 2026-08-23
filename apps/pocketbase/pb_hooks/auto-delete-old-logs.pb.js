// DISABLED: onCron is not a valid PocketBase hook type
// PocketBase does not natively support scheduled cron jobs in hooks
// This hook has been disabled to prevent ReferenceError

// If you need scheduled cleanup, consider:
// 1. Using an external cron job that calls the PocketBase API
// 2. Implementing cleanup logic in onRecordAfterCreateSuccess to clean old records when new ones are added
// 3. Using a separate service/script outside of PocketBase hooks

// No-op - hook is disabled