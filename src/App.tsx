import { RouterProvider } from 'react-router-dom';
import router from './routes';
import { LanguageProvider } from './lib/LanguageContext';
import { CartProvider } from './lib/CartContext';

export default function App() {
  return (
    <LanguageProvider>
      <CartProvider>
        <RouterProvider router={router} />
      </CartProvider>
    </LanguageProvider>
  );
}
