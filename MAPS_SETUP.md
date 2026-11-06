# Maps setup (Google Maps with an Uber-style look)

The customer dashboard, delivery tracking, and seller views now use real
**Google Maps** via `@vis.gl/react-google-maps`, styled to feel like Uber's
pickup map (clean light surface, muted POIs, white roads, soft greys).

## 1. Get a Google Maps API key

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a project if you don't have one.
3. **Enable billing** on the project. Google gives you $200/month free credit
   (~28k map loads) but won't let any maps load without a billing account
   attached. You will *not* be charged until you exceed the free credit —
   the credit card is just verification.
4. **APIs & Services → Library** — enable these APIs:
   - **Maps JavaScript API** (required)
   - **Geocoding API** (optional, only if you later add address search)
5. **Credentials → Create credentials → API key.**
6. Click the new key to edit it — set restrictions:
   - **Application restrictions:** "HTTP referrers (web sites)" — add
     `http://localhost:8080/*`, your LAN IP `http://192.168.x.x:8080/*`,
     and your production domain.
   - **API restrictions:** "Restrict key" → check **Maps JavaScript API**.
   - Save.

## 2. Plug it into the project

Edit `frontend/.env`:

```
VITE_API_URL=http://192.168.100.8:5000
VITE_GOOGLE_MAPS_API_KEY=AIza...your_key_here
```

Restart `npm run dev`. The map components pick up the key automatically.

> The key is baked into the build, so when you rebuild for the APK or for
> production, run the build with the env file present.

## 3. What happens if you don't set the key

The map components don't crash — they render a friendly placeholder telling
you to set the key. The rest of the app (seller list, order flow, receipts,
delivery code) keeps working without the map.

## Where the Uber styling lives

The map style is in `frontend/src/lib/uberMapStyle.ts`. It's a plain JSON
Google Maps style object, applied via `<Map styles={UBER_LIGHT_STYLE}>` in
both `NearbySuppliersMap` and `DeliveryTrackingMap`. To experiment:

- Pale grey background → tweak the first `geometry` styler (`#f5f5f5`).
- White roads → tweak `road > geometry` (`#ffffff`).
- Pale-blue water → tweak `water > geometry` (`#c9d6e6`).
- Want dark mode (Uber Eats look)? Replace with a dark style JSON from
  [snazzymaps.com](https://snazzymaps.com/) or
  [mapstyle.withgoogle.com](https://mapstyle.withgoogle.com/), keep the same
  shape, swap the export.

For production you can also create a **cloud-styled map** in the Google
Cloud Console (Maps → Styles → Create Style) and reference it by `mapId`
instead of the JSON. The components currently use `mapId="DEMO_MAP_ID"`
which is required for AdvancedMarkers to render — replace with your own ID
for fully custom styling.

## Why Google Maps and not Leaflet anymore

The previous code used Leaflet with OpenStreetMap tiles. It was free and
worked offline-ish, but the styling can't easily match the Uber aesthetic
and the tile servers have request-rate limits that fail on production
traffic. Google Maps:

- Renders the same look Uber/Lyft/DoorDash use (because they all use it).
- Has built-in vector tiles, smoother zoom, traffic data, etc.
- Costs money past 28k loads/month — budget accordingly.

## Considering Mapbox instead?

Mapbox GL JS has similar quality, a 50k-load free tier with no credit card
required to start, and is what some Uber-like apps use. If you ever want
to switch, the two map components in `src/components/` are isolated enough
that swapping the underlying library only touches those two files.
