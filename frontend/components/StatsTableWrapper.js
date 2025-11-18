import {
  Card,
  CardHeader,
  CardContent,
  TableContainer,
  Table,
  CircularProgress,
  Box,
} from '@mui/material';

/**
 * StatsTableWrapper component - wraps stats tables with consistent styling
 * @param {string} title - Table title
 * @param {string} subtitle - Table subtitle
 * @param {boolean} loading - Loading state
 * @param {number} dataLength - Length of data array
 * @param {React.ReactNode} children - Table content
 */
export default function StatsTableWrapper({ 
  title, 
  subtitle, 
  loading, 
  dataLength, 
  children 
}) {
  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        title={title}
        subheader={subtitle}
        titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
        subheaderTypographyProps={{ variant: 'body2' }}
      />
      <CardContent sx={{ p: 0 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : dataLength === 0 ? (
          <Box sx={{ textAlign: 'center', p: 4, color: 'text.secondary' }}>
            No stats available
          </Box>
        ) : (
          <TableContainer
            sx={{
              maxHeight: { xs: '500px', md: '700px' },
              overflowX: 'auto',
              overflowY: 'auto',
              '&::-webkit-scrollbar': {
                width: '8px',
                height: '8px',
              },
              '&::-webkit-scrollbar-track': {
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '4px',
              },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(25, 118, 210, 0.5)',
                borderRadius: '4px',
                '&:hover': {
                  background: 'rgba(25, 118, 210, 0.7)',
                },
              },
            }}
          >
            <Table size="small" stickyHeader>
              {children}
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
