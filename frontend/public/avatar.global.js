/* Generiert von tools/build_assets.py aus avatar.js - nicht von Hand aendern.
   Klassische Script-Variante fuer Seiten, die ohne Server laufen muessen:
   <script src="assets/avatar.global.js"></script>  ->  window.Avatar
   Fuer Bundler und moderne Projekte weiter avatar.js importieren. */
(function () {
/**
 * Erzeugt Avatare als Data-URI - kein Netzwerk-Request, kein Build-Schritt.
 *
 *   import { playerUrl } from './assets/avatar.js'
 *   <img src={playerUrl('Jonas Weber', { gender: 'm' })} width="40" height="40" alt="">
 *
 * Drei Funktionen:
 *   playerUrl   Figur mit Initiale auf dem Oberkoerper - der Standardfall
 *   avatarUrl   nur die Initiale auf farbiger Scheibe
 *   personUrl   nur die Figur, ohne Namen
 *
 * Ab Werk schaltet playerUrl unter 32 px selbst auf avatarUrl um: in der
 * Groesse ist die Figur ein grauer Fleck und die Initiale traegt mehr.
 */

// Brandfarben der Frontend-Avatare; die App kann sie per Farboption anpassen.
const PALETTE = [
  ['#12355B', '#12355B'],
]

const FONT =
  "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Unter dieser Kantenlaenge entfaellt die Figur, es bleibt die Initiale. */
const SILHOUETTE_MIN_SIZE = 32

// --- Figur im 64x64-System -------------------------------------------------
// Geschlecht nur ueber die Haare; Kopf und Koerper sind fuer alle identisch.
// Die neutrale Fassung dieser Pfade steht auch in assets/avatar-silhouette.svg.
// Die Straehnen enden bei y=37, also oberhalb der Schultern (y=38). Dadurch
// trennt der Hals-Zwischenraum Haar und Koerper. Reichten sie tiefer, wuerden
// beide zu einer Flaeche verschmelzen - es ist dieselbe Fuellfarbe.
const HAIR =
  'M17 37V28C17 18.6 23.7 11.5 32 11.5S47 18.6 47 28v9' +
  'a3 3 0 0 0-6 0V28c0-5.6-3.9-9.8-9-9.8S23 22.4 23 28v9a3 3 0 0 0-6 0Z'
const HEAD = '<circle cx="32" cy="25" r="10"/>'
// Der Koerper laeuft bis zur Unterkante und wird vom clipPath gerundet.
// Frueher endete er vorher - dann ragte die Initiale unten heraus und
// verschwand, weil sie in Hintergrundfarbe gefuellt ist.
const TORSO =
  '<path d="M32 38c-11.5 0-20.5 7.4-20.5 16.5V64h41V54.5C52.5 45.4 43.5 38 32 38Z"/>'
const NEUTRAL_BG = '#E2E8F0'
const NEUTRAL_FIGURE = '#94A3B8'

/** Stabiler Hash, damit derselbe Name immer dieselbe Farbe bekommt. */
function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Anteil t Weiss beimischen - fuer die helle Scheibe hinter der Figur. */
function tint(hex, t) {
  const n = parseInt(hex.slice(1), 16)
  return (
    '#' +
    [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, '0'))
      .join('')
  )
}

/**
 * "Lena Andersen" -> "LA", mit letters=1 -> "L".
 * Ohne Name: "?". Einzelname: nur dessen erster Buchstabe.
 */
function initials(name = '', letters = 2) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  // [...] statt [0], damit zusammengesetzte Zeichen nicht zerfallen.
  const first = [...parts[0]][0] ?? ''
  if (letters < 2 || parts.length < 2) return first.toUpperCase()
  return (first + ([...parts[parts.length - 1]][0] ?? '')).toUpperCase()
}

const escapeXml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])

