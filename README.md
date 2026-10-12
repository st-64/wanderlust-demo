# Wanderlust

Wanderlust is a server-rendered travel marketplace for browsing stays, experiences, and services. It is built with Express, MongoDB/Mongoose, EJS, Bootstrap, Passport, Cloudinary, and Mapbox.

## Features

- Browse listings by category, type, region, or destination search
- Create, edit, and delete listings with multiple Cloudinary-hosted photos
- Responsive listing photo gallery with keyboard-accessible controls
- User accounts, persistent sessions, public host profiles, and profile photos
- Guest reviews with ratings and listing ownership checks
- Mapbox geocoding and approximate listing maps
- Paginated search results and friendly production error pages
- Server-priced booking requests with atomic date holds that expire after 10 minutes
- Razorpay Standard Checkout with server-verified INR payments when credentials are configured
- Authenticated guest dashboard with trip sections, booking details, and eligible hold cancellation
- Host dashboard, owner-scoped listing management, and read-only reservation views

Host availability-management calendars are not implemented. Listing pages show unavailable date ranges and server-calculated estimates. A booking request remains `PENDING_PAYMENT`; it is confirmed only after the provider payment is verified on the server. Checkout remains disabled until all Razorpay credentials are configured.

## Requirements

- Node.js 20.19.0 or newer
- MongoDB (local or hosted)
- Cloudinary account for image uploads
- Mapbox access token for geocoding and listing maps

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set the variables listed below.
3. Start MongoDB locally, or configure `MONGO_URL` to use a hosted database.
4. Run `npm run dev` and open the local URL printed by the server (port 8080 by default).

The application loads `.env` outside production. Local development has a local MongoDB URL and a development-only session secret fallback. Cloudinary uploads and geocoding require their corresponding service configuration.

## Environment variable names

The example file contains names only. Do not commit `.env` or put real credentials in this README.

- `NODE_ENV`
- `PORT`
- `MONGO_URL`
- `SESSION_SECRET`
- `MAP_TOKEN`
- `CLOUD_NAME`
- `CLOUD_API_KEY`
- `CLOUD_API_SECRET`
- `CLOUDINARY_FOLDER`
- `TRUST_PROXY`
- `SEED_OWNER_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `CSP_MODE`
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_AUTH_MAX`
- `RATE_LIMIT_BOOKING_MAX`
- `RATE_LIMIT_PAYMENT_ORDER_MAX`
- `RATE_LIMIT_PAYMENT_VERIFY_MAX`
- `RATE_LIMIT_MUTATION_MAX`

Set `TRUST_PROXY=true` only when the deployment is behind a trusted single reverse proxy and needs Express to recognize HTTPS forwarding headers. In production, `MONGO_URL`, `SESSION_SECRET` (at least 32 characters), `MAP_TOKEN`, and all three Cloudinary values are required. Production cookies are HTTP-only, `SameSite=Lax`, and secure.

Razorpay credentials are optional at startup. Checkout is enabled only when the key ID, key secret, and webhook secret are all present. Use Razorpay test-mode credentials until the sandbox and webhook configuration have been verified.

## Seed data

`init/data.js` contains development sample listings. The reset script is intentionally not run during app startup and refuses to run when `NODE_ENV=production`.

The seed script **deletes all listings and their referenced reviews in the configured database** before inserting the sample set. Use it only with a disposable development database. `SEED_OWNER_ID` must identify an existing local Wanderlust user; the script verifies this before changing listing data.

In PowerShell, set the existing local user's ID for the current terminal before running:

```powershell
$env:SEED_OWNER_ID = "<existing-local-user-id>"
npm run seed
```

## Tests

Run the Node.js built-in test suite:

```sh
npm test
```

The current tests cover listing and booking model/request validation, strict dates, half-open availability, booking price snapshots, atomic overlap checks, expiration, cancellation, guest/host authorization, guest dashboard categorization and ownership, payment order and signature rules, webhook idempotency, sample-data compatibility, legacy image normalization, Cloudinary stream handling, map-popup text safety, and EJS template compilation.

