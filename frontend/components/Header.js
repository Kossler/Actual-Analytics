import Link from 'next/link';
import { useRouter } from 'next/router';
import { Card, CardHeader, Box, Button } from '@mui/material';

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
        <Button
          component={Link}
          href="/"
          variant="outlined"
          size="small"
          sx={{ ml: 'auto', flexShrink: 0 }}
        >
          Home
        </Button>
      </Box>
    </Card>
  );
}
