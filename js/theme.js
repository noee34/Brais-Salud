// Apariencia: automático (sigue al iPhone), claro u oscuro.
// La elección se guarda en cada dispositivo (no se sincroniza), así el móvil
// puede ir en oscuro para las consultas de noche.
// index.html aplica la elección antes de pintar la pantalla para evitar destellos.

const KEY = 'medicina:theme';
export const THEMES = [
  ['auto', 'Automático'],
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
];
const BAR = { light: '#F4F8F9', dark: '#0E1A1D' };

export function getTheme() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch { return 'auto'; }
}

export function setTheme(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* sin almacenamiento: se aplica solo en esta visita */ }
  applyTheme(theme);
}

export function applyTheme(theme = getTheme()) {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Color de la barra del navegador / zona superior del iPhone.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const forDark = (m.getAttribute('media') || '').includes('dark');
    m.setAttribute('content', theme === 'auto' ? (forDark ? BAR.dark : BAR.light) : BAR[theme]);
  });
}