Booking unit tests do not connect to MongoDB. Any future database integration tests must use a dedicated isolated test database, never the configured development or production database.

## Booking foundation (Phase A)

Guests can view unavailable date ranges, check dates, and get server-calculated price estimates on a listing, then create a pending booking hold. The availability feed covers the next 365 days from its requested start date. Check-in is inclusive and check-out is exclusive. Confirmed bookings and unexpired pending holds block overlapping dates; expired pending, cancelled, and expired bookings do not. Overlap prevention remains an atomic conditional update on the listing document, so concurrent requests cannot both hold overlapping dates. Expired pending bookings are marked `EXPIRED` by the server-side expiry worker; their dates become available at the server-recorded `paymentExpiresAt`. Guests may cancel their pending holds.

Price snapshots use the listing's current price and unit (`night`, `person`, or `service`) and are stored in INR minor units. Client-submitted prices and booking statuses are rejected. There is no payment provider, payment checkout, or route that confirms a booking in this phase. Listings with active bookings cannot be deleted.

No new environment variables are required for Phase A.

## Guest dashboard (Phase C)

Authenticated guests can open `/dashboard` to view only bookings belonging to their signed-in account. Confirmed stays are categorized using server time and the existing UTC, check-in-inclusive/check-out-exclusive date convention: future stays are upcoming, stays satisfying `checkIn <= now < checkOut` are current, and ended or completed stays are past. Cancelled bookings appear separately. Pending holds and other non-confirmed lifecycle statuses appear under booking updates; an expired pending hold is shown as `EXPIRED` based on server time and is not presented as a confirmed trip.

Booking details display the stored price snapshot rather than recalculating a historical amount from the listing's current price. Guests can cancel only their own eligible `PENDING_PAYMENT` holds through the existing booking lifecycle service. Booking detail and cancellation endpoints remain guest-scoped; no payment success, refund, or host-management functionality is implied. Missing/deleted listing references fall back to the booking's saved title/location and a local placeholder image.

No new environment variables are required for Phase C.

## Host dashboard (Phase D)

Authenticated users can use `/host/dashboard`, `/host/listings`, and `/host/reservations`. Reservation details are available at `/host/reservations/:bookingId`. A person can use both guest and host pages; the host pages do not change their guest permissions or dashboard.

Host listing queries use the signed-in user's listing owner ID. Reservation lists and details are scoped to the server-recorded booking host; detail pages also verify current listing ownership when the listing still exists. A missing/deleted listing is shown using the saved booking title/location and a local placeholder image. Guest names/usernames may appear in host reservation pages; guest emails and other private account details are not exposed. Listing and reservation lists paginate with a fixed page size, and reservation status filters accept only the documented options.

The listing model has no active/inactive status field, so all existing owned listings count as listed inventory. Upcoming confirmed stays have a future check-in; current confirmed stays satisfy `checkIn <= now < checkOut` using server time; past includes completed bookings and confirmed stays whose check-out has passed. Active pending holds include unexpired `PENDING_PAYMENT` and `PAYMENT_PROCESSING` records, but are never counted as confirmed reservations. Expired pending records are shown with expired booking updates rather than as active holds.

“Gross booking value” is the sum of the saved `priceSnapshot.subtotalMinor` in INR for host bookings in `CONFIRMED` or `COMPLETED` status. Pending/payment-processing, cancelled, expired, failed, and `REFUND_REQUIRED` bookings are excluded. Values use the booking's saved price snapshot, not the current listing price. This is a gross booking value metric, not profit, net earnings, a payout balance, or evidence of payment collection.

Host reservations are read-only. Hosts cannot confirm/cancel bookings or block dates from a host calendar; guests continue to use the existing availability check and pending-hold cancellation flows.

## Payments (Phase E)

### Provider and documented API

Wanderlust uses Razorpay Standard Checkout and the Razorpay Orders/Payments APIs for its INR price snapshots and India-oriented deployment context. The backend uses Node's built-in `fetch` and Razorpay's documented HTTPS API rather than the current Razorpay Node SDK: the official Node SDK prerequisites currently require Node.js 22.2+, while this application supports Node.js 20.19+. Official documentation reviewed on 2026-10-09:

