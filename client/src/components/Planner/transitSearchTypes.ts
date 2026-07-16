export interface PickedPlace {
  name: string
  lat: number
  lng: number
}

export interface TransitPlacementHint {
  dayId: number
  position: number
}

export interface TransitSearchPrefill {
  from?: PickedPlace | null
  to?: PickedPlace | null
  time?: string | null
  placement?: TransitPlacementHint | null
}
