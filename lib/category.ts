// Category colour helper, ported verbatim from legacy-vite-app/src/lib/seed.js.
// Known categories get a fixed hue; anything else hashes onto a fallback palette.

const CATEGORY_HUES: Record<string, string> = {
  'Entry Packages': '#B03A5B',
  'Health Drink': '#2A9D8F',
  'Organic Coffee': '#8A5632',
  'Organic Powder': '#5C8A2E',
  'Organic Rub': '#8B6BB5',
  Oils: '#C8662A',
  Liquid: '#C9960F',
};
const FALLBACK_HUES = ['#4F7CAC', '#6B7C93', '#9C6644', '#3F8F6A', '#A15C8C', '#7C8B2E'];

export function categoryHue(name: string | null | undefined): string {
  if (name != null && Object.hasOwn(CATEGORY_HUES, name)) return CATEGORY_HUES[name];
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[h % FALLBACK_HUES.length];
}
