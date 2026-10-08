const sectionDefinitions = [
  { id: 3, short: 'Stammdaten', title: 'Stammdaten', description: 'Gib deinem Turnier einen Namen und lege die wichtigsten Eckdaten fest.' },
  { id: 4, short: 'Teilnehmende & Teams', title: 'Teilnehmende & Teams', description: 'Verwalte Einzelpersonen, bilde Teams und füge die Einträge zum Turnier hinzu.' },
  { id: 5, short: 'Spielmodus & Phasen', title: 'Spielmodus & Phasen', description: 'Der erste Spielmodus ist auf 16 Einträge in vier Gruppen ausgelegt.' },
  { id: 6, short: 'Regeln je Phase', title: 'Regeln je Phase', description: 'Lege die Dartregeln für jede Turnierphase individuell fest.' },
  { id: 7, short: 'Auslosung', title: 'Auslosung', description: 'Verteile die Turniereinträge zufällig auf die Gruppen.' },
  { id: 8, short: 'Ergebnis-Clients', title: 'Registrierung der Ergebnis-Clients', description: 'Konfiguriere Dartboards und den Zugriff für die Ergebnis-Clients.' },
  { id: 9, short: 'Broadcasting', title: 'Broadcasting-Einstellungen', description: 'Die Slideshow-Einstellungen sind für einen späteren Schritt vorgemerkt.' },
  { id: 10, short: 'Turnierstart & Ergebnisse', title: 'Turnierstart & Ergebnisse', description: 'Starte das Turnier und behalte Begegnungen und Resultate im Blick.' }
];

const state = {
  tournaments: [],
  persons: [],
  teams: [],
  entries: [],
  activeView: 1,
  currentStep: 3,
  currentTournamentId: null,
  currentTournamentName: 'Neues Turnier',
  drawGroups: null,
  configuration: {}
};

const noticeElement = document.getElementById('notice');
const stepContentElement = document.querySelector('[data-step-content]');
const stepNavigationElement = document.querySelector('[data-step-nav]');
const broadcastIsActive = false;
let noticeTimeout;

const statusIcons = {
  server: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" />',
  serverOff: '<path d="M7 2h13a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-5" /><path d="M10 10 2.5 2.5C2 2 2 2.5 2 5v3a2 2 0 0 0 2 2h6z" /><path d="M22 17v-1a2 2 0 0 0-2-2h-1" /><path d="M4 14a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h16.5l1-.5.5.5-8-8H4z" /><path d="M6 18h.01" /><path d="m2 2 20 20" />',
  databaseCheck: '<path d="m16 19 2 2 4-4" /><path d="M21 13.127V5" /><path d="M3 12A9 3 0 0 0 21 12" /><path d="M3 5V19A9 3 0 0 0 13.318 21.968" /><ellipse cx="12" cy="5" rx="9" ry="3" />',
  databaseX: '<path d="m17 17 5 5" /><path d="M19.323 13.744A9 3 0 0 0 21 12" /><path d="M21 13.127V5" /><path d="m22 17-5 5" /><path d="M3 12A9 3 0 0 0 13.563 14.954" /><path d="M3 5V19A9 3 0 0 0 13 21.981" /><ellipse cx="12" cy="5" rx="9" ry="3" />'
};

function setServiceStatus(element, status, label, detail, icon) {
  element.classList.remove('is-checking', 'is-idle', 'is-available', 'is-unavailable');
  element.classList.add(status);
  const title = detail ? `${label} · ${detail}` : label;
  element.setAttribute('aria-label', title);
  element.title = title;
  if (icon) element.querySelector('svg').innerHTML = icon;
}

async function checkJsonEndpoint(url, isAvailable) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return { available: false, detail: `HTTP ${response.status}` };
    const data = await response.json();
    return isAvailable(data)
      ? { available: true, detail: '' }
      : { available: false, detail: 'Dienst meldet nicht bereit' };
  } catch (error) {
    return { available: false, detail: error.message || 'Verbindung fehlgeschlagen' };
  }
}

