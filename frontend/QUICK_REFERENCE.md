# Quick Reference Guide

## Common Tasks

### Start Development Server
```bash
cd frontend
npm run dev
```
Opens at http://localhost:3000

### Build for Production
```bash
cd frontend
npm run build
npm start
```

### Install Dependencies
```bash
cd frontend
npm install
```

---

## File Reference

### Where to Find Things

| What you need | Where to look |
|---------------|---------------|
| Main page logic | `pages/index.js` |
| UI components | `components/*.js` |
| Data fetching | `hooks/usePlayerData.js` |
| Formatting/calculations | `utils/statsUtils.js` |
| Colors/styling | `theme/theme.js` |
| Global CSS | `styles/globals.css` |

### Component Cheat Sheet

```javascript
// Header
<Header />

// Search
<SearchBar 
  players={allPlayers}
  selectedPlayer={selectedPlayer}
  onSelectPlayer={handleSelectPlayer}
  searchQuery={searchQuery}
  onSearchChange={setSearchQuery}
/>

// Player Info
<PlayerInfo player={selectedPlayer} />

// Stats Tables
<WeeklyStatsTable 
  weeklyStats={weeklyStats}
  position={selectedPlayer.position}
  playerStats={playerStats}
  loading={loading}
/>

<YearlyStatsTable 
  playerStats={playerStats}
  position={selectedPlayer.position}
  loading={loading}
/>

<AdvancedMetricsTable
  advancedMetrics={advancedMetrics}
  position={selectedPlayer.position}
  playerStats={playerStats}
  loading={loading}
/>
```

### Hook Cheat Sheet

```javascript
// Fetch all players
const { players, loading, error } = useAllPlayers(apiUrl);

// Fetch player stats
const { stats, loading, error, refetch } = usePlayerStats(playerId, apiUrl);

// Fetch weekly stats
const { weeklyStats, loading, error } = useWeeklyStats(playerId, apiUrl, season);

// Fetch advanced metrics
const { advancedMetrics, loading, error } = useAdvancedMetrics(playerId, apiUrl);

// Get background image (with special variant chance)
const backgroundImage = useBackgroundImage(0.01);
```

### Utility Function Cheat Sheet

```javascript
import {
  // Formatting
  formatNumber,           // formatNumber(123.456, 1) => "123.5"
  formatPercentage,       // formatPercentage(67.5) => "67.5%"
  formatYards,            // formatYards(1234) => "1,234"
  displayStat,            // displayStat(0) => "-"
  formatEPA,              // formatEPA(12.5) => { value: "12.5", color: "#4caf50" }
  
  // Calculations
  calculateCompletionPercentage, // (20, 30) => "66.7%"
  
  // Position logic
  shouldShowPassingColumns,   // "QB" => true
  shouldShowRushingColumns,   // ("QB", stats) => depends on data
  shouldShowReceivingColumns, // "QB" => false
  
  // Data processing
  groupStatsBySeason,     // Groups GameStat[] by season
  sortWeeklyStats,        // Sorts by week number
  
  // UI helpers
  getPositionColor,       // "QB" => "#1976d2"
  formatPlayerLabel,      // player => "Player Name - QB (Team)"
} from '../utils/statsUtils';
```

### Theme Access

```javascript
// In component JSX
sx={{
  // Colors
  color: 'primary.main',          // #1976d2
  bgcolor: 'background.paper',    // #151b2d
  
  // Spacing (8px base unit)
  p: 2,        // padding: 16px
  m: 4,        // margin: 32px
  gap: 3,      // gap: 24px
  
  // Responsive
  fontSize: { xs: '1rem', md: '1.5rem' },
  display: { xs: 'block', md: 'flex' },
  
  // Borders
  borderRadius: 'borderRadius',   // 12px
  border: '1px solid',
  borderColor: 'divider',
}}
```

---

## Adding New Features

### 1. New Stat Table

