import express from 'express';
import type { PoolClient } from 'pg';
import { config } from './config.js';
import { bootstrapDatabase, cleanupLocalData, database, resetDatabase } from './database.js';
import { parseGeneralSettings } from './settings.js';

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

type DrawSeed = { type: 'group'; groupIndex: number; place: number }
  | { type: 'additional' | 'lucky'; index: number };
type TournamentDraw = {
  version: 1;
  configuration: {
    groupPhaseEnabled: boolean;
    groupCount: number;
    gamesPerPair: number;
    qualifierCount: number;
    placementPhaseEnabled: boolean;
    placementGames: boolean;
    luckyLosers: boolean;
  };
  groups: string[][] | null;
  directBracketEntries: (string | null)[] | null;
  brackets: {
    endRound: (DrawSeed | null)[] | null;
    luckyLosers: (DrawSeed | null)[] | null;
  };
};
type TournamentMatchRules = {
  setsToWin: number;
  legsToWin: number;
  startingScore: number;
  startRule: 'single_in' | 'double_in' | 'master_in';
  checkoutRule: 'single_out' | 'double_out' | 'master_out';
  bullOutRule: 'no_bullout' | 'classic' | 'pdc';
};
type TournamentStartMatch = {
  number: number;
  roundNumber: number;
  groupIndex: number | null;
  firstEntryId: string;
  secondEntryId: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isTournamentMatchRules(value: unknown): value is TournamentMatchRules {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const rules = value as Record<string, unknown>;
  return Number.isSafeInteger(rules.setsToWin)
    && Number(rules.setsToWin) >= 1
    && Number(rules.setsToWin) <= 4
    && Number.isSafeInteger(rules.legsToWin)
    && Number(rules.legsToWin) >= 2
    && Number(rules.legsToWin) <= 6
    && [301, 501, 701, 901].includes(Number(rules.startingScore))
    && ['single_in', 'double_in', 'master_in'].includes(String(rules.startRule))
    && ['single_out', 'double_out', 'master_out'].includes(String(rules.checkoutRule))
    && ['no_bullout', 'classic', 'pdc'].includes(String(rules.bullOutRule));
}

function isTournamentStartMatch(value: unknown): value is TournamentStartMatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const match = value as Record<string, unknown>;
  return Number.isSafeInteger(match.number)
    && Number(match.number) > 0
    && Number.isSafeInteger(match.roundNumber)
    && Number(match.roundNumber) > 0
    && (match.groupIndex === null
      || (Number.isSafeInteger(match.groupIndex) && Number(match.groupIndex) >= 0))
    && typeof match.firstEntryId === 'string'
    && uuidPattern.test(match.firstEntryId)
    && typeof match.secondEntryId === 'string'
    && uuidPattern.test(match.secondEntryId)
    && match.firstEntryId !== match.secondEntryId;
}

function drawGroupLabel(index: number): string {
  let value = index + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = `${String.fromCharCode(65 + (value % 26))}${label}`;
    value = Math.floor(value / 26);
  }
  return label;
}

function nextDrawBracketSize(entryCount: number): number {
  let size = 1;
  while (size < entryCount) size *= 2;
  return size;
}

function isDrawSeed(
  value: unknown,
  groupSizes: number[],
  allowedKinds: string[],
  maxPlaceholderIndex: number,
): value is DrawSeed {
  if (!value || typeof value !== 'object') return false;
  const seed = value as Record<string, unknown>;
  if (seed.type === 'group') {
    return Number.isSafeInteger(seed.groupIndex)
      && Number(seed.groupIndex) >= 0
      && Number(seed.groupIndex) < groupSizes.length
      && Number.isSafeInteger(seed.place)
      && Number(seed.place) > 0
      && Number(seed.place) <= groupSizes[Number(seed.groupIndex)];
  }
  return (seed.type === 'additional' || seed.type === 'lucky')
    && allowedKinds.includes(seed.type)
    && Number.isSafeInteger(seed.index)
    && Number(seed.index) > 0
    && Number(seed.index) <= maxPlaceholderIndex;
}

function validDrawSlots(
  slots: unknown,
  entryCount: number,
  groupSizes: number[],
  allowedKinds: string[],
  maxPlaceholderIndex: number,
): slots is (DrawSeed | null)[] {
  if (!Array.isArray(slots) || slots.length !== nextDrawBracketSize(entryCount)) return false;
  const seeds = slots.filter((seed) => seed !== null);
  if (seeds.length !== entryCount
    || !seeds.every((seed) => isDrawSeed(seed, groupSizes, allowedKinds, maxPlaceholderIndex))) {
    return false;
  }
  const keys = seeds.map((seed) => JSON.stringify(seed));
  return new Set(keys).size === keys.length;
}

