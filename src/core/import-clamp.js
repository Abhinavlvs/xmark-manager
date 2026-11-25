/**
 * Timestamp rules for imported records. Pure.
 *
 * A record may not claim to be newer than the moment its file was written: `updated_at` later
 * than the file's own `exported_at` (or, for older files without one, later than now) is
 * rewritten to that ceiling, and the ceiling itself never exceeds now. Because `exported_at`
 * is fixed inside the file, importing the same file again produces the same timestamps, so it
 * cannot beat an edit made after the first import.
 *
 * When the ceiling falls back to "now" (no, invalid, or future `exported_at`) the file cannot
 * prove how new a clamped record is, and a fresh "now" would win over every later local edit.
 * So such a record NEVER replaces a local record with the same id whose content differs:
 * local wins and the caller reports it as `keptLocal`. New ids and identical content import
 * normally (identical content is never bumped). The same holds for a record with another id
 * that is the same post (same status id) as a live local one: it would otherwise be clamped to
 * "now" and tombstone the edited local post, so it is dropped (and counted if its content
 * differs). With a valid `exported_at` <= now, and for records that are not future-dated,
 * normal last-writer-wins applies.
 */

/** Same content ignoring `updated_at` (key order does not matter). */
function sameContent(a, b) {
  const flat = (rec) =>
    JSON.stringify(
      Object.keys(rec)
        .filter((k) => k !== 'updated_at')
        .sort()
        .map((k) => [k, rec[k]]),
    );
  return flat(a) === flat(b);
}

/** Same user-visible content, ignoring ids and timestamps (used across different ids). */
function sameFields(a, b) {
  const skip = new Set(['id', 'created_at', 'updated_at']);
  const flat = (rec) =>
    JSON.stringify(
      Object.keys(rec)
        .filter((k) => !skip.has(k))
        .sort()
        .map((k) => [k, rec[k]]),
    );
  return flat(a) === flat(b);
}

/**
 * @template {{id: string, updated_at: string, deleted?: boolean}} T
 * @param {T[]} incoming
 * @param {T[]} local records already stored
 * @param {{now: string, exportedAt?: string|null, identityOf?: (rec: T) => string}} opts
 *   `identityOf` also matches records with a different id that are the same thing (a post with
 *   the same status id)
 * @returns {{records: T[], keptLocal: number, keptSameId: number}} `keptLocal` counts records
 *   that lost to local; `keptSameId` those of them that are still in `records` (as the local one)
 */
export function applyImportClock(incoming, local, { now, exportedAt = null, identityOf }) {
  const nowMs = Date.parse(now);
  const proven = exportedAt !== null && Date.parse(exportedAt) <= nowMs;
  const ceiling = proven ? exportedAt : now;
  const ceilingMs = Date.parse(ceiling);
  const byId = new Map(local.map((r) => [r.id, r]));
  const liveByKey = new Map();
  if (identityOf) for (const r of local) if (!r.deleted) liveByKey.set(identityOf(r), r);
  let keptLocal = 0;
  let keptSameId = 0;
  const records = [];
  for (const rec of incoming) {
    const mine = byId.get(rec.id);
    const future = Date.parse(rec.updated_at) > ceilingMs;
    const clamped = future ? { ...rec, updated_at: ceiling } : rec;
    if (mine) {
      if (sameContent(mine, clamped)) records.push(mine);
      else if (future && !proven) {
        // The file cannot prove it is newer than what is on this device: local wins, every time.
        keptLocal += 1;
        if (!mine.deleted) keptSameId += 1; // unchanged counts live records only
        records.push(mine);
      } else records.push(clamped);
      continue;
    }
    const twin = identityOf && future && !proven ? liveByKey.get(identityOf(rec)) : undefined;
    if (!twin) records.push(clamped);
    else if (!sameFields(twin, rec)) keptLocal += 1; // same post, other id: local wins, record dropped
  }
  return { records, keptLocal, keptSameId };
}
