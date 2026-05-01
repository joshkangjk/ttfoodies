export interface PlaceResult {
  name: string;
  address: string;
  place_id?: string;
  cuisine: string;
  lat: number;
  lng: number;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  nearest_mrt: string;
  verified: boolean;
}
