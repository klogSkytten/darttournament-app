const express = require('express');
const { version: appVersion } = require('../package.json');

const app = express();
const port = process.env.PORT || 80;

app.get('/', (_req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="de">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Dart Tournament Admin</title>
        <style>
          :root {
            --bg: #f3f6fb;
            --panel: #ffffff;
            --panel-alt: #eef3f7;
            --border: #d9e1ec;
            --text: #16212f;
            --muted: #53637a;
            --accent: #145c50;
            --accent-soft: #e9f7f3;
            --danger: #a3343b;
            --danger-soft: #fdeaea;
            --success: #1b7a35;
            --warning: #9b6a00;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            background: var(--bg);
            color: var(--text);
            font-family: Arial, sans-serif;
          }

          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem 1rem 4rem;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            margin-bottom: 1.5rem;
          }

          .version {
            display: inline-block;
            padding: 0.4rem 0.8rem;
            background: var(--accent-soft);
            color: var(--accent);
            border-radius: 999px;
            font-weight: bold;
          }

          .status-box {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1rem 1.25rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
          }

          .status-box strong {
            display: block;
            margin-bottom: 0.25rem;
          }

          .status-ok { color: var(--success); }
          .status-error { color: var(--danger); }

          .page-title {
            margin: 0 0 0.5rem;
            font-size: 1.75rem;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.25rem;
          }

          .panel {
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.25rem;
            box-shadow: 0 2px 8px rgba(17, 24, 39, 0.04);
          }

          h1, h2, h3 {
            margin-top: 0;
          }

          form {
            display: grid;
            gap: 0.8rem;
          }

          label {
            display: grid;
            gap: 0.4rem;
            font-weight: 600;
            color: var(--text);
          }

          input, select, textarea, button {
            font: inherit;
          }

          input, select, textarea {
            width: 100%;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: white;
            padding: 0.7rem 0.8rem;
            color: var(--text);
          }

          textarea {
            min-height: 90px;
            resize: vertical;
          }

          button {
            border: none;
            border-radius: 8px;
            padding: 0.75rem 1rem;
            background: var(--accent);
            color: white;
            cursor: pointer;
            font-weight: 700;
          }

          button.secondary {
            background: var(--panel-alt);
            color: var(--text);
            border: 1px solid var(--border);
          }

          button.danger {
            background: var(--danger);
            color: white;
          }

          .table-wrap {
            overflow-x: auto;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.75rem;
          }

          th, td {
            text-align: left;
            vertical-align: top;
            padding: 0.7rem 0.5rem;
            border-bottom: 1px solid var(--border);
            font-size: 0.96rem;
          }

          .muted {
            color: var(--muted);
          }

          .stack {
            display: grid;
            gap: 1rem;
          }

          .hidden { display: none; }

          .notice {
            display: none;
            margin-bottom: 1rem;
            padding: 0.8rem 1rem;
            border-radius: 8px;
            border: 1px solid var(--border);
          }

          .notice.show {
            display: block;
          }

          .notice.success {
            background: #eefaf0;
            border-color: #c9ebd0;
            color: var(--success);
          }

          .notice.error {
            background: var(--danger-soft);
            border-color: #f2b7be;
            color: var(--danger);
          }

          .notice.warning {
            background: #fff7e3;
            border-color: #efd48c;
            color: var(--warning);
          }

          .status-pill {
            display: inline-block;
            padding: 0.25rem 0.55rem;
            border-radius: 999px;
            background: var(--panel-alt);
            color: var(--text);
            font-size: 0.85rem;
            font-weight: 700;
          }

          button:disabled {
            cursor: wait;
            opacity: 0.65;
          }

          @media (max-width: 540px) {
            .container { padding: 1rem 0.75rem 2rem; }
            .header { align-items: flex-start; }
            .header button { padding: 0.65rem; }
            .panel { padding: 1rem; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <h1 class="page-title">Turnierverwaltung</h1>
              <div class="version">Version: ${appVersion}</div>
            </div>
            <button class="secondary" type="button" id="refreshButton">Daten neu laden</button>
          </div>

          <div id="notice" class="notice" role="status" aria-live="polite"></div>

          <div class="status-box">
            <strong>Backend-Status</strong>
            <div id="backendStatus">Prüfe Verbindung...</div>
          </div>

          <div class="grid">
            <section class="panel">
              <h2>Turnier anlegen</h2>
              <form id="tournamentForm">
                <label>
                  Name
                  <input name="name" placeholder="z.B. Ostereier Open" required />
                </label>
                <label>
                  Datum
                  <input name="tournamentDate" type="date" />
                </label>
                <label>
                  Status
                  <select name="status">
                    <option value="draft">Entwurf</option>
                    <option value="open">Offen</option>
                    <option value="running">Laufend</option>
                    <option value="finished">Beendet</option>
                  </select>
                </label>
                <label>
                  Beschreibung
                  <textarea name="description" placeholder="Optionaler Hinweis..."></textarea>
                </label>
                <button type="submit">Turnier speichern</button>
              </form>
            </section>

            <section class="panel">
              <h2>Person anlegen</h2>
              <form id="personForm">
                <label>
                  Vorname
                  <input name="firstName" placeholder="Max" required />
                </label>
                <label>
                  Nachname
                  <input name="lastName" placeholder="Mustermann" required />
                </label>
                <label>
                  Spitzname
                  <input name="nickname" placeholder="Optional" />
                </label>
                <label>
                  Geschlecht
                  <select name="gender">
                    <option value="m">Männlich</option>
                    <option value="w">Weiblich</option>
                  </select>
                </label>
                <button type="submit">Person speichern</button>
              </form>
            </section>

            <section class="panel">
              <h2>Team anlegen</h2>
              <form id="teamForm">
                <label>
                  Teamname
                  <input name="name" placeholder="Optionaler Name" />
                </label>
                <label>
                  Person 1
                  <select name="personLow" id="teamPersonLow"></select>
                </label>
                <label>
                  Person 2
                  <select name="personHigh" id="teamPersonHigh"></select>
                </label>
                <button type="submit">Team speichern</button>
              </form>
            </section>

            <section class="panel">
              <h2>Turnierteilnahme erfassen</h2>
              <form id="entryForm">
                <label>
                  Turnier
                  <select id="entryTournament" required></select>
                </label>
                <label>
                  Typ
                  <select id="entryType">
                    <option value="person">Person</option>
                    <option value="team">Team</option>
                  </select>
                </label>
                <label id="entryPersonField">
                  Person
                  <select id="entryPerson"></select>
                </label>
                <label id="entryTeamField" class="hidden">
                  Team
                  <select id="entryTeam"></select>
                </label>
                <button type="submit">Teilnahme hinzufügen</button>
              </form>
            </section>
          </div>

          <div class="stack" style="margin-top: 1.5rem;">
            <section class="panel">
              <h2>Turniere</h2>
              <div id="tournamentsList" class="table-wrap"></div>
            </section>

            <section class="panel">
              <h2>Personen</h2>
              <div id="personsList" class="table-wrap"></div>
            </section>

            <section class="panel">
              <h2>Teams</h2>
              <div id="teamsList" class="table-wrap"></div>
            </section>

            <section class="panel">
              <h2>Teilnahmen</h2>
              <div id="entriesList" class="table-wrap"></div>
            </section>
          </div>
        </div>

        <script>
          const state = {
            tournaments: [],
            persons: [],
            teams: [],
            entries: []
          };

          const noticeEl = document.getElementById('notice');
          const backendStatusEl = document.getElementById('backendStatus');

          function showNotice(message, kind = 'success') {
            noticeEl.textContent = message;
            noticeEl.className = 'notice show ' + kind;
          }

          function hideNotice() {
            noticeEl.textContent = '';
            noticeEl.className = 'notice';
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

          function tournamentStatusLabel(status) {
            const labels = {
              draft: 'Entwurf',
              open: 'Offen',
              running: 'Laufend',
              finished: 'Beendet'
            };

            return labels[status] || status || 'Entwurf';
          }

          function formatDate(value) {
            if (!value) return '—';
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return value;
            return date.toLocaleDateString('de-DE');
          }

          async function apiRequest(url, options = {}) {
            const response = await fetch(url, {
              headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
              },
              ...options
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
              throw new Error(data.message || 'Anfrage fehlgeschlagen');
            }

            return data;
          }

          function renderTournamentOptions() {
            const select = document.getElementById('entryTournament');
            if (!select) return;

            select.innerHTML = '<option value="">Turnier wählen</option>' +
              state.tournaments.map((t) => '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>').join('');
          }

          function renderPersonOptions() {
            const teamLow = document.getElementById('teamPersonLow');
            const teamHigh = document.getElementById('teamPersonHigh');
            const entryPerson = document.getElementById('entryPerson');

            const options = state.persons.map((person) => {
              const label = person.first_name + ' ' + person.last_name + (person.nickname ? ' (' + person.nickname + ')' : '');
              return '<option value="' + escapeHtml(person.id) + '">' + escapeHtml(label) + '</option>';
            }).join('');

            teamLow.innerHTML = '<option value="">Bitte wählen</option>' + options;
            teamHigh.innerHTML = '<option value="">Bitte wählen</option>' + options;
            entryPerson.innerHTML = '<option value="">Bitte wählen</option>' + options;
          }

          function renderTeamOptions() {
            const select = document.getElementById('entryTeam');
            const options = state.teams.map((team) => '<option value="' + escapeHtml(team.id) + '">' + escapeHtml(team.name) + '</option>').join('');
            select.innerHTML = '<option value="">Bitte wählen</option>' + options;
          }

          function renderTournaments() {
            const container = document.getElementById('tournamentsList');
            if (state.tournaments.length === 0) {
              container.innerHTML = '<p class="muted">Noch keine Turniere angelegt.</p>';
              return;
            }

            const rows = state.tournaments.map((tournament) =>
              '<tr><td><strong>' + escapeHtml(tournament.name) + '</strong></td>' +
              '<td><span class="status-pill">' + escapeHtml(tournamentStatusLabel(tournament.status)) + '</span></td>' +
              '<td>' + escapeHtml(formatDate(tournament.tournament_date)) + '</td>' +
              '<td>' + escapeHtml(tournament.description || '—') + '</td></tr>'
            ).join('');

            container.innerHTML = '<table><thead><tr><th>Name</th><th>Status</th><th>Datum</th><th>Beschreibung</th></tr></thead><tbody>' + rows + '</tbody></table>';
          }

          function renderPersons() {
            const container = document.getElementById('personsList');
            if (state.persons.length === 0) {
              container.innerHTML = '<p class="muted">Noch keine Personen angelegt.</p>';
              return;
            }

            const rows = state.persons.map((person) =>
              '<tr><td>' + escapeHtml(person.first_name) + ' ' + escapeHtml(person.last_name) + '</td>' +
              '<td>' + escapeHtml(person.nickname || '—') + '</td>' +
              '<td>' + (person.gender === 'm' ? 'Männlich' : 'Weiblich') + '</td></tr>'
            ).join('');

            container.innerHTML = '<table><thead><tr><th>Name</th><th>Spitzname</th><th>Geschlecht</th></tr></thead><tbody>' + rows + '</tbody></table>';
          }

          function renderTeams() {
            const container = document.getElementById('teamsList');
            if (state.teams.length === 0) {
              container.innerHTML = '<p class="muted">Noch keine Teams angelegt.</p>';
              return;
            }

            const rows = state.teams.map((team) =>
              '<tr><td><strong>' + escapeHtml(team.name) + '</strong></td>' +
              '<td>' + escapeHtml(team.low_first_name || '—') + ' ' + escapeHtml(team.low_last_name || '') + '</td>' +
              '<td>' + escapeHtml(team.high_first_name || '—') + ' ' + escapeHtml(team.high_last_name || '') + '</td></tr>'
            ).join('');

            container.innerHTML = '<table><thead><tr><th>Name</th><th>Mitglied 1</th><th>Mitglied 2</th></tr></thead><tbody>' + rows + '</tbody></table>';
          }

          function renderEntries() {
            const container = document.getElementById('entriesList');
            if (state.entries.length === 0) {
              container.innerHTML = '<p class="muted">Noch keine Turnierteilnahmen erfasst.</p>';
              return;
            }

            const rows = state.entries.map((entry) => {
              const tournamentName = entry.tournament_name || 'Turnier';
              const participant = entry.person_first_name
                ? entry.person_first_name + ' ' + entry.person_last_name
                : entry.team_name || 'Team';

              return '<tr><td>' + escapeHtml(tournamentName) + '</td>' +
                '<td>' + escapeHtml(participant) + '</td>' +
                '<td>' + (entry.person_id ? 'Einzel' : 'Team') + '</td>' +
                '<td><button class="danger" type="button" data-entry-id="' + escapeHtml(entry.id) + '">Entfernen</button></td></tr>';
            }).join('');

            container.innerHTML = '<table><thead><tr><th>Turnier</th><th>Teilnehmer</th><th>Typ</th><th>Aktion</th></tr></thead><tbody>' + rows + '</tbody></table>';

            container.querySelectorAll('[data-entry-id]').forEach((button) => {
              button.addEventListener('click', async () => {
                const id = button.getAttribute('data-entry-id');
                if (!window.confirm('Diese Turnierteilnahme wirklich entfernen?')) return;

                try {
                  await apiRequest('/api/tournament-entries/' + encodeURIComponent(id), { method: 'DELETE' });
                  showNotice('Teilnahme entfernt.', 'success');
                  await loadData();
                } catch (error) {
                  showNotice(error.message, 'error');
                }
              });
            });
          }

          function setEntryTypeVisibility() {
            const entryType = document.getElementById('entryType');
            const personField = document.getElementById('entryPersonField');
            const teamField = document.getElementById('entryTeamField');

            if (entryType.value === 'team') {
              personField.classList.add('hidden');
              teamField.classList.remove('hidden');
            } else {
              personField.classList.remove('hidden');
              teamField.classList.add('hidden');
            }
          }

          async function loadData() {
            backendStatusEl.textContent = 'Lade Daten und prüfe Backend...';
            try {
              const [ready, tournamentsResponse, personsResponse, teamsResponse, entriesResponse] = await Promise.all([
                apiRequest('/api/ready'),
                apiRequest('/api/tournaments'),
                apiRequest('/api/persons'),
                apiRequest('/api/teams'),
                apiRequest('/api/tournament-entries')
              ]);

              state.tournaments = tournamentsResponse.data || [];
              state.persons = personsResponse.data || [];
              state.teams = teamsResponse.data || [];
              state.entries = entriesResponse.data || [];

              renderTournamentOptions();
              renderPersonOptions();
              renderTeamOptions();
              renderTournaments();
              renderPersons();
              renderTeams();
              renderEntries();

              backendStatusEl.textContent = 'OK – ' + ready.message;
              backendStatusEl.className = 'status-ok';
            } catch (error) {
              backendStatusEl.textContent = 'Fehler – ' + error.message;
              backendStatusEl.className = 'status-error';
              ['tournamentsList', 'personsList', 'teamsList', 'entriesList'].forEach((id) => {
                document.getElementById(id).textContent = 'Daten konnten nicht geladen werden. Bitte Verbindung prüfen und erneut laden.';
              });
              showNotice('Die Verwaltungsdaten konnten nicht vollständig geladen werden.', 'error');
            }
          }

          document.getElementById('refreshButton').addEventListener('click', async () => {
            hideNotice();
            await loadData();
          });

          document.getElementById('tournamentForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const payload = {
              name: formData.get('name'),
              tournamentDate: formData.get('tournamentDate') || null,
              description: formData.get('description') || null,
              status: formData.get('status') || 'draft'
            };

            try {
              await apiRequest('/api/tournaments', {
                method: 'POST',
                body: JSON.stringify(payload)
              });

              event.currentTarget.reset();
              showNotice('Turnier wurde angelegt.', 'success');
              await loadData();
            } catch (error) {
              showNotice(error.message, 'error');
            }
          });

          document.getElementById('personForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const payload = {
              firstName: formData.get('firstName'),
              lastName: formData.get('lastName'),
              nickname: formData.get('nickname') || null,
              gender: formData.get('gender')
            };

            try {
              await apiRequest('/api/persons', {
                method: 'POST',
                body: JSON.stringify(payload)
              });

              event.currentTarget.reset();
              showNotice('Person wurde angelegt.', 'success');
              await loadData();
            } catch (error) {
              showNotice(error.message, 'error');
            }
          });

          document.getElementById('teamForm').addEventListener('submit', async (event) => {
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

              event.currentTarget.reset();
              showNotice('Team wurde angelegt.', 'success');
              await loadData();
            } catch (error) {
              showNotice(error.message, 'error');
            }
          });

          document.getElementById('entryForm').addEventListener('submit', async (event) => {
            event.preventDefault();
            const tournamentId = document.getElementById('entryTournament').value;
            const entryType = document.getElementById('entryType').value;

            if (!tournamentId) {
              showNotice('Bitte ein Turnier wählen.', 'error');
              return;
            }

            try {
              const payload = { tournamentId };

              if (entryType === 'person') {
                const personId = document.getElementById('entryPerson').value;
                if (!personId) {
                  showNotice('Bitte eine Person wählen.', 'error');
                  return;
                }
                payload.personId = personId;
              } else {
                const teamId = document.getElementById('entryTeam').value;
                if (!teamId) {
                  showNotice('Bitte ein Team wählen.', 'error');
                  return;
                }
                payload.teamId = teamId;
              }

              const result = await apiRequest('/api/tournament-entries', {
                method: 'POST',
                body: JSON.stringify(payload)
              });

              showNotice(result.message || 'Teilnahme wurde gespeichert.', result.message ? 'warning' : 'success');
              await loadData();
            } catch (error) {
              showNotice(error.message, 'error');
            }
          });

          document.getElementById('entryType').addEventListener('change', setEntryTypeVisibility);

          loadData();
        </script>
      </body>
    </html>
  `);
});

app.listen(port, () => {
  console.log(`Frontend listening on port ${port} | version ${appVersion}`);
});
