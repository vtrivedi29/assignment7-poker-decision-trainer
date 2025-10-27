import React, { useEffect, useMemo, useState } from "react";
import {
  analyzeScenario,
  CARD_BACK_IMAGE as LOGIC_CARD_BACK,
  getOutsDetail,
} from "./utils/evDecisionLogic";
import "./App.css";

const API_BASE_URL = "https://deckofcardsapi.com/api/deck";
const CARD_BACK_IMAGE = LOGIC_CARD_BACK;
const ROUND_STATES = ["preflop", "flop", "turn", "river"];
const CARDS_VISIBLE_BY_ROUND = [0, 3, 4, 5];

const CARD_VALUE_MAP = {
  ACE: 14,
  KING: 13,
  QUEEN: 12,
  JACK: 11,
};


const HAND_RANKS = {
  "High Card": 1,
  Pair: 2,
  "Two Pair": 3,
  "Three of a Kind": 4,
  Straight: 5,
  Flush: 6,
  "Full House": 7,
};

function getCardValue(card) {
  if (!card || !card.value) {
    return 0;
  }
  if (CARD_VALUE_MAP[card.value]) {
    return CARD_VALUE_MAP[card.value];
  }
  const parsed = parseInt(card.value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortCardsByValueDesc(cards) {
  return [...cards].sort((a, b) => getCardValue(b) - getCardValue(a));
}

function isConsecutive(numbers) {
  if (numbers.length < 2) return true;
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      return false;
    }
  }
  return true;
}

function detectStraight(values) {
  if (values.length < 5) {
    return { isStraight: false, highCard: 0, isWheel: false };
  }
  const unique = Array.from(new Set(values));
  const expanded = unique.includes(14) ? [...unique, 1] : unique;
  const sorted = expanded.sort((a, b) => a - b);

  for (let i = 0; i <= sorted.length - 5; i += 1) {
    const window = sorted.slice(i, i + 5);
    if (isConsecutive(window)) {
      const isWheel = window[0] === 1 && window[4] === 5;
      const highCard = isWheel ? 5 : window[4];
      return { isStraight: true, highCard, isWheel };
    }
  }
  return { isStraight: false, highCard: 0, isWheel: false };
}

function evaluateFiveCardHand(cards) {
  const values = cards.map(getCardValue);
  const suits = cards.map((card) => card.suit);
  const valueCounts = values.reduce((acc, value) => {
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const suitCounts = suits.reduce((acc, suit) => {
    acc[suit] = (acc[suit] || 0) + 1;
    return acc;
  }, {});

  const counts = Object.values(valueCounts);
  const pairCount = counts.filter((count) => count === 2).length;
  const hasTrips = counts.includes(3);
  const hasFour = counts.includes(4);
  const hasFullHouse = hasTrips && pairCount > 0;

  const isFlush = Object.values(suitCounts).some((count) => count === 5);
  const { isStraight, highCard: straightHigh, isWheel } = detectStraight(values);

  let handName = "High Card";
  let rank = HAND_RANKS["High Card"];

  if (hasFullHouse) {
    handName = "Full House";
    rank = HAND_RANKS["Full House"];
  } else if (isFlush && isStraight) {
    handName = "Flush";
    rank = HAND_RANKS.Flush;
  } else if (isFlush) {
    handName = "Flush";
    rank = HAND_RANKS.Flush;
  } else if (isStraight) {
    handName = "Straight";
    rank = HAND_RANKS.Straight;
  } else if (hasFour) {
    handName = "Three of a Kind";
    rank = HAND_RANKS["Three of a Kind"];
  } else if (hasTrips) {
    handName = "Three of a Kind";
    rank = HAND_RANKS["Three of a Kind"];
  } else if (pairCount >= 2) {
    handName = "Two Pair";
    rank = HAND_RANKS["Two Pair"];
  } else if (pairCount === 1) {
    handName = "Pair";
    rank = HAND_RANKS.Pair;
  }

  const groups = Object.entries(valueCounts).map(([value, count]) => ({
    value: Number(value),
    count,
  }));
  groups.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.value - a.value;
  });

  let kicker = [];
  groups.forEach(({ value, count }) => {
    for (let i = 0; i < count; i += 1) {
      kicker.push(value);
    }
  });

  if (isStraight) {
    kicker = isWheel
      ? [5, 4, 3, 2, 1]
      : [straightHigh, straightHigh - 1, straightHigh - 2, straightHigh - 3, straightHigh - 4];
  } else if (handName === "Flush" || handName === "High Card") {
    kicker = values.sort((a, b) => b - a);
  }

  return { handName, rank, kicker };
}

function combinations(cards, size) {
  const result = [];

  function helper(startIndex, combo) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = startIndex; i < cards.length; i += 1) {
      combo.push(cards[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }

  helper(0, []);
  return result;
}

function isBetterHand(nextHand, currentBest) {
  if (!currentBest) return true;
  if (nextHand.rank !== currentBest.rank) {
    return nextHand.rank > currentBest.rank;
  }
  const length = Math.max(nextHand.kicker.length, currentBest.kicker.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (nextHand.kicker[i] || 0) - (currentBest.kicker[i] || 0);
    if (diff !== 0) {
      return diff > 0;
    }
  }
  return false;
}

function hasFlushDraw(cards) {
  const suitCounts = cards.reduce((acc, card) => {
    if (!card || !card.suit) return acc;
    acc[card.suit] = (acc[card.suit] || 0) + 1;
    return acc;
  }, {});
  return Object.values(suitCounts).some((count) => count >= 4);
}

function hasStraightDraw(cards) {
  const values = cards
    .map(getCardValue)
    .filter((value) => value > 0);
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.length < 4) {
    return false;
  }
  for (let i = 0; i <= unique.length - 4; i += 1) {
    if (isConsecutive(unique.slice(i, i + 4))) {
      return true;
    }
  }
  if (unique.includes(14)) {
    const low = unique
      .map((value) => (value === 14 ? 1 : value))
      .sort((a, b) => a - b);
    const lowUnique = Array.from(new Set(low));
    for (let i = 0; i <= lowUnique.length - 4; i += 1) {
      if (isConsecutive(lowUnique.slice(i, i + 4))) {
        return true;
      }
    }
  }
  return false;
}

