import { Pool } from 'pg';
import { config } from './config.js';

export const database = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 5_000,
});

const requiredTables = [
  'tournaments',
  'persons',
  'teams',
  'tournament_entries',
  'tournament_entry_members',
];

export async function bootstrapDatabase(): Promise<void> {
  const tableCheck = await database.query(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `,
    [requiredTables],
  );

  const existingTables = new Set(tableCheck.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length === 0) {
    console.log('Database schema is already initialized.');
    return;
  }

  console.log(`Missing database tables: ${missingTables.join(', ')}. Creating them now...`);

  await database.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');

  await database.query(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL CHECK (btrim(name) <> ''),
      tournament_date DATE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

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
  `);

  console.log('Database schema initialization complete.');
}

database.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});