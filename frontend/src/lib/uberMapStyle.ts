/**
 * Uber-inspired Google Maps style.
 *
 * Clean, light surface with soft greys, hidden POI clutter, and roads
 * that stand out without being loud. Compare with Uber's pickup screen —
 * same family of greys, same "fade everything except the streets that
 * matter" approach.
 *
 * Apply via the Map `styles` prop (legacy JSON styles). If you migrate to
 * cloud-based map IDs later, replace this with `mapId="YOUR_MAP_ID"`.
 */
const UBER_LIGHT_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f5f5f5' }] },

  // Hide noisy POIs; keep parks/airports subtle
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e9efe7' }, { visibility: 'on' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },

  // Roads — the Uber signature: pale background, white surface, subtle dividers
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }],
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },

  // Transit muted
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // Water — Uber's pale blue
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#c9d6e6' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }],
  },

  // Admin and country lines
  {
    featureType: 'administrative',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#e0e0e0' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }],
  },
];

export default UBER_LIGHT_STYLE;
