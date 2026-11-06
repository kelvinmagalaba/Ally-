# Changes I made to your project

This document describes every file I added or modified compared to the original
ZIPs you uploaded. Anything not listed here is unchanged.

## Backend changes

### 1. New DB columns on `orders` (migration)
**File:** `backend/config/initDb.js`

Added four columns to `orders` for the "for a friend" flow:

| Column | Type | Purpose |
| --- | --- | --- |
| `is_for_friend` | `TINYINT(1) NOT NULL DEFAULT 0` | True when the customer placed the order on behalf of someone else |
| `recipient_name` | `VARCHAR(255) NULL` | Friend's name (shown to seller and driver) |
| `recipient_phone` | `VARCHAR(64) NULL` | Friend's phone (driver can call) |
| `delivery_address` | `VARCHAR(512) NULL` | Free-text drop-off note (optional, in addition to lat/lng) |

These run through the existing `addOrderColumnIfMissing` helper, so older
databases get auto-migrated on next server start. The actual delivery
coordinates still live in `customer_lat` / `customer_lng` (the customer can
set them to a friend's location at order-time without touching their own
profile).

### 2. `createOrder` now accepts the friend fields
**File:** `backend/controllers/orderController.js`

`POST /api/orders` now accepts `is_for_friend`, `recipient_name`,
`recipient_phone`, `delivery_address` alongside the existing fields. It also
emits a new `newOrder` socket event to the seller (in addition to
`orderStatusUpdate`) so the seller dashboard can pop a "new order" toast/bell.

### 3. New endpoint: driver verifies the receipt at the customer's door
**File:** `backend/controllers/orderController.js`,
`backend/routes/orderRoutes.js`

`POST /api/orders/verify-receipt-code` — the driver scans the QR (or types
the verify code) at the customer's door. The server:

1. Loads the order's `receipt_json` and pulls out `delivery_verification_code`
   (the secret that was generated when the seller confirmed payment).
2. Accepts either the raw 8-char code, the receipt code, **or** a pasted
   JSON QR payload.
3. If it matches, marks the order `completed` in the DB.
4. Rings `deliveryArrived` and `deliveryConfirmed` on the customer, seller
   **and** driver sockets, plus the `order_<id>` room — that's the "bell on
   both apps" piece.

Request body:
```json
{ "order_id": 123, "driver_user_id": 7, "code": "A4F2X9..." }
```

### 4. Real receipt PDF (replaces the previous mock)
**File:** `backend/utils/orderReceiptPdf.js`

The previous file returned a fake `Buffer.from("Mock PDF content for order …")`,
so the existing `GET /api/receipts/:id/pdf` endpoint would just download that
text. I rewrote it to use:

- **`pdfkit`** (already in your dependencies) — renders a real A5 receipt with
  the customer / friend block / seller / order summary.
- **`qrcode`** (added — see below) — generates a PNG of the JSON QR payload
  and embeds it in the PDF, alongside the typed verify code.

Both of the call signatures the codebase uses (`(orderId, callback)` and
`(orderRow, customer, supplier, receiptCode) → Promise<Buffer>`) still work.

### 5. Added `qrcode` dependency
**File:** `backend/package.json`

```diff
+    "qrcode": "^1.5.4",
```

After downloading, run `npm install` inside `backend/` to fetch it.

## Frontend changes

### 6. Post-signup welcome page (new)
**File:** `frontend/src/pages/AccountCreatedPage.tsx` (new)

Role-aware welcome screen, shown right after a successful first-time OTP
verification. Each role gets a tailored title, blurb, "what you can do next"
checklist, and a single CTA button:

| Role | Routes to |
| --- | --- |
| `customer` | `location` |
| `supplier` | `location` (then existing `payment-method` → `brand-select` flow) |
| `driver` / `delivery_guy` | `location` (then `driver-dashboard`) |
| `admin` | `admin-dashboard` |

### 7. Router registration
**File:** `frontend/src/pages/Index.tsx`

Added the `'account-created'` route to the page map.

### 8. OTP page now sends new users to the welcome screen
**File:** `frontend/src/pages/OTPVerificationPage.tsx`

Detects "freshly signed up" by looking at the mapped user — no `city` and no
`latitude` means new account → `account-created`. Returning users go straight
to their dashboard (unchanged). Sellers with `needsBrandSelection: true`
also flow through `account-created`.

### 9. Customer dashboard — search bar, friend-order toggle, receipt button
**File:** `frontend/src/pages/CustomerDashboard.tsx`

Three concrete additions:

**(a) Free-text seller search**
A new search input above the seller list filters by name / city / area /
country / brand. The map below the search shows only matching sellers, and
the count of matches is displayed.

