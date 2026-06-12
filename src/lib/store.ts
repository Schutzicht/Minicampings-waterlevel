// -----------------------------------------------------------------------------
// Peil - client-side data layer (localStorage).
// No database yet: all state lives in the browser. Seed data is generated once
// relative to the current ISO week so the demo always looks "live".
// -----------------------------------------------------------------------------

export type Bron = 'handmatig' | 'homewizard';

export interface PlaatsType {
  id: string;
  label: string;
  aantal: number;
}

export interface Camping {
  id: string;
  slug: string;
  naam: string;
  plaats: string;
  pitches: number; // totaal aantal plekken (= som van de types)
  types: PlaatsType[]; // staplaatsen, camperplaatsen, chalets, ...
  winterkamperen: boolean;
  cover: string; // /images/...
  meterStart: number; // meterstand (m3) net voor het eerste opgeslagen weeknummer
}

export interface Reading {
  id: string;
  campingId: string;
  jaar: number;
  week: number;
  meterstand: number; // m3, cumulatieve meterstand
  bezoekers: number; // gasten die week
  bezetting: number; // bezette plekken die week (<= pitches)
  bron: Bron;
  datum: string; // ISO datum (maandag van de week)
}

export interface AppState {
  version: number;
  seededWeek: number;
  campings: Camping[];
  readings: Reading[];
}

const STORAGE_KEY = 'peil:v1';
const VERSION = 3;
const HISTORY_WEEKS = 10; // aantal weken seed-historie incl. huidige week
const ROLE_KEY = 'peil:role';
const REMINDER_KEY = 'peil:reminders';

// -----------------------------------------------------------------------------
// Camping-metadata (seed)
// -----------------------------------------------------------------------------

interface CampingSeed extends Camping {
  eff: number; // basis liter per bezoeker per week
  submittedCurrent: boolean; // heeft deze camping de huidige week al ingevuld?
}

const tp = (staplaats: number, camperplaats: number, chalet = 0): PlaatsType[] => {
  const out: PlaatsType[] = [{ id: 'staplaats', label: 'Toeristische staplaats', aantal: staplaats }];
  if (camperplaats) out.push({ id: 'camperplaats', label: 'Camperplaats', aantal: camperplaats });
  if (chalet) out.push({ id: 'chalet', label: 'Chalet / huuraccommodatie', aantal: chalet });
  return out;
};

const CAMPING_SEED: CampingSeed[] = [
  { id: 'zonnehoek', slug: 'zonnehoek', naam: 'Minicamping Zonnehoek', plaats: 'Biggekerke', pitches: 25, types: tp(18, 4, 3), winterkamperen: false, cover: '/images/camping-zonnehoek.png', meterStart: 2840, eff: 300, submittedCurrent: true },
  { id: 'anthonijshoek', slug: 'anthonijshoek', naam: 'Minicamping Sint Anthonijshoek', plaats: 'Koudekerke', pitches: 20, types: tp(16, 4), winterkamperen: false, cover: '/images/camping-weiland.png', meterStart: 1960, eff: 380, submittedCurrent: true },
  { id: 'laferme', slug: 'laferme', naam: 'Minicamping La Ferme', plaats: 'Brouwershaven', pitches: 24, types: tp(17, 4, 3), winterkamperen: true, cover: '/images/camping-boomgaard.png', meterStart: 3320, eff: 450, submittedCurrent: false },
  { id: 'rustenpolder', slug: 'rustenpolder', naam: 'Minicamping Rustenpolder', plaats: 'Vrouwenpolder', pitches: 15, types: tp(11, 4), winterkamperen: false, cover: '/images/camping-achterdedijk.png', meterStart: 1170, eff: 335, submittedCurrent: true },
  { id: 'pitteperk', slug: 'pitteperk', naam: 'Minicamping Pitteperk', plaats: 'Middelburg', pitches: 25, types: tp(16, 5, 4), winterkamperen: true, cover: '/images/camping-duinzicht.png', meterStart: 3015, eff: 415, submittedCurrent: false },
  { id: 'kwedammertje', slug: 'kwedammertje', naam: "Minicamping 't Kwedammertje", plaats: 'Kwadendamme', pitches: 18, types: tp(14, 4), winterkamperen: false, cover: '/images/camping-rietkraag.png', meterStart: 1545, eff: 360, submittedCurrent: false },
];

