// ── Bangladesh district → thana (upazilla) data via the open-source bdapis.com API ──
import { useEffect, useState } from 'react';

// One request per division (8 total, fetched in parallel, session-cached):
//   GET https://bdapis.com/api/v1.2/division/{division-slug}
// Every district entry in the response carries its full upazilla (thana) list.
// District names are mapped to the exact DELIVERY_ZONES spellings used by
// checkout + Steadfast zone pricing, so the same values keep flowing through
// the app (customer_address, delivery_zone, courier booking).

const API_BASE = 'https://bdapis.com/api/v1.2/division';
const CACHE_KEY = 'ornix_geo_thanas_v2'; // sessionStorage cache
const MIN_DISTRICTS = 60; // Bangladesh has 64 — guard against partial data

const DIVISION_SLUGS = ['barishal', 'chattogram', 'dhaka', 'khulna', 'mymensingh', 'rajshahi', 'rangpur', 'sylhet'];

// bdapis spellings that differ from the app's (Steadfast/ZoneSelect) district names
const DISTRICT_ALIASES: Record<string, string> = {
  "cox's bazar": 'Cox’s Bazar', // ASCII apostrophe → the app's U+2019 spelling
  jhalokati: 'Jhalokathi',
  khagrachari: 'Khagrachhari',
  'chapai nawabganj': 'Chapainawabganj',
};

/**
 * Curated thana lists for app-level "districts" the bdapis API doesn't cover:
 * - 'Dhaka City' → the 50 Dhaka Metropolitan Police thanas
 *   (bdapis only knows administrative upazillas; metropolitan thanas are
 *   what customers actually use for addresses inside the city)
 * - 'Dhaka Suburban' → the Dhaka-district upazillas outside the city
 *   (Savar/Dhamrai/Keraniganj also exist as their own dropdown options —
 *   listing them here too keeps the suburban catch-all usable)
 * Keys must match ZoneSelect district values exactly; every entry pairs the
 * stored English name with its Bangla label for the Bengali checkout.
 */
export type SpecialThana = { name: string; bn: string };
export const SPECIAL_THANA_LISTS: Record<string, SpecialThana[]> = {
  'Dhaka City': [
    { name: 'Adabor', bn: 'আদাবর' },
    { name: 'Airport', bn: 'এয়ারপোর্ট' },
    { name: 'Badda', bn: 'বাড্ডা' },
    { name: 'Banani', bn: 'বনানী' },
    { name: 'Bangshal', bn: 'বাংশাল' },
    { name: 'Bhashantek', bn: 'ভাসানটেক' },
    { name: 'Bimanbandar', bn: 'বিমানবন্দর' },
    { name: 'Cantonment', bn: 'ক্যান্টনমেন্ট' },
    { name: 'Chalkbazar', bn: 'চকবাজার' },
    { name: 'Dakshinkhan', bn: 'দক্ষিণখান' },
    { name: 'Darus Salam', bn: 'দারুস সালাম' },
    { name: 'Demra', bn: 'ডেমরা' },
    { name: 'Dhanmondi', bn: 'ধানমন্ডি' },
    { name: 'Gendaria', bn: 'জিন্দারিয়া' },
    { name: 'Gulshan', bn: 'গুলশান' },
    { name: 'Hatirjheel', bn: 'হাতিরঝিল' },
    { name: 'Hazaribagh', bn: 'হাজারীবাগ' },
    { name: 'Jatrabari', bn: 'যাত্রাবাড়ী' },
    { name: 'Kadamtali', bn: 'কদমতলী' },
    { name: 'Kafrul', bn: 'কাফরুল' },
    { name: 'Kalabagan', bn: 'কলাবাগান' },
    { name: 'Kamrangirchar', bn: 'কামরাঙ্গীরচর' },
    { name: 'Khilgaon', bn: 'খিলগাঁও' },
    { name: 'Khilkhet', bn: 'খিলক্ষেত' },
    { name: 'Kotwali', bn: 'কোতোয়ালী' },
    { name: 'Lalbagh', bn: 'লালবাগ' },
    { name: 'Mirpur', bn: 'মিরপুর' },
    { name: 'Mohammadpur', bn: 'মোহাম্মদপুর' },
    { name: 'Motijheel', bn: 'মতিঝিল' },
    { name: 'Mugda', bn: 'মুগদা' },
    { name: 'New Market', bn: 'নিউ মার্কেট' },
    { name: 'Pallabi', bn: 'পল্লবী' },
    { name: 'Paltan', bn: 'পল্টন' },
    { name: 'Ramna', bn: 'রমনা' },
    { name: 'Rampura', bn: 'রামপুরা' },
    { name: 'Sabujbagh', bn: 'সবুজবাগ' },
    { name: 'Shah Ali', bn: 'শাহ আলী' },
    { name: 'Shahbagh', bn: 'শাহবাগ' },
    { name: 'Shahjahanpur', bn: 'শাহজাহানপুর' },
    { name: 'Sher-e-Bangla Nagar', bn: 'শেরেবাংলা নগর' },
    { name: 'Shyampur', bn: 'শ্যামপুর' },
    { name: 'Sutrapur', bn: 'সূত্রাপুর' },
    { name: 'Tejgaon', bn: 'তেজগাঁও' },
    { name: 'Tejgaon Industrial Area', bn: 'তেজগাঁও শিল্পাঞ্চল' },
    { name: 'Turag', bn: 'তুরাগ' },
    { name: 'Uttar Khan', bn: 'উত্তরখান' },
    { name: 'Uttara East', bn: 'উত্তরা পূর্ব' },
    { name: 'Uttara West', bn: 'উত্তরা পশ্চিম' },
    { name: 'Vatara', bn: 'ভাটারা' },
    { name: 'Wari', bn: 'ওয়ারী' },
  ],
  'Dhaka Suburban': [
    { name: 'Dhamrai', bn: 'ধামরাই' },
    { name: 'Dohar', bn: 'দোহার' },
    { name: 'Keraniganj', bn: 'কেরানীগঞ্জ' },
    { name: 'Nawabganj', bn: 'নবাবগঞ্জ' },
    { name: 'Savar', bn: 'সাভার' },
  ],
};

