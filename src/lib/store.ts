// -----------------------------------------------------------------------------
// Peil - data layer (Supabase). De leeslaag werkt synchroon vanuit een
// in-memory cache; roep eerst `ensureLoaded()` aan om die te vullen uit de
// database. Schrijfacties updaten de cache direct en pushen async naar Supabase.
// Op de server (build) valt alles terug op een lokale seed.
// -----------------------------------------------------------------------------

import { sb } from './supabase';

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
  bezetting: number; // bezette plekken die week (= som van bezettingPerType)
  bezettingPerType?: Record<string, number>; // bezette plekken per plaatstype
  bron: Bron;
  datum: string; // ISO datum (maandag van de week)
}

export interface AppState {
  version: number;
  seededWeek: number;
  campings: Camping[];
  readings: Reading[];
}

const VERSION = 5;
const ROLE_KEY = 'peil:role';

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

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Verdeelt het aantal bezette plekken over de plaatstypes, naar rato van capaciteit. */
export function distributeOccupancy(types: PlaatsType[], total: number): Record<string, number> {
  const cap = types.reduce((s, t) => s + t.aantal, 0);
  const res: Record<string, number> = {};
  if (!cap) return res;
  let assigned = 0;
  types.forEach((t, idx) => {
    const want = idx === types.length - 1 ? total - assigned : Math.round((total * t.aantal) / cap);
    const n = clamp(want, 0, t.aantal);
    res[t.id] = n;
    assigned += n;
  });
  return res;
}

// -----------------------------------------------------------------------------
// Persistentie (Supabase + in-memory cache)
// -----------------------------------------------------------------------------

let cache: AppState | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;
let settingsCache: Record<string, ReminderPrefs> = {};

const num = (v: unknown) => (typeof v === 'number' ? v : parseFloat(String(v ?? 0)) || 0);

/* eslint-disable @typescript-eslint/no-explicit-any */
function toCampingRow(c: Camping, sort: number) {
  return { id: c.id, slug: c.slug, naam: c.naam, plaats: c.plaats, pitches: c.pitches, types: c.types, winterkamperen: c.winterkamperen, cover: c.cover, meter_start: c.meterStart, sort };
}
function fromCampingRow(r: any): Camping {
  return { id: r.id, slug: r.slug, naam: r.naam, plaats: r.plaats, pitches: r.pitches, types: r.types ?? [], winterkamperen: !!r.winterkamperen, cover: r.cover ?? '', meterStart: num(r.meter_start) };
}
function toReadingRow(r: Reading) {
  return { id: r.id, camping_id: r.campingId, jaar: r.jaar, week: r.week, meterstand: r.meterstand, bezoekers: r.bezoekers, bezetting: r.bezetting, bezetting_per_type: r.bezettingPerType ?? {}, bron: r.bron, datum: r.datum };
}
function fromReadingRow(r: any): Reading {
  return { id: r.id, campingId: r.camping_id, jaar: r.jaar, week: r.week, meterstand: num(r.meterstand), bezoekers: r.bezoekers, bezetting: r.bezetting, bezettingPerType: r.bezetting_per_type ?? {}, bron: r.bron, datum: r.datum };
}

const emptyState = (): AppState => ({ version: VERSION, seededWeek: 0, campings: [], readings: [] });

/** Synchroon: geeft de huidige cache (of een lege staat op de server / vóór hydrate). */
export function load(): AppState {
  if (!cache) cache = emptyState();
  return cache;
}

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('peil:change'));
}

/** Vult de cache uit Supabase. Idempotent. Seedt niets: leeg blijft leeg. */
export function ensureLoaded(): Promise<void> {
  if (typeof window === 'undefined' || hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const [{ data: camps, error }, { data: reads }, { data: setts }] = await Promise.all([
        sb.from('campings').select('*').order('sort'),
        sb.from('readings').select('*'),
        sb.from('settings').select('*'),
      ]);
      if (error) throw error;
      cache = {
        version: VERSION,
        seededWeek: 0,
        campings: (camps ?? []).map(fromCampingRow),
        readings: (reads ?? []).map(fromReadingRow),
      };
      settingsCache = {};
      for (const s of setts ?? []) settingsCache[s.camping_id] = { email: !!s.email, adres: s.adres ?? '', dag: s.dag ?? 'ma', push: !!s.push };
      hydrated = true;
    } catch (e) {
      console.error('Peil: laden uit Supabase mislukt.', e);
      if (!cache) cache = emptyState();
      hydrated = true;
    }
    emitChange();
  })();
  return hydrating;
}

async function pushReading(r: Reading) {
  try {
    await sb.from('readings').upsert(toReadingRow(r), { onConflict: 'id' });
  } catch (e) {
    console.error('Peil: opslaan reading mislukt.', e);
  }
}
async function pushCamping(c: Camping) {
  try {
    const sort = load().campings.findIndex((x) => x.id === c.id);
    await sb.from('campings').upsert(toCampingRow(c, sort < 0 ? 0 : sort), { onConflict: 'id' });
  } catch (e) {
    console.error('Peil: opslaan camping mislukt.', e);
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'camping'
  );
}

