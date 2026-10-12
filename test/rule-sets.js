// Password rule combinations whose outputs are frozen in golden-rules.json.
module.exports = [
  { length: 12 },
  { length: 16, symbols: "require" },
  { length: 10, requireDigit: true, requireUpper: true, requireLower: true },
  { length: 20, symbols: "allow", symbolChars: "-_." },
  { length: 4, symbols: "require", symbolChars: "!", requireDigit: true, requireUpper: true, requireLower: true },
  { length: 64, symbols: "allow" },
  { length: 8, requireDigit: true },
];
