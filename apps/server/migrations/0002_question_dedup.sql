-- Seeding is meant to be re-runnable (importing a batch twice, re-running `pnpm seed`
-- after a tweak). Without a natural key the plain INSERTs duplicated the whole bank
-- every time. Collapse whatever duplicates already exist, then make them impossible.
DELETE FROM questions
WHERE id NOT IN (SELECT MIN(id) FROM questions GROUP BY prompt, answer);

CREATE UNIQUE INDEX idx_questions_unique ON questions(prompt, answer);

-- buildDeck always filters on verified, usually together with theme.
CREATE INDEX idx_questions_verified_theme ON questions(verified, theme);