// -----------------------------------------------------------------------------
// ISO-week helpers
// -----------------------------------------------------------------------------

const MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // ma = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return { year: d.getUTCFullYear(), week };
}

export function mondayOfISOWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

export function weekRangeLabel(year: number, week: number): string {
  const mon = mondayOfISOWeek(year, week);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  const m1 = MONTHS_SHORT[mon.getUTCMonth()];
  const m2 = MONTHS_SHORT[sun.getUTCMonth()];
  if (m1 === m2) return `${mon.getUTCDate()} - ${sun.getUTCDate()} ${m2}`;
  return `${mon.getUTCDate()} ${m1} - ${sun.getUTCDate()} ${m2}`;
}

export function currentWeek(): { year: number; week: number } {
  return isoWeek(new Date());
}

// -----------------------------------------------------------------------------
// Deterministische RNG (stabiele seed-cijfers)
// -----------------------------------------------------------------------------

function hashStr(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// -----------------------------------------------------------------------------
// Seed
// -----------------------------------------------------------------------------

function generateSeed(now = new Date()): AppState {
  const { year, week } = isoWeek(now);
  const readings: Reading[] = [];
  const holidayWeeks = [18, 19, 20, 22]; // mei-/Hemelvaart-/Pinkstervakantie

  for (const c of CAMPING_SEED) {
    const rng = mulberry32(hashStr(c.id));
    let meter = c.meterStart;

    for (let i = HISTORY_WEEKS - 1; i >= 0; i--) {
      const w = week - i;
      if (w < 1) continue;
      const t = (HISTORY_WEEKS - 1 - i) / (HISTORY_WEEKS - 1); // 0 oud .. 1 nieuw
      let occ = 0.2 + t * 0.52;
      if (holidayWeeks.includes(w)) occ += 0.12;
      occ = clamp(occ + (rng() - 0.5) * 0.1, 0.12, 0.99);

      const bezetting = Math.max(1, Math.round(c.pitches * occ));
      const partySize = 2.4 + rng() * 0.5;
      const turnover = 1.05 + rng() * 0.25;
      const bezoekers = Math.round(bezetting * partySize * turnover);
      const literPerVisitor = c.eff * (0.92 + rng() * 0.16);
      const verbruikM3 = (bezoekers * literPerVisitor) / 1000;
      meter = round1(meter + verbruikM3);

      // sommige campings hebben de huidige week nog niet ingevuld
      if (i === 0 && !c.submittedCurrent) continue;

      const mon = mondayOfISOWeek(year, w);
      readings.push({
        id: `${c.id}-${year}-${w}`,
        campingId: c.id,
        jaar: year,
        week: w,
        meterstand: meter,
        bezoekers,
        bezetting,
        bron: 'handmatig',
        datum: mon.toISOString().slice(0, 10),
      });
    }
  }

  return {
    version: VERSION,
    seededWeek: week,
    campings: CAMPING_SEED.map(({ eff, submittedCurrent, ...rest }) => {
      void eff;
      void submittedCurrent;
      return rest;
    }),
    readings,
  };
}

// -----------------------------------------------------------------------------
// Persistentie
// -----------------------------------------------------------------------------

let cache: AppState | null = null;

export function load(): AppState {
  if (cache) return cache;
  if (typeof localStorage === 'undefined') {
    cache = generateSeed();
    return cache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && parsed.version === VERSION) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    // val terug op een verse seed
  }
  cache = generateSeed();
  save(cache);
  return cache;
}

export function save(state: AppState): void {
  cache = state;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('peil:change'));
  }
}

export function resetDemo(): void {
  cache = null;
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  load();
}

// -----------------------------------------------------------------------------
// Queries
// -----------------------------------------------------------------------------

export function getCampings(): Camping[] {
  return load().campings;
}

export function getCamping(idOrSlug: string): Camping | undefined {
  return load().campings.find((c) => c.id === idOrSlug || c.slug === idOrSlug);
}

