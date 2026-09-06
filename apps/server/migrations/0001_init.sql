CREATE TABLE questions (
  id            INTEGER PRIMARY KEY,
  theme         TEXT NOT NULL,      -- histoire, geo, sciences, cinema, musique, gaming, sport, insolite...
  difficulty    INTEGER NOT NULL,   -- 1 = facile (1pt), 2 = moyen (2pts), 3 = difficile (3pts)
  type          TEXT NOT NULL,      -- text, image, audio, video
  prompt        TEXT NOT NULL,
  media_key     TEXT,               -- clé R2, null si type = text
  answer        TEXT NOT NULL,
  aliases       TEXT NOT NULL,      -- JSON array de variantes acceptées
  explanation   TEXT,               -- affiché au REVEAL
  source        TEXT,
  verified      INTEGER DEFAULT 0
);
CREATE INDEX idx_theme_diff ON questions(theme, difficulty);

-- Registry of in-use 4/5-digit room codes so the Worker can allocate a fresh one
-- without colliding with an active room. The Durable Object itself is still
-- addressed deterministically via idFromName(code); this table only answers
-- "is this code currently taken?".
CREATE TABLE room_codes (
  code          TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,   -- unix ms
  expires_at    INTEGER NOT NULL    -- unix ms; code becomes free once now() > expires_at
);
CREATE INDEX idx_room_codes_expires ON room_codes(expires_at);
