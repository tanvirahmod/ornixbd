import { ShoppingBag, Home, Search, MessageSquare } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';

interface NavbarProps {
  onNavigate: (page: string, param?: string) => void;
  currentPage: string;
}

export default function Navbar({ onNavigate, currentPage }: NavbarProps) {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 glass shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-stone-900 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-brand-600 transition-colors duration-300">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
          <span className="font-display font-bold text-stone-900 text-xl tracking-tight">
            {t('brandName')}
          </span>
        </button>

        <nav className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => onNavigate('home')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              currentPage === 'home'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
            }`}
          >
            <Home className="w-4 h-4" />
            {t('home')}
          </button>
          <button
            onClick={() => onNavigate('shop')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              currentPage === 'shop'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
            }`}
          >
            <Search className="w-4 h-4" />
            {t('shop')}
          </button>
          <button
            onClick={() => onNavigate('feedback')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              currentPage === 'feedback'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:bg-stone-200/60 hover:text-stone-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {t('feedback')}
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition-all ${
              language === 'en'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLanguage('bn')}
            className={`rounded-full px-3 py-2 text-xs font-semibold transition-all ${
              language === 'bn'
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-100'
            }`}
          >
            বাংলা
          </button>
        </div>

        <button
          onClick={() => onNavigate('home')}
          className="sm:hidden text-stone-600 hover:text-stone-900 transition-colors"
        >
          <Home className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
