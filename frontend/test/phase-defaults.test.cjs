const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

async function createApp() {
  const element = () => ({
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    setAttribute() {},
    querySelector(selector) { return selector === 'svg' ? element() : null; },
    querySelectorAll() { return []; }
  });
  const ids = [
    'notice', 'tournamentCount', 'runningCount', 'finishedCount', 'tournamentsList',
    'tournamentEmptyTemplate', 'tournamentParticipantCount', 'tournamentGroupCount',
    'workflowStatusBadge', 'workflowStatusLabel', 'workflowTournamentName',
    'refreshButton', 'resetDatabaseButton', 'databaseResetControls',
    'backendHealthStatus', 'databaseHealthStatus', 'broadcastStatus'
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const selectors = Object.fromEntries([
    '[data-step-content]', '[data-step-nav]', '[data-step-previous]',
    '[data-step-next]', '.step-controls'
  ].map((selector) => [selector, element()]));
  const responses = {
    '/api/tournaments': [],
    '/api/persons': [],
    '/api/teams': [],
    '/api/tournament-entries': []
  };
  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id] || null,
      querySelector: (selector) => selectors[selector] || null,
      querySelectorAll: () => [],
      addEventListener() {}
    },
    window: { setInterval() {}, setTimeout() {}, clearTimeout() {} },
    fetch: async (url) => ({
      ok: true,
      json: async () => ({ ok: true, data: responses[url] || [], checks: { database: 'ok' } })
    }),
    console
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  vm.runInContext(source, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { context, responses };
}

test('phase defaults follow participant count at qualifier boundaries', async () => {
  const { context } = await createApp();
  for (const [count, qualifiers, placement, lucky] of [
    [0, 4, false, false], [3, 4, false, false], [4, 4, true, false],
    [5, 4, true, false], [6, 4, true, true], [8, 8, true, false],
    [10, 8, true, true], [16, 16, true, false], [18, 16, true, true],
    [32, 32, true, false], [34, 32, true, true]
  ]) {
    const actual = vm.runInContext(`resetPhaseDefaults(${count}); JSON.stringify(state.configuration)`, context);
    assert.deepEqual(JSON.parse(actual), {
      groupPhaseEnabled: true,
      groupCount: String(Math.max(1, Math.floor(count / 4))),
      gamesPerPair: '1',
      qualifierCount: String(qualifiers),
      placementPhaseEnabled: placement,
      placementGames: true,
      luckyLosers: lucky
    });
  }
});

test('reloading preserves manual settings unless the participant count changes', async () => {
  const { context, responses } = await createApp();
  const tournament = { id: 't1', name: 'Test', status: 'open' };
  const entries = (count) => Array.from({ length: count }, (_, id) => ({
    id: String(id), tournament_id: tournament.id
  }));
  responses['/api/tournaments'] = [tournament];
  responses['/api/tournament-entries'] = entries(10);
  vm.runInContext(`
    state.currentTournamentId = 't1';
    state.entries = ${JSON.stringify(entries(10))};
    resetPhaseDefaults(10);
    Object.assign(state.configuration, {
      groupCount: '5', gamesPerPair: '3', qualifierCount: '4',
      groupPhaseEnabled: false, placementGames: false
    });
  `, context);
  await vm.runInContext('loadData()', context);
  assert.equal(vm.runInContext('state.configuration.gamesPerPair', context), '3');
  assert.equal(vm.runInContext('state.configuration.groupPhaseEnabled', context), false);
  responses['/api/tournament-entries'] = entries(6);
  await vm.runInContext('loadData()', context);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.configuration)', context)), {
    groupPhaseEnabled: true,
    groupCount: '1',
    gamesPerPair: '1',
    qualifierCount: '4',
    placementPhaseEnabled: true,
    placementGames: true,
    luckyLosers: true
  });
  responses['/api/tournament-entries'] = entries(3);
  await vm.runInContext('loadData()', context);
  assert.equal(vm.runInContext('state.configuration.qualifierCount', context), '4');
  assert.equal(vm.runInContext('state.configuration.placementPhaseEnabled', context), false);
  assert.equal(vm.runInContext('state.configuration.luckyLosers', context), false);
});

