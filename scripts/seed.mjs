#!/usr/bin/env node
/**
 * Eenmalig de Supabase-database van Peil vullen met de 6 pilot-campings en
 * ~10 weken historie. De app seedt zichzelf ook bij de eerste load; dit script
 * is handig om de database direct te vullen of opnieuw te zetten.
 *
 *   node scripts/seed.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://izorxyllmvszabnrukgg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_jhuPEfI6bbNSfOY3T8_4Ag_WLZwpWFg';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const HISTORY_WEEKS = 10;
const tp = (s, c, ch = 0) => {
  const o = [{ id: 'staplaats', label: 'Toeristische staplaats', aantal: s }];
  if (c) o.push({ id: 'camperplaats', label: 'Camperplaats', aantal: c });
  if (ch) o.push({ id: 'chalet', label: 'Chalet / huuraccommodatie', aantal: ch });
  return o;
};
const CAMPINGS = [
  { id: 'zonnehoek', slug: 'zonnehoek', naam: 'Minicamping Zonnehoek', plaats: 'Biggekerke', pitches: 25, types: tp(18, 4, 3), winterkamperen: false, cover: '/images/camping-zonnehoek.png', meterStart: 2840, eff: 300, submittedCurrent: true },
  { id: 'anthonijshoek', slug: 'anthonijshoek', naam: 'Minicamping Sint Anthonijshoek', plaats: 'Koudekerke', pitches: 20, types: tp(16, 4), winterkamperen: false, cover: '/images/camping-weiland.png', meterStart: 1960, eff: 380, submittedCurrent: true },
  { id: 'laferme', slug: 'laferme', naam: 'Minicamping La Ferme', plaats: 'Brouwershaven', pitches: 24, types: tp(17, 4, 3), winterkamperen: true, cover: '/images/camping-boomgaard.png', meterStart: 3320, eff: 450, submittedCurrent: false },
  { id: 'rustenpolder', slug: 'rustenpolder', naam: 'Minicamping Rustenpolder', plaats: 'Vrouwenpolder', pitches: 15, types: tp(11, 4), winterkamperen: false, cover: '/images/camping-achterdedijk.png', meterStart: 1170, eff: 335, submittedCurrent: true },
  { id: 'pitteperk', slug: 'pitteperk', naam: 'Minicamping Pitteperk', plaats: 'Middelburg', pitches: 25, types: tp(16, 5, 4), winterkamperen: true, cover: '/images/camping-duinzicht.png', meterStart: 3015, eff: 415, submittedCurrent: false },
  { id: 'kwedammertje', slug: 'kwedammertje', naam: "Minicamping 't Kwedammertje", plaats: 'Kwadendamme', pitches: 18, types: tp(14, 4), winterkamperen: false, cover: '/images/camping-rietkraag.png', meterStart: 1545, eff: 360, submittedCurrent: false },
];

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const ft = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fdn = (ft.getUTCDay() + 6) % 7;
  ft.setUTCDate(ft.getUTCDate() - fdn + 3);
  return { year: d.getUTCFullYear(), week: 1 + Math.round((d.getTime() - ft.getTime()) / (7 * 864e5)) };
}
function mondayOfISOWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = (jan4.getUTCDay() + 6) % 7;
  const w1 = new Date(jan4);
  w1.setUTCDate(jan4.getUTCDate() - dow);
  const m = new Date(w1);
  m.setUTCDate(w1.getUTCDate() + (week - 1) * 7);
  return m;
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
function distribute(types, total) {
  const cap = types.reduce((s, t) => s + t.aantal, 0); const res = {}; if (!cap) return res; let a = 0;
  types.forEach((t, i) => { const want = i === types.length - 1 ? total - a : Math.round((total * t.aantal) / cap); const n = clamp(want, 0, t.aantal); res[t.id] = n; a += n; });
  return res;
}

function build() {
  const { year, week } = isoWeek(new Date());
  const holiday = [18, 19, 20, 22];
  const readings = [];
  for (const c of CAMPINGS) {
    const rng = mulberry32(hashStr(c.id));
    let meter = c.meterStart;
    for (let i = HISTORY_WEEKS - 1; i >= 0; i--) {
      const w = week - i;
      if (w < 1) continue;
      const t = (HISTORY_WEEKS - 1 - i) / (HISTORY_WEEKS - 1);
      let occ = 0.2 + t * 0.52;
      if (holiday.includes(w)) occ += 0.12;
      occ = clamp(occ + (rng() - 0.5) * 0.1, 0.12, 0.99);
      const bez = Math.max(1, Math.round(c.pitches * occ));
      const bezoekers = Math.round(bez * (2.4 + rng() * 0.5) * (1.05 + rng() * 0.25));
      const verbM3 = (bezoekers * c.eff * (0.92 + rng() * 0.16)) / 1000;
      meter = round1(meter + verbM3);
      if (i === 0 && !c.submittedCurrent) continue;
      const per = distribute(c.types, bez);
      const bezTot = Object.values(per).reduce((s, n) => s + n, 0) || bez;
      readings.push({ id: `${c.id}-${year}-${w}`, camping_id: c.id, jaar: year, week: w, meterstand: meter, bezoekers, bezetting: bezTot, bezetting_per_type: per, bron: 'handmatig', datum: mondayOfISOWeek(year, w).toISOString().slice(0, 10) });
    }
  }
  const campingRows = CAMPINGS.map((c, i) => ({ id: c.id, slug: c.slug, naam: c.naam, plaats: c.plaats, pitches: c.pitches, types: c.types, winterkamperen: c.winterkamperen, cover: c.cover, meter_start: c.meterStart, sort: i }));
  return { campingRows, readings };
}

const { campingRows, readings } = build();
const r1 = await sb.from('campings').upsert(campingRows, { onConflict: 'id' });
if (r1.error) { console.error('campings', r1.error); process.exit(1); }
const r2 = await sb.from('readings').upsert(readings, { onConflict: 'id' });
if (r2.error) { console.error('readings', r2.error); process.exit(1); }
const { count: cc } = await sb.from('campings').select('*', { count: 'exact', head: true });
const { count: rc } = await sb.from('readings').select('*', { count: 'exact', head: true });
console.log(`Geseed: ${cc} campings, ${rc} readings.`);
