#!/usr/bin/env python3
"""
Quick duplicate check utility - run anytime to verify database health
"""
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

with engine.connect() as conn:
    # Check for duplicate pfr_ids
    result = conn.execute(text("""
        SELECT COUNT(*) FROM (
            SELECT pfr_id FROM "Player"
            GROUP BY pfr_id HAVING COUNT(*) > 1
        ) dup
    """))
    dup_pfr_ids = result.fetchone()[0]
    
    # Check for duplicate names (likely different players)
    result = conn.execute(text("""
        SELECT COUNT(*) FROM (
            SELECT name FROM "Player"
            GROUP BY name HAVING COUNT(*) > 1
        ) dup
    """))
    dup_names = result.fetchone()[0]
    
    # Check total stats
    result = conn.execute(text("""
        SELECT 
            (SELECT COUNT(*) FROM "Player") as players,
            (SELECT COUNT(DISTINCT "playerId") FROM "GameStat") as with_stats
    """))
    stats = result.fetchone()
    
    print("=" * 60)
    print("DATABASE HEALTH CHECK")
    print("=" * 60)
    print(f"Total players:          {stats[0]:,}")
    print(f"Players with stats:     {stats[1]:,}")
    print(f"Duplicate pfr_ids:      {dup_pfr_ids} {'✓' if dup_pfr_ids == 0 else '⚠️'}")
    print(f"Duplicate names:        {dup_names} (different players OK)")
    print("=" * 60)
    
    if dup_pfr_ids == 0:
        print("✅ Database is healthy!")
    else:
        print("⚠️  Issues detected - run fix_duplicate_players.py")