test('switching tournaments uses defaults for the selected tournament', async () => {
  const { context } = await createApp();
  vm.runInContext(`
    state.tournaments = [
      { id: 'a', name: 'A', status: 'open' },
      { id: 'b', name: 'B', status: 'open' }
    ];
    state.entries = Array.from({ length: 10 }, (_, id) => ({ id, tournament_id: 'b' }));
    openTournament('a');
    state.configuration.gamesPerPair = '3';
    openTournament('b');
  `, context);
  assert.equal(vm.runInContext('state.configuration.gamesPerPair', context), '1');
  assert.equal(vm.runInContext('state.configuration.qualifierCount', context), '8');
  assert.equal(vm.runInContext('state.configuration.luckyLosers', context), true);
});

test('placement brackets count real matches and player paths with byes', async () => {
  const { context } = await createApp();
  for (const [entries, games, min, max] of [
    [0, 0, 0, 0], [1, 0, 0, 0], [3, 2, 1, 2],
    [4, 4, 2, 2], [5, 5, 1, 3], [6, 7, 2, 3], [7, 9, 2, 3], [8, 12, 3, 3]
  ]) {
    const result = vm.runInContext(`JSON.stringify(placementBracketMetrics(${entries}))`, context);
    assert.deepEqual(JSON.parse(result), { games, min, max });
  }
});

test('match statistics reflect uneven groups and alternative phase paths', async () => {
  const { context } = await createApp();
  const calculate = (participants, groups, games, overrides = {}) => {
    const configuration = {
      groupPhaseEnabled: true,
      placementPhaseEnabled: true,
      placementGames: true,
      luckyLosers: true,
      qualifierCount: 8,
      ...overrides
    };
    return JSON.parse(vm.runInContext(
      `JSON.stringify(calculateTournamentMetrics(${participants}, ${groups}, ${games}, ${JSON.stringify(configuration)}))`,
      context
    ));
  };
  assert.deepEqual(calculate(11, 2, 1), { groupGames: 25, finalGames: 12, luckyGames: 2, min: 5, max: 8 });
  assert.deepEqual(calculate(11, 2, 2), { groupGames: 50, finalGames: 12, luckyGames: 2, min: 9, max: 13 });
  assert.deepEqual(calculate(14, 2, 1), { groupGames: 42, finalGames: 12, luckyGames: 7, min: 8, max: 9 });
  assert.deepEqual(calculate(14, 2, 1, { placementGames: false }),
    { groupGames: 42, finalGames: 7, luckyGames: 7, min: 7, max: 9 });
  assert.deepEqual(calculate(14, 2, 1, { luckyLosers: false }),
    { groupGames: 42, finalGames: 12, luckyGames: 0, min: 6, max: 9 });
  assert.deepEqual(calculate(6, 2, 1, { qualifierCount: 4, placementPhaseEnabled: false }),
    { groupGames: 6, finalGames: 0, luckyGames: 1, min: 2, max: 3 });
  assert.deepEqual(calculate(11, 2, 1, { placementPhaseEnabled: false, luckyLosers: false }),
    { groupGames: 25, finalGames: 0, luckyGames: 0, min: 4, max: 5 });
  assert.deepEqual(calculate(8, 2, 1, { groupPhaseEnabled: false, luckyLosers: false }),
    { groupGames: 0, finalGames: 12, luckyGames: 0, min: 3, max: 3 });
  assert.deepEqual(calculate(3, 1, 1, { groupPhaseEnabled: false, luckyLosers: false }),
    { groupGames: 0, finalGames: 2, luckyGames: 0, min: 1, max: 2 });
  assert.deepEqual(calculate(0, 1, 1), { groupGames: 0, finalGames: 0, luckyGames: 0, min: 0, max: 0 });
  assert.deepEqual(calculate(3, 5, 1, { placementPhaseEnabled: false, luckyLosers: false, qualifierCount: 4 }),
    { groupGames: 0, finalGames: 0, luckyGames: 0, min: 0, max: 0 });
  assert.deepEqual(calculate(11, null, 1), { groupGames: null, finalGames: 12, luckyGames: 2, min: null, max: null });
  assert.deepEqual(calculate(11, 2, 1, { qualifierCount: null }),
    { groupGames: 25, finalGames: null, luckyGames: null, min: null, max: null });
  assert.deepEqual(calculate(11, 2, 1, { qualifierCount: null, placementPhaseEnabled: false, luckyLosers: false }),
    { groupGames: 25, finalGames: 0, luckyGames: 0, min: 4, max: 5 });
});

