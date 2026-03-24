"""
SEED SCRIPT: Populate empty Supabase tables with believable data.
This populates the ML tables (computed_scores, processed_readings)
and infrastructure tables (sensor_status, wifi_status) that feed
the dashboard graphs.

Tables seeded:
  - ml.computed_scores       → Health/Risk/Stress per tub over time
  - ml.processed_readings    → Quality signals (moisture, climate, nutrient, vpd)
  - public.sensor_status     → Hardware online/offline status
  - public.wifi_status       → Zone connectivity snapshot

Prerequisites:
  - Tubs and experiments must already exist in the DB.
  - Run from the backend directory: python seed_data.py
"""

import os
import random
import math
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing SUPABASE_URL or SUPABASE_KEY in .env")

supabase = create_client(SUPABASE_URL.strip(), SUPABASE_KEY.strip())

# ──────────────────────────────────────────────
# 1. First, discover existing tubs & experiments
# ──────────────────────────────────────────────
print("[1/6] Fetching existing tubs and experiments...")

tubs_res = supabase.schema("experiment").from_("tubs").select("id,label,experiment_id").execute()
tubs = tubs_res.data or []
print(f"  Found {len(tubs)} tubs: {[t['id'] for t in tubs]}")

exp_res = supabase.schema("experiment").from_("experiments").select("id,title,started_at,ended_at,status").execute()
experiments = exp_res.data or []
print(f"  Found {len(experiments)} experiments: {[e['id'] for e in experiments]}")

if not tubs:
    print("  ⚠️  No tubs found! Cannot seed ML tables without tubs.")
    exit(1)

# Map tub_id -> experiment_id
tub_exp_map = {}
for t in tubs:
    tub_exp_map[t["id"]] = t.get("experiment_id")

# Parse experiment date ranges
exp_dates = {}
for e in experiments:
    start = datetime.fromisoformat(e["started_at"].replace("Z", "+00:00")) if e.get("started_at") else datetime(2025, 1, 1, tzinfo=timezone.utc)
    end = datetime.fromisoformat(e["ended_at"].replace("Z", "+00:00")) if e.get("ended_at") else datetime.now(timezone.utc)
    exp_dates[e["id"]] = (start, end)

# ──────────────────────────────────────────────
# 2. Seed ml.computed_scores
# ──────────────────────────────────────────────
print("\n[2/6] Checking ml.computed_scores...")

existing_scores = supabase.schema("ml").from_("computed_scores").select("id").limit(5).execute()
if existing_scores.data and len(existing_scores.data) > 0:
    print("  ✓ Already has data, skipping.")
else:
    print("  Seeding ml.computed_scores...")
    scores_rows = []
    for tub in tubs:
        tub_id = tub["id"]
        exp_id = tub_exp_map.get(tub_id)
        
        # Determine time range (last 30 days or experiment dates)
        if exp_id and exp_id in exp_dates:
            start, end = exp_dates[exp_id]
        else:
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=30)
        
        # Generate ~2 scores per day over the range
        total_days = max(1, (end - start).days)
        num_points = min(total_days * 2, 60)  # At most 60 points per tub
        
        # Each tub has a "personality" — some are healthier than others
        base_health = random.uniform(0.55, 0.92)
        base_risk = random.uniform(0.05, 0.45)
        base_stress = random.uniform(0.1, 0.5)
        
        for i in range(num_points):
            offset_hours = (total_days * 24) * (i / num_points)
            ts = start + timedelta(hours=offset_hours)
            
            # Add realistic drift + noise
            drift = 0.05 * math.sin(i * 0.3)  # Slow oscillation
            noise = random.gauss(0, 0.04)
            
            health = max(0.0, min(1.0, base_health + drift + noise))
            risk = max(0.0, min(1.0, base_risk - drift * 0.5 + random.gauss(0, 0.06)))
            stress = max(0.0, min(1.0, base_stress + random.gauss(0, 0.05)))
            
            row = {
                "tub_id": tub_id,
                "timestamp": ts.isoformat(),
                "health_t": round(health, 4),
                "risk_t": round(risk, 4),
                "stress_t": round(stress, 4),
            }
            if exp_id:
                row["experiment_id"] = exp_id
            scores_rows.append(row)
    
    # Insert in batches of 50
    for j in range(0, len(scores_rows), 50):
        batch = scores_rows[j:j+50]
        supabase.schema("ml").from_("computed_scores").insert(batch).execute()
    print(f"  ✓ Inserted {len(scores_rows)} computed_scores rows.")

# ──────────────────────────────────────────────
# 3. Seed ml.processed_readings
# ──────────────────────────────────────────────
print("\n[3/6] Checking ml.processed_readings...")

existing_readings = supabase.schema("ml").from_("processed_readings").select("id").limit(5).execute()
if existing_readings.data and len(existing_readings.data) > 0:
    print("  ✓ Already has data, skipping.")
