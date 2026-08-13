import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Search, Menu, X, ChevronDown } from 'lucide-react';
import { useNavigation, getPageFromPathname } from '../lib/navigation';
import { slugify } from '../lib/utils';
import { useAnnouncements, useCategories, getAnnouncementText } from '../lib/siteConfig';

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const navigateTo = useNavigation();
  const { pathname } = useLocation();
  const currentPage = getPageFromPathname(pathname);
  const { announcements, loading: annLoading } = useAnnouncements();
  const announcementText = getAnnouncementText(announcements, annLoading);
  const { categories } = useCategories();

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
      <header className="sticky top-0 z-50 bg-white border-b border-black/10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

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

            {/* Brand Logo — centered */}
            <button
              onClick={() => navigateTo('home')}
              className="font-display text-2xl sm:text-3xl tracking-widest text-black hover:text-sale transition-colors duration-200 uppercase"
            >
               ORNIX
            </button>
          </div>

          {/* ── Right: Icons ── */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateTo('shop')}
              aria-label="Search"
              className="p-2 text-black hover:text-sale transition-colors duration-150"
            >
              <Search className="w-5 h-5" strokeWidth={2} />
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
    </>
  );
}
