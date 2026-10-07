"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Map, { Source, Layer, Marker, Popup } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

export interface MapFeature {
  id: string;
  stav: string;
  coordinates: [number, number][]; // Původně [lat, lng]
  okres?: string;
}

interface MapWidgetProps {
  features: MapFeature[];
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

const DISTRICT_CAPITALS: Record<string, [number, number]> = {
  "Hradec Králové": [50.2104, 15.8322],
  "Jičín": [50.4372, 15.3516],
  "Náchod": [50.4167, 16.1629],
  "Rychnov nad Kněžnou": [50.1628, 16.2748],
  "Trutnov": [50.5611, 15.9127],
};

const getColor = (stav: string) => {
  const s = stav.toLowerCase();
  if (s.includes("havarijní") || s.includes("superhavarijní") || s.includes("nevyhovující")) return "#ef4444";
  if (s.includes("výborný") || s.includes("dobrý")) return "#22c55e";
  if (s.includes("vyhovující")) return "#eab308";
  return "#3b82f6";
};

export default function MapWidget({ features }: MapWidgetProps) {
  const [khkBoundary, setKhkBoundary] = useState<[number, number][] | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ lng: number, lat: number, feature: any } | null>(null);

  useEffect(() => {
    fetch("/khk-hranice.json")
      .then(res => res.json())
      .then(data => setKhkBoundary(data))
      .catch(err => console.error("Chyba při načítání hranic KHK", err));
  }, []);

  const aktivniOkresy = Array.from(
    new Set(features.map(f => f.okres).filter(Boolean) as string[])
  );

  const geojsonFeatures = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: features.map((feature, index) => {
        const isPoint = feature.coordinates.length === 1;
        // Mapbox vyžaduje pro GeoJSON souřadnice [lng, lat], naše data jsou [lat, lng]
        const swappedCoords = feature.coordinates.map(c => [c[1], c[0]]);

        return {
          type: "Feature" as const,
          properties: {
            id: `${feature.id}-${index}`,
            color: getColor(feature.stav),
            stav: feature.stav,
            okres: feature.okres || "Neznámý okres"
          },
          geometry: isPoint 
            ? { type: "Point" as const, coordinates: swappedCoords[0] }
            : { type: "LineString" as const, coordinates: swappedCoords }
        };
      })
    };
  }, [features]);

  const khkBoundaryGeoJSON = useMemo(() => {
    if (!khkBoundary) return null;
    return {
      type: "FeatureCollection" as const,
      features: [{
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [khkBoundary.map(c => [c[1], c[0]])]
        },
        properties: {}
      }]
    };
  }, [khkBoundary]);

  const initialBounds = useMemo(() => {
    if (!features || features.length === 0) return undefined;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    features.forEach(f => {
      f.coordinates.forEach(c => {
        if (c[0] < minLat) minLat = c[0];
        if (c[0] > maxLat) maxLat = c[0];
        if (c[1] < minLng) minLng = c[1];
        if (c[1] > maxLng) maxLng = c[1];
      });
    });
    
    // Bounds for Mapbox: [[minLng, minLat], [maxLng, maxLat]]
    return [
      [minLng, minLat],
      [maxLng, maxLat]
    ] as [[number, number], [number, number]];
  }, [features]);

  const [mapLoaded, setMapLoaded] = useState(false);

  const onHover = useCallback((event: any) => {
    const feature = event.features && event.features[0];
    if (feature) {
      setHoverInfo({ lng: event.lngLat.lng, lat: event.lngLat.lat, feature });
    } else {
      setHoverInfo(null);
    }
  }, []);

  if (!features || features.length === 0) return null;

  return (
    <div className="h-80 md:h-[28rem] w-full relative z-0 rounded-lg overflow-hidden border border-white/10 shadow-xl group">
      <Map
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={initialBounds ? {
          bounds: initialBounds,
          fitBoundsOptions: { padding: 50, maxZoom: 14 }
        } : {
          longitude: 15.8,
          latitude: 50.2,
          zoom: 10
        }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        attributionControl={true}
        onLoad={() => setMapLoaded(true)}
        interactiveLayerIds={['lines', 'points']}
        onMouseMove={onHover}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <style>
          {`
            .mapboxgl-popup-content {
              background: transparent !important;
              padding: 0 !important;
              box-shadow: none !important;
            }
            .mapboxgl-popup-tip {
              border-top-color: rgba(15, 23, 42, 0.9) !important;
              border-bottom-color: rgba(15, 23, 42, 0.9) !important;
            }
          `}
        </style>
        {khkBoundaryGeoJSON && (
          <Source key="khk-boundary" id="khk-boundary" type="geojson" data={khkBoundaryGeoJSON}>
            <Layer
              id="khk-boundary-layer"
              type="fill"
              paint={{
                "fill-color": "#22c55e",
                "fill-opacity": 0.03
              }}
            />
            <Layer
              id="khk-boundary-line"
              type="line"
              paint={{
                "line-color": "#22c55e",
                "line-width": 2,
                "line-dasharray": [5, 5]
              }}
            />
          </Source>
        )}

        <Source key="features" id="features" type="geojson" data={geojsonFeatures}>
          {/* Neon Glow podklad pro čáry */}
          <Layer
            id="lines-glow"
            type="line"
            filter={['==', ['geometry-type'], 'LineString']}
            paint={{
              "line-color": ['get', 'color'],
              "line-width": 14,
              "line-opacity": 0.25,
              "line-blur": 8
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round"
            }}
          />
          <Layer
            id="lines"
            type="line"
            filter={['==', ['geometry-type'], 'LineString']}
            paint={{
              "line-color": ['get', 'color'],
              "line-width": 3,
              "line-opacity": 1
            }}
            layout={{
              "line-cap": "round",
              "line-join": "round"
            }}
          />

          {/* Neon Glow podklad pro body */}
          <Layer
            id="points-glow"
            type="circle"
            filter={['==', ['geometry-type'], 'Point']}
            paint={{
              "circle-color": ['get', 'color'],
              "circle-radius": 15,
              "circle-opacity": 0.25,
              "circle-blur": 2
            }}
          />
          <Layer
            id="points"
            type="circle"
            filter={['==', ['geometry-type'], 'Point']}
            paint={{
              "circle-color": ['get', 'color'],
              "circle-radius": 6,
              "circle-opacity": 1,
              "circle-stroke-width": 2,
              "circle-stroke-color": "#111111"
            }}
          />
        </Source>

        {hoverInfo && (
          <Popup
            longitude={hoverInfo.lng}
            latitude={hoverInfo.lat}
            closeButton={false}
            closeOnClick={false}
            anchor="bottom"
            offset={15}
            className="rounded-xl overflow-hidden"
            maxWidth="300px"
          >
            <div className="bg-slate-900/90 text-white p-3 rounded-lg border border-slate-700/50 backdrop-blur-md shadow-2xl flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {hoverInfo.feature.properties.okres}
              </span>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: hoverInfo.feature.properties.color }} />
                <span className="text-sm font-medium">Stav: {hoverInfo.feature.properties.stav}</span>
              </div>
            </div>
          </Popup>
        )}

        {mapLoaded && aktivniOkresy.map(okres => {
          const coords = DISTRICT_CAPITALS[okres];
          if (!coords) return null;
          return (
            <Marker key={okres} longitude={coords[1]} latitude={coords[0]} anchor="center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{
                color: 'rgba(255,255,255,0.7)',
                background: 'transparent',
                padding: '4px 8px',
                fontWeight: '600',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                textShadow: '0 2px 4px rgba(0,0,0,0.8)'
              }}>
                {okres}
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
