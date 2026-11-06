# Quick start

## 1. Backend

```bash
cd backend
npm install        # picks up the new `qrcode` dependency
# create a .env file (see example below)
npm start          # starts on port 5000
```

Example `backend/.env`:
```
PORT=5000
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=gas_app
# optional Africa's Talking creds for SMS OTP, otherwise OTP is logged to console
AFRICAS_TALKING_USERNAME=
AFRICAS_TALKING_API_KEY=
```

The server's `initDb` runs every start and adds the new `is_for_friend`,
`recipient_name`, `recipient_phone`, `delivery_address` columns automatically
if they don't exist yet. No manual migration needed.

## 2. Frontend

```bash
cd frontend
npm install        # picks up qrcode.react and html5-qrcode
npm run dev        # vite dev server
```

If your phone is on the same Wi-Fi and you want to test there, the existing
`src/lib/api.ts` already auto-detects LAN IPs.

## 3. What to try, in order

1. **Sign up a customer**, an OTP comes back, after verification you'll
   land on the new **Account created** welcome screen → **Set up my
   location** → dashboard.
2. **Sign up a seller** (open another browser / incognito), set location,
   payment methods, brands, prices. The dashboard now receives
   `newOrder` socket events from customers.
3. **Sign up a delivery guy** the same way.
4. As the customer, **search** for the seller you just registered (by city
   or area), pick them. Try the **For a friend** toggle and put in fake
   coordinates near the seller. Place the order.
5. As the seller, accept, then confirm payment — that triggers the receipt
   generation (with the new real PDFKit + QR PDF).
6. As the customer, hit **View receipt & QR** to see the QR.
7. As the seller, **assign a delivery guy** and **generate the seller-side
   delivery code**.
8. As the delivery guy, enter that code (existing flow) to unlock the
   customer location, then drive to deliver.
9. As the delivery guy, when "delivering", hit **Verify QR / code &
   release**. Scan or type the verify code from the customer's receipt.
10. Both apps should chime, customer order shows **completed**, and the
    PDF receipt is downloadable.

See `CHANGES.md` for everything I changed compared to the original ZIPs.
