/** One-off: diff official 64 districts vs ZoneSelect DELIVERY_ZONES coverage. */
import { DELIVERY_ZONES } from '../src/components/ZoneSelect';

type DistrictRow = { id: string; name: string };

const districts = (await (await fetch('https://cdn.jsdelivr.net/gh/SudipMHX/bd-apis@main/src/database/districts.json')).json()) as DistrictRow[];

const official = new Set(districts.map((d) => d.name));
const app = new Set(DELIVERY_ZONES.flatMap((z) => z.districts));

const officialNorm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
const appToOfficial = new Map([...official].map((o) => [officialNorm(o), o]));

console.log(`App list count: ${app.size}`);
console.log(`\nIn app but NOT official districts:`);
for (const a of app) if (!appToOfficial.has(officialNorm(a))) console.log(`  ${a}`);

console.log(`\nOfficial districts MISSING from app:`);
for (const o of official) {
  if (!app.has(o) && ![...app].some((a) => officialNorm(a) === officialNorm(o))) console.log(`  ${o}`);
}

// Also check zone assignment sanity: every district must resolve to a zone
const unresolved = [...app].filter((a) => !DELIVERY_ZONES.some((z) => z.districts.includes(a)));
console.log(`\nUnresolvable zone entries: ${unresolved.length ? unresolved.join(', ') : 'none'}`);
