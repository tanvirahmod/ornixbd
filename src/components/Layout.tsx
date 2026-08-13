import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import HelpFooter from './HelpFooter';
import { useLanguage } from '../lib/LanguageContext';
import { useNavigation } from '../lib/navigation';

export default function Layout() {
  const { t } = useLanguage();
  const navigateTo = useNavigation();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <Navbar />
      <button
        onClick={() => navigateTo('admin')}
        className="fixed bottom-4 left-4 z-50 bg-stone-900 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
      >
        {t('admin')}
      </button>
      <Outlet />
      <HelpFooter onNavigate={navigateTo} />
    </>
  );
}
