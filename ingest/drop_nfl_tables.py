
import psycopg2
import os
import re

# Read DATABASE_URL from .env file
def get_database_url():
    env_path = os.path.join(os.path.dirname(__file__), '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DATABASE_URL='):
                    return line.strip().split('=', 1)[1]
    # Fallback to environment variable
    return os.getenv('DATABASE_URL')

def parse_database_url(url):
    # Example: postgresql://user:pass@host:port/dbname
    regex = r'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/(\w+)'
    match = re.match(regex, url)
    if not match:
        raise ValueError('Invalid DATABASE_URL format')
    user, password, host, port, dbname = match.groups()
    return {
        'user': user,
        'password': password,
        'host': host,
        'port': port,
        'dbname': dbname
    }

# List of tables to drop
TABLES = [
    '_prisma_migrations',
    'AdvancedMetrics',
    'GameStat',
    'Play',
    'Player',
    'PlayerStats'
]

def drop_tables():
    conn = None
    try:
        db_url = get_database_url()
        creds = parse_database_url(db_url)
        conn = psycopg2.connect(
            dbname=creds['dbname'],
            user=creds['user'],
            password=creds['password'],
            host=creds['host'],
            port=creds['port']
        )
        cur = conn.cursor()
        for table in TABLES:
              print(f"Dropping table: {table}")
              cur.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')
        conn.commit()
        cur.close()
        print("All specified tables dropped successfully.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    drop_tables()
