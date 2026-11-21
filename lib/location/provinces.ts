/** South African provinces as stored in branches.province / price_observations.province (OSM ISO 3166-2 suffix). */
export const PROVINCES = [
  { code: 'EC', name: 'Eastern Cape' },
  { code: 'FS', name: 'Free State' },
  { code: 'GP', name: 'Gauteng' },
  { code: 'KZN', name: 'KwaZulu-Natal' },
  { code: 'LP', name: 'Limpopo' },
  { code: 'MP', name: 'Mpumalanga' },
  { code: 'NC', name: 'Northern Cape' },
  { code: 'NW', name: 'North West' },
  { code: 'WC', name: 'Western Cape' },
] as const;
export type ProvinceCode = (typeof PROVINCES)[number]['code'];
export const PROVINCE_CODES = PROVINCES.map((p) => p.code) as [ProvinceCode, ...ProvinceCode[]];
export const isProvince = (v: unknown): v is ProvinceCode => typeof v === 'string' && (PROVINCE_CODES as string[]).includes(v);
/** "national" or a province code from a form/CLI value; anything else → undefined (invalid). */
export function parseScope(v: unknown): ProvinceCode | null | undefined {
  if (v === null || v === undefined || v === '' || v === 'national') return null;
  const up = String(v).trim().toUpperCase();
  return isProvince(up) ? up : undefined;
}
