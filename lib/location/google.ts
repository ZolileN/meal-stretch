/**
 * Google Places (New) fallback for LOC-2. Called only when shouldUseGoogle() says so and a key is set.
 * Uses session tokens so autocomplete + details bill as one session. fetch only (edge-compatible).
 */
import { coarsen, inSouthAfrica, type LatLng } from './geo';

export interface GooglePrediction {
  placeId: string;
  name: string;
  secondary: string | null;
}

export async function googleAutocomplete(apiKey: string, input: string, sessionToken: string, bias?: LatLng): Promise<GooglePrediction[]> {
  const body: Record<string, unknown> = { input, sessionToken, includedRegionCodes: ['za'], languageCode: 'en' };
  if (bias) body.locationBias = { circle: { center: { latitude: bias.lat, longitude: bias.lng }, radius: 50000 } };
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': apiKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } } } }[];
  };
  return (json.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .slice(0, 5)
    .map((p) => ({ placeId: p.placeId, name: p.structuredFormat?.mainText?.text ?? '', secondary: p.structuredFormat?.secondaryText?.text ?? null }));
}

export async function googlePlaceDetails(apiKey: string, placeId: string, sessionToken: string): Promise<(LatLng & { label: string }) | null> {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const res = await fetch(url, { headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'location,displayName' } });
  if (!res.ok) return null;
  const j = (await res.json()) as { location?: { latitude: number; longitude: number }; displayName?: { text: string } };
  if (!j.location) return null;
  const p = coarsen({ lat: j.location.latitude, lng: j.location.longitude });
  if (!inSouthAfrica(p)) return null;
  return { ...p, label: j.displayName?.text ?? '' };
}