test('schedule includes group pairs, numbered dependencies, placements and final', async () => {
  const { context } = await createApp();
  const result = JSON.parse(vm.runInContext(`
    state.currentTournamentId = 't';
    state.entries = Array.from({ length: 8 }, (_, id) => ({ id, tournament_id: 't' }));
    resetPhaseDefaults(8);
    state.configuration.qualifierCount = '4';
    state.configuration.gamesPerPair = '2';
    state.configuration.luckyLosers = true;
    const matches = buildMatchSchedule();
    JSON.stringify(matches.map((match) => ({
      number: match.number, phase: match.phase, label: match.label,
      first: typeof match.first === 'string' ? match.first : match.first.outcome + ' Spiel ' + match.first.match.number,
      second: typeof match.second === 'string' ? match.second : match.second.outcome + ' Spiel ' + match.second.match.number
    })));
  `, context));
  assert.equal(result.filter((match) => match.phase === 'Gruppenphase').length, 24);
  assert.equal(result.filter((match) => match.phase === 'Lucky Losers').length, 4);
  assert.equal(result.filter((match) => match.phase === 'Endrunde').length, 4);
  assert.equal(result.at(-2).label, 'Spiel um Platz 3');
  assert.equal(result.at(-1).label, 'Finale');
  assert.match(result.at(-2).first, /^Verlierer Spiel \d+$/);
  assert.match(result.at(-1).first, /^Sieger Spiel \d+$/);
  const pairs = result.filter((match) => match.phase === 'Gruppenphase')
    .map((match) => [match.first, match.second].sort().join('-'));
  assert.equal(new Set(pairs).size, 12);
  assert.ok([...new Set(pairs)].every((pair) => pairs.filter((item) => item === pair).length === 2));
  result.forEach((match, index) => {
    assert.equal(match.number, index + 1);
    for (const entry of [match.first, match.second]) {
      const reference = entry.match(/^(?:Sieger|Verlierer) Spiel (\d+)$/);
      if (reference) assert.ok(Number(reference[1]) < match.number);
    }
  });
});

test('schedule respects the draw and uses neutral extra qualifiers', async () => {
  const { context } = await createApp();
  const result = JSON.parse(vm.runInContext(`
    state.currentTournamentId = 't';
    state.entries = Array.from({ length: 14 }, (_, id) =>
      ({ id, tournament_id: 't', person_id: id, person_first_name: 'Person ' + id }));
    resetPhaseDefaults(14);
    state.drawGroups = [
      state.entries.slice(0, 5), state.entries.slice(5, 10), state.entries.slice(10)
    ];
    JSON.stringify(buildMatchSchedule().map((match) => ({
      phase: match.phase,
      first: typeof match.first === 'string' ? match.first : null,
      second: typeof match.second === 'string' ? match.second : null
    })));
  `, context));
  const groupMatches = result.filter((match) => match.phase === 'Gruppenphase');
  assert.equal(groupMatches.length, 26);
  assert.ok(groupMatches.every((match) => match.first.startsWith('Person ') && match.second.startsWith('Person ')));
  const firstFinalists = result.filter((match) => match.phase === 'Endrunde')
    .flatMap((match) => [match.first, match.second]).filter(Boolean);
  assert.ok(firstFinalists.includes('Zusatz-Qualifikant 1'));
  assert.ok(firstFinalists.includes('Zusatz-Qualifikant 2'));
  assert.ok(firstFinalists.includes('1. Gruppe A'));
  assert.equal(result.filter((match) => match.phase === 'Lucky Losers').length, 7);
});

