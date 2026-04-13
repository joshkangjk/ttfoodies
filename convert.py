import json

def process_geojson(input_file, output_file):
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    stations = {}
    for feature in data['features']:
        props = feature['properties']
        geom = feature['geometry']
        
        # Clean station name (e.g., "BRIGHT HILL MRT STATION" -> "BRIGHT HILL")
        full_name = props['STATION_NA']
        name = full_name.replace(" MRT STATION", "").replace(" LRT STATION", "").strip()
        
        # If station not seen, or if this is 'Exit A/1' (often the primary exit)
        if name not in stations:
            stations[name] = {
                "name": name,
                "lat": geom['coordinates'][1],
                "lng": geom['coordinates'][0],
                "type": "LRT" if "LRT" in full_name else "MRT"
            }

    with open(output_file, 'w') as f:
        json.dump(list(stations.values()), f, indent=2)

# Run this to update your dataset
process_geojson('LTAMRTStationExitGEOJSON.geojson', 'mrt_stations.json')