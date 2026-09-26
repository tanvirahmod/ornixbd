/**
 * One-off codegen: builds src/lib/thanaNamesBn.ts
 *
 * The runtime thana lists come from bdapis.com (English-only upazilla names).
 * This script cross-references the open-source bd-apis dataset
 * (https://github.com/SudipMHX/bd-apis — BBS/official spellings with bn_name)
 * to produce an English→Bengali map keyed by the exact strings the app stores.
 * Matching is scoped per district (alias table + fuzzy edit-distance); every
 * fuzzy pair is printed for review and any unmapped name fails the build.
 */
import { writeFileSync } from 'node:fs';
import { SPECIAL_THANA_LISTS } from '../src/lib/bangladeshGeo';

type DistrictRow = { id: string; name: string; bn_name?: string };
type UpazillaRow = { district_id: string; name: string; bn_name?: string };

const cache = new Map<string, unknown>();
async function getJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const json = (await res.json()) as T;
  cache.set(url, json);
  return json;
}

const DIVISION_SLUGS = ['barishal', 'chattogram', 'dhaka', 'khulna', 'mymensingh', 'rajshahi', 'rangpur', 'sylhet'];

/**
 * bdapis district spelling → the app's stored spelling
 * (mirrors DISTRICT_ALIASES in src/lib/bangladeshGeo.ts)
 */
const APP_KEY_ALIASES: Record<string, string> = {
  "cox's bazar": 'Cox’s Bazar', // ASCII apostrophe → the app's U+2019 spelling
  jhalokati: 'Jhalokathi',
  khagrachari: 'Khagrachhari',
  'chapai nawabganj': 'Chapainawabganj',
};

/** app district spelling → bd-apis district name (only where they differ) */
const BDAPIS_ID_ALIASES: Record<string, string> = {
  "cox's bazar": 'Coxsbazar',
  jhalokathi: 'Jhalakathi',
  cumilla: 'Comilla',
  barishal: 'Barisal',
};

/**
 * bdapis upazilla spellings with no close bd-apis counterpart.
 * Verified against BNGD/official Bangla names (2026).
 */
const UPAZILLA_OVERRIDES: Record<string, string> = {
  // "X Sadar" forms bdapis names after the district, bd-apis doesn't
  'Manikgonj Sadar': 'মানিকগঞ্জ সদর',
  'Munshiganj Sadar': 'মুন্সিগঞ্জ সদর',
  'Narsingdi Sadar': 'নরসিংদী সদর',
  'Narayanganj Sadar': 'নারায়ণগঞ্জ সদর',
  'Faridpur Sadar': 'ফরিদপুর সদর',
  'Gazipur Sadar': 'গাজীপুর সদর',
  'Gopalganj Sadar': 'গোপালগঞ্জ সদর',
  'Kishoreganj Sadar': 'কিশোরগঞ্জ সদর',
  'Madaripur Sadar': 'মাদারীপুর সদর',
  'Rajbari Sadar': 'রাজবাড়ী সদর',
  'Shariatpur Sadar': 'শরিয়তপুর সদর',
  'Tangail Sadar': 'টাঙ্গাইল সদর',
  // genuinely different English transliterations
  'Paikgachha': 'পাইকগাছা',
  'Phultala': 'ফুলতলা',
  'Matlab Dakshin': 'মতলব দক্ষিণ',
  'Matlab Uttar': 'মতলব উত্তর',
  'Shivalaya': 'শিবালয়',
  'Goalandaghat': 'গোয়ালন্দ ঘাট',
  'Nesarabad (Swarupkati)': 'নেছারাবাদ (স্বরূপকাঠি)',
  'Sayestaganj': 'শায়েস্তাগঞ্জ',
  'Lakshmichhari': 'লক্ষীছড়ি',
  'Cumilla Adarsha Sadar': 'কুমিল্লা আদর্শ সদর',
  'Cumilla Sadar Dakshin': 'কুমিল্লা সদর দক্ষিণ',
  'Dakshin Sunamganj': 'দক্ষিণ সুনামগঞ্জ',
  'Sullah': 'শাল্লা',
  // newer upazillas missing from the bd-apis dataset
  'Karnaphuli': 'কর্ণফুলী',
};

