import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib
import psycopg2
import os

# --- CONFIG ---
DB_URL = os.environ['DATABASE_URL']

# --- DATA EXTRACTION ---
def fetch_ff_opportunity():
    conn = psycopg2.connect(DB_URL)
    query = '''
        SELECT season, week, player_id, full_name, position, posteam,
               pass_attempt, rec_attempt, rush_attempt,
               pass_yards_gained, rec_yards_gained, rush_yards_gained,
               pass_touchdown, rec_touchdown, rush_touchdown,
               pass_interception, rec_fumble_lost, rush_fumble_lost,
               total_fantasy_points
        FROM ff_opportunity
        WHERE total_fantasy_points IS NOT NULL
    '''
    df = pd.read_sql(query, conn)
    conn.close()
    return df

def build_features(df):
    # Simple features: last week's stats (group by player)
    df = df.sort_values(['player_id', 'season', 'week'])
    for col in [
        'pass_attempt', 'rec_attempt', 'rush_attempt',
        'pass_yards_gained', 'rec_yards_gained', 'rush_yards_gained',
        'pass_touchdown', 'rec_touchdown', 'rush_touchdown',
        'pass_interception', 'rec_fumble_lost', 'rush_fumble_lost',
        'total_fantasy_points']:
        df[f'prev_{col}'] = df.groupby('player_id')[col].shift(1)
    # Drop rows with missing previous stats
    df = df.dropna()
    return df

def train_model(df):
    feature_cols = [
        'prev_pass_attempt', 'prev_rec_attempt', 'prev_rush_attempt',
        'prev_pass_yards_gained', 'prev_rec_yards_gained', 'prev_rush_yards_gained',
        'prev_pass_touchdown', 'prev_rec_touchdown', 'prev_rush_touchdown',
        'prev_pass_interception', 'prev_rec_fumble_lost', 'prev_rush_fumble_lost',
        'prev_total_fantasy_points'
    ]
    X = df[feature_cols]
    y = df['total_fantasy_points']
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    print(f'Mean Absolute Error: {mean_absolute_error(y_test, preds):.2f}')
    return model

def main():
    df = fetch_ff_opportunity()
    df = build_features(df)
    model = train_model(df)
    # Save model
    joblib.dump(model, 'fantasy_points_model.joblib')
    print('Model saved as fantasy_points_model.joblib')

if __name__ == '__main__':
    main()
