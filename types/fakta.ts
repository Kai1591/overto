export type VysledekOvereniStatus = "Pravda" | "Nepravda" | "Neověřitelné" | "Analýza";

export interface MapFeature {
  id: string;
  stav: string;
  coordinates: [number, number][];
  okres?: string;
}

export interface VysledekOvereni {
  status: VysledekOvereniStatus;
  explanation: string;
  sourceLink?: string;
  map_features?: MapFeature[];
}
