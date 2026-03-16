from supabase import create_client 
import os
from dotenv import load_dotenv

# Load environment variables from a .env file
load_dotenv()

# Extract Supabase credentials from environment
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Verify that credentials are set to prevent runtime crashes
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase credentials not found in environment variables. Check your .env file.")

# Initialize the Supabase Python client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)