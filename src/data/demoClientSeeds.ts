import type { ClientStatus } from '../types/flizow';

/**
 * Seed data for the 50 demo clients the mockup shows. Lifted from the
 * hardcoded `<a class="client-row">` rows in public/flizow-test.html
 * (~line 13593–13852) and restructured as data so we don't need DOM
 * scraping at runtime.
 *
 * Fields:
 *   id          — URL slug, matches `data-client-id` on the HTML row
 *   name        — display name (supports ampersands; no HTML entities)
 *   industry    — "Category · Specific" string the Clients grid shows
 *   initials    — two letters for the logo tile
 *   logoClass   — colour token on the logo tile (logo-indigo etc.)
 *   status      — health tier; drives the status dot and filtering
 *   amInits     — two-letter AM id (uppercase). Matches an entry in DEMO_AMS.
 */
export interface ClientSeed {
  id: string;
  name: string;
  industry: string;
  initials: string;
  logoClass: string;
  status: ClientStatus;
  amInits: string;
}

export const CLIENT_SEEDS: ClientSeed[] = [
  { id: 'acme-corp',           name: 'Acme Corporation',      industry: 'Technology · B2B SaaS',     initials: 'AC', logoClass: 'logo-indigo', status: 'fire',    amInits: 'NT' },
  { id: 'bloom-retail',        name: 'Bloom Retail',          industry: 'E-commerce · Fashion',      initials: 'BR', logoClass: 'logo-pink',   status: 'risk',    amInits: 'KC' },
  { id: 'techstart-inc',       name: 'TechStart Inc.',        industry: 'SaaS · Developer tools',    initials: 'TS', logoClass: 'logo-teal',   status: 'risk',    amInits: 'MA' },
  { id: 'harvest-co',          name: 'Harvest & Co.',         industry: 'Agriculture · D2C',         initials: 'HC', logoClass: 'logo-green',  status: 'onboard', amInits: 'NT' },
  { id: 'northwind-labs',      name: 'Northwind Labs',        industry: 'Biotech · Research',        initials: 'NL', logoClass: 'logo-sky',    status: 'track',   amInits: 'KC' },
  { id: 'summit-outdoor',      name: 'Summit Outdoor',        industry: 'Retail · Outdoor apparel',  initials: 'SO', logoClass: 'logo-orange', status: 'track',   amInits: 'MA' },
  { id: 'cascade-coffee',      name: 'Cascade Coffee',        industry: 'F&B · DTC roaster',         initials: 'CC', logoClass: 'logo-amber',  status: 'track',   amInits: 'KC' },
  { id: 'meridian-health',     name: 'Meridian Health',       industry: 'Healthcare · Clinics',      initials: 'MH', logoClass: 'logo-slate',  status: 'paused',  amInits: 'MA' },
  { id: 'vertex-finance',      name: 'Vertex Finance',        industry: 'FinTech · Investments',     initials: 'VF', logoClass: 'logo-purple', status: 'fire',    amInits: 'JP' },
  { id: 'cobalt-auto',         name: 'Cobalt Auto',           industry: 'Automotive · Dealers',      initials: 'CO', logoClass: 'logo-sky',    status: 'fire',    amInits: 'MA' },
  { id: 'orbit-esports',       name: 'Orbit Esports',         industry: 'Media · Gaming',            initials: 'OE', logoClass: 'logo-pink',   status: 'fire',    amInits: 'KC' },
  { id: 'northshore-legal',    name: 'Northshore Legal',      industry: 'Legal · Boutique firm',     initials: 'NL', logoClass: 'logo-slate',  status: 'risk',    amInits: 'DR' },
  { id: 'pulse-cardio',        name: 'Pulse Cardio',          industry: 'Healthcare · Devices',      initials: 'PL', logoClass: 'logo-teal',   status: 'risk',    amInits: 'NT' },
  { id: 'driftwood-spa',       name: 'Driftwood Spa',         industry: 'Hospitality · Wellness',    initials: 'DS', logoClass: 'logo-amber',  status: 'risk',    amInits: 'MA' },
  { id: 'skyline-realty',      name: 'Skyline Realty',        industry: 'Real Estate · Luxury',      initials: 'SR', logoClass: 'logo-indigo', status: 'risk',    amInits: 'JP' },
  { id: 'riverbank-law',       name: 'Riverbank Law',         industry: 'Legal · Family',            initials: 'RL', logoClass: 'logo-slate',  status: 'onboard', amInits: 'DR' },
  { id: 'thistle-florals',     name: 'Thistle Florals',       industry: 'Retail · Floral D2C',       initials: 'TF', logoClass: 'logo-pink',   status: 'onboard', amInits: 'KC' },
  { id: 'atlas-edtech',        name: 'Atlas EdTech',          industry: 'EdTech · K–12',             initials: 'AE', logoClass: 'logo-sky',    status: 'onboard', amInits: 'JP' },
  { id: 'polaris-aero',        name: 'Polaris Aero',          industry: 'Aerospace · Parts',         initials: 'PA', logoClass: 'logo-indigo', status: 'onboard', amInits: 'NT' },
  { id: 'glasslake-dental',    name: 'Glasslake Dental',      industry: 'Healthcare · Dental',       initials: 'GD', logoClass: 'logo-sky',    status: 'track',   amInits: 'DR' },
  { id: 'silvercrest-hvac',    name: 'Silvercrest HVAC',      industry: 'Services · HVAC',           initials: 'SH', logoClass: 'logo-slate',  status: 'track',   amInits: 'MA' },
  { id: 'mapleton-schools',    name: 'Mapleton Schools',      industry: 'Education · Private K–12',  initials: 'MS', logoClass: 'logo-teal',   status: 'track',   amInits: 'DR' },
  { id: 'pinegrove-cpa',       name: 'Pinegrove CPA',         industry: 'Finance · Accounting',      initials: 'PG', logoClass: 'logo-amber',  status: 'track',   amInits: 'JP' },
  { id: 'ember-bakery',        name: 'Ember Bakery',          industry: 'F&B · Local chain',         initials: 'EB', logoClass: 'logo-orange', status: 'track',   amInits: 'KC' },
  { id: 'quantum-biolabs',     name: 'Quantum Biolabs',       industry: 'Biotech · Research',        initials: 'QB', logoClass: 'logo-purple', status: 'track',   amInits: 'NT' },
  { id: 'harborline-fleet',    name: 'Harborline Fleet',      industry: 'Logistics · Fleet mgmt',    initials: 'HF', logoClass: 'logo-sky',    status: 'track',   amInits: 'MA' },
  { id: 'coralwave-surf',      name: 'Coralwave Surf',        industry: 'Retail · Surf gear',        initials: 'CS', logoClass: 'logo-teal',   status: 'track',   amInits: 'KC' },
  { id: 'nimbus-design',       name: 'Nimbus Design',         industry: 'Professional · Agency',     initials: 'ND', logoClass: 'logo-indigo', status: 'track',   amInits: 'DR' },
  { id: 'copperline-tools',    name: 'Copperline Tools',      industry: 'Manufacturing · Tools',     initials: 'CT', logoClass: 'logo-amber',  status: 'track',   amInits: 'JP' },
  { id: 'willowbrook-rehab',   name: 'Willowbrook Rehab',     industry: 'Healthcare · Rehab',        initials: 'WR', logoClass: 'logo-green',  status: 'track',   amInits: 'DR' },
  { id: 'voyager-travel',      name: 'Voyager Travel',        industry: 'Travel · Luxury tours',     initials: 'VT', logoClass: 'logo-sky',    status: 'track',   amInits: 'KC' },
  { id: 'granite-electrical',  name: 'Granite Electrical',    industry: 'Services · Electrical',     initials: 'GE', logoClass: 'logo-slate',  status: 'track',   amInits: 'MA' },
  { id: 'lumen-photovoltaics', name: 'Lumen Photovoltaics',   industry: 'Energy · Solar install',    initials: 'LP', logoClass: 'logo-amber',  status: 'track',   amInits: 'JP' },
  { id: 'apex-martial',        name: 'Apex Martial Arts',     industry: 'Fitness · Dojo chain',      initials: 'AM', logoClass: 'logo-pink',   status: 'track',   amInits: 'KC' },
  { id: 'ivory-luxe',          name: 'Ivory Luxe',            industry: 'Beauty · Prestige skincare',initials: 'IL', logoClass: 'logo-purple', status: 'track',   amInits: 'NT' },
  { id: 'ironclad-sec',        name: 'Ironclad Security',     industry: 'Services · Cybersecurity',  initials: 'IS', logoClass: 'logo-slate',  status: 'track',   amInits: 'DR' },
  { id: 'sprout-pediatrics',   name: 'Sprout Pediatrics',     industry: 'Healthcare · Pediatrics',   initials: 'SP', logoClass: 'logo-green',  status: 'track',   amInits: 'NT' },
  { id: 'mosaic-coworking',    name: 'Mosaic Coworking',      industry: 'Real Estate · Coworking',   initials: 'MC', logoClass: 'logo-indigo', status: 'track',   amInits: 'JP' },
  { id: 'heritage-winery',     name: 'Heritage Winery',       industry: 'F&B · Winery DTC',          initials: 'HW', logoClass: 'logo-pink',   status: 'track',   amInits: 'KC' },
  { id: 'basalt-brewing',      name: 'Basalt Brewing',        industry: 'F&B · Craft brewery',       initials: 'BB', logoClass: 'logo-amber',  status: 'track',   amInits: 'KC' },
  { id: 'echo-voiceai',        name: 'Echo Voice AI',         industry: 'Tech · SaaS AI',            initials: 'EV', logoClass: 'logo-sky',    status: 'track',   amInits: 'DR' },
  { id: 'cedarline-cabins',    name: 'Cedarline Cabins',      industry: 'Hospitality · Rentals',     initials: 'CD', logoClass: 'logo-orange', status: 'track',   amInits: 'MA' },
  { id: 'vesper-jewelry',      name: 'Vesper Jewelry',        industry: 'Retail · Fine jewelry',     initials: 'VJ', logoClass: 'logo-purple', status: 'track',   amInits: 'NT' },
  { id: 'tidal-watersports',   name: 'Tidal Watersports',     industry: 'Retail · Water sports',     initials: 'TW', logoClass: 'logo-teal',   status: 'track',   amInits: 'MA' },
  { id: 'canvas-arts-academy', name: 'Canvas Arts Academy',   industry: 'Education · Art school',    initials: 'CN', logoClass: 'logo-pink',   status: 'track',   amInits: 'DR' },
  { id: 'meridianpath-therapy',name: 'Meridian Path Therapy', industry: 'Healthcare · Mental health',initials: 'MP', logoClass: 'logo-green',  status: 'track',   amInits: 'NT' },
  { id: 'stoneway-moving',     name: 'Stoneway Moving',       industry: 'Services · Movers',         initials: 'SM', logoClass: 'logo-slate',  status: 'paused',  amInits: 'MA' },
  { id: 'terra-pottery',       name: 'Terra Pottery Co.',     industry: 'Retail · Handcraft',        initials: 'TP', logoClass: 'logo-amber',  status: 'paused',  amInits: 'KC' },
  { id: 'lattice-arch',        name: 'Lattice Architects',    industry: 'Professional · Architecture',initials:'LA', logoClass: 'logo-indigo', status: 'paused',  amInits: 'DR' },
  { id: 'beacon-music',        name: 'Beacon Music School',   industry: 'Education · Music lessons', initials: 'BM', logoClass: 'logo-purple', status: 'paused',  amInits: 'JP' },
];