export interface NewCampingInput {
  naam: string;
  plaats: string;
  types: PlaatsType[];
  winterkamperen: boolean;
  meterStart: number;
}

/** Maakt een nieuwe camping aan (onboarding). Geeft de aangemaakte camping terug. */
export async function createCamping(input: NewCampingInput): Promise<Camping> {
  const state = load();
  const base = slugify(input.naam);
  let slug = base;
  let n = 1;
  while (state.campings.some((c) => c.slug === slug)) slug = `${base}-${++n}`;
  const camping: Camping = {
    id: slug,
    slug,
    naam: input.naam.trim(),
    plaats: input.plaats.trim(),
    pitches: input.types.reduce((s, t) => s + (t.aantal || 0), 0),
    types: input.types,
    winterkamperen: input.winterkamperen,
    cover: '',
    meterStart: input.meterStart || 0,
  };
  state.campings.push(camping);
  emitChange();
  await pushCamping(camping);
  return camping;
}

// -----------------------------------------------------------------------------
// Accounts / login (Supabase RPC; wachtwoorden als bcrypt, server-side)
// -----------------------------------------------------------------------------

export interface AccountResult {
  ok: boolean;
  campingId?: string;
  role?: string;
  error?: string;
}

export async function registerAccount(input: NewCampingInput & { email: string; password: string }): Promise<AccountResult> {
  try {
    const { data, error } = await sb.rpc('peil_register', {
      p_email: input.email,
      p_password: input.password,
      p_naam: input.naam,
      p_plaats: input.plaats,
      p_types: input.types,
      p_winter: input.winterkamperen,
      p_meterstart: input.meterStart,
    });
    if (error) return { ok: false, error: 'server' };
    return data as AccountResult;
  } catch {
    return { ok: false, error: 'server' };
  }
}

export async function loginAccount(email: string, password: string): Promise<AccountResult> {
  try {
    const { data, error } = await sb.rpc('peil_login', { p_email: email, p_password: password });
    if (error) return { ok: false, error: 'server' };
    return data as AccountResult;
  } catch {
    return { ok: false, error: 'server' };
  }
}

export async function claimCamping(campingId: string, email: string, password: string): Promise<AccountResult> {
  try {
    const { data, error } = await sb.rpc('peil_claim', { p_camping: campingId, p_email: email, p_password: password });
    if (error) return { ok: false, error: 'server' };
    return data as AccountResult;
  } catch {
    return { ok: false, error: 'server' };
  }
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
  bezettingPerType?: Record<string, number>;
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
    bezettingPerType: input.bezettingPerType,
    bron: input.bron ?? 'handmatig',
    datum: mon.toISOString().slice(0, 10),
  };
  if (existing) {
    state.readings = state.readings.map((r) => (r.id === existing.id ? reading : r));
  } else {
    state.readings.push(reading);
  }
  emitChange();
  void pushReading(reading);
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
  meterStart?: number;
}

export function updateCamping(id: string, patch: CampingPatch): Camping | undefined {
  const state = load();
  const c = state.campings.find((x) => x.id === id);
  if (!c) return undefined;
  if (patch.naam !== undefined) c.naam = patch.naam;
  if (patch.plaats !== undefined) c.plaats = patch.plaats;
  if (patch.winterkamperen !== undefined) c.winterkamperen = patch.winterkamperen;
  if (patch.meterStart !== undefined) c.meterStart = patch.meterStart;
  if (patch.types !== undefined) {
    c.types = patch.types;
    c.pitches = patch.types.reduce((s, t) => s + (t.aantal || 0), 0);
  }
  emitChange();
  void pushCamping(c);
  return c;
}

// -----------------------------------------------------------------------------
// Rol / toegang: 'regio' = beheerder, anders een campingId (eigenaar)
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
// Herinneringen (prefs per camping)
// -----------------------------------------------------------------------------

export interface ReminderPrefs {
  email: boolean;
  adres: string;
  dag: string; // 'ma' .. 'zo'
  push: boolean;
}

const DEFAULT_REMINDER: ReminderPrefs = { email: true, adres: '', dag: 'ma', push: false };

export function getReminderPrefs(campingId: string): ReminderPrefs {
  return { ...DEFAULT_REMINDER, ...(settingsCache[campingId] || {}) };
}

export function setReminderPrefs(campingId: string, prefs: ReminderPrefs): void {
  settingsCache[campingId] = prefs;
  void (async () => {
    try {
      await sb.from('settings').upsert({ camping_id: campingId, ...prefs }, { onConflict: 'camping_id' });
    } catch (e) {
      console.error('Peil: opslaan herinneringen mislukt.', e);
    }
  })();
}
