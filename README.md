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

## CLI Commands

- `fold`
- `check`
- `call`
- `bet 120`
- `raise 240`
- `allin`
- `help`
- `quit`

## Tests

```bash
npm test
```

## Structure

The engine is UI-agnostic and does not import the CLI.
