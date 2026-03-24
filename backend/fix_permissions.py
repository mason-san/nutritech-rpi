"""
Fix sequence permissions using Supabase's pg_net or direct SQL via the REST API.
This uses the service_role key which has admin-level access.
"""
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY").strip()

# Extract the project ref from the URL
# e.g., https://ciosgjvbflsnrkhbriqh.supabase.co -> ciosgjvbflsnrkhbriqh
project_ref = SUPABASE_URL.split("//")[1].split(".")[0]

print(f"Project: {project_ref}")
print("[FIX] Attempting to grant sequence permissions...\n")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

# Method: Use the Supabase SQL query endpoint (available with service_role)
# This endpoint is: POST /pg/query
# But it might not be available. Let's try the standard approach.

# Actually, let's just try creating an RPC function first, then call it
# Or better: just use the REST API to check if we can reach SQL

# Let's try inserting directly without the id sequence
# The problem might be that the sequence is owned by postgres not service_role
# We can work around it by creating a raw SQL function

sql = """
DO $$
BEGIN
    GRANT USAGE ON SCHEMA ml TO service_role, anon, authenticated;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ml TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ml TO service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ml TO anon, authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA ml TO anon, authenticated;
    
    GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
END
$$;
"""

# Try the /rest/v1/ endpoint with raw SQL - this won't work
# Try the management API instead
mgmt_url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
mgmt_headers = {
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

print("Trying management API...")
try:
    resp = httpx.post(mgmt_url, headers=mgmt_headers, json={"query": sql}, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.text[:500]}")
except Exception as e:
    print(f"  Error: {e}")

# Another approach: create a function via the PostgREST RPC that can be called
print("\nTrying PostgREST RPC approach...")

# First, let's check what functions exist
try:
    resp = httpx.get(
        f"{SUPABASE_URL}/rest/v1/rpc/",
        headers=headers,
        timeout=10,
    )
    print(f"  RPC endpoint status: {resp.status_code}")
except Exception as e:
    print(f"  Error: {e}")

print("\n" + "=" * 60)
print("MANUAL FIX REQUIRED")
print("=" * 60)
print(f"""
Go to: https://supabase.com/dashboard/project/{project_ref}/sql/new

Paste and run this SQL:

GRANT USAGE ON SCHEMA ml TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ml TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ml TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ml TO anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA ml TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

Then run: python seed_data.py
""")
