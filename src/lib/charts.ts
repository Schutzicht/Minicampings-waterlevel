// -----------------------------------------------------------------------------
// Peil - lichte SVG-charts (geen externe afhankelijkheden).
// -----------------------------------------------------------------------------

export interface Point {
  label: string;
  value: number;
  sub?: string;
}

const BRAND = '#0e7c86';
const AQUA = '#18c3c0';

let uid = 0;
const nextId = () => `pg${++uid}`;

function niceMax(max: number): number {
  if (max <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const n = max / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow * Math.ceil(max / (step * pow));
}

const fmtNL = (v: number) =>
  new Intl.NumberFormat('nl-NL', { maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);

// -----------------------------------------------------------------------------
// Vloeiende area + lijn
// -----------------------------------------------------------------------------

export function renderAreaChart(
  el: HTMLElement,
  series: Point[],
  opts: { height?: number; color?: string; valueFmt?: (v: number) => string; unit?: string } = {},
): void {
  const { height = 240, color = BRAND, valueFmt = fmtNL, unit = '' } = opts;
  if (!series.length) {
    el.innerHTML = `<div class="grid place-items-center text-faint text-sm" style="height:${height}px">Nog geen data</div>`;
    return;
  }
  const W = 760;
  const H = height;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = niceMax(Math.max(...series.map((p) => p.value)));
  const n = series.length;
  const x = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const id = nextId();
  const linePts = series.map((p, i) => `${x(i)},${y(p.value)}`);
  const linePath = `M ${linePts.join(' L ')}`;
  const areaPath = `M ${x(0)},${y(0)} L ${linePts.join(' L ')} L ${x(n - 1)},${y(0)} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const grid = gridVals
    .map((v) => {
      const yy = y(v);
      return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#e6eef0" stroke-width="1"/>
        <text x="${padL - 8}" y="${yy + 3.5}" text-anchor="end" font-size="10.5" fill="#8aa0a6">${fmtNL(v)}</text>`;
    })
    .join('');

  const labelStep = Math.ceil(n / 7);
  const xLabels = series
    .map((p, i) =>
      i % labelStep === 0 || i === n - 1
        ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8aa0a6">${p.label}</text>`
        : '',
    )
    .join('');

  const dots = series
    .map((p, i) => {
      const last = i === n - 1;
      return `<circle cx="${x(i)}" cy="${y(p.value)}" r="${last ? 4.5 : 3}" fill="${last ? color : '#fff'}" stroke="${color}" stroke-width="2">
        <title>${p.label}: ${valueFmt(p.value)}${unit}</title></circle>`;
    })
    .join('');

  const last = series[n - 1];
  const lx = x(n - 1);
  const ly = y(last.value);
  const labelX = Math.min(lx, W - padR - 64);
  const badge = `
    <g transform="translate(${labelX - 4}, ${Math.max(ly - 34, padT)})">
      <rect x="0" y="0" rx="7" width="68" height="22" fill="${color}"/>
      <text x="34" y="15" text-anchor="middle" font-size="11.5" font-weight="700" fill="#fff">${valueFmt(last.value)}${unit}</text>
    </g>`;

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" font-family="Inter, sans-serif">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${areaPath}" fill="url(#${id})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}
    ${xLabels}
    ${badge}
  </svg>`;
}

// -----------------------------------------------------------------------------
// Staafdiagram
// -----------------------------------------------------------------------------

export function renderBarChart(
  el: HTMLElement,
  items: (Point & { highlight?: boolean; color?: string })[],
  opts: { height?: number; color?: string; valueFmt?: (v: number) => string; horizontal?: boolean } = {},
): void {
  const { height = 240, color = BRAND, valueFmt = fmtNL, horizontal = false } = opts;
  if (!items.length) {
    el.innerHTML = `<div class="grid place-items-center text-faint text-sm" style="height:${height}px">Nog geen data</div>`;
    return;
  }
  const max = niceMax(Math.max(...items.map((p) => p.value)));

  if (horizontal) {
    const rowH = 38;
    const H = items.length * rowH + 8;
    const W = 760;
    const padL = 150;
    const padR = 70;
    const innerW = W - padL - padR;
    const rows = items
      .map((p, i) => {
        const yy = 8 + i * rowH;
        const w = Math.max(2, (p.value / max) * innerW);
        const c = p.color ?? (p.highlight ? color : '#bfe0e1');
        return `
        <text x="${padL - 12}" y="${yy + rowH / 2 - 4}" text-anchor="end" font-size="12.5" font-weight="600" fill="#082730">${p.label}</text>
        <text x="${padL - 12}" y="${yy + rowH / 2 + 11}" text-anchor="end" font-size="10.5" fill="#8aa0a6">${p.sub ?? ''}</text>
        <rect x="${padL}" y="${yy + 6}" width="${innerW}" height="${rowH - 18}" rx="5" fill="#eef3f4"/>
        <rect x="${padL}" y="${yy + 6}" width="${w}" height="${rowH - 18}" rx="5" fill="${c}"/>
        <text x="${padL + w + 8}" y="${yy + rowH / 2 + 1}" font-size="12" font-weight="700" fill="#0b3d49">${valueFmt(p.value)}</text>`;
      })
      .join('');
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" font-family="Inter, sans-serif">${rows}</svg>`;
    return;
  }

  const W = 760;
  const H = height;
  const padL = 40;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = items.length;
  const slot = innerW / n;
  const bw = Math.min(34, slot * 0.62);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const id = nextId();
  const grid = [0, 0.5, 1]
    .map((f) => {
      const yy = y(f * max);
      return `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="#e6eef0"/>
        <text x="${padL - 8}" y="${yy + 3.5}" text-anchor="end" font-size="10.5" fill="#8aa0a6">${fmtNL(f * max)}</text>`;
    })
    .join('');
  const labelStep = Math.ceil(n / 9);
  const bars = items
    .map((p, i) => {
      const cx = padL + slot * i + slot / 2;
      const yy = y(p.value);
      const h = padT + innerH - yy;
      const fill = p.highlight ? `url(#${id})` : '#cfe6e7';
      const lbl =
        i % labelStep === 0 || i === n - 1
          ? `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8aa0a6">${p.label}</text>`
          : '';
      return `<rect x="${cx - bw / 2}" y="${yy}" width="${bw}" height="${Math.max(2, h)}" rx="4" fill="${fill}">
          <title>${p.label}: ${valueFmt(p.value)}</title></rect>${lbl}`;
    })
    .join('');

  el.innerHTML = `
  <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" font-family="Inter, sans-serif">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${AQUA}"/><stop offset="100%" stop-color="${color}"/>
    </linearGradient></defs>
    ${grid}${bars}
  </svg>`;
}

