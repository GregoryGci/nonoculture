/**
 * Shared Wikimedia Commons plumbing for the image generators.
 *
 * The licence check is the point of this file. A Commons file's licence is a property of
 * *that file*, not of Commons, and earlier in this project a set of planet images that
 * looked entirely safe turned out to be CC BY-SA. So every file is checked by name before
 * it is downloaded, and anything that is not outright free is skipped and reported.
 */

export const UA = "NonoCulture-quiz/1.0 (educational party game; contact via github.com/GregoryGci)";

/** Only these count as "no obligation attached". Anything else is skipped, loudly. */
const FREE_LICENCES = [/public domain/i, /^cc0/i, /^pd/i];

export const isFree = (licence) => FREE_LICENCES.some((re) => re.test(licence ?? ""));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A JSON GET that survives the public endpoints' rate limits and occasional 504s. */
export async function json(url, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return res.json();
      last = new Error(`HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw last;
    } catch (err) {
      last = err;
    }
    if (attempt === attempts) break;
    const wait = attempt * 5000;
    console.log(`   ...${last.message}, nouvelle tentative dans ${wait / 1000}s`);
    await sleep(wait);
  }
  throw last;
}

export async function sparql(query) {
  const data = await json(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`);
  return data.results.bindings;
}

/** The file name Commons knows a P18/P94 value by. */
export const fileNameOf = (imageUrl) => decodeURIComponent(imageUrl.split("/").pop());

/**
 * Licences for many files at once. One request per file got us rate-limited; the Commons API
 * takes up to 50 titles per call, which turns ninety requests into two.
 */
export async function licencesFor(files) {
  const found = new Map();
  for (let i = 0; i < files.length; i += 50) {
    const batch = files.slice(i, i + 50);
    const data = await json(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata` +
        `&titles=${encodeURIComponent(batch.map((f) => `File:${f}`).join("|"))}`,
    );
    for (const page of Object.values(data.query?.pages ?? {})) {
      const title = String(page.title ?? "").replace(/^File:/, "");
      found.set(title, page.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value ?? "inconnue");
    }
    await sleep(1200);
  }
  return found;
}

/** Commons normalises underscores to spaces in the title it echoes back. */
export const licenceOf = (licences, file) => licences.get(file) ?? licences.get(file.replace(/_/g, " ")) ?? "inconnue";

export async function downloadFile(file, width = 640) {
  const res = await fetch(
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`,
    {
      headers: { "User-Agent": UA },
      redirect: "follow",
    },
  );
  if (!res.ok) throw new Error(`téléchargement ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export const slugify = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
