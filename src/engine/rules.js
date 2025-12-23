const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  STARTING_STACK: 1000,
  SB: 5,
  BB: 10,
  ANTE: 0,
  CHEAT_MODE: true,
  AI_ITERATIONS_PREFLOP: 1500,
  AI_ITERATIONS_FLOP: 2500,
  AI_ITERATIONS_TURN: 4000,
  AI_ITERATIONS_RIVER: 6000,
  RNG_SEED: "",
  DEBUG: false,
  ACTION_LOG_LIMIT: 10,
  SHOW_EQUITY: false,
  EQUITY_DISPLAY_ITERATIONS: 1500,
  SHOW_TABLE_EQUITY: false,
};

function parseBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return false;
  }
  return value.toLowerCase() === "true" || value === "1";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadConfig() {
  let config = { ...DEFAULTS };
  const root = path.resolve(__dirname, "..", "..");
  const configPath = process.env.CONFIG_PATH
    ? path.resolve(process.env.CONFIG_PATH)
    : path.join(root, "config.json");

  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      const fileConfig = JSON.parse(raw);
      config = { ...config, ...fileConfig };
    } catch (err) {
      // Ignore invalid config file.
    }
  }

  Object.keys(DEFAULTS).forEach((key) => {
    if (process.env[key] !== undefined) {
      if (typeof DEFAULTS[key] === "boolean") {
        config[key] = parseBool(process.env[key]);
      } else if (typeof DEFAULTS[key] === "number") {
        config[key] = parseNumber(process.env[key], DEFAULTS[key]);
      } else {
        config[key] = process.env[key];
      }
    }
  });

  return config;
}

module.exports = {
  loadConfig,
  DEFAULTS,
};
