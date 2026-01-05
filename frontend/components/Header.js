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
    <Card sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2, px: { xs: 2, sm: 3 } }}>
        <Box
          component="img"
          src="/logo-alt.svg"
          alt="Actual NFL Analytics Logo"
          sx={{
            height: { xs: '60px', sm: '80px' },
            width: 'auto',
          }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CardHeader
            title={
              <span
                style={{
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: 'clamp(1.5rem, 4vw, 2.5rem)',
                  letterSpacing: '-0.5px',
                }}
              >
                Actual NFL Analytics
              </span>
            }
            subheader="Search for a player to view their stats across all years since 1999"
            titleTypographyProps={{ variant: 'h4', sx: { fontWeight: 900 } }}
            sx={{ p: 0 }}
          />
        </Box>

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
