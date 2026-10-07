import express from 'express';
import { config } from './config.js';
import { bootstrapDatabase, database } from './database.js';

const app = express();

async function ensureTournamentEntryIsUnique({ tournamentId, personId, teamId }: { tournamentId: string; personId?: string | null; teamId?: string | null; }): Promise<void> {
  if (personId) {
    const existing = await database.query(
      `
        SELECT te.id
        FROM tournament_entries te
        LEFT JOIN teams t ON t.id = te.team_id
        WHERE te.tournament_id = $1
          AND te.id IS NOT NULL
          AND (
            te.person_id = $2
            OR (te.team_id IS NOT NULL AND (
              t.member_low_person_id = $2
              OR t.member_high_person_id = $2
            ))
          )
      `,
      [tournamentId, personId],
    );

    if (existing.rows.length > 0) {
      throw new Error('Person is already registered in this tournament as an individual or team member');
    }
  }

  if (teamId) {
    const teamInfo = await database.query(
      `
        SELECT member_low_person_id, member_high_person_id
        FROM teams
        WHERE id = $1
      `,
      [teamId],
    );

    if (teamInfo.rows.length === 0) {
      return;
    }

    const memberIds = [teamInfo.rows[0].member_low_person_id, teamInfo.rows[0].member_high_person_id];

    const conflicts = await database.query(
      `
        SELECT te.id
        FROM tournament_entries te
        WHERE te.tournament_id = $1
          AND (
            te.person_id IS NOT NULL AND te.person_id = ANY($2::uuid[])
            OR (
              te.team_id IS NOT NULL
              AND te.team_id <> $3
              AND EXISTS (
                SELECT 1
                FROM teams et
                WHERE et.id = te.team_id
                  AND (
                    et.member_low_person_id = ANY($2::uuid[])
                    OR et.member_high_person_id = ANY($2::uuid[])
                  )
              )
            )
          )
      `,
      [tournamentId, memberIds, teamId],
    );

    if (conflicts.rows.length > 0) {
      throw new Error('One or more team members are already registered in this tournament');
    }
  }
}

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/ready', async (_req, res) => {
  try {
    await database.query('SELECT 1');
    res.status(200).json({
      ok: true,
      status: 'ready',
      checks: { database: 'ok' },
      message: 'Backend and database connectivity OK',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Database readiness check failed:', error);
    res.status(503).json({
      ok: false,
      status: 'not_ready',
      checks: { database: 'error' },
      message: 'Backend is reachable, but the database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'darttournament-backend',
    version: '0.1.1',
    status: 'running',
  });
});

app.get('/api/connectivity', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'backend',
    status: 'ok',
    statusCode: 200,
    message: 'Backend connectivity OK',
    timestamp: new Date().toISOString(),
    backendUrl: `${req.protocol}://${req.get('host')}/api/connectivity`,
  });
});

app.get('/api/tournaments', async (_req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM tournaments ORDER BY created_at DESC',
    );

    res.status(200).json({
      ok: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to load tournaments:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load tournaments',
    });
  }
});

app.get('/api/tournaments/:id', async (req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Tournament not found',
      });
    }

    return res.status(200).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Failed to load tournament:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not load tournament',
    });
  }
});

app.post('/api/tournaments', async (req, res) => {
  try {
    const { name, tournamentDate, description, status } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'Tournament name is required',
      });
    }

    const normalizedStatus = typeof status === 'string' && status.trim() !== '' ? status : 'draft';

    const result = await database.query(
      `
        INSERT INTO tournaments (name, tournament_date, description, status)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [name.trim(), tournamentDate || null, description || null, normalizedStatus],
    );

    return res.status(201).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Failed to create tournament:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not create tournament',
    });
  }
});

app.get('/api/persons', async (_req, res) => {
  try {
    const result = await database.query(
      'SELECT * FROM persons ORDER BY last_name ASC, first_name ASC, created_at DESC',
    );

    res.status(200).json({
      ok: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to load persons:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load persons',
    });
  }
});

app.post('/api/persons', async (req, res) => {
  try {
    const { firstName, lastName, nickname, gender } = req.body ?? {};

    if (typeof firstName !== 'string' || firstName.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'First name is required',
      });
    }

    if (typeof lastName !== 'string' || lastName.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'Last name is required',
      });
    }

    if (gender !== 'm' && gender !== 'w') {
      return res.status(400).json({
        ok: false,
        message: 'Gender must be either m or w',
      });
    }

    const result = await database.query(
      `
        INSERT INTO persons (first_name, last_name, nickname, gender)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [firstName.trim(), lastName.trim(), nickname?.trim() || null, gender],
    );

    return res.status(201).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Failed to create person:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not create person',
    });
  }
});

