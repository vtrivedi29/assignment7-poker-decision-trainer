/**
 * Poker Decision Trainer – EV Decision Logic
 * Evaluates optimal poker action using pot odds, equity, EV, and fold equity.
*/

export const CARD_BACK_IMAGE = "https://deckofcardsapi.com/static/img/back.png";

export function analyzeScenario(scenario, userAction = "Call") {
  return evaluateScenarioEV(scenario, userAction);
}

export function getOutsDetail(heroCards = [], boardCards = []) {
  if (!boardCards || boardCards.length === 0) {
    return createEmptyOutInfo();
  }
  return calculateOutsInfo(heroCards, boardCards);
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

const RANK_VALUE_TO_CODE = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "0",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2",
};

const SUIT_CODES = ["C", "D", "H", "S"];
const FULL_DECK = buildFullDeck();

function cardCodeToRankValue(code) {
  if (!code || typeof code !== "string") return 0;
  const rankChar = code.charAt(0).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(CARD_RANK_VALUES, rankChar)) {
    return CARD_RANK_VALUES[rankChar];
  }
  const parsed = parseInt(rankChar, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function rankValueToCode(rank) {
  return RANK_VALUE_TO_CODE[rank] || null;
}

function normalizeCardCode(code) {
  return typeof code === "string" ? code.toUpperCase() : "";
}

function formatDollarDisplay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function formatPercentDisplay(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00%";
  return `${num.toFixed(2)}%`;
}

export function evaluateScenarioEV(scenario, userAction = "Call") {
  const gameState = scenario?.gameState ?? {};
  const heroState = scenario?.heroState ?? {};
  const opponentProfile = scenario?.opponentProfile ?? {};
  const currentDecision = scenario?.currentDecision ?? {};

  const pot = Number(gameState.potSize) || 0;
  const callAmount = Number(currentDecision.amountToCall) || 0;
  const betSizeValue =
    currentDecision.betSize !== undefined ? Number(currentDecision.betSize) : callAmount;
  const betSize = Number.isFinite(betSizeValue) ? betSizeValue : callAmount;
  const totalPotIfCall = pot + betSize + callAmount;
  const hasBetToCall = callAmount > 0;
  const potOddsRatio = totalPotIfCall > 0 ? callAmount / totalPotIfCall : 0;

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

  const outsInfo = boardCards.length > 0 ? calculateOutsInfo(heroCards, boardCards) : createEmptyOutInfo();
  const outs = outsInfo.total;

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
  const winAmountCall = totalPotIfCall;
  const loseAmountCall = callAmount;
  const EV_call = winProb * winAmountCall - loseProb * loseAmountCall;
  const EV_check = winProb * pot;
  const foldEquity = estimateFoldEquity(opponentRange, boardCards);
  const assumedRaiseSize = hasBetToCall ? betSize : Math.max(betSize || 0, pot * 0.75 || 1);
  const EV_raise = foldEquity * (pot + assumedRaiseSize) - (1 - foldEquity) * assumedRaiseSize;
  const EVsRaw = { Fold: EV_fold };
  if (hasBetToCall) {
    EVsRaw.Call = EV_call;
  } else {
    EVsRaw.Check = EV_check;
  }
  EVsRaw.Raise = EV_raise;

  const evDetails = [];
  evDetails.push({
    action: "Fold",
    ev: EV_fold,
    explanation: "You give up the contested pot immediately, so EV = 0.",
    components: [],
    line: "Fold: EV = 0 (you concede the pot).",
  });

  if (hasBetToCall) {
    const callLine = `Call: EV = ${formatPercentDisplay(winProb * 100)} × $${formatDollarDisplay(
      winAmountCall
    )} − ${formatPercentDisplay(loseProb * 100)} × $${formatDollarDisplay(
      loseAmountCall
    )} = $${formatDollarDisplay(EV_call)}`;
    evDetails.push({
      action: "Call",
      ev: EV_call,
      explanation: "EV = win% × amount won − lose% × amount lost.",
      components: [
        { label: "Win %", value: winProb * 100, type: "percent" },
        { label: "Amount won when you hit", value: winAmountCall, type: "dollar" },
        { label: "Lose %", value: loseProb * 100, type: "percent" },
        { label: "Amount lost when you miss", value: loseAmountCall, type: "dollar" },
      ],
      line: callLine,
    });
  } else {
    const checkLine = `Check: EV = ${formatPercentDisplay(winProb * 100)} × $${formatDollarDisplay(
      pot
    )} − ${formatPercentDisplay(loseProb * 100)} × $0.00 = $${formatDollarDisplay(EV_check)}`;
    evDetails.push({
      action: "Check",
      ev: EV_check,
      explanation: "EV = win% × current pot; checking risks $0 on this street.",
      components: [
        { label: "Win %", value: winProb * 100, type: "percent" },
        { label: "Pot awarded on showdown", value: pot, type: "dollar" },
      ],
      line: checkLine,
    });
  }

  const raiseWinAmount = pot + assumedRaiseSize;
  const raiseLosePercentage = (1 - foldEquity) * 100;
  const raiseLine = `Raise: EV = ${formatPercentDisplay(
    foldEquity * 100
  )} × $${formatDollarDisplay(raiseWinAmount)} − ${formatPercentDisplay(
    raiseLosePercentage
  )} × $${formatDollarDisplay(assumedRaiseSize)} = $${formatDollarDisplay(EV_raise)} (simplified)`;
  evDetails.push({
    action: "Raise",
    ev: EV_raise,
    explanation: "EV ≈ fold% × pot won − (1 − fold%) × amount risked (simplified model).",
    components: [
      { label: "Fold % (estimated)", value: foldEquity * 100, type: "percent" },
      { label: "Pot captured when they fold", value: raiseWinAmount, type: "dollar" },
      { label: "Continue %", value: raiseLosePercentage, type: "percent" },
      { label: "Amount risked", value: assumedRaiseSize, type: "dollar" },
    ],
    line: raiseLine,
    note: "Assumes opponents fold at the estimated rate and ignores post-raise runouts.",
  });

  // Determine the optimal action
  const optimalAction = Object.keys(EVsRaw).reduce((a, b) =>
    EVsRaw[a] > EVsRaw[b] ? a : b
  );

  // -----------------------------
  // 5. Quantitative Explanation
  // -----------------------------
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

  const formatted = formatExplanation({
    ...result,
    userAction,
    potOddsPercent: potOddsRatio * 100,
    evDetails,
    callAmount,
    totalPotIfCall,
  });
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
    outsDetail: outsInfo,
    potOdds: potOddsRatio * 100,
    evDetails,
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
  return calculateOutsInfo(heroCards, boardCards).total;
}

function createEmptyOutInfo() {
  return {
    total: 0,
    cards: [],
    categories: {
      flush: [],
      straight: [],
      rank: [],
    },
  };
}

function calculateOutsInfo(heroCards = [], boardCards = []) {
  const combined = [...heroCards, ...boardCards].filter(Boolean);
  if (combined.length === 0) {
    return createEmptyOutInfo();
  }

  const usedSet = new Set(combined.map(normalizeCardCode));
  const availableCards = FULL_DECK.filter((code) => !usedSet.has(code));

  const flushCards = getFlushOutCards(combined, availableCards);
  const straightCards = getStraightOutCards(combined, availableCards);
  const rankCards = getRankOutCards(combined, availableCards);

  const allOutsSet = new Set([...flushCards, ...straightCards, ...rankCards]);
  const allOuts = Array.from(allOutsSet).sort();

  return {
    total: allOuts.length,
    cards: allOuts,
    categories: {
      flush: flushCards,
      straight: straightCards,
      rank: rankCards,
    },
  };
}

function getFlushOutCards(combinedCards, availableCards) {
  const suitCounts = combinedCards.reduce((acc, code) => {
    const suit = code?.charAt(1)?.toUpperCase();
    if (!suit) return acc;
    acc[suit] = (acc[suit] || 0) + 1;
    return acc;
  }, {});

  const outs = [];
  Object.entries(suitCounts).forEach(([suit, count]) => {
    if (count === 4) {
      availableCards.forEach((code) => {
        if (code.charAt(1).toUpperCase() === suit) {
          addUnique(outs, code);
        }
      });
    }
  });

  return outs.sort();
}

function getStraightOutCards(combinedCards, availableCards) {
  const rankValues = combinedCards
    .map(cardCodeToRankValue)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (rankValues.length < 4) {
    return [];
  }

  const neededRanks = collectStraightOutRanks(rankValues);
  if (neededRanks.size === 0) {
    return [];
  }

  const outs = [];
  neededRanks.forEach((rank) => {
    const rankCode = rankValueToCode(rank);
    if (!rankCode) return;
    availableCards.forEach((code) => {
      if (code.charAt(0).toUpperCase() === rankCode) {
        addUnique(outs, code);
      }
    });
  });

  return outs.sort();
}

function getRankOutCards(combinedCards, availableCards) {
  const rankCounts = combinedCards.reduce((acc, code) => {
    const rankValue = cardCodeToRankValue(code);
    if (!Number.isFinite(rankValue) || rankValue <= 0) {
      return acc;
    }
    const key = String(rankValue);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const outs = [];
  Object.entries(rankCounts).forEach(([rankKey, count]) => {
    const rank = Number(rankKey);
    if (!Number.isFinite(rank) || count <= 0 || count >= 4) return;
    const rankCode = rankValueToCode(rank);
    if (!rankCode) return;
    availableCards.forEach((code) => {
      if (code.charAt(0).toUpperCase() === rankCode) {
        addUnique(outs, code);
      }
    });
  });

  return outs.sort();
}

function collectStraightOutRanks(rankValues) {
  const uniqueRanks = new Set(rankValues);
  if (uniqueRanks.has(14)) {
    uniqueRanks.add(1);
  }

  const needed = new Set();
  for (let high = 5; high <= 14; high += 1) {
    const sequence = [];
    for (let rank = high - 4; rank <= high; rank += 1) {
      sequence.push(rank);
    }
    const present = sequence.filter((rank) => uniqueRanks.has(rank));
    if (present.length >= 4 && present.length < 5) {
      sequence.forEach((rank) => {
        if (!uniqueRanks.has(rank)) {
          needed.add(rank === 1 ? 14 : rank);
        }
      });
    }
  }

  return needed;
}

function addUnique(target, code) {
  if (!target.includes(code)) {
    target.push(code);
  }
}

function buildFullDeck() {
  const deck = [];
  Object.values(RANK_VALUE_TO_CODE).forEach((rankCode) => {
    SUIT_CODES.forEach((suit) => {
      deck.push(`${rankCode}${suit}`);
    });
  });
  return deck;
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
  userAction = "Call",
  potOddsPercent = 0,
  evDetails = [],
  callAmount = 0,
  totalPotIfCall = 0,
}) {
  const EVLines = Object.entries(EVs)
    .map(([act, val]) => `EV(${act}) = $${val}`)
    .join("\n");

  const detailLines = (evDetails || [])
    .map((detail) => `- ${detail.line}`)
    .join("\n");

  const potOddsSummary =
    callAmount > 0
      ? `Pot odds: call $${formatDollarDisplay(callAmount)} to win $${formatDollarDisplay(
          totalPotIfCall
        )}, which requires **${formatPercentDisplay(potOddsPercent)}** equity.`
      : "No one has bet yet, so checking keeps your investment at $0.";

  const equityComparison =
    Number(heroEquity) > Number(requiredEquity)
      ? "exceeds"
      : "falls short of";

  return `
Your choice to **${userAction}** was **${
    optimalAction.toLowerCase() === userAction.toLowerCase() ? "Optimal" : "Incorrect"
  }**.

**Primary Justification:**
The optimal play was to **${optimalAction}**. ${potOddsSummary}
Given the opponent's range (${rangeSummary}), your hand has approximately **${heroEquity}%** equity versus the required **${requiredEquity}%** to continue, so your current equity ${equityComparison} the threshold.

**EV Summary:**
${EVLines}

**EV formulas by action:**
${detailLines}

**Conceptual Takeaway:**
This hand illustrates the principle of **${concept}**.
`;
}

export default {
  analyzeScenario,
  CARD_BACK_IMAGE,
};
