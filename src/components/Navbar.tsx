import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Menu, X, ChevronDown, ShoppingBag, Loader2 } from 'lucide-react';
import { useNavigation, getPageFromPathname } from '../lib/navigation';
import { slugify, productParam, COVER_FALLBACK } from '../lib/utils';
import { supabase, Product } from '../lib/supabase';
import { useAnnouncements, useCategories, getAnnouncementText } from '../lib/siteConfig';
import { useCart } from '../lib/CartContext';

// ── Search overlay ──
function SearchOverlay({ onClose, onGoProduct }: { onClose: () => void; onGoProduct: (product: Product) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Live search: debounce 250ms, then query title / code / category name
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      // Supabase's .or() can't filter on embedded table columns (categories.name),
      // so we search titles/codes directly and separately resolve category matches.
      const pattern = `%${q}%`;
      const select = '*, product_images(id, image_url, display_order), categories(id, name)';
      const [{ data: byText }, { data: cats }] = await Promise.all([
        supabase
          .from('products')
          .select(select)
          .or(`title.ilike.${pattern},product_code.ilike.${pattern}`)
          .limit(8),
        supabase
          .from('categories')
          .select('id')
          .ilike('name', pattern),
      ]);

      let merged: Product[] = byText ?? [];
      if (!cats) {
        // Categories lookup failed — the text search may still have worked
        console.warn('Search: category lookup failed');
      }
      const catIds = (cats ?? []).map((c: { id: string }) => c.id);
      if (catIds.length > 0) {
        const { data: byCategory } = await supabase
          .from('products')
          .select(select)
          .in('category_id', catIds)
          .limit(8);
        const seen = new Set(merged.map((p) => p.id));
        merged = [...merged, ...((byCategory ?? []) as Product[]).filter((p) => !seen.has(p.id))];
      }

      setResults(merged.slice(0, 8));
      setSearching(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Escape closes, backdrop click closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 border-b-2 border-black pb-3">
            <Search className="w-5 h-5 text-black/60 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products, codes, categories..."
              className="flex-1 text-lg font-medium text-black placeholder:text-black/30 focus:outline-none bg-transparent"
            />
            <button
              onClick={onClose}
              aria-label="Close search"
              className="p-1.5 text-black/50 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto mt-3">
            {query.trim().length < 2 ? (
              <p className="py-8 text-center text-sm text-black/40">
                Type at least 2 characters to search.
              </p>
            ) : searching ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-black/40" />
              </div>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-sm text-black/40">
                No products found for “{query.trim()}”.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {results.map((p) => {
                  const cover = p.product_images?.[0]?.image_url ?? COVER_FALLBACK;
                  const hasDiscount = p.discount_price != null && Number(p.discount_price) < Number(p.price);
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => onGoProduct(p)}
                        className="w-full flex items-center gap-4 px-2 py-3 text-left hover:bg-stone-50 transition-colors"
                      >
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0">
                          <img
                            src={cover}
                            alt={p.title}
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = COVER_FALLBACK; }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-black truncate">{p.title}</p>
                          <p className="text-[11px] font-mono text-black/40">
                            {p.product_code}{p.categories ? ` · ${p.categories.name}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {hasDiscount ? (
                            <>
                              <span className="block text-[11px] text-black/40 line-through">৳{Number(p.price).toFixed(0)}</span>
                              <span className="block text-sm font-bold text-sale">৳{Number(p.discount_price).toFixed(0)}</span>
                            </>
                          ) : (
                            <span className="block text-sm font-bold text-black">৳{Number(p.price).toFixed(0)}</span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* View all */}
          {results.length >= 8 && (
            <div className="py-3 text-center border-t border-black/5 mt-1">
              <span className="text-xs text-black/40">Showing top 8 results — refine your search to narrow down</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigateTo = useNavigation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const currentPage = getPageFromPathname(pathname);
  const { itemCount } = useCart();
  const { announcements, loading: annLoading } = useAnnouncements();
  const announcementText = getAnnouncementText(announcements, annLoading);
  const { categories } = useCategories();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-marquee-style', '');
    style.innerHTML = `
      @keyframes marquee { 0% { transform: translateX(0%); } 100% { transform: translateX(-100%); } }
      .marquee-wrapper { overflow: hidden; }
      .marquee-content { display: inline-flex; animation: marquee 20s linear infinite; }
    `;
    style.setAttribute('data-marquee-style', 'true');
    document.head.appendChild(style);
    return () => {
      const existing = document.querySelector('style[data-marquee-style="true"]');
      if (existing) existing.remove();
    };
  }, []);

  const navLinks = [
    { label: 'HOME', page: 'home' as const },
  ];

  return (
    <>
      {/* ── Announcement Bar — only rendered when there is active text ── */}
      {announcementText && (
        <div className="bg-black overflow-hidden py-2.5">
          <div className="marquee-wrapper">
            <div className="marquee-content">
              <span className="text-white font-bold text-xs tracking-[0.2em] uppercase px-4">
                {announcementText}
              </span>
              <span className="text-white font-bold text-xs tracking-[0.2em] uppercase px-4">
                {announcementText}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main Navbar ── */}
      <header className={`sticky top-0 z-50 bg-white shadow-sm transition-colors duration-200 ${scrolled ? 'border-b border-black/10' : ''}`}>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* ── Left: Mobile hamburger ── */}
          <button
            className="lg:hidden text-black p-1"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* ── Center: Logo + Nav (desktop) ── */}
          <div className="flex-1 flex items-center justify-center gap-0 lg:gap-10">
            {/* Left nav links */}
            <nav className="hidden lg:flex items-center gap-1 mr-8">
              {navLinks.map((link) => (
                <button
                  key={link.page}
                  onClick={() => navigateTo(link.page)}
                  className={`px-4 py-2 text-sm font-bold tracking-[0.15em] uppercase transition-colors duration-150 ${
                    currentPage === link.page
                      ? 'text-sale'
                      : 'text-black hover:text-sale'
                  }`}
                >
                  {link.label}
                </button>
              ))}

              {/* Collections dropdown */}
              <div className="relative">
                <button
                  onClick={() => setCollectionsOpen(!collectionsOpen)}
                  onBlur={() => setTimeout(() => setCollectionsOpen(false), 150)}
                   className={`flex items-center gap-1 px-4 py-2 text-sm font-bold tracking-[0.15em] uppercase transition-colors duration-150 ${
                    currentPage === 'shop' ? 'text-sale' : 'text-black hover:text-sale'
                  }`}
                >
                  COLLECTIONS
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${collectionsOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {collectionsOpen && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-black/10 shadow-xl z-50">
                    {categories.length === 0 ? (
                      <div className="px-5 py-3 text-sm text-black/40">No collections yet</div>
                    ) : (
                      categories.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => { navigateTo('collections', slugify(c.name)); setCollectionsOpen(false); }}
                          className="w-full text-left px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black hover:bg-black hover:text-white transition-colors duration-150"
                        >
                          {c.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </nav>

            {/* Brand Logo — centered (absolutely centered on mobile since the left
                hamburger and right icons have different widths) */}
            <button
              onClick={() => navigateTo('home')}
              className="absolute left-1/2 -translate-x-1/2 flex items-center hover:opacity-80 transition-opacity duration-200 lg:static lg:translate-x-0"
            >
              <img
                src="https://ik.imagekit.io/oy2vruqkz/images-photoaidcom-cropped.png"
                alt="ORNIX"
                className="h-12 sm:h-14 w-auto object-contain"
              />
            </button>
          </div>

          {/* ── Right: Icons ── */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="p-2 text-black hover:text-sale transition-colors duration-150"
            >
              <Search className="w-5 h-5" strokeWidth={2} />
            </button>
            <button
              onClick={() => navigate('/cart')}
              aria-label="Cart"
              className="relative p-2 text-black hover:text-sale transition-colors duration-150"
            >
              <ShoppingBag className="w-5 h-5" strokeWidth={2} />
              {itemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[1.15rem] h-[1.15rem] px-1 flex items-center justify-center rounded-full bg-sale text-white text-[10px] font-bold">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── Mobile Menu ── */}
        {mobileOpen && (
          <div className="lg:hidden bg-white border-t border-black/10">
            <nav className="flex flex-col py-2">
              {navLinks.map((link) => (
                <button
                  key={link.page}
                  onClick={() => { navigateTo(link.page); setMobileOpen(false); }}
                  className={`w-full text-left px-6 py-4 text-sm font-bold tracking-[0.15em] uppercase border-b border-black/5 ${
                    currentPage === link.page ? 'text-sale' : 'text-black'
                  }`}
                >
                  {link.label}
                </button>
              ))}
              <div className="px-6 pt-3 pb-1">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-black/40 mb-2">Collections</p>
                {categories.length === 0 ? (
                  <p className="py-2 text-sm text-black/40">No collections yet</p>
                ) : (
                  categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => { navigateTo('collections', slugify(c.name)); setMobileOpen(false); }}
                      className="w-full text-left py-2.5 text-sm font-semibold tracking-wide text-black hover:text-sale transition-colors"
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ── Search overlay ── */}
      {searchOpen && (
        <SearchOverlay
          onClose={() => setSearchOpen(false)}
          onGoProduct={(product) => {
            setSearchOpen(false);
            navigate(`/product/${productParam(product.title, product.product_code ?? product.id)}`);
          }}
        />
      )}
    </>
  );
}