function wrap(size, inner) {
  // encodeURIComponent statt btoa: funktioniert auch mit Umlauten und Nicht-Latin-Namen.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" ` +
    `width="${size}" height="${size}">${inner}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const gradient = (id, from, to) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">` +
  `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>`

const label = (text, y, fontSize, fill) =>
  `<text x="32" y="${y}" fill="${fill}" text-anchor="middle" dominant-baseline="central" ` +
  `font-family="${FONT}" font-size="${fontSize}" font-weight="700">${text}</text>`

/**
 * Figur bauen. clipPath, damit Haare und Schultern am Kreisrand enden.
 * Die Initiale sitzt auf dem Oberkoerper - dort ist die Figur am breitesten.
 */
function figure(id, bg, fill, gender, text) {
  const size = text.length > 1 ? 15 : 18
  return (
    `<clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath>` +
    `<circle cx="32" cy="32" r="32" fill="${bg}"/>` +
    `<g clip-path="url(#${id})">` +
    `<g fill="${fill}">` +
    // Haar hinter den Kopf: der Kopf deckt die innere Kontur ab, sichtbar
    // bleiben die Straehnen neben Gesicht und Hals.
    (gender === 'w' ? `<path d="${HAIR}"/>` : '') +
    HEAD +
    TORSO +
    `</g>` +
    (text ? label(text, 52, size, bg) : '') +
    `</g>`
  )
}

/** Farbpaar und helle Scheibe zu einem Namen. Ohne Namen neutral grau. */
function colors(name, color = null) {
  if (color) return { from: color, to: color, bg: tint(color, 0.88) }
  if (!name) return { from: NEUTRAL_FIGURE, to: NEUTRAL_FIGURE, bg: NEUTRAL_BG }
  const [from, to] = PALETTE[hash(name) % PALETTE.length]
  return { from, to, bg: tint(from, 0.88) }
}

/**
 * Markup einer Figur im 64er-Kaestchen. Eigene id-Endung, damit zwei davon
 * im selben SVG nebeneinander liegen koennen, ohne sich die ids zu teilen.
 */
function playerBox(name, gender, letters, suffix, color = null) {
  const { from, to, bg } = colors(name, color)
  const gid = `g${suffix}`
  return {
    defs: name || color ? gradient(gid, from, to) : '',
    body: figure(
      `c${suffix}`, bg, name || color ? `url(#${gid})` : NEUTRAL_FIGURE,
      gender, name ? escapeXml(initials(name, letters)) : ''
    ),
  }
}

/**
 * Spieler-Avatar: Figur mit Initiale auf dem Oberkoerper.
 *
 * @param {string} name                 Anzeigename; ohne Namen bleibt die Figur leer
 * @param {object} [opts]
 * @param {number} [opts.size=64]       Kantenlaenge in px
 * @param {'m'|'w'|null} [opts.gender]  'w' bekommt lange Haare
 * @param {1|2}    [opts.letters=1]     Buchstaben auf dem Oberkoerper
 * @returns {string} data:image/svg+xml,... - direkt als img.src verwendbar
 */
function playerUrl(name, { size = 64, gender = null, letters = 1, color = null } = {}) {
  // Zu klein fuer eine Figur: dann traegt die Initiale allein mehr Information.
  if (size < SILHOUETTE_MIN_SIZE) return avatarUrl(name, { size, letters, color })
  const { defs, body } = playerBox(name, gender, letters, 'p', color)
  return wrap(size, defs + body)
}

/**
 * Versatz des vorderen Avatars, als Anteil der Breite. 0.66 heisst ein Drittel
 * Ueberlappung - genug, damit die beiden als Paar lesen, aber wenig genug,
 * dass dem hinteren nicht der Kopf abgeschnitten wird.
 */
const TEAM_OFFSET = 0.66

/**
 * Zweierteam als ein Bild.
 *
 * layout 'stack'  ueberlappend, hinterer Avatar mit transparenter Aussparung.
 *                 Die Luecke ist wirklich ausgespart, nicht weiss uebermalt -
 *                 sie funktioniert damit auf jedem Hintergrund.
 * layout 'split'  geteilte Scheibe mit beiden Initialen. Kompakt genug fuer
 *                 Turnierbaeume, wo zwei Avatare nebeneinander nicht passen.
 *
 * @param {Array<{name: string, gender?: 'm'|'w'}>} players  genau zwei
 * @param {object} [opts]
 * @param {number} [opts.size=64]         Hoehe in px; 'stack' ist breiter
 * @param {'stack'|'split'} [opts.layout='stack']
 * @param {1|2} [opts.letters=1]
 */
function teamUrl(players, {
  size = 64,
  layout = 'stack',
  letters = 1,
  primaryColor = '#12355B',
  secondaryColor = '#D4AF37',
} = {}) {
  const [a, b] = players

  if (layout === 'split') {
    const ca = colors(a.name, primaryColor)
    const cb = colors(b.name, secondaryColor)
    const svg =
      gradient('ta', ca.from, ca.to) +
      gradient('tb', cb.from, cb.to) +
      // 2 Einheiten Luecke in der Mitte, damit die Haelften nicht verschmelzen.
      `<clipPath id="tl"><rect width="31" height="64"/></clipPath>` +
      `<clipPath id="tr"><rect x="33" width="31" height="64"/></clipPath>` +
      `<circle cx="32" cy="32" r="32" fill="url(#ta)" clip-path="url(#tl)"/>` +
      `<circle cx="32" cy="32" r="32" fill="url(#tb)" clip-path="url(#tr)"/>` +
      `<text x="15" y="32" fill="#fff" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="${FONT}" font-size="20" font-weight="700">${escapeXml(initials(a.name, 1))}</text>` +
      `<text x="49" y="32" fill="#fff" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="${FONT}" font-size="20" font-weight="700">${escapeXml(initials(b.name, 1))}</text>`
    return wrap(size, svg)
  }

  const dx = Math.round(64 * TEAM_OFFSET)
  const w = 64 + dx
  const small = size < SILHOUETTE_MIN_SIZE
  const boxA = small
    ? discBox(a.name, letters, 'a', primaryColor)
    : playerBox(a.name, a.gender, letters, 'a', primaryColor)
  const boxB = small
    ? discBox(b.name, letters, 'b', secondaryColor)
    : playerBox(b.name, b.gender, letters, 'b', secondaryColor)

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 64" ` +
    `width="${Math.round((size * w) / 64)}" height="${size}">` +
    boxA.defs + boxB.defs +
    // Aussparung statt Rahmen: der hintere Avatar bekommt dort ein Loch, wo
    // der vordere plus 3 Einheiten Abstand liegt.
    `<defs><mask id="tcut" maskUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="64">` +
    `<rect width="${w}" height="64" fill="#fff"/>` +
    `<circle cx="${dx + 32}" cy="32" r="35" fill="#000"/></mask></defs>` +
    `<g mask="url(#tcut)">${boxA.body}</g>` +
    `<g transform="translate(${dx} 0)">${boxB.body}</g>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Scheibe mit Initiale, ohne Figur - fuer kleine Groessen im Team-Stack. */
function discBox(name, letters, suffix, color = null) {
  const { from, to } = colors(name, color)
  const text = escapeXml(initials(name, letters))
  const gid = `d${suffix}`
  return {
    defs: gradient(gid, from, to),
    body:
      `<circle cx="32" cy="32" r="32" fill="url(#${gid})"/>` +
      label(text, 32, text.length > 1 ? 25 : 30, '#fff'),
  }
}

/**
 * Nur die Initiale auf farbiger Scheibe.
 *
 * @param {string} name
 * @param {object} [opts]
 * @param {number}  [opts.size=64]
 * @param {boolean} [opts.rounded=true] true = Kreis, false = abgerundetes Quadrat
 * @param {1|2}     [opts.letters=2]
 */
function avatarUrl(name, { size = 64, rounded = true, letters = 2, color = null } = {}) {
  const text = escapeXml(initials(name, letters))
  // Ohne Namen neutral grau: eine aus dem Leerstring gehashte Farbe waere
  // willkuerlich und wuerde den Platzhalter lauter machen als echte Spieler.
  const key = name || ''
  const [from, to] = color
    ? [color, color]
    : key
      ? PALETTE[hash(key) % PALETTE.length]
      : ['#CBD5E1', '#94A3B8']
  const id = `g${hash(key || 'x').toString(36)}`
  const shape = rounded
    ? `<circle cx="32" cy="32" r="32" fill="url(#${id})"/>`
    : `<rect width="64" height="64" rx="14" fill="url(#${id})"/>`
  // Ein Buchstabe vertraegt mehr Groesse, drei brauchen weniger.
  const fontSize = text.length > 2 ? 20 : text.length > 1 ? 25 : 30

  return wrap(size, gradient(id, from, to) + shape + label(text, 32, fontSize, '#fff'))
}

/**
 * Figur ohne Namen - neutrales Grau, nur die Haare richten sich nach gender.
 *
 * @param {object} [opts]
 * @param {number} [opts.size=64]
 * @param {'m'|'w'|null} [opts.gender]
 */
function personUrl({ size = 64, gender = null } = {}) {
  return wrap(size, figure('n', NEUTRAL_BG, NEUTRAL_FIGURE, gender, ''))
}

  window.Avatar = { SILHOUETTE_MIN_SIZE, initials, playerUrl, teamUrl, avatarUrl, personUrl }
})();
