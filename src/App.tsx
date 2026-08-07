import { useState } from 'react';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CheckoutPage from './pages/CheckoutPage';
import AdminPage from './pages/AdminPage';
import FeedbackPage from './pages/FeedbackPage';
import Navbar from './components/Navbar';
import { LanguageProvider, useLanguage } from './lib/LanguageContext';

type Page = 'home' | 'shop' | 'product' | 'checkout' | 'admin' | 'feedback';

function AppContent() {
  const { t } = useLanguage();
  const [page, setPage] = useState<Page>('home');
  const [productId, setProductId] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const navigate = (target: string, param?: string) => {
    if (target === 'home') {
      setPage('home');
    } else if (target === 'shop') {
      setPage('shop');
    } else if (target === 'product' && param) {
      setProductId(param);
      setPage('product');
    } else if (target === 'checkout' && param) {
      const [id, size] = param.split('__');
      setProductId(id);
      setSelectedSize(size ?? null);
      setPage('checkout');
    } else if (target === 'admin') {
      setPage('admin');
    } else if (target === 'feedback') {
      setPage('feedback');
    }
    window.scrollTo(0, 0);
  };

  const isStorePage = page !== 'admin';

  return (
    <>
      {isStorePage && <Navbar onNavigate={navigate} currentPage={page} />}

      {/* Admin button — bottom-left corner */}
      {isStorePage && (
        <button
          onClick={() => navigate('admin')}
          className="fixed bottom-4 left-4 z-50 bg-stone-900 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
        >
          {t('admin')}
        </button>
      )}

      {page === 'home' && <HomePage onNavigate={navigate} />}
      {page === 'shop' && <ShopPage onNavigate={navigate} />}
      {page === 'product' && <ProductPage productId={productId} onNavigate={navigate} />}
      {page === 'checkout' && (
        <CheckoutPage productId={productId} selectedSize={selectedSize} onNavigate={navigate} />
      )}
      {page === 'admin' && <AdminPage onNavigate={navigate} />}
      {page === 'feedback' && <FeedbackPage onNavigate={navigate} />}
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