async function checkBroadcastEndpoint() {
  try {
    const response = await fetch('/display', { method: 'HEAD', cache: 'no-store' });
    return response.ok
      ? { available: true, detail: '' }
      : { available: false, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { available: false, detail: error.message || 'Verbindung fehlgeschlagen' };
  }
}

async function refreshHeaderStatuses() {
  const [backend, database, broadcast] = await Promise.all([
    checkJsonEndpoint('/api/health', (data) => data.status === 'ok' && data.service === 'backend'),
    checkJsonEndpoint('/api/ready', (data) => data.ok === true && data.checks?.database === 'ok'),
    checkBroadcastEndpoint()
  ]);

  setServiceStatus(
    document.getElementById('backendHealthStatus'),
    backend.available ? 'is-available' : 'is-unavailable',
    `Backend: ${backend.available ? 'erreichbar' : 'nicht erreichbar'}`,
    backend.detail,
    backend.available ? statusIcons.server : statusIcons.serverOff
  );
  setServiceStatus(
    document.getElementById('databaseHealthStatus'),
    database.available ? 'is-available' : 'is-unavailable',
    `Datenbank: ${database.available ? 'erreichbar' : 'nicht erreichbar'}`,
    database.detail,
    database.available ? statusIcons.databaseCheck : statusIcons.databaseX
  );

  const broadcastStatus = document.getElementById('broadcastStatus');
  const broadcastState = broadcast.available
    ? (broadcastIsActive ? 'is-available' : 'is-idle')
    : 'is-unavailable';
  const broadcastLabel = !broadcast.available
    ? 'Broadcasting: nicht erreichbar'
    : broadcastIsActive
      ? 'Broadcasting: aktiv'
      : 'Broadcasting: erreichbar, nicht aktiv';
  setServiceStatus(broadcastStatus, broadcastState, broadcastLabel, broadcast.detail, null);
  broadcastStatus.disabled = !broadcast.available || !broadcastIsActive;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function showNotice(message, kind = 'success') {
  window.clearTimeout(noticeTimeout);
  noticeElement.textContent = message;
  noticeElement.className = `notice show ${kind}`;
  noticeTimeout = window.setTimeout(() => {
    noticeElement.className = 'notice';
  }, 4200);
}

function statusLabel(status) {
  return ({
    draft: 'Entwurf',
    open: 'Offen',
    running: 'Laufend',
    finished: 'Beendet'
  })[status] || status || 'Entwurf';
}

function statusClass(status) {
  return ({
    open: 'is-open',
    running: 'is-running',
    finished: 'is-finished'
  })[status] || '';
}

function formatDate(value) {
  if (!value) return 'Noch offen';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Der Server hat eine ungültige Antwort zurückgegeben.');
  }

  if (!response.ok) {
    throw new Error(data.message || 'Anfrage fehlgeschlagen.');
  }
  return data;
}

function setActiveView(viewId) {
  const parsedId = Number(viewId);
  if (parsedId === 1 || parsedId === 2) {
    state.activeView = parsedId;
  } else if (parsedId >= 3 && parsedId <= 10) {
    state.activeView = 3;
    state.currentStep = parsedId;
    renderStep();
  } else {
    return;
  }

  document.querySelectorAll('[data-view-panel]').forEach((panel) => {
    const active = Number(panel.dataset.viewPanel) === state.activeView;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });

  if (state.activeView === 3) {
    renderStepNavigation();
    document.getElementById('workflowTournamentName').textContent = state.currentTournamentName;
  }
  hideNotice();
}

function hideNotice() {
  noticeElement.className = 'notice';
}

function renderStepNavigation() {
  stepNavigationElement.innerHTML = sectionDefinitions.map((section) => `
    <button class="step-nav-button" type="button" data-view="${section.id}" aria-current="${state.currentStep === section.id ? 'step' : 'false'}">
      <span class="step-number">${section.id}</span>
      <span class="step-nav-label">${escapeHtml(section.short)}</span>
    </button>
  `).join('');
}

function stepHeading(section) {
  return `<div class="step-heading"><h1 id="viewTitle-${section.id}">${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p></div>`;
}

function renderTournamentRow(tournament) {
  return `
    <article class="tournament-row">
      <strong class="tournament-name">${escapeHtml(tournament.name)}</strong>
      <span class="row-status"><span class="row-label">Status</span><span class="status-pill ${statusClass(tournament.status)}">${escapeHtml(statusLabel(tournament.status))}</span></span>
      <span class="row-value row-date"><span class="row-label">Datum</span>${escapeHtml(formatDate(tournament.tournament_date))}</span>
      <span class="row-value row-description">${escapeHtml(tournament.description || 'Keine Beschreibung')}</span>
      <button class="row-open" type="button" data-open-tournament="${escapeHtml(tournament.id)}">Öffnen <span aria-hidden="true">→</span></button>
    </article>`;
}

function renderTournaments() {
  const running = state.tournaments.filter((item) => item.status === 'running').length;
  const finished = state.tournaments.filter((item) => item.status === 'finished').length;
  document.getElementById('tournamentCount').textContent = String(state.tournaments.length).padStart(2, '0');
  document.getElementById('runningCount').textContent = String(running).padStart(2, '0');
  document.getElementById('finishedCount').textContent = String(finished).padStart(2, '0');

  const list = document.getElementById('tournamentsList');
  if (!state.tournaments.length) {
    list.innerHTML = document.getElementById('tournamentEmptyTemplate').innerHTML;
    return;
  }
  list.innerHTML = state.tournaments.map(renderTournamentRow).join('');
}

function renderPersonTable() {
  if (!state.persons.length) return '<div class="table-empty">Noch keine Personen angelegt.</div>';
  const rows = state.persons.map((person) => `
    <tr><td>${escapeHtml(`${person.first_name} ${person.last_name}`)}</td>
    <td>${escapeHtml(person.nickname || '–')}</td>
    <td>${person.gender === 'm' ? 'Männlich' : 'Weiblich'}</td></tr>
  `).join('');
  return `<table class="data-table"><thead><tr><th>Name</th><th>Spitzname</th><th>Geschlecht</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTeamTable() {
  if (!state.teams.length) return '<div class="table-empty">Noch keine Teams angelegt.</div>';
  const rows = state.teams.map((team) => `
    <tr><td>${escapeHtml(team.name)}</td>
    <td>${escapeHtml(`${team.low_first_name || ''} ${team.low_last_name || ''}`.trim() || '–')} & ${escapeHtml(`${team.high_first_name || ''} ${team.high_last_name || ''}`.trim() || '–')}</td></tr>
  `).join('');
  return `<table class="data-table"><thead><tr><th>Team</th><th>Mitglieder</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderEntryTable() {
  const entries = state.entries.filter((entry) => entry.tournament_id === state.currentTournamentId);
  if (!entries.length) return '<div class="table-empty">Für dieses Turnier sind noch keine Teilnehmenden eingetragen.</div>';
  const rows = entries.map((entry) => {
    const participant = entry.person_first_name
      ? `${entry.person_first_name} ${entry.person_last_name}`
      : entry.team_name || 'Team';
    return `<tr><td>${escapeHtml(participant)}</td><td>${entry.person_id ? 'Einzel' : 'Team'}</td><td><button type="button" class="text-action" data-entry-delete="${escapeHtml(entry.id)}">Entfernen</button></td></tr>`;
  }).join('');
  return `<table class="data-table"><thead><tr><th>Teilnehmer</th><th>Art</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function optionsForPeople() {
  return state.persons.map((person) => {
    const label = `${person.first_name} ${person.last_name}${person.nickname ? ` (${person.nickname})` : ''}`;
    return `<option value="${escapeHtml(person.id)}">${escapeHtml(label)}</option>`;
  }).join('');
}

function optionsForTeams() {
  return state.teams.map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('');
}

function personSelect(name, label, id) {
  return `<div class="field"><label for="${id}">${label}</label><select id="${id}" name="${name}" required><option value="">Bitte wählen</option>${optionsForPeople()}</select></div>`;
}

function renderParticipantsStep(section) {
  const selectedTournament = state.currentTournamentId
    ? `<input type="hidden" name="tournamentId" value="${escapeHtml(state.currentTournamentId)}">`
    : `<div class="field full-width"><label for="entryTournament">Turnier</label><select id="entryTournament" name="tournamentId" required><option value="">Turnier wählen</option>${state.tournaments.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}</select></div>`;

  return `${stepHeading(section)}
    <div class="form-section surface-inset">
      <div class="form-section-header"><div><h2>Person neu erfassen</h2><p class="subtle-copy">Personen werden dauerhaft gespeichert und können erneut eingesetzt werden.</p></div></div>
      <form id="personForm" class="inline-form">
        <div class="field"><label for="firstName">Vorname</label><input id="firstName" name="firstName" autocomplete="given-name" required></div>
        <div class="field"><label for="lastName">Nachname</label><input id="lastName" name="lastName" autocomplete="family-name" required></div>
        <div class="field"><label for="nickname">Spitzname <span class="muted">(optional)</span></label><input id="nickname" name="nickname"></div>
        <div class="field"><label for="gender">Geschlecht</label><select id="gender" name="gender"><option value="m">Männlich</option><option value="w">Weiblich</option></select></div>
        <div class="form-actions field full-width"><button class="button button-primary" type="submit">Person hinzufügen</button></div>
      </form>
    </div>
    <div class="section-card-grid form-section">
      <div class="surface-inset">
        <div class="form-section-header"><div><h2>Team bilden</h2><p class="subtle-copy">Ein Team besteht aus zwei unterschiedlichen Personen.</p></div></div>
        <form id="teamForm">
          <div class="inline-form">
            ${personSelect('personLow', 'Person 1', 'teamPersonLow')}
            ${personSelect('personHigh', 'Person 2', 'teamPersonHigh')}
            <div class="field full-width"><label for="teamName">Teamname <span class="muted">(optional)</span></label><input id="teamName" name="name" placeholder="Wird automatisch gebildet"></div>
          </div>
          <div class="form-actions"><button class="button button-quiet" type="submit">Team speichern</button></div>
        </form>
      </div>
      <div class="surface-inset">
        <div class="form-section-header"><div><h2>Zum Turnier hinzufügen</h2><p class="subtle-copy">Einzelpersonen und Teams zählen jeweils als ein Eintrag.</p></div></div>
        <form id="entryForm">
          <div class="inline-form">
            ${selectedTournament}
            <div class="field"><label for="entryType">Art</label><select id="entryType" name="type"><option value="person">Einzelperson</option><option value="team">Team</option></select></div>
            <div class="field" id="entryPersonField"><label for="entryPerson">Person</label><select id="entryPerson" name="personId" required><option value="">Bitte wählen</option>${optionsForPeople()}</select></div>
            <div class="field" id="entryTeamField" hidden><label for="entryTeam">Team</label><select id="entryTeam" name="teamId"><option value="">Bitte wählen</option>${optionsForTeams()}</select></div>
          </div>
          <div class="form-actions"><button class="button button-quiet" type="submit">Teilnahme hinzufügen</button></div>
        </form>
      </div>
    </div>
    <div class="surface-inset">
      <div class="form-section-header"><div><h2>Turnierteilnehmende <span class="muted">(${state.entries.filter((entry) => entry.tournament_id === state.currentTournamentId).length})</span></h2><p class="subtle-copy">Personen und Teams, die bereits für dieses Turnier eingetragen sind.</p></div></div>
      <div class="data-table-wrap" id="entriesTable">${renderEntryTable()}</div>
      <hr class="section-divider">
      <div class="section-card-grid">
        <div><h2>Gespeicherte Personen</h2><div class="data-table-wrap">${renderPersonTable()}</div></div>
        <div><h2>Gespeicherte Teams</h2><div class="data-table-wrap">${renderTeamTable()}</div></div>
      </div>
    </div>`;
}

function renderBasicsStep(section) {
  return `${stepHeading(section)}
    <div class="surface-inset form-section">
      <div class="form-section-header"><div><h2>Turnierdetails</h2><p class="subtle-copy">Diese Angaben kannst du später jederzeit anpassen.</p></div><span class="phase-tag">Pflichtfeld markiert *</span></div>
      <form id="tournamentForm" class="form-grid">
        <div class="field full-width"><label for="tournamentName">Turniername *</label><input id="tournamentName" name="name" placeholder="z. B. Sommer Open 2026" required value="${escapeHtml(state.currentTournamentId ? state.currentTournamentName : '')}"></div>
        <div class="field"><label for="tournamentDate">Datum</label><input id="tournamentDate" name="tournamentDate" type="date"></div>
        <div class="field"><label for="tournamentStatus">Status</label><select id="tournamentStatus" name="status"><option value="draft">Entwurf</option><option value="open">Offen</option><option value="running">Laufend</option><option value="finished">Beendet</option></select></div>
        <div class="field full-width"><label for="tournamentDescription">Beschreibung <span class="muted">(optional)</span></label><textarea id="tournamentDescription" name="description" placeholder="Weitere Informationen zum Turnier …"></textarea></div>
        <div class="field full-width"><div class="form-actions"><button class="button button-primary" type="submit">${state.currentTournamentId ? 'Weiter zu Teilnehmenden' : 'Turnier anlegen & weiter'} <span aria-hidden="true">→</span></button></div></div>
      </form>
    </div>
    <div class="info-banner"><span aria-hidden="true">i</span><p>Du kannst die folgenden Schritte jederzeit über die Navigation links erneut öffnen. Änderungen und Speichern für die weiteren Konfigurationsschritte werden mit den passenden Backend-Endpunkten ergänzt.</p></div>`;
}

function selectOptions(values, selected) {
  return values.map((value) => `<option${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function compactSelect(id, label, options, selected = options[0]) {
  return `<div class="compact-field"><label for="${id}">${label}</label><select id="${id}" data-config>${selectOptions(options, state.configuration[id] || selected)}</select></div>`;
}

function renderModeStep(section) {
  return `${stepHeading(section)}
    <div class="summary-strip">
      <div class="summary-chip"><span>Turniereinträge</span><strong>16</strong></div>
      <div class="summary-chip"><span>Gruppen</span><strong>4</strong></div>
      <div class="summary-chip"><span>Einträge je Gruppe</span><strong>4</strong></div>
    </div>
    <div class="section-card-grid">
      <article class="surface-inset">
        <div class="form-section-header"><div><h2>Gruppenphase</h2><p class="subtle-copy">Jeder Eintrag spielt einmal gegen jeden anderen in seiner Gruppe.</p></div></div>
        <div class="form-grid three-columns">
          <div class="field"><label for="groupCount">Anzahl Gruppen</label><select id="groupCount" data-config>${selectOptions(['4'], '4')}</select></div>
          <div class="field"><label for="entriesPerGroup">Einträge je Gruppe</label><select id="entriesPerGroup" data-config>${selectOptions(['4'], '4')}</select></div>
          <div class="field"><label for="totalEntries">Einträge gesamt</label><input id="totalEntries" value="16" readonly></div>
        </div>
      </article>
      <article class="surface-inset">
        <div class="form-section-header"><div><h2>Platzierungsphasen</h2><p class="subtle-copy">Konfiguriere den Ablauf nach der Gruppenphase.</p></div></div>
        <div class="option-row"><div class="option-copy"><strong>Lucky Losers</strong><span>Separate K.-o.-Phase für die Gruppenplätze 3 und 4.</span></div><label class="toggle"><input id="luckyLosers" type="checkbox" data-config checked><span class="toggle-track"></span></label></div>
        <div class="option-row"><div class="option-copy"><strong>Zusätzliche Platzierungsspiele</strong><span>Weitere Platzierungen nach dem Ausscheiden ausspielen.</span></div><label class="toggle"><input id="placementGames" type="checkbox" data-config><span class="toggle-track"></span></label></div>
      </article>
    </div>
    <article class="surface-inset form-section" style="margin-top:14px">
      <div class="form-section-header"><div><h2>Wertung der Gruppen</h2><p class="subtle-copy">Kriterien werden in dieser Reihenfolge zum Ermitteln der Platzierung herangezogen.</p></div></div>
      <div class="summary-strip">
        <div class="summary-chip"><span>1. Kriterium</span><strong>Siege</strong></div>
        <div class="summary-chip"><span>2. Kriterium</span><strong>Gewonnene Legs</strong></div>
        <div class="summary-chip"><span>3. Kriterium</span><strong>3-Dart-Average</strong></div>
      </div>
      <p class="subtle-copy">Bei Teams zählt der Mittelwert der Averages beider Teammitglieder. Weitere Wertungsoptionen werden ergänzt.</p>
    </article>`;
}

function renderRulesStep(section) {
  const phases = ['Gruppenphase', 'K.-o.-Phase', 'Lucky Losers'];
  const cards = phases.map((phase, index) => `
    <article class="phase-card">
      <div class="phase-title"><strong>${phase}</strong><span class="phase-tag">${index === 0 ? 'Gruppen' : index === 1 ? 'Platzierung' : 'Optional'}</span></div>
      <div class="phase-controls">
        ${compactSelect(`sets-${index}`, 'Sets · First to', ['1', '2', '3', '4'], '1')}
        ${compactSelect(`legs-${index}`, 'Legs · First to', ['2', '3', '4', '5', '6'], '3')}
        ${compactSelect(`start-${index}`, 'Startpunktzahl', ['301', '501', '701', '901'], '501')}
        ${compactSelect(`in-${index}`, 'Startregel', ['Single In', 'Double In', 'Master In'], 'Single In')}
        ${compactSelect(`out-${index}`, 'Checkout', ['Single Out', 'Double Out', 'Master Out'], 'Double Out')}
        ${compactSelect(`bull-${index}`, 'Bull-Out', ['No Bullout', 'Classic', 'PDC'], 'Classic')}
      </div>
    </article>
  `).join('');
  return `${stepHeading(section)}
    <div class="info-banner form-section"><span aria-hidden="true">i</span><p>Regeln lassen sich anpassen, solange die jeweilige Phase noch nicht begonnen hat. Die folgenden Auswahlfelder sind derzeit eine Frontend-Vorschau.</p></div>
    <div class="section-card-grid">${cards}</div>`;
}

function currentTournamentEntries() {
  return state.entries.filter((entry) => entry.tournament_id === state.currentTournamentId);
}

function renderDrawStep(section) {
  const entries = currentTournamentEntries();
  const groups = state.drawGroups || [[], [], [], []];
  const names = entries.map((entry) => entry.person_first_name
    ? `${entry.person_first_name} ${entry.person_last_name}`
    : entry.team_name || 'Team');
  const groupCards = ['A', 'B', 'C', 'D'].map((letter, index) => {
    const players = groups[index] || [];
    const content = players.length
      ? players.map((name) => `<span class="group-player">${escapeHtml(name)}</span>`).join('')
      : '<span class="group-player">Noch nicht ausgelost</span>';
    return `<article class="group-card"><h3><span class="group-letter">${letter}</span> Gruppe ${letter}</h3><p>${content}</p></article>`;
  }).join('');
  const readyText = entries.length === 16
    ? 'Alle 16 Turniereinträge sind bereit für die Auslosung.'
    : `Für die Auslosung werden genau 16 Einträge benötigt. Aktuell eingetragen: ${entries.length}.`;
  return `${stepHeading(section)}
    <div class="draw-layout">
      <article class="surface-inset draw-panel">
        <div><h2>Zufällige Gruppeneinteilung</h2><p class="subtle-copy">${readyText}</p></div>
        <button class="button button-primary" type="button" id="drawButton" ${entries.length !== 16 ? 'disabled' : ''}><span aria-hidden="true">⚄</span> Neu auslosen</button>
        <p class="subtle-copy">Vor Turnierbeginn kann die Auslosung beliebig oft neu gestartet werden.</p>
      </article>
      <div class="draw-groups" id="drawGroups">${groupCards}</div>
    </div>`;
}

function renderClientsStep(section) {
  return `${stepHeading(section)}
    <div class="board-layout">
      <article class="surface-inset">
        <div class="form-section-header"><div><h2>Dartboards</h2><p class="subtle-copy">Lege fest, wie viele Boards im Turnier verwendet werden.</p></div></div>
        <div class="field board-number"><label for="boardCount">Anzahl Dartboards</label><input id="boardCount" type="number" min="1" value="${escapeHtml(state.configuration.boardCount || '4')}" data-config></div>
      </article>
      <article class="surface-inset">
        <div class="form-section-header"><div><h2>Verbindungen</h2><p class="subtle-copy">Status der registrierten Ergebnis-Clients.</p></div></div>
        <div class="client-placeholder"><span class="qr-placeholder" aria-hidden="true">QR</span><div><strong>Noch keine Clients verbunden</strong><p>Nach der Backend-Anbindung erscheinen hier Board-Zuordnung und Verbindungsstatus.</p></div></div>
      </article>
    </div>
    <div class="info-banner" style="margin-top:14px"><span aria-hidden="true">i</span><p>Der QR-Code wird später ausschließlich die Verbindungs-URL enthalten. Ein Client erhält seine Boardnummer bei der Registrierung automatisch.</p></div>`;
}

function renderBroadcastingStep(section) {
  return `${stepHeading(section)}
    <article class="surface surface-inset deferred-panel">
      <span class="deferred-mark" aria-hidden="true">↗</span>
      <div><h2>Für später vorgemerkt</h2><p>Die Konfiguration der Broadcasting-Slideshow ist in den Anforderungen ausdrücklich zurückgestellt. Die Oberfläche wird ergänzt, sobald die fachlichen Einstellungen festgelegt sind.</p></div>
    </article>`;
}

function renderResultsStep(section) {
  const entryCount = currentTournamentEntries().length;
  const tournament = state.tournaments.find((item) => item.id === state.currentTournamentId);
  const readyToStart = entryCount === 16 && state.drawGroups !== null;
  return `${stepHeading(section)}
    <div class="summary-strip">
      <div class="summary-chip"><span>Turniereinträge</span><strong>${entryCount} / 16</strong></div>
      <div class="summary-chip"><span>Spielplan</span><strong>${state.drawGroups ? 'Ausgelost' : 'Offen'}</strong></div>
      <div class="summary-chip"><span>Turnierstatus</span><strong>${escapeHtml(statusLabel(tournament?.status))}</strong></div>
    </div>
    <div class="surface-inset form-section">
      <div class="form-section-header"><div><h2>Turnier starten</h2><p class="subtle-copy">${readyToStart ? 'Die Voraussetzungen für den Start sind erfüllt.' : 'Für den Start sind 16 Einträge und eine Auslosung erforderlich.'}</p></div><button class="button button-primary" id="startTournamentButton" type="button" ${readyToStart ? '' : 'disabled'}>Turnier starten <span aria-hidden="true">→</span></button></div>
      <div class="match-placeholder">${tournament ? 'Begegnungen und Ergebniserfassung werden mit der Turnier-API verbunden.' : 'Lege zuerst ein Turnier an, um Begegnungen und Ergebnisse zu verwalten.'}</div>
    </div>
    <div class="info-banner"><span aria-hidden="true">i</span><p>Ergebnis- und Spielplan-Endpunkte stehen derzeit noch nicht zur Verfügung. Diese Ansicht zeigt den vorgesehenen Platz für Begegnungen und manuelle Ergebniseingabe.</p></div>`;
}

function renderStep() {
  const section = sectionDefinitions.find((item) => item.id === state.currentStep);
  if (!section) return;
  const renderers = {
    3: renderBasicsStep,
    4: renderParticipantsStep,
    5: renderModeStep,
    6: renderRulesStep,
    7: renderDrawStep,
    8: renderClientsStep,
    9: renderBroadcastingStep,
    10: renderResultsStep
  };
  document.querySelector('[data-step-kicker]').textContent = `BEREICH ${section.id} / 10`;
  stepContentElement.innerHTML = renderers[section.id](section);
  document.querySelector('[data-step-previous]').disabled = section.id === 3;
  document.querySelector('[data-step-next]').textContent = section.id === 10 ? 'Übersicht' : 'Weiter →';
  renderStepNavigation();
  bindStepActions();
}

function bindStepActions() {
  const tournamentForm = document.getElementById('tournamentForm');
  tournamentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      tournamentDate: formData.get('tournamentDate') || null,
      description: formData.get('description') || null,
      status: formData.get('status') || 'draft'
    };

    try {
      const result = await apiRequest('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const created = result.data;
      state.currentTournamentId = created.id;
      state.currentTournamentName = created.name;
      state.drawGroups = null;
      showNotice('Turnier wurde angelegt.', 'success');
      await loadData();
      setActiveView(4);
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  const personForm = document.getElementById('personForm');
  personForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      await apiRequest('/api/persons', {
        method: 'POST',
        body: JSON.stringify({
          firstName: formData.get('firstName'),
          lastName: formData.get('lastName'),
          nickname: formData.get('nickname') || null,
          gender: formData.get('gender')
        })
      });
      form.reset();
      showNotice('Person wurde gespeichert.', 'success');
      await loadData();
      renderStep();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  const teamForm = document.getElementById('teamForm');
  teamForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const personLow = formData.get('personLow');
    const personHigh = formData.get('personHigh');
    if (!personLow || !personHigh || personLow === personHigh) {
      showNotice('Bitte zwei unterschiedliche Personen wählen.', 'error');
      return;
    }
    try {
      await apiRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({
          name: formData.get('name') || '',
          personIds: [personLow, personHigh]
        })
      });
      showNotice('Team wurde gespeichert.', 'success');
      await loadData();
      renderStep();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  const entryForm = document.getElementById('entryForm');
  entryForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload = { tournamentId: formData.get('tournamentId') };
    if (formData.get('type') === 'person') {
      payload.personId = formData.get('personId');
    } else {
      payload.teamId = formData.get('teamId');
    }
    if (!payload.tournamentId || (!payload.personId && !payload.teamId)) {
      showNotice('Bitte ein Turnier und eine Person oder ein Team wählen.', 'error');
      return;
    }
    try {
      await apiRequest('/api/tournament-entries', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showNotice('Teilnahme wurde hinzugefügt.', 'success');
      await loadData();
      renderStep();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  document.getElementById('entryType')?.addEventListener('change', (event) => {
    const isTeam = event.currentTarget.value === 'team';
    document.getElementById('entryPersonField').hidden = isTeam;
    document.getElementById('entryTeamField').hidden = !isTeam;
    document.getElementById('entryPerson').required = !isTeam;
    document.getElementById('entryTeam').required = isTeam;
  });

  document.querySelectorAll('[data-config]').forEach((control) => {
    if (control.id && Object.hasOwn(state.configuration, control.id)) {
      if (control.type === 'checkbox') control.checked = state.configuration[control.id];
      else control.value = state.configuration[control.id];
    }
    control.addEventListener('change', () => {
      if (!control.id) return;
      state.configuration[control.id] = control.type === 'checkbox' ? control.checked : control.value;
    });
  });

  document.getElementById('drawButton')?.addEventListener('click', () => {
    const entries = currentTournamentEntries();
    if (entries.length !== 16) {
      showNotice('Für die Gruppenauslosung werden genau 16 Einträge benötigt.', 'warning');
      return;
    }
    const names = entries.map((entry) => entry.person_first_name
      ? `${entry.person_first_name} ${entry.person_last_name}`
      : entry.team_name || 'Team');
    for (let index = names.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
    }
    state.drawGroups = [0, 1, 2, 3].map((group) => names.slice(group * 4, group * 4 + 4));
    renderStep();
    showNotice('Die Auslosungsvorschau wurde aktualisiert.', 'success');
  });

  document.getElementById('startTournamentButton')?.addEventListener('click', () => {
    showNotice('Der Turnierstart ist vorbereitet, aber noch nicht mit der Backend-API verbunden.', 'warning');
  });

  stepContentElement.querySelectorAll('[data-entry-delete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.entryDelete;
      if (!window.confirm('Diese Turnierteilnahme wirklich entfernen?')) return;
      try {
        await apiRequest(`/api/tournament-entries/${encodeURIComponent(id)}`, { method: 'DELETE' });
        showNotice('Teilnahme wurde entfernt.', 'success');
        await loadData();
        renderStep();
      } catch (error) {
        showNotice(error.message, 'error');
      }
    });
  });
}

async function loadData() {
  refreshHeaderStatuses();
  try {
    const [tournaments, persons, teams, entries] = await Promise.all([
      apiRequest('/api/tournaments'),
      apiRequest('/api/persons'),
      apiRequest('/api/teams'),
      apiRequest('/api/tournament-entries')
    ]);
    state.tournaments = tournaments.data || [];
    state.persons = persons.data || [];
    state.teams = teams.data || [];
    state.entries = entries.data || [];
    renderTournaments();
    if (state.currentTournamentId && !state.tournaments.some((item) => item.id === state.currentTournamentId)) {
      state.currentTournamentId = null;
    }
    if (state.currentStep === 4 || state.currentStep === 7 || state.currentStep === 10) {
      renderStep();
    }
  } catch (error) {
    document.getElementById('tournamentsList').innerHTML = '<div class="loading-state">Turniere konnten nicht geladen werden. Prüfe die Verbindung und aktualisiere die Ansicht.</div>';
    showNotice(`Die Verwaltungsdaten konnten nicht vollständig geladen werden: ${error.message}`, 'error');
  }
}

function openTournament(id) {
  const tournament = state.tournaments.find((item) => item.id === id);
  if (!tournament) return;
  state.currentTournamentId = tournament.id;
  state.currentTournamentName = tournament.name;
  state.currentStep = 10;
  state.drawGroups = null;
  setActiveView(10);
}

document.addEventListener('click', (event) => {
  const viewControl = event.target.closest('[data-view]');
  if (viewControl) {
    event.preventDefault();
    setActiveView(viewControl.dataset.view);
    return;
  }

  const tournamentControl = event.target.closest('[data-open-tournament]');
  if (tournamentControl) {
    openTournament(tournamentControl.dataset.openTournament);
  }
});

document.querySelector('[data-step-previous]').addEventListener('click', () => {
  if (state.currentStep > 3) setActiveView(state.currentStep - 1);
});

document.querySelector('[data-step-next]').addEventListener('click', () => {
  if (state.currentStep < 10) setActiveView(state.currentStep + 1);
  else setActiveView(1);
});

document.getElementById('refreshButton').addEventListener('click', loadData);

document.getElementById('broadcastStatus').addEventListener('click', () => {
  if (!broadcastIsActive || document.getElementById('broadcastStatus').disabled) return;
  const displayWindow = window.open('/display', '_blank', 'noopener,noreferrer');
  if (!displayWindow) showNotice('Das Broadcasting-Fenster wurde vom Browser blockiert.', 'error');
});

renderStepNavigation();
renderStep();
renderTournaments();
loadData();
window.setInterval(refreshHeaderStatuses, 15000);
