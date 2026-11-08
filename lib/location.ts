import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface GeocodedAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}
/**
 * Reverse geocode latitude and longitude into structured address fields.
 * Uses OpenStreetMap Nominatim with clean fallback to expo-location.
 */
export async function reverseGeocodeCoords(
  latitude: number,
  longitude: number,
): Promise<GeocodedAddress | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    // 1. Try Nominatim reverse geocode (accurate road, block, city, postal code)
    const headers: Record<string, string> = {
      'Accept-Language': 'en',
    };
    if (Platform.OS !== 'web') {
      headers['User-Agent'] = 'GrabstyApp/1.0 (support@grabsty.com)';
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1&email=support@grabsty.com`,
      {
        signal: controller.signal,
        headers,
      },
    );

    if (res.ok) {
      const data = await res.json();
      const addr = data?.address ?? {};

      const road = String(addr.road || addr.street || addr.neighbourhood || addr.suburb || addr.residential || '');
      const houseNumber = String(addr.house_number || '');
      const rawBlock = String(addr.neighbourhood || addr.suburb || addr.city_district || '');
      const block = rawBlock === road ? '' : rawBlock;

      const line1Parts = [houseNumber, road, block].filter(Boolean);
      const firstDisplaySegment = typeof data?.display_name === 'string' ? data.display_name.split(',')[0] : '';
      const line1 = line1Parts.length > 0 ? line1Parts.join(', ') : firstDisplaySegment;

      const city = String(
        addr.city ||
        addr.town ||
        addr.municipality ||
        addr.village ||
        addr.county ||
        ''
      );

      const state = String(addr.state || addr.province || addr.region || '');
      const postal_code = String(addr.postcode || '');
      const country = addr.country ? String(addr.country) : '';

      const hasUsableFields = Boolean(
        line1.trim() ||
        city.trim() ||
        state.trim() ||
        postal_code.trim() ||
        country.trim()
      );

      if (hasUsableFields) {
        return {
          line1: line1.slice(0, 120),
          city: city.slice(0, 60),
          state: state.slice(0, 60),
          postal_code: postal_code.slice(0, 20),
          country: country.slice(0, 60),
        };
      }
    }
  } catch {
    // fallback below
  } finally {
    clearTimeout(timeoutId);
  }

  // 2. Fallback to expo-location geocoder
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results && results.length > 0) {
      const item = results[0];
      const streetParts = [item.streetNumber, item.street, item.district].filter(Boolean);
      return {
        line1: String(streetParts.join(' ').trim() || item.name || '').slice(0, 120),
        city: String(item.city || item.subregion || '').slice(0, 60),
        state: String(item.region || '').slice(0, 60),
        postal_code: String(item.postalCode || '').slice(0, 20),
        country: String(item.country || '').slice(0, 60),
      };
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Request device location and return reverse geocoded address.
 */
export async function getCurrentLocationAddress(): Promise<GeocodedAddress> {
  // Web navigator.geolocation fallback
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    const coords = await new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => reject(new Error(err.message || 'Location permission denied')),
        { timeout: 10000, enableHighAccuracy: true },
      );
    });

    const geocoded = await reverseGeocodeCoords(coords.latitude, coords.longitude);
    if (!geocoded) {
      throw new Error('Could not resolve street address from current location.');
    }
    return geocoded;
  }

  // Native expo-location
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied. Please allow location access to auto-fill your address.');
  }

  const NATIVE_TIMEOUT_MS = 10000;

  const nativeResult = await Promise.race([
    (async () => {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const geocoded = await reverseGeocodeCoords(pos.coords.latitude, pos.coords.longitude);
      if (!geocoded) {
        throw new Error('Could not resolve street address from current location.');
      }
      return geocoded;
    })(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Location request timed out. Please try again.')), NATIVE_TIMEOUT_MS),
    ),
  ]);

  return nativeResult;
}