// -----------------------------------------------------------------------------
// Sparkline (inline)
// -----------------------------------------------------------------------------

export function sparklineSVG(values: number[], opts: { w?: number; h?: number; color?: string } = {}): string {
  const { w = 120, h = 34, color = BRAND } = opts;
  if (values.length < 2) return `<svg width="${w}" height="${h}"></svg>`;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 3 - ((v - min) / range) * (h - 6);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const id = nextId();
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="M ${x(0)},${h} L ${pts.join(' L ')} L ${x(values.length - 1)},${h} Z" fill="url(#${id})"/>
    <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(values.length - 1)}" cy="${y(values[values.length - 1])}" r="2.4" fill="${color}"/>
  </svg>`;
}

// -----------------------------------------------------------------------------
// Halve-cirkel gauge (bezettingsgraad)
// -----------------------------------------------------------------------------

export function gaugeSVG(percent: number, opts: { size?: number; color?: string; label?: string } = {}): string {
  const { size = 150, color = BRAND, label = '' } = opts;
  const p = Math.max(0, Math.min(100, percent));
  const w = size;
  const h = size * 0.62;
  const cx = w / 2;
  const cy = h - 6;
  const r = w / 2 - 12;
  const a = Math.PI * (1 - p / 100);
  const ex = cx + r * Math.cos(a);
  const ey = cy - r * Math.sin(a);
  const id = nextId();
  const track = `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${cx + r},${cy}`;
  const val = `M ${cx - r},${cy} A ${r},${r} 0 0 1 ${ex.toFixed(2)},${ey.toFixed(2)}`;
  return `<svg width="${w}" height="${h + 18}" viewBox="0 0 ${w} ${h + 18}" font-family="Inter Tight, Inter, sans-serif">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#18c3c0"/><stop offset="100%" stop-color="${color}"/>
    </linearGradient></defs>
    <path d="${track}" fill="none" stroke="#e6eef0" stroke-width="11" stroke-linecap="round"/>
    <path d="${val}" fill="none" stroke="url(#${id})" stroke-width="11" stroke-linecap="round"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="26" font-weight="800" fill="#082730">${Math.round(p)}<tspan font-size="14">%</tspan></text>
    <text x="${cx}" y="${h + 12}" text-anchor="middle" font-size="11" fill="#8aa0a6">${label}</text>
  </svg>`;
}
