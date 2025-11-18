import { Card, CardHeader, Box } from '@mui/material';

/**
 * Header component with logo and title
 */
export default function Header() {
  return (
    <Card sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
        <Box
          component="img"
          src="/Actual NFL Analytics icon - Alt.svg"
          alt="Actual NFL Analytics Logo"
          sx={{
            height: { xs: '60px', sm: '80px' },
            width: 'auto',
          }}
        />
        <Box sx={{ flex: 1 }}>
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
            subheader="Search for a player to view their stats across all years since 2016"
            titleTypographyProps={{ variant: 'h4', sx: { fontWeight: 900 } }}
            sx={{ p: 0 }}
          />
        </Box>
      </Box>
    </Card>
  );
}
