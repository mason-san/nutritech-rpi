from supabase import create_client 
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_KEY or not SUPABASE_KEY:
    raise ValueError("Supabase credentials not found in environement variables.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)