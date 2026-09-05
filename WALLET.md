# Nexora Wallet

The customer wallet lives at `/account/wallet`, with balance, add-money form, latest 100 ledger entries, and pending deposits. Checkout accepts cash on delivery or wallet balance. Stock, wallet debit, order snapshots, cart clearing and ledger writes commit in a single MongoDB transaction. Checkout therefore requires a replica set.

Deposits use SSLCOMMERZ hosted checkout. Configure the server-only settings in `backend/.env.example` and a publicly reachable HTTPS callback origin. Until these are present, adding money is disabled visibly. No merchant credentials are included. No real payment has been made or provider sandbox session verified in this workspace.

SSLCOMMERZ initiation uses `/gwprocess/v4/api.php`. IPN and successful browser returns validate against `/validator/api/validationserverAPI.php`; transaction ID, amount, currency, validation status and risk level must match. Browser redirects and posted amounts never credit a wallet by themselves. Duplicate notifications cannot credit twice. Pending attempts remain visible when confirmation has not arrived; provider retries can complete them. There is no automatic refund, withdrawal or transfer interface yet.

Sandbox and live balances are separate, and wallet-funded test orders carry `payment_mode=sandbox`. Default mode is sandbox. Before accepting money, complete provider sandbox tests, confirm merchant support for wallet top-ups, configure live credentials and reconciliation/refund operations. Never switch a test wallet into a real balance.

Product reviews appear directly beneath the buying area. Signed-in users can submit or update their review. Only a matching delivered order outside sandbox receives a verified-purchase label. No invented customer reviews were added.

Reference: [SSLCOMMERZ integration documentation](https://developer.sslcommerz.com/doc/v4/).

Local checks: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_local_marketplace.py backend/tests/test_wallet.py -q`. Fixtures are guarded to the isolated local database; synthetic wallet funds belong only to unique test users.