export function readingsFor(campingId: string): Reading[] {
  return load()
    .readings.filter((r) => r.campingId === campingId)
    .sort((a, b) => a.jaar - b.jaar || a.week - b.week);
}

export function readingForWeek(campingId: string, year: number, week: number): Reading | undefined {
  return load().readings.find((r) => r.campingId === campingId && r.jaar === year && r.week === week);
}

/** Meterstand van de week ervoor (of meterStart als die er niet is). */
export function previousMeterstand(campingId: string, year: number, week: number): number {
  const prior = readingsFor(campingId).filter((r) => r.jaar < year || (r.jaar === year && r.week < week));
  if (prior.length) return prior[prior.length - 1].meterstand;
  const c = getCamping(campingId);
  return c ? c.meterStart : 0;
}

/** Verbruik (m3) van een reading t.o.v. de vorige meterstand. */
export function verbruikOf(r: Reading): number {
  const prev = previousMeterstand(r.campingId, r.jaar, r.week);
  return Math.max(0, round1(r.meterstand - prev));
}

export function bezettingsgraad(r: Reading): number {
  const c = getCamping(r.campingId);
  if (!c || c.pitches === 0) return 0;
  return clamp((r.bezetting / c.pitches) * 100, 0, 100);
}

/** Liter water per bezoeker (per week). */
export function literPerBezoeker(r: Reading): number {
  if (r.bezoekers <= 0) return 0;
  return (verbruikOf(r) * 1000) / r.bezoekers;
}

// -----------------------------------------------------------------------------
// Mutaties
// -----------------------------------------------------------------------------

export interface ReadingInput {
  campingId: string;
  jaar: number;
  week: number;
  meterstand: number;
  bezoekers: number;
  bezetting: number;
  bron?: Bron;
}

export function addOrUpdateReading(input: ReadingInput): Reading {
  const state = load();
  const mon = mondayOfISOWeek(input.jaar, input.week);
  const existing = state.readings.find(
    (r) => r.campingId === input.campingId && r.jaar === input.jaar && r.week === input.week,
  );
  const reading: Reading = {
    id: existing?.id ?? `${input.campingId}-${input.jaar}-${input.week}`,
    campingId: input.campingId,
    jaar: input.jaar,
    week: input.week,
    meterstand: input.meterstand,
    bezoekers: input.bezoekers,
    bezetting: input.bezetting,
    bron: input.bron ?? 'handmatig',
    datum: mon.toISOString().slice(0, 10),
  };
  if (existing) {
    state.readings = state.readings.map((r) => (r.id === existing.id ? reading : r));
  } else {
    state.readings.push(reading);
  }
  save(state);
  return reading;
}

// -----------------------------------------------------------------------------
// Aggregaties
// -----------------------------------------------------------------------------

export interface WeekPoint {
  jaar: number;
  week: number;
  label: string;
  verbruik: number; // m3 (som over campings met verbruik)
  bezoekers: number;
  bezettingsgraad: number; // gemiddelde %
  campings: number; // aantal campings met data deze week
}

/** Lijst van weken in de seed-range (oud -> nieuw). */
export function weekRange(): { jaar: number; week: number }[] {
  const all = load().readings;
  if (!all.length) return [];
  const keys = new Set(all.map((r) => `${r.jaar}-${r.week}`));
  return [...keys]
    .map((k) => {
      const [jaar, week] = k.split('-').map(Number);
      return { jaar, week };
    })
    .sort((a, b) => a.jaar - b.jaar || a.week - b.week);
}

export function regionWeeklyTotals(): WeekPoint[] {
  return weekRange().map(({ jaar, week }) => {
    const weekReadings = load().readings.filter((r) => r.jaar === jaar && r.week === week);
    let verbruik = 0;
    let bezoekers = 0;
    let bezSum = 0;
    for (const r of weekReadings) {
      verbruik += verbruikOf(r);
      bezoekers += r.bezoekers;
      bezSum += bezettingsgraad(r);
    }
    return {
      jaar,
      week,
      label: `wk ${week}`,
      verbruik: round1(verbruik),
      bezoekers,
      bezettingsgraad: weekReadings.length ? Math.round(bezSum / weekReadings.length) : 0,
      campings: weekReadings.length,
    };
  });
}

