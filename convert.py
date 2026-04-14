import json

from collections import defaultdict

def process_geojson(input_file, output_file):
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    stations_coords = defaultdict(list)
    stations_types = {}
    
    for feature in data['features']:
        props = feature['properties']
        geom = feature['geometry']
        
        # Clean station name
        full_name = props['STATION_NA']
        name = full_name.replace(" MRT STATION", "").replace(" LRT STATION", "").strip()
        
        lat = geom['coordinates'][1]
        lng = geom['coordinates'][0]
        stations_coords[name].append((lat, lng))
        
        if name not in stations_types:
            stations_types[name] = "LRT" if "LRT" in full_name else "MRT"

    stations = []
    for name, coords in stations_coords.items():
        avg_lat = sum(lat for lat, lng in coords) / len(coords)
        avg_lng = sum(lng for lat, lng in coords) / len(coords)
        stations.append({
            "name": name,
            "lat": avg_lat,
            "lng": avg_lng,
            "type": stations_types[name]
        })

    with open(output_file, 'w') as f:
        json.dump(stations, f, indent=2)

# Run this to update your dataset
process_geojson('LTAMRTStationExitGEOJSON.geojson', 'mrt_stations.json')