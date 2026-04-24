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
