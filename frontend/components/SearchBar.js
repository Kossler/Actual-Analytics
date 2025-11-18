import { Card, CardContent, Box, TextField, Autocomplete, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { formatPlayerLabel } from '../utils/statsUtils';

/**
 * SearchBar component for player search
 * @param {Array} players - List of all players
 * @param {object} selectedPlayer - Currently selected player
 * @param {function} onSelectPlayer - Callback when a player is selected
 * @param {string} searchQuery - Current search query
 * @param {function} onSearchChange - Callback when search query changes
 */
export default function SearchBar({ 
  players, 
  selectedPlayer, 
  onSelectPlayer, 
  searchQuery, 
  onSearchChange 
}) {
  return (
    <Card sx={{ mb: 4 }}>
      <CardContent>
        <Box sx={{ maxWidth: '600px' }}>
          <Autocomplete
            options={players}
            getOptionLabel={formatPlayerLabel}
            filterOptions={(options, state) => {
              if (!state.inputValue) return [];
              return options
                .filter(option =>
                  option.name.toLowerCase().includes(state.inputValue.toLowerCase())
                )
                .slice(0, 10);
            }}
            value={selectedPlayer}
            onChange={(event, newValue) => {
              if (newValue) {
                onSelectPlayer(newValue);
              }
            }}
            inputValue={searchQuery}
            onInputChange={(event, newInputValue) => {
              onSearchChange(newInputValue);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Search for a player..."
                variant="outlined"
                size="medium"
                InputProps={{
                  ...params.InputProps,
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'primary.main' }} />,
                }}
              />
            )}
            renderOption={(props, option) => (
              <Box
                {...props}
                component="li"
                sx={{
                  py: 1.5,
                  px: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  '&:last-child': {
                    borderBottom: 'none',
                  },
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {option.name}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {option.position} • {option.team}
                  </Typography>
                </Box>
              </Box>
            )}
            noOptionsText="No players found"
            sx={{
              '& .MuiOutlinedInput-root': {
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
              },
            }}
          />
        </Box>
      </CardContent>
    </Card>
  );
}
