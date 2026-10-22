import type { GraphicLayer } from "./types";

/** Bump when a visible nontext graphic changes; storyboard approval binds this material. */
export const GRAPHIC_STYLE_VERSION = "clay-relief-2026-10-15-v1";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icons: Record<GraphicLayer["symbol"], string> = {
  crescent: '<path d="M69 19A34 34 0 1 0 80 72A30 30 0 0 1 69 19Z"/>',
  "star-of-david": '<path d="M50 14 81 68H19ZM50 86 19 32H81Z"/>',
  cross: '<path d="M43 17H57V41H79V55H57V83H43V55H21V41H43Z"/>',
  hospital: '<path d="M24 83V21H76V83ZM14 83H86M44 32H56V43H67V55H56V66H44V55H33V43H44Z"/>',
  book: '<path d="M50 26C39 18 25 18 14 23V77C26 71 39 72 50 80C61 72 74 71 86 77V23C75 18 61 18 50 26ZM50 26V80"/>',
  scales: '<path d="M50 17V82M32 82H68M20 32H80M24 32 10 59H38ZM76 32 62 59H90Z"/>',
  people: '<circle cx="50" cy="30" r="12"/><circle cx="20" cy="39" r="9"/><circle cx="80" cy="39" r="9"/><path d="M31 83V66A19 19 0 0 1 69 66V83M7 83V66A13 13 0 0 1 28 56M93 83V66A13 13 0 0 0 72 56"/>',
  globe: '<circle cx="50" cy="50" r="36"/><ellipse cx="50" cy="50" rx="16" ry="36"/><path d="M15 50H85M22 28H78M22 72H78"/>',
};
export const graphicPositions = {"top-left":[.2,.22],"top-center":[.5,.22],"top-right":[.8,.22],"middle-left":[.18,.47],"middle-right":[.82,.47]} as const;

// Slightly hand-shaped, with the same soft upper-left light as the clay sets.
const medallion = "M50-8C79-10 105 12 108 43C112 74 91 103 61 108C30 113 3 96-6 68C-16 37 1 8 28-3C35-6 43-8 50-8Z";
const svgId = (value: string) => `clay-${value.replace(/[^a-zA-Z0-9_-]/g, character => `_${character.codePointAt(0)!.toString(16)}_`)}`;

function clayMaterials(id: string) {
  return `<defs>
    <radialGradient id="${id}-body" cx=".29" cy=".2" r=".87"><stop stop-color="#f6dfb9"/><stop offset=".56" stop-color="#dfbd8f"/><stop offset=".88" stop-color="#bd9468"/><stop offset="1" stop-color="#a8815b"/></radialGradient>
    <linearGradient id="${id}-relief" x1="12" y1="12" x2="81" y2="88" gradientUnits="userSpaceOnUse"><stop stop-color="#7d99aa"/><stop offset=".27" stop-color="#587b91"/><stop offset=".66" stop-color="#3d6078"/><stop offset="1" stop-color="#30495d"/></linearGradient>
    <filter id="${id}-shadow" x="-35%" y="-30%" width="180%" height="185%" color-interpolation-filters="sRGB"><feDropShadow dx="2.5" dy="6" stdDeviation="4" flood-color="#452f22" flood-opacity=".27"/></filter>
    <filter id="${id}-contact" x="-30%" y="-30%" width="170%" height="175%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="${id}-grain" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".48" numOctaves="3" seed="41" result="noise"/><feColorMatrix in="noise" type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".22"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in" result="surface"/><feBlend in="SourceGraphic" in2="surface" mode="soft-light"/></filter>
    <filter id="${id}-edge" x="-8%" y="-8%" width="116%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".1" numOctaves="2" seed="7" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale=".65" xChannelSelector="R" yChannelSelector="G"/></filter>
  </defs>`;
}

/** Closed SVG catalogue shared by the review and final montage. No arbitrary SVG or HTML is accepted. */
export function graphicLayersSvg(layers: GraphicLayer[], width: number, height: number, prefix = "graphic", hasTitle = false) {
  if (!layers.length) return "";
  const size = Math.min(width * .17, height * .13);
  const material = svgId(prefix);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" role="img" aria-label="Clay scene graphics">${clayMaterials(material)}${layers.map((layer,i)=>{
    const [x,baseY]=graphicPositions[layer.position];
    const y=hasTitle?(layer.position.startsWith("top-")?.08:.64):baseY;
    const icon = `${material}-symbol-${i}`;
    return `<g id="${escape(prefix)}-${i}" transform="translate(${x*width-size/2} ${y*height-size/2})" data-material="clay">
      <svg x="${-size*.12}" y="${-size*.12}" width="${size*1.24}" height="${size*1.24}" viewBox="-12 -12 124 124" overflow="visible">
        <title>${escape(layer.label||layer.symbol)}</title>
        <defs><g id="${icon}" fill="none" stroke-linejoin="round" stroke-linecap="round">${icons[layer.symbol]}</g></defs>
        <g filter="url(#${material}-shadow)">
          <path d="${medallion}" transform="translate(0 2.4)" fill="#98734f"/>
          <path d="${medallion}" fill="url(#${material}-body)" filter="url(#${material}-grain)"/>
          <path d="M5 25C13 9 29 0 46-1M4 72C7 82 12 87 19 92" fill="none" stroke="#fff2d6" stroke-width="1.7" stroke-linecap="round" opacity=".3"/>
          <path d="M82 10Q89 13 93 20M16 85Q20 90 26 92" fill="none" stroke="#9c7653" stroke-width=".8" stroke-linecap="round" opacity=".22"/>
          <use href="#${icon}" transform="translate(1.7 3.4)" stroke="#513b2a" stroke-width="8.5" opacity=".3" filter="url(#${material}-contact)"/>
          <g filter="url(#${material}-edge)">
            <use href="#${icon}" transform="translate(.7 1.8)" stroke="#293f4d" stroke-width="7.7"/>
            <use href="#${icon}" stroke="url(#${material}-relief)" stroke-width="7.3"/>
            <use href="#${icon}" transform="translate(-.4 -.65)" stroke="#b6c2bd" stroke-width="1.1" opacity=".28"/>
          </g>
        </g>
      </svg>${layer.label?`<text x="${size/2}" y="${size*1.27}" text-anchor="middle" fill="#204477" font-family="sans-serif" font-weight="700" font-size="${size*.14}">${escape(layer.label)}</text>`:""}</g>`;
  }).join("")}</svg>`;
}
