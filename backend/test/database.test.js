import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { bootstrapDatabase, database, resetDatabase } from '../dist/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test('database bootstrap is repeatable and enforces core relationships', {
  skip: !testDatabaseUrl && 'Set TEST_DATABASE_URL to run PostgreSQL integration tests.',
}, async () => {
  const adminPool = new Pool({ connectionString: testDatabaseUrl });
  const schemaName = `bootstrap_test_${randomUUID().replaceAll('-', '')}`;
  const upgradeSchemaName = `bootstrap_upgrade_${randomUUID().replaceAll('-', '')}`;
  let testPool;
  let upgradePool;

  try {
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    testPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schemaName},public`,
    });

    await bootstrapDatabase(testPool);
    const initializedTables = await testPool.query(
      `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
      `,
      [schemaName],
    );
    assert.deepEqual(
      initializedTables.rows.map((row) => row.table_name).sort(),
      [
        'persons',
        'teams',
        'tournament_board_clients',
        'tournament_entries',
        'tournament_entry_members',
        'tournament_match_entry_results',
        'tournament_match_participants',
        'tournament_match_results',
        'tournament_matches',
        'tournament_phase_entries',
        'tournament_phase_groups',
        'tournament_phase_rules',
        'tournament_phases',
        'tournaments',
      ].sort(),
    );
    const tournamentColumns = await testPool.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tournaments'
      `,
      [schemaName],
    );
    const tournamentColumnNames = tournamentColumns.rows.map((row) => row.column_name);
    assert.ok(tournamentColumnNames.includes('winner_tournament_entry_id'));
    assert.ok(tournamentColumnNames.includes('participation_fee_enabled'));
    assert.ok(!tournamentColumnNames.includes('description'));

    const tournamentResult = await testPool.query(
      `INSERT INTO tournaments (name) VALUES ('Bootstrap test') RETURNING id, participation_fee_enabled`,
    );
    const tournamentId = tournamentResult.rows[0].id;
    assert.equal(tournamentResult.rows[0].participation_fee_enabled, true);

    const personResult = await testPool.query(`
      INSERT INTO persons (first_name, last_name, gender)
      VALUES ('Alex', 'One', 'm'), ('Sam', 'Two', 'w'), ('Lee', 'Three', 'm')
      RETURNING id
    `);
    const [personOne, personTwo, personThree] = personResult.rows.map((row) => row.id).sort();

    const teamResult = await testPool.query(
      `
        INSERT INTO teams (name, member_low_person_id, member_high_person_id)
        VALUES ('Alex | Sam', $1, $2)
        RETURNING id
      `,
      [personOne, personTwo],
    );
    const teamId = teamResult.rows[0].id;

    await assert.rejects(
      testPool.query(
        `
          INSERT INTO teams (name, member_low_person_id, member_high_person_id)
          VALUES ('Duplicate pair', $1, $2)
        `,
        [personOne, personTwo],
      ),
      { code: '23505' },
    );

    await assert.rejects(
      testPool.query(
        `
          INSERT INTO teams (name, member_low_person_id, member_high_person_id)
          VALUES (' alex | sam ', $1, $2)
        `,
        [personOne, personThree],
      ),
      { code: '23505' },
    );

    const entryResult = await testPool.query(
      `
        INSERT INTO tournament_entries (tournament_id, team_id)
        VALUES ($1, $2)
        RETURNING id
      `,
      [tournamentId, teamId],
    );
    const entryId = entryResult.rows[0].id;
    const membership = await testPool.query(
      'SELECT person_id FROM tournament_entry_members WHERE tournament_entry_id = $1 ORDER BY person_id',
      [entryId],
    );
    assert.equal(membership.rows.length, 2);
    await testPool.query(
      'UPDATE tournament_entry_members SET participation_fee_paid = true WHERE tournament_entry_id = $1 AND person_id = $2',
      [entryId, membership.rows[0].person_id],
    );
    await testPool.query(
      'UPDATE tournaments SET winner_tournament_entry_id = $1 WHERE id = $2',
      [entryId, tournamentId],
    );

    const phaseResult = await testPool.query(
      `
        INSERT INTO tournament_phases (tournament_id, phase_type, name, phase_order)
        VALUES ($1, 'group', 'Group stage', 1)
        RETURNING id
      `,
      [tournamentId],
    );
    const phaseId = phaseResult.rows[0].id;
    await testPool.query(
      `
        INSERT INTO tournament_phase_entries (tournament_id, phase_id, tournament_entry_id)
        VALUES ($1, $2, $3)
      `,
      [tournamentId, phaseId, entryId],
    );
    await testPool.query(
      `
        INSERT INTO tournament_phase_rules
          (phase_id, sets_to_win, legs_to_win, starting_score, start_rule, checkout_rule, bull_out_rule)
        VALUES ($1, 1, 3, 501, 'single_in', 'double_out', 'classic')
      `,
      [phaseId],
    );

    const matchResult = await testPool.query(
      `
        INSERT INTO tournament_matches (tournament_id, phase_id, round_number, match_number)
        VALUES ($1, $2, 1, 1)
        RETURNING id
      `,
      [tournamentId, phaseId],
    );
    const matchId = matchResult.rows[0].id;
    await testPool.query(
      `
        INSERT INTO tournament_match_participants
          (tournament_id, phase_id, match_id, tournament_entry_id, slot)
        VALUES ($1, $2, $3, $4, 1)
      `,
      [tournamentId, phaseId, matchId, entryId],
    );

    await assert.rejects(
      testPool.query(
        `
          INSERT INTO tournament_match_participants
            (tournament_id, phase_id, match_id, tournament_entry_id, slot)
          VALUES ($1, $2, $3, $4, 2)
        `,
        [randomUUID(), phaseId, matchId, randomUUID()],
      ),
      { code: '23503' },
    );

    await testPool.query(
      `
        INSERT INTO tournament_match_results (match_id, tournament_entry_id)
        VALUES ($1, $2)
      `,
      [matchId, entryId],
    );
    await testPool.query(
      `
        INSERT INTO tournament_match_entry_results
          (match_id, tournament_entry_id, sets_won, legs_won)
        VALUES ($1, $2, 1, 3)
      `,
      [matchId, entryId],
    );

    await testPool.query(
      `
        INSERT INTO tournament_board_clients (tournament_id, client_secret_hash, board_number)
        VALUES ($1, 'test-hash', 1)
      `,
      [tournamentId],
    );
    await assert.rejects(
      testPool.query(
        `
          INSERT INTO tournament_board_clients
            (tournament_id, client_secret_hash, board_number)
          VALUES ($1, 'other-test-hash', 1)
        `,
        [tournamentId],
      ),
      { code: '23505' },
    );

    await bootstrapDatabase(testPool);
    await testPool.query(
      'UPDATE tournaments SET participation_fee_enabled = false WHERE id = $1',
      [tournamentId],
    );
    await testPool.query(
      'ALTER TABLE tournaments ALTER COLUMN participation_fee_enabled SET DEFAULT false',
    );
    await bootstrapDatabase(testPool);
    const persistedTournament = await testPool.query(
      'SELECT name, dartboard_count, winner_tournament_entry_id, participation_fee_enabled FROM tournaments WHERE id = $1',
      [tournamentId],
    );
    assert.deepEqual(persistedTournament.rows, [{
      name: 'Bootstrap test',
      dartboard_count: 0,
      winner_tournament_entry_id: entryId,
      participation_fee_enabled: false,
    }]);
    const newTournament = await testPool.query(
      `INSERT INTO tournaments (name) VALUES ('Default fee setting test') RETURNING participation_fee_enabled`,
    );
    assert.equal(newTournament.rows[0].participation_fee_enabled, true);
    const persistedFee = await testPool.query(
      'SELECT participation_fee_paid FROM tournament_entry_members WHERE tournament_entry_id = $1 AND person_id = $2',
      [entryId, membership.rows[0].person_id],
    );
    assert.equal(persistedFee.rows[0].participation_fee_paid, true);

    await resetDatabase(testPool);
    const remainingTournaments = await testPool.query('SELECT count(*)::integer AS count FROM tournaments');
    const remainingPersons = await testPool.query('SELECT count(*)::integer AS count FROM persons');
    assert.equal(remainingTournaments.rows[0].count, 0);
    assert.equal(remainingPersons.rows[0].count, 0);

    await adminPool.query(`CREATE SCHEMA "${upgradeSchemaName}"`);
    upgradePool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${upgradeSchemaName},public`,
    });
    await upgradePool.query(`
      CREATE TABLE tournaments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        tournament_date DATE,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        participation_fee_enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const existingTournament = await upgradePool.query(
      `INSERT INTO tournaments (name) VALUES ('Existing tournament') RETURNING id`,
    );
    await bootstrapDatabase(upgradePool);
    const upgradedTournament = await upgradePool.query(
      'SELECT name, dartboard_count, participation_fee_enabled FROM tournaments WHERE id = $1',
      [existingTournament.rows[0].id],
    );
    assert.deepEqual(upgradedTournament.rows, [
      { name: 'Existing tournament', dartboard_count: 0, participation_fee_enabled: false },
    ]);
    const upgradeDefault = await upgradePool.query(
      `SELECT column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'tournaments' AND column_name = 'participation_fee_enabled'`,
      [upgradeSchemaName],
    );
    assert.equal(upgradeDefault.rows[0].column_default, 'true');
    const oldDescription = await upgradePool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'tournaments' AND column_name = 'description'
      `,
      [upgradeSchemaName],
    );
    assert.equal(oldDescription.rows.length, 0);
  } finally {
    if (testPool) {
      await testPool.end();
    }

    if (upgradePool) {
      await upgradePool.end();
    }

    await adminPool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool.query(`DROP SCHEMA IF EXISTS "${upgradeSchemaName}" CASCADE`);
    await adminPool.end();
    await database.end();
  }
});