test('schedule counts agree with badges across phase settings and byes', async () => {
  const { context } = await createApp();
  const error = vm.runInContext(`
    (() => {
      state.currentTournamentId = 't';
      for (let count = 0; count <= 34; count += 1) {
        state.entries = Array.from({ length: count }, (_, id) => ({ id, tournament_id: 't' }));
        for (const groupEnabled of [true, false]) {
          for (const placementGames of [true, false]) {
            resetPhaseDefaults(count);
            state.configuration.groupPhaseEnabled = groupEnabled;
            state.configuration.placementPhaseEnabled = true;
            state.configuration.placementGames = placementGames;
            const matches = buildMatchSchedule();
            const metrics = calculateTournamentMetrics(count, currentGroupCount(), 1, {
              ...state.configuration, qualifierCount: Number(state.configuration.qualifierCount)
            });
            for (const [phase, key] of [['Gruppenphase', 'groupGames'], ['Endrunde', 'finalGames'], ['Lucky Losers', 'luckyGames']]) {
              const actual = matches.filter((match) => match.phase === phase).length;
              if (actual !== metrics[key]) return JSON.stringify({ count, groupEnabled, placementGames, phase, actual, expected: metrics[key] });
            }
            for (const match of matches) {
              for (const entry of [match.first, match.second]) {
                if (typeof entry !== 'string' && entry.match.number >= match.number) return 'forward reference';
              }
            }
          }
        }
      }
      return null;
    })()
  `, context);
  assert.equal(error, null);
});

test('the final remains last when only lucky losers are enabled', async () => {
  const { context } = await createApp();
  const lastMatches = JSON.parse(vm.runInContext(`
    state.currentTournamentId = 't';
    state.entries = Array.from({ length: 8 }, (_, id) => ({ id, tournament_id: 't' }));
    resetPhaseDefaults(8);
    state.configuration.qualifierCount = '4';
    state.configuration.placementPhaseEnabled = false;
    state.configuration.luckyLosers = true;
    JSON.stringify(buildMatchSchedule().slice(-2).map((match) => [match.phase, match.label]));
  `, context));
  assert.deepEqual(lastMatches, [['Lucky Losers', 'Spiel um Platz 3'], ['Lucky Losers', 'Finale']]);
});

test('direct knockout schedule uses drawn pairings and passes byes forward', async () => {
  const { context } = await createApp();
  const result = JSON.parse(vm.runInContext(`
    state.currentTournamentId = 't';
    state.entries = ['Ada', 'Ben', 'Cara'].map((name, id) => ({
      id, tournament_id: 't', person_id: id, person_first_name: name
    }));
    resetPhaseDefaults(3);
    state.configuration.groupPhaseEnabled = false;
    state.configuration.placementPhaseEnabled = true;
    state.drawBracketEntries = [state.entries[0], null, state.entries[1], state.entries[2]];
    JSON.stringify(buildMatchSchedule().map((match) => ({
      number: match.number, label: match.label,
      first: typeof match.first === 'string' ? match.first : match.first.outcome + ' Spiel ' + match.first.match.number,
      second: typeof match.second === 'string' ? match.second : match.second.outcome + ' Spiel ' + match.second.match.number
    })));
  `, context));
  assert.deepEqual(result, [
    { number: 1, label: 'Runde 1', first: 'Ben', second: 'Cara' },
    { number: 2, label: 'Finale', first: 'Ada', second: 'Sieger Spiel 1' }
  ]);
});
