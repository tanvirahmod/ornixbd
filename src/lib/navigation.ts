import { useNavigate } from 'react-router-dom';

type Target = 'home' | 'shop' | 'collections' | 'product' | 'checkout' | 'admin' | 'feedback' | 'new-arrivals' | 'hot-deals';

export function useNavigation() {
  const navigate = useNavigate();

  return function navigateTo(target: string, param?: string) {
    if (target === 'home') {
      navigate('/');
    } else if (target === 'shop') {
      navigate('/collections');
    } else if (target === 'collections' && param) {
      navigate(`/collections/${param}`);
    } else if (target === 'new-arrivals') {
      navigate('/new-arrivals');
    } else if (target === 'hot-deals') {
      navigate('/hot-deals');
    } else if (target === 'product' && param) {
      navigate(`/product/${param}`);
    } else if (target === 'checkout' && param) {
      const [id, sizeToken, qtyToken] = param.split('__');
      const search = new URLSearchParams();
      if (sizeToken && sizeToken !== 'none') search.set('size', sizeToken);
      search.set('qty', qtyToken ?? '1');
      navigate(`/checkout/${id}?${search.toString()}`);
    } else if (target === 'admin') {
      navigate('/admin');
    } else if (target === 'feedback') {
      navigate('/feedback');
    }
  };
}

export function getPageFromPathname(pathname: string): Target {
  if (pathname === '/') return 'home';
  const segment = pathname.split('/')[1] as Target;
  if (segment === 'collections') return 'shop';
  return segment;
}
