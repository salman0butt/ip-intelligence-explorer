import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import type { IntelligenceReport } from "../types/ipIntelligence";

export function ExplorerMap({ report }: {
  readonly report: IntelligenceReport;
}) {
  const { latitude, longitude, city, country } = report.location;
  const label = [city, country].filter(Boolean).join(", ");
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return (
      <section
        aria-label="IP location map"
        className="grid min-h-80 place-items-center rounded-2xl border border-slate-700 bg-slate-900/80 p-8 text-center"
      >
        <div>
          <p className="text-lg font-semibold text-slate-100">
            Location unavailable
          </p>
          {label ? (
            <p className="mt-2 text-sm font-medium text-slate-300">{label}</p>
          ) : null}
          <p className="mt-2 text-sm text-slate-400">
            This provider response did not include usable coordinates.
          </p>
        </div>
      </section>
    );
  }
  const position: [number, number] = [latitude, longitude];
  const popupLabel = label || "Reported IP location";
  return (
    <section aria-label="IP location map" className="map-shell">
      <MapContainer
        key={position.join(":")}
        center={position}
        zoom={10}
        scrollWheelZoom={false}
        className="h-full min-h-80 w-full"
      >
        <TileLayer
          attribution={'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={position}
          radius={9}
          pathOptions={{
            color: "#99f6e4",
            fillColor: "#2dd4bf",
            fillOpacity: 0.9,
            weight: 3,
          }}
        >
          <Popup>
            <strong>{popupLabel}</strong>
            <br />
            <span>{report.ip}</span>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </section>
  );
}