type BdapisRow = { district?: string; upazilla?: string[] };
type BdapisResponse = { data?: BdapisRow[] };

function readCache(): Record<string, string[]> | null {
  try {
    const raw = window.sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length >= MIN_DISTRICTS) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(map: Record<string, string[]>): void {
  try {
    window.sessionStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // storage unavailable — data is simply re-fetched next time
  }
}

/**
 * Merge the curated lists (Dhaka City / Dhaka Suburban) into an API map.
 * Returns a NEW object — never mutates the caller's map.
 */
function withSpecialLists(map: Record<string, string[]>): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...map };
  for (const [key, entries] of Object.entries(SPECIAL_THANA_LISTS)) {
    if (!merged[key]?.length) merged[key] = entries.map((e) => e.name);
  }
  return merged;
}

/** Fetch thana lists for every district, keyed by the app's district names. */
export async function fetchAllDistrictThanas(): Promise<Record<string, string[]>> {
  const cached = readCache();
  if (cached) return withSpecialLists(cached);

  const responses: BdapisResponse[] = await Promise.all(
    DIVISION_SLUGS.map(async (slug) => {
      const res = await fetch(`${API_BASE}/${slug}`);
      if (!res.ok) throw new Error(`bdapis (${slug}) responded ${res.status}`);
      return (await res.json()) as BdapisResponse;
    })
  );

  const map: Record<string, string[]> = {};
  for (const body of responses) {
    for (const row of body.data ?? []) {
      const apiName = (row.district ?? '').trim();
      if (!apiName) continue;
      const key = DISTRICT_ALIASES[apiName.toLowerCase()] ?? apiName;
      const thanas = [...new Set((row.upazilla ?? []).map((u) => u.trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
      map[key] = thanas;
    }
  }

  if (Object.keys(map).length < MIN_DISTRICTS) throw new Error('bdapis returned incomplete district data');

  // Store under both apostrophe variants so lookups always hit
  for (const [key, thanas] of Object.entries(map)) {
    if (key.includes('’') && !map[key.replace(/’/g, "'")]) map[key.replace(/’/g, "'")] = thanas;
    if (key.includes("'") && !map[key.replace(/'/g, '’')]) map[key.replace(/'/g, '’')] = thanas;
  }

  writeCache(map);
  return withSpecialLists(map);
}

/** React hook: loads all thana lists once per page (sessionStorage-cached). */
export function useDistrictThanas(): {
  thanasByDistrict: Record<string, string[]>;
  loading: boolean;
  error: string | null;
} {
  // Shared session cache + in-flight promise keep checkout and admin in sync
  const [thanasByDistrict, setThanasByDistrict] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Curated lists (Dhaka City / Dhaka Suburban) render immediately,
    // even while the API data is still loading.
    setThanasByDistrict(
      Object.fromEntries(Object.entries(SPECIAL_THANA_LISTS).map(([k, v]) => [k, v.map((e) => e.name)]))
    );
    fetchAllDistrictThanas()
      .then((map) => {
        if (!alive) return;
        setThanasByDistrict(map);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load thana list');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { thanasByDistrict, loading, error };
}
