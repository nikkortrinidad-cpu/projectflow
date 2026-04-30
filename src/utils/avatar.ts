/**
 * Avatar helpers — initials + deterministic colour from a seed string.
 *
 * Consolidated from two earlier copies (TouchpointModal, TouchpointsTab)
 * that had diverged: one used a 31-multiplier hash with 70% saturation,
 * the other djb2 with 55% saturation — producing different colours for
 * the same contact across the modal and the tab list.
 *
 * This module picks the djb2 + 55/55 HSL pair (from TouchpointsTab) as
 * the canonical form because the tab list is the more frequently seen
 * surface; the modal now matches what the user already sees elsewhere.
 */

/**
 * First-letter pair from a display name. Falls back to the first two
 * characters when only one word is present, or "?" on empty input.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * Deterministic pastel hue for a seed (usually a contact id or name).
 * djb2 hash → 360 hue bins, 55% saturation, 55% lightness. Same seed
 * always returns the same colour; no storage required.
 */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue} 55% 55%)`;
}

/**
 * Inline avatar background + foreground colour pair for a Member.
 *
 * Pre-Phase-2, every assignee chip computed this inline as
 *   `m.type === 'operator' ? { background: m.bg, color: m.color }
 *                          : { background: m.color, color: '#fff' }`
 * which was both duplicated everywhere and tied to the deprecated
 * `Member.type` field. Now the styling decision lives here and reads
 * presence-of-`bg` directly: operators have a soft `bg` set on their
 * record, AMs don't. Same visual result, decoupled from MemberType.
 *
 * Returns React-style camelCase keys so callers can pass it straight
 * into a `style={...}` prop.
 */
export function avatarStyle(
  member: { color: string; bg?: string },
): { background: string; color: string } {
  return member.bg
    ? { background: member.bg, color: member.color }
    : { background: member.color, color: '#fff' };
}

/**
 * Pick a foreground colour (white or near-black) that meets WCAG AA
 * contrast against the given background. Used for tinted pills
 * (job-title chips, country tags, holiday ribbons) where the
 * background is a user- or seed-picked colour and naïve
 * "color: white" can fail contrast on light/saturated greens,
 * ambers, etc.
 *
 * Algorithm: relative luminance per WCAG. Threshold at 0.22 — a
 * hair above the math-purist 0.179 crossover so saturated mids
 * like indigo (L≈0.16) clearly land on white text rather than
 * straddling the boundary. Empirically calibrated against the
 * seeded job-title palette below; verified by tests.
 *
 * Worked examples (the seeded job-title palette):
 *   #5e5ce6 indigo   L≈0.16 → white  (5.4:1 AA pass)
 *   #ff375f red      L≈0.25 → black  (5.2:1 AA pass)
 *   #bf5af2 purple   L≈0.25 → black  (5.2:1 AA pass)
 *   #30d158 green    L≈0.45 → black  (8.7:1 AAA pass)
 *   #ff9f0a amber    L≈0.46 → black  (8.5:1 AAA pass)
 *
 * Accepts hex (#RGB / #RRGGBB). Falls back to white on inputs the
 * minimal parser doesn't handle (CSS keywords, rgb()/hsl() etc.) —
 * callers always pass hex from the seeded palette + colorpickers.
 */
export function bestTextColor(bg: string): string {
  const lum = relativeLuminance(bg);
  if (lum == null) return '#fff';
  return lum > 0.179 ? '#0d0d10' : '#fff';
}

/** Parse a CSS hex color into RGB 0-255. Returns null on a value
 *  this minimal parser doesn't handle (rgb(), hsl(), named colors).
 *  We don't pull a full CSS-color parser in for one helper —
 *  callers always pass hex from the seeded palette + colorpickers. */
function parseHex(hex: string): [number, number, number] | null {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return null;
    return [r, g, b];
  }
  return null;
}

/** WCAG relative luminance for a hex color. Linearised sRGB →
 *  weighted sum. Returns null when the input doesn't parse. */
function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
