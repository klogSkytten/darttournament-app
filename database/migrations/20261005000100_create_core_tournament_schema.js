exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE tournaments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL CHECK (btrim(name) <> ''),
      tournament_date DATE,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE persons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      first_name TEXT NOT NULL CHECK (btrim(first_name) <> ''),
      last_name TEXT NOT NULL CHECK (btrim(last_name) <> ''),
      nickname TEXT,
      gender TEXT NOT NULL CHECK (gender IN ('m', 'w')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL CHECK (btrim(name) <> ''),
      member_low_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      member_high_person_id UUID NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (member_low_person_id < member_high_person_id),
      UNIQUE (member_low_person_id, member_high_person_id)
    );

    CREATE UNIQUE INDEX teams_name_case_insensitive_unique
      ON teams (lower(btrim(name)));

    CREATE TABLE tournament_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      person_id UUID REFERENCES persons(id) ON DELETE RESTRICT,
      team_id UUID REFERENCES teams(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK ((person_id IS NOT NULL) <> (team_id IS NOT NULL)),
      UNIQUE (id, tournament_id)
    );

    CREATE UNIQUE INDEX tournament_entries_person_unique
      ON tournament_entries (tournament_id, person_id)
      WHERE person_id IS NOT NULL;

    CREATE UNIQUE INDEX tournament_entries_team_unique
      ON tournament_entries (tournament_id, team_id)
      WHERE team_id IS NOT NULL;

    CREATE TABLE tournament_entry_members (
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

    CREATE FUNCTION validate_tournament_entry_member()
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

    CREATE TRIGGER tournament_entry_member_must_match_entry
      BEFORE INSERT OR UPDATE ON tournament_entry_members
      FOR EACH ROW
      EXECUTE FUNCTION validate_tournament_entry_member();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE tournament_entry_members;
    DROP FUNCTION validate_tournament_entry_member();
    DROP TABLE tournament_entries;
    DROP TABLE teams;
    DROP TABLE persons;
    DROP TABLE tournaments;
  `);
};
