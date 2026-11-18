import { Pool } from 'pg';
import { config } from './config.js';
import { DEFAULT_GENERAL_SETTINGS } from './settings.js';

export const database = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 5_000,
});

export async function bootstrapDatabase(pool: Pool = database): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(827364827364)');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS tournaments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL CHECK (btrim(name) <> ''),
        tournament_date DATE,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS general_settings (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        settings JSONB NOT NULL CHECK (jsonb_typeof(settings) = 'object'),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      ALTER TABLE tournaments
        DROP COLUMN IF EXISTS description;

      ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS dartboard_count INTEGER NOT NULL DEFAULT 0
        CHECK (dartboard_count >= 0);

      ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS participation_fee_enabled BOOLEAN NOT NULL DEFAULT true;

      ALTER TABLE tournaments
        ALTER COLUMN participation_fee_enabled SET DEFAULT true;

      CREATE TABLE IF NOT EXISTS persons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        first_name TEXT NOT NULL CHECK (btrim(first_name) <> ''),
        last_name TEXT NOT NULL CHECK (btrim(last_name) <> ''),
        nickname TEXT,
        gender TEXT NOT NULL CHECK (gender IN ('m', 'w')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL CHECK (btrim(name) <> ''),
        member_low_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
        member_high_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (member_low_person_id < member_high_person_id),
        UNIQUE (member_low_person_id, member_high_person_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS teams_name_case_insensitive_unique
        ON teams (lower(btrim(name)));

      CREATE TABLE IF NOT EXISTS tournament_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        person_id UUID REFERENCES persons(id) ON DELETE RESTRICT,
        team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK ((person_id IS NOT NULL) <> (team_id IS NOT NULL)),
        UNIQUE (id, tournament_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS tournament_entries_person_unique
        ON tournament_entries (tournament_id, person_id)
        WHERE person_id IS NOT NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS tournament_entries_team_unique
        ON tournament_entries (tournament_id, team_id)
        WHERE team_id IS NOT NULL;

      ALTER TABLE tournaments
        ADD COLUMN IF NOT EXISTS winner_tournament_entry_id UUID
        REFERENCES tournament_entries(id) ON DELETE SET NULL;

      CREATE TABLE IF NOT EXISTS tournament_entry_members (
        tournament_id UUID NOT NULL,
        tournament_entry_id UUID NOT NULL,
        person_id UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
        participation_fee_paid BOOLEAN NOT NULL DEFAULT false,
        PRIMARY KEY (tournament_entry_id, person_id),
        UNIQUE (tournament_id, person_id),
        FOREIGN KEY (tournament_entry_id, tournament_id)
          REFERENCES tournament_entries (id, tournament_id)
          ON DELETE CASCADE
      );

      ALTER TABLE tournament_entry_members
        ADD COLUMN IF NOT EXISTS participation_fee_paid BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS tournament_phases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        phase_type TEXT NOT NULL
          CHECK (phase_type IN ('group', 'knockout', 'lucky_losers')),
        name TEXT NOT NULL CHECK (btrim(name) <> ''),
        phase_order INTEGER NOT NULL CHECK (phase_order > 0),
        round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number > 0),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'in_progress', 'completed')),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tournament_id, phase_order),
        UNIQUE (id, tournament_id)
      );

      CREATE TABLE IF NOT EXISTS tournament_phase_rules (
        phase_id UUID PRIMARY KEY REFERENCES tournament_phases(id) ON DELETE CASCADE,
        sets_to_win SMALLINT NOT NULL CHECK (sets_to_win > 0),
        legs_to_win SMALLINT NOT NULL CHECK (legs_to_win > 0),
        starting_score SMALLINT NOT NULL
          CHECK (starting_score IN (301, 501, 701, 901)),
        start_rule TEXT NOT NULL CHECK (start_rule IN ('single_in', 'double_in', 'master_in')),
        checkout_rule TEXT NOT NULL CHECK (checkout_rule IN ('single_out', 'double_out', 'master_out')),
        bull_out_rule TEXT NOT NULL CHECK (bull_out_rule IN ('no_bullout', 'classic', 'pdc')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS tournament_phase_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL,
        phase_id UUID NOT NULL,
        name TEXT NOT NULL CHECK (btrim(name) <> ''),
        group_order INTEGER NOT NULL CHECK (group_order > 0),
        UNIQUE (phase_id, name),
        UNIQUE (phase_id, group_order),
        UNIQUE (id, phase_id),
        FOREIGN KEY (phase_id, tournament_id)
          REFERENCES tournament_phases (id, tournament_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_phase_entries (
        tournament_id UUID NOT NULL,
        phase_id UUID NOT NULL,
        tournament_entry_id UUID NOT NULL,
        group_id UUID,
        seed INTEGER CHECK (seed > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (phase_id, tournament_entry_id),
        UNIQUE (phase_id, tournament_entry_id, tournament_id),
        FOREIGN KEY (phase_id, tournament_id)
          REFERENCES tournament_phases (id, tournament_id)
          ON DELETE CASCADE,
        FOREIGN KEY (tournament_entry_id, tournament_id)
          REFERENCES tournament_entries (id, tournament_id)
          ON DELETE CASCADE,
        FOREIGN KEY (group_id, phase_id)
          REFERENCES tournament_phase_groups (id, phase_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL,
        phase_id UUID NOT NULL,
        group_id UUID,
        round_number INTEGER NOT NULL CHECK (round_number > 0),
        match_number INTEGER NOT NULL CHECK (match_number > 0),
        status TEXT NOT NULL DEFAULT 'scheduled'
          CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
        scheduled_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (phase_id, round_number, match_number),
        UNIQUE (id, tournament_id),
        UNIQUE (id, tournament_id, phase_id),
        FOREIGN KEY (phase_id, tournament_id)
          REFERENCES tournament_phases (id, tournament_id)
          ON DELETE CASCADE,
        FOREIGN KEY (group_id, phase_id)
          REFERENCES tournament_phase_groups (id, phase_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_match_participants (
        tournament_id UUID NOT NULL,
        phase_id UUID NOT NULL,
        match_id UUID NOT NULL,
        tournament_entry_id UUID NOT NULL,
        slot SMALLINT NOT NULL CHECK (slot IN (1, 2)),
        PRIMARY KEY (match_id, slot),
        UNIQUE (match_id, tournament_entry_id),
        FOREIGN KEY (match_id, tournament_id, phase_id)
          REFERENCES tournament_matches (id, tournament_id, phase_id)
          ON DELETE CASCADE,
        FOREIGN KEY (phase_id, tournament_entry_id, tournament_id)
          REFERENCES tournament_phase_entries (phase_id, tournament_entry_id, tournament_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_match_results (
        match_id UUID PRIMARY KEY,
        tournament_entry_id UUID NOT NULL,
        recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        FOREIGN KEY (match_id, tournament_entry_id)
          REFERENCES tournament_match_participants (match_id, tournament_entry_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_match_entry_results (
        match_id UUID NOT NULL,
        tournament_entry_id UUID NOT NULL,
        sets_won SMALLINT NOT NULL DEFAULT 0 CHECK (sets_won >= 0),
        legs_won SMALLINT NOT NULL DEFAULT 0 CHECK (legs_won >= 0),
        PRIMARY KEY (match_id, tournament_entry_id),
        FOREIGN KEY (match_id, tournament_entry_id)
          REFERENCES tournament_match_participants (match_id, tournament_entry_id)
          ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tournament_board_clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        client_secret_hash TEXT,
        board_number INTEGER CHECK (board_number > 0),
        last_heartbeat_at TIMESTAMPTZ,
        reservation_expires_at TIMESTAMPTZ,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (revoked_at IS NOT NULL OR client_secret_hash IS NOT NULL),
        UNIQUE (tournament_id, board_number)
      );

      CREATE OR REPLACE FUNCTION validate_tournament_entry_member()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        entry_person_id UUID;
        entry_team_id UUID;
        team_member_low_id UUID;
        team_member_high_id UUID;
      BEGIN
        SELECT person_id, team_id
        INTO entry_person_id, entry_team_id
        FROM tournament_entries
        WHERE id = NEW.tournament_entry_id
          AND tournament_id = NEW.tournament_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Tournament entry does not exist';
        END IF;

        IF entry_person_id IS NOT NULL THEN
          IF entry_person_id <> NEW.person_id THEN
            RAISE EXCEPTION 'Person does not belong to this tournament entry';
          END IF;
        ELSE
          SELECT member_low_person_id, member_high_person_id
          INTO team_member_low_id, team_member_high_id
          FROM teams
          WHERE id = entry_team_id;

          IF NEW.person_id NOT IN (team_member_low_id, team_member_high_id) THEN
            RAISE EXCEPTION 'Person is not a member of this team';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$;

      CREATE OR REPLACE FUNCTION validate_tournament_entry_conflict()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      DECLARE
        team_member_ids UUID[];
      BEGIN
        IF NEW.person_id IS NOT NULL THEN
          IF EXISTS (
            SELECT 1
            FROM tournament_entries te
            LEFT JOIN teams t ON t.id = te.team_id
            WHERE te.tournament_id = NEW.tournament_id
              AND (
                te.person_id = NEW.person_id
                OR (te.team_id IS NOT NULL AND (
                  t.member_low_person_id = NEW.person_id
                  OR t.member_high_person_id = NEW.person_id
                ))
              )
              AND te.id <> NEW.id
          ) THEN
            RAISE EXCEPTION 'Person is already registered in this tournament as an individual or team member';
          END IF;
        END IF;

        IF NEW.team_id IS NOT NULL THEN
          SELECT array_agg(person_id) INTO team_member_ids
          FROM (
            SELECT member_low_person_id AS person_id FROM teams WHERE id = NEW.team_id
            UNION ALL
            SELECT member_high_person_id AS person_id FROM teams WHERE id = NEW.team_id
          ) team_people;

          IF EXISTS (
            SELECT 1
            FROM tournament_entries te
            WHERE te.tournament_id = NEW.tournament_id
              AND te.id <> NEW.id
              AND (
                te.person_id IS NOT NULL AND te.person_id = ANY(team_member_ids)
                OR (
                  te.team_id IS NOT NULL
                  AND te.team_id <> NEW.team_id
                  AND EXISTS (
                    SELECT 1
                    FROM teams t
                    WHERE t.id = te.team_id
                      AND (
                        t.member_low_person_id = ANY(team_member_ids)
                        OR t.member_high_person_id = ANY(team_member_ids)
                      )
                  )
                )
              )
          ) THEN
            RAISE EXCEPTION 'One or more team members are already registered in this tournament';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS tournament_entry_member_must_match_entry ON tournament_entry_members;
      DROP TRIGGER IF EXISTS tournament_entry_conflict_guard ON tournament_entries;

      CREATE TRIGGER tournament_entry_member_must_match_entry
        BEFORE INSERT OR UPDATE ON tournament_entry_members
        FOR EACH ROW
        EXECUTE FUNCTION validate_tournament_entry_member();

      CREATE TRIGGER tournament_entry_conflict_guard
        BEFORE INSERT OR UPDATE ON tournament_entries
        FOR EACH ROW
        EXECUTE FUNCTION validate_tournament_entry_conflict();

      CREATE OR REPLACE FUNCTION create_tournament_entry_members()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF NEW.person_id IS NOT NULL THEN
          INSERT INTO tournament_entry_members (tournament_id, tournament_entry_id, person_id)
          VALUES (NEW.tournament_id, NEW.id, NEW.person_id)
          ON CONFLICT (tournament_id, person_id) DO NOTHING;
        ELSE
          INSERT INTO tournament_entry_members (tournament_id, tournament_entry_id, person_id)
          SELECT NEW.tournament_id, NEW.id, team_member.person_id
          FROM teams
          CROSS JOIN LATERAL (
            VALUES (teams.member_low_person_id), (teams.member_high_person_id)
          ) AS team_member(person_id)
          WHERE teams.id = NEW.team_id
          ON CONFLICT (tournament_id, person_id) DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$;

      DROP TRIGGER IF EXISTS tournament_entry_members_after_insert ON tournament_entries;
      CREATE TRIGGER tournament_entry_members_after_insert
        AFTER INSERT ON tournament_entries
        FOR EACH ROW
        EXECUTE FUNCTION create_tournament_entry_members();

      INSERT INTO tournament_entry_members (tournament_id, tournament_entry_id, person_id)
      SELECT members.tournament_id, members.tournament_entry_id, members.person_id
      FROM (
        SELECT te.tournament_id, te.id AS tournament_entry_id, te.person_id
        FROM tournament_entries te
        WHERE te.person_id IS NOT NULL
        UNION ALL
        SELECT te.tournament_id, te.id, team_member.person_id
        FROM tournament_entries te
        JOIN teams ON teams.id = te.team_id
        CROSS JOIN LATERAL (
          VALUES (teams.member_low_person_id), (teams.member_high_person_id)
        ) AS team_member(person_id)
      ) AS members
      ON CONFLICT (tournament_id, person_id) DO NOTHING;
    `);
    await client.query(
      'INSERT INTO general_settings (id, settings) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING',
      [JSON.stringify(DEFAULT_GENERAL_SETTINGS)],
    );
    const ruleDefaultsMigration = await client.query(
      `
        INSERT INTO schema_migrations (migration_id)
        VALUES ('20261118_rule_preset_defaults')
        ON CONFLICT (migration_id) DO NOTHING
        RETURNING migration_id
      `,
    );
    if (ruleDefaultsMigration.rows.length > 0) {
      await client.query(
        `
          UPDATE general_settings
          SET settings = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(settings, '{rules,luckyLosers}', $1::jsonb),
                '{rules,endRound}', $2::jsonb
              ),
              '{rules,endRoundSemifinal}', $3::jsonb
            ),
            '{rules,endRoundFinal}', $4::jsonb
          ),
          updated_at = now()
          WHERE id = 1
        `,
        [
          JSON.stringify(DEFAULT_GENERAL_SETTINGS.rules.luckyLosers),
          JSON.stringify(DEFAULT_GENERAL_SETTINGS.rules.endRound),
          JSON.stringify(DEFAULT_GENERAL_SETTINGS.rules.endRoundSemifinal),
          JSON.stringify(DEFAULT_GENERAL_SETTINGS.rules.endRoundFinal),
        ],
      );
    }
    await client.query('COMMIT');
    console.log('Database schema initialized.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back database schema initialization:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function cleanupLocalData(pool: Pool = database): Promise<{
  deletedTournaments: number;
  deletedTeams: number;
  deletedPersons: number;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(827364827364)');
    const tournaments = await client.query(
      `
        DELETE FROM tournaments
        WHERE tournament_date < CURRENT_DATE
          AND status IN ('draft', 'open')
          AND NOT EXISTS (
            SELECT 1
            FROM tournament_phases tp
            WHERE tp.tournament_id = tournaments.id
              AND (
                tp.status IN ('in_progress', 'completed')
                OR tp.started_at IS NOT NULL
                OR tp.completed_at IS NOT NULL
              )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM tournament_matches tm
            WHERE tm.tournament_id = tournaments.id
              AND (
                tm.status IN ('in_progress', 'completed')
                OR tm.started_at IS NOT NULL
                OR tm.completed_at IS NOT NULL
              )
          )
        RETURNING id
      `,
    );
    const teams = await client.query(
      `
        DELETE FROM teams AS team
        WHERE NOT EXISTS (
          SELECT 1 FROM tournament_entries te WHERE te.team_id = team.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM tournament_match_participants tmp
          JOIN tournament_matches tm ON tm.id = tmp.match_id
          JOIN tournament_entries te ON te.id = tmp.tournament_entry_id
          WHERE te.team_id = team.id
            AND (
              tm.status IN ('in_progress', 'completed')
              OR tm.started_at IS NOT NULL
              OR tm.completed_at IS NOT NULL
            )
        )
        RETURNING id
      `,
    );
    const persons = await client.query(
      `
        DELETE FROM persons AS person
        WHERE NOT EXISTS (
          SELECT 1 FROM tournament_entry_members tem WHERE tem.person_id = person.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM tournament_match_participants tmp
          JOIN tournament_matches tm ON tm.id = tmp.match_id
          JOIN tournament_entry_members tem
            ON tem.tournament_entry_id = tmp.tournament_entry_id
            AND tem.tournament_id = tmp.tournament_id
          WHERE tem.person_id = person.id
            AND (
              tm.status IN ('in_progress', 'completed')
              OR tm.started_at IS NOT NULL
              OR tm.completed_at IS NOT NULL
            )
        )
        RETURNING id
      `,
    );

    await client.query('COMMIT');
    return {
      deletedTournaments: tournaments.rowCount ?? 0,
      deletedTeams: teams.rowCount ?? 0,
      deletedPersons: persons.rowCount ?? 0,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back local database cleanup:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function resetDatabase(pool: Pool = database): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(827364827364)');
    await client.query('TRUNCATE TABLE tournaments, persons, teams RESTART IDENTITY CASCADE');
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back database reset:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}

database.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});
