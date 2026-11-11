const sectionDefinitions = [
  { id: 3, short: 'Stammdaten', icon: '<circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />', title: 'Stammdaten', description: 'Gib deinem Turnier einen Namen und lege die wichtigsten Eckdaten fest.' },
  { id: 8, short: 'Clients', icon: '<rect width="10" height="14" x="3" y="8" rx="2" /><path d="M5 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-2.4" /><path d="M8 18h.01" />', title: 'Client-Verwaltung', description: 'Registriere und verwalte Clients, um dein Turnier von mobilen Endgeräten zu steuern.' },
  { id: 9, short: 'Broadcasting', icon: '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /><path d="M2 12a9 9 0 0 1 8 8" /><path d="M2 16a5 5 0 0 1 4 4" /><line x1="2" x2="2.01" y1="20" y2="20" />', title: 'Broadcasting', description: 'Konfiguriere die Einstellungen für die Slideshow deines Turniers.' },
  { id: 4, short: 'Teilnehmer', icon: '<path d="M18 21a8 8 0 0 0-16 0" /><circle cx="10" cy="8" r="5" /><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />', title: 'Teilnehmer', description: 'Verwalte die Teilnehmer deines Turniers.' },
  { id: 5, short: 'Turnierphasen', icon: '<path d="m10.586 5.414-5.172 5.172" /><path d="m18.586 13.414-5.172 5.172" /><path d="M6 12h12" /><circle cx="12" cy="20" r="2" /><circle cx="12" cy="4" r="2" /><circle cx="20" cy="12" r="2" /><circle cx="4" cy="12" r="2" />', title: 'Turnierphasen', description: 'Konfiguriere die Phase deines Turniers.' },
  { id: 6, short: 'Regeln', icon: '<path d="M12 3v18" /><path d="m19 8 3 8a5 5 0 0 1-6 0zV7" /><path d="M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1" /><path d="m5 8 3 8a5 5 0 0 1-6 0zV7" /><path d="M7 21h10" />', title: 'Regeln', description: 'Lege die Regeln für jede Turnierphase individuell fest.' },
  { id: 7, short: 'Auslosung', icon: '<rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" />', title: 'Auslosung', description: 'Lose aus, wer gegen wen antreten muss' },
  { id: 10, short: 'Turnier starten', icon: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" />', title: 'Turnierstart & Ergebnisse', description: 'Starte das Turnier und behalte Begegnungen und Resultate im Blick.' }
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
  currentTournamentDate: null,
  currentTournamentStatus: 'draft',
  drawGroups: null,
  drawBracketEntries: null,
  clientConnections: [],
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

function avatarThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    primaryColor: styles.getPropertyValue('--prime').trim(),
    secondaryColor: styles.getPropertyValue('--sec').trim()
  };
}

function showNotice(message, kind = 'success') {
  window.clearTimeout(noticeTimeout);
  noticeElement.textContent = message;
  noticeElement.className = `notice alert alert-${kind} show`;
  noticeTimeout = window.setTimeout(() => {
    noticeElement.className = 'notice alert alert-info';
  }, 4200);
}