function isTournamentDraw(value: unknown, tournamentEntryIds: string[]): value is TournamentDraw {
  if (!value || typeof value !== 'object' || tournamentEntryIds.length < 2) return false;
  const draw = value as Record<string, unknown>;
  const configuration = draw.configuration as Record<string, unknown> | null;
  const brackets = draw.brackets as Record<string, unknown> | null;
  if (draw.version !== 1 || !configuration || !brackets || Array.isArray(brackets)) return false;
  const {
    groupPhaseEnabled,
    groupCount,
    gamesPerPair,
    qualifierCount,
    placementPhaseEnabled,
    placementGames,
    luckyLosers,
  } = configuration;
  if (
    typeof groupPhaseEnabled !== 'boolean'
    || !Number.isSafeInteger(groupCount)
    || Number(groupCount) < 1
    || Number(groupCount) > Math.max(1, Math.floor(tournamentEntryIds.length / 4))
    || !Number.isSafeInteger(gamesPerPair)
    || Number(gamesPerPair) < 1
    || !Number.isSafeInteger(qualifierCount)
    || Number(qualifierCount) < 4
    || (Number(qualifierCount) & (Number(qualifierCount) - 1)) !== 0
    || typeof placementPhaseEnabled !== 'boolean'
    || typeof placementGames !== 'boolean'
    || typeof luckyLosers !== 'boolean'
  ) return false;

  const entries = new Set(tournamentEntryIds);
  if (groupPhaseEnabled) {
    if (!Array.isArray(draw.groups) || draw.groups.length !== groupCount || draw.directBracketEntries !== null) return false;
    const groups = draw.groups as unknown[];
    const groupSizes: number[] = [];
    const assigned = groups.flatMap((group) => {
      if (!Array.isArray(group)) return [];
      groupSizes.push(group.length);
      return group;
    });
    if (
      groupSizes.length !== groupCount
      || assigned.some((id) => typeof id !== 'string' || !uuidPattern.test(id))
      || assigned.length !== entries.size
      || new Set(assigned).size !== entries.size
      || assigned.some((id) => !entries.has(id as string))
    ) return false;

    const finalCount = Math.min(tournamentEntryIds.length, Number(qualifierCount));
    const luckyCount = tournamentEntryIds.length - finalCount;
    const perGroup = Math.min(
      Math.floor(finalCount / groupCount),
      ...groupSizes,
    );
    const additionalCount = finalCount - perGroup * Number(groupCount);
    const endRoundSlots = brackets.endRound;
    const luckySlots = brackets.luckyLosers;
    if (placementPhaseEnabled) {
      if (!validDrawSlots(endRoundSlots, finalCount, groupSizes, ['additional'], additionalCount)) return false;
    } else if (endRoundSlots !== null) return false;
    if (luckyLosers && luckyCount > 1) {
      if (!validDrawSlots(luckySlots, luckyCount, groupSizes, ['lucky'], luckyCount)) return false;
    } else if (luckySlots !== null) return false;
    return true;
  }

  if (draw.groups !== null || !Array.isArray(draw.directBracketEntries)) return false;
  if (brackets.endRound !== null || brackets.luckyLosers !== null) return false;
  const directEntries = draw.directBracketEntries as unknown[];
  return directEntries.length === nextDrawBracketSize(tournamentEntryIds.length)
    && directEntries.filter((id) => id !== null).length === entries.size
    && directEntries.every((id) => id === null || (typeof id === 'string' && uuidPattern.test(id) && entries.has(id)))
    && new Set(directEntries.filter((id) => id !== null)).size === entries.size;
}

app.use(express.json());

app.get('/api/settings', async (_req, res) => {
  try {
    const result = await database.query('SELECT settings FROM general_settings WHERE id = 1');
    if (result.rows.length === 0) {
      throw new Error('General settings have not been initialized');
    }

    return res.status(200).json({ ok: true, data: result.rows[0].settings });
  } catch (error) {
    console.error('Failed to load general settings:', error);
    return res.status(500).json({ ok: false, message: 'Could not load general settings' });
  }
});

app.put('/api/settings', async (req, res) => {
  const settings = parseGeneralSettings(req.body);
  if (!settings) {
    return res.status(400).json({ ok: false, message: 'General settings are invalid' });
  }

  try {
    const result = await database.query(
      `
        INSERT INTO general_settings (id, settings, updated_at)
        VALUES (1, $1::jsonb, now())
        ON CONFLICT (id) DO UPDATE
        SET settings = EXCLUDED.settings, updated_at = now()
        RETURNING settings
      `,
      [JSON.stringify(settings)],
    );

    return res.status(200).json({ ok: true, data: result.rows[0].settings });
  } catch (error) {
    console.error('Failed to save general settings:', error);
    return res.status(500).json({ ok: false, message: 'Could not save general settings' });
  }
});

app.post('/api/database/cleanup', async (req, res) => {
  if (req.body?.confirmed !== true) {
    return res.status(400).json({
      ok: false,
      message: 'Explicit confirmation is required before cleaning the database',
    });
  }

  try {
    const deleted = await cleanupLocalData();
    return res.status(200).json({ ok: true, data: deleted });
  } catch (error) {
    console.error('Failed to clean local database:', error);
    return res.status(500).json({ ok: false, message: 'Could not clean local database' });
  }
});

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

app.get('/api/test-tools', (_req, res) => {
  res.json({ databaseResetEnabled: config.enableTestDatabaseReset });
});

