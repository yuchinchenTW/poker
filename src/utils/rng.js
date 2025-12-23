function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed;
  }
  if (typeof seed === "string" && seed.trim() !== "") {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i += 1) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  return null;
}

function createRng(seed) {
  const normalized = normalizeSeed(seed);
  if (normalized === null) {
    return { random: Math.random };
  }
  return { random: mulberry32(normalized) };
}

function randomInt(rng, min, max) {
  return Math.floor(rng.random() * (max - min + 1)) + min;
}

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = {
  createRng,
  randomInt,
  shuffle,
};