function statusLabel(status) {
  return ({
    draft: 'Entwurf',
    open: 'offen',
    running: 'laufend',
    finished: 'beendet'
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
  if (!value) return 'noch offen';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
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
  noticeElement.className = 'notice alert alert-info';
}

function renderStepNavigation() {
  stepNavigationElement.innerHTML = sectionDefinitions.map((section) => `
    <button class="step-nav-button" type="button" data-view="${section.id}" aria-label="${escapeHtml(section.short)}" title="${escapeHtml(section.short)}" aria-current="${state.currentStep === section.id ? 'step' : 'false'}">
      <svg viewBox="0 0 24 24" aria-hidden="true">${section.icon}</svg>
      <span class="step-nav-label">${escapeHtml(section.short)}</span>
    </button>
  `).join('');
}

function stepHeading(section) {
  return `<div class="step-heading"><h1 id="viewTitle-${section.id}">${escapeHtml(section.title)}</h1><p>${escapeHtml(section.description)}</p></div>`;
}

function renderTournamentRow(tournament) {
  const winner = tournament.status === 'finished'
    ? `<span class="row-value row-winner"><span class="row-label">Sieger</span>${escapeHtml(tournament.winner_name || 'noch nicht festgelegt')}</span>`
    : '<span class="row-winner"></span>';
  return `
    <article class="tournament-row">
      <strong class="tournament-name">${escapeHtml(tournament.name)}</strong>
      <span class="row-status"><span class="row-label">Status</span><span class="status-pill ${statusClass(tournament.status)}">${escapeHtml(statusLabel(tournament.status))}</span></span>
      <span class="row-value row-date"><span class="row-label">Datum</span>${escapeHtml(formatDate(tournament.tournament_date))}</span>
      ${winner}
      <button class="row-open" type="button" data-open-tournament="${escapeHtml(tournament.id)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>
        öffnen
      </button>
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
  const statusOrder = { running: 0, open: 1, draft: 1, finished: 2 };
  const sortedTournaments = [...state.tournaments].sort((left, right) => {
    const statusDifference = (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3);
    if (statusDifference !== 0) return statusDifference;

    const leftDate = left.tournament_date || '';
    const rightDate = right.tournament_date || '';
    if (!leftDate) return rightDate ? 1 : 0;
    if (!rightDate) return -1;
    return leftDate.localeCompare(rightDate);
  });
  list.innerHTML = sortedTournaments.map(renderTournamentRow).join('');
}

function renderEntryTiles() {
  const entries = currentTournamentEntries();
  const { primaryColor, secondaryColor } = avatarThemeColors();
  if (!entries.length) return '<div class="table-empty">Für dieses Turnier sind noch keine Teilnehmer eingetragen.</div>';
  const tiles = entries.map((entry) => {
    let name;
    let type;
    let avatar;
    if (entry.person) {
      const person = entry.person;
      name = `${person.firstName} ${person.lastName}${person.nickname ? ` (${person.nickname})` : ''}`;
      type = 'Einzel';
      avatar = window.Avatar.playerUrl(person.nickname || person.firstName, {
        size: 44,
        gender: person.gender,
        letters: 1,
        color: primaryColor
      });
    } else if (entry.team) {
      name = entry.team.name;
      type = 'Team';
      avatar = window.Avatar.teamUrl(entry.team.members, {
        size: 44,
        layout: 'stack',
        letters: 1,
        primaryColor,
        secondaryColor
      });
    } else if (entry.person_id) {
      const person = state.persons.find((item) => item.id === entry.person_id);
      const firstName = person?.first_name || entry.person_first_name || '';
      const lastName = person?.last_name || entry.person_last_name || '';
      name = `${firstName} ${lastName}${person?.nickname ? ` (${person.nickname})` : ''}`.trim();
      type = 'Einzel';
      avatar = window.Avatar.playerUrl(person?.nickname || firstName, {
        size: 44,
        gender: person?.gender,
        letters: 1,
        color: primaryColor
      });
    } else {
      const team = state.teams.find((item) => item.id === entry.team_id);
      name = team?.name || entry.team_name || 'Team';
      type = 'Team';
      const members = team
        ? [team.member_low_person_id, team.member_high_person_id].map((id, index) => {
          const person = state.persons.find((item) => item.id === id);
          const firstName = person?.first_name || team[`${index === 0 ? 'low' : 'high'}_first_name`] || '';
          const lastName = person?.last_name || team[`${index === 0 ? 'low' : 'high'}_last_name`] || '';
          return { name: person?.nickname || `${firstName} ${lastName}`.trim(), gender: person?.gender };
        })
        : [{ name: name, gender: null }, { name: name, gender: null }];
      avatar = window.Avatar.teamUrl(members, {
        size: 44,
        layout: 'stack',
        letters: 1,
        primaryColor,
        secondaryColor
      });
    }
    return `<article class="participant-tile">
      <img class="participant-tile-avatar${type === 'Team' ? ' is-team' : ''}" src="${avatar}" alt="" aria-hidden="true">
      <div class="participant-tile-copy"><strong>${escapeHtml(name)}</strong></div>
      <button class="participant-tile-remove" type="button" data-entry-delete="${escapeHtml(entry.id)}" aria-label="${escapeHtml(name)} entfernen" title="Vom Turnier entfernen">x</button>
    </article>`;
  }).join('');
  return `<div class="participant-tiles">${tiles}</div>`;
}

function optionsForJoinableTeams() {
  return state.teams
    .map((team) => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`)
    .join('');
}

function renderParticipantsStep(section) {
  const participantOptions = state.persons.map((person) => {
    const label = `${person.first_name} ${person.last_name}${person.nickname ? ` (${person.nickname})` : ''}`;
    return `<option value="${escapeHtml(person.id)}">${escapeHtml(label)}</option>`;
  }).join('');

  return `${stepHeading(section)}
    <div class="form-section surface-inset">
      <div class="form-section-header"><div><h2>Teilnehmer auswählen oder anlegen</h2></div></div>
      <form id="personForm" class="inline-form person-form">
        <div class="field"><label for="participantChoice">Teilnehmer auswählen</label><select id="participantChoice" name="participantChoice" required><option value="" selected> </option><option value="new">Teilnehmer anlegen</option>${participantOptions}</select></div>
        <div class="field participant-preview-field" hidden>
          <!--span class="field-label"></span-->
          <div class="participant-preview" aria-live="polite">
            <img id="participantPreviewAvatar" src="/logo-mark.svg?v=2" alt="">
            <span id="participantPreviewName"> </span>
          </div>
        </div>
        <div class="field person-first-name" hidden><label for="firstName">Vorname</label><input id="firstName" name="firstName" autocomplete="given-name"></div>
        <div class="field person-last-name" hidden><label for="lastName">Nachname</label><input id="lastName" name="lastName" autocomplete="family-name"></div>
        <div class="field person-nickname" hidden><label for="nickname">Spitzname <span class="muted">(optional)</span></label><input id="nickname" name="nickname"></div>
        <div class="field person-gender" hidden><label for="gender">Geschlecht</label><select id="gender" name="gender"><option value="m">Männlich</option><option value="w">Weiblich</option></select></div>
        <div class="field person-image" hidden>
          <span class="field-label">Avatar</span>
          <div class="person-avatar-control">
            <img id="personAvatar" src="/logo-mark.svg?v=2" alt="Geschlechtsspezifischer Standardavatar">
            <button class="logo-upload-control" type="button" disabled>Avatar ändern</button>
          </div>
        </div>
        <div class="field person-team" hidden><label for="joinTeam">Team beitreten</label><select id="joinTeam" name="joinTeam"><option value="" selected> </option><option value="new">Team anlegen</option>${optionsForJoinableTeams()}</select></div>
        <div class="field person-team-name" hidden><label for="newTeamName">Teamname</label><input id="newTeamName" name="newTeamName"></div>
        <div class="field team-preview-field" hidden>
          <!--span class="field-label"></span-->
          <div class="participant-preview">
            <img id="teamPreviewAvatar" src="/logo-mark.svg?v=2" alt="">
            <span id="teamPreviewName"> </span>
          </div>
        </div>
        <div class="form-actions field full-width" hidden><button class="button button-primary" type="submit">zum Turnier hinzufügen</button></div>
      </form>
    </div>
    <div class="surface-inset">
      <div class="form-section-header"><div><h2>Turnierteilnehmer <span class="muted">(${currentTournamentEntries().length})</span></h2></div></div>
      <div id="entriesList">${renderEntryTiles()}</div>
    </div>`;
}

function renderBasicsStep(section) {
  const today = new Date();
  const defaultDate = state.currentTournamentDate || [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  const submitLabel = state.currentTournamentId ? 'Änderungen speichern' : 'Turnier anlegen';
  return `${stepHeading(section)}
    <div class="surface-inset form-section">
      <div class="form-section-header"><div><h2>Turnierdetails</h2><p class="subtle-copy">Diese Angaben kannst du später jederzeit anpassen.</p></div></div>
      <form id="tournamentForm" class="form-grid tournament-form">
        <div class="field tournament-name"><label for="tournamentName">Turniername</label><input id="tournamentName" name="name" placeholder="z. B. Sommer Open 2026" required value="${escapeHtml(state.currentTournamentId ? state.currentTournamentName : '')}"></div>
        <div class="field tournament-date"><label for="tournamentDate">Datum</label><input id="tournamentDate" name="tournamentDate" type="date" value="${defaultDate}"></div>
        <div class="field logo-field">
          <span class="field-label">Turnierlogo</span>
          <div class="logo-upload-card">
            <img src="/logo-icon.svg?v=2" alt="" aria-hidden="true">
            <button class="logo-upload-control" type="button" disabled>Logo ändern</button>
          </div>
        </div>
        <div class="tournament-actions"><div class="form-actions"><button class="button button-primary" type="submit">${submitLabel}</button></div></div>
      </form>
    </div>`;
}

function selectOptions(values, selected) {
  return values.map((value) => `<option${value === selected ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('');
}

function compactSelect(id, label, options, selected = options[0], legacyId) {
  const value = Object.hasOwn(state.configuration, id)
    ? state.configuration[id]
    : legacyId && Object.hasOwn(state.configuration, legacyId)
      ? state.configuration[legacyId]
      : selected;
  return `<div class="compact-field"><label for="${id}">${label}</label><select id="${id}" data-config>${selectOptions(options, value)}</select></div>`;
}

function radioOptions(name, label, options, selected, legacyName) {
  const value = Object.hasOwn(state.configuration, name)
    ? state.configuration[name]
    : legacyName && Object.hasOwn(state.configuration, legacyName)
      ? state.configuration[legacyName]
      : selected;
  return `<fieldset class="radio-field">
    <legend>${label}</legend>
    <div class="radio-options">${options.map((option, index) => {
      const id = `${name}-${index}`;
      return `<label for="${id}"><input id="${id}" name="${name}" type="radio" value="${escapeHtml(option)}" data-config${option === value ? ' checked' : ''}><span>${escapeHtml(option)}</span></label>`;
    }).join('')}</div>
  </fieldset>`;
}

function renderModeStep(section) {
  const groupDefaults = { groupCount: 4, gamesPerPair: 1, qualifierCount: 16 };
  const participantCount = currentTournamentEntries().length;
  const maxQualifierCount = largestQualifierPower(participantCount);
  const configuredQualifierCount = Number(state.configuration.qualifierCount ?? groupDefaults.qualifierCount);
  const qualifierCount = maxQualifierCount >= 4
    ? largestQualifierPower(Math.min(configuredQualifierCount, maxQualifierCount)) || 4
    : 4;
  state.configuration.qualifierCount = String(qualifierCount);
  const groupNumberInput = (id, label, value, max) => `
    <div class="field">
      <label for="${id}">${label}</label>
      <input id="${id}" type="number" min="1" ${max ? `max="${max}"` : ''} step="1" value="${escapeHtml(value)}" data-config>
    </div>`;
  return `${stepHeading(section)}
    <div class="mode-card-grid">
      <article class="surface-inset">
        <div class="form-section-header phase-card-header">
          <div><h2>Gruppenphase</h2></div>
          <div class="phase-card-tools">
            <button class="icon-button phase-reset-button" type="button" data-reset-group aria-label="Gruppenphase zurücksetzen" title="Standardwerte wiederherstellen">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /></svg>
            </button>
            <label class="toggle" aria-label="Gruppenphase aktivieren"><input id="groupPhaseEnabled" type="checkbox" data-config checked><span class="toggle-track"></span></label>
          </div>
        </div>
        <div class="group-settings">
          ${groupNumberInput('groupCount', 'Gruppen', state.configuration.groupCount ?? groupDefaults.groupCount)}
          ${groupNumberInput('gamesPerPair', 'Spiele gegeneinander', state.configuration.gamesPerPair ?? groupDefaults.gamesPerPair)}
          <div class="field" id="qualifierCountField">
            <label for="qualifierCount">Qualifikanten für Endrunde</label>
            <input id="qualifierCount" type="number" min="4" max="${Math.max(maxQualifierCount, 4)}" step="1" value="${qualifierCount}" data-config${maxQualifierCount < 4 ? ' disabled' : ''}>
            ${maxQualifierCount < 4 ? '<span class="field-hint">Mindestens 4 Turnierteilnehmer sind erforderlich.</span>' : ''}
          </div>
        </div>
      </article>
      <article class="surface-inset">
        <div class="form-section-header phase-card-header"><div><h2>Endrunde</h2></div><label class="toggle" aria-label="Endrunde aktivieren"><input id="placementPhaseEnabled" type="checkbox" data-config checked><span class="toggle-track"></span></label></div>
        <div class="option-row"><div class="option-copy"><strong>Zusätzliche Platzierungsspiele</strong><span>Platzierungsspiele nach dem Ausscheiden in der Endrunde.</span></div><label class="toggle"><input id="placementGames" type="checkbox" data-config><span class="toggle-track"></span></label></div>
      </article>
      <article class="surface-inset">
        <div class="form-section-header phase-card-header"><div><h2>Lucky Losers</h2><p class="subtle-copy">Separate Platzierungsspiele für diejenigen, die sich nicht für die Endrunde qualifiziert haben.</p></div><label class="toggle" aria-label="Lucky Losers aktivieren"><input id="luckyLosers" type="checkbox" data-config checked><span class="toggle-track"></span></label></div>
      </article>
    </div>
    `;
}

function largestQualifierPower(participantCount) {
  let power = 0;
  for (let candidate = 4; candidate <= participantCount; candidate *= 2) {
    power = candidate;
  }
  return power;
}

function normalizeQualifierCount(value, maximum, previousValue) {
  const maxPower = largestQualifierPower(maximum);
  if (maxPower < 4) return 4;

  const choices = [];
  for (let candidate = 4; candidate <= maxPower; candidate *= 2) {
    choices.push(candidate);
  }
  const boundedValue = Math.min(maxPower, Math.max(4, Number.isFinite(value) ? value : previousValue));

  if (boundedValue > previousValue) {
    return choices.find((candidate) => candidate >= boundedValue) || maxPower;
  }
  if (boundedValue < previousValue) {
    return [...choices].reverse().find((candidate) => candidate <= boundedValue) || 4;
  }
  return choices.reduce((closest, candidate) =>
    Math.abs(candidate - boundedValue) < Math.abs(closest - boundedValue) ? candidate : closest
  );
}

function syncPhaseDependencies() {
  const root = stepContentElement;
  const groupEnabled = Boolean(state.configuration.groupPhaseEnabled
    ?? root.querySelector('#groupPhaseEnabled')?.checked
    ?? true);
  const placementEnabled = Boolean(state.configuration.placementPhaseEnabled
    ?? root.querySelector('#placementPhaseEnabled')?.checked
    ?? true);
  const participantCount = currentTournamentEntries().length;
  const qualifierCount = Number(state.configuration.qualifierCount) || 4;
  const disableLuckyLosers = !groupEnabled || (participantCount > 0
    && (qualifierCount === participantCount || qualifierCount === participantCount - 1));
  const luckyToggle = root.querySelector('#luckyLosers');

  if (disableLuckyLosers) {
    state.configuration.luckyLosers = false;
    if (luckyToggle) luckyToggle.checked = false;
  }
  if (luckyToggle) luckyToggle.disabled = disableLuckyLosers;

  const qualifierField = root.querySelector('#qualifierCountField');
  if (qualifierField) qualifierField.hidden = !placementEnabled;

  root.querySelectorAll('.group-settings input').forEach((input) => {
    input.readOnly = !groupEnabled;
  });
  const groupReset = root.querySelector('[data-reset-group]');
  if (groupReset) groupReset.disabled = !groupEnabled;

  const placementGamesToggle = root.querySelector('#placementGames');
  if (placementGamesToggle) placementGamesToggle.disabled = !placementEnabled;

  const rulePhases = {
    group: groupEnabled,
    placement: placementEnabled,
    lucky: !disableLuckyLosers && Boolean(state.configuration.luckyLosers ?? true)
  };
  root.querySelectorAll('[data-rule-phase]').forEach((card) => {
    card.hidden = !rulePhases[card.dataset.rulePhase];
  });
  const endRoundEntryCount = groupEnabled ? qualifierCount : participantCount;
  root.querySelectorAll('[data-min-qualifiers], [data-exact-qualifiers], [data-additional-placement-games]').forEach((card) => {
    const minQualifiers = Number(card.dataset.minQualifiers);
    const exactQualifiers = Number(card.dataset.exactQualifiers);
    const meetsMinimum = !card.hasAttribute('data-min-qualifiers') || endRoundEntryCount >= minQualifiers;
    const matchesExact = !card.hasAttribute('data-exact-qualifiers') || endRoundEntryCount === exactQualifiers;
    const needsPlacementGames = !card.hasAttribute('data-additional-placement-games')
      || Boolean(state.configuration.placementGames);
    card.hidden = !(meetsMinimum && matchesExact && needsPlacementGames);
  });
}

function renderRulesStep(section) {
  const placementRounds = [
    '1. Runde',
    '2. Runde',
    '3. Runde',
    'Viertelfinale',
    'Halbfinale',
    'Finale',
    'Platzierungsspiele'
  ];
  const phases = [
    { name: 'Gruppenphase', key: 'group', legacyKey: '0', includeRanking: true, rulePhase: 'group' },
    { name: 'Lucky Losers', key: 'lucky', legacyKey: '2', rulePhase: 'lucky' }
  ];
  const renderPhaseCard = ({ name, key, legacyKey, includeRanking, rulePhase, minQualifiers, exactQualifiers, additionalPlacementGames }) => {
    const configId = (field) => `${field}-${key}`;
    const legacyId = (field) => legacyKey ? `${field}-${legacyKey}` : undefined;
    const visibilityAttributes = [
      rulePhase ? `data-rule-phase="${rulePhase}"` : '',
      minQualifiers ? `data-min-qualifiers="${minQualifiers}"` : '',
      exactQualifiers ? `data-exact-qualifiers="${exactQualifiers}"` : '',
      additionalPlacementGames ? 'data-additional-placement-games' : ''
    ].filter(Boolean).join(' ');
    return `
    <article class="phase-card" ${visibilityAttributes}>
      <div class="phase-title"><strong>${name}</strong></div>
      <div class="phase-controls">
        ${compactSelect(configId('start'), 'Start', ['301', '501', '701', '901'], '501', legacyId('start'))}
        ${compactSelect(configId('sets'), 'Sets · First to', ['1', '2', '3', '4'], '1', legacyId('sets'))}
        ${compactSelect(configId('legs'), 'Legs · First to', ['2', '3', '4', '5', '6'], '2', legacyId('legs'))}
        ${radioOptions(configId('in'), 'Check In', ['Single In', 'Double In', 'Master In'], 'Single In', legacyId('in'))}
        ${radioOptions(configId('out'), 'Check Out', ['Single Out', 'Double Out', 'Master Out'], 'Double Out', legacyId('out'))}
        ${radioOptions(configId('bull'), 'Bull-Off', ['no Bull-Off', 'classic', 'PDC'], 'classic', legacyId('bull'))}
      </div>
      ${includeRanking ? `
        <div class="group-scoring">
          <div class="form-section-header"><div><h3>Wertung der Gruppen</h3><p class="subtle-copy">Kriterien werden in dieser Reihenfolge zum Ermitteln der Platzierung herangezogen.</p></div></div>
          <div class="summary-strip">
            ${[
              ['Platzierung', 'Platzierung'],
              ['Siege', 'Siege'],
              ['Leg-Differenz', 'Leg-Differenz'],
              ['3-Dart-Average', '3-Dart-Average']
            ].map(([label, selected], index) => `
              <div class="compact-field">
                <label for="groupRanking-${index}">${index + 1}. Kriterium</label>
                <select id="groupRanking-${index}" data-config>${selectOptions(['', 'Platzierung', 'Siege', 'Leg-Differenz', '3-Dart-Average'], Object.hasOwn(state.configuration, `groupRanking-${index}`) ? state.configuration[`groupRanking-${index}`] : selected)}</select>
              </div>
            `).join('')}
          </div>
          <div class="alert alert-error group-ranking-error" id="groupRankingError" role="alert" hidden><strong>Fehler:</strong> Kriterien dürfen nur einmal vorkommen und müssen nacheinander definiert sein.</div>
          <div class="alert alert-info info-banner"><strong>Info:</strong> Führt kein Kriterium zu einer Entscheidung, so gibt es einen direkten Vergleich über ein Entscheidungsleg mit klassischem Bull-Off.</div>
        </div>
      ` : ''}
    </article>
  `;
  };
  const [groupCard, luckyCard] = phases.map(renderPhaseCard);
  const placementCard = `
    <article class="phase-card placement-phase-card" data-rule-phase="placement">
      <div class="phase-title"><strong>Endrunde</strong></div>
      <div class="placement-rounds">
        ${placementRounds.map((name, index) => {
          const roundRules = [
            { exactQualifiers: 64 },
            { minQualifiers: 32 },
            { minQualifiers: 16 },
            { minQualifiers: 8 },
            {},
            {},
            { additionalPlacementGames: true }
          ][index];
          return renderPhaseCard({
            name,
            key: `round-${index + 1}`,
            legacyKey: index === 0 ? '1' : null,
            ...roundRules
          });
        }).join('')}
      </div>
    </article>
  `;
  return `${stepHeading(section)}
    <div class="alert alert-info info-banner"><strong>Info:</strong> Regeln lassen sich anpassen, solange die jeweilige Phase noch nicht begonnen hat. Die folgenden Auswahlfelder sind derzeit eine Frontend-Vorschau.</div>
    <div class="phase-card-grid" data-rules-grid>${groupCard}${placementCard}${luckyCard}</div>`;
}

function currentTournamentEntries() {
  return state.entries.filter((entry) => entry.tournament_id === state.currentTournamentId);
}

function drawEntryLabel(entry) {
  if (entry.team) return entry.team.name;
  if (entry.person) return entry.person.nickname || entry.person.firstName || 'Teilnehmer';
  if (entry.team_id) {
    const team = state.teams.find((item) => item.id === entry.team_id);
    return team?.name || entry.team_name || 'Team';
  }
  if (entry.person_id) {
    const person = state.persons.find((item) => item.id === entry.person_id);
    return person?.nickname || person?.first_name || entry.person_first_name || 'Teilnehmer';
  }
  return entry.team_name || entry.person_first_name || 'Teilnehmer';
}

function hasDraw() {
  return state.drawGroups !== null || state.drawBracketEntries !== null;
}

function resetDraw() {
  state.drawGroups = null;
  state.drawBracketEntries = null;
}

function nextBracketSize(entryCount) {
  let size = 1;
  while (size < entryCount) size *= 2;
  return size;
}

function createDirectBracketEntries(entries) {
  const bracketSize = nextBracketSize(entries.length);
  const byeCount = bracketSize - entries.length;
  const matches = [];
  let entryIndex = 0;

  for (let index = 0; index < byeCount; index += 1) {
    matches.push([entries[entryIndex], null]);
    entryIndex += 1;
  }
  while (entryIndex < entries.length) {
    matches.push([entries[entryIndex], entries[entryIndex + 1]]);
    entryIndex += 2;
  }
  for (let index = matches.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [matches[index], matches[swapIndex]] = [matches[swapIndex], matches[index]];
  }
  matches.forEach((match) => {
    if (Math.random() < 0.5) match.reverse();
  });
  return matches.flat();
}

function renderDrawBracket(qualifierCount, directEntries = null, labelPrefix = 'Qualifikant') {
  if (qualifierCount < 2) {
    return `<p class="subtle-copy">Für ${escapeHtml(labelPrefix === 'Qualifikant' ? 'die Endrunde' : 'Lucky Losers')} werden mindestens zwei Teilnehmer benötigt.</p>`;
  }

  const bracketSize = nextBracketSize(qualifierCount);
  const firstRoundMatchCount = bracketSize / 2;
  const sideMatchCount = Math.ceil(firstRoundMatchCount / 2);
  const byeCount = bracketSize - qualifierCount;
  const matches = directEntries
    ? Array.from({ length: firstRoundMatchCount }, (_, index) => [
      directEntries[index * 2] || null,
      directEntries[index * 2 + 1] || null
    ])
    : [];
  if (!directEntries) {
    const entries = Array.from({ length: qualifierCount }, (_, index) => `${labelPrefix} ${index + 1}`);
    let entryIndex = 0;
    for (let index = 0; index < byeCount; index += 1) {
      matches.push([entries[entryIndex], null]);
      entryIndex += 1;
    }
    while (entryIndex < qualifierCount) {
      matches.push([entries[entryIndex], entries[entryIndex + 1]]);
      entryIndex += 2;
    }
  }
  const renderMatches = (startIndex, endIndex) => Array.from(
    { length: endIndex - startIndex },
    (_, index) => {
      const matchIndex = startIndex + index;
      const [firstEntry, secondEntry] = matches[matchIndex];
      const firstLabel = firstEntry
        ? escapeHtml(directEntries ? drawEntryLabel(firstEntry) : firstEntry)
        : 'Freilos';
      const secondLabel = secondEntry
        ? escapeHtml(directEntries ? drawEntryLabel(secondEntry) : secondEntry)
        : 'Freilos';
      const firstClass = firstEntry ? '' : ' draw-player-badge-bye';
      const secondClass = secondEntry ? '' : ' draw-player-badge-bye';
      return `<div class="bracket-match"><span class="draw-player-badge${firstClass}">${firstLabel}</span><span class="bracket-vs">vs.</span><span class="draw-player-badge${secondClass}">${secondLabel}</span></div>`;
    }
  ).join('');

  return `<div class="draw-bracket">
    <section class="bracket-side"><div class="bracket-matches">${renderMatches(0, sideMatchCount)}</div></section>
    <div class="bracket-omitted-rounds" aria-label="Weitere Endrunden"></div>
    <section class="bracket-side"><div class="bracket-matches">${renderMatches(sideMatchCount, firstRoundMatchCount)}</div></section>
  </div>`;
}

function renderDrawStep(section) {
  const entries = currentTournamentEntries();
  const configuredGroupCount = Number.parseInt(state.configuration.groupCount, 10);
  const groupCount = Number.isFinite(configuredGroupCount) && configuredGroupCount > 0
    ? configuredGroupCount
    : 4;
  const groupPhaseEnabled = state.configuration.groupPhaseEnabled !== false;
  if (groupPhaseEnabled && state.drawGroups && state.drawGroups.length !== groupCount) resetDraw();
  const groups = state.drawGroups || Array.from({ length: groupCount }, () => []);
  const groupCards = groups.map((players, index) => {
    const letter = String.fromCharCode(65 + (index % 26));
    const badges = players.length
      ? players.map((entry) => `<span class="draw-player-badge">${escapeHtml(drawEntryLabel(entry))}</span>`).join('')
      : '<span class="draw-empty"></span>';
    return `<article class="group-card"><h3><span class="group-letter">${letter}</span></h3><div class="group-players">${badges}</div></article>`;
  }).join('');
  const placementPhaseEnabled = state.configuration.placementPhaseEnabled !== false;
  const qualifierCount = groupPhaseEnabled
    ? Number(state.configuration.qualifierCount) || entries.length
    : entries.length;
  const roundName = ({
    2: 'Halbfinale',
    4: 'Halbfinale',
    8: 'Viertelfinale',
    16: 'Achtelfinale'
  })[qualifierCount] || `Erste Runde · ${qualifierCount} Teilnehmer`;
  const bracket = placementPhaseEnabled
    ? renderDrawBracket(qualifierCount, groupPhaseEnabled ? null : state.drawBracketEntries)
    : '<p class="subtle-copy">Die Endrunde ist deaktiviert.</p>';
  const luckyLoserCount = entries.length - qualifierCount;
  const showLuckyLosers = groupPhaseEnabled
    && placementPhaseEnabled
    && Boolean(state.configuration.luckyLosers ?? true)
    && luckyLoserCount > 1;
  const drawn = hasDraw();
  return `${stepHeading(section)}
    <div class="draw-workspace">
      <article class="surface-inset draw-entries-panel">
        <div class="form-section-header">
          <div><h2>Turnierteilnehmer</h2></div>
          <button class="button button-primary" type="button" id="drawButton" ${entries.length ? '' : 'disabled'}>
            ${drawn
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /></svg> zurücksetzen'
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${sectionDefinitions.find((item) => item.id === 7).icon}</svg> auslosen`}
          </button>
        </div>
        <div class="draw-participant-badges"${drawn ? ' hidden' : ''}>
          ${entries.length
    ? entries.map((entry) => `<span class="draw-player-badge">${escapeHtml(drawEntryLabel(entry))}</span>`).join('')
    : '<span class="draw-empty">Noch keine Teilnehmer eingetragen.</span>'}
        </div>
      </article>
      ${groupPhaseEnabled ? `<section class="draw-section">
        <h2>Gruppen</h2>
        <div class="draw-groups" id="drawGroups">${groupCards}</div>
      </section>` : ''}
      ${showLuckyLosers
    ? `<div class="draw-bracket-pair">
        <section class="draw-section">
          <h2>Lucky Losers</h2>
          ${renderDrawBracket(luckyLoserCount, null, 'Nicht-Qualifikant')}
        </section>
        <div class="draw-bracket-divider" aria-hidden="true"></div>
        <section class="draw-section">
          <h2>${escapeHtml(roundName)}</h2>
          ${bracket}
        </section>
      </div>`
    : `<section class="draw-section">
        <h2>${placementPhaseEnabled ? escapeHtml(roundName) : ''}</h2>
        ${bracket}
      </section>`}
    </div>`;
}

function renderClientsStep(section) {
  const clientUrl = new URL('/clients', window.location.origin).href;
  const connectionRows = state.clientConnections.length
    ? state.clientConnections.map(renderClientConnection).join('')
    : '<div class="client-connections-empty">Noch keine Clients verbunden.</div>';
  return `${stepHeading(section)}
    <div class="board-layout">
      <article class="surface-inset board-settings-card">
        <div class="form-section-header"><div><h2>Dartboards</h2><p class="subtle-copy">Lege fest, mit wie vielen Dartboards dein Turnier stattfindet. Pro Board muss ein Client (z.B. Tablet oder Smartphone) verbunden werden.</p></div></div>
        <div class="board-setup-content">
          <div class="field board-number"><label for="boardCount">Anzahl Dartboards</label><input id="boardCount" type="number" min="1" value="${escapeHtml(state.configuration.boardCount ?? '1')}" data-config></div>
          <div class="client-qr-panel">
            <div class="client-qr-code" id="clientQrCode" role="img" aria-label="QR-Code zur Client-Registrierung"></div>
            <div class="client-qr-copy"><a id="clientUrl" href="${escapeHtml(clientUrl)}">${escapeHtml(clientUrl)}</a></div>
          </div>
        </div>
      </article>
      <article class="surface-inset client-connections-card">
        <div class="form-section-header"><div><h2>Verbindungen</h2><p class="subtle-copy">Status der registrierten Clients.</p></div></div>
        <div class="client-connections">
          <div class="client-connection-row client-connection-header"><span>Dartboard</span><span>Client-ID</span><span class="client-connection-action"></span></div>
          ${connectionRows}
        </div>
      </article>
    </div>
    <div class="alert alert-info info-banner info-banner-after"><strong>Info:</strong> Die Client-Registrierung und Verbindungsliste werden mit der Backend-API verbunden.</div>`;
}

function renderClientConnection(client) {
  const clientId = String(client.clientId);
  return `<div class="client-connection-row">
    <span class="client-board-label">Dartboard ${escapeHtml(String(client.boardNumber))}</span>
    <code class="client-id">${escapeHtml(clientId)}</code>
    <button class="icon-button client-disconnect-button" type="button" data-disconnect-client="${escapeHtml(clientId)}" aria-label="Client ${escapeHtml(clientId)} trennen" title="Verbindung trennen">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m19 5 3-3" /><path d="m2 22 3-3" /><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" /><path d="M7.5 13.5 10 11" /><path d="M10.5 16.5 13 14" /><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" /></svg>
    </button>
  </div>`;
}

function renderClientQrCode() {
  const target = document.getElementById('clientQrCode');
  if (!target) return;

  const clientUrl = new URL('/clients', window.location.origin).href;
  const link = document.getElementById('clientUrl');
  link.href = clientUrl;
  link.textContent = clientUrl;

  try {
    const qrCode = qrcode(0, 'M');
    qrCode.addData(clientUrl);
    qrCode.make();
    target.innerHTML = qrCode.createSvgTag(4, 2, `Client-Web-App: ${clientUrl}`);
  } catch (error) {
    target.textContent = 'QR-Code konnte nicht erzeugt werden.';
    showNotice(`Der QR-Code konnte nicht erzeugt werden: ${error.message}`, 'error');
  }
}

function renderBroadcastingStep(section) {
  const groupPhaseEnabled = state.configuration.groupPhaseEnabled !== false;
  const placementPhaseEnabled = state.configuration.placementPhaseEnabled !== false;
  const luckyLosersEnabled = state.configuration.luckyLosers !== false;
  const broadcastOptions = [
    { id: 'broadcastWelcomeMessage', label: 'Willkommens-Nachricht', description: 'Zeigt eine Willkommensnachricht.' },
    { id: 'broadcastDraw', label: 'Auslosung', description: 'Zeigt die Auslosung.' },
    { id: 'broadcastNextMatches', label: 'Nächste Partien', description: 'Zeigt die Partien, die als nächstes anstehen.' },
    { id: 'broadcastCurrentMatches', label: 'Aktuelle Spiele', description: 'Zeigt den Zwischenstand der Partien, die gerade laufen.' },
    { id: 'broadcastHighscores', label: 'Highscores', description: 'Zeigt die Highscores dieses Turniers.', disabled: !placementPhaseEnabled },
    { id: 'broadcastCurrentResults', label: 'Ergebnisse Gruppenphase', description: 'Zeigt die Ergebnisse der Gruppenphase.', disabled: !groupPhaseEnabled },
    { id: 'broadcastPlacementQualification', label: 'Endrunden-Qualifikation', description: 'Zeigt die Qualifikanten für die Endrunde.', disabled: !groupPhaseEnabled || !placementPhaseEnabled },
    { id: 'broadcastLuckyLosers', label: 'Ergebnisse Lucky Losers', description: 'Zeigt die Ergebnisse der Lucky Loosers.', disabled: !luckyLosersEnabled },
    { id: 'broadcastPlacementRound', label: 'Ergebnisse Endrunde', description: 'Zeigt die Ergebnisse der Endrunde.', disabled: !placementPhaseEnabled }
  ];
  return `${stepHeading(section)}
    <article class="surface-inset form-section broadcast-settings-card">
      <div class="form-section-header"></div>
      <div class="broadcast-options">
        ${broadcastOptions.map(({ id, label, description, disabled }) => `
          <div class="option-row">
            <div class="option-copy"><strong>${label}</strong><span>${description}</span></div>
            <label class="toggle" aria-label="${label} anzeigen"><input id="${id}" type="checkbox" data-config${disabled ? ' disabled' : ''} checked><span class="toggle-track"></span></label>
          </div>
        `).join('')}
      </div>
    </article>`;
}

function renderResultsStep(section) {
  const entryCount = currentTournamentEntries().length;
  const tournament = state.tournaments.find((item) => item.id === state.currentTournamentId);
  const readyToStart = entryCount === 16 && hasDraw();
  return `${stepHeading(section)}
    <div class="surface-inset form-section">
      <div class="form-section-header"><div><h2>Spielplan & Ergebnisse</h2><p class="subtle-copy">${readyToStart ? 'Alle Voraussetzungen für den Start sind erfüllt.' : 'Für den Start ist die Auslosung erforderlich!'}</p></div><button class="button button-primary" id="startTournamentButton" type="button" ${readyToStart ? '' : 'disabled'}>Turnier starten</button></div>
      <div class="match-placeholder">${tournament ? 'Begegnungen und Ergebniserfassung werden mit der Turnier-API verbunden.' : 'Lege zuerst ein Turnier an, um Begegnungen und Ergebnisse zu verwalten.'}</div>
    </div>`;
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
  stepContentElement.innerHTML = renderers[section.id](section);
  updateTournamentMetrics();
  updateStepControls();
  updateWorkflowStatus();
  renderStepNavigation();
  bindStepActions();
  renderClientQrCode();
}

function updateTournamentMetrics() {
  const participantCount = document.getElementById('tournamentParticipantCount');
  if (participantCount) participantCount.textContent = String(currentTournamentEntries().length);
}

function updateStepControls() {
  const sectionIndex = sectionDefinitions.findIndex((item) => item.id === state.currentStep);
  const previousButton = document.querySelector('[data-step-previous]');
  const nextButton = document.querySelector('[data-step-next]');
  previousButton.hidden = state.currentStep === 3;
  previousButton.disabled = sectionIndex <= 0;
  nextButton.hidden = sectionIndex === sectionDefinitions.length - 1;
  nextButton.disabled = state.currentStep === 3 && state.currentTournamentStatus === 'draft';
  nextButton.textContent = 'weiter';
}

function updateWorkflowStatus() {
  const badge = document.getElementById('workflowStatusBadge');
  const label = document.getElementById('workflowStatusLabel');
  if (!badge || !label) return;
  badge.dataset.status = state.currentTournamentStatus;
  label.textContent = statusLabel(state.currentTournamentStatus);
}

function bindStepActions() {
  const personAvatar = document.getElementById('personAvatar');
  const participantPreviewAvatar = document.getElementById('participantPreviewAvatar');
  const participantPreviewName = document.getElementById('participantPreviewName');
  const teamPreviewAvatar = document.getElementById('teamPreviewAvatar');
  const teamPreviewName = document.getElementById('teamPreviewName');
  const personForm = document.getElementById('personForm');
  const participantChoice = document.getElementById('participantChoice');
  const joinTeam = document.getElementById('joinTeam');
  const firstName = document.getElementById('firstName');
  const lastName = document.getElementById('lastName');
  const nickname = document.getElementById('nickname');
  const gender = document.getElementById('gender');
  const participantFields = {
    preview: personForm?.querySelector('.participant-preview-field'),
    firstName: personForm?.querySelector('.person-first-name'),
    lastName: personForm?.querySelector('.person-last-name'),
    nickname: personForm?.querySelector('.person-nickname'),
    gender: personForm?.querySelector('.person-gender'),
    avatar: personForm?.querySelector('.person-image'),
    team: personForm?.querySelector('.person-team'),
    teamName: personForm?.querySelector('.person-team-name'),
    teamPreview: personForm?.querySelector('.team-preview-field'),
    actions: personForm?.querySelector('.form-actions')
  };
  const updateTeamMode = () => {
    const selectedTeam = state.teams.find((team) => team.id === joinTeam?.value);
    const isNewTeam = joinTeam?.value === 'new';
    const { primaryColor, secondaryColor } = avatarThemeColors();
    participantFields.teamName.hidden = !isNewTeam;
    participantFields.teamPreview.hidden = !selectedTeam;
    if (!selectedTeam || !window.Avatar) return;
    const members = [
      {
        id: selectedTeam.member_low_person_id,
        firstName: selectedTeam.low_first_name,
        lastName: selectedTeam.low_last_name
      },
      {
        id: selectedTeam.member_high_person_id,
        firstName: selectedTeam.high_first_name,
        lastName: selectedTeam.high_last_name
      }
    ].map((member) => {
      const person = state.persons.find((item) => item.id === member.id);
      const firstName = person?.first_name || member.firstName || '';
      const lastName = person?.last_name || member.lastName || '';
      return {
        name: person?.nickname || `${firstName} ${lastName}`.trim(),
        gender: person?.gender
      };
    });
    teamPreviewAvatar.src = window.Avatar.teamUrl(members, {
      size: 41,
      layout: 'stack',
      letters: 1,
      primaryColor,
      secondaryColor
    });
    teamPreviewAvatar.alt = `Avatare für ${selectedTeam.name}`;
    teamPreviewName.textContent = selectedTeam.name;
  };
  const updateParticipantMode = () => {
    if (!participantChoice) return;
    const selectedPerson = state.persons.find((person) => person.id === participantChoice.value);
    const isNew = participantChoice.value === 'new';
    const hasSelection = isNew || Boolean(selectedPerson);
    [participantFields.preview, participantFields.team, participantFields.actions].forEach((field) => {
      field.hidden = !hasSelection;
    });
    [participantFields.firstName, participantFields.lastName, participantFields.nickname, participantFields.gender, participantFields.avatar]
      .forEach((field) => {
        field.hidden = !isNew;
      });
    firstName.value = selectedPerson?.first_name || '';
    lastName.value = selectedPerson?.last_name || '';
    nickname.value = selectedPerson?.nickname || '';
    gender.value = selectedPerson?.gender || 'm';
    firstName.required = isNew;
    lastName.required = isNew;
    [firstName, lastName, nickname].forEach((input) => {
      input.readOnly = Boolean(selectedPerson);
    });
    gender.disabled = Boolean(selectedPerson);
    updatePersonAvatar();
    updateTeamMode();
  };
  const updatePersonAvatar = () => {
    if (!personAvatar || !window.Avatar) return;
    const firstName = document.getElementById('firstName').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const gender = document.getElementById('gender').value;
    const displayName = nickname || firstName;
    const { primaryColor } = avatarThemeColors();
    personAvatar.src = window.Avatar.playerUrl(displayName, {
      size: 64,
      gender,
      letters: 1,
      color: primaryColor
    });
    personAvatar.alt = displayName
      ? `Avatar für ${displayName}`
      : 'Geschlechtsspezifischer Standardavatar';
    participantPreviewAvatar.src = personAvatar.src;
    participantPreviewName.textContent = [
      [firstName, document.getElementById('lastName').value.trim()].filter(Boolean).join(' '),
      nickname ? `(${nickname})` : ''
    ].filter(Boolean).join(' ');
  };
  participantChoice?.addEventListener('change', updateParticipantMode);
  joinTeam?.addEventListener('change', updateTeamMode);
  updateParticipantMode();
  personForm?.addEventListener('input', updatePersonAvatar);
  personForm?.addEventListener('change', updatePersonAvatar);
  updatePersonAvatar();

  const tournamentForm = document.getElementById('tournamentForm');
  tournamentForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      name: formData.get('name'),
      tournamentDate: formData.get('tournamentDate') || null,
      status: 'open'
    };
    const isEditing = Boolean(state.currentTournamentId);

    try {
      const result = await apiRequest(
        isEditing
          ? `/api/tournaments/${encodeURIComponent(state.currentTournamentId)}`
          : '/api/tournaments',
        {
          method: isEditing ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );
      const tournament = result.data;
      state.currentTournamentId = tournament.id;
      state.currentTournamentName = tournament.name;
      state.currentTournamentDate = tournament.tournament_date;
      state.currentTournamentStatus = tournament.status || 'draft';
      showNotice(isEditing ? 'Änderungen wurden gespeichert.' : 'Turnier wurde angelegt.', 'success');
      await loadData();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  personForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const selectedPerson = state.persons.find((person) => person.id === formData.get('participantChoice'));
      if (selectedPerson) {
        const tournamentId = state.currentTournamentId;
        if (!tournamentId) {
          showNotice('Bitte zuerst ein Turnier auswählen.', 'error');
          return;
        }
        await apiRequest('/api/tournament-entries', {
          method: 'POST',
          body: JSON.stringify({ tournamentId, personId: selectedPerson.id })
        });
        showNotice('Teilnehmer wurde zum Turnier hinzugefügt.', 'success');
      } else {
        await apiRequest('/api/persons', {
          method: 'POST',
          body: JSON.stringify({
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            nickname: formData.get('nickname') || null,
            gender: formData.get('gender')
          })
        });
        showNotice('Person wurde gespeichert.', 'success');
      }
      resetDraw();
      form.reset();
      await loadData();
      renderStep();
    } catch (error) {
      showNotice(error.message, 'error');
    }
  });

  document.querySelectorAll('[data-config]').forEach((control) => {
    const key = control.type === 'radio' ? control.name : control.id;
    if (key && Object.hasOwn(state.configuration, key)) {
      if (control.type === 'checkbox') control.checked = state.configuration[key];
      else if (control.type === 'radio') control.checked = control.value === state.configuration[key];
      else control.value = state.configuration[key];
    }
    control.addEventListener('change', () => {
      const configKey = control.type === 'radio' ? control.name : control.id;
      if (!configKey || (control.type === 'radio' && !control.checked)) return;
      const previousGroupPhaseEnabled = state.configuration.groupPhaseEnabled !== false;
      if (configKey === 'qualifierCount') {
        const previousValue = Number(state.configuration.qualifierCount);
        const nextValue = normalizeQualifierCount(
          Number(control.value),
          Number(control.max),
          Number.isFinite(previousValue) ? previousValue : Number(control.value)
        );
        control.value = String(nextValue);
        state.configuration[configKey] = String(nextValue);
      } else {
        state.configuration[configKey] = control.type === 'checkbox' ? control.checked : control.value;
      }
      if (configKey === 'groupCount') resetDraw();
      if (configKey === 'groupPhaseEnabled' && previousGroupPhaseEnabled !== state.configuration.groupPhaseEnabled) {
        const hadDraw = hasDraw();
        resetDraw();
        if (hadDraw) showNotice('Die Auslosung wurde zurückgesetzt, weil sich die Gruppenphase geändert hat.', 'warning');
      }
      if (configKey === 'groupPhaseEnabled' && !state.configuration.groupPhaseEnabled) {
        state.configuration.luckyLosers = false;
        state.configuration.placementPhaseEnabled = true;
        const placementToggle = stepContentElement.querySelector('#placementPhaseEnabled');
        if (placementToggle) placementToggle.checked = true;
        const luckyToggle = stepContentElement.querySelector('#luckyLosers');
        if (luckyToggle) luckyToggle.checked = false;
      }
      if (control.matches('[id^="groupRanking-"]')) validateGroupRanking();
      syncPhaseDependencies();
    });
  });
  validateGroupRanking();

  document.querySelector('[data-reset-group]')?.addEventListener('click', () => {
    const defaults = { groupCount: '4', gamesPerPair: '1', qualifierCount: '16' };
    Object.entries(defaults).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  syncPhaseDependencies();

  stepContentElement.querySelectorAll('[data-disconnect-client]').forEach((button) => {
    button.addEventListener('click', () => {
      showNotice('Das Trennen von Clients ist noch nicht mit der Backend-API verbunden.', 'warning');
    });
  });

  document.getElementById('drawButton')?.addEventListener('click', () => {
    if (hasDraw()) {
      resetDraw();
      renderStep();
      showNotice('Die Auslosung wurde zurückgesetzt.', 'success');
      return;
    }
    const entries = currentTournamentEntries();
    if (!entries.length) {
      showNotice('Für die Auslosung werden Teilnehmer benötigt.', 'warning');
      return;
    }
    const shuffledEntries = [...entries];
    for (let index = shuffledEntries.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledEntries[index], shuffledEntries[swapIndex]] = [shuffledEntries[swapIndex], shuffledEntries[index]];
    }
    if (state.configuration.groupPhaseEnabled === false) {
      state.drawBracketEntries = createDirectBracketEntries(shuffledEntries);
      state.drawGroups = null;
    } else {
      const groupCount = Math.max(1, Number.parseInt(state.configuration.groupCount, 10) || 4);
      state.drawGroups = Array.from({ length: groupCount }, () => []);
      const groupBaseSize = Math.floor(shuffledEntries.length / groupCount);
      const extraGroupCount = shuffledEntries.length % groupCount;
      let entryIndex = 0;
      state.drawGroups.forEach((group, index) => {
        const groupSize = groupBaseSize + (index < extraGroupCount ? 1 : 0);
        group.push(...shuffledEntries.slice(entryIndex, entryIndex + groupSize));
        entryIndex += groupSize;
      });
      state.drawBracketEntries = null;
    }
    renderStep();
    showNotice('Die Teilnehmer wurden ausgelost.', 'success');
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
        resetDraw();
        showNotice('Teilnahme wurde entfernt.', 'success');
        await loadData();
        renderStep();
      } catch (error) {
        showNotice(error.message, 'error');
      }
    });
  });
}

