/**
 * New design system (light mode). Scoped deliberately: only screens that have
 * gone through the redesign pass import from here. Everything else keeps
 * using `src/constants/index.ts` unchanged until their own pass, so this file
 * can evolve without visually touching un-redesigned screens.
 */
import type { GlucoseStatus } from '@/types';

export const THEME_COLORS = {
  primary:           '#0C8F6B',
  primaryPressed:    '#0A7358',
  primaryTint:       '#E3F3ED',
  primaryTintStrong: '#CDEBDF',

  background:        '#F5F7F6',
  surface:           '#FFFFFF',
  surfaceElevated:   '#FFFFFF',

  textPrimary:       '#14171A',
  textSecondary:     '#62696E',
  textTertiary:      '#9AA0A6',
  textInverse:       '#FFFFFF',

  border:            '#E4E8E7',
  borderStrong:      '#D2D8D6',

  normal:            '#0E9F63',
  normalBg:          '#E4F6EC',
  normalText:        '#0A6B44',

  low:               '#C98A00',
  lowBg:             '#FCF0D6',
  lowText:           '#7A5300',

  elevated:          '#D2691A',
  elevatedBg:        '#FBE9DA',
  elevatedText:      '#8A4712',

  high:              '#D92B1D',
  highBg:            '#FCE1DE',
  highText:          '#8E1D14',

  critical:          '#A31E1E',
  criticalText:      '#FFFFFF',

  danger:            '#D92B1D',
  dangerBg:          '#FCE1DE',
  warning:           '#D2691A',
  success:           '#0E9F63',
};

export const THEME_STATUS_COLORS: Record<GlucoseStatus, string> = {
  low: THEME_COLORS.low, normal: THEME_COLORS.normal,
  elevated: THEME_COLORS.elevated, high: THEME_COLORS.high, critical: THEME_COLORS.critical,
};
export const THEME_STATUS_BG_COLORS: Record<GlucoseStatus, string> = {
  low: THEME_COLORS.lowBg, normal: THEME_COLORS.normalBg,
  elevated: THEME_COLORS.elevatedBg, high: THEME_COLORS.highBg, critical: THEME_COLORS.critical,
};
export const THEME_STATUS_TEXT_COLORS: Record<GlucoseStatus, string> = {
  low: THEME_COLORS.lowText, normal: THEME_COLORS.normalText,
  elevated: THEME_COLORS.elevatedText, high: THEME_COLORS.highText, critical: THEME_COLORS.criticalText,
};

export const TYPE = {
  // caption3 vs caption2: same size, deliberately different weight/role —
  // caption3 is plain small meta/unit text; caption2 is a bold tracked eyebrow/label.
  // Keep them distinct named tokens rather than "caption2 + override" at each call site.
  caption3:    { fontSize: 11, fontWeight: '400' as const },
  caption2:    { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6 },
  caption1:    { fontSize: 12, fontWeight: '500' as const },
  footnote:    { fontSize: 13, fontWeight: '500' as const },
  subheadline: { fontSize: 14, fontWeight: '400' as const },
  callout:     { fontSize: 15, fontWeight: '500' as const },
  body:        { fontSize: 16, fontWeight: '400' as const },
  headline:    { fontSize: 17, fontWeight: '600' as const },
  title3:      { fontSize: 20, fontWeight: '700' as const },
  title2:      { fontSize: 22, fontWeight: '700' as const },
  title1:      { fontSize: 28, fontWeight: '700' as const },
  // display: reserved for exactly one role in the whole app — the onboarding
  // welcome headline, the single largest piece of text a user ever sees.
  display:     { fontSize: 32, fontWeight: '700' as const },
  numericLarge:{ fontSize: 32, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
  numericHero: { fontSize: 56, fontWeight: '700' as const, fontVariant: ['tabular-nums'] as ('tabular-nums')[] },
};

// maxFontSizeMultiplier for the two numeric tokens — everything else scales uncapped.
export const HERO_FONT_SCALE_CAP = 1.15;
export const TAB_LABEL_FONT_SCALE_CAP = 1.1;

export const SPACE = { space1: 4, space2: 8, space3: 12, space4: 16, space5: 20, space6: 24, space7: 32 };
export const SCREEN_PADDING = SPACE.space5;
export const SECTION_GAP = SPACE.space6;

export const THEME_RADIUS = { sm: 10, md: 14, lg: 18, xl: 22, sheet: 24, pill: 999 };

export const THEME_SHADOW = {
  raised: {
    shadowColor: '#0A0A0A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12,
    elevation: 4,
  },
  modal: {
    shadowColor: '#0A0A0A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24,
    elevation: 8,
  },
};
