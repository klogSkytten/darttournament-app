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

    const firstTournament = (await post('/api/tournaments', { name: 'First tournament' })).data;
    const secondTournament = (await post('/api/tournaments', { name: 'Second tournament' })).data;
    const people = [];
    for (const firstName of ['Alex', 'Bea', 'Chris', 'Dana']) {
      people.push((await post('/api/persons', { firstName, lastName: 'Test', gender: 'm' })).data);
    }
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