function validateGroupRanking() {
  const controls = [...stepContentElement.querySelectorAll('[id^="groupRanking-"]')];
  if (!controls.length) return;

  const values = controls.map((control) => control.value);
  const nonBlankValues = values.filter(Boolean);
  const duplicateValues = new Set(nonBlankValues.filter((value, index) => nonBlankValues.indexOf(value) !== index));
  const firstBlankIndex = values.indexOf('');
  const hasGap = firstBlankIndex !== -1 && values.slice(firstBlankIndex + 1).some(Boolean);
  const error = stepContentElement.querySelector('#groupRankingError');

  controls.forEach((control, index) => {
    const invalid = duplicateValues.has(values[index])
      || (firstBlankIndex !== -1 && index > firstBlankIndex && values[index] !== '');
    control.classList.toggle('is-invalid', invalid);
    if (invalid) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  });
  if (error) error.hidden = duplicateValues.size === 0 && !hasGap;
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
    const currentTournament = state.tournaments.find((item) => item.id === state.currentTournamentId);
    if (currentTournament) {
      state.currentTournamentName = currentTournament.name;
      state.currentTournamentDate = currentTournament.tournament_date;
      state.currentTournamentStatus = currentTournament.status || state.currentTournamentStatus;
      updateWorkflowStatus();
      updateStepControls();
    }
    if (state.currentTournamentId && !state.tournaments.some((item) => item.id === state.currentTournamentId)) {
      state.currentTournamentId = null;
    }
    updateTournamentMetrics();
    if (state.currentStep === 4 || state.currentStep === 7 || state.currentStep === 10) {
      renderStep();
    }
  } catch (error) {
    document.getElementById('tournamentsList').innerHTML = '<div class="loading-state">Turniere konnten nicht geladen werden. Prüfe die Verbindung und aktualisiere die Ansicht.</div>';
    showNotice(`Die Verwaltungsdaten konnten nicht vollständig geladen werden: ${error.message}`, 'error');
  }
}