app.get('/api/teams', async (_req, res) => {
  try {
    const result = await database.query(`
      SELECT
        t.id,
        t.name,
        t.member_low_person_id,
        t.member_high_person_id,
        low_person.first_name AS low_first_name,
        low_person.last_name AS low_last_name,
        high_person.first_name AS high_first_name,
        high_person.last_name AS high_last_name,
        t.created_at,
        t.updated_at
      FROM teams t
      JOIN persons low_person ON low_person.id = t.member_low_person_id
      JOIN persons high_person ON high_person.id = t.member_high_person_id
      ORDER BY t.name ASC
    `);

    res.status(200).json({
      ok: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to load teams:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load teams',
    });
  }
});

app.post('/api/teams', async (req, res) => {
  try {
    const { name, personIds } = req.body ?? {};

    if (!Array.isArray(personIds) || personIds.length !== 2) {
      return res.status(400).json({
        ok: false,
        message: 'Exactly two person IDs are required',
      });
    }

    const normalizedPersonIds = personIds.map((id) => String(id).trim()).filter(Boolean);
    if (normalizedPersonIds.length !== 2) {
      return res.status(400).json({
        ok: false,
        message: 'Exactly two valid person IDs are required',
      });
    }

    if (normalizedPersonIds[0] === normalizedPersonIds[1]) {
      return res.status(400).json({
        ok: false,
        message: 'A team cannot contain the same person twice',
      });
    }

    const personsResult = await database.query(
      'SELECT id, first_name, last_name FROM persons WHERE id = ANY($1::uuid[])',
      [normalizedPersonIds],
    );

    if (personsResult.rows.length !== 2) {
      return res.status(404).json({
        ok: false,
        message: 'One or both persons could not be found',
      });
    }

    const orderedPersonIds = [...normalizedPersonIds].sort();
    const existingTeam = await database.query(
      `
        SELECT *
        FROM teams
        WHERE member_low_person_id = $1
          AND member_high_person_id = $2
      `,
      [orderedPersonIds[0], orderedPersonIds[1]],
    );

    if (existingTeam.rows.length > 0) {
      return res.status(200).json({
        ok: true,
        data: existingTeam.rows[0],
        message: 'Team already exists for this person pair',
      });
    }

    const baseName = typeof name === 'string' && name.trim() !== ''
      ? name.trim()
      : `${personsResult.rows[0].last_name}/${personsResult.rows[1].last_name}`;

    let resolvedName = baseName;
    let suffixIndex = 2;

    while (true) {
      const duplicateName = await database.query(
        'SELECT id FROM teams WHERE lower(btrim(name)) = lower(btrim($1))',
        [resolvedName],
      );

      if (duplicateName.rows.length === 0) {
        break;
      }

      resolvedName = `${baseName} (${suffixIndex})`;
      suffixIndex += 1;
    }

    const createdTeam = await database.query(
      `
        INSERT INTO teams (name, member_low_person_id, member_high_person_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [resolvedName, orderedPersonIds[0], orderedPersonIds[1]],
    );

    return res.status(201).json({
      ok: true,
      data: createdTeam.rows[0],
    });
  } catch (error) {
    console.error('Failed to create team:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not create team',
    });
  }
});

app.get('/api/tournament-entries', async (_req, res) => {
  try {
    const entries = await database.query(`
      SELECT
        te.id,
        te.tournament_id,
        te.person_id,
        te.team_id,
        t.name AS tournament_name,
        p.first_name AS person_first_name,
        p.last_name AS person_last_name,
        team.name AS team_name,
        te.created_at
      FROM tournament_entries te
      LEFT JOIN tournaments t ON t.id = te.tournament_id
      LEFT JOIN persons p ON p.id = te.person_id
      LEFT JOIN teams team ON team.id = te.team_id
      ORDER BY te.created_at DESC
    `);

    res.status(200).json({
      ok: true,
      data: entries.rows,
    });
  } catch (error) {
    console.error('Failed to load tournament entries:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load tournament entries',
    });
  }
});

app.post('/api/tournament-entries', async (req, res) => {
  try {
    const { tournamentId, personId, teamId } = req.body ?? {};

    if (!tournamentId || (typeof personId !== 'string' && typeof teamId !== 'string')) {
      return res.status(400).json({
        ok: false,
        message: 'Tournament ID and either personId or teamId are required',
      });
    }

    if (personId && teamId) {
      return res.status(400).json({
        ok: false,
        message: 'Choose either personId or teamId, not both',
      });
    }

    const tournament = await database.query(
      'SELECT id FROM tournaments WHERE id = $1',
      [tournamentId],
    );

    if (tournament.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Tournament not found',
      });
    }

    if (personId) {
      const person = await database.query(
        'SELECT id FROM persons WHERE id = $1',
        [personId],
      );

      if (person.rows.length === 0) {
        return res.status(404).json({
          ok: false,
          message: 'Person not found',
        });
      }

      const existingEntry = await database.query(
        'SELECT * FROM tournament_entries WHERE tournament_id = $1 AND person_id = $2',
        [tournamentId, personId],
      );

      if (existingEntry.rows.length > 0) {
        return res.status(200).json({
          ok: true,
          data: existingEntry.rows[0],
          message: 'Person is already enrolled in this tournament',
        });
      }

      await ensureTournamentEntryIsUnique({ tournamentId, personId });

      const createdEntry = await database.query(
        `
          INSERT INTO tournament_entries (tournament_id, person_id)
          VALUES ($1, $2)
          RETURNING *
        `,
        [tournamentId, personId],
      );

      return res.status(201).json({
        ok: true,
        data: createdEntry.rows[0],
      });
    }

    const team = await database.query(
      'SELECT id FROM teams WHERE id = $1',
      [teamId],
    );

    if (team.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Team not found',
      });
    }

    const existingEntry = await database.query(
      'SELECT * FROM tournament_entries WHERE tournament_id = $1 AND team_id = $2',
      [tournamentId, teamId],
    );

    if (existingEntry.rows.length > 0) {
      return res.status(200).json({
        ok: true,
        data: existingEntry.rows[0],
        message: 'Team is already enrolled in this tournament',
      });
    }

    await ensureTournamentEntryIsUnique({ tournamentId, teamId });

    const createdEntry = await database.query(
      `
        INSERT INTO tournament_entries (tournament_id, team_id)
        VALUES ($1, $2)
        RETURNING *
      `,
      [tournamentId, teamId],
    );

    return res.status(201).json({
      ok: true,
      data: createdEntry.rows[0],
    });
  } catch (error) {
    console.error('Failed to create tournament entry:', error);

    const message = error instanceof Error ? error.message : 'Could not create tournament entry';

    if (/already|registered|enrolled|conflict/i.test(message)) {
      return res.status(409).json({
        ok: false,
        message,
      });
    }

    return res.status(500).json({
      ok: false,
      message: 'Could not create tournament entry',
    });
  }
});

app.get('/api/tournaments/:tournamentId/entries', async (req, res) => {
  try {
    const tournamentId = req.params.tournamentId;
    const result = await database.query(
      `
        SELECT
          te.id,
          te.tournament_id,
          te.person_id,
          te.team_id,
          p.first_name AS person_first_name,
          p.last_name AS person_last_name,
          team.name AS team_name,
          te.created_at
        FROM tournament_entries te
        LEFT JOIN persons p ON p.id = te.person_id
        LEFT JOIN teams team ON team.id = te.team_id
        WHERE te.tournament_id = $1
        ORDER BY te.created_at DESC
      `,
      [tournamentId],
    );

    res.status(200).json({
      ok: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('Failed to load tournament entries for tournament:', error);
    res.status(500).json({
      ok: false,
      message: 'Could not load tournament entries',
    });
  }
});

app.delete('/api/tournament-entries/:id', async (req, res) => {
  try {
    const result = await database.query(
      'DELETE FROM tournament_entries WHERE id = $1 RETURNING *',
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        message: 'Tournament entry not found',
      });
    }

    return res.status(200).json({
      ok: true,
      data: result.rows[0],
      message: 'Tournament entry removed',
    });
  } catch (error) {
    console.error('Failed to remove tournament entry:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not remove tournament entry',
    });
  }
});

async function startServer(): Promise<void> {
  try {
    await bootstrapDatabase();
    app.listen(config.port, () => {
      console.log(`Backend listening on port ${config.port}`);
    });
  } catch (error) {
    console.error('Backend startup failed during database initialization:', error);
    process.exit(1);
  }
}

startServer();
