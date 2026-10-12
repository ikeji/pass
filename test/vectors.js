// Inputs whose generated passwords must never change.
// Expected outputs live in golden.json, recorded from the original (pre-refactoring) app.
module.exports = [
  { masterPassword: "password", siteName: "example.com", userid: "alice", comment: "" },
  { masterPassword: "correct horse battery staple", siteName: "", userid: "", comment: "" },
  { masterPassword: "Pa$$w0rd!", siteName: "google.com", userid: "bob@example.com", comment: "2" },
  { masterPassword: "マスターパスワード", siteName: "日本語.jp", userid: "ユーザー", comment: "メモ" },
  // Decomposed (NFD) input must be normalized to NFC before hashing.
  { masterPassword: "がぎ", siteName: "é.com", userid: "", comment: "" },
  { masterPassword: "🔑emoji🔒", siteName: "a|b", userid: "|", comment: "c|" },
  { masterPassword: " leading and trailing spaces ", siteName: " x ", userid: " ", comment: " " },
  { masterPassword: "x".repeat(200), siteName: "very-long-subdomain.example.co.uk", userid: "u", comment: "comment" },
];
