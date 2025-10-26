/**
 * Poker Decision Trainer – EV Decision Logic
 * Evaluates optimal poker action using pot odds, equity, EV, and fold equity.
*/

export const CARD_BACK_IMAGE = "https://deckofcardsapi.com/static/img/back.png";

export function analyzeScenario(scenario, userAction = "Call") {
  return evaluateScenarioEV(scenario, userAction);
}

const CARD_RANK_VALUES = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  0: 10, // deckofcards API uses "0" for Tens
  9: 9,
  8: 8,
  7: 7,
  6: 6,
  5: 5,
  4: 4,
  3: 3,
  2: 2,
};

function cardCodeToRankValue(code) {
  if (!code || typeof code !== "string") return 0;
  const rankChar = code.charAt(0).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CARD_RANK_VALUES, rankChar)) {
    return CARD_RANK_VALUES[rankChar];
  }
  const parsed = parseInt(rankChar, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function evaluateScenarioEV(scenario, userAction = "Call") {
  const gameState = scenario?.gameState ?? {};
  const heroState = scenario?.heroState ?? {};
  const opponentProfile = scenario?.opponentProfile ?? {};
  const currentDecision = scenario?.currentDecision ?? {};

  const pot = Number(gameState.potSize) || 0;
  const callAmount = Number(currentDecision.amountToCall) || 0;
  const betSize =
    currentDecision.betSize !== undefined ? Number(currentDecision.betSize) : callAmount;
  const totalPotIfCall = pot + betSize + callAmount;

  // -----------------------------
  // 1. Assign Opponent Range
  // -----------------------------
  const archetypeRanges = {
    Nit: ["77+", "AJs+", "KQs", "AQo+"],
    Default: ["55+", "A9s+", "KTs+", "QTs+", "JTs", "T9s", "ATo+", "KQo"],
    LAG: [
      "22+", "A2s+", "K7s+", "Q9s+", "J9s+", "T8s+", "98s", "87s", "76s",
      "ATo+", "KTo+", "QTo+", "JTo"
    ],
    "Calling Station": ["22+", "A2s+", "K2s+", "Q5s+", "J7s+", "T7s+", "97s+", "A2o+", "K8o+", "Q9o+", "J9o+"]
  };
  const opponentArchetype = opponentProfile.archetype || "Default";
  const opponentRange = archetypeRanges[opponentArchetype] || archetypeRanges.Default;

  // -----------------------------
  // 2. Estimate Hero Equity
  // -----------------------------
  // Simple approximation – later replaced by Monte Carlo or equity API
  const heroCards = Array.isArray(heroState.holeCards)
    ? heroState.holeCards.filter(Boolean)
    : [];
  const boardCards = Array.isArray(gameState.communityCards)
    ? gameState.communityCards.filter(Boolean)
    : [];
  const equity = approximateEquity(heroCards, boardCards); // %

  // -----------------------------
  // 3. Compute Pot Odds & Required Equity
  // -----------------------------
  const requiredEquity = totalPotIfCall > 0 ? (callAmount / totalPotIfCall) * 100 : 0;

  // -----------------------------
  // 4. EV Calculations
  // -----------------------------
  const winProb = equity / 100;
  const loseProb = 1 - winProb;

  const EV_fold = 0;
  const EV_call = winProb * (pot + betSize + callAmount) - callAmount;
  const EV_check = winProb * pot; // simplified
  const foldEquity = estimateFoldEquity(opponentRange, boardCards);
  const EV_raise = foldEquity * pot - (1 - foldEquity) * betSize;
  const EVsRaw = { Fold: EV_fold, Check: EV_check, Call: EV_call, Raise: EV_raise };

  // Determine the optimal action
  const optimalAction = Object.keys(EVsRaw).reduce((a, b) =>
    EVsRaw[a] > EVsRaw[b] ? a : b
  );

  // -----------------------------
  // 5. Quantitative Explanation
  // -----------------------------
  const outs = estimateOuts(heroCards, boardCards);
  const impliedOdds =
    winProb > 0 ? Math.max(0, callAmount / winProb - totalPotIfCall) : 0;

  const EVs = Object.fromEntries(
    Object.entries(EVsRaw).map(([k, v]) => [k, v.toFixed(2)])
  );

  const result = {
    requiredEquity: requiredEquity.toFixed(2),
    heroEquity: equity.toFixed(2),
    EVs,
    optimalAction,
    rangeSummary: opponentRange.join(", "),
    concept: getConcept(optimalAction)
  };

  const formatted = formatExplanation({ ...result, userAction });
  const metrics = {
    optimalAction,
    optimalEV: EVsRaw[optimalAction],
    alternatives: Object.entries(EVsRaw)
      .filter(([action]) => action !== optimalAction)
      .map(([action, value]) => ({ action, ev: value })),
    requiredEquity,
    heroEquity: equity,
    foldEquity: foldEquity * 100,
    ruleOf4Equity: equity,
    outs,
    potSize: pot,
    opponentBet: betSize,
    amountToCall: callAmount,
    totalPotIfCall,
    impliedOdds,
  };

  return { formatted, metrics };
}

/** --- Helper Functions --- **/

function approximateEquity(heroCards = [], boardCards = []) {
  if (!boardCards || boardCards.length === 0) {
    return estimatePreflopEquity(heroCards);
  }

  const outs = estimateOuts(heroCards, boardCards);
  if (boardCards.length === 3) {
    if (outs <= 0) return 12;
    return Math.min(Math.max(outs > 8 ? outs * 4 - (outs - 8) : outs * 4, 12), 95);
  }
  if (boardCards.length === 4) {
    if (outs <= 0) return 9;
    return Math.min(Math.max(outs * 2, 9), 95);
  }
  return 5;
}

function estimateOuts(heroCards = [], boardCards = []) {
  if (!boardCards || boardCards.length === 0) return 0;
  const flushOuts = countFlushOuts(heroCards, boardCards);
  const straightOuts = countStraightOuts(heroCards, boardCards);
  return flushOuts + straightOuts;
}

function countFlushOuts(heroCards = [], boardCards = []) {
  const combined = [...heroCards, ...boardCards];
  const suitCounts = combined.reduce((acc, code) => {
    const suit = code?.charAt(1)?.toLowerCase();
    if (!suit) return acc;
    acc[suit] = (acc[suit] || 0) + 1;
    return acc;
  }, {});
  return Object.values(suitCounts).some((count) => count >= 4) ? 9 : 0;
}

function countStraightOuts(heroCards = [], boardCards = []) {
  const ranks = [...heroCards, ...boardCards]
    .map(cardCodeToRankValue)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (ranks.length < 4) return 0;

  const unique = [...new Set(ranks)].sort((a, b) => a - b);
  const withWheel = unique.includes(14) ? [...new Set([...unique, 1])].sort((a, b) => a - b) : unique;

  for (let i = 0; i <= withWheel.length - 4; i += 1) {
    const window = withWheel.slice(i, i + 4);
    if (window[3] - window[0] === 3) return 8;
    if (window[3] - window[0] === 4) return 4;
  }
  return 0;
}

function estimatePreflopEquity(heroCards = []) {
  if (!heroCards || heroCards.length < 2) return 0;
  const values = heroCards
    .map(cardCodeToRankValue)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);
  if (values.length < 2) return 0;

  const suits = heroCards.map((code) => code?.charAt(1)).filter(Boolean);
  const suited = suits.length === 2 && suits[0] === suits[1];
  const [vA, vB] = values;
  const gap = Math.abs(vA - vB);

  if (vA === vB) {
    if (vA >= 13) return 74;
    if (vA >= 10) return 68;
    if (vA >= 7) return 63;
    return 58;
  }

  if (suited && gap === 1 && vA >= 11) return 58;
  if (vA >= 14 && vB >= 10) return suited ? 56 : 52;
  if (vA >= 13 && vB >= 9) return suited ? 54 : 49;
  if (suited && gap <= 2) return 51;
  if (vA >= 14 || vB >= 14) return 50;
  if (gap === 1) return 47;
  if (vA >= 12 && vB >= 8) return 45;
  return 41;
}

