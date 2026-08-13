import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import ProductPage from './pages/ProductPage';
import CheckoutPage from './pages/CheckoutPage';
import AdminPage from './pages/AdminPage';
import FeedbackPage from './pages/FeedbackPage';
import SingleCollectionPage from './pages/SingleCollectionPage';
import NewArrivalsPage from './pages/NewArrivalsPage';
import HotDealsPage from './pages/HotDealsPage';

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
      { path: 'checkout/:productId', element: <CheckoutPage /> },
      { path: 'feedback', element: <FeedbackPage /> },
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
