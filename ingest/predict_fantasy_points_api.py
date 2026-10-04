import sys
import pandas as pd
import joblib
import psycopg2
import os
import json

def fetch_latest_stats(player_id):
    DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/railway')
    conn = psycopg2.connect(DB_URL)
    query = '''
        SELECT pass_attempt, rec_attempt, rush_attempt,
               pass_yards_gained, rec_yards_gained, rush_yards_gained,
               pass_touchdown, rec_touchdown, rush_touchdown,
               pass_interception, rec_fumble_lost, rush_fumble_lost,
               total_fantasy_points
        FROM ff_opportunity
        WHERE player_id = %s
        ORDER BY season DESC, week DESC
        LIMIT 1
    '''
    df = pd.read_sql(query, conn, params=(player_id,))
    conn.close()
    if df.empty:
        return None
    row = df.iloc[0]
    # Build previous stats as features
    features = {
        'prev_pass_attempt': row['pass_attempt'],
        'prev_rec_attempt': row['rec_attempt'],
        'prev_rush_attempt': row['rush_attempt'],
        'prev_pass_yards_gained': row['pass_yards_gained'],
        'prev_rec_yards_gained': row['rec_yards_gained'],
        'prev_rush_yards_gained': row['rush_yards_gained'],
        'prev_pass_touchdown': row['pass_touchdown'],
        'prev_rec_touchdown': row['rec_touchdown'],
        'prev_rush_touchdown': row['rush_touchdown'],
        'prev_pass_interception': row['pass_interception'],
        'prev_rec_fumble_lost': row['rec_fumble_lost'],
        'prev_rush_fumble_lost': row['rush_fumble_lost'],
        'prev_total_fantasy_points': row['total_fantasy_points'],
    }
    return features

def predict_fantasy_points(player_id):
    features = fetch_latest_stats(player_id)
    if features is None:
        return {'error': 'No data for player_id'}
    model = joblib.load('fantasy_points_model.joblib')
    X = pd.DataFrame([features])
    pred = model.predict(X)[0]
    return {'player_id': player_id, 'predicted_fantasy_points': float(pred)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'player_id required as argument'}))
        sys.exit(1)
    player_id = sys.argv[1]
    result = predict_fantasy_points(player_id)
    print(json.dumps(result))
