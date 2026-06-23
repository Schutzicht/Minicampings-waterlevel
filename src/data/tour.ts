// Stappen voor de rondleiding (DemoTour). Loopt door over paginanavigatie heen.

export interface TourStop {
  group: string;
  route: string;
  selector?: string;
  title: string;
  body: string;
  center?: boolean;
}

export const TOUR_GROUPS = ['Overzicht', 'Invoeren', 'Vergelijken', 'Slim & beheer'];

export const TOUR: TourStop[] = [
  {
    group: 'Overzicht',
    route: '/dashboard',
    selector: '#tour-kpi',
    title: 'Je dashboard',
    body: 'In één oogopslag het waterverbruik, het verbruik per gast, de bezetting en het aantal bezoekers van de laatste week.',
  },
  {
    group: 'Overzicht',
    route: '/dashboard',
    selector: '#roleChip',
    title: 'Wissel van rol',
    body: 'Schakel tussen de regio-beheerder (ziet alle campings) en een camping-eigenaar (ziet en vult alleen de eigen camping in).',
  },
  {
    group: 'Overzicht',
    route: '/dashboard',
    selector: '#weekPill',
    title: 'Status van deze week',
    body: 'Hier zie je meteen of de invoer van deze week al binnen is. Eén klik brengt je naar het invoerscherm.',
  },
  {
    group: 'Invoeren',
    route: '/invoer',
    selector: '#invoerForm',
    title: 'Wekelijks invoeren',
    body: 'Kies de week en noteer de meterstand, het aantal bezoekers en de bezetting. Veel meer is het niet.',
  },
  {
    group: 'Invoeren',
    route: '/invoer',
    selector: '#tour-calc',
    title: 'Direct berekend',
    body: 'Peil rekent live je verbruik en je liter per gast uit, zodat je meteen ziet wat de cijfers betekenen.',
  },
  {
    group: 'Vergelijken',
    route: '/campings',
    selector: '#campingGrid',
    title: 'Al je locaties',
    body: 'Elke camping met verbruik, liter per gast en bezetting. Klik een camping aan voor de volledige weekhistorie.',
  },
  {
    group: 'Vergelijken',
    route: '/analyse',
    selector: '#benchChart',
    title: 'Vergelijk je verbruik',
    body: 'Zet de campings naast elkaar op liter per gast. Lager is zuiniger. Zo zie je waar je staat en waar je kunt bijsturen.',
  },
  {
    group: 'Slim & beheer',
    route: '/homewizard',
    selector: '#hw-read',
    title: 'Straks automatisch',
    body: 'Met een HomeWizard Watermeter leest Peil de waterstand straks vanzelf uit. Hier kun je je camping daarvoor aanmelden.',
  },
  {
    group: 'Slim & beheer',
    route: '/instellingen',
    selector: '#tour-profiel',
    title: 'Eenmalig instellen',
    body: 'Stel je camping één keer in: aantal plekken, soorten plekken en winterkamperen. En zet je wekelijkse herinnering aan.',
  },
];