const norm = (s: string) => s.toLowerCase().replace(/[’'`´]/g, '').replace(/[-–—_]/g, ' ').replace(/\s+/g, ' ').trim();

/** loose normalization for district names */
const loose = (s: string) => norm(s).replace(/[^a-z0-9]/g, '');

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

async function main() {
  // 1. bdapis: the exact strings the app stores, per district
  const bdapisByDistrict: Record<string, string[]> = {};
  await Promise.all(
    DIVISION_SLUGS.map(async (slug) => {
      const body = await getJson<{ data?: Array<{ district?: string; upazilla?: string[] }> }>(
        `https://bdapis.com/api/v1.2/division/${slug}`
      );
      for (const row of body.data ?? []) {
        const apiName = (row.district ?? '').trim();
        if (!apiName) continue;
        const appKey = APP_KEY_ALIASES[apiName.toLowerCase()] ?? apiName;
        bdapisByDistrict[appKey] = [...new Set((row.upazilla ?? []).map((u) => u.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      }
    })
  );

  // 2. bd-apis districts + upazillas (official bn_name source)
  const districts = await getJson<DistrictRow[]>('https://cdn.jsdelivr.net/gh/SudipMHX/bd-apis@main/src/database/districts.json');
  const upazilas = await getJson<UpazillaRow[]>('https://cdn.jsdelivr.net/gh/SudipMHX/bd-apis@main/src/database/upazilas.json');

  // app district key → bd-apis district_id
  const byLoose = new Map<string, DistrictRow>();
  for (const d of districts) byLoose.set(loose(d.name), d);
  const distIdByKey: Record<string, string> = {};
  for (const appKey of Object.keys(bdapisByDistrict)) {
    const bdapisName = BDAPIS_ID_ALIASES[appKey.toLowerCase()] ?? appKey;
    const hit = byLoose.get(loose(bdapisName)) ?? byLoose.get(loose(appKey));
    if (!hit) throw new Error(`No bd-apis district for app key "${appKey}"`);
    distIdByKey[appKey] = hit.id;
  }

  const upazilasByDistrictId: Record<string, UpazillaRow[]> = {};
  for (const u of upazilas) {
    if (!u.bn_name) continue;
    (upazilasByDistrictId[u.district_id] ??= []).push(u);
  }

  // 3. Match per district
  const bnMap: Record<string, string> = {};
  const unmapped: Array<{ district: string; upazilla: string }> = [];
  const fuzzyPairs: string[] = [];

  for (const [district, thanas] of Object.entries(bdapisByDistrict)) {
    const candidates = upazilasByDistrictId[distIdByKey[district]] ?? [];
    const used = new Set<string>();
    for (const th of thanas) {
      const override = UPAZILLA_OVERRIDES[th];
      if (override) {
        bnMap[`${district}||${th}`] = override;
        continue;
      }
      const key = norm(th);
      const exact = candidates.find((c) => !used.has(c.name) && norm(c.name) === key);
      if (exact) {
        used.add(exact.name);
        bnMap[`${district}||${th}`] = exact.bn_name!;
        continue;
      }
      // fuzzy: edit distance on the normalized keys (printed for review)
      let best: { c: UpazillaRow; d: number } | null = null;
      for (const c of candidates) {
        if (used.has(c.name)) continue;
        const d = levenshtein(key, norm(c.name));
        if (!best || d < best.d) best = { c, d };
      }
      if (best && best.d <= Math.max(2, Math.floor(key.length / 5))) {
        used.add(best.c.name);
        fuzzyPairs.push(`${district} :: ${th} → ${best.c.name} (${best.c.bn_name}) [dist ${best.d}]`);
        bnMap[`${district}||${th}`] = best.c.bn_name!;
        continue;
      }
      unmapped.push({ district, upazilla: th });
    }
  }

  if (unmapped.length) {
    console.error(`UNMAPPED (${unmapped.length}):`);
    for (const u of unmapped) console.error(`  ${u.district} :: ${u.upazilla}`);
    process.exit(1);
  }

  // 3b. Curated lists (Dhaka City / Dhaka Suburban) ship with their own
  // Bangla labels in SPECIAL_THANA_LISTS — fold them into the map too.
  for (const [district, entries] of Object.entries(SPECIAL_THANA_LISTS)) {
    for (const entry of entries) {
      const key = `${district}||${entry.name}`;
      if (!bnMap[key]) bnMap[key] = entry.bn;
    }
  }

  console.log(`Fuzzy pairs (${fuzzyPairs.length}):`);
  for (const p of fuzzyPairs) console.log('  ' + p);

  // 4. Bare-name fallbacks for globally-unique names (helps legacy stored values)
  const nameCount: Record<string, number> = {};
  for (const key of Object.keys(bnMap)) {
    const name = key.split('||')[1];
    nameCount[name] = (nameCount[name] ?? 0) + 1;
  }
  const uniqueBn: Record<string, string> = {};
  for (const [key, bn] of Object.entries(bnMap)) {
    const name = key.split('||')[1];
    if (nameCount[name] === 1) uniqueBn[`||${name}`] = bn;
  }

  // 5. Emit TS file
  const lines: string[] = [];
  lines.push('// ── Bengali thana (upazilla) display names ──');
  lines.push('// Generated by scripts/generate-thana-bn.ts (do not edit by hand).');
  lines.push('// Keys are "<district>||<thana>" using the exact English strings the app');
  lines.push('// stores (bdapis spellings); values are official Bengali names from the');
  lines.push('// open-source bd-apis dataset (github.com/SudipMHX/bd-apis). Bare "||name"');
  lines.push('// entries are globally-unique fallbacks for legacy stored values.');
  lines.push('// Stored order values stay English end-to-end — only the visible label is Bengali.');
  lines.push('');
  lines.push('export const THANA_NAMES_BN: Record<string, string> = {');
  const entries = Object.entries({ ...uniqueBn, ...bnMap }).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, bn] of entries) {
    lines.push(`  '${key.replace(/'/g, "\\'")}': '${bn.replace(/'/g, "\\'")}',`);
  }
  lines.push('};');
  lines.push('');
  lines.push('/** Bengali label for a stored thana name, or the name itself when unmapped. */');
  lines.push('export function bnThanaName(district: string | undefined, thana: string): string {');
  lines.push('  if (district) {');
  lines.push('    const scoped = THANA_NAMES_BN[`${district}||${thana}`];');
  lines.push('    if (scoped) return scoped;');
  lines.push('  }');
  lines.push('  return THANA_NAMES_BN[`||${thana}`] ?? THANA_NAMES_BN[thana] ?? thana;');
  lines.push('}');
  lines.push('');

  writeFileSync('src/lib/thanaNamesBn.ts', lines.join('\n'), 'utf8');
  console.log(`\nMapped: ${Object.keys(bnMap).length} scoped + ${Object.keys(uniqueBn).length} unique fallbacks`);
  console.log(`Wrote src/lib/thanaNamesBn.ts`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