export function campingWeekly(campingId: string): WeekPoint[] {
  return readingsFor(campingId).map((r) => ({
    jaar: r.jaar,
    week: r.week,
    label: `wk ${r.week}`,
    verbruik: verbruikOf(r),
    bezoekers: r.bezoekers,
    bezettingsgraad: Math.round(bezettingsgraad(r)),
    campings: 1,
  }));
}

export interface Kpi {
  value: number;
  deltaPct: number | null; // t.o.v. vorige week
  beterIsLager: boolean;
}

function pctChange(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

export function dashboardKpis() {
  const totals = regionWeeklyTotals();
  const last = totals[totals.length - 1];
  const prev = totals[totals.length - 2];
  const seizoenVerbruik = round1(totals.reduce((s, t) => s + t.verbruik, 0));
  const seizoenBezoekers = totals.reduce((s, t) => s + t.bezoekers, 0);

  const lpb = (p?: WeekPoint) => (p && p.bezoekers ? (p.verbruik * 1000) / p.bezoekers : 0);

  return {
    verbruikWeek: {
      value: last ? last.verbruik : 0,
      deltaPct: last && prev ? pctChange(last.verbruik, prev.verbruik) : null,
      beterIsLager: true,
    } as Kpi,
    literPerBezoeker: {
      value: lpb(last),
      deltaPct: last && prev ? pctChange(lpb(last), lpb(prev)) : null,
      beterIsLager: true,
    } as Kpi,
    bezetting: {
      value: last ? last.bezettingsgraad : 0,
      deltaPct: last && prev ? pctChange(last.bezettingsgraad, prev.bezettingsgraad) : null,
      beterIsLager: false,
    } as Kpi,
    seizoenVerbruik,
    seizoenBezoekers,
  };
}

export interface CampingSummary {
  camping: Camping;
  latest?: Reading;
  verbruikWeek: number;
  literPerBezoeker: number;
  bezettingsgraad: number;
  bezoekers: number;
  spark: number[]; // verbruik laatste weken
  submittedThisWeek: boolean;
}

export function campingSummaries(): CampingSummary[] {
  const { year, week } = currentWeek();
  return getCampings().map((c) => {
    const weekly = campingWeekly(c.id);
    const latest = readingsFor(c.id).slice(-1)[0];
    const lpb = latest ? literPerBezoeker(latest) : 0;
    return {
      camping: c,
      latest,
      verbruikWeek: latest ? verbruikOf(latest) : 0,
      literPerBezoeker: lpb,
      bezettingsgraad: latest ? bezettingsgraad(latest) : 0,
      bezoekers: latest ? latest.bezoekers : 0,
      spark: weekly.slice(-8).map((w) => w.verbruik),
      submittedThisWeek: !!readingForWeek(c.id, year, week),
    };
  });
}

export interface BenchmarkRow {
  camping: Camping;
  literPerBezoeker: number; // seizoensgemiddelde
  verbruikGem: number; // gem. m3 per week
  bezettingGem: number; // gem. %
  bezoekersTotaal: number;
}

export function benchmark(): BenchmarkRow[] {
  return getCampings()
    .map((c) => {
      const weekly = campingWeekly(c.id);
      const verbruikTot = weekly.reduce((s, w) => s + w.verbruik, 0);
      const bezoekersTot = weekly.reduce((s, w) => s + w.bezoekers, 0);
      const bezTot = weekly.reduce((s, w) => s + w.bezettingsgraad, 0);
      return {
        camping: c,
        literPerBezoeker: bezoekersTot ? (verbruikTot * 1000) / bezoekersTot : 0,
        verbruikGem: weekly.length ? round1(verbruikTot / weekly.length) : 0,
        bezettingGem: weekly.length ? Math.round(bezTot / weekly.length) : 0,
        bezoekersTotaal: bezoekersTot,
      };
    })
    .sort((a, b) => a.literPerBezoeker - b.literPerBezoeker);
}

export interface WeekStatus {
  jaar: number;
  week: number;
  label: string;
  ranges: string;
  ingevuld: CampingSummary[];
  open: CampingSummary[];
}

export function currentWeekStatus(): WeekStatus {
  const { year, week } = currentWeek();
  const summaries = campingSummaries();
  return {
    jaar: year,
    week,
    label: `Week ${week}`,
    ranges: weekRangeLabel(year, week),
    ingevuld: summaries.filter((s) => s.submittedThisWeek),
    open: summaries.filter((s) => !s.submittedThisWeek),
  };
}

// -----------------------------------------------------------------------------
// Formatters (nl-NL)
// -----------------------------------------------------------------------------

const nf0 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmtInt = (n: number) => nf0.format(Math.round(n));
export const fmt1 = (n: number) => nf1.format(n);
export const fmtM3 = (n: number) => `${nf1.format(n)} m³`;
export const fmtL = (n: number) => `${nf0.format(Math.round(n))} L`;
export const fmtPct = (n: number) => `${Math.round(n)}%`;
export const fmtDelta = (n: number | null) => (n === null ? '-' : `${n > 0 ? '+' : ''}${nf0.format(Math.round(n))}%`);

// -----------------------------------------------------------------------------
// Campingbeheer (eigenschappen)
// -----------------------------------------------------------------------------

export function totalCapacity(c: Camping): number {
  return c.types?.length ? c.types.reduce((s, t) => s + (t.aantal || 0), 0) : c.pitches;
}

export interface CampingPatch {
  naam?: string;
  plaats?: string;
  winterkamperen?: boolean;
  types?: PlaatsType[];
}

export function updateCamping(id: string, patch: CampingPatch): Camping | undefined {
  const state = load();
  const c = state.campings.find((x) => x.id === id);
  if (!c) return undefined;
  if (patch.naam !== undefined) c.naam = patch.naam;
  if (patch.plaats !== undefined) c.plaats = patch.plaats;
  if (patch.winterkamperen !== undefined) c.winterkamperen = patch.winterkamperen;
  if (patch.types !== undefined) {
    c.types = patch.types;
    c.pitches = patch.types.reduce((s, t) => s + (t.aantal || 0), 0);
  }
  save(state);
  return c;
}

// -----------------------------------------------------------------------------
// Rol / toegang (demo): 'regio' = beheerder, anders een campingId (eigenaar)
// -----------------------------------------------------------------------------

export type Role = 'regio' | string;

export function getRole(): Role {
  if (typeof localStorage === 'undefined') return 'regio';
  return localStorage.getItem(ROLE_KEY) || 'regio';
}

export function setRole(role: Role): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(ROLE_KEY, role);
}

