export interface PlaceRepositionMapProps {
  repositionPlaceId?: number | null
  canRepositionPlaces?: boolean
  onPlaceRepositionStart?: (placeId: number) => void
  onPlaceRepositionEnd?: (placeId: number, coordinates: { lat: number; lng: number }) => void
}

// The Leaflet renderer predates a fully declared prop surface. Keep its existing
// extensibility while making the cross-provider reposition contract explicit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MapViewProps = Record<string, any> & PlaceRepositionMapProps
