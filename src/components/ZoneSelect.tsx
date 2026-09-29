import { ChevronDown, MapPin } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { DISTRICT_NAMES_BN } from '../lib/districtNamesBn';

/**
 * Delivery zones used to compute the Steadfast courier charge.
 * Mirrors Steadfast's pricing: Dhaka City / Dhaka Suburban / Outside Dhaka.
 * District VALUES are English IDs (they drive pricing + admin reporting);
 * the displayed labels may be translated (Bengali checkout) via props.
 */
export type DeliveryZone = 'dhaka_city' | 'dhaka_suburban' | 'outside_dhaka';

export const DELIVERY_ZONES: Array<{ id: DeliveryZone; districts: string[] }> = [
  { id: 'dhaka_city', districts: ['Dhaka City'] },
  {
    id: 'dhaka_suburban',
    districts: [
      'Dhaka Suburban', 'Gazipur', 'Narayanganj', 'Narsingdi', 'Savar', 'Dhamrai', 'Keraniganj', 'Manikganj', 'Munshiganj',
    ],
  },
  {
    id: 'outside_dhaka',
    districts: [
      'Bagerhat', 'Bandarban', 'Barguna', 'Barishal', 'Bhola', 'Bogura', 'Brahmanbaria', 'Chandpur', 'Chattogram',
      'Chuadanga', 'Chapainawabganj', 'Cox\u2019s Bazar', 'Cumilla', 'Dinajpur', 'Faridpur', 'Feni', 'Gaibandha', 'Gopalganj', 'Habiganj',
      'Jamalpur', 'Jashore', 'Jhalokathi', 'Jhenaidah', 'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram',
      'Kushtia', 'Lakshmipur', 'Lalmonirhat', 'Madaripur', 'Magura', 'Meherpur', 'Moulvibazar', 'Mymensingh', 'Naogaon', 'Narail',
      'Natore', 'Netrokona', 'Nilphamari', 'Noakhali', 'Pabna', 'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari',
      'Rajshahi', 'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur', 'Sirajganj', 'Sunamganj', 'Sylhet',
      'Tangail', 'Thakurgaon',
    ],
  },
];

export function zoneForDistrict(district: string): DeliveryZone | null {
  const hit = DELIVERY_ZONES.find((z) => z.districts.includes(district));
  return hit?.id ?? null;
}

const ALL_DISTRICTS = DELIVERY_ZONES.flatMap((z) => z.districts);

/** Keys of the site_settings rows that hold the admin-set zone rates. */
export const ZONE_RATE_KEYS = [
  'steadfast_rate_dhaka_city',
  'steadfast_rate_dhaka_suburban',
  'steadfast_rate_outside_dhaka',
] as const;

export type ZoneRateMap = Record<DeliveryZone, number>;

/**
 * Parse raw site_settings values into a zone-rate map. No hardcoded fees:
 * a blank/missing/invalid rate stays null, and consumers show "charged at
 * checkout" instead of an invented number. The admin panel is the single
 * source of truth — whatever is saved there is what every page uses.
 */
export function parseZoneRates(values: Record<string, string | null | undefined>): ZoneRateMap | null {
  const out: Partial<ZoneRateMap> = {};
  for (const z of DELIVERY_ZONES) {
    const key = `steadfast_rate_${z.id}`;
    const raw = values[key];
    const num = raw != null && raw !== '' ? Number(raw) : NaN;
    if (raw == null || raw === '' || isNaN(num) || num < 0) return null;
    out[z.id] = num;
  }
  return out as ZoneRateMap;
}

/** Cheapest zone rate — used only as an honest "from ৳X" hint before a district is picked. */
export function minZoneRateOf(rates: ZoneRateMap): number {
  return Math.min(rates.dhaka_city, rates.dhaka_suburban, rates.outside_dhaka);
}

/**
 * District dropdown shown in checkout step 1. The zone drives the Steadfast
 * courier fee, so the customer's advance matches what the courier collects.
 * Inside the Bengali checkout scope, labels render in Bangla; elsewhere English.
 */
export default function ZoneSelect({ value, onChange, error, required = false }: {
  value: string;
  onChange: (district: string) => void;
  error?: string;
  required?: boolean;
}) {
  const { t, lang } = useLanguage();

  const isBn = lang === 'bn';
  const zoneLabels: Record<DeliveryZone, string> = isBn
    ? { dhaka_city: t('zoneInsideDhaka'), dhaka_suburban: t('zoneDhakaSuburban'), outside_dhaka: t('zoneOutsideDhaka') }
    : { dhaka_city: 'Inside Dhaka', dhaka_suburban: 'Dhaka Suburban', outside_dhaka: 'Outside Dhaka' };

  const nameFor = (district: string) => (isBn ? DISTRICT_NAMES_BN[district] ?? district : district);

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> {t('districtLabel')} {required && <span className="text-red-400">*</span>}
        </span>
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full appearance-none border rounded-2xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 transition-all ${
            error ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-stone-200 focus:ring-brand-400'
          } ${value ? 'text-stone-900' : 'text-stone-400'}`}
        >
          <option value="">{t('districtPlaceholder')}</option>
          {DELIVERY_ZONES.map((zone) => (
            <optgroup key={zone.id} label={zoneLabels[zone.id]}>
              {zone.districts.map((d) => (
                <option key={d} value={d}>{nameFor(d)}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {!error && (
        <p className="text-[11px] text-stone-400 mt-1">
          {t('districtCountHint', { count: ALL_DISTRICTS.length })}
        </p>
      )}
    </div>
  );
}
