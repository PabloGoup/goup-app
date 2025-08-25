// SocialIcons.tsx
import { Globe } from "lucide-react";
import {
  SiInstagram, SiWhatsapp, SiSpotify, SiSoundcloud, SiTiktok, SiBeatport,
  SiYoutube, SiFacebook, SiX
} from "react-icons/si";
import React from "react";

type Props = {
  href?: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  color?: string;         // color de marca
  className?: string;     // clases extra del botón
};

export function SocialIcon({ href, label, Icon, color, className }: Props) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center justify-center rounded-full border border-white/15 bg-black/50 hover:bg-black/70 p-2 transition ${className ?? ""}`}
      style={color ? { color } : undefined}
      title={label}
    >
      <Icon className="w-4 h-4" />
    </a>
  );
}

// Paleta de colores de marca (hex oficiales de Simple Icons)
export const BRAND = {
  instagram: "#E4405F",
  whatsapp:  "#25D366",
  spotify:   "#1DB954",
  soundcloud:"#FF3300",
  tiktok:    "#000000",
  beatport:  "#01FF95",
  youtube:   "#FF0000",
  facebook:  "#1877F2",
  x:         "#000000", // Twitter/X
};

// Ejemplo de fila de redes:
export function SocialRow({
  instagram, whatsapp, spotify, soundcloud, tiktok, beatport, youtube, facebook, x, web,
}: {
  instagram?: string; whatsapp?: string; spotify?: string; soundcloud?: string;
  tiktok?: string; beatport?: string; youtube?: string; facebook?: string; x?: string;
  web?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <SocialIcon href={instagram} label="Instagram"  Icon={SiInstagram}  color={BRAND.instagram} />
      <SocialIcon href={whatsapp}  label="WhatsApp"   Icon={SiWhatsapp}   color={BRAND.whatsapp} />
      <SocialIcon href={spotify}   label="Spotify"    Icon={SiSpotify}    color={BRAND.spotify} />
      <SocialIcon href={soundcloud}label="SoundCloud" Icon={SiSoundcloud} color={BRAND.soundcloud} />
      <SocialIcon href={tiktok}    label="TikTok"     Icon={SiTiktok}     color={BRAND.tiktok} />
      <SocialIcon href={beatport}  label="Beatport"   Icon={SiBeatport}   color={BRAND.beatport} />
      <SocialIcon href={youtube}   label="YouTube"    Icon={SiYoutube}    color={BRAND.youtube} />
      <SocialIcon href={facebook}  label="Facebook"   Icon={SiFacebook}   color={BRAND.facebook} />
      <SocialIcon href={x}         label="X (Twitter)"Icon={SiX}          color={BRAND.x} />
      <SocialIcon href={web}       label="Sitio web"  Icon={Globe as any} />
    </div>
  );
}