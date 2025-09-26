import React, { useMemo, useRef, useState, useCallback } from "react";
import { useFormContext } from "react-hook-form";
import {
  GoogleMap,
  MarkerF,
  Autocomplete,
  useJsApiLoader,
} from "@react-google-maps/api";

type Locks = { city: boolean; country: boolean };

type Props = {
  nameDireccion?: string;
  nameLat?: string;
  nameLng?: string;
  nameCity?: string;
  nameCountry?: string;
  label?: string;
  country?: string | string[];
  onLock?: (locks: Locks) => void;
  mapHeight?: number;
  /** Si true, no muestro Autocomplete/Mapa hasta que el input recibe focus */
  lazyLoad?: boolean;
};

function pickCityCountry(
  components: google.maps.GeocoderAddressComponent[] | undefined
) {
  let city = "";
  let country = "";
  for (const c of components || []) {
    const t = c.types || [];
    if (!city && (t.includes("locality") || t.includes("postal_town"))) {
      city = c.long_name;
    }
    if (!country && t.includes("country")) {
      country = c.long_name;
    }
  }
  return { city, country };
}

export default function AddressMapInputGoogle({
  nameDireccion = "direccion",
  nameLat = "latitud",
  nameLng = "longitud",
  nameCity = "ciudad",
  nameCountry = "pais",
  label = "Dirección *",
  country = "CL",
  onLock,
  mapHeight = 180,
  lazyLoad = true,
}: Props) {
  const { register, setValue, watch } = useFormContext();

  const dir = watch(nameDireccion) as string | undefined;
  const lat = watch(nameLat) as number | null | undefined;
  const lng = watch(nameLng) as number | null | undefined;

  // CARGA DEL SCRIPT — SIEMPRE con key + libraries=["places"]
  const { isLoaded } = useJsApiLoader({
    id: "goup-maps",
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
    libraries: ["places"],
  });

  // Render diferido del UI (no del script)
  const [uiEnabled, setUiEnabled] = useState(!lazyLoad);
  const handleFocus = () => {
    if (lazyLoad) setUiEnabled(true);
  };

  const acRef = useRef<google.maps.places.Autocomplete | null>(null);

  const center = useMemo<google.maps.LatLngLiteral>(() => {
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
    return { lat: -33.4489, lng: -70.6693 }; // Santiago
  }, [lat, lng]);

  const onPlaceChanged = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const place = ac.getPlace();
    if (!place) return;

    const location = place.geometry?.location ?? null;
    const components = place.address_components;

    const formatted =
      place.formatted_address ||
      place.name ||
      (components ? components.map((c) => c.long_name).join(", ") : "");

    setValue(nameDireccion, formatted, { shouldDirty: true, shouldValidate: true });

    if (location) {
      const newLat = location.lat();
      const newLng = location.lng();
      setValue(nameLat, newLat as any, { shouldDirty: true, shouldValidate: true });
      setValue(nameLng, newLng as any, { shouldDirty: true, shouldValidate: true });
    }

    const { city, country: ctry } = pickCityCountry(components as any);
    if (city) setValue(nameCity, city as any, { shouldDirty: true, shouldValidate: true });
    if (ctry) setValue(nameCountry, ctry as any, { shouldDirty: true, shouldValidate: true });

    onLock?.({ city: !!city, country: !!ctry });
  }, [nameDireccion, nameLat, nameLng, nameCity, nameCountry, onLock, setValue]);

  return (
    <div className="space-y-2">
      <label className="block  text-sm font-medium">{label}</label>

      {/* Input principal controlado por RHF */}
      <div className="relative">
        <input
          {...register(nameDireccion as any)}
          onFocus={handleFocus}
          placeholder="Escribe la dirección y selecciona una sugerencia…"
          className="w-full rounded-md border /10 bg-white/5 px-3 py-2  outline-none focus:border-[#FE8B02]"
          autoComplete="off"
          value={dir || ""}
          onChange={(e) =>
            setValue(nameDireccion, e.target.value, { shouldDirty: true, shouldValidate: true })
          }
        />

        {/* Autocomplete sólo si el script está cargado y el UI habilitado */}
        {isLoaded && uiEnabled && (
          <Autocomplete
            onLoad={(ac) => {
              acRef.current = ac;
              ac.setOptions({
                fields: ["formatted_address", "geometry", "address_components"],
                types: ["geocode"],
                componentRestrictions: { country },
              });
            }}
            onPlaceChanged={onPlaceChanged}
          >
            {/* Input transparente para enganchar el overlay del widget */}
            <input
              style={{
                position: "absolute",
                inset: 0,
                opacity: 0,
                pointerEvents: "auto",
              }}
              autoComplete="off"
            />
          </Autocomplete>
        )}
      </div>

      {/* Mini mapa */}
      {isLoaded && uiEnabled && typeof lat === "number" && typeof lng === "number" && (
        <div
          className="mt-2 rounded-md overflow-hidden border /10"
          style={{ height: mapHeight }}
        >
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            zoom={16}
            center={{ lat, lng }}
            options={{
              disableDefaultUI: true,
              clickableIcons: false,
              gestureHandling: "none",
            }}
          >
            <MarkerF position={{ lat, lng }} />
          </GoogleMap>
        </div>
      )}

      {/* hidden fields por si no los renderiza tu form */}
      <input type="hidden" {...register(nameLat as any)} />
      <input type="hidden" {...register(nameLng as any)} />
    </div>
  );
}