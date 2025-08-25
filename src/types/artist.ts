// src/types/artist.ts
export type ArtistLite = {
    id: string;
    slug: string;
    nombre_artistico: string;
    fotoPerfilUrl?: string | null;
    generos?: string[] | null;
  };