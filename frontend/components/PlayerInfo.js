import { Avatar, Box, Card, CardHeader, Chip, Typography } from '@mui/material';
import { getPositionColor } from '../utils/statsUtils';

function formatHeight(height) {
  if (height == null) return null;
  const raw = typeof height === 'string' ? height.trim() : String(height);
  const asInt = Number.parseInt(raw, 10);

  // If the API provides inches (common in NFL data), convert to feet/inches.
  if (Number.isFinite(asInt) && asInt >= 36 && asInt <= 96) {
    const feet = Math.floor(asInt / 12);
    const inches = asInt % 12;
    return `${feet}'${inches}"`;
  }

  return raw;
}

function formatWeight(weight) {
  if (weight == null) return null;
  const raw = typeof weight === 'string' ? weight.trim() : String(weight);
  const asInt = Number.parseInt(raw, 10);

  // If the API provides pounds (common in NFL data), show as "### lb".
  if (Number.isFinite(asInt) && asInt >= 80 && asInt <= 450) {
    return `${asInt} lb`;
  }

  return raw;
}

function InfoItem({ label, value }) {
  if (!value) return null;
  return (
    <Box sx={{ minWidth: 100 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.3 }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

/**
 * PlayerInfo component displaying selected player details
 * @param {object} player - Selected player object
 */
export default function PlayerInfo({ player }) {
  if (!player) return null;

  const jerseyNumber = player.jersey_number ?? player.jerseyNumber ?? player.jersey;
  const college = player.college_name ?? player.college ?? player.collegeName;
  const height = formatHeight(player.height);
  const weight = formatWeight(player.weight);
  const headshot = player.headshot ?? player.headshot_url ?? player.photo ?? player.photo_url;

  return (
    <Card sx={{ mb: 4 }}>
      <CardHeader
        sx={{
          '& .MuiCardHeader-action': {
            alignSelf: 'center',
            mt: 0,
          },
          '& .MuiCardHeader-content': {
            minWidth: 0,
          },
        }}
        avatar={
          headshot ? (
            <Avatar
              src={headshot}
              alt={player.name}
              sx={{ width: { xs: 64, sm: 80, md: 100 }, height: { xs: 64, sm: 80, md: 100 } }}
              imgProps={{ loading: 'lazy', referrerPolicy: 'no-referrer' }}
            />
          ) : (
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
          )
        }
        title={
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'flex-start', sm: 'center' },
              gap: 1,
              flexWrap: 'wrap',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                lineHeight: 1.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {player.name}
            </Typography>
            <Chip
              label={player.position}
              size="small"
              variant="outlined"
              sx={{
                borderColor: getPositionColor(player.position),
                color: getPositionColor(player.position),
                fontWeight: 700,
              }}
            />
          </Box>
        }
        subheader={`${player.position} • ${player.team_name || player.team || ''}`}
        action={
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              gap: 2,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            <InfoItem label="Jersey" value={jerseyNumber ? `#${jerseyNumber}` : null} />
            <InfoItem label="College" value={college} />
            <InfoItem label="Height" value={height} />
            <InfoItem label="Weight" value={weight} />
          </Box>
        }
        subheaderTypographyProps={{
          variant: 'body1',
          sx: { mt: 0.5 },
        }}
      />
    </Card>
  );
}
