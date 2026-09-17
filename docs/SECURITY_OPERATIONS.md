# Security operations

- Never commit test reports containing emails, passwords, bearer tokens, cookies, payment payloads or production URLs. Generated JSON/XML reports are ignored by Git.
- Demo accounts are created only when `SEED_DEMO_DATA=true`, and their passwords must be supplied through `DEMO_CUSTOMER_PASSWORD` and `DEMO_SELLER_PASSWORD` (minimum 12 characters).
- If a credential ever appears in Git, removing the file from the current branch does not revoke it. Rotate the credential in the owning service and invalidate active sessions. Historical removal, if required by policy, must be coordinated separately because it rewrites Git history.
- Courier API secrets belong in the deployment secret manager. Store only the configured secret's reference name in platform settings.
