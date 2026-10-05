// Brand and UI colours (lib/palette.json) for places Tailwind classes can't reach: SVG charts and
// inline styles.
import palette from './palette.json';

export const BRAND = palette.brand;
export const UI = palette.ui;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');
// Brand blue / red at an opacity, for shading that sits on top of the page colour.
export const blueAlpha = (a) => `rgba(${rgb(BRAND.blue)}, ${a})`;
export const redAlpha = (a) => `rgba(${rgb(BRAND.red)}, ${a})`;
