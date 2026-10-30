// Iconografía, logotipo e ilustraciones ORIGINALES de MEDICINA (SVG en línea).
// Inspiración: estética sanitaria institucional gallega (verdes azulados y
// azules limpios), sin usar logotipos ni símbolos oficiales de nadie.

export const C = {
  teal: '#0E7C7B', tealDeep: '#0A5E5E', turq: '#5BC2BB', turqWash: '#DDF2F0',
  blue: '#2C6EA6', blueWash: '#E3EEF8', pearl: '#E9EEF1', white: '#FFFFFF', ink: '#1E3238',
};

const svg = (body, { size = 22, vb = '0 0 24 24', cls = 'icon', label } = {}) =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}>${body}</svg>`;

export const icons = {
  home: (o) => svg('<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V19a1 1 0 0 0 1 1h3.5v-5h3v5H17a1 1 0 0 0 1-1V9.5"/>', o),
  pill: (o) => svg('<rect x="3.2" y="8.5" width="17.6" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="m9.2 8.2 5.6 7.6"/>', o),
  capsule: (o) => svg('<path d="M10.2 4.6a4.3 4.3 0 0 1 6.1 6.1l-5.6 5.6a4.3 4.3 0 0 1-6.1-6.1Z"/><path d="m7.4 7.4 6.1 6.1"/>', o),
  history: (o) => svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v3.8h3.8"/><path d="M12 8v4.2l2.8 1.8"/>', o),
  calendar: (o) => svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/><circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none"/>', o),
  user: (o) => svg('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20c.9-3.6 3.8-5.6 7.2-5.6s6.3 2 7.2 5.6"/>', o),
  box: (o) => svg('<path d="M4 8.2 12 4l8 4.2v7.6L12 20l-8-4.2Z"/><path d="M4 8.2 12 12.4l8-4.2M12 12.4V20"/>', o),
  receipt: (o) => svg('<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>', o),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', o),
  minus: (o) => svg('<path d="M5 12h14"/>', o),
  left: (o) => svg('<path d="M14.5 6 8.5 12l6 6"/>', o),
  right: (o) => svg('<path d="M9.5 6l6 6-6 6"/>', o),
  close: (o) => svg('<path d="M6 6l12 12M18 6 6 18"/>', o),
  check: (o) => svg('<path d="M5 12.5 10 17.5 19 7"/>', o),
  skip: (o) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 15.5l7-7"/>', o),
  trash: (o) => svg('<path d="M4.5 7h15M10 4h4M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12"/>', o),
  pencil: (o) => svg('<path d="M15.5 4.5l4 4L9 19H5v-4Z"/>', o),
  download: (o) => svg('<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>', o),
  upload: (o) => svg('<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>', o),
  pdf: (o) => svg('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z"/><path d="M14 3.5v5h5"/><path d="M8.5 13h7M8.5 16.5h5"/>', o),
  shield: (o) => svg('<path d="M12 3.5 5 6v5.5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9V6Z"/><path d="M9 12l2 2 4-4"/>', o),
  clock: (o) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', o),
  bell: (o) => svg('<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', o),
  alert: (o) => svg('<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4.2M12 17h.01"/>', o),
  pause: (o) => svg('<rect x="6.5" y="5" width="3.5" height="14" rx="1.2"/><rect x="14" y="5" width="3.5" height="14" rx="1.2"/>', o),
  play: (o) => svg('<path d="M7.5 5.2v13.6L18.5 12Z"/>', o),
  stop: (o) => svg('<rect x="6" y="6" width="12" height="12" rx="2.5"/>', o),
  archive: (o) => svg('<rect x="3.5" y="4.5" width="17" height="4" rx="1.2"/><path d="M5 8.5v10a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-10M10 12.5h4"/>', o),
  refresh: (o) => svg('<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4"/>', o),
  lock: (o) => svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>', o),
  mail: (o) => svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>', o),
  logout: (o) => svg('<path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7"/><path d="M15.5 8.5 19 12l-3.5 3.5M19 12H10"/>', o),
  sun: (o) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.8v2M12 19.2v2M21.2 12h-2M4.8 12h-2M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4M18.5 18.5l-1.4-1.4M6.9 6.9 5.5 5.5"/>', o),
  note: (o) => svg('<path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>', o),
  chart: (o) => svg('<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6" rx="1"/><rect x="10.5" y="6" width="3" height="11" rx="1"/><rect x="15.5" y="9" width="3" height="8" rx="1"/>', o),
  cloud: (o) => svg('<path d="M7.5 18.5h9.2a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.4 3.3 3.3 0 0 0 .8 6.6Z"/>', o),
  sliders: (o) => svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', o),
  cross: (o) => svg('<path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5Z"/>', o),
};

/** Cápsula de marca (mitad verde azulado, mitad turquesa) con una pequeña cruz. */
export function capsuleMark(size = 34) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">
    <g transform="rotate(-38 24 24)">
      <rect x="6" y="15.5" width="36" height="17" rx="8.5" fill="${C.turq}"/>
      <path d="M14.5 15.5H24v17h-9.5a8.5 8.5 0 0 1 0-17Z" fill="${C.teal}"/>
      <rect x="9" y="18.2" width="11" height="2.6" rx="1.3" fill="#fff" opacity=".35"/>
    </g>
    <circle cx="37.5" cy="37.5" r="8" fill="#fff"/>
    <path d="M36 32.5h3v3.5h3.5v3H39v3.5h-3V39h-3.5v-3H36Z" fill="${C.blue}"/>
  </svg>`;
}

