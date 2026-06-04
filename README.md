# Peil — watermonitoring voor minicampings

Demo van een regionale tool waarmee minicampings wekelijks hun **waterstand** vastleggen,
aangevuld met **aantal bezoekers** en **bezetting**. Peil rekent daar verbruik, liter per gast
en bezettingsgraad uit, toont trends per week en vergelijkt locaties. Later: automatisch uitlezen
via **HomeWizard**.

## Stack
- Astro 6 + Tailwind v4 + TypeScript
- Datalaag: `localStorage` (nog geen database). Seed-data wordt bij eerste bezoek gegenereerd
  rond de huidige ISO-week, zodat de demo altijd actueel oogt.
- Charts: eigen lichte SVG-renderers (`src/lib/charts.ts`), geen externe libs.

## Draaien
```bash
npm install
npm run dev        # http://localhost:4377
```

## Pagina's
- `/` — landing die het concept uitlegt
- `/dashboard` — regio-overzicht: KPI's, weekverloop, status deze week, per camping
- `/invoer` — wekelijkse registratie met live berekening
- `/campings` + `/camping?c=<slug>` — locaties en hun weekhistorie
- `/analyse` — benchmark, liter per gast, ranglijst
- `/homewizard` — toekomstige koppeling (met gesimuleerde uitlezing)

Reset de demo-data via de knop in de zijbalk/footer.

## Afbeeldingen
AI-gegenereerd met Nano Banana Pro (Gemini 3 Pro Image):
```bash
npm run generate:images                 # ontbrekende
npm run generate:images -- --only=hero-minicamping --force
```
Vereist `GEMINI_API_KEY` (shell-env of `.env`). Output in `public/images/`.
