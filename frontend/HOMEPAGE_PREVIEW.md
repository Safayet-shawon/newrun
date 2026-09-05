# Nexora local marketplace preview

The homepage uses the supplied HTML typography and purple theme, preserving the approved photographic category cards and brand cards. It reads the local API with no public fallback shopping popup or preview bag.

`scripts/populate_local.py` creates 36 distinct development products across four shops in the isolated nexora_local database. Products, shops, categories and brands link to dedicated catalogue or detail pages. Sample descriptions identify development records. Credentials stay in the ignored .local/dev-accounts.json file.

Lower product controls occupy two compact horizontal rows: category selection, then Trending for You, Best Selling, Best Price and Premium Products. Small screens scroll each row independently. Best Selling requires recorded sales; price ordering uses discounted prices where present. Responsive pages hold four product rows when enough matches exist.

Header search appears only after the hero leaves view. Desktop centering is independent of unequal side controls. Browser measurements at the available 910px viewport confirmed centered search, unchanged header height, single-row controls and four product rows. Requested 1366/1440/1920 overrides were not applied by the hidden preview window; those dimensions remain unverified. The approved mobile layout was preserved in code; no new mobile screenshot verification is claimed.

Wallet and reviews: see ../WALLET.md. Build with `node node_modules/@craco/craco/dist/bin/craco.js build` from frontend. The API requires a MongoDB replica set for transactional checkout.
