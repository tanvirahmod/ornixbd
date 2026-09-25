import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import HelpFooter from './HelpFooter';
import WhatsAppFloat from './WhatsAppFloat';
import { useNavigation } from '../lib/navigation';

export default function Layout() {
  const navigateTo = useNavigation();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <Navbar />
      <Outlet />
      <HelpFooter onNavigate={navigateTo} />
      <WhatsAppFloat />
    </>
  );
}
