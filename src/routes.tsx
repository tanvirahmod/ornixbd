import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CheckoutPage from './pages/CheckoutPage';
import CartPage from './pages/CartPage';
import ShopBySizePage from './pages/ShopBySizePage';
import StoryPage from './pages/StoryPage';
import PolicyPage from './pages/PolicyPage';
import AdminPage from './pages/AdminPage';
import FeedbackPage from './pages/FeedbackPage';
import SingleCollectionPage from './pages/SingleCollectionPage';
import NewArrivalsPage from './pages/NewArrivalsPage';
import HotDealsPage from './pages/HotDealsPage';
import TrackOrderPage from './pages/TrackOrderPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'collections', element: <ShopPage /> },
      { path: 'collections/:slug', element: <SingleCollectionPage /> },
      { path: 'new-arrivals', element: <NewArrivalsPage /> },
      { path: 'hot-deals', element: <HotDealsPage /> },
      { path: 'product/:productId', element: <ProductPage /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'shop-by-size', element: <ShopBySizePage /> },
      { path: 'shop-by-size/:size', element: <ShopBySizePage /> },
      { path: 'story', element: <StoryPage /> },
      { path: 'policies', element: <PolicyPage /> },
      { path: 'checkout/:productId', element: <CheckoutPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
      { path: 'track', element: <TrackOrderPage /> },
    ],
  },
  {
    path: '/admin',
    element: <AdminPage />,
  },
  { path: '/shop', element: <Navigate to="/collections" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);

export default router;