function estimateFoldEquity(range, board) {
  // Assume 30–50% of hands miss the board; adjust by archetype
  return 0.3; // 30% fold equity as baseline
}

function getConcept(action) {
  const concepts = {
    Call: "using direct pot odds to make a profitable call",
    Fold: "avoiding negative-EV spots through disciplined folding",
    Raise: "creating fold equity and extracting value with aggression",
    Check: "controlling pot size with marginal equity"
  };
  return concepts[action] || "balancing pot odds and fold equity";
}

function formatExplanation({
  requiredEquity,
  heroEquity,
  EVs,
  optimalAction,
  rangeSummary,
  concept,
  userAction = "Call"
}) {
  const EVLines = Object.entries(EVs)
    .map(([act, val]) => `EV(${act}) = $${val}`)
    .join("\n");

  return `
Your choice to **${userAction}** was **${optimalAction.toLowerCase() === userAction.toLowerCase() ? "Optimal" : "Incorrect"}**.

**Primary Justification:**
The optimal play was to **${optimalAction}**. You were offered pot odds requiring **${requiredEquity}%** equity to continue.
Given the opponent's range (${rangeSummary}), your hand has approximately **${heroEquity}%** equity.

**Expected Value (EV) Analysis:**
${EVLines}

Because your equity of **${heroEquity}%** ${heroEquity > requiredEquity ? "exceeds" : "falls short of"} the required **${requiredEquity}%**, the **${optimalAction}** action yields the highest long-term EV.

**Conceptual Takeaway:**
This hand illustrates the principle of **${concept}**.
`;
}

export default {
  analyzeScenario,
  CARD_BACK_IMAGE,
};
