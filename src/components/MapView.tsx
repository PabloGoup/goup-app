import React, { useMemo } from "react";
import {
  GoogleMap,
  MarkerF,
  useJsApiLoader,
  type Libraries,
} from "@react-google-maps/api";

type Props = {
  lat: number;
  lng: number;
  height?: number | string;
  zoom?: number;
};

const LIBRARIES: Libraries = ["places"];

export default function MapView({ lat, lng, height = 200, zoom = 16 }: Props) {
  const { isLoaded } = useJsApiLoader({
    id: "club-map-loader",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
    libraries: LIBRARIES,
    language: "es",
    region: "CL",
  });

  const center = useMemo(() => ({ lat, lng }), [lat, lng]);

  if (!isLoaded) {
    return (
      <div
        className="rounded border border-[#8e2afc]/30 bg-white/[0.03]"
        style={{ height }}
      >
        <div className="h-full w-full grid place-items-center /60">
          Cargando mapa…
        </div>
      </div>
    );
  }

  // 👇 Cualquier uso de google.* debe ir DESPUÉS de isLoaded
  // const icon = {
  //   url: "/pin.svg",
  //   scaledSize: new window.google.maps.Size(32, 32),
  // };

  return (
    <div className="rounded overflow-hidden border border-[#8e2afc]/30 shadow-lg" style={{ height }}>
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={zoom}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: "greedy",
        }}
      >
        <MarkerF position={center} /* icon={icon} */ />
      </GoogleMap>
    </div>
  );
}