function countFlushDrawOuts(heroCards, boardCards) {
  const combined = [...heroCards, ...boardCards].filter(Boolean);
  const suitCounts = combined.reduce((acc, card) => {
    if (!card?.suit) return acc;
    const key = card.suit.toLowerCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return Object.values(suitCounts).some((count) => count >= 4) ? 9 : 0;
}

function getStraightOuts(heroCards, boardCards) {
  const combined = [...heroCards, ...boardCards]
    .filter(Boolean)
    .map(getCardValue)
    .filter((value) => value > 0);
  if (combined.length < 4) return 0;

  const unique = [...new Set(combined)].sort((a, b) => a - b);
  const withWheel = unique.includes(14) ? [...new Set([...unique, 1])].sort((a, b) => a - b) : unique;

  for (let i = 0; i <= withWheel.length - 4; i += 1) {
    const window = withWheel.slice(i, i + 4);
    if (window[3] - window[0] === 3) {
      return 8;
    }
    if (window[3] - window[0] === 4) {
      return 4;
    }
  }

  return 0;
}

function estimatePreflopEquity(heroCards = []) {
  if (heroCards.length < 2) return 0;
  const sorted = [...heroCards].sort((a, b) => getCardValue(b) - getCardValue(a));
  const [cardA, cardB] = sorted;
  const valueA = getCardValue(cardA);
  const valueB = getCardValue(cardB);
  const rankGap = Math.abs(valueA - valueB);
  const suited = Boolean(cardA?.suit && cardB?.suit && cardA.suit === cardB.suit);

  if (valueA === valueB) {
    // Pocket pair
    if (valueA >= 13) return 74;
    if (valueA >= 10) return 68;
    if (valueA >= 7) return 63;
    return 58;
  }

  if (suited && rankGap === 1 && valueA >= 11) {
    return 58; // e.g., QJs, JTs
  }

  if (valueA >= 14 && valueB >= 10) {
    return suited ? 56 : 52; // strong Broadway hands
  }

  if (valueA >= 13 && valueB >= 9) {
    return suited ? 54 : 49;
  }

  if (suited && rankGap <= 2) {
    return 51; // suited connectors and gappers
  }

  if (valueA >= 14 || valueB >= 14) {
    return 50; // Ace high combos
  }

  if (rankGap === 1) {
    return 47; // high-low connectors
  }

  if (valueA >= 12 && valueB >= 8) {
    return 45;
  }

  return 41; // baseline for random hands
}

function computeHeuristicEquity(heroCards = [], boardCards = []) {
  if (!boardCards || boardCards.length === 0) {
    return estimatePreflopEquity(heroCards);
  }

  const outs = estimateOuts(heroCards, boardCards);
  if (boardCards.length === 3) {
    if (outs <= 0) return 12; // minimal equity with just overcards/backdoors
    const raw = outs > 8 ? outs * 4 - (outs - 8) : outs * 4;
    return Math.min(Math.max(raw, 12), 95);
  }

  if (boardCards.length === 4) {
    if (outs <= 0) return 9;
    return Math.min(Math.max(outs * 2, 9), 95);
  }

  return 5;
}

export function analyzeHand(playerHand = [], visibleCommunityCards = []) {
  const allCards = [...playerHand, ...visibleCommunityCards].filter(Boolean);
  if (allCards.length < 2) {
    return { handName: "High Card" };
  }

  let bestEvaluation = null;
  let bestCombo = null;
  if (allCards.length >= 5) {
    const combos = combinations(allCards, 5);
    combos.forEach((combo) => {
      const evaluation = evaluateFiveCardHand(combo);
      if (isBetterHand(evaluation, bestEvaluation)) {
        bestEvaluation = evaluation;
        bestCombo = combo;
      }
    });
  } else {
    const fallbackValues = allCards.map(getCardValue).sort((a, b) => b - a);
    bestEvaluation = {
      handName: "High Card",
      rank: HAND_RANKS["High Card"],
      kicker: fallbackValues,
    };
    bestCombo = sortCardsByValueDesc(allCards).slice(0, Math.min(5, allCards.length));
  }

  const draws = [];
  if (bestEvaluation.rank < HAND_RANKS.Flush && hasFlushDraw(allCards)) {
    draws.push("Flush Draw");
  }
  if (bestEvaluation.rank < HAND_RANKS.Straight && hasStraightDraw(allCards)) {
    draws.push("Straight Draw");
  }

  return {
    handName: bestEvaluation.handName,
    drawName: draws.length ? draws.join(" & ") : null,
    bestCards: bestCombo ? bestCombo.map((card) => card.code) : [],
  };
}

function getRandomInt(min, max) {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function formatDollars(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return num.toFixed(2);
}

function estimateOuts(heroCards, boardCards) {
  const flushOuts = countFlushDrawOuts(heroCards, boardCards);
  const straightOuts = getStraightOuts(heroCards, boardCards);
  return flushOuts + straightOuts;
}

function applyInlineEmphasis(text, keyPrefix = "inline") {
  const parts = [];
  let remaining = text;
  let index = 0;
  while (remaining.includes("**")) {
    const start = remaining.indexOf("**");
    const end = remaining.indexOf("**", start + 2);
    if (end === -1) break;
    const before = remaining.slice(0, start);
    if (before) parts.push(before);
    const boldText = remaining.slice(start + 2, end);
    parts.push(<strong key={`${keyPrefix}-bold-${index}`}>{boldText}</strong>);
    remaining = remaining.slice(end + 2);
    index += 1;
  }
  if (remaining) parts.push(remaining);
  return parts.map((segment, idx) =>
    typeof segment === "string" ? <span key={`${keyPrefix}-text-${idx}`}>{segment}</span> : segment
  );
}

function renderStrategyExplanation(text) {
  const lines = text.split("\n");
  const elements = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      elements.push(
        <div className="app__strategy-list" key={`list-${elements.length}`}>
          {listBuffer.map((item, idx) => (
            <div className="app__strategy-list-item" key={`item-${idx}`}>
              {applyInlineEmphasis(item, `list-${elements.length}-${idx}`)}
            </div>
          ))}
        </div>
      );
      listBuffer = [];
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }
    if (line.startsWith("*")) {
      const cleaned = line.replace(/^\*+\s*/, "");
      listBuffer.push(cleaned);
      return;
    }
    flushList();
    elements.push(
      <p className="app__strategy-paragraph" key={`p-${elements.length}`}>
        {applyInlineEmphasis(line, `p-${elements.length}`)}
      </p>
    );
  });

  flushList();
  if (elements.length === 0) {
    return <div className="app__strategy-rich">{text}</div>;
  }
  return <div className="app__strategy-rich">{elements}</div>;
}

const SCENARIO_TEMPLATES = [
  {
    description: "Everyone checks to you.",
    amountToCall: 0,
    betSize: 0,
    actionType: "check",
  },
  {
    description: "1 opponent bets $10 (half pot).",
    amountToCall: 10,
    betSize: 10,
    actionType: "bet",
  },
  {
    description: "1 opponent bets $20 (full pot).",
    amountToCall: 20,
    betSize: 20,
    actionType: "bet",
  },
  {
    description: "2 opponents limp and wait for your move.",
    amountToCall: 5,
    betSize: 5,
    actionType: "call",
  },
  {
    description: "One opponent shoves all in.",
    amountToCall: 50,
    betSize: 50,
    actionType: "raise",
  },
];

const HERO_POSITIONS = ["Button", "Cutoff", "Hijack", "Middle Position", "Small Blind", "Big Blind"];
const OPPONENT_POSITIONS = ["Under the Gun", "Middle Position", "Hijack", "Cutoff", "Button", "Small Blind", "Big Blind"];
const ARCHETYPES = ["Nit", "Default", "LAG", "Calling Station"];

const GLOSSARY_SECTIONS = [
  {
    title: "People & Positions",
    items: [
      { term: "Hero", definition: "You! The player whose decision we are analysing." },
      { term: "Villain", definition: "Any opponent in the hand." },
      { term: "Positions", definition: "Button (BTN) acts last post-flop, Small Blind (SB) and Big Blind (BB) act first pre-flop. Early positions (UTG/MP) act before late positions (CO/BTN)." },
    ],
  },
  {
    title: "Board & Hand Notation",
    items: [
      { term: "Community Cards", definition: "Cards dealt face up that everyone can combine with their own hole cards." },
      { term: "Hole Cards", definition: "Your private two cards." },
      { term: "Combo Codes", definition: "Two-character codes like Ah (Ace of hearts) or Kd (King of diamonds). A five-card combo is listed as five of these codes." },
    ],
  },
  {
    title: "Made Hands",
    items: [
      { term: "High Card", definition: "No pair. Your strongest single card plays." },
      { term: "Pair / Two Pair", definition: "Two (or two separate) matching ranks." },
      { term: "Three of a Kind / Trips", definition: "Three cards of the same rank." },
      { term: "Straight", definition: "Five cards in rank order (e.g. 5-6-7-8-9)." },
      { term: "Flush", definition: "Five cards of the same suit." },
      { term: "Full House", definition: "Three of a kind plus a pair." },
      { term: "Quads / Straight Flush", definition: "Extremely strong hands that are very rare." },
    ],
  },
  {
    title: "Math Concepts",
    items: [
      { term: "Pot Odds", definition: "The price you are offered: call amount ÷ (pot + bet + call)." },
      { term: "Equity", definition: "How often your hand (or draw) will win at showdown." },
      { term: "Expected Value (EV)", definition: "Average profit or loss of a play over the long run." },
      { term: "Fold Equity", definition: "How often your bet will make opponents fold." },
      { term: "Rule of 2 & 4", definition: "Quick way to estimate draw equity (outs × 4 on flop, outs × 2 on turn)." },
      { term: "Required Equity", definition: "The minimum equity needed to justify a call: call amount ÷ (pot + bet + call)." },
      { term: "Implied Odds", definition: "Extra money you expect to win on later streets, making a current call worthwhile." },
    ],
  },
  {
    title: "Villain Archetypes",
    items: [
      { term: "Nit (Tight)", definition: "Plays only top 10–12% of hands, rarely bluffs, and respects big bets." },
      { term: "Default (Solid)", definition: "Balanced opponent who mixes value bets and bluffs based on position." },
      { term: "LAG (Loose Aggressive)", definition: "Raises and calls preflop with a wide range, often applying multi-street pressure." },
      { term: "Calling Station", definition: "Calls too often with weak pairs and draws, making bluffing less effective." },
    ],
  },
  {
    title: "Key Math Terms",
    items: [
      { term: "Outs", definition: "Cards that will improve you to the winning hand if they appear." },
      { term: "Range", definition: "All the different hand combinations an opponent could realistically hold." },
      { term: "Equity", definition: "Your share of the pot if the hand were played out repeatedly." },
      { term: "Pot Odds", definition: "Comparison of the call cost to the total pot after you call." },
      { term: "Implied Odds", definition: "Extra money you expect to win later if you hit your draw." },
    ],
  },
];

export function generateScenario() {
  const template = SCENARIO_TEMPLATES[getRandomInt(0, SCENARIO_TEMPLATES.length - 1)];
  const numOpponents = getRandomInt(1, 5);
  const potSize = getRandomInt(25, 150);
  const effectiveStack = getRandomInt(potSize + 40, potSize + 250);

  return {
    numOpponents,
    potSize,
    effectiveStack,
    opponentAction: template.description,
    amountToCall: template.amountToCall,
    betSize: template.betSize,
    actionType: template.actionType,
    opponentArchetype: ARCHETYPES[getRandomInt(0, ARCHETYPES.length - 1)],
    opponentPosition: OPPONENT_POSITIONS[getRandomInt(0, OPPONENT_POSITIONS.length - 1)],
    heroPosition: HERO_POSITIONS[getRandomInt(0, HERO_POSITIONS.length - 1)],
  };
}

const PREMIUM_HANDS = new Set(["Full House", "Flush"]);
const STRONG_HANDS = new Set(["Straight", "Three of a Kind", "Two Pair"]);
const WEAK_HANDS = new Set(["High Card"]);

