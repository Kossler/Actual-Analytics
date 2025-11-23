import os
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_batch
import nflreadpy as nfl
import json

load_dotenv()

def create_and_load_contracts():
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cur = conn.cursor()

    print("[INFO] Loading contracts data from nflreadpy...")
    contracts = nfl.load_contracts()
    if hasattr(contracts, 'to_pandas'):
        contracts = contracts.to_pandas()

    # Create table if it doesn't exist
    cur.execute("""
        CREATE TABLE IF NOT EXISTS contracts (
            player TEXT,
            position TEXT,
            team TEXT,
            is_active BOOLEAN,
            year_signed INT,
            years INT,
            value FLOAT,
            apy FLOAT,
            guaranteed FLOAT,
            apy_cap_pct FLOAT,
            inflated_value FLOAT,
            inflated_apy FLOAT,
            inflated_guaranteed FLOAT,
            player_page TEXT,
            otc_id TEXT,
            gsis_id TEXT,
            date_of_birth TEXT,
            height TEXT,
            weight TEXT,
            college TEXT,
            draft_year INT,
            draft_round INT,
            draft_overall INT,
            draft_team TEXT,
            cols TEXT
        );
    """)
    conn.commit()

    # Optional: clear table before loading
    cur.execute("TRUNCATE contracts;")
    conn.commit()

    # Prepare data for batch insert (convert numeric fields to float)
    def convert_row(row):
        row = list(row)
        # Indices of numeric fields to convert to float
        float_indices = [5, 6, 7, 8, 9, 10, 11, 12]  # years, value, apy, guaranteed, apy_cap_pct, inflated_value, inflated_apy, inflated_guaranteed
        for idx in float_indices:
            try:
                row[idx] = float(row[idx]) if row[idx] is not None else None
            except (ValueError, TypeError):
                row[idx] = None
        # 'cols' is the last field and may be a list of dicts
        if isinstance(row[-1], (dict, list)):
            row[-1] = json.dumps(row[-1])
        return tuple(row)
    rows = [convert_row(row) for row in contracts.iter_rows()]
    print(f"[INFO] Inserting {len(rows)} rows into contracts table...")

    insert_sql = """
        INSERT INTO contracts VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """
    execute_batch(cur, insert_sql, rows, page_size=1000)
    conn.commit()
    print("[OK] Contracts table created and populated.")

    cur.close()
    conn.close()

if __name__ == "__main__":
    create_and_load_contracts()