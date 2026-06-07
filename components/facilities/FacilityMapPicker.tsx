"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
};

type Coordinates = {
  latitude: string;
  longitude: string;
};

function toFixedCoordinate(value: number) {
  return value.toFixed(6);
}

function parseCoordinate(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function FacilityMapPicker({
  coordinates,
  onChange
}: {
  coordinates: Coordinates;
  onChange: (coordinates: Coordinates) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<string | null>(null);
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const placeMarkerRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const coordinatesRef = useRef(coordinates);

  useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  useEffect(() => {
    if (!open || !mapElementRef.current || mapRef.current) return;

    let cancelled = false;

    async function setupMap() {
      const leaflet = await import("leaflet");
      if (cancelled || !mapElementRef.current) return;

      const latitude = parseCoordinate(coordinatesRef.current.latitude);
      const longitude = parseCoordinate(coordinatesRef.current.longitude);
      let initialCenter: [number, number] = [20, 0];
      let initialZoom = 2;

      if (latitude !== null && longitude !== null) {
        initialCenter = [latitude, longitude];
        initialZoom = 11;
      }

      const map = leaflet.map(mapElementRef.current).setView(initialCenter, initialZoom);

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19
        })
        .addTo(map);

      const markerIcon = leaflet.divIcon({
        className: "",
        html: '<div style="height:20px;width:20px;border-radius:9999px;border:2px solid #fff;background:#1f6f5b;box-shadow:0 8px 16px rgba(15,23,42,.25);outline:2px solid rgba(31,111,91,.25);"></div>',
        iconAnchor: [10, 10]
      });

      function placeMarker(lat: number, lng: number) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = leaflet.marker([lat, lng], { draggable: true, icon: markerIcon }).addTo(map);
          markerRef.current.on("dragend", () => {
            const point = markerRef.current?.getLatLng();
            if (point) {
              onChange({ latitude: toFixedCoordinate(point.lat), longitude: toFixedCoordinate(point.lng) });
              setSelectedPlace("Marker position selected on the map");
            }
          });
        }
      }
      placeMarkerRef.current = placeMarker;

      if (latitude !== null && longitude !== null) {
        placeMarker(latitude, longitude);
      }

      map.on("click", (event) => {
        placeMarker(event.latlng.lat, event.latlng.lng);
        onChange({
          latitude: toFixedCoordinate(event.latlng.lat),
          longitude: toFixedCoordinate(event.latlng.lng)
        });
        setSelectedPlace("Map position selected manually");
      });

      mapRef.current = map;
      window.setTimeout(() => map.invalidateSize(), 100);
    }

    void setupMap();

    return () => {
      cancelled = true;
      markerRef.current = null;
      placeMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onChange, open]);

  useEffect(() => {
    if (!open || !placeMarkerRef.current) return;

    const latitude = parseCoordinate(coordinates.latitude);
    const longitude = parseCoordinate(coordinates.longitude);
    if (latitude === null || longitude === null) return;

    placeMarkerRef.current(latitude, longitude);
  }, [coordinates.latitude, coordinates.longitude, open]);

  function previewLocation(result: SearchResult) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    onChange({
      latitude: toFixedCoordinate(latitude),
      longitude: toFixedCoordinate(longitude)
    });
    placeMarkerRef.current?.(latitude, longitude);
    mapRef.current?.setView([latitude, longitude], 13);
    setSelectedPlace(result.display_name);
  }

  async function searchLocation() {
    const query = searchQuery.trim();
    if (!query) return;

    setError(null);
    setSelectedPlace(null);
    setSearchPending(true);
    setSearchResults([]);

    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`);
      const results = await response.json() as SearchResult[];
      setSearchResults(results);
      if (results.length === 0) {
        setError("No map matches found. Try a more specific address or city.");
      } else {
        previewLocation(results[0]);
      }
    } catch {
      setError("Could not search the map right now. You can still click the map or enter GPS manually.");
    } finally {
      setSearchPending(false);
    }
  }

  async function useCurrentLocation() {
    setError(null);

    if (!navigator.geolocation) {
      setError("Your browser does not support location capture. Enter latitude and longitude manually.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: toFixedCoordinate(position.coords.latitude),
          longitude: toFixedCoordinate(position.coords.longitude)
        };
        onChange(next);
        setSelectedPlace("Current browser location");
        placeMarkerRef.current?.(position.coords.latitude, position.coords.longitude);
        mapRef.current?.setView([position.coords.latitude, position.coords.longitude], 13);
      },
      () => setError("Could not capture your location. You can still click the map or enter GPS manually."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function selectResult(result: SearchResult) {
    previewLocation(result);
    setSearchQuery(result.display_name);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
      >
        <MapPin className="h-4 w-4" />
        Open map
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-ink">Select facility location</h3>
                <p className="mt-1 text-xs text-slate-500">Search, click the map, or drag the marker. Coordinates save with the facility.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 transition hover:bg-slate-100">
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[320px_1fr]">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Type a location
                    <div className="mt-1.5 flex gap-2">
                      <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void searchLocation();
                          }
                        }}
                        className="h-10 min-w-0 flex-1 rounded-md border border-line px-3 text-sm outline-none focus:border-forest"
                        placeholder="Facility address, city, country"
                      />
                      <button
                        type="button"
                        disabled={searchPending}
                        onClick={() => void searchLocation()}
                        className="inline-flex h-10 items-center justify-center rounded-md bg-forest px-3 text-sm font-semibold text-white hover:bg-[#195f4d] disabled:opacity-60"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={useCurrentLocation}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-forest hover:text-forest"
                >
                  <MapPin className="h-4 w-4" />
                  Use current location
                </button>

                {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

                {selectedPlace ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm leading-5 text-emerald-900">
                    <p className="font-semibold">Confirm this location</p>
                    <p className="mt-1">{selectedPlace}</p>
                    <p className="mt-1 text-xs text-emerald-700">Review the marker on the map, then choose "Use this location" to keep it.</p>
                  </div>
                ) : null}

                {searchResults.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Search results</p>
                    {searchResults.map((result) => (
                      <button
                        key={`${result.lat}-${result.lon}-${result.display_name}`}
                        type="button"
                        onClick={() => selectResult(result)}
                        className="block w-full rounded-md border border-line px-3 py-2 text-left text-sm text-slate-700 transition hover:border-forest hover:bg-slate-50"
                      >
                        {result.display_name}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-md border border-line bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                  <p className="font-semibold text-slate-700">Selected GPS</p>
                  <p>Latitude: {coordinates.latitude || "-"}</p>
                  <p>Longitude: {coordinates.longitude || "-"}</p>
                </div>
              </div>

              <div className="min-h-[360px] overflow-hidden rounded-lg border border-line">
                <div ref={mapElementRef} className="h-[52vh] min-h-[360px] w-full" />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md bg-forest px-5 text-sm font-semibold text-white transition hover:bg-[#195f4d]"
              >
                Use this location
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
