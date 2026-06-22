/** Barrel da camada de UI: componentes do design system @grosify/ui + primitivas locais. */
export * from '@grosify/ui';
export { Icon, type IconName, type IconProps } from './icon.js';
export {
  ThemeProvider,
  useTheme,
  DIRECTIONS,
  type Mode,
  type Direction,
} from './theme-provider.js';
export { SectionTitle } from './section-title.js';
export { Empty } from './empty.js';
export { Sparkline } from './sparkline.js';
export { useMoneyParts } from './money-parts.js';