**(b) "For me" / "For a friend" toggle on the order form**
When you tap a seller and the order form opens, you now choose whether the
order is for yourself (delivery uses device GPS) or for a friend (extra
fields appear: name, phone, optional address, optional lat/lng coordinates).
If you skip the friend coordinates we fall back to your current device GPS.

The order POST now sends `is_for_friend`, `recipient_name`,
`recipient_phone`, `delivery_address` along with the chosen drop-off
`customer_lat` / `customer_lng`.

**(c) "View receipt & QR" button on paid orders**
Once an order's status is `paid` / `driver_assigned` / `picking_up` /
`delivering` / `completed`, a new blue button opens the receipt panel.

**(d) Audible bell on delivery arrival / confirmation**
The `deliveryArrived` listener now plays the same audio bell the seller
side uses (`playSellerBell`), and a new `deliveryConfirmed` listener plays
a shorter chime when the driver releases the cylinder, plus refreshes the
order list.

### 10. New component — Receipt + QR display
**File:** `frontend/src/components/ReceiptQrPanel.tsx` (new)

Bottom-sheet modal that loads `GET /api/orders/:id` and renders:

- Item, amount, payment phone, friend block (if any)
- Receipt code
- A scannable QR (using `qrcode.react`) encoding the JSON payload that the
  driver app posts to `/api/orders/verify-receipt-code`
- The typed verify code in big mono spaced letters with a "Copy" button
- A green "Delivery completed" banner when the order is done
- A "Download PDF receipt" link

### 11. New component — Driver door-verification panel
**File:** `frontend/src/components/DeliveryDoorVerifyPanel.tsx` (new)

When the driver hits "Verify QR / code & release" on a delivering order,
this opens. The driver picks one of two modes:

- **Type code** — manual text input (same big mono UX). On submit it POSTs
  `{ order_id, driver_user_id, code }` to `/api/orders/verify-receipt-code`.
- **Scan QR** — opens the device camera via `html5-qrcode` (lazy-loaded so
  it doesn't bloat the bundle). Decodes any QR, extracts the verify code,
  and submits the same way.

On success it shows a green "Cylinder released" confirmation; the bell
chimes on the customer's app come automatically because the backend emitted
`deliveryArrived` + `deliveryConfirmed` sockets.

### 12. Driver dashboard — replaced "Mark completed" with QR/code verification
**File:** `frontend/src/pages/DriverDashboard.tsx`

The `Mark completed` button on a delivering order is now `Verify QR / code
& release` — it opens `DeliveryDoorVerifyPanel`. The old endpoint
(`POST /api/orders/:id/complete`) is still wired up if you ever need it, but
the canonical path is now via the receipt-code verification.

Driver dashboard also now listens for `deliveryConfirmed` and rings the bell
on its own side so the driver hears the chime alongside the customer.

### 13. New frontend dependencies
**File:** `frontend/package.json`

```diff
+    "html5-qrcode": "^2.3.8",
+    "qrcode.react": "^4.1.0",
```

After downloading, run `npm install` inside `frontend/`.

## End-to-end flow this enables

1. **Sign up.** OTP verifies → `AccountCreatedPage` welcomes them with a
   role-specific blurb → onward to location setup.
2. **Customer.** Opens dashboard, sees nearby sellers on the map, can
   *search* by city / area / brand. Picks a seller, chooses **For me** or
   **For a friend**, fills brand / size / price (already existing seller
   catalog), places order. If "for a friend", supplies the friend's name,
   phone, optional address, and optional coordinates (otherwise we use the
   customer's GPS as the drop-off).
3. **Seller** receives a `newOrder` socket event, accepts, confirms payment.
   The transactionController generates the receipt with QR JSON payload and
   the verify code (already existing in your code).
4. **Customer** sees the **View receipt & QR** button on the order, opens
   the panel, sees the QR + verify code.
5. **Seller** generates a delivery access code (existing feature) for the
   delivery guy at pickup.
6. **Delivery guy** scans/enters that code at the seller (existing feature)
   to unlock the customer's location, drives to the drop-off.
7. **Delivery guy** reaches the customer, hits **Verify QR / code &
   release**, scans the customer's QR (or types the verify code).
8. Backend matches it against `receipt_json`, marks the order `completed`,
   rings `deliveryArrived` / `deliveryConfirmed` bells on **all three apps**
   (customer, seller, driver). The driver UI shows "Cylinder released",
   the customer UI shows the green "Delivery completed" banner, and the
   PDF receipt is downloadable from either side.

## Things I did **not** change

- No changes to seller / supplier side beyond what they get for free
  (the new `newOrder` socket event, the new friend fields surfacing in
  `getOrderById`, and the existing access-code → customer-location flow,
  which already worked).
- No changes to admin dashboard.
- No changes to OTP, login, transaction submission, or chat.
- I did not run `npm install` or build either side. The dependency files
  list the new packages; you'll need to run `npm install` once before
  starting each side.