app.post('/api/test/reset-database', async (_req, res) => {
  if (!config.enableTestDatabaseReset) {
    return res.sendStatus(404);
  }

  try {
    await resetDatabase();
    return res.status(200).json({ ok: true, message: 'Test database cleared' });
  } catch (error) {
    console.error('Failed to reset test database:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not reset test database',
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
      `
        SELECT
          t.*,
          to_char(t.tournament_date, 'YYYY-MM-DD') AS tournament_date,
          CASE
            WHEN winner_entry.team_id IS NOT NULL THEN winner_team.name
            WHEN winner_entry.person_id IS NOT NULL
              THEN concat_ws(' ', winner_person.first_name, winner_person.last_name)
            ELSE NULL
          END AS winner_name
        FROM tournaments t
        LEFT JOIN tournament_entries winner_entry
          ON winner_entry.id = t.winner_tournament_entry_id
        LEFT JOIN teams winner_team ON winner_team.id = winner_entry.team_id
        LEFT JOIN persons winner_person ON winner_person.id = winner_entry.person_id
        ORDER BY t.created_at DESC
      `,
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
      `
        SELECT *, to_char(tournament_date, 'YYYY-MM-DD') AS tournament_date
        FROM tournaments
        WHERE id = $1
      `,
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

app.get('/api/tournaments/:id/draw', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ ok: false, message: 'Tournament ID is invalid' });
  }
  try {
    const result = await database.query(
      'SELECT draw FROM tournaments WHERE id = $1',
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    return res.status(200).json({ ok: true, data: result.rows[0].draw });
  } catch (error) {
    console.error('Failed to load tournament draw:', error);
    return res.status(500).json({ ok: false, message: 'Could not load tournament draw' });
  }
});

app.put('/api/tournaments/:id/draw', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ ok: false, message: 'Tournament ID is invalid' });
  }

  let client: PoolClient;
  try {
    client = await database.connect();
  } catch (error) {
    console.error('Failed to connect while saving tournament draw:', error);
    return res.status(500).json({ ok: false, message: 'Could not save tournament draw' });
  }

  try {
    await client.query('BEGIN');
    const tournament = await client.query(
      'SELECT id, status FROM tournaments WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (tournament.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    if (['running', 'finished'].includes(tournament.rows[0].status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'The draw cannot be changed after the tournament starts' });
    }
    const entries = await client.query(
      'SELECT id FROM tournament_entries WHERE tournament_id = $1',
      [req.params.id],
    );
    const entryIds = entries.rows.map((entry) => entry.id as string);
    if (!isTournamentDraw(req.body, entryIds)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Tournament draw is invalid for its participants' });
    }
    await client.query(
      'UPDATE tournaments SET draw = $1::jsonb, updated_at = now() WHERE id = $2',
      [JSON.stringify(req.body), req.params.id],
    );
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, data: req.body });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back tournament draw save:', rollbackError);
    }
    console.error('Failed to save tournament draw:', error);
    return res.status(500).json({ ok: false, message: 'Could not save tournament draw' });
  } finally {
    client.release();
  }
});

app.delete('/api/tournaments/:id/draw', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ ok: false, message: 'Tournament ID is invalid' });
  }
  try {
    const result = await database.query(
      "UPDATE tournaments SET draw = NULL, updated_at = now() WHERE id = $1 AND status NOT IN ('running', 'finished') RETURNING id",
      [req.params.id],
    );
    if (result.rows.length === 0) {
      const tournament = await database.query(
        'SELECT status FROM tournaments WHERE id = $1',
        [req.params.id],
      );
      if (tournament.rows.length > 0) {
        return res.status(409).json({ ok: false, message: 'The draw cannot be changed after the tournament starts' });
      }
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    return res.status(200).json({ ok: true, data: null });
  } catch (error) {
    console.error('Failed to reset tournament draw:', error);
    return res.status(500).json({ ok: false, message: 'Could not reset tournament draw' });
  }
});

