# NEXORA — Product Requirements & Build Log

## Original Problem Statement
Build NEXORA, a premium Bangladesh-first multi-vendor ecommerce marketplace. This phase = **Customer + Seller Foundation** (no admin panel, no AI, no payment gateway/courier backends). Six systems: (1) Customer marketplace, (2) Customer auth + account, (3) Seller auth, (4) Seller dashboard foundation, (5) Seller store builder + public storefront, (6) Seller subscription + feature gating. Plus category-based storefront theme presets and seller product management. Strict bright/fresh design system (Emerald #10B981 / Mint #2DD4BF), no dark theme.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). Modules: `server.py` (app + startup seed), `auth.py` (JWT + Google), `security.py` (bcrypt + JWT Bearer, role guards), `catalog.py` (public catalog/home/shops/reviews), `seller.py` (seller profile, onboarding, shop CRUD, product CRUD, bulk, subscription, upload), `commerce.py` (cart/wishlist/addresses/checkout/orders), `entitlements.py` (central plan gating), `storage.py` (object storage), `seed.py`.
- **Auth**: JWT Bearer token (7-day) in localStorage `nexora_token`; unified User model with roles CUSTOMER/SELLER/ADMIN. Google login (Emergent-managed) resolves into same user model. Customer → /account, Seller → /seller/dashboard.
- **Frontend**: React + react-router, contexts (AuthContext, StoreContext, SellerContext), Tailwind (nexora palette), Playfair Display / Plus Jakarta Sans / JetBrains Mono, framer-motion, recharts. Cart/wishlist persist to backend for logged-in users (hydrate + debounced sync) and localStorage for guests.
- **Theming**: 9 category-based storefront presets (presentation only). Category sets default preset; subscription controls customization depth (central entitlements).

## User Personas
- Shopper: browses marketplace/shops, wishlists, carts, checks out (COD), reviews, manages account/orders/addresses.
- Seller: onboards (business → category → plan → shop), manages products/inventory, builds storefront, switches themes (plan-gated), manages subscription.

## Core Requirements (static)
- Separate customer vs seller experiences with role-based routing.
- Real public storefront at `/shop/:slug` (published only).
- Central feature-entitlement system (START ৳500 / GROW ৳1500 / PRO ৳3000) with locked states + upgrade prompts.
- No dead buttons; real state/navigation everywhere.
- Mobile-first responsive.

## Implemented (2026-06)
- ✅ Customer marketplace: home (hero, categories, trending, top-rated, new arrivals, deals, featured shops, brands), listing/category/search/deals, product detail (gallery, variants, qty, delivery info, seller card, tabs desc/specs/reviews, FBT, similar), shops browse, public storefronts with 9 themes, cart, wishlist, checkout (COD entry), recently viewed. Sticky header + mobile bottom nav.
- ✅ Customer auth + account: login/signup/forgot-password, Google button, account overview/orders/wishlist/addresses/profile/recently-viewed.
- ✅ Seller auth + 4-step onboarding (business → category → plan → shop).
- ✅ Seller dashboard: Overview (metrics, recent orders, low stock, store status, subscription summary), Orders, Products (search/filter/sort, bulk gated), Add/Edit Product (images upload, variants, draft/publish), Inventory, Store Builder (live preview, publish/unpublish, View as customer), Themes (9 presets, plan-gated), Subscription (compare/switch), Customers, Reviews, Analytics (chart + gated), Settings (staff/CSS gated), Notifications.
- ✅ Subscription feature gating via central entitlements (backend enforced + frontend LockGate).
- ✅ Object storage image uploads (products, logo, banner, hero).
- ✅ Seed: 13 shops across all 9 categories, 95 products, reviews, unique banners.
- ✅ Backend cart/wishlist persistence, checkout stock validation + decrement, review dedup per user/product.
- ✅ Tested: iteration_1 (35/35 backend, all core frontend flows), iteration_2 (4 regression flows 100%).

## Backlog (future phases)
- P1: Real payment gateway (Stripe/bKash), order status workflow, seller order fulfilment actions.
- P1: Admin panel (role exists in data model).
- P2: AI feature suite (PRO entitlement placeholders), marketing/abandoned-cart tools, staff accounts, bulk import/export, advanced analytics/customer insights.
- P2: Coupons/SEO tooling, notifications system (real), password reset email (Resend).
- Polish: replace a few seed images with cleaner catalogue photos; optional "keep skipped out-of-stock items in cart" UX.

## Test Credentials
See `/app/memory/test_credentials.md`.