- [Razorpay Node.js server integration steps](https://razorpay.com/docs/payments/server-integration/nodejs/integration-steps/)
- [Razorpay Standard Checkout integration steps](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/)
- [Razorpay Create an Order API](https://razorpay.com/docs/api/orders/create/)
- [Razorpay webhook signature validation and testing](https://razorpay.com/docs/webhooks/validate-test/)

No tax, fee, commission, payout, cancellation-fee, or refund eligibility rules are added.

### Test-mode setup and local webhook testing

1. Create/activate a Razorpay account for the intended business and enable **Test Mode**. Generate a test key ID and key secret; do not use live credentials for development or QA.
2. Copy the three `RAZORPAY_*` placeholders from `.env.example` into a private local `.env`, using only test values. Never print, commit, or put credentials in a browser-visible setting.
3. Configure automatic payment capture in Razorpay; this app intentionally confirms only **captured** payments and does not call a manual capture API. Configure the account's webhook to `https://<public-test-tunnel>/payments/razorpay/webhook`, use the same webhook secret locally, and subscribe to `payment.captured` and `payment.failed`. For local testing, expose the local app with a trusted HTTPS tunnel such as `ngrok http 8080`, then use the tunnel URL in the test-mode dashboard. Keep test events and data isolated from production.
4. Run the app against a dedicated, disposable QA MongoDB database and complete a real test-mode checkout. Confirm signed webhook deliveries and duplicate-event retries from Razorpay's dashboard. This repository's automated tests mock all provider HTTP interactions.

Checkout is intentionally unavailable unless all three credentials are set. No sandbox credentials were configured or real provider/browser payment was performed during this implementation.

### Flow and state handling

`POST /listings/:id/bookings` rechecks the listing, dates, guests, current availability, host, and server price, then persists the INR minor-unit snapshot and an atomic 10-minute listing hold. `POST /bookings/:bookingId/checkout` is authenticated, host/guest data is server-derived, and one persisted payment row gates order creation. The order uses the stored `subtotalMinor`, saved `INR` currency, booking receipt, and server-side booking/guest notes. Repeated checkout calls reuse the saved provider order. An `ORDER_CREATING` row is deliberately not retried automatically after an ambiguous provider/network outcome; support must reconcile that receipt with Razorpay before clearing it, avoiding an accidental second order.

Standard Checkout's browser callback is only a claim. `POST /bookings/:bookingId/verify` checks the callback HMAC against the stored order, retrieves the payment from Razorpay, and checks payment/order IDs, capture status, amount, and currency. Only then does the server attempt confirmation. Webhooks are separately verified using the HMAC-SHA256 of the **raw request body** and `X-Razorpay-Signature`; `X-Razorpay-Event-Id` is uniquely stored to deduplicate retries. The webhook's JSON raw-body parser is route-specific; the app's URL-encoded form parser does not consume JSON webhook requests. Configure only the documented payment events above for this route.

Payment record states are `ORDER_CREATING` → `ORDER_CREATED` → `CAPTURED` or `REFUND_REQUIRED`; a definite provider rejection is stored as retryable `ORDER_FAILED`, while an ambiguous timeout remains `ORDER_CREATING` for manual reconciliation. A failed payment attempt is recorded without confirming a booking; the guest may retry the same order while the hold remains valid. Booking confirmation uses `PAYMENT_PROCESSING` as a short-lived claim, promotes the existing listing hold only through an atomic no-overlap listing update, and finally changes the booking to `CONFIRMED` only while its hold is still valid. Booking confirmation, order creation, and webhook-event handling are idempotent. Checkout and verification are guest-scoped and require same-origin requests; verification attempts are bounded.

MongoDB transactions are not assumed or required. The workflow uses durable payment/event records plus compare-and-set updates and the existing atomic listing hold as a recoverable sequence. A periodic server worker rechecks captured payments whose booking confirmation is incomplete, so a process interruption or delayed webhook can be retried safely. If a captured payment arrives after its booking expired/cancelled, or the hold is missing/conflicted at confirmation, the booking and payment move to `REFUND_REQUIRED`; it is not confirmed, and dates are released where appropriate. Hosts see this status separately and it is excluded from gross booking value.

### Refund and operations limitations

Refund creation and confirmation are not automated. Staff must look up `providerOrderId`/payment IDs in Razorpay, establish whether payment was actually captured, initiate any appropriate refund in the provider dashboard under the business's separately defined policy, and mark/close reconciliation only after Razorpay confirms the refund. The application never presents a fake refund action or claims a refund succeeded. An ambiguous `ORDER_CREATING` record also requires manual provider reconciliation before retry/repair. Configure operational monitoring for `REFUND_REQUIRED`, stale `ORDER_CREATING`, and payment-webhook failures.

This is a sandbox-ready integration, **not a verified live or production payment launch**. Before launch, configure live account credentials and webhook, complete successful/failed/cancelled test-mode flows with the provider, and define support/refund and alerting procedures.

## Production

1. Provision MongoDB, Cloudinary, and Mapbox.
2. Set the required environment variables in the hosting platform; do not upload `.env`.
3. Configure `TRUST_PROXY` if the host terminates HTTPS at a trusted reverse proxy.
4. Set `NODE_ENV=production`.
5. Run `npm start`. The app validates its production configuration, connects to MongoDB, and only then listens on the provided `PORT`.
6. Use `/health` as the readiness check. It reports unavailable until Mongoose is connected.

Sessions are stored in MongoDB's `sessions` collection. Listing and profile images are stored in Cloudinary. The app handles `SIGINT` and `SIGTERM` by stopping the HTTP listener and closing database connections.

## Project structure

- `controllers/`, `routes/`, `models/`: the main MVC application
- `views/`: EJS pages and shared layout components
- `public/css/`, `public/js/`: styles and browser-side interactions
- `init/`: sample data and the guarded development seed script
- `utils/`: async/error and listing-image helpers
- `Classroom/`: separate learning exercises; not imported by or started with Wanderlust

## Security and operational notes

- Keep `.env` and service credentials out of source control.
- Never run the seed reset against a database containing production listings.
- Listing/profile uploads accept JPEG, PNG, and WebP with server-side size limits.
- Listing titles are rendered as text in map popups; the browser does not interpret them as popup HTML.
- The public host profile hides email addresses; account email is visible only on the signed-in user's own profile.
- Configure backups, service quotas, and alerts for the hosted database and media services.
- The app sends baseline content-type, framing, referrer, and permissions headers, suppresses the Express fingerprint, and sends HSTS only for secure production requests.
- All unsafe browser methods require a same-origin `Origin`/`Referer` and session CSRF token. Forms carry `_csrf`; same-origin JavaScript sends `X-CSRF-Token`. Multipart forms first pass the origin check and validate the parsed form token after Multer. The Razorpay webhook is excluded from browser CSRF checks and retains its raw-body signature validation.
- A nonce-based CSP allows the required Bootstrap/CDN, Mapbox, Google Fonts, Cloudinary/Unsplash images, and Razorpay origins. Inline scripts are nonce-authorized; inline style attributes are allowed for existing templates. `CSP_MODE` defaults to `report-only`; review violations in browser developer tools and test all relevant pages before setting it to `enforce`. No CSP report-collection endpoint is configured, and this source-level policy has not been verified in a live browser/deployment in this environment.
- IP-based rate limits default to 10 sign-in/sign-up attempts per 15 minutes, 10 booking creations per 15 minutes, 10 payment order requests per 15 minutes, 30 payment verification requests per 15 minutes, and 120 other unsafe requests per 15 minutes. All limits are configurable through the `RATE_LIMIT_*` variables. Requests behind a proxy are keyed by Express `req.ip`; set `TRUST_PROXY=true` only when exactly one trusted proxy is in front of the app, that proxy overwrites incoming forwarded headers, and direct access to the app is blocked. When TLS terminates at that proxy, this setting is also required for HTTPS origin checks, secure session cookies, and HSTS to recognize the original HTTPS request. These buckets are in memory and process-local; multi-instance deployments require a shared rate-limit store or equivalent edge limits.
