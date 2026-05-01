import os
import asyncio
import httpx
from dotenv import load_dotenv

# Load env vars FIRST before importing anything that needs them
load_dotenv()

# Add root to sys path to import services
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from services.enricher import enrich_place

SUPABASE_URL = os.getenv("SUPABASE_URL")
# Use Service Role Key to bypass RLS if possible
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

async def migrate_cuisines():
    print("🚀 Starting Cuisine Migration...")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # 1. Fetch all saved places
        resp = await client.get(
            f"{SUPABASE_URL}/rest/v1/saved_places?select=id,name,place_id,cuisine,tiktok_url",
            headers=HEADERS
        )
        
        if resp.status_code != 200:
            print(f"❌ Failed to fetch places: {resp.text}")
            return
        
        places = resp.json()
        print(f"📦 Found {len(places)} saved places to process.")
        
        updated_count = 0
        
        for place in places:
            place_id = place["id"]
            name = place["name"]
            old_cuisine = place["cuisine"]
            
            print(f"🔎 Processing: {name} (Current: {old_cuisine})...")
            
            try:
                # 2. Re-enrich (This hits Tier 1 & Tier 2)
                # Note: We don't re-ingest the TikTok transcript here to save time/API costs,
                # as Tier 2 (Google Name/Details) fixes the majority of issues like Fiz.
                enriched = await enrich_place(name)
                
                if enriched and enriched["cuisine"] != old_cuisine:
                    new_cuisine = enriched["cuisine"]
                    source = enriched["cuisine_source"]
                    print(f"  ✅ New Category: {new_cuisine} (via {source})")
                    
                    # 3. Update Supabase
                    update_resp = await client.patch(
                        f"{SUPABASE_URL}/rest/v1/saved_places?id=eq.{place_id}",
                        headers=HEADERS,
                        json={"cuisine": new_cuisine}
                    )
                    
                    if update_resp.status_code in [200, 204]:
                        updated_count += 1
                    else:
                        print(f"  ⚠️ Update failed for {name}: {update_resp.text}")
                else:
                    print(f"  ⏭️ No change needed.")
                    
            except Exception as e:
                print(f"  ❌ Error processing {name}: {str(e)}")
                
        print(f"\n✨ Migration Finished!")
        print(f"✅ Total Updated: {updated_count}")

if __name__ == "__main__":
    asyncio.run(migrate_cuisines())
