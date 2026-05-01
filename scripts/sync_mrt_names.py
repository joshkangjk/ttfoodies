import os
import httpx
import json
import asyncio
from dotenv import load_dotenv

# Load env vars
load_dotenv()

# Add root to sys path to import services
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from services.mrt_mapper import find_nearest_mrt

SUPABASE_URL = os.getenv("SUPABASE_URL")
ANON_KEY     = os.getenv("SUPABASE_ANON_KEY")
SERVICE_KEY  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Use service key if available to bypass RLS, otherwise fallback to anon
SYNC_KEY = SERVICE_KEY if SERVICE_KEY else ANON_KEY

if not SYNC_KEY:
    print("❌ Error: No Supabase keys found in .env")
    sys.exit(1)

HEADERS = {
    "apikey": SYNC_KEY,
    "Authorization": f"Bearer {SYNC_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

if SERVICE_KEY:
    print("🛡️ Using Service Role Key (Bypassing RLS)")
else:
    print("🔓 Using Anon Key (RLS may hide records)")

async def sync_mrt_names():
    print("🚀 Starting MRT Name Sync...")
    
    async with httpx.AsyncClient() as client:
        # 1. Fetch all saved places
        # Note: If you have > 1000 places, you might need pagination
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/saved_places?select=id,lat,lng,nearest_mrt",
            headers=HEADERS
        )
        
        if resp.status_code != 200:
            print(f"❌ Failed to fetch places: {resp.text}")
            return
        
        places = resp.json()
        print(f"📦 Found {len(places)} saved places.")
        
        updated_count = 0
        skipped_count = 0
        
        for place in places:
            place_id = place["id"]
            lat = place["lat"]
            lng = place["lng"]
            current_mrt = place["nearest_mrt"]
            
            # 2. Re-calculate nearest MRT using updated JSON
            new_mrt = find_nearest_mrt(lat, lng)
            
            if new_mrt != current_mrt:
                print(f"🔄 Updating '{place_id}': {current_mrt} ➔ {new_mrt}")
                
                # 3. Perfom update in Supabase
                update_resp = await client.patch(
                    f"{SUPABASE_URL}/rest/v1/saved_places?id=eq.{place_id}",
                    headers=HEADERS,
                    json={"nearest_mrt": new_mrt}
                )
                
                if update_resp.status_code in [200, 204]:
                    updated_count += 1
                else:
                    print(f"⚠️ Failed to update {place_id}: {update_resp.text}")
            else:
                skipped_count += 1
        
        print("\n✨ Sync Complete!")
        print(f"✅ Updated: {updated_count}")
        print(f"⏭️ Skipped: {skipped_count}")

if __name__ == "__main__":
    asyncio.run(sync_mrt_names())
