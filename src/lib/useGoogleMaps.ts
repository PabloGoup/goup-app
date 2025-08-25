// src/lib/useGoogleMaps.ts
import { useJsApiLoader } from "@react-google-maps/api";

export function useGoogleMaps() {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    id: "gmaps",
    googleMapsApiKey: apiKey || "",
    libraries: ["places"], // importante para Autocomplete
  });
  return { isLoaded, loadError };
}