import { ChevronDown, MapPin } from 'lucide-react';

/**
 * Delivery zones used to compute the Steadfast courier charge.
 * Mirrors Steadfast's pricing: Dhaka City / Dhaka Suburban / Outside Dhaka.
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
      'Chuadanga', 'Cox\u2019s Bazar', 'Cumilla', 'Dinajpur', 'Faridpur', 'Feni', 'Gaibandha', 'Gopalganj', 'Habiganj',
      'Jamalpur', 'Jashore', 'Jhalokathi', 'Jhenaidah', 'Joypurhat', 'Khagrachhari', 'Khulna', 'Kishoreganj', 'Kurigram',
      'Kushtia', 'Lakshmipur', 'Lalmonirhat', 'Madaripur', 'Magura', 'Meherpur', 'Moulvibazar', 'Mymensingh', 'Naogaon',
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

/**
 * District dropdown shown in checkout step 1. The zone drives the Steadfast
 * courier fee, so the customer's advance matches what the courier collects.
 */
export default function ZoneSelect({ value, onChange, error, required = false }: {
  value: string;
  onChange: (district: string) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">
        <span className="flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> District / Zone {required && <span className="text-red-400">*</span>}
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
          <option value="">Select your district…</option>
          {DELIVERY_ZONES.map((zone) => (
            <optgroup key={zone.id} label={zone.id === 'dhaka_city' ? 'Inside Dhaka' : zone.id === 'dhaka_suburban' ? 'Dhaka Suburban' : 'Outside Dhaka'}>
              {zone.districts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {!error && (
        <p className="text-[11px] text-stone-400 mt-1">
          {ALL_DISTRICTS.length} districts covered — the courier fee is set from your zone.
        </p>
      )}
    </div>
  );
}