**Step 1**: Create component
```javascript
// components/NewTable.js
import StatsTableWrapper from './StatsTableWrapper';
import { TableHead, TableBody, TableRow, TableCell } from '@mui/material';

export default function NewTable({ data, loading }) {
  return (
    <StatsTableWrapper
      title="New Stats"
      subtitle="Description"
      loading={loading}
      dataLength={data.length}
    >
      <TableHead>
        <TableRow>
          <TableCell>Column 1</TableCell>
          <TableCell align="right">Column 2</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map(row => (
          <TableRow key={row.id}>
            <TableCell>{row.field1}</TableCell>
            <TableCell align="right">{row.field2}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </StatsTableWrapper>
  );
}
```

**Step 2**: Use in index.js
```javascript
import NewTable from '../components/NewTable';

// In JSX
<NewTable data={someData} loading={someLoading} />
```

### 2. New Data Hook

**Step 1**: Add to `hooks/usePlayerData.js`
```javascript
export function useNewData(playerId, apiUrl) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!playerId || !apiUrl) return;

    setLoading(true);
    fetch(`${apiUrl}/api/new-endpoint/${playerId}`)
      .then(r => r.json())
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [playerId, apiUrl]);

  return { data, loading, error };
}
```

**Step 2**: Use in component
```javascript
const { data, loading, error } = useNewData(selectedPlayer?.id, apiUrl);
```

### 3. New Utility Function

**Step 1**: Add to `utils/statsUtils.js`
```javascript
/**
 * Description of what it does
 * @param {type} param - Description
 * @returns {type} Description
 */
export function newUtilityFunction(param) {
  // Logic here
  return result;
}
```

**Step 2**: Use in component
```javascript
import { newUtilityFunction } from '../utils/statsUtils';

const result = newUtilityFunction(value);
```

### 4. Theme Customization

**Edit `theme/theme.js`:**
```javascript
palette: {
  primary: {
    main: '#YOUR_COLOR',
  },
  // ... rest of palette
}
```

All components update automatically!

---

## Troubleshooting

### Page won't load
1. Check console for errors (F12)
2. Verify API is running (`http://localhost:4000`)
3. Clear Next.js cache: `rm -rf .next`
4. Restart dev server

### Styling looks wrong
1. Check if theme is imported in component
2. Verify sx prop syntax
3. Look for console warnings
4. Clear browser cache

### Component not showing data
1. Check if data is being fetched (use React DevTools)
2. Verify API endpoint is correct
3. Check for loading state
4. Look at error state

### TypeScript errors (if using TS)
1. Run `npm run type-check`
2. Check prop types match
3. Verify imports

---

## Best Practices

### DO ✅
- Use theme colors instead of hardcoded values
- Add JSDoc comments to functions
- Keep components small and focused
- Use descriptive variable names
- Handle loading and error states
- Use responsive breakpoints

### DON'T ❌
- Hardcode colors or spacing
- Put business logic in components
- Create giant components
- Ignore TypeScript errors (if using TS)
- Skip error handling
- Forget mobile users

---

## Keyboard Shortcuts (VS Code)

| Action | Shortcut |
|--------|----------|
| Find file | `Ctrl+P` |
| Find in files | `Ctrl+Shift+F` |
| Go to definition | `F12` |
| Rename symbol | `F2` |
| Format code | `Shift+Alt+F` |
| Toggle terminal | `` Ctrl+` `` |

---

## Helpful Links

- [Material-UI Docs](https://mui.com/)
- [Next.js Docs](https://nextjs.org/docs)
- [React Hooks](https://react.dev/reference/react)
- [NFL Data API](http://localhost:4000/api/players)

---

## Questions?

1. Check `ARCHITECTURE.md` for detailed documentation
2. Look at existing components for examples
3. Review `REFACTORING_SUMMARY.md` for before/after comparison
4. Search the codebase for similar implementations

**Remember**: Every component, hook, and utility function has comments explaining what it does!
