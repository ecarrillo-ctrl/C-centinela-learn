// Íconos de insignias: círculo de línea + un glifo por insignia. Se dibujan en SVG
// (sin archivos externos) para que hereden el color y escalen sin perder nitidez.
const GLYPHS = {
  recruit: (
    <>
      <rect x="20" y="21" width="24" height="22" rx="3" />
      <path d="M29 27.5 V36.5 L38 32 Z" />
      <path d="M24 21 V43 M40 21 V43" strokeDasharray="2 3" opacity="0.5" />
    </>
  ),
  hero: (
    <>
      <path d="M32 16 L44 21 V31 C44 38.5 39 43.5 32 47 C25 43.5 20 38.5 20 31 V21 Z" />
      <path d="M32 24 L34.2 28.6 L39.2 29.2 L35.5 32.6 L36.5 37.6 L32 35.1 L27.5 37.6 L28.5 32.6 L24.8 29.2 L29.8 28.6 Z" />
    </>
  ),
  target: (
    <>
      <circle cx="30" cy="34" r="13" />
      <circle cx="30" cy="34" r="8" />
      <circle cx="30" cy="34" r="2.5" />
      <path d="M31.5 32.5 L45 19 M45 19 V25 M45 19 H39" />
    </>
  ),
  graduate: (
    <>
      <path d="M32 20 L49 27.5 L32 35 L15 27.5 Z" />
      <path d="M23 31.5 V39 C23 43 41 43 41 39 V31.5" />
      <path d="M49 27.5 V37" />
    </>
  ),
  triple: (
    <>
      <circle cx="32" cy="20" r="4.5" />
      <circle cx="32" cy="32" r="4.5" />
      <circle cx="32" cy="44" r="4.5" />
      <path d="M32 24.5 V27.5 M32 36.5 V39.5" />
      <path d="M29.8 20 L31.4 21.6 L34.4 18.4 M29.8 32 L31.4 33.6 L34.4 30.4 M29.8 44 L31.4 45.6 L34.4 42.4" />
    </>
  ),
  sunrise: (
    <>
      <path d="M20 40 A12 12 0 0 1 44 40" />
      <path d="M15 40 H49 M22 46 H42" />
      <path d="M32 20 V24 M21.5 26 L24.3 28.8 M42.5 26 L39.7 28.8 M16 33 H19.5 M44.5 33 H48" />
    </>
  ),
  owl: (
    <>
      <path d="M37 18 A14 14 0 1 0 46 40 A11 11 0 0 1 37 18 Z" />
      <path d="M45 18 V25 M41.5 21.5 H48.5" />
    </>
  ),
  flag: (
    <>
      <path d="M23 17 V48" />
      <path d="M23 20 H43 L38.5 27.5 L43 35 H23" />
    </>
  ),
  hook: (
    <>
      <circle cx="33" cy="18" r="2" />
      <path d="M33 20 V35 A7.5 7.5 0 0 1 18 35" />
      <path d="M18 35 L14.5 30.5 M18 35 L22.5 31.5" />
    </>
  ),
  shield: (
    <>
      <path d="M32 16 L44 21 V31 C44 38.5 39 43.5 32 47 C25 43.5 20 38.5 20 31 V21 Z" />
      <path d="M26 31.5 L30.5 36 L38.5 27" />
    </>
  ),
  rocket: (
    <>
      <path d="M32 15 C39 21 41 30 38.5 40 H25.5 C23 30 25 21 32 15 Z" />
      <circle cx="32" cy="27" r="3.2" />
      <path d="M25.5 34 L19.5 41 H25.5 M38.5 34 L44.5 41 H38.5" />
      <path d="M29.5 44 L32 51 L34.5 44" />
    </>
  ),
  medal: (
    <>
      <circle cx="32" cy="27" r="9.5" />
      <path d="M32 22 L33.6 25.4 L37.2 25.9 L34.6 28.4 L35.2 32 L32 30.3 L28.8 32 L29.4 28.4 L26.8 25.9 L30.4 25.4 Z" />
      <path d="M26.5 35 L22.5 48 L29 45 L32 50.5 L35 45 L41.5 48 L37.5 35" />
    </>
  ),
};

export const BADGE_ICON_KEYS = Object.keys(GLYPHS);

export default function BadgeIcon({ name, size = 72, locked = false, color = '#F26B30' }) {
  const stroke = locked ? '#B8BEC7' : color;

  // Insignias creadas por un admin pueden traer una URL de imagen propia.
  if (name && /^(https?:)?\//.test(name)) {
    return <img src={name} alt="" width={size} height={size} style={{ objectFit: 'contain', opacity: locked ? 0.4 : 1 }} />;
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={stroke} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="32" cy="32" r="29.5" />
      {GLYPHS[name] || GLYPHS.medal}
    </svg>
  );
}