async function loadTestTools() {
  const controls = document.getElementById('databaseResetControls');
  try {
    const result = await apiRequest('/api/test-tools');
    controls.hidden = result.databaseResetEnabled !== true;
  } catch (error) {
    console.error('Could not load test tools:', error);
    controls.hidden = true;
  }
}

function openTournament(id) {
  const tournament = state.tournaments.find((item) => item.id === id);
  if (!tournament) return;
  state.currentTournamentId = tournament.id;
  state.currentTournamentName = tournament.name;
  state.currentTournamentDate = tournament.tournament_date;
  state.currentTournamentStatus = tournament.status || 'draft';
  state.currentStep = ['running', 'finished'].includes(state.currentTournamentStatus) ? 10 : 3;
  resetDraw();
  setActiveView(state.currentStep);
}

document.addEventListener('click', (event) => {
  const newTournamentControl = event.target.closest('[data-new-tournament]');
  if (newTournamentControl) {
    event.preventDefault();
    state.currentTournamentId = null;
    state.currentTournamentName = 'Neues Turnier';
    state.currentTournamentDate = null;
    state.currentTournamentStatus = 'draft';
    state.currentStep = 3;
    resetDraw();
    setActiveView(3);
    return;
  }

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
  const sectionIndex = sectionDefinitions.findIndex((section) => section.id === state.currentStep);
  if (sectionIndex > 0) setActiveView(sectionDefinitions[sectionIndex - 1].id);
});

