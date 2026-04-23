import type { Member } from '../types/flizow';

/**
 * Two separate rosters that back the demo data:
 *
 *   AMs        — the five Account Managers who own client relationships.
 *                Inferred by the mockup from the AM column on each client
 *                row; listed here explicitly so we don't need DOM scraping.
 *
 *   OPS_TEAM   — the operators who actually do the work (SEO, web, paid,
 *                ops). Shared across pages that delegate work.
 *
 * Both rosters share the Member shape — the only difference is `type`.
 */

export const DEMO_AMS: Member[] = [
  { id: 'nt', initials: 'NT', name: 'Nikko Trinidad', role: 'Account Manager', color: '#5e5ce6', type: 'am' },
  { id: 'kc', initials: 'KC', name: 'Kate Chen',      role: 'Account Manager', color: '#ff375f', type: 'am' },
  { id: 'ma', initials: 'MA', name: 'Marcus Aldrin',  role: 'Account Manager', color: '#ff9f0a', type: 'am' },
  { id: 'dr', initials: 'DR', name: 'Diana Reyes',    role: 'Account Manager', color: '#30d158', type: 'am' },
  { id: 'jp', initials: 'JP', name: 'Jordan Park',    role: 'Account Manager', color: '#64d2ff', type: 'am' },
];

export const OPS_TEAM: Member[] = [
  { id: 'rc', initials: 'RC', name: 'Roxy Calinga',     role: 'Operations Manager',          color: '#4f46e5', bg: '#e0e7ff', type: 'operator' },
  { id: 'cc', initials: 'CC', name: 'Chris Castellano', role: 'Senior Growth & SEO Manager', color: '#d97706', bg: '#fef3c7', type: 'operator' },
  { id: 'kl', initials: 'KL', name: 'Kate Lawrence',    role: 'Account Manager',             color: '#db2777', bg: '#fce7f3', type: 'operator' },
  { id: 'hs', initials: 'HS', name: 'Harvey San Juan',  role: 'Web Designer',                color: '#059669', bg: '#d1fae5', type: 'operator' },
  { id: 'mp', initials: 'MP', name: 'Michael Potts',    role: 'Paid Social Manager',         color: '#7c3aed', bg: '#ede9fe', type: 'operator' },
];
