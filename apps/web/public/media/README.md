# Question media

Short audio/image clips shipped as Workers static assets and served at `/media/<file>`,
which is what a question row `media_key` points at. Add one with:

    pnpm --filter server media:add <fichier>

No R2 bucket required.
