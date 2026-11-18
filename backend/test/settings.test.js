import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_GENERAL_SETTINGS, parseGeneralSettings } from '../dist/settings.js';

test('general settings defaults satisfy the API schema', () => {
  assert.deepEqual(parseGeneralSettings(DEFAULT_GENERAL_SETTINGS), DEFAULT_GENERAL_SETTINGS);
});

test('general settings reject invalid rule values, duplicate ranking criteria, and negative time values', () => {
  const invalidRule = structuredClone(DEFAULT_GENERAL_SETTINGS);
  invalidRule.rules.groupPhase.startingScore = 999;
  assert.equal(parseGeneralSettings(invalidRule), null);

  const duplicateRanking = structuredClone(DEFAULT_GENERAL_SETTINGS);
  duplicateRanking.rules.groupRanking[1] = 'placement';
  assert.equal(parseGeneralSettings(duplicateRanking), null);

  const negativeTiming = structuredClone(DEFAULT_GENERAL_SETTINGS);
  negativeTiming.timings.additionalMinutesPer200Points = -1;
  assert.equal(parseGeneralSettings(negativeTiming), null);
});

test('general settings parser returns only the supported setting shape', () => {
  const parsed = parseGeneralSettings({ ...DEFAULT_GENERAL_SETTINGS, extra: true });
  assert.ok(parsed);
  assert.equal('extra' in parsed, false);
});