else:
    print("  Seeding ml.processed_readings...")
    readings_rows = []
    for tub in tubs:
        tub_id = tub["id"]
        exp_id = tub_exp_map.get(tub_id)
        
        if exp_id and exp_id in exp_dates:
            start, end = exp_dates[exp_id]
        else:
            end = datetime.now(timezone.utc)
            start = end - timedelta(days=30)
        
        total_days = max(1, (end - start).days)
        num_points = min(total_days * 2, 60)
        
        # Quality signal baselines (0.0 to 1.0 scale)
        base_moisture_q = random.uniform(0.5, 0.9)
        base_climate_q = random.uniform(0.6, 0.95)
        base_nutrient_q = random.uniform(0.4, 0.85)
        base_vpd = random.uniform(0.3, 1.8)  # kPa
        
        for i in range(num_points):
            offset_hours = (total_days * 24) * (i / num_points)
            ts = start + timedelta(hours=offset_hours)
            
            # Gradual improvement over time with noise
            improvement = 0.05 * (i / num_points)
            
            q_moisture = max(0.0, min(1.0, base_moisture_q + improvement + random.gauss(0, 0.06)))
            q_climate = max(0.0, min(1.0, base_climate_q + improvement * 0.7 + random.gauss(0, 0.05)))
            q_nutrient = max(0.0, min(1.0, base_nutrient_q + improvement * 1.2 + random.gauss(0, 0.07)))
            vpd = max(0.0, base_vpd + random.gauss(0, 0.15))
            
            row = {
                "tub_id": tub_id,
                "timestamp": ts.isoformat(),
                "q_moisture": round(q_moisture, 4),
                "q_climate": round(q_climate, 4),
                "q_nutrient": round(q_nutrient, 4),
                "vpd_stress": round(vpd, 4),
            }
            if exp_id:
                row["experiment_id"] = exp_id
            readings_rows.append(row)
    
    for j in range(0, len(readings_rows), 50):
        batch = readings_rows[j:j+50]
        supabase.schema("ml").from_("processed_readings").insert(batch).execute()
    print(f"  ✓ Inserted {len(readings_rows)} processed_readings rows.")

# ──────────────────────────────────────────────
# 4. Seed public.sensor_status
# ──────────────────────────────────────────────
print("\n[4/6] Checking public.sensor_status...")

existing_status = supabase.from_("sensor_status").select("sensor_id").limit(5).execute()
if existing_status.data and len(existing_status.data) > 0:
    print("  ✓ Already has data, skipping.")
else:
    print("  Seeding public.sensor_status...")
    status_rows = []
    for tub in tubs:
        tub_id = tub["id"]
        is_active = random.random() > 0.15  # 85% chance of being active
        is_locked = False if is_active else (random.random() > 0.5)
        last_seen = (datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 120))).isoformat()
        
        status_rows.append({
            "sensor_id": f"SEN-{tub_id:03d}",
            "tub_id": tub_id,
            "is_active": is_active,
            "is_locked": is_locked,
            "last_seen": last_seen,
        })
    
    supabase.from_("sensor_status").insert(status_rows).execute()
    print(f"  ✓ Inserted {len(status_rows)} sensor_status rows.")

# ──────────────────────────────────────────────
# 5. Seed public.wifi_status
# ──────────────────────────────────────────────
print("\n[5/6] Checking public.wifi_status...")

existing_wifi = supabase.from_("wifi_status").select("location").limit(5).execute()
if existing_wifi.data and len(existing_wifi.data) > 0:
    print("  ✓ Already has data, skipping.")
else:
    print("  Seeding public.wifi_status...")
    locations = [
        "Greenhouse A",
        "Greenhouse B",
        "Lab Control Room",
        "Rooftop Garden",
        "Seedling Bay",
    ]
    wifi_rows = []
    for loc in locations:
        is_online = random.random() > 0.2  # 80% online
        now = datetime.now(timezone.utc)
        offline_since = None
        offline_checks = 0
        restored_at = None
        
        if not is_online:
            offline_since = (now - timedelta(hours=random.randint(1, 8))).isoformat()
            offline_checks = random.randint(3, 15)
        else:
            # was offline recently but restored
            if random.random() > 0.6:
                restored_at = (now - timedelta(minutes=random.randint(10, 120))).isoformat()
                offline_checks = random.randint(1, 5)
        
        wifi_rows.append({
            "location": loc,
            "is_online": is_online,
            "offline_since": offline_since,
            "offline_checks": offline_checks,
            "restored_at": restored_at,
            "updated_at": now.isoformat(),
        })
    
    supabase.from_("wifi_status").insert(wifi_rows).execute()
    print(f"  ✓ Inserted {len(wifi_rows)} wifi_status rows.")

# ──────────────────────────────────────────────
# 6. Verify seeded data counts
# ──────────────────────────────────────────────
print("\n[6/6] Verification...")
tables_to_check = [
    ("ml", "computed_scores"),
    ("ml", "processed_readings"),
    ("public", "sensor_status"),
    ("public", "wifi_status"),
]

for schema, table in tables_to_check:
    try:
        if schema == "public":
            res = supabase.from_(table).select("*", count="exact").limit(0).execute()
        else:
            res = supabase.schema(schema).from_(table).select("*", count="exact").limit(0).execute()
        count = res.count if hasattr(res, 'count') else len(res.data) if res.data else "?"
        print(f"  {schema}.{table}: {count} rows")
    except Exception as e:
        print(f"  {schema}.{table}: Error - {e}")

print("\n✅ Seed complete! Refresh your dashboard to see the data.")