export interface Scope {
  isRegio: boolean;
  campingId: string | null;
  camping: Camping | null;
}

export function roleScope(): Scope {
  const role = getRole();
  if (role === 'regio') return { isRegio: true, campingId: null, camping: null };
  const camping = getCamping(role) ?? null;
  if (!camping) return { isRegio: true, campingId: null, camping: null };
  return { isRegio: false, campingId: camping.id, camping };
}

export function scopedCampings(): Camping[] {
  const s = roleScope();
  return s.isRegio ? getCampings() : getCampings().filter((c) => c.id === s.campingId);
}

// -----------------------------------------------------------------------------
// Herinneringen (demo-prefs per camping)
// -----------------------------------------------------------------------------

export interface ReminderPrefs {
  email: boolean;
  adres: string;
  dag: string; // 'ma' .. 'zo'
  push: boolean;
}

const DEFAULT_REMINDER: ReminderPrefs = { email: true, adres: '', dag: 'ma', push: false };

export function getReminderPrefs(campingId: string): ReminderPrefs {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_REMINDER };
  try {
    const all = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
    return { ...DEFAULT_REMINDER, ...(all[campingId] || {}) };
  } catch {
    return { ...DEFAULT_REMINDER };
  }
}

export function setReminderPrefs(campingId: string, prefs: ReminderPrefs): void {
  if (typeof localStorage === 'undefined') return;
  let all: Record<string, ReminderPrefs> = {};
  try {
    all = JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}');
  } catch {
    all = {};
  }
  all[campingId] = prefs;
  localStorage.setItem(REMINDER_KEY, JSON.stringify(all));
}