app.post('/api/tournaments/:id/start', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ ok: false, message: 'Tournament ID is invalid' });
  }
  if (!Array.isArray(req.body?.matches)
    || !req.body.matches.every(isTournamentStartMatch)
    || !isTournamentMatchRules(req.body?.rules)
    || typeof req.body?.ruleKey !== 'string'
    || !Array.isArray(req.body?.groupRanking)
    || !req.body.groupRanking.every((criterion: unknown) => typeof criterion === 'string')) {
    return res.status(400).json({ ok: false, message: 'Tournament start configuration is invalid' });
  }

  let client: PoolClient;
  try {
    client = await database.connect();
  } catch (error) {
    console.error('Failed to connect while starting tournament:', error);
    return res.status(500).json({ ok: false, message: 'Could not start tournament' });
  }

  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query(
      'SELECT id, status, draw FROM tournaments WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (tournamentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    const tournament = tournamentResult.rows[0];
    if (!['draft', 'open'].includes(tournament.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Tournament has already started' });
    }

    const entryResult = await client.query(
      'SELECT id FROM tournament_entries WHERE tournament_id = $1 ORDER BY created_at, id',
      [req.params.id],
    );
    const entryIds = entryResult.rows.map((entry) => entry.id as string);
    const draw = tournament.draw as TournamentDraw | null;
    if (!draw || !isTournamentDraw(draw, entryIds)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'A valid saved draw is required to start the tournament' });
    }

    const groupPhaseEnabled = draw.configuration.groupPhaseEnabled;
    const matchPayload = req.body.matches as TournamentStartMatch[];
    const expectedPairs = new Map<string, number>();
    const pairKey = (first: string, second: string, groupIndex: number | null) =>
      `${groupIndex === null ? '' : `${groupIndex}:`}${[first, second].sort().join(':')}`;
    if (groupPhaseEnabled) {
      draw.groups?.forEach((group, groupIndex) => {
        for (let firstIndex = 0; firstIndex < group.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < group.length; secondIndex += 1) {
            expectedPairs.set(
              pairKey(group[firstIndex], group[secondIndex], groupIndex),
              draw.configuration.gamesPerPair,
            );
          }
        }
      });
    } else {
      draw.directBracketEntries?.forEach((entryId, index, slots) => {
        if (index % 2 === 0 && entryId && slots[index + 1]) {
          expectedPairs.set(pairKey(entryId, slots[index + 1] as string, null), 1);
        }
      });
    }

    const actualPairs = new Map<string, number>();
    const matchNumbers = new Set<number>();
    const groups = groupPhaseEnabled ? draw.groups || [] : [];
    let validSchedule = matchPayload.length > 0;
    matchPayload.forEach((match) => {
      if (matchNumbers.has(match.number)
        || (groupPhaseEnabled && (!Number.isSafeInteger(match.groupIndex)
          || match.groupIndex === null
          || match.groupIndex >= groups.length
          || !groups[match.groupIndex].includes(match.firstEntryId)
          || !groups[match.groupIndex].includes(match.secondEntryId)))
        || (!groupPhaseEnabled && match.groupIndex !== null)) {
        validSchedule = false;
        return;
      }
      matchNumbers.add(match.number);
      const key = pairKey(match.firstEntryId, match.secondEntryId, match.groupIndex);
      actualPairs.set(key, (actualPairs.get(key) || 0) + 1);
    });
    if (actualPairs.size !== expectedPairs.size
      || [...expectedPairs].some(([key, count]) => actualPairs.get(key) !== count)
      || !validSchedule) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'The active-phase match schedule does not match the saved draw' });
    }

    const ruleKey = groupPhaseEnabled ? 'group' : req.body.ruleKey as string;
    if (groupPhaseEnabled && req.body.ruleKey !== 'group') {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'The group phase rule key is invalid' });
    }
    if (!groupPhaseEnabled && !/^round-[1-7]$/.test(ruleKey)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'The knockout phase rule key is invalid' });
    }
    const allowedRankingCriteria = ['Platzierung', 'Siege', 'Leg-Differenz', '3-Dart-Average'];
    const groupRanking = req.body.groupRanking as unknown[];
    if (groupPhaseEnabled
      && (groupRanking.some((criterion) => !allowedRankingCriteria.includes(String(criterion)))
        || new Set(groupRanking).size !== groupRanking.length)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Group ranking criteria are invalid' });
    }

    const phaseName = groupPhaseEnabled ? 'Gruppenphase' : 'Endrunde';
    const phaseType = groupPhaseEnabled ? 'group' : 'knockout';
    const settings = { ruleKey, groupRanking: groupPhaseEnabled ? groupRanking : [] };
    const phaseResult = await client.query(
      `
        INSERT INTO tournament_phases
          (tournament_id, phase_type, name, phase_order, status, started_at, settings)
        VALUES ($1, $2, $3, 1, 'in_progress', now(), $4::jsonb)
        RETURNING id, phase_type, name, phase_order, round_number, status, settings, started_at
      `,
      [req.params.id, phaseType, phaseName, JSON.stringify(settings)],
    );
    const phase = phaseResult.rows[0];
    const phaseGroupIds = new Map<number, string>();
    if (groupPhaseEnabled) {
      for (const [groupIndex, group] of groups.entries()) {
        const groupResult = await client.query(
          `
            INSERT INTO tournament_phase_groups (tournament_id, phase_id, name, group_order)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `,
          [req.params.id, phase.id, `Gruppe ${drawGroupLabel(groupIndex)}`, groupIndex + 1],
        );
        const groupId = groupResult.rows[0].id as string;
        phaseGroupIds.set(groupIndex, groupId);
        for (const [seedIndex, entryId] of group.entries()) {
          await client.query(
            `
              INSERT INTO tournament_phase_entries
                (tournament_id, phase_id, tournament_entry_id, group_id, seed)
              VALUES ($1, $2, $3, $4, $5)
            `,
            [req.params.id, phase.id, entryId, groupId, seedIndex + 1],
          );
        }
      }
    } else {
      for (const [seedIndex, entryId] of (draw.directBracketEntries || []).entries()) {
        if (entryId) {
          await client.query(
            `
              INSERT INTO tournament_phase_entries
                (tournament_id, phase_id, tournament_entry_id, seed)
              VALUES ($1, $2, $3, $4)
            `,
            [req.params.id, phase.id, entryId, seedIndex + 1],
          );
        }
      }
    }

    const rules = req.body.rules as TournamentMatchRules;
    await client.query(
      `
        INSERT INTO tournament_phase_rules
          (phase_id, sets_to_win, legs_to_win, starting_score, start_rule, checkout_rule, bull_out_rule)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        phase.id,
        rules.setsToWin,
        rules.legsToWin,
        rules.startingScore,
        rules.startRule,
        rules.checkoutRule,
        rules.bullOutRule,
      ],
    );

    for (const match of matchPayload) {
      const matchResult = await client.query(
        `
          INSERT INTO tournament_matches
            (tournament_id, phase_id, group_id, round_number, match_number)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id
        `,
        [
          req.params.id,
          phase.id,
          match.groupIndex === null ? null : phaseGroupIds.get(match.groupIndex),
          match.roundNumber,
          match.number,
        ],
      );
      const matchId = matchResult.rows[0].id as string;
      for (const [slotIndex, tournamentEntryId] of [
        match.firstEntryId,
        match.secondEntryId,
      ].entries()) {
        await client.query(
          `
            INSERT INTO tournament_match_participants
              (tournament_id, phase_id, match_id, tournament_entry_id, slot)
            VALUES ($1, $2, $3, $4, $5)
          `,
          [req.params.id, phase.id, matchId, tournamentEntryId, slotIndex + 1],
        );
      }
    }

    await client.query(
      "UPDATE tournaments SET status = 'running', updated_at = now() WHERE id = $1",
      [req.params.id],
    );
    await client.query('COMMIT');
    return res.status(200).json({
      ok: true,
      data: { status: 'running', activePhase: phase },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back tournament start:', rollbackError);
    }
    console.error('Failed to start tournament:', error);
    return res.status(500).json({ ok: false, message: 'Could not start tournament' });
  } finally {
    client.release();
  }
});

app.get('/api/tournaments/:id/matches', async (req, res) => {
  if (!uuidPattern.test(req.params.id)) {
    return res.status(400).json({ ok: false, message: 'Tournament ID is invalid' });
  }
  try {
    const phaseResult = await database.query(
      `
        SELECT
          tp.id, tp.phase_type, tp.name, tp.phase_order, tp.round_number, tp.status,
          tp.settings, tpr.sets_to_win, tpr.legs_to_win, tpr.starting_score,
          tpr.start_rule, tpr.checkout_rule, tpr.bull_out_rule
        FROM tournament_phases tp
        LEFT JOIN tournament_phase_rules tpr ON tpr.phase_id = tp.id
        WHERE tp.tournament_id = $1
        ORDER BY tp.phase_order
      `,
      [req.params.id],
    );
    const matchResult = await database.query(
      `
        SELECT
          tm.id, tm.match_number, tm.round_number, tm.status AS match_status,
          tp.phase_type, tp.name AS phase_name, tp.status AS phase_status,
          tpr.sets_to_win, tpr.legs_to_win, tpr.starting_score,
          tpr.start_rule, tpr.checkout_rule, tpr.bull_out_rule,
          tmp.slot, tmp.tournament_entry_id,
          COALESCE(team.name, concat_ws(' ', person.first_name, person.last_name)) AS participant_name,
          COALESCE(ter.sets_won, 0) AS sets_won,
          COALESCE(ter.legs_won, 0) AS legs_won,
          tmr.tournament_entry_id AS winner_entry_id
        FROM tournament_matches tm
        JOIN tournament_phases tp ON tp.id = tm.phase_id
        LEFT JOIN tournament_phase_rules tpr ON tpr.phase_id = tp.id
        LEFT JOIN tournament_match_participants tmp ON tmp.match_id = tm.id
        LEFT JOIN tournament_entries te ON te.id = tmp.tournament_entry_id
        LEFT JOIN persons person ON person.id = te.person_id
        LEFT JOIN teams team ON team.id = te.team_id
        LEFT JOIN tournament_match_entry_results ter
          ON ter.match_id = tm.id AND ter.tournament_entry_id = tmp.tournament_entry_id
        LEFT JOIN tournament_match_results tmr ON tmr.match_id = tm.id
        WHERE tm.tournament_id = $1
        ORDER BY tm.match_number, tmp.slot
      `,
      [req.params.id],
    );

    const matchesById = new Map<string, Record<string, unknown> & { participants: unknown[] }>();
    for (const row of matchResult.rows) {
      let match = matchesById.get(row.id as string);
      if (!match) {
        match = {
          id: row.id,
          matchNumber: row.match_number,
          roundNumber: row.round_number,
          status: row.match_status,
          phaseType: row.phase_type,
          phaseName: row.phase_name,
          phaseStatus: row.phase_status,
          rules: row.sets_to_win === null ? null : {
            setsToWin: row.sets_to_win,
            legsToWin: row.legs_to_win,
            startingScore: row.starting_score,
            startRule: row.start_rule,
            checkoutRule: row.checkout_rule,
            bullOutRule: row.bull_out_rule,
          },
          winnerEntryId: row.winner_entry_id,
          participants: [],
        };
        matchesById.set(row.id as string, match);
      }
      if (row.tournament_entry_id) {
        match.participants.push({
          slot: row.slot,
          tournamentEntryId: row.tournament_entry_id,
          name: row.participant_name,
          setsWon: row.sets_won,
          legsWon: row.legs_won,
        });
      }
    }
    return res.status(200).json({
      ok: true,
      data: {
        phases: phaseResult.rows,
        activePhase: phaseResult.rows.find((phase) => phase.status === 'in_progress') || null,
        matches: [...matchesById.values()],
      },
    });
  } catch (error) {
    console.error('Failed to load tournament matches:', error);
    return res.status(500).json({ ok: false, message: 'Could not load tournament matches' });
  }
});

app.put('/api/tournaments/:id/matches/:matchId/result', async (req, res) => {
  if (!uuidPattern.test(req.params.id) || !uuidPattern.test(req.params.matchId)) {
    return res.status(400).json({ ok: false, message: 'Tournament or match ID is invalid' });
  }
  const results = req.body?.results;
  if (!Array.isArray(results) || results.length !== 2
    || !results.every((result: unknown) => {
      if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
      const score = result as Record<string, unknown>;
      return typeof score.tournamentEntryId === 'string'
        && uuidPattern.test(score.tournamentEntryId)
        && Number.isSafeInteger(score.setsWon)
        && Number(score.setsWon) >= 0
        && Number.isSafeInteger(score.legsWon)
        && Number(score.legsWon) >= 0;
    })
    || new Set(results.map((result: { tournamentEntryId: string }) => result.tournamentEntryId)).size !== 2) {
    return res.status(400).json({ ok: false, message: 'Match result is invalid' });
  }

  let client: PoolClient;
  try {
    client = await database.connect();
  } catch (error) {
    console.error('Failed to connect while saving match result:', error);
    return res.status(500).json({ ok: false, message: 'Could not save match result' });
  }
  try {
    await client.query('BEGIN');
    const tournamentResult = await client.query(
      'SELECT status FROM tournaments WHERE id = $1 FOR UPDATE',
      [req.params.id],
    );
    if (tournamentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    if (tournamentResult.rows[0].status !== 'running') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Tournament is not running' });
    }

    const matchResult = await client.query(
      `
        SELECT
          tm.status AS match_status, tp.status AS phase_status,
          tpr.sets_to_win, tpr.legs_to_win
        FROM tournament_matches tm
        JOIN tournament_phases tp ON tp.id = tm.phase_id
        JOIN tournament_phase_rules tpr ON tpr.phase_id = tp.id
        WHERE tm.id = $1 AND tm.tournament_id = $2
        FOR UPDATE OF tm, tp
      `,
      [req.params.matchId, req.params.id],
    );
    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Match not found' });
    }
    const match = matchResult.rows[0];
    if (match.phase_status !== 'in_progress'
      || !['scheduled', 'completed'].includes(match.match_status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Match is not editable in the active phase' });
    }

    const participantResult = await client.query(
      `
        SELECT tournament_entry_id
        FROM tournament_match_participants
        WHERE match_id = $1
        ORDER BY slot
      `,
      [req.params.matchId],
    );
    const participantIds = participantResult.rows.map((participant) => participant.tournament_entry_id as string);
    if (participantIds.length !== 2
      || participantIds.some((entryId) => !results.some(
        (result: { tournamentEntryId: string }) => result.tournamentEntryId === entryId
      ))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Result entries do not match the match participants' });
    }

    const scoreByEntry = new Map(
      (results as Array<{ tournamentEntryId: string; setsWon: number; legsWon: number }>)
        .map((result) => [result.tournamentEntryId, result]),
    );
    const firstScore = scoreByEntry.get(participantIds[0]);
    const secondScore = scoreByEntry.get(participantIds[1]);
    if (!firstScore || !secondScore) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Result entries do not match the match participants' });
    }
    let winnerEntryId: string | null = null;
    if (Number(match.sets_to_win) === 1) {
      if (firstScore.setsWon === 1 && secondScore.setsWon === 0
        && firstScore.legsWon >= Number(match.legs_to_win)
        && firstScore.legsWon > secondScore.legsWon
        && secondScore.legsWon < Number(match.legs_to_win)) {
        winnerEntryId = participantIds[0];
      } else if (secondScore.setsWon === 1 && firstScore.setsWon === 0
        && secondScore.legsWon >= Number(match.legs_to_win)
        && secondScore.legsWon > firstScore.legsWon
        && firstScore.legsWon < Number(match.legs_to_win)) {
        winnerEntryId = participantIds[1];
      }
    } else if (firstScore.setsWon === Number(match.sets_to_win)
      && secondScore.setsWon < Number(match.sets_to_win)) {
      winnerEntryId = participantIds[0];
    } else if (secondScore.setsWon === Number(match.sets_to_win)
      && firstScore.setsWon < Number(match.sets_to_win)) {
      winnerEntryId = participantIds[1];
    }
    if (!winnerEntryId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'Match result does not satisfy the phase rules' });
    }

    await client.query(
      `
        INSERT INTO tournament_match_results (match_id, tournament_entry_id)
        VALUES ($1, $2)
        ON CONFLICT (match_id) DO UPDATE
        SET tournament_entry_id = EXCLUDED.tournament_entry_id, recorded_at = now()
      `,
      [req.params.matchId, winnerEntryId],
    );
    for (const result of results as Array<{ tournamentEntryId: string; setsWon: number; legsWon: number }>) {
      await client.query(
        `
          INSERT INTO tournament_match_entry_results
            (match_id, tournament_entry_id, sets_won, legs_won)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (match_id, tournament_entry_id) DO UPDATE
          SET sets_won = EXCLUDED.sets_won, legs_won = EXCLUDED.legs_won
        `,
        [req.params.matchId, result.tournamentEntryId, result.setsWon, result.legsWon],
      );
    }
    await client.query(
      "UPDATE tournament_matches SET status = 'completed', started_at = COALESCE(started_at, now()), completed_at = now(), updated_at = now() WHERE id = $1",
      [req.params.matchId],
    );
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, data: { winnerEntryId } });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back match result:', rollbackError);
    }
    console.error('Failed to save match result:', error);
    return res.status(500).json({ ok: false, message: 'Could not save match result' });
  } finally {
    client.release();
  }
});

app.patch('/api/tournaments/:id/participation-fee', async (req, res) => {
  const { enabled } = req.body ?? {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ ok: false, message: 'Participation fee enabled must be a boolean' });
  }

  try {
    const result = await database.query(
      `
        UPDATE tournaments
        SET participation_fee_enabled = $1, updated_at = now()
        WHERE id = $2
        RETURNING participation_fee_enabled
      `,
      [enabled, req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }
    return res.status(200).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    console.error('Failed to update participation fee setting:', error);
    return res.status(500).json({ ok: false, message: 'Could not update participation fee setting' });
  }
});

app.patch('/api/tournaments/:tournamentId/participants/:personId/fee', async (req, res) => {
  const { paid } = req.body ?? {};
  if (typeof paid !== 'boolean') {
    return res.status(400).json({ ok: false, message: 'Participation fee paid must be a boolean' });
  }

  let client: PoolClient;
  try {
    client = await database.connect();
  } catch (error) {
    console.error('Failed to connect while updating participation fee payment:', error);
    return res.status(500).json({ ok: false, message: 'Could not update participation fee payment' });
  }

  try {
    await client.query('BEGIN');
    const tournament = await client.query(
      'SELECT id FROM tournaments WHERE id = $1 FOR UPDATE',
      [req.params.tournamentId],
    );
    if (tournament.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }

    const result = await client.query(
      `
        UPDATE tournament_entry_members
        SET participation_fee_paid = $1
        WHERE tournament_id = $2 AND person_id = $3
        RETURNING tournament_id, person_id, participation_fee_paid
      `,
      [paid, req.params.tournamentId, req.params.personId],
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament participant not found' });
    }
    await client.query('COMMIT');
    return res.status(200).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back participation fee update:', rollbackError);
    }
    console.error('Failed to update participation fee payment:', error);
    return res.status(500).json({ ok: false, message: 'Could not update participation fee payment' });
  } finally {
    client.release();
  }
});

app.post('/api/tournaments', async (req, res) => {
  try {
    const { name, tournamentDate, status } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'Tournament name is required',
      });
    }

    const normalizedStatus = typeof status === 'string' && status.trim() !== '' ? status : 'draft';

    const result = await database.query(
      `
        INSERT INTO tournaments (name, tournament_date, status)
        VALUES ($1, $2, $3)
        RETURNING *, to_char(tournament_date, 'YYYY-MM-DD') AS tournament_date
      `,
      [name.trim(), tournamentDate || null, normalizedStatus],
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

app.put('/api/tournaments/:id', async (req, res) => {
  try {
    const { name, tournamentDate } = req.body ?? {};

    if (typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        ok: false,
        message: 'Tournament name is required',
      });
    }

    const result = await database.query(
      `
        UPDATE tournaments
        SET name = $1,
            tournament_date = $2,
            updated_at = now()
          WHERE id = $3 AND status IN ('draft', 'open')
        RETURNING *, to_char(tournament_date, 'YYYY-MM-DD') AS tournament_date
      `,
      [name.trim(), tournamentDate || null, req.params.id],
    );

    if (result.rows.length === 0) {
      const existingTournament = await database.query(
        'SELECT status FROM tournaments WHERE id = $1',
        [req.params.id],
      );
      if (existingTournament.rows.length > 0) {
        return res.status(409).json({ ok: false, message: 'Tournament details cannot be changed after the tournament starts' });
      }
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
    console.error('Failed to update tournament:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not update tournament',
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

app.put('/api/persons/:id', async (req, res) => {
  const { firstName, lastName, nickname, gender } = req.body ?? {};

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)
    || typeof firstName !== 'string' || firstName.trim() === ''
    || typeof lastName !== 'string' || lastName.trim() === ''
    || (nickname !== undefined && typeof nickname !== 'string')
    || (gender !== 'm' && gender !== 'w')) {
    return res.status(400).json({
      ok: false,
      message: 'First name, last name, and a valid gender are required',
    });
  }

  try {
    const result = await database.query(
      `
        UPDATE persons
        SET first_name = $1, last_name = $2, nickname = $3, gender = $4, updated_at = now()
        WHERE id = $5
        RETURNING *
      `,
      [firstName.trim(), lastName.trim(), nickname?.trim() || null, gender, req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, message: 'Person not found' });
    }

    return res.status(200).json({ ok: true, data: result.rows[0] });
  } catch (error) {
    console.error('Failed to update person:', error);
    return res.status(500).json({ ok: false, message: 'Could not update person' });
  }
});

app.post('/api/tournament-participants', async (req, res) => {
  const { tournamentId, personId, newPerson, teamPartnerId, teamName } = req.body ?? {};
  const isNewPerson = newPerson !== undefined;

  if (typeof tournamentId !== 'string' || tournamentId.trim() === ''
    || (personId !== undefined && typeof personId !== 'string')
    || (isNewPerson === Boolean(personId))) {
    return res.status(400).json({
      ok: false,
      message: 'Tournament ID and exactly one existing or new person are required',
    });
  }

  if (teamPartnerId !== undefined && typeof teamPartnerId !== 'string') {
    return res.status(400).json({
      ok: false,
      message: 'Team partner ID must be a string',
    });
  }

  if (teamPartnerId && teamName !== undefined && (typeof teamName !== 'string' || teamName.trim() === '')) {
    return res.status(400).json({
      ok: false,
      message: 'A team name must not be empty',
    });
  }

  if (isNewPerson && (
    !newPerson || typeof newPerson !== 'object'
    || typeof newPerson.firstName !== 'string' || newPerson.firstName.trim() === ''
    || typeof newPerson.lastName !== 'string' || newPerson.lastName.trim() === ''
    || (newPerson.gender !== 'm' && newPerson.gender !== 'w')
  )) {
    return res.status(400).json({
      ok: false,
      message: 'A new person requires first name, last name, and a valid gender',
    });
  }

  let client: PoolClient;
  try {
    client = await database.connect();
  } catch (error) {
    console.error('Failed to connect while registering tournament participant:', error);
    return res.status(500).json({
      ok: false,
      message: 'Could not register tournament participant',
    });
  }

  try {
    await client.query('BEGIN');
    const tournament = await client.query(
      'SELECT id FROM tournaments WHERE id = $1 FOR UPDATE',
      [tournamentId],
    );
    if (tournament.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Tournament not found' });
    }

    let participantId = personId;
    if (isNewPerson) {
      const createdPerson = await client.query(
        `
          INSERT INTO persons (first_name, last_name, nickname, gender)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [
          newPerson.firstName.trim(),
          newPerson.lastName.trim(),
          typeof newPerson.nickname === 'string' ? newPerson.nickname.trim() || null : null,
          newPerson.gender,
        ],
      );
      participantId = createdPerson.rows[0].id;
    } else {
      const person = await client.query('SELECT id FROM persons WHERE id = $1', [personId]);
      if (person.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Person not found' });
      }
    }

    if (teamPartnerId) {
      if (teamPartnerId === participantId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ ok: false, message: 'A team cannot contain the same person twice' });
      }

      const partner = await client.query('SELECT id FROM persons WHERE id = $1', [teamPartnerId]);
      if (partner.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, message: 'Team partner not found' });
      }

      const memberIds = [participantId, teamPartnerId].sort();
      const matchingTeam = await client.query(
        `
          SELECT id, name
          FROM teams
          WHERE member_low_person_id = $1 AND member_high_person_id = $2
          FOR UPDATE
        `,
        memberIds,
      );

      let team = matchingTeam.rows[0];
      if (!team) {
        if (typeof teamName !== 'string' || teamName.trim() === '') {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, message: 'A team name is required for a new team' });
        }

        const baseName = teamName.trim();
        let resolvedName = baseName;
        let suffixIndex = 2;
        while (true) {
          const duplicateName = await client.query(
            'SELECT id FROM teams WHERE lower(btrim(name)) = lower(btrim($1))',
            [resolvedName],
          );
          if (duplicateName.rows.length === 0) break;
          resolvedName = `${baseName} (${suffixIndex})`;
          suffixIndex += 1;
        }

        const createdTeam = await client.query(
          `
            INSERT INTO teams (name, member_low_person_id, member_high_person_id)
            VALUES ($1, $2, $3)
            RETURNING id, name
          `,
          [resolvedName, memberIds[0], memberIds[1]],
        );
        team = createdTeam.rows[0];
      } else if (typeof teamName === 'string' && teamName.trim() !== team.name) {
        const duplicateName = await client.query(
          'SELECT id FROM teams WHERE id <> $1 AND lower(btrim(name)) = lower(btrim($2))',
          [team.id, teamName.trim()],
        );
        if (duplicateName.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, message: 'Team name is already in use' });
        }
        const updatedTeam = await client.query(
          'UPDATE teams SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name',
          [teamName.trim(), team.id],
        );
        team = updatedTeam.rows[0];
      }

      const existingEntries = await client.query(
        `
          SELECT te.id, te.person_id, te.team_id
          FROM tournament_entries te
          LEFT JOIN teams registered_team ON registered_team.id = te.team_id
          WHERE te.tournament_id = $1
            AND (
              te.person_id = ANY($2::uuid[])
              OR registered_team.member_low_person_id = ANY($2::uuid[])
              OR registered_team.member_high_person_id = ANY($2::uuid[])
            )
        `,
        [tournamentId, memberIds],
      );
      if (existingEntries.rows.some((entry) => entry.team_id && entry.team_id !== team.id)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          ok: false,
          message: 'A team member is already registered as part of another team',
        });
      }

      const existingTeamEntry = existingEntries.rows.find((entry) => entry.team_id === team.id);
      if (existingTeamEntry) {
        await client.query('COMMIT');
        return res.status(200).json({
          ok: true,
          data: { personId: participantId, team, entry: existingTeamEntry },
        });
      }

      const existingMemberFees = await client.query(
        `
          SELECT person_id, participation_fee_paid
          FROM tournament_entry_members
          WHERE tournament_id = $1 AND person_id = ANY($2::uuid[])
        `,
        [tournamentId, memberIds],
      );
      await client.query(
        'DELETE FROM tournament_entries WHERE tournament_id = $1 AND person_id = ANY($2::uuid[])',
        [tournamentId, memberIds],
      );
      const createdEntry = await client.query(
        `
          INSERT INTO tournament_entries (tournament_id, team_id)
          VALUES ($1, $2)
          RETURNING *
        `,
        [tournamentId, team.id],
      );
      for (const memberFee of existingMemberFees.rows) {
        await client.query(
          `
            UPDATE tournament_entry_members
            SET participation_fee_paid = $1
            WHERE tournament_id = $2 AND person_id = $3
          `,
          [memberFee.participation_fee_paid, tournamentId, memberFee.person_id],
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({
        ok: true,
        data: { personId: participantId, team, entry: createdEntry.rows[0] },
      });
    }

    const existingEntry = await client.query(
      'SELECT id FROM tournament_entries WHERE tournament_id = $1 AND person_id = $2',
      [tournamentId, participantId],
    );
    if (existingEntry.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Person is already registered in this tournament' });
    }

    const personTeamEntry = await client.query(
      `
        SELECT te.id
        FROM tournament_entries te
        JOIN teams registered_team ON registered_team.id = te.team_id
        WHERE te.tournament_id = $1
          AND (registered_team.member_low_person_id = $2 OR registered_team.member_high_person_id = $2)
      `,
      [tournamentId, participantId],
    );
    if (personTeamEntry.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, message: 'Person is already registered as a team member' });
    }

    const createdEntry = await client.query(
      `
        INSERT INTO tournament_entries (tournament_id, person_id)
        VALUES ($1, $2)
        RETURNING *
      `,
      [tournamentId, participantId],
    );
    await client.query('COMMIT');
    return res.status(201).json({
      ok: true,
      data: { personId: participantId, entry: createdEntry.rows[0] },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to roll back tournament participant registration:', rollbackError);
    }
    console.error('Failed to register tournament participant:', error);
    const message = error instanceof Error ? error.message : 'Could not register tournament participant';
    const statusCode = /already|registered|conflict|duplicate|locked|started/i.test(message) ? 409 : 500;
    return res.status(statusCode).json({
      ok: false,
      message: statusCode === 409 ? message : 'Could not register tournament participant',
    });
  } finally {
    client.release();
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
        te.created_at,
        COALESCE(participant_members.members, '[]'::json) AS members
      FROM tournament_entries te
      LEFT JOIN tournaments t ON t.id = te.tournament_id
      LEFT JOIN persons p ON p.id = te.person_id
      LEFT JOIN teams team ON team.id = te.team_id
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'person_id', tem.person_id,
            'first_name', member_person.first_name,
            'last_name', member_person.last_name,
            'participation_fee_paid', tem.participation_fee_paid
          )
          ORDER BY member_person.first_name, member_person.last_name
        ) AS members
        FROM tournament_entry_members tem
        JOIN persons member_person ON member_person.id = tem.person_id
        WHERE tem.tournament_entry_id = te.id
      ) participant_members ON true
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

    if (/already|registered|enrolled|conflict|locked|started/i.test(message)) {
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
          te.created_at,
          COALESCE(participant_members.members, '[]'::json) AS members
        FROM tournament_entries te
        LEFT JOIN persons p ON p.id = te.person_id
        LEFT JOIN teams team ON team.id = te.team_id
        LEFT JOIN LATERAL (
          SELECT json_agg(
            json_build_object(
              'person_id', tem.person_id,
              'first_name', member_person.first_name,
              'last_name', member_person.last_name,
              'participation_fee_paid', tem.participation_fee_paid
            )
            ORDER BY member_person.first_name, member_person.last_name
          ) AS members
          FROM tournament_entry_members tem
          JOIN persons member_person ON member_person.id = tem.person_id
          WHERE tem.tournament_entry_id = te.id
        ) participant_members ON true
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
    if (error instanceof Error && /locked after start/i.test(error.message)) {
      return res.status(409).json({
        ok: false,
        message: 'Tournament participants are locked after start',
      });
    }
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
