import { Card, CardHeader, Chip } from '@mui/material';
import { getPositionColor } from '../utils/statsUtils';

/**
 * PlayerInfo component displaying selected player details
 * @param {object} player - Selected player object
 */
export default function PlayerInfo({ player }) {
  if (!player) return null;

  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        title={player.name}
        subheader={`${player.position} • ${player.team}`}
        avatar={
          <Chip
            label={player.position}
            size="medium"
            variant="outlined"
            sx={{
              borderColor: getPositionColor(player.position),
              color: getPositionColor(player.position),
              fontWeight: 700,
              fontSize: '0.875rem',
            }}
          />
        }
        titleTypographyProps={{
          variant: 'h5',
          sx: { fontWeight: 700 },
        }}
        subheaderTypographyProps={{
          variant: 'body1',
          sx: { mt: 0.5 },
        }}
      />
    </Card>
  );
}
