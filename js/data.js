// =============================================================
//  data.js — loads match data (from the local API if the Node
//  server is running, otherwise from the static JSON files) and
//  holds reference info: team codes/colours and the 16 venues.
// =============================================================
import { normalise } from './engine.js';

export async function loadData() {
  let raw, groups, source = 'api';
  try {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) throw new Error('hosted');
    const r = await fetch('/api/matches');
    if (!r.ok) throw new Error('no api');
    raw = await r.json();
  } catch {
    source = 'static';
    raw = await (await fetch('data/worldcup.json')).json();
  }
  groups = await (await fetch('data/worldcup.groups.json')).json();
  return { ...normalise(raw, groups), source };
}

// FIFA trigram + primary kit colour for the 48 nations
export const TEAMS = {
  'Mexico': ['MEX', '#006847'], 'South Africa': ['RSA', '#FFB612'], 'South Korea': ['KOR', '#C60C30'], 'Czech Republic': ['CZE', '#D7141A'],
  'Canada': ['CAN', '#D80621'], 'Bosnia & Herzegovina': ['BIH', '#002395'], 'Qatar': ['QAT', '#8A1538'], 'Switzerland': ['SUI', '#DA291C'],
  'Brazil': ['BRA', '#F7C900'], 'Morocco': ['MAR', '#C1272D'], 'Haiti': ['HAI', '#00209F'], 'Scotland': ['SCO', '#0065BD'],
  'USA': ['USA', '#0A3161'], 'Paraguay': ['PAR', '#D52B1E'], 'Australia': ['AUS', '#FFCD00'], 'Turkey': ['TUR', '#E30A17'],
  'Germany': ['GER', '#1B1B1B'], 'Curaçao': ['CUW', '#002B7F'], 'Ivory Coast': ['CIV', '#F77F00'], 'Ecuador': ['ECU', '#FFDD00'],
  'Netherlands': ['NED', '#F36C21'], 'Japan': ['JPN', '#0B2A6F'], 'Sweden': ['SWE', '#FECC02'], 'Tunisia': ['TUN', '#E70013'],
  'Belgium': ['BEL', '#C8102E'], 'Egypt': ['EGY', '#CE1126'], 'Iran': ['IRN', '#239F40'], 'New Zealand': ['NZL', '#2B2B2B'],
  'Spain': ['ESP', '#C60B1E'], 'Cape Verde': ['CPV', '#003893'], 'Saudi Arabia': ['KSA', '#006C35'], 'Uruguay': ['URU', '#5CBFEB'],
  'France': ['FRA', '#002654'], 'Senegal': ['SEN', '#00853F'], 'Iraq': ['IRQ', '#007A3D'], 'Norway': ['NOR', '#BA0C2F'],
  'Argentina': ['ARG', '#6CACE4'], 'Algeria': ['ALG', '#006233'], 'Austria': ['AUT', '#ED2939'], 'Jordan': ['JOR', '#007A3D'],
  'Portugal': ['POR', '#B5121B'], 'DR Congo': ['COD', '#007FFF'], 'Uzbekistan': ['UZB', '#0099B5'], 'Colombia': ['COL', '#FCD116'],
  'England': ['ENG', '#CF081F'], 'Croatia': ['CRO', '#E01E24'], 'Ghana': ['GHA', '#006B3F'], 'Panama': ['PAN', '#DA121A']
};
export const code = t => (TEAMS[t] || [t?.slice(0, 3).toUpperCase() || '—'])[0];
export const colour = t => (TEAMS[t] || [0, '#888'])[1];

