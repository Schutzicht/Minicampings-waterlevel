// -----------------------------------------------------------------------------
// Peil - kleine HTML-helpers voor client-side rendering.
// -----------------------------------------------------------------------------

const ARROW_UP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V7M6 12l6-6 6 6"/></svg>';
const ARROW_DOWN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v12M6 12l6 6 6-6"/></svg>';

export type TrendMode = 'lowerBetter' | 'higherBetter' | 'neutral';

export function trendBadge(deltaPct: number | null, mode: TrendMode = 'lowerBetter'): string {
  if (deltaPct === null || !isFinite(deltaPct)) {
    return `<span class="chip bg-line-soft text-faint">geen vergelijk</span>`;
  }
  const up = deltaPct >= 0;
  const arrow = up ? ARROW_UP : ARROW_DOWN;
  const mag = Math.abs(Math.round(deltaPct));
  let cls = 'bg-line-soft text-muted';
  if (mode === 'lowerBetter') cls = up ? 'bg-high-soft text-high' : 'bg-good-soft text-good';
  else if (mode === 'higherBetter') cls = up ? 'bg-good-soft text-good' : 'bg-high-soft text-high';
  return `<span class="chip ${cls}">${arrow}${mag}%</span>`;
}

export function statusDot(ok: boolean): string {
  return `<span class="inline-block h-2.5 w-2.5 rounded-full ${ok ? 'bg-good' : 'bg-warn'}"></span>`;
}

export function miniBar(pct: number, color = 'var(--color-brand)'): string {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="h-2 w-full overflow-hidden rounded-full bg-line-soft"><div class="h-full rounded-full" style="width:${w}%;background:${color};transition:width .6s cubic-bezier(.22,1,.36,1)"></div></div>`;
}

/** Kleur voor liter-per-gast efficientie (lager = groener). */
export function effColor(literPerBezoeker: number): string {
  if (literPerBezoeker <= 0) return 'var(--color-faint)';
  if (literPerBezoeker < 300) return 'var(--color-good)';
  if (literPerBezoeker < 430) return 'var(--color-brand)';
  if (literPerBezoeker < 520) return 'var(--color-warn)';
  return 'var(--color-high)';
}

export function effLabel(literPerBezoeker: number): string {
  if (literPerBezoeker <= 0) return '-';
  if (literPerBezoeker < 300) return 'Zuinig';
  if (literPerBezoeker < 430) return 'Gemiddeld';
  if (literPerBezoeker < 520) return 'Bovengemiddeld';
  return 'Hoog';
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** <img> dat zichzelf verwijdert als het bestand (nog) niet bestaat, zodat de
 *  gradient-tegel eronder zichtbaar blijft. */
export function sparkSafeImg(src: string, alt: string): string {
  return `<img src="${src}" alt="${esc(alt)}" class="h-full w-full object-cover" loading="lazy" onerror="this.remove()"/>`;
}
