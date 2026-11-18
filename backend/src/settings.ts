export type RulePreset = {
  startingScore: 301 | 501 | 701 | 901;
  setsToWin: number;
  legsToWin: number;
  startRule: 'single_in' | 'double_in' | 'master_in';
  checkoutRule: 'single_out' | 'double_out' | 'master_out';
  bullOutRule: 'no_bullout' | 'classic' | 'pdc';
};

export type RankingCriterion = 'placement' | 'wins' | 'leg_difference' | 'three_dart_average';

export type GeneralSettings = {
  rules: {
    groupPhase: RulePreset;
    groupRanking: RankingCriterion[];
    luckyLosers: RulePreset;
    endRound: RulePreset;
    endRoundSemifinal: RulePreset;
    endRoundFinal: RulePreset;
  };
  timings: {
    baseMinutesPerLeg: number;
    doubleInMasterInSurchargeMinutes: number;
    doubleOutMasterOutSurchargeMinutes: number;
    additionalMinutesPer200Points: number;
  };
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  rules: {
    groupPhase: {
      startingScore: 301,
      setsToWin: 1,
      legsToWin: 2,
      startRule: 'single_in',
      checkoutRule: 'single_out',
      bullOutRule: 'classic',
    },
    groupRanking: ['placement', 'wins', 'leg_difference', 'three_dart_average'],
    luckyLosers: {
      startingScore: 301,
      setsToWin: 1,
      legsToWin: 3,
      startRule: 'single_in',
      checkoutRule: 'single_out',
      bullOutRule: 'classic',
    },
    endRound: {
      startingScore: 301,
      setsToWin: 1,
      legsToWin: 3,
      startRule: 'single_in',
      checkoutRule: 'single_out',
      bullOutRule: 'classic',
    },
    endRoundSemifinal: {
      startingScore: 501,
      setsToWin: 1,
      legsToWin: 3,
      startRule: 'single_in',
      checkoutRule: 'double_out',
      bullOutRule: 'classic',
    },
    endRoundFinal: {
      startingScore: 501,
      setsToWin: 1,
      legsToWin: 4,
      startRule: 'single_in',
      checkoutRule: 'double_out',
      bullOutRule: 'classic',
    },
  },
  timings: {
    baseMinutesPerLeg: 5,
    doubleInMasterInSurchargeMinutes: 3,
    doubleOutMasterOutSurchargeMinutes: 3,
    additionalMinutesPer200Points: 2,
  },
};

const rankingCriteria: RankingCriterion[] = [
  'placement',
  'wins',
  'leg_difference',
  'three_dart_average',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRulePreset(value: unknown): value is RulePreset {
  return isRecord(value)
    && typeof value.startingScore === 'number'
    && [301, 501, 701, 901].includes(value.startingScore)
    && isIntegerInRange(value.setsToWin, 1, 4)
    && isIntegerInRange(value.legsToWin, 2, 6)
    && typeof value.startRule === 'string'
    && ['single_in', 'double_in', 'master_in'].includes(value.startRule)
    && typeof value.checkoutRule === 'string'
    && ['single_out', 'double_out', 'master_out'].includes(value.checkoutRule)
    && typeof value.bullOutRule === 'string'
    && ['no_bullout', 'classic', 'pdc'].includes(value.bullOutRule);
}

function isRanking(value: unknown): value is RankingCriterion[] {
  return Array.isArray(value)
    && value.length === rankingCriteria.length
    && value.every((item): item is RankingCriterion =>
      typeof item === 'string' && rankingCriteria.some((criterion) => criterion === item))
    && new Set(value).size === rankingCriteria.length;
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isIntegerInRange(value, 0, Number.MAX_SAFE_INTEGER);
}

export function parseGeneralSettings(value: unknown): GeneralSettings | null {
  if (!isRecord(value) || !isRecord(value.rules) || !isRecord(value.timings)) return null;

  const { rules, timings } = value;
  if (
    !isRulePreset(rules.groupPhase)
    || !isRanking(rules.groupRanking)
    || !isRulePreset(rules.luckyLosers)
    || !isRulePreset(rules.endRound)
    || !isRulePreset(rules.endRoundSemifinal)
    || !isRulePreset(rules.endRoundFinal)
    || !isIntegerInRange(timings.baseMinutesPerLeg, 1, Number.MAX_SAFE_INTEGER)
    || !isNonNegativeInteger(timings.doubleInMasterInSurchargeMinutes)
    || !isNonNegativeInteger(timings.doubleOutMasterOutSurchargeMinutes)
    || !isNonNegativeInteger(timings.additionalMinutesPer200Points)
  ) {
    return null;
  }

  return {
    rules: {
      groupPhase: rules.groupPhase,
      groupRanking: rules.groupRanking,
      luckyLosers: rules.luckyLosers,
      endRound: rules.endRound,
      endRoundSemifinal: rules.endRoundSemifinal,
      endRoundFinal: rules.endRoundFinal,
    },
    timings: {
      baseMinutesPerLeg: timings.baseMinutesPerLeg,
      doubleInMasterInSurchargeMinutes: timings.doubleInMasterInSurchargeMinutes,
      doubleOutMasterOutSurchargeMinutes: timings.doubleOutMasterOutSurchargeMinutes,
      additionalMinutesPer200Points: timings.additionalMinutesPer200Points,
    },
  };
}
