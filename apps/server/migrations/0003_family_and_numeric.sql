-- Two columns the deck builder needs.
--
-- family: which template a generated question came from. Without it a themed game is
-- twenty rewordings of one sentence — every "sport" question was "Quel sport pratique X ?",
-- because a family is generated in bulk and the draw had no reason to spread across them.
--
-- answer_kind: 'number' marks a question scored by proximity (closest answer wins) instead
-- of by the host's judgement. Kept separate from `type`, which describes the media attached
-- to a question and is orthogonal — a numeric question can also carry an image.
ALTER TABLE questions ADD COLUMN family TEXT;
ALTER TABLE questions ADD COLUMN answer_kind TEXT NOT NULL DEFAULT 'text';

CREATE INDEX idx_questions_family ON questions(theme, family);
