// Foto de perfil: se recorta en cuadrado y se reduce en el propio iPhone antes
// de guardarla (unos 20–40 KB), para que se sincronice rápido entre dispositivos.
const SIDE = 320;
const MAX_CHARS = 90_000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se ha podido abrir esa imagen. Prueba con otra foto.')); };
    img.src = url;
  });
}

/** Convierte un archivo de imagen en una foto cuadrada JPEG reducida (data URL). */
export async function avatarFromFile(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Elige un archivo de imagen.');
  const img = await loadImage(file);
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  for (let q = 0.85; ; q -= 0.1) {
    const canvas = Object.assign(document.createElement('canvas'), { width: SIDE, height: SIDE });
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, SIDE, SIDE);
    ctx.drawImage(img, sx, sy, s, s, 0, 0, SIDE, SIDE);
    const data = canvas.toDataURL('image/jpeg', Math.max(q, 0.45));
    if (data.length <= MAX_CHARS || q < 0.5) return data;
  }
}

/** Círculo con la foto o, si no hay, la inicial del nombre o del correo. */
export function avatarHTML({ photo, name = '', email = '' }, size = 44) {
  const style = `width:${size}px;height:${size}px`;
  if (photo && /^data:image\/(jpeg|png|webp);base64,/.test(photo)) return `<img class="avatar" src="${photo}" alt="Foto de perfil" style="${style}">`;
  const letter = (name.trim() || email.trim() || '·').charAt(0).toUpperCase();
  return `<span class="avatar avatar-empty" style="${style};font-size:${Math.round(size * 0.42)}px" aria-hidden="true">${letter.replace(/[<>&"']/g, '')}</span>`;
}