/** Logotipo: cápsula + MEDICINA en versalitas espaciadas. */
export const logo = (cls = '') =>
  `<span class="logo ${cls}" role="img" aria-label="MEDICINA">${capsuleMark(cls.includes('lg') ? 46 : 30)}<span class="logo-word">MEDICINA</span></span>`;

/** Icono de la app (cuadrado, para la pantalla de inicio del iPhone). */
export function appIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6F5F3"/><stop offset="1" stop-color="#D3E9F2"/></linearGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <circle cx="256" cy="256" r="168" fill="#fff" opacity=".7"/>
    <g transform="rotate(-38 256 256)">
      <rect x="96" y="196" width="320" height="120" rx="60" fill="${C.turq}"/>
      <path d="M156 196h100v120H156a60 60 0 0 1 0-120Z" fill="${C.teal}"/>
      <rect x="122" y="216" width="92" height="18" rx="9" fill="#fff" opacity=".35"/>
    </g>
    <circle cx="372" cy="372" r="62" fill="#fff"/>
    <path d="M360 332h24v28h28v24h-28v28h-24v-28h-28v-24h28Z" fill="${C.blue}"/>
  </svg>`;
}

/**
 * Ilustraciones originales para cabeceras y estados vacíos.
 * Formas sencillas y serenas: nada infantil ni hospitalario.
 */
export function scene(kind = 'welcome', { width = 220 } = {}) {
  const leaf = (x, y, r = 0, s = 1) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0c10-14 28-16 34-14C32 0 18 10 0 0Z" fill="#B9DED7"/><path d="M0 0c12-6 22-9 32-13" stroke="#8CC6BC" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
  const bodies = {
    welcome: `<circle cx="110" cy="70" r="58" fill="${C.turqWash}"/>
      ${leaf(54, 104, -18)}${leaf(150, 108, 200, .9)}
      <rect x="82" y="40" width="56" height="74" rx="12" fill="#fff" stroke="${C.teal}" stroke-width="2.4"/>
      <rect x="78" y="28" width="64" height="18" rx="6" fill="${C.teal}"/>
      <rect x="92" y="62" width="36" height="30" rx="6" fill="${C.blueWash}"/>
      <path d="M107 68h6v6h6v6h-6v6h-6v-6h-6v-6h6Z" fill="${C.blue}"/>
      <g transform="rotate(-30 160 44)"><rect x="146" y="38" width="30" height="13" rx="6.5" fill="${C.turq}"/><path d="M152.5 38h8.5v13h-8.5a6.5 6.5 0 0 1 0-13Z" fill="${C.teal}"/></g>`,
    meds: `<circle cx="110" cy="66" r="54" fill="${C.blueWash}"/>
      ${leaf(48, 100, -14, .8)}
      <rect x="64" y="58" width="92" height="50" rx="10" fill="#fff" stroke="${C.blue}" stroke-width="2.2"/>
      <path d="M64 74h92" stroke="${C.blue}" stroke-width="2" opacity=".4"/>
      ${[0, 1, 2, 3].map((i) => `<circle cx="${80 + i * 20}" cy="91" r="6" fill="${i < 2 ? C.turq : C.pearl}" stroke="${C.teal}" stroke-width="1.4"/>`).join('')}
      <g transform="rotate(-35 140 40)"><rect x="124" y="33" width="36" height="15" rx="7.5" fill="${C.turq}"/><path d="M131.5 33h10.5v15h-10.5a7.5 7.5 0 0 1 0-15Z" fill="${C.teal}"/></g>`,
    history: `<circle cx="110" cy="66" r="54" fill="${C.turqWash}"/>
      <rect x="76" y="30" width="68" height="84" rx="10" fill="#fff" stroke="${C.teal}" stroke-width="2.2"/>
      <rect x="94" y="24" width="32" height="12" rx="5" fill="${C.teal}"/>
      ${[0, 1, 2].map((i) => `<circle cx="92" cy="${56 + i * 18}" r="5" fill="${i < 2 ? C.turq : C.pearl}"/><path d="M104 ${56 + i * 18}h28" stroke="${C.pearl}" stroke-width="5" stroke-linecap="round"/>`).join('')}
      ${leaf(146, 104, 200, .8)}`,
    calendar: `<circle cx="110" cy="66" r="54" fill="${C.blueWash}"/>
      <rect x="66" y="34" width="88" height="76" rx="12" fill="#fff" stroke="${C.blue}" stroke-width="2.2"/>
      <path d="M66 54h88" stroke="${C.blue}" stroke-width="2"/>
      ${[0, 1, 2, 3].map((c) => [0, 1].map((r) => `<circle cx="${82 + c * 19}" cy="${70 + r * 20}" r="5" fill="${(c + r) % 3 === 0 ? C.turq : C.pearl}"/>`).join('')).join('')}
      ${leaf(52, 102, -16, .8)}`,
    stock: `<circle cx="110" cy="66" r="54" fill="${C.turqWash}"/>
      <path d="M70 52 110 34l40 18v38l-40 20-40-20Z" fill="#fff" stroke="${C.teal}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M70 52l40 19 40-19M110 71v39" stroke="${C.teal}" stroke-width="2" opacity=".6"/>
      <path d="M105 85h10M110 80v10" stroke="${C.blue}" stroke-width="3" stroke-linecap="round"/>
      ${leaf(150, 104, 200, .8)}`,
  };
  return `<svg class="scene" viewBox="0 0 220 132" width="${width}" aria-hidden="true">${bodies[kind] || bodies.welcome}</svg>`;
}
