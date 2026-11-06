function parseCoordinate(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidLatitude(value) {
  const number = parseCoordinate(value);
  return number != null && number >= -90 && number <= 90;
}

function isValidLongitude(value) {
  const number = parseCoordinate(value);
  return number != null && number >= -180 && number <= 180;
}

function validateCoordinates(latitude, longitude) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    const error = new Error("Latitude must be between -90 and 90 and longitude between -180 and 180");
    error.statusCode = 400;
    throw error;
  }
  return { lat, lng };
}

module.exports = { parseCoordinate, isValidLatitude, isValidLongitude, validateCoordinates };
