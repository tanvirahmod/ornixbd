import { Loader2 } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { useDistrictThanas, SPECIAL_THANA_LISTS, type SpecialThana } from '../lib/bangladeshGeo';
import { bnThanaName } from '../lib/thanaNamesBn';

/**
 * Thana (upazilla) dropdown fed by the open-source bdapis.com API.
 * Shared by checkout step 1 and the admin Manual Orders form.
 * - No district chosen yet → disabled placeholder
 * - Thana list loading → disabled loading state
 * - API unreachable → graceful fallback to a free-text input
 */
export default function ThanaSelect({
  district,
  value,
  onChange,
  error,
  variant = 'checkout',
  required = false,
}: {
  district: string;
  value: string;
  onChange: (thana: string) => void;
  error?: string;
  /** 'checkout' = storefront paddings, 'admin' = compact admin form paddings */
  variant?: 'checkout' | 'admin';
  required?: boolean;
}) {
  const { t, lang } = useLanguage();
  const { thanasByDistrict, loading, error: geoError } = useDistrictThanas();

  // App-level districts (Dhaka City / Dhaka Suburban) ship curated lists —
  // bdapis only knows administrative upazillas, not metropolitan thanas.
  const special = district ? SPECIAL_THANA_LISTS[district] ?? null : null;
  const thanas: string[] | null = special
    ? special.map((e) => e.name)
    : district
      ? thanasByDistrict[district] ?? null
      : null;

  // Bengali checkout scope: show Bangla labels; the stored value stays English
  const isBn = lang === 'bn';
  const specialBn = new Map<string, string>((special ?? []).map((e: SpecialThana) => [e.name, e.bn]));
  const labelFor = (th: string) => {
    if (!isBn) return th;
    return specialBn.get(th) ?? bnThanaName(district, th);
  };

  // Curated lists are ready immediately; only gate on `loading` when the
  // list genuinely isn't there yet.
  const listReady = thanas !== null;
  const waiting = !listReady && loading;

  const controlCls =
    variant === 'checkout'
      ? `w-full appearance-none border rounded-2xl px-4 py-3 pr-10 text-sm bg-white focus:outline-none focus:ring-2 transition-all ${
          error ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-stone-200 focus:ring-brand-400'
        } ${value ? 'text-stone-900' : 'text-stone-400'}`
      : `w-full border rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 transition-all ${
          error ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-stone-200 focus:ring-brand-400'
        } ${value ? 'text-stone-900' : 'text-stone-400'} ${error ? '' : 'bg-white'}`;

  // Fallback: no list available (API failed or district unknown) — let the
  // user type the thana instead of blocking them
  if (district && (thanas === null || thanas.length === 0) && !loading) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('thanaUnavailable')}
          className={controlCls}
        />
        <p className="text-[11px] text-amber-600 mt-1">{geoError ?? t('thanaUnavailable')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!district || waiting}
          required={required}
          className={controlCls}
        >
          <option value="">
            {!district
              ? t('districtFirstPlaceholder')
              : waiting
                ? t('thanaLoading')
                : `${t('thanaPlaceholder')}${required ? '' : ` ${t('optionalSuffix')}`}`}
          </option>
          {(thanas ?? []).map((th) => (
            <option key={th} value={th}>{labelFor(th)}</option>
          ))}
        </select>
        {waiting && district ? (
          <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none animate-spin" />
        ) : null}
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
