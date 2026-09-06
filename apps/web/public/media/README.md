# Question media

Short clips shipped as Workers static assets and served at `/media/<file>`, which is what a
question row's `media_key` points at. No R2 bucket required — R2 has to be switched on in the
Cloudflare dashboard and wants a card on file, while Workers assets do not.

## What's here

15 sound-effect clips (themes `animaux` and `cuisine`), all **CC0 / public domain** from
[Freesound](https://freesound.org). CC0 imposes no attribution requirement, but each question
row records its exact origin in the `source` column (`Freesound.org #<id>`), so provenance
stays checkable.

## Adding your own

    pnpm --filter server media:add <fichier>

ffmpeg compresses to spec (audio: MP3 128 kbps, trimmed to 20 s) and drops the result here.
The file ships on the next `pnpm --filter web build` + `wrangler deploy`.

## Regenerating the Freesound set

Needs a free API key (freesound.org/apiv2/apply — no card), passed through the environment
and never written to disk:

    FREESOUND_TOKEN=<key> pnpm --filter server sounds:fetch

That writes to `apps/server/seed/downloads/` (gitignored); feed each file through `media:add`,
then `pnpm --filter server seed seed/audio-questions.json`.
