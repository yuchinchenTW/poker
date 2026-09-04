# Texas Hold'em CLI (1 Human vs 3 AI)

Node.js CLI Texas Hold'em with a UI-agnostic engine, strong AI (Monte Carlo + opponent modeling), and a cheat channel that lets AI see the human hole cards when enabled.

## Quick Start

1) Install Node.js (v18+)
2) From this folder:

```bash
npm install
npm start
```

## Configuration

You can configure via environment variables or a single config file named `config.json` in the project root.

Supported keys (defaults shown):

```json
{
  "STARTING_STACK": 1000,
  "SB": 5,
  "BB": 10,
  "ANTE": 0,
  "CHEAT_MODE": true,
  "AI_ITERATIONS_PREFLOP": 1500,
  "AI_ITERATIONS_FLOP": 2500,
  "AI_ITERATIONS_TURN": 4000,
  "AI_ITERATIONS_RIVER": 6000,
  "RNG_SEED": "",
  "DEBUG": false,
  "SHOW_EQUITY": false,
  "EQUITY_DISPLAY_ITERATIONS": 1500,
  "SHOW_TABLE_EQUITY": false,
  "UNICODE_SUITS": true,
  "COLOR": true
}
```

Cards are displayed with suit symbols (e.g. `A♠ K♥`), hearts/diamonds in red.
Set `UNICODE_SUITS` to `false` to fall back to letters (`As Kh`) if your
terminal cannot render the symbols; `COLOR` false disables the red tint.

Environment variables with the same names override the file. For deterministic runs, set `RNG_SEED`.
If `config.json` cannot be parsed a warning is printed and defaults are used.

Performance: the 7-card evaluator is a direct rank/suit count (about 1M
evaluations per second), so 5000 Monte Carlo iterations per AI decision cost
roughly 50 ms and the full-table equity display (`SHOW_TABLE_EQUITY`) about
100 ms per prompt. Raise the iteration counts if you want tighter estimates.

## Playing

When it is your turn the legal actions are shown as a numbered menu:

```
Choose an action:
  1) Fold
  2) Call 10000
  3) Raise to (20000-1000000)
  4) All-in (1000000)
  q) Quit
```

Type the number and press Enter. Choosing Bet or Raise opens a sizing menu
(min, 1/3 pot, 1/2 pot, 3/4 pot, pot, all-in, or a custom amount; `0` goes
back). Typed commands still work as a shortcut:

- `fold`, `check`, `call`, `allin`
- `bet 120`, `raise 240` (or `bet` / `raise` alone to open the sizing menu)
- `help`, `quit`

## Tests

```bash
npm test
```

## AI

Each AI decision runs a Monte Carlo equity estimate (against the human's real
cards when CHEAT_MODE is on, random hands otherwise), then scores fold / call /
bet sizes / all-in by expected value and picks stochastically among the
near-best options.

Opponent modelling is per seat: a shared registry tracks VPIP, PFR,
aggression and fold-to-raise for every player at the table (human and AIs
alike, since betting actions are public). When an AI considers a bet it
multiplies each remaining opponent's own fold probability, adjusted for how
often that player has already bet or raised this hand and for how tight they
are, so a bluff is worth more into a player who folds a lot and a tight
player's raise discounts the AI's equity more than a loose player's.

## Structure

The engine is UI-agnostic and does not import the CLI.
