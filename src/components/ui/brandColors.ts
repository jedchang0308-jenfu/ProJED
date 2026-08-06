/**
 * ProJED 品牌藍的非 CSS 使用入口。
 * SVG attribute、color input 與持久化樣式需要實際 hex，色值必須與 index.css 同步。
 */
export const BRAND_BLUE = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  950: '#1e1b4b',
} as const;

const LEGACY_RELATIONSHIP_BLUE = new Set([
  '#0284c7',
  '#0ea5e9',
  '#38bdf8',
  '#bae6fd',
]);

export const normalizeLegacyBrandBlue = (color: string | undefined, fallback = BRAND_BLUE[500]) => {
  if (!color) return fallback;
  return LEGACY_RELATIONSHIP_BLUE.has(color.toLowerCase()) ? BRAND_BLUE[500] : color;
};
