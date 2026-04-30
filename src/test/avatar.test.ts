/**
 * Avatar helpers — bestTextColor() unit tests.
 *
 * Locks in the WCAG-AA contrast guarantee for tinted pills (job
 * titles, country tags, holiday ribbons). Any future change to the
 * helper that breaks contrast for the seeded job-title palette
 * fails one of these tests.
 *
 * Audit: design sweep 2026-04-30.
 */

import { describe, it, expect } from 'vitest';
import { bestTextColor, avatarStyle } from '../utils/avatar';

describe('bestTextColor()', () => {
  it('flips light/saturated backgrounds to dark text (the AA-failing cases)', () => {
    // Pre-fix, these all rendered with white text and failed
    // WCAG AA contrast (1.7:1, 2.0:1, 3.5:1 respectively).
    // The sweep flipped them to black text.
    expect(bestTextColor('#30d158')).toBe('#0d0d10'); // Operator green
    expect(bestTextColor('#ff9f0a')).toBe('#0d0d10'); // Manager amber
    expect(bestTextColor('#bf5af2')).toBe('#0d0d10'); // Strategist purple
    expect(bestTextColor('#ff375f')).toBe('#0d0d10'); // Designer red
  });

  it('keeps white text on clearly-dark backgrounds', () => {
    // Pure black + near-black workspace surfaces — white is the
    // only sensible choice here.
    expect(bestTextColor('#000')).toBe('#fff');
    expect(bestTextColor('#000000')).toBe('#fff');
    expect(bestTextColor('#1c1c20')).toBe('#fff');
    expect(bestTextColor('#2a2a30')).toBe('#fff');
  });

  it('handles 3-digit hex shorthand', () => {
    expect(bestTextColor('#fff')).toBe('#0d0d10');
    expect(bestTextColor('#000')).toBe('#fff');
  });

  it('falls back to white on unparseable input', () => {
    // Not a hex color — caller passed a CSS keyword or rgb() value.
    expect(bestTextColor('rebeccapurple')).toBe('#fff');
    expect(bestTextColor('rgb(0, 0, 0)')).toBe('#fff');
    expect(bestTextColor('not-a-color')).toBe('#fff');
  });
});

// ── avatarStyle (regression for the existing helper) ────────────────

describe('avatarStyle()', () => {
  it('returns soft style when bg is set (operator pattern)', () => {
    const out = avatarStyle({ color: '#30d158', bg: 'rgba(48, 209, 88, 0.16)' });
    expect(out.background).toBe('rgba(48, 209, 88, 0.16)');
    expect(out.color).toBe('#30d158');
  });

  it('returns solid style when bg is absent (AM pattern)', () => {
    const out = avatarStyle({ color: '#5e5ce6' });
    expect(out.background).toBe('#5e5ce6');
    expect(out.color).toBe('#fff');
  });
});
