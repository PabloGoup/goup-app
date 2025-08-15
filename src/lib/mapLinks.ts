// Utilidades para abrir Google Maps / Waze con coords o dirección
export function googleMapsLink(lat?: number | null, lng?: number | null, address?: string | null) {
    if (typeof lat === "number" && typeof lng === "number") {
      // Coordenadas
      return `https://www.google.com/maps?q=${lat},${lng}`;
    }
    // Dirección como texto
    const q = encodeURIComponent(address ?? "");
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  
  export function wazeLink(lat: number, lng: number) {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }