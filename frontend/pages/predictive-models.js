import React from 'react';
import { ThemeProvider } from '@mui/material/styles';
import { Container, Box } from '@mui/material';
import theme from '../theme/theme';
import Header from '../components/Header';
import { useBackgroundImage } from '../hooks/usePlayerData';

export default function PredictiveModels() {
  // Use the same background logic as other pages
  const backgroundImage = useBackgroundImage ? useBackgroundImage(0.01) : 'none';

  return (
    <ThemeProvider theme={theme}>
      <Box
        sx={{
          bgcolor: 'background.default',
          minHeight: '100vh',
          py: 4,
          backgroundImage: backgroundImage,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.70)',
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1 }}>
          <Header />
          <Box sx={{ maxWidth: '700px', mx: 'auto', py: 8, px: { xs: 2, sm: 4 } }}>
            <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginBottom: '1rem', color: '#06b6d4' }}>Predictive Models</h1>
            <p style={{ fontSize: '1.125rem', color: '#e0e0e0', marginBottom: '2rem' }}>
              This section will feature predictive models and analytics tools. Stay tuned for updates!
            </p>
            {/* Add model cards or content here in the future */}
          </Box>
        </Container>
      </Box>
    </ThemeProvider>
  );
}