export function getCorrectDecision(hand, scenario, playerHand = []) {
  if (!hand || !scenario || !hand.handName) {
    return {
      move: "Call",
      reason: "Without enough information, calling keeps the pot manageable.",
    };
  }

  const action = scenario.opponentAction?.toLowerCase() ?? "";
  const manyPlayers = scenario.numOpponents >= 3;
  const largeBet =
    action.includes("all in") || action.includes("full pot") || action.includes("shove");
  const smallBet =
    action.includes("half pot") || action.includes("checks") || action.includes("limp");
  const hasDraw = Boolean(hand.drawName);
  const drawIsFlush = hand.drawName?.includes("Flush");
  const drawIsStraight = hand.drawName?.includes("Straight");
  const holeValues = playerHand
    .map(getCardValue)
    .filter(Boolean)
    .sort((a, b) => b - a);
  const topHoleValue = holeValues[0] ?? 0;
  const premiumKicker = topHoleValue >= CARD_VALUE_MAP.ACE;
  const strongKicker = topHoleValue >= CARD_VALUE_MAP.KING;

  if (PREMIUM_HANDS.has(hand.handName)) {
    return {
      move: "Raise",
      reason: "Premium made hands should press for value.",
    };
  }

  if (STRONG_HANDS.has(hand.handName)) {
    if (largeBet) {
      return {
        move: "Call",
        reason: "A strong hand can withstand pressure but pot control protects you.",
      };
    }
    return {
      move: "Raise",
      reason: "Strong holdings should build the pot against weaker ranges.",
    };
  }

  if (hand.handName === "Pair") {
    if (largeBet) {
      if (premiumKicker || (strongKicker && scenario.numOpponents <= 2)) {
        return {
          move: "Call",
          reason: "Top pair with strong kicker can withstand pressure.",
        };
      }
      return {
        move: "Fold",
        reason: "A single pair rarely holds against heavy aggression without a strong kicker.",
      };
    }
    return {
      move: premiumKicker ? "Raise" : "Call",
      reason: premiumKicker
        ? "Top pair with ace kicker should build the pot."
        : "A small bet can be called to see the next card with a marginal hand.",
    };
  }

  if (hasDraw) {
    if (drawIsFlush && manyPlayers) {
      return {
        move: "Call",
        reason: "Flush draws gain value multi-way thanks to better pot odds.",
      };
    }
    if ((drawIsFlush || drawIsStraight) && !largeBet) {
      return {
        move: "Call",
        reason: "Reasonably priced bets justify chasing your draw.",
      };
    }
    return {
      move: "Fold",
      reason: "When the price is steep, folding draws preserves your stack.",
    };
  }

  if (WEAK_HANDS.has(hand.handName)) {
    if (hand.handName === "High Card") {
      if (premiumKicker && !largeBet) {
        return {
          move: "Call",
          reason: "Ace high can still be ahead when the pressure is modest.",
        };
      }
      if (strongKicker && smallBet) {
        return {
          move: "Call",
          reason: "High cards like kings can justify calling small bets.",
        };
      }
    }
    return {
      move: "Fold",
      reason: "Weak holdings should usually be folded when facing action.",
    };
  }

  if (smallBet) {
    return {
      move: "Call",
      reason: "Inconsequential bets can be called with moderate strength.",
    };
  }

  return {
    move: "Fold",
    reason: "Without a made hand or draw, folding avoids marginal spots.",
  };
}

