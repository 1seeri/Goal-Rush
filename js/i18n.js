// Interface translations for the three host-nation languages.
const STRINGS = {
  en: {
    rewind: 'Rewind', bracket: 'Bracket', simulate: 'Simulator', matches: 'Matches', map: 'Host cities', stats: 'Stats', admin: 'Admin',
    myTeam: 'My team', none: 'None', dragHint: 'Drag through the tournament', onThisDay: 'On this day', noMatches: 'No matches on this day. Rest day.',
    groupStage: 'Group stage', soFar: 'Tournament so far', played: 'Matches played', goals: 'Goals', perGame: 'Goals per game', leader: 'Top scorer',
    whatIf: 'What-if mode', reset: 'Back to reality', share: 'Copy share link', copied: 'Link copied', yourChamp: 'Your champion', realChamp: 'Real champion',
    editGroups: 'Change a group result', pickWinner: 'Pick a winner', run: 'Run simulations', runs: 'Runs', titleOdds: 'Chance of winning the cup',
    likelyFinal: 'Most likely final', predictor: 'Match predictor', search: 'Search players or teams', goldenBoot: 'Golden Boot race', records: 'Records',
    compare: 'Compare two teams', venue: 'Venue', kickoff: 'Kickoff', theme: 'Theme', lang: 'Language', close: 'Close', fullTime: 'Full time', halfTime: 'Half time',
    afterEt: 'After extra time', pens: 'Penalties', expected: 'What the model expected', upset: 'Upset', team: 'Team', save: 'Save', saved: 'Saved',
    allStages: 'All stages', allTeams: 'All teams', allVenues: 'All venues', modelNote: 'The model only knows results up to the date on the timeline.'
  },
  es: {
    rewind: 'Rebobinar', bracket: 'Cuadro', simulate: 'Simulador', matches: 'Partidos', map: 'Sedes', stats: 'Estadísticas', admin: 'Admin',
    myTeam: 'Mi equipo', none: 'Ninguno', dragHint: 'Desliza por el torneo', onThisDay: 'En este día', noMatches: 'Sin partidos este día. Día de descanso.',
    groupStage: 'Fase de grupos', soFar: 'El torneo hasta ahora', played: 'Partidos jugados', goals: 'Goles', perGame: 'Goles por partido', leader: 'Máximo goleador',
    whatIf: 'Modo «¿y si…?»', reset: 'Volver a la realidad', share: 'Copiar enlace', copied: 'Enlace copiado', yourChamp: 'Tu campeón', realChamp: 'Campeón real',
    editGroups: 'Cambia un resultado de grupo', pickWinner: 'Elige un ganador', run: 'Simular', runs: 'Simulaciones', titleOdds: 'Probabilidad de ganar la copa',
    likelyFinal: 'Final más probable', predictor: 'Predictor de partidos', search: 'Busca jugadores o equipos', goldenBoot: 'Carrera por la Bota de Oro', records: 'Récords',
    compare: 'Compara dos equipos', venue: 'Estadio', kickoff: 'Inicio', theme: 'Tema', lang: 'Idioma', close: 'Cerrar', fullTime: 'Final', halfTime: 'Descanso',
    afterEt: 'Tras la prórroga', pens: 'Penales', expected: 'Lo que esperaba el modelo', upset: 'Sorpresa', team: 'Equipo', save: 'Guardar', saved: 'Guardado',
    allStages: 'Todas las fases', allTeams: 'Todos los equipos', allVenues: 'Todas las sedes', modelNote: 'El modelo solo conoce los resultados hasta la fecha elegida.'
  },
  fr: {
    rewind: 'Rembobiner', bracket: 'Tableau', simulate: 'Simulateur', matches: 'Matchs', map: 'Villes hôtes', stats: 'Statistiques', admin: 'Admin',
    myTeam: 'Mon équipe', none: 'Aucune', dragHint: 'Faites glisser le tournoi', onThisDay: 'Ce jour-là', noMatches: 'Aucun match ce jour-là. Jour de repos.',
    groupStage: 'Phase de groupes', soFar: 'Le tournoi jusqu’ici', played: 'Matchs joués', goals: 'Buts', perGame: 'Buts par match', leader: 'Meilleur buteur',
    whatIf: 'Mode « et si… »', reset: 'Retour à la réalité', share: 'Copier le lien', copied: 'Lien copié', yourChamp: 'Votre champion', realChamp: 'Vrai champion',
    editGroups: 'Changez un résultat de groupe', pickWinner: 'Choisissez un vainqueur', run: 'Lancer les simulations', runs: 'Simulations', titleOdds: 'Chances de gagner la coupe',
    likelyFinal: 'Finale la plus probable', predictor: 'Prédicteur de match', search: 'Cherchez joueurs ou équipes', goldenBoot: 'Course au Soulier d’or', records: 'Records',
    compare: 'Comparez deux équipes', venue: 'Stade', kickoff: 'Coup d’envoi', theme: 'Thème', lang: 'Langue', close: 'Fermer', fullTime: 'Fin du match', halfTime: 'Mi-temps',
    afterEt: 'Après prolongation', pens: 'Tirs au but', expected: 'Ce que prévoyait le modèle', upset: 'Surprise', team: 'Équipe', save: 'Enregistrer', saved: 'Enregistré',
    allStages: 'Toutes les phases', allTeams: 'Toutes les équipes', allVenues: 'Tous les stades', modelNote: 'Le modèle ne connaît que les résultats jusqu’à la date choisie.'
  }
};
let lang = 'en';
try { lang = localStorage.getItem('ft-lang') || (navigator.language || 'en').slice(0, 2); } catch {}
if (!STRINGS[lang]) lang = 'en';
export const t = k => STRINGS[lang][k] ?? STRINGS.en[k] ?? k;
export const getLang = () => lang;
export function setLang(l) { lang = STRINGS[l] ? l : 'en'; try { localStorage.setItem('ft-lang', lang); } catch {} document.documentElement.lang = lang; }
export const LANGS = { en: 'English', es: 'Español', fr: 'Français' };
export const fmtDate = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(iso + 'T12:00:00').toLocaleDateString(lang, opts);
