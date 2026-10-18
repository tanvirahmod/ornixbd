import { Outlet, ScrollRestoration } from 'react-router-dom';
import Navbar from './Navbar';
import HelpFooter from './HelpFooter';
import WhatsAppFloat from './WhatsAppFloat';
import { useNavigation } from '../lib/navigation';

export default function Layout() {
  const navigateTo = useNavigation();

  return (
    <>
      <ScrollRestoration />
      <div className="storefront">
        <Navbar />
        <main className="storefront-content">
          <Outlet />
        </main>
        <HelpFooter onNavigate={navigateTo} />
        <WhatsAppFloat />
      </div>
    </>
  );
}