export default function App() {
  const [deckId, setDeckId] = useState("");
  const [playerHand, setPlayerHand] = useState([]);
  const [communityCards, setCommunityCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [roundIndex, setRoundIndex] = useState(0);
  const [currentScenario, setCurrentScenario] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [strategyExplanation, setStrategyExplanation] = useState("");
  const [mathBreakdown, setMathBreakdown] = useState(null);
  const [showMathDetails, setShowMathDetails] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [awaitingAdvance, setAwaitingAdvance] = useState(false);

  const visibleCount = useMemo(
    () => CARDS_VISIBLE_BY_ROUND[roundIndex] ?? 0,
    [roundIndex]
  );

  const visibleCommunityCards = useMemo(
    () => communityCards.slice(0, visibleCount),
    [communityCards, visibleCount]
  );

  const heroCardCodes = useMemo(
    () => playerHand.map((card) => card?.code).filter(Boolean),
    [playerHand]
  );

  const fullBoardCards = useMemo(
    () => communityCards.slice(0, 5),
    [communityCards]
  );

  const boardDisplaySlots = useMemo(() => {
    const slots = [...fullBoardCards];
    while (slots.length < 5) {
      slots.push(null);
    }
    return slots;
  }, [fullBoardCards]);

  const renderOutsDetail = (detail, keyPrefix) => {
    if (
      !detail ||
      typeof detail !== "object" ||
      !Array.isArray(detail.cards) ||
      detail.cards.length === 0 ||
      detail.total <= 0
    ) {
      return (
        <p className="app__outs-empty" key={`${keyPrefix}-outs-empty`}>
          No clear outs identified beyond overcards.
        </p>
      );
    }

    const categories = [
      { key: "flush", label: "Flush outs" },
      { key: "straight", label: "Straight outs" },
      { key: "rank", label: "Pair / Set outs" },
    ];

    return categories
      .map(({ key, label }) => {
        const cards = detail.categories?.[key] || [];
        if (!cards.length) return null;
        return (
          <div className="app__outs-category" key={`${keyPrefix}-${key}`}>
            <span className="app__outs-category-label">{label}</span>
            <div className="app__outs-chips">
              {cards.map((code) => (
                <span className="app__out-chip" key={`${keyPrefix}-${key}-${code}`}>
                  {code}
                </span>
              ))}
            </div>
          </div>
        );
      })
      .concat([
        <div className="app__outs-category app__outs-category--all" key={`${keyPrefix}-all`}>
          <span className="app__outs-category-label">All outs ({detail.total})</span>
          <div className="app__outs-chips">
            {detail.cards.map((code) => (
              <span className="app__out-chip app__out-chip--all" key={`${keyPrefix}-all-${code}`}>
                {code}
              </span>
            ))}
          </div>
        </div>,
      ])
      .filter(Boolean);
  };

  const renderEvDetails = (details, keyPrefix) => {
    if (!Array.isArray(details) || details.length === 0) {
      return (
        <p className="app__ev-detail-empty" key={`${keyPrefix}-ev-empty`}>
          EV breakdown unavailable for this scenario.
        </p>
      );
    }

    return details.map((detail, index) => {
      const components = Array.isArray(detail.components) ? detail.components : [];
      return (
        <div className="app__ev-detail" key={`${keyPrefix}-detail-${detail.action}-${index}`}>
          <div className="app__ev-detail-header">
            <span className="app__ev-detail-action">{detail.action}</span>
            <span className="app__ev-detail-value">
              {detail.ev >= 0 ? "+" : "-"}${formatDollars(Math.abs(detail.ev))}
            </span>
          </div>
          <p className="app__ev-detail-explanation">{detail.explanation}</p>
          {components.length > 0 && (
            <ul className="app__ev-detail-list">
              {components.map((item, compIndex) => {
                const key = `${keyPrefix}-${detail.action}-${index}-${compIndex}`;
                const type = item.type || "raw";
                let displayValue = item.value;
                if (type === "percent") {
                  displayValue = `${formatPercent(item.value)}%`;
                } else if (type === "dollar") {
                  displayValue = `$${formatDollars(item.value)}`;
                }
                return (
                  <li className="app__ev-detail-item" key={key}>
                    <span className="app__ev-detail-label">{item.label}:</span>{" "}
                    <span className="app__ev-detail-number">{displayValue}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {detail.note && <p className="app__ev-detail-note">{detail.note}</p>}
        </div>
      );
    });
  };

  const nextStreetRaw = ROUND_STATES[Math.min(roundIndex + 1, ROUND_STATES.length - 1)];
  const nextStreetLabel = nextStreetRaw.charAt(0).toUpperCase() + nextStreetRaw.slice(1);

  const currentHand = useMemo(
    () => analyzeHand(playerHand, visibleCommunityCards),
    [playerHand, visibleCommunityCards]
  );

  function buildAnalysisScenario(userActionLabel) {
    if (!currentScenario || heroCardCodes.length < 2) {
      return null;
    }

    const amountToCallValue = Number(currentScenario.amountToCall ?? 0);
    const betSizeValue =
      currentScenario.betSize !== undefined
        ? Number(currentScenario.betSize)
        : amountToCallValue;

    const visibleBoardCodes = visibleCommunityCards
      .map((card) => card?.code)
      .filter(Boolean);

    const streetIndex = Math.min(roundIndex, ROUND_STATES.length - 1);
    const street = ROUND_STATES[streetIndex];

    const actionHistory = [
      {
        actor: "opponent",
        street,
        type: currentScenario.actionType || (amountToCallValue > 0 ? "bet" : "check"),
        amount: betSizeValue,
      },
    ];

    return {
      gameState: {
        potSize: Number(currentScenario.potSize ?? 0),
        effectiveStack: Number(currentScenario.effectiveStack ?? 0),
        communityCards: visibleBoardCodes,
        numPlayers: Math.max(2, Number(currentScenario.numOpponents ?? 1) + 1),
      },
      heroState: {
        holeCards: heroCardCodes,
        position: currentScenario.heroPosition || "Button",
      },
      opponentProfile: {
        position: currentScenario.opponentPosition || "Middle Position",
        archetype: currentScenario.opponentArchetype || "Default",
      },
      actionHistory,
      currentDecision: {
        amountToCall: amountToCallValue,
        betSize: betSizeValue,
      },
      metadata: {
        userAction: userActionLabel,
      },
    };
  }

  function advanceToNextStreet() {
    if (roundIndex >= ROUND_STATES.length - 1) {
      setAwaitingAdvance(false);
      return;
    }

    setRoundIndex((prev) => Math.min(prev + 1, ROUND_STATES.length - 1));
    setCurrentScenario(generateScenario());
    setFeedback(null);
    setStrategyExplanation("");
    setMathBreakdown(null);
    setShowMathDetails(false);
    setAwaitingAdvance(false);
  }

  function handleDecision(userMove) {
    const correctMove = getCorrectDecision(currentHand, currentScenario, playerHand);
    if (!correctMove) {
      setFeedback({
        type: "incorrect",
        message: "Unable to evaluate the situation. Try dealing a new hand.",
      });
      setStrategyExplanation("");
      setMathBreakdown(null);
      setShowMathDetails(false);
      setShowResults(true);
      setAwaitingAdvance(false);
      return;
    }

    const rawMove = (userMove || "").trim().toUpperCase();
    const amountToCallValue = Number(currentScenario?.amountToCall ?? 0);
    const potSizeValue = Number(currentScenario?.potSize ?? 0);
    const opponentBetValue = Number(
      currentScenario?.betSize !== undefined ? currentScenario.betSize : amountToCallValue
    );
    const totalPotIfCall = potSizeValue + opponentBetValue + amountToCallValue;
    const requiredEquityValue = totalPotIfCall > 0 ? (amountToCallValue / totalPotIfCall) * 100 : 0;
    const potOddsValue = totalPotIfCall > 0 ? (amountToCallValue / totalPotIfCall) * 100 : 0;

    const outsCount = estimateOuts(playerHand, visibleCommunityCards);
    const boardCodes = visibleCommunityCards.map((card) => card?.code).filter(Boolean);
    const fallbackOutsDetail =
      boardCodes.length > 0
        ? getOutsDetail(heroCardCodes, boardCodes)
        : {
            total: outsCount,
            cards: [],
            categories: {
              flush: [],
              straight: [],
              rank: [],
            },
          };
    const ruleEstimate = computeHeuristicEquity(playerHand, visibleCommunityCards);
    const impliedOddsNeeded = ruleEstimate > 0
      ? Math.max(0, amountToCallValue / Math.max(ruleEstimate / 100, 0.0001) - totalPotIfCall)
      : 0;
    const isPreflop = visibleCommunityCards.length === 0;

    const fallbackMetrics = {
      optimalAction: "",
      optimalEV: 0,
      alternatives: [],
      requiredEquity: requiredEquityValue,
      heroEquity: ruleEstimate,
      foldEquity: 0,
      ruleOf4Equity: ruleEstimate,
      outs: outsCount,
      outsDetail: fallbackOutsDetail,
      potOdds: potOddsValue,
      evDetails: [],
      potSize: potSizeValue,
      opponentBet: opponentBetValue,
      amountToCall: amountToCallValue,
      totalPotIfCall,
      impliedOdds: impliedOddsNeeded,
    };

    const fallbackExplanation = isPreflop
      ? `Quick check: your starting hand rates around ${formatPercent(ruleEstimate)}% equity before the flop. Pot odds require ${formatPercent(requiredEquityValue)}% to continue.`
      : `Quick check: your draw has about ${formatPercent(ruleEstimate)}% equity from roughly ${outsCount} outs. Pot odds require ${formatPercent(requiredEquityValue)}% to call.`;

    const normalizeAction = () => {
      if (rawMove === "CHECK/CALL") {
        return amountToCallValue > 0 ? "Call" : "Check";
      }
      if (!rawMove) return "Fold";
      return rawMove.charAt(0) + rawMove.slice(1).toLowerCase();
    };

    const normalizedAction = normalizeAction();
    const userMoveUpper = normalizedAction.toUpperCase();
    const correctMoveUpper = (correctMove.move || "").toUpperCase();

    const displayCorrectMove =
      correctMoveUpper === "CALL"
        ? amountToCallValue > 0
          ? "Check/Call"
          : "Check"
        : correctMoveUpper.charAt(0) + correctMoveUpper.slice(1).toLowerCase();

    if (userMoveUpper === correctMoveUpper) {
      setFeedback({
        type: "correct",
        message: `Correct! ${correctMove.reason}`,
      });
    } else {
      setFeedback({
        type: "incorrect",
        message: `Incorrect. The best move is to ${displayCorrectMove} because ${correctMove.reason}`,
      });
    }

    let metricsToUse = fallbackMetrics;

    try {
      const scenarioPayload = buildAnalysisScenario(normalizedAction);
      if (scenarioPayload) {
        const analysis = analyzeScenario(scenarioPayload, normalizedAction);
        if (typeof analysis === "string") {
          setStrategyExplanation(analysis);
        } else if (analysis && typeof analysis === "object") {
          if (typeof analysis.formatted === "string") {
            setStrategyExplanation(analysis.formatted);
          } else {
            setStrategyExplanation(fallbackExplanation);
          }
          if (analysis.metrics) {
            metricsToUse = { ...analysis.metrics };
          }
        } else {
          setStrategyExplanation(fallbackExplanation);
        }
      } else {
        setStrategyExplanation(fallbackExplanation);
      }
    } catch (analysisError) {
      // eslint-disable-next-line no-console
      console.warn("EV analysis unavailable:", analysisError);
      setStrategyExplanation("EV analysis failed.");
    }

    if (!metricsToUse.outsDetail) {
      metricsToUse = { ...metricsToUse, outsDetail: fallbackOutsDetail };
    }
    if (!metricsToUse.evDetails) {
      metricsToUse = { ...metricsToUse, evDetails: [] };
    }
    if (metricsToUse.potOdds === undefined || metricsToUse.potOdds === null) {
      metricsToUse = { ...metricsToUse, potOdds: potOddsValue };
    }

    setMathBreakdown(metricsToUse);
    setShowMathDetails(true);

    if (userMoveUpper === "FOLD") {
      setShowResults(true);
      setAwaitingAdvance(false);
      return;
    }

    if (roundIndex < ROUND_STATES.length - 1) {
      setAwaitingAdvance(true);
      return;
    }

    setShowResults(true);
    setAwaitingAdvance(false);
  }

  async function getNewHand() {
    setLoading(true);
    setFeedback(null);
    setError("");
    setRoundIndex(0);
    setShowResults(false);
    setStrategyExplanation("");
    setMathBreakdown(null);
    setShowMathDetails(false);
    setAwaitingAdvance(false);

    try {
      const shuffleRes = await fetch(`${API_BASE_URL}/new/shuffle/?deck_count=1`);
      const shuffleData = await shuffleRes.json();
      if (!shuffleRes.ok || !shuffleData?.deck_id) {
        throw new Error("Unable to shuffle deck for new hand.");
      }

      const freshDeckId = shuffleData.deck_id;
      setDeckId(freshDeckId);

      const drawRes = await fetch(`${API_BASE_URL}/${freshDeckId}/draw/?count=7`);
      const drawData = await drawRes.json();
      const cards = drawData?.cards ?? [];
      if (!drawRes.ok || cards.length < 7) {
        throw new Error("Unable to draw cards for the next hand.");
      }

      setPlayerHand(cards.slice(0, 2));
      setCommunityCards(cards.slice(2, 7));
      setCurrentScenario(generateScenario());
    } catch (e) {
      setError(e?.message ?? "Failed to load the next hand.");
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    async function loadCards() {
      setLoading(true);
      setError("");
      try {
        const shuffleRes = await fetch(`${API_BASE_URL}/new/shuffle/?deck_count=1`);
        const shuffleData = await shuffleRes.json();
        if (!shuffleRes.ok || !shuffleData?.deck_id) {
          throw new Error("Could not shuffle a new deck.");
        }

        setDeckId(shuffleData.deck_id);

        const drawRes = await fetch(`${API_BASE_URL}/${shuffleData.deck_id}/draw/?count=7`);
        const drawData = await drawRes.json();
        const cards = drawData?.cards ?? [];
        if (!drawRes.ok || cards.length < 7) {
          throw new Error("Unable to draw enough cards.");
        }

        setPlayerHand(cards.slice(0, 2));
        setCommunityCards(cards.slice(2, 7));
        setRoundIndex(0);
        setCurrentScenario(generateScenario());
        setFeedback(null);
        setShowResults(false);
        setStrategyExplanation("");
        setMathBreakdown(null);
        setShowMathDetails(false);
        setAwaitingAdvance(false);
      } catch (e) {
        setError(e?.message ?? "Something went wrong while loading cards.");
        setStrategyExplanation("");
        setMathBreakdown(null);
        setShowMathDetails(false);
        setAwaitingAdvance(false);
      } finally {
        setLoading(false);
      }
    }

    loadCards();
  }, []);


  return (
    <div className="app">
      <div className="app__container">
        <h1 className="app__title">Poker Table</h1>
        <p className="app__subtitle">Deck ID: {deckId || "Loading..."}</p>
        <div className="app__help-row">
          <button
            type="button"
            className="app__help-button"
            onClick={() => setShowGlossary(true)}
          >
            Poker Glossary & Math Help
          </button>
        </div>

        {loading && <p className="app__status">Loading cards...</p>}
        {error && <p className="app__status app__status--error">{error}</p>}
        {!loading && !error && (
          <>
            <section className="app__section">
              <h2 className="app__section-title">Your Hand</h2>
              <div className="app__card-row">
                {playerHand.map((card) => (
                  <img
                    key={card.code}
                    src={card.image}
                    alt={`${card.value} of ${card.suit}`}
                    className="app__card-image"
                  />
                ))}
              </div>
            </section>

            <section className="app__section">
              <h2 className="app__section-title">Community Cards</h2>
              <div className="app__card-row">
                {boardDisplaySlots.map((card, index) =>
                  card && index < visibleCount ? (
                    <img
                      key={card.code}
                      src={card.image}
                      alt={`${card.value} of ${card.suit}`}
                      className="app__card-image"
                    />
                  ) : (
                    <img
                      key={`placeholder-${index}`}
                      src={CARD_BACK_IMAGE}
                      alt="Card back"
                      className="app__card-image app__card-image--back"
                    />
                  )
                )}
              </div>
            </section>

            {showResults ? (
              <div className="app__results-screen">
                <h3 className="app__results-title">Round Summary</h3>
                <h2 className="app__hand-summary">
                  You have: {currentHand.handName}
                </h2>
                {currentHand.drawName && (
                  <p className="app__hand-draw">Draw: {currentHand.drawName}</p>
                )}
                {currentHand.bestCards?.length === 5 && (
                  <p className="app__best-hand">
                    Best 5-card combo:
                    {currentHand.bestCards.map((code) => (
                      <span
                        key={`best-${code}`}
                        className={`app__best-card${heroCardCodes.includes(code) ? " app__best-card--hero" : ""}`}
                      >
                        {code}
                      </span>
                    ))}
                  </p>
                )}

                {currentScenario && (
                  <div className="app__scenario app__scenario--results">
                    <h4 className="app__scenario-title">Scenario Recap</h4>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Players in hand:</span>{" "}
                      {currentScenario.numOpponents}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Current pot:</span> $
                      {formatDollars(currentScenario.potSize)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Facing bet:</span> $
                      {formatDollars(currentScenario.amountToCall)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Effective stack:</span> $
                      {formatDollars(currentScenario.effectiveStack)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Action:</span>{" "}
                      {currentScenario.opponentAction}
                    </p>
                    <p className="app__scenario-meta">
                      Villain archetype: {currentScenario.opponentArchetype || "Default"} • Villain position: {currentScenario.opponentPosition || "Middle Position"} • Hero position: {currentScenario.heroPosition || "Button"}
                    </p>
                  </div>
                )}

                {feedback && !strategyExplanation && (
                  <div
                    className={`app__feedback ${
                      feedback.type === "correct" ? "bg-green-500" : "bg-red-500"
                    }`}
                  >
                    {feedback.message}
                  </div>
                )}

                {strategyExplanation && renderStrategyExplanation(strategyExplanation)}

                {mathBreakdown && (
                  <div className="app__math-controls">
                    <button
                      type="button"
                      className="app__math-button"
                      onClick={() => setShowMathDetails((prev) => !prev)}
                    >
                      {showMathDetails ? "Hide Math Details" : "Show Math Details"}
                    </button>
                  </div>
                )}

                {showMathDetails && mathBreakdown && (
                  <div className="app__math-details">
                    <p className="app__math-note">
                      Formula recap: EV = (win% × amount won) − (lose% × amount lost). Required equity is call price ÷ total pot after you call. Quick equity tip: count your “outs” and multiply by 4 on the flop (or 2 on the turn) to estimate your chance of hitting by the river.
                    </p>
                    <div className="app__math-grid">
                      <div>
                        <span className="app__math-label">Required Equity</span>
                        <span>{formatPercent(mathBreakdown.requiredEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Pot Odds</span>
                        <span>{formatPercent(mathBreakdown.potOdds)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Hero Equity</span>
                        <span>{formatPercent(mathBreakdown.heroEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Fold Equity</span>
                        <span>{formatPercent(mathBreakdown.foldEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Rule-of-4 Estimate</span>
                        <span>{formatPercent(mathBreakdown.ruleOf4Equity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Outs Count</span>
                        <span>{mathBreakdown.outs}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Pot Size</span>
                        <span>${formatDollars(mathBreakdown.potSize)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Facing Bet</span>
                        <span>${formatDollars(mathBreakdown.opponentBet)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Amount to Call</span>
                        <span>${formatDollars(mathBreakdown.amountToCall)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Total Pot if Call</span>
                        <span>${formatDollars(mathBreakdown.totalPotIfCall)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Implied Odds Needed</span>
                        <span>${formatDollars(mathBreakdown.impliedOdds)}</span>
                      </div>
                    </div>
                    <div className="app__math-evlist">
                      <h4>EV by Action</h4>
                      <ul>
                        <li>
                          <strong>{mathBreakdown.optimalAction}</strong>: {mathBreakdown.optimalEV >= 0 ? "+" : "-"}${formatDollars(Math.abs(mathBreakdown.optimalEV))}
                        </li>
                        {(mathBreakdown.alternatives ?? []).map((alt) => (
                          <li key={`alt-${alt.action}`}>
                            {alt.action}: {alt.ev >= 0 ? "+" : "-"}${formatDollars(Math.abs(alt.ev))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="app__ev-breakdown">
                      <h4 className="app__ev-breakdown-title">Formula Breakdown</h4>
                      <div className="app__ev-breakdown-body">
                        {renderEvDetails(mathBreakdown.evDetails, "results")}
                      </div>
                    </div>
                    <div className="app__outs-wrapper">
                      <h4 className="app__outs-title">Out Cards</h4>
                      <div className="app__outs-section">
                        {renderOutsDetail(mathBreakdown.outsDetail, "results")}
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="app__next-button"
                  onClick={getNewHand}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Next Hand"}
                </button>
              </div>
            ) : (
              <>
                {currentScenario && (
                  <div className="app__scenario">
                    <h3 className="app__scenario-title">Scenario</h3>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Players in hand:</span>{" "}
                      {currentScenario.numOpponents}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Current pot:</span> $
                      {formatDollars(currentScenario.potSize)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Facing bet:</span> $
                      {formatDollars(currentScenario.amountToCall)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Effective stack:</span> $
                      {formatDollars(currentScenario.effectiveStack)}
                    </p>
                    <p className="app__scenario-item">
                      <span className="app__scenario-label">Action:</span>{" "}
                      {currentScenario.opponentAction}
                    </p>
                    <p className="app__scenario-meta">
                      Villain archetype: {currentScenario.opponentArchetype || "Default"} • Villain position: {currentScenario.opponentPosition || "Middle Position"} • Hero position: {currentScenario.heroPosition || "Button"}
                    </p>
                  </div>
                )}

                <h2 className="app__hand-summary">
                  You have: {currentHand.handName}
                </h2>
                {currentHand.drawName && (
                  <p className="app__hand-draw">Draw: {currentHand.drawName}</p>
                )}

                {currentHand.bestCards?.length === 5 && (
                  <p className="app__best-hand">
                    Best 5-card combo:
                    {currentHand.bestCards.map((code) => (
                      <span
                        key={`best-live-${code}`}
                        className={`app__best-card${heroCardCodes.includes(code) ? " app__best-card--hero" : ""}`}
                      >
                        {code}
                      </span>
                    ))}
                  </p>
                )}

                {!showResults && feedback && !strategyExplanation && (
                  <div
                    className={`app__feedback ${
                      feedback.type === "correct" ? "bg-green-500" : "bg-red-500"
                    }`}
                  >
                    {feedback.message}
                  </div>
                )}

                {currentScenario && !showResults && (
                  <div className="app__decision-row">
                    {awaitingAdvance ? (
                      <button
                        type="button"
                        className="app__next-button"
                        onClick={advanceToNextStreet}
                      >
                        Continue to {nextStreetLabel}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="app__decision-button app__decision-button--fold"
                          onClick={() => handleDecision("Fold")}
                        >
                          Fold
                        </button>
                        <button
                          type="button"
                          className="app__decision-button app__decision-button--call"
                          onClick={() => handleDecision(
                            Number(currentScenario?.amountToCall ?? 0) > 0 ? "Call" : "Check"
                          )}
                        >
                          {Number(currentScenario?.amountToCall ?? 0) > 0 ? "Call" : "Check"}
                        </button>
                        <button
                          type="button"
                          className="app__decision-button app__decision-button--raise"
                          onClick={() => handleDecision("Raise")}
                        >
                          Raise
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!showResults && strategyExplanation && renderStrategyExplanation(strategyExplanation)}

                {!showResults && mathBreakdown && (
                  <div className="app__math-controls">
                    <button
                      type="button"
                      className="app__math-button"
                      onClick={() => setShowMathDetails((prev) => !prev)}
                    >
                      {showMathDetails ? "Hide Math Details" : "Show Math Details"}
                    </button>
                  </div>
                )}

                {!showResults && showMathDetails && mathBreakdown && (
                  <div className="app__math-details">
                    <p className="app__math-note">
                      Formula recap: EV = (win% × amount won) − (lose% × amount lost). Required equity is call price ÷ total pot after you call. Quick equity tip: count your “outs” and multiply by 4 on the flop (or 2 on the turn) to estimate your chance of hitting by the river.
                    </p>
                    <div className="app__math-grid">
                      <div>
                        <span className="app__math-label">Required Equity</span>
                        <span>{formatPercent(mathBreakdown.requiredEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Pot Odds</span>
                        <span>{formatPercent(mathBreakdown.potOdds)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Hero Equity</span>
                        <span>{formatPercent(mathBreakdown.heroEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Fold Equity</span>
                        <span>{formatPercent(mathBreakdown.foldEquity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Rule-of-4 Estimate</span>
                        <span>{formatPercent(mathBreakdown.ruleOf4Equity)}%</span>
                      </div>
                      <div>
                        <span className="app__math-label">Outs Count</span>
                        <span>{mathBreakdown.outs}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Pot Size</span>
                        <span>${formatDollars(mathBreakdown.potSize)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Facing Bet</span>
                        <span>${formatDollars(mathBreakdown.opponentBet)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Amount to Call</span>
                        <span>${formatDollars(mathBreakdown.amountToCall)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Total Pot if Call</span>
                        <span>${formatDollars(mathBreakdown.totalPotIfCall)}</span>
                      </div>
                      <div>
                        <span className="app__math-label">Implied Odds Needed</span>
                        <span>${formatDollars(mathBreakdown.impliedOdds)}</span>
                      </div>
                    </div>
                    <div className="app__math-evlist">
                      <h4>EV by Action</h4>
                      <ul>
                        <li>
                          <strong>{mathBreakdown.optimalAction}</strong>: {mathBreakdown.optimalEV >= 0 ? "+" : "-"}${formatDollars(Math.abs(mathBreakdown.optimalEV))}
                        </li>
                        {(mathBreakdown.alternatives ?? []).map((alt) => (
                          <li key={`live-alt-${alt.action}`}>
                            {alt.action}: {alt.ev >= 0 ? "+" : "-"}${formatDollars(Math.abs(alt.ev))}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="app__ev-breakdown">
                      <h4 className="app__ev-breakdown-title">Formula Breakdown</h4>
                      <div className="app__ev-breakdown-body">
                        {renderEvDetails(mathBreakdown.evDetails, "live")}
                      </div>
                    </div>
                    <div className="app__outs-wrapper">
                      <h4 className="app__outs-title">Out Cards</h4>
                      <div className="app__outs-section">
                        {renderOutsDetail(mathBreakdown.outsDetail, "live")}
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
          </>
        )}
      </div>
      {showGlossary && (
        <div
          className="app__modal"
          role="dialog"
          aria-modal="true"
          aria-label="Poker glossary"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowGlossary(false);
            }
          }}
        >
          <div className="app__modal-content">
            <div className="app__modal-header">
              <h2 className="app__modal-title">Poker Glossary & Quick Reference</h2>
              <button
                type="button"
                className="app__modal-close"
                onClick={() => setShowGlossary(false)}
                aria-label="Close glossary"
              >
                ×
              </button>
            </div>
            <div className="app__modal-body">
              {GLOSSARY_SECTIONS.map((section) => (
                <section key={section.title} className="app__glossary-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.items.map((entry) => (
                      <li key={`${section.title}-${entry.term}`}>
                        <strong>{entry.term}:</strong> {entry.definition}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
