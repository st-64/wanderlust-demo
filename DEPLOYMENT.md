# Wanderlust Deployment Guide

## Render staging setup

1. Create a Render Web Service from this repository.
2. Use Node `20.19.0` or newer.
3. Set `Build Command` to `npm ci`.
4. Set `Start Command` to `npm start`.
5. Set `Health Check Path` to `/health`.
6. Provision a dedicated staging MongoDB database. Do not point staging at production data.
7. Add the environment variables listed below in the Render Dashboard.

The repository also contains `render.yaml`, which can create a matching Blueprint. Secret values must be entered in Render and must never be committed.

## Required environment variables

| Variable           | Purpose                    | Staging value                                             |
| ------------------ | -------------------------- | --------------------------------------------------------- |
| `NODE_ENV`         | Production behavior        | `production`                                              |
| `PORT`             | Render-provided HTTP port  | Set by Render                                             |
| `MONGO_URL`        | MongoDB connection         | Staging MongoDB URI                                       |
| `SESSION_SECRET`   | Signed sessions            | Generate a private random value of at least 32 characters |
| `CLOUD_NAME`       | Cloudinary cloud           | Staging Cloudinary account                                |
| `CLOUD_API_KEY`    | Cloudinary API key         | Staging Cloudinary account                                |
| `CLOUD_API_SECRET` | Cloudinary API secret      | Staging Cloudinary account                                |
| `MAP_TOKEN`        | Mapbox geocoding/map token | Restricted staging token                                  |
| `TRUST_PROXY`      | Reverse proxy trust        | `1`                                                       |
| `CSP_MODE`         | CSP enforcement mode       | `report-only` for initial deployment                      |

## Optional variables

| Variable                        | Purpose                              | Staging value                   |
| ------------------------------- | ------------------------------------ | ------------------------------- |
| `CLOUDINARY_FOLDER`             | Upload namespace                     | `wanderlust_STAGING`            |
| `RAZORPAY_KEY_ID`               | Razorpay test or live key ID         | Leave empty to disable payments |
| `RAZORPAY_KEY_SECRET`           | Razorpay test or live key secret     | Leave empty to disable payments |
| `RAZORPAY_WEBHOOK_SECRET`       | Razorpay test or live webhook secret | Leave empty to disable payments |
| `SEED_OWNER_ID`                 | Destructive legacy seed only         | Usually leave empty             |
| `RATE_LIMIT_WINDOW_MS`          | Rate-limit window                    | `900000` or custom              |
| `RATE_LIMIT_AUTH_MAX`           | Authentication limit                 | `10`                            |
| `RATE_LIMIT_BOOKING_MAX`        | Booking limit                        | `10`                            |
| `RATE_LIMIT_PAYMENT_ORDER_MAX`  | Checkout limit                       | `10`                            |
| `RATE_LIMIT_PAYMENT_VERIFY_MAX` | Verification limit                   | `30`                            |
| `RATE_LIMIT_MUTATION_MAX`       | General mutation limit               | `120`                           |

## Portfolio demo and payments

For a public portfolio deployment, leave all three Razorpay variables empty unless a separately verified test-mode environment is desired. The application will start normally and display **Portfolio Demo Mode - Live Payments Disabled**.

Do not enable live credentials for the portfolio. Razorpay test credentials may be added only after HTTPS, MongoDB, booking, webhook, and expiry flows have been manually verified in staging.

## Staging deployment sequence

1. Create a staging MongoDB database and add `MONGO_URL`.
2. Add a private `SESSION_SECRET` of at least 32 characters.
3. Add staging Cloudinary credentials and a staging folder.
4. Add a Mapbox token restricted for the deployment domain.
5. Set `TRUST_PROXY=1` so Express recognizes HTTPS from Render.
6. Leave Razorpay variables empty for the first deployment.
7. Deploy and verify `/health` returns `{"status":"ok"}`.
8. Use `npm run db:indexes` from a controlled environment only after the database is reachable and only for the staging database.
9. Optionally run `npm run seed:safe`; it inserts demo listings only when the database has zero listings.

## Smoke checks

- [ ] Open the deployment over HTTPS.
- [ ] Confirm `/health` returns HTTP 200 and `status: ok`.
- [ ] Confirm HTTPS session cookies are secure and HTTP-only.
- [ ] Confirm logout and login work through HTTPS.
- [ ] Confirm listing search and listing detail pages render.
- [ ] Confirm Mapbox geocoding and map assets load.
- [ ] Upload a staging listing image to Cloudinary.
- [ ] Upload a staging profile image to Cloudinary.
- [ ] Check browser developer tools for CSP violations with report-only mode.
- [ ] Confirm the portfolio payments-disabled notice appears.
- [ ] Confirm payment initiation routes return a user-friendly 503 response when Razorpay is unset.
- [ ] Verify mobile and desktop layouts.

## Enabling CSP enforcement

After report-only smoke testing and browser developer-tool review:

1. Set `CSP_MODE=enforce`.
2. Redeploy.
3. Test listing pages, maps, uploads, authentication, booking, and the Razorpay checkout placeholder path.
4. Confirm Mapbox, Cloudinary, Bootstrap, Font Awesome, Google Fonts, and Razorpay origins are not blocked.
5. Roll back to `report-only` if a required origin is missing.

## Razorpay test-mode setup

Add all three Razorpay variables together, using test-mode credentials only:

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`

Configure the Razorpay webhook for `/payments/razorpay/webhook` on the public HTTPS staging domain. Subscribe to `payment.captured` and `payment.failed`, then test success, failure, duplicate delivery, expiry, and reconciliation before considering live credentials.
