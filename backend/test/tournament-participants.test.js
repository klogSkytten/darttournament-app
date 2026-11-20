import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { once } from 'node:events';
import test from 'node:test';
import { Pool } from 'pg';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('renaming a reused team preserves its identity and rolls back name conflicts', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to run PostgreSQL integration tests.',
}, async () => {
  const admin = new Pool({ connectionString: testDatabaseUrl });
  const schema = `team_rename_test_${randomUUID().replaceAll('-', '')}`;
  let server;
  let child;
  let output = '';
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const url = new URL(testDatabaseUrl);
    url.searchParams.set('options', `-c search_path=${schema},public`);

    server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server = null;
    child = spawn(process.execPath, ['dist/index.js'], {
      env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(port), NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`${base}/api/ready`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // The server may not have started listening yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `Backend did not start: ${output}`);

    const post = async (path, body, status = 201) => {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    };

    const patch = async (path, body, status = 200) => {
      const response = await fetch(`${base}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    };

    const put = async (path, body, status = 200) => {
      const response = await fetch(`${base}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    };

    const firstTournament = (await post('/api/tournaments', { name: 'First tournament' })).data;
    const secondTournament = (await post('/api/tournaments', { name: 'Second tournament' })).data;
    const initialSettings = await (await fetch(`${base}/api/settings`)).json();
    assert.equal(initialSettings.data.rules.groupPhase.startingScore, 301);
    const changedSettings = structuredClone(initialSettings.data);
    changedSettings.rules.groupPhase.startingScore = 501;
    changedSettings.timings.baseMinutesPerLeg = 6;
    const savedSettings = await put('/api/settings', changedSettings);
    assert.equal(savedSettings.data.rules.groupPhase.startingScore, 501);
    assert.equal(savedSettings.data.timings.baseMinutesPerLeg, 6);
    await put('/api/settings', { rules: {}, timings: {} }, 400);

    const people = [];
    for (const firstName of ['Alex', 'Bea', 'Chris', 'Dana']) {
      people.push((await post('/api/persons', { firstName, lastName: 'Test', gender: 'm' })).data);
    }
    const updatedPerson = await put(`/api/persons/${people[0].id}`, {
      firstName: 'Alexandra',
      lastName: 'Updated',
      nickname: 'Ally',
      gender: 'w',
    });
    assert.equal(updatedPerson.data.first_name, 'Alexandra');
    assert.equal(updatedPerson.data.nickname, 'Ally');
    await put(`/api/persons/${people[0].id}`, { firstName: '', lastName: 'Updated', gender: 'w' }, 400);

    const team = (await post('/api/teams', {
      name: 'Original team',
      personIds: [people[0].id, people[1].id],
    })).data;
    await post('/api/tournament-entries', { tournamentId: firstTournament.id, teamId: team.id });
    let entries = await (await fetch(`${base}/api/tournament-entries`)).json();
    assert.deepEqual(
      entries.data.find((entry) => entry.tournament_id === firstTournament.id).members
        .map((member) => member.person_id).sort(),
      [people[0].id, people[1].id].sort(),
    );
    await post('/api/teams', { name: 'Taken name', personIds: [people[2].id, people[3].id] });

    await post('/api/tournament-participants', {
      tournamentId: secondTournament.id,
      personId: people[0].id,
    });
    await post('/api/tournament-participants', {
      tournamentId: secondTournament.id,
      personId: people[1].id,
    });
    entries = await (await fetch(`${base}/api/tournament-entries`)).json();
    const secondTournamentEntries = entries.data
      .filter((entry) => entry.tournament_id === secondTournament.id)
      .map((entry) => entry.id);
    const draw = {
      version: 1,
      configuration: {
        groupPhaseEnabled: true,
        groupCount: 1,
        gamesPerPair: 1,
        qualifierCount: 4,
        placementPhaseEnabled: true,
        placementGames: true,
        luckyLosers: false,
      },
      groups: [secondTournamentEntries],
      directBracketEntries: null,
      brackets: {
        endRound: [
          { type: 'group', groupIndex: 0, place: 1 },
          { type: 'group', groupIndex: 0, place: 2 },
        ],
        luckyLosers: null,
      },
    };
    const savedDraw = await put(`/api/tournaments/${secondTournament.id}/draw`, draw);
    assert.deepEqual(savedDraw.data, draw);
    const loadedDraw = await (await fetch(`${base}/api/tournaments/${secondTournament.id}/draw`)).json();
    assert.deepEqual(loadedDraw.data, draw);
    await put(`/api/tournaments/${secondTournament.id}/draw`, {
      ...draw,
      groups: [[secondTournamentEntries[0], secondTournamentEntries[0]]],
    }, 400);
    const unchangedDraw = await (await fetch(`${base}/api/tournaments/${secondTournament.id}/draw`)).json();
    assert.deepEqual(unchangedDraw.data, draw);
    const resetDrawResponse = await fetch(`${base}/api/tournaments/${secondTournament.id}/draw`, {
      method: 'DELETE',
    });
    assert.equal(resetDrawResponse.status, 200);
    assert.equal((await resetDrawResponse.json()).data, null);
    await put(`/api/tournaments/${secondTournament.id}/draw`, draw);
    await patch(`/api/tournaments/${secondTournament.id}/participants/${people[0].id}/fee`, { paid: true });
    await patch(`/api/tournaments/${secondTournament.id}/participation-fee`, { enabled: true });
    let tournaments = await (await fetch(`${base}/api/tournaments`)).json();
    assert.equal(
      tournaments.data.find((item) => item.id === secondTournament.id).participation_fee_enabled,
      true,
    );

    await post('/api/tournament-participants', {
      tournamentId: secondTournament.id,
      personId: people[1].id,
      teamPartnerId: people[0].id,
      teamName: '  taken NAME  ',
    }, 409);
    let teams = await (await fetch(`${base}/api/teams`)).json();
    assert.equal(teams.data.find((item) => item.id === team.id).name, 'Original team');
    entries = await (await fetch(`${base}/api/tournament-entries`)).json();
    assert.equal(entries.data.filter((entry) => entry.tournament_id === secondTournament.id).length, 2);

    const registration = await post('/api/tournament-participants', {
      tournamentId: secondTournament.id,
      personId: people[1].id,
      teamPartnerId: people[0].id,
      teamName: '  Renamed team  ',
    });
    assert.equal(registration.data.team.id, team.id);
    assert.equal(registration.data.team.name, 'Renamed team');
    teams = await (await fetch(`${base}/api/teams`)).json();
    assert.equal(teams.data.find((item) => item.id === team.id).name, 'Renamed team');
    entries = await (await fetch(`${base}/api/tournament-entries`)).json();
    assert.deepEqual(
      entries.data.filter((entry) => entry.team_id === team.id)
        .map((entry) => [entry.tournament_id, entry.team_name]).sort(),
      [[firstTournament.id, 'Renamed team'], [secondTournament.id, 'Renamed team']].sort(),
    );
    const invalidatedDraw = await (await fetch(`${base}/api/tournaments/${secondTournament.id}/draw`)).json();
    assert.equal(invalidatedDraw.data, null);
    assert.deepEqual(
      entries.data.find((entry) => entry.tournament_id === secondTournament.id).members
        .map((member) => [member.person_id, member.participation_fee_paid]).sort(),
      [[people[0].id, true], [people[1].id, false]].sort(),
    );
    await patch(
      `/api/tournaments/${secondTournament.id}/participants/${people[1].id}/fee`,
      { paid: 'true' },
      400,
    );
    await patch(
      `/api/tournaments/${secondTournament.id}/participants/${people[1].id}/fee`,
      { paid: true },
    );
    entries = await (await fetch(`${base}/api/tournament-entries`)).json();
    assert.ok(entries.data.find((entry) => entry.tournament_id === secondTournament.id)
      .members.every((member) => member.participation_fee_paid));

    await post('/api/database/cleanup', {}, 400);
    await post('/api/tournaments', {
      name: 'Past unstarted tournament',
      tournamentDate: '2000-01-01',
    });
    const cleanupResult = await post('/api/database/cleanup', { confirmed: true }, 200);
    assert.deepEqual(cleanupResult.data, {
      deletedTournaments: 1,
      deletedTeams: 1,
      deletedPersons: 2,
    });
    const remainingPeople = await (await fetch(`${base}/api/persons`)).json();
    assert.equal(remainingPeople.data.length, 2);

    const runningTournament = (await post('/api/tournaments', { name: 'Running tournament' })).data;
    const runningPeople = [];
    for (const firstName of ['Eli', 'Finn', 'Gray', 'Harper', 'Indigo']) {
      runningPeople.push((await post('/api/persons', {
        firstName,
        lastName: 'Tournament',
        gender: 'm',
      })).data);
    }
    for (const person of runningPeople.slice(0, 4)) {
      await post('/api/tournament-participants', {
        tournamentId: runningTournament.id,
        personId: person.id,
      });
    }
    entries = await (await fetch('/api/tournament-entries')).json();
    const runningEntryIds = entries.data
      .filter((entry) => entry.tournament_id === runningTournament.id)
      .map((entry) => entry.id);
    const runningDraw = {
      version: 1,
      configuration: {
        groupPhaseEnabled: true,
        groupCount: 1,
        gamesPerPair: 1,
        qualifierCount: 4,
        placementPhaseEnabled: true,
        placementGames: true,
        luckyLosers: false,
      },
      groups: [runningEntryIds],
      directBracketEntries: null,
      brackets: {
        endRound: [1, 2, 3, 4].map((place) => ({ type: 'group', groupIndex: 0, place })),
        luckyLosers: null,
      },
    };
    await put(`/api/tournaments/${runningTournament.id}/draw`, runningDraw);
    const schedule = [];
    for (let first = 0; first < runningEntryIds.length; first += 1) {
      for (let second = first + 1; second < runningEntryIds.length; second += 1) {
        schedule.push({
          number: schedule.length + 1,
          roundNumber: Math.floor(schedule.length / 2) + 1,
          groupIndex: 0,
          firstEntryId: runningEntryIds[first],
          secondEntryId: runningEntryIds[second],
        });
      }
    }
    const rules = {
      setsToWin: 1,
      legsToWin: 3,
      startingScore: 301,
      startRule: 'single_in',
      checkoutRule: 'single_out',
      bullOutRule: 'classic',
    };
    const started = await post(`/api/tournaments/${runningTournament.id}/start`, {
      ruleKey: 'group',
      rules,
      groupRanking: ['Platzierung', 'Siege'],
      matches: schedule,
    }, 200);
    assert.equal(started.data.status, 'running');
    assert.equal(started.data.activePhase.status, 'in_progress');

    const savedMatches = await (await fetch(`/api/tournaments/${runningTournament.id}/matches`)).json();
    assert.equal(savedMatches.data.activePhase.name, 'Gruppenphase');
    assert.equal(savedMatches.data.matches.length, 6);
    const firstMatch = savedMatches.data.matches[0];
    const resultPath = `/api/tournaments/${runningTournament.id}/matches/${firstMatch.id}/result`;
    const resultFor = (firstLegs, secondLegs) => [
      { tournamentEntryId: firstMatch.participants[0].tournamentEntryId, setsWon: firstLegs > secondLegs ? 1 : 0, legsWon: firstLegs },
      { tournamentEntryId: firstMatch.participants[1].tournamentEntryId, setsWon: secondLegs > firstLegs ? 1 : 0, legsWon: secondLegs },
    ];
    await put(resultPath, { results: resultFor(2, 1) }, 400);
    const firstSavedResult = await put(resultPath, { results: resultFor(3, 1) });
    assert.equal(firstSavedResult.data.winnerEntryId, firstMatch.participants[0].tournamentEntryId);
    const editedResult = await put(resultPath, { results: resultFor(2, 3) });
    assert.equal(editedResult.data.winnerEntryId, firstMatch.participants[1].tournamentEntryId);

    const matchesAfterEdit = await (await fetch(`/api/tournaments/${runningTournament.id}/matches`)).json();
    const editedMatch = matchesAfterEdit.data.matches.find((match) => match.id === firstMatch.id);
    assert.equal(editedMatch.participants[0].legsWon, 2);
    assert.equal(editedMatch.participants[1].legsWon, 3);
    assert.equal(editedMatch.winnerEntryId, firstMatch.participants[1].tournamentEntryId);

    await put(`/api/tournaments/${runningTournament.id}/draw`, runningDraw, 409);
    await post('/api/tournament-participants', {
      tournamentId: runningTournament.id,
      personId: runningPeople[4].id,
    }, 409);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
