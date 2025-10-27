# Poker Decision Trainer

## Problem Statement
As a developing poker player, I often struggled to translate abstract concepts like pot odds, equity, and outs into real-time decisions. Memorizing charts wasn’t enough; I needed a safe space to practice reading the board, estimating equity, and making disciplined choices without risking money. This project exists to turn those theory reps into muscle memory.

## Solution
Poker Decision Trainer simulates hands against randomized opponents, reveals community cards street by street, and presents realistic betting scenarios. For every choice (Fold, Call/Check, Raise) it instantly returns:
- Whether the move matched optimal play.
- A math-first EV breakdown showing the exact formula.
- The specific outs (cards) that improve the hand and why they matter.
- Narrative strategy guidance tailored to the situation.

By blending qualitative advice with quantitative transparency, the app helps users internalize when pot odds justify a call, when fold equity makes aggression profitable, and when to quietly let go.

## API Used
- **API Name**: Deck of Cards API  
- **API Documentation**: https://deckofcardsapi.com/  
- **How it's used**: Each new hand requests a freshly shuffled deck and draws seven cards (two hole cards, five community cards). The live endpoints let the app mimic real dealing without maintaining its own card engine; we simply request JSON containing card codes, suits, and image URLs.

## Features
- Instant EV math with transparent formulas for fold, call/check, and raise decisions.
- Outs visualizer that groups exact cards by draw type (flush, straight, rank-based improvements).
- Strategy explanations and glossary to reinforce key poker concepts while practicing.

## Setup Instructions
1. Clone this repository
2. Run `npm install`
3. *(No API key required—the Deck of Cards API is public)*
4. Run `npm run dev`
5. Open http://localhost:5173 (default Vite dev server)  
   > If you prefer `npm start` and port 3000, adjust the Vite config or use `npm run preview`.

## AI Assistance
I used OpenAI Codex (ChatGPT) to help with:
- **EV breakdown design**: Learned how to articulate pot odds and EV formulas clearly for each action.
- **Outs enumeration**: Translated poker draw logic into explicit card lists and categorized them flexibly.
- **UI polish**: Iterated on component layout and microcopy to keep the math approachable and visually consistent.

## Screenshots
![Gameplay Screenshot](src/assets/Screenshot 2025-10-27 at 5.00.00 PM.png?raw=true)
![Gameplay Screenshot](src/assets/Screenshot 2025-10-27 at 5.00.24 PM.png?raw=true)
![Gameplay Screenshot](src/assets/Screenshot 2025-10-27 at 5.00.33 PM.png?raw=true)
![Gameplay Screenshot](src/assets/Screenshot 2025-10-27 at 5.00.45 PM.png?raw=true)
![Gameplay Screenshot](src/assets/Screenshot 2025-10-27 at 5.00.54 PM.png?raw=true)  

## Future Improvements
- Replace heuristic equity estimates with a Monte Carlo simulator for precise odds.
- Track user progress over many hands and surface personalized leak-busting tips.
- Add configurable difficulty modes (e.g., tougher villain ranges, multi-street planning, ICM spots).
