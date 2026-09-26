/** One-off: list districts referenced by the app but missing a Bengali label. */
import { DELIVERY_ZONES } from '../src/components/ZoneSelect';
import { DISTRICT_NAMES_BN } from '../src/lib/districtNamesBn';

const app = DELIVERY_ZONES.flatMap((z) => z.districts);
const missing = app.filter((d) => !DISTRICT_NAMES_BN[d]);
const extra = Object.keys(DISTRICT_NAMES_BN).filter((k) => !app.includes(k));

console.log(`App districts: ${app.length}, map entries: ${Object.keys(DISTRICT_NAMES_BN).length}`);
console.log(`\nMissing Bengali labels (${missing.length}):`);
for (const d of missing) console.log(`  ${d}`);
if (extra.length) {
  console.log(`\nMap entries not used by the app (${extra.length}):`);
  for (const d of extra) console.log(`  ${d}`);
}
