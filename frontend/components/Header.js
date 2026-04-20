
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Card, Box } from '@mui/material';
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const navItems = [
  { label: 'Players', href: '/' },
  { label: 'Predictive Models', href: '/predictive-models' },
];

/**
 * Header component with logo and title
 */
export default function Header() {
  const router = useRouter();
  void router;

  return (
    <Card sx={{ mb: 4, position: 'relative' }}
      className="header-fade-container"
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, px: { xs: 2, sm: 3 } }}>
        <Box sx={{ position: 'relative', width: { xs: 'auto', sm: '20%' }, height: 'auto', minWidth: 0, maxWidth: { xs: '100vw', sm: 'none' } }}>
          <img
            src="/logo-main.png"
            alt="Second Level Analytics Logo"
            className="header-fade-img-main header-logo-img"
            style={{
              maxHeight: '200px',
              width: 'auto',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              position: 'relative',
              zIndex: 1,
            }}
          />
          <img
            src="/logo-alt.png"
            alt="Second Level Analytics Logo Alt"
            className="header-fade-img-alt header-logo-img"
            style={{
              maxHeight: '200px',
              width: 'auto',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 2,
            }}
          />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        <nav style={{ display: 'flex', gap: 8 }}>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} legacyBehavior>
              <a
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ${
                  useRouter().pathname === item.href || (item.href.startsWith('/#') && useRouter().asPath === item.href)
                    ? 'bg-gray-800 text-cyan-400'
                    : 'hover:bg-gray-800 hover:text-cyan-300'
                }`}
                style={{ textDecoration: 'none' }}
              >
                {item.label}
              </a>
            </Link>
          ))}
        </nav>
      </Box>
    </Card>
  );
}