document.querySelector('[data-step-next]').addEventListener('click', () => {
  const sectionIndex = sectionDefinitions.findIndex((section) => section.id === state.currentStep);
  if (sectionIndex >= 0 && sectionIndex < sectionDefinitions.length - 1) {
    setActiveView(sectionDefinitions[sectionIndex + 1].id);
  }
});

document.getElementById('refreshButton').addEventListener('click', loadData);

document.getElementById('resetDatabaseButton').addEventListener('click', async () => {
  if (!window.confirm('Alle Turniere, Personen, Teams und zugehörigen Daten werden endgültig gelöscht. Möchtest du die Testdatenbank wirklich leeren?')) {
    return;
  }

  try {
    await apiRequest('/api/test/reset-database', { method: 'POST' });
    state.currentTournamentId = null;
    state.currentTournamentName = 'Neues Turnier';
    state.currentTournamentDate = null;
    state.currentTournamentStatus = 'draft';
    state.entries = [];
    state.persons = [];
    state.teams = [];
    resetDraw();
    setActiveView(1);
    await loadData();
    showNotice('Die Testdatenbank wurde geleert.', 'success');
  } catch (error) {
    showNotice(error.message, 'error');
  }
});

document.getElementById('broadcastStatus').addEventListener('click', () => {
  if (!broadcastIsActive || document.getElementById('broadcastStatus').disabled) return;
  const displayWindow = window.open('/display', '_blank', 'noopener,noreferrer');
  if (!displayWindow) showNotice('Das Broadcasting-Fenster wurde vom Browser blockiert.', 'error');
});

renderStepNavigation();
renderStep();
renderTournaments();
loadData();
loadTestTools();
window.setInterval(refreshHeaderStatuses, 15000);