// The 16 host venues (key = the "ground" string in the data)
// The 16 host venues (key = the "ground" string in the data).
// cap = official FIFA World Cup 2026 capacity; home = everyday tenants.
export const VENUES = {
  'Mexico City': { wiki: 'Estadio_Azteca', stadium: 'Estadio Azteca', fifa: 'Mexico City Stadium', country: 'MEX', lat: 19.30, lon: -99.15, cap: 80824, opened: 1966, home: 'Club América and the Mexico national team', note: 'The first stadium to host World Cup matches in three different tournaments: 1970, 1986 and 2026.' },
  'Guadalajara (Zapopan)': { wiki: 'Estadio_Akron', stadium: 'Estadio Akron', fifa: 'Guadalajara Stadium', country: 'MEX', lat: 20.68, lon: -103.46, cap: 45664, opened: 2010, home: 'Chivas de Guadalajara' },
  'Monterrey (Guadalupe)': { wiki: 'Estadio_BBVA', stadium: 'Estadio BBVA', fifa: 'Monterrey Stadium', country: 'MEX', lat: 25.67, lon: -100.24, cap: 51243, opened: 2015, home: 'CF Monterrey', note: 'Its open end frames the Cerro de la Silla mountain.' },
  'Toronto': { wiki: 'BMO_Field', stadium: 'BMO Field', fifa: 'Toronto Stadium', country: 'CAN', lat: 43.63, lon: -79.42, cap: 43036, opened: 2007, home: 'Toronto FC and the Toronto Argonauts', note: 'The smallest venue of the tournament.' },
  'Vancouver': { wiki: 'BC_Place', stadium: 'BC Place', fifa: 'BC Place Vancouver', country: 'CAN', lat: 49.28, lon: -123.11, cap: 52497, opened: 1983, home: 'Vancouver Whitecaps and the BC Lions' },
  'Atlanta': { wiki: 'Mercedes-Benz_Stadium', stadium: 'Mercedes-Benz Stadium', fifa: 'Atlanta Stadium', country: 'USA', lat: 33.76, lon: -84.40, cap: 68239, opened: 2017, home: 'Atlanta United and the Atlanta Falcons' },
  'Boston (Foxborough)': { wiki: 'Gillette_Stadium', stadium: 'Gillette Stadium', fifa: 'Boston Stadium', country: 'USA', lat: 42.09, lon: -71.26, cap: 64146, opened: 2002, home: 'New England Revolution and the New England Patriots' },
  'Dallas (Arlington)': { wiki: 'AT%26T_Stadium', stadium: 'AT&T Stadium', fifa: 'Dallas Stadium', country: 'USA', lat: 32.75, lon: -97.09, cap: 70649, opened: 2009, home: 'the Dallas Cowboys' },
  'Houston': { wiki: 'NRG_Stadium', stadium: 'NRG Stadium', fifa: 'Houston Stadium', country: 'USA', lat: 29.68, lon: -95.41, cap: 68777, opened: 2002, home: 'the Houston Texans' },
  'Kansas City': { wiki: 'Arrowhead_Stadium', stadium: 'Arrowhead Stadium', fifa: 'Kansas City Stadium', country: 'USA', lat: 39.05, lon: -94.48, cap: 69045, opened: 1972, home: 'the Kansas City Chiefs' },
  'Los Angeles (Inglewood)': { wiki: 'SoFi_Stadium', stadium: 'SoFi Stadium', fifa: 'Los Angeles Stadium', country: 'USA', lat: 33.95, lon: -118.34, cap: 70492, opened: 2020, home: 'the LA Rams and LA Chargers' },
  'Miami (Miami Gardens)': { wiki: 'Hard_Rock_Stadium', stadium: 'Hard Rock Stadium', fifa: 'Miami Stadium', country: 'USA', lat: 25.96, lon: -80.24, cap: 64478, opened: 1987, home: 'the Miami Dolphins' },
  'New York/New Jersey (East Rutherford)': { wiki: 'MetLife_Stadium', stadium: 'MetLife Stadium', fifa: 'New York New Jersey Stadium', country: 'USA', lat: 40.81, lon: -74.07, cap: 80663, opened: 2010, home: 'the New York Giants and New York Jets' },
  'Philadelphia': { wiki: 'Lincoln_Financial_Field', stadium: 'Lincoln Financial Field', fifa: 'Philadelphia Stadium', country: 'USA', lat: 39.90, lon: -75.17, cap: 68324, opened: 2003, home: 'the Philadelphia Eagles' },
  'San Francisco Bay Area (Santa Clara)': { wiki: 'Levi%27s_Stadium', stadium: "Levi's Stadium", fifa: 'San Francisco Bay Area Stadium', country: 'USA', lat: 37.40, lon: -121.97, cap: 68827, opened: 2014, home: 'the San Francisco 49ers' },
  'Seattle': { wiki: 'Lumen_Field', stadium: 'Lumen Field', fifa: 'Seattle Stadium', country: 'USA', lat: 47.59, lon: -122.33, cap: 66925, opened: 2002, home: 'Seattle Sounders and the Seattle Seahawks' }
};
export const slug = g => cityName(g).toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '');
export const COUNTRY = { USA: 'United States', CAN: 'Canada', MEX: 'Mexico' };
// Readable text colour on top of a kit colour (WCAG relative luminance)
export function onColour(t) {
  const h = colour(t).slice(1), [r, g, b] = [0, 2, 4].map(i => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; });
  return .2126 * r + .7152 * g + .0722 * b > .32 ? '#0B1E14' : '#FFFFFF';
}
export const cityName = g => g.replace(/ \(.*\)/, '');
