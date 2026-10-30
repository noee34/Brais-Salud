// Sesión actual (Supabase Auth): mantener la sesión, cerrar sesión, cambiar la
// contraseña y eliminar la cuenta. Lo comparten app.js, el acceso y Perfil.
import { store } from './store.js';
import { confirmDialog, toast } from './ui.js';

export const account = { client: null, user: null };
export const LAST_USER = 'medicina:last-user';
const REMEMBER = 'medicina:remember';

/** true = recordar la sesión en este dispositivo (opción por defecto). */
export function getRemember() {
  try { return localStorage.getItem(REMEMBER) !== '0'; } catch { return true; }
}
export function setRemember(on) {
  try { localStorage.setItem(REMEMBER, on ? '1' : '0'); } catch { /* sin almacenamiento */ }
}

/**
 * Dónde guarda Supabase la sesión. Si se mantiene iniciada, en el almacenamiento
 * permanente del dispositivo; si no, en uno temporal que el iPhone borra al
 * cerrar la app (y habrá que volver a entrar).
 */
export const sessionStorageAdapter = {
  getItem(k) { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch { return null; } },
  setItem(k, v) {
    try {
      if (getRemember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
      else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
    } catch { /* sin almacenamiento */ }
  },
  removeItem(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* nada */ } },
};

/** Nombre de la copia local de esta cuenta en el iPhone. */
export const localDbName = (userId) => `medicina-${userId}`;

/**
 * Cerrar sesión. Los datos siguen en la nube; en este iPhone se borra la copia
 * local de la cuenta. Si hay cambios sin subir, se avisa antes.
 */
export async function signOut() {
  const pending = store.sync?.pending || 0;
  if (pending) {
    const ok = await confirmDialog({
      title: 'Hay cambios sin subir',
      message: `${pending} ${pending === 1 ? 'cambio no se ha' : 'cambios no se han'} guardado todavía en la nube porque no hay conexión. Si cierras la sesión ahora, se perderán.\n\nConecta el iPhone a Internet y espera a ver "Guardado" antes de salir.`,
      confirmLabel: 'Cerrar sesión igualmente',
    });
    if (!ok) return;
  } else {
    const ok = await confirmDialog({
      title: 'Cerrar sesión',
      message: 'Tus datos se quedan guardados en la nube. Para volver a verlos, entra con tu correo y tu contraseña.',
      confirmLabel: 'Cerrar sesión', danger: false,
    });
    if (!ok) return;
  }
  try { await account.client.auth.signOut(); } catch (e) { console.warn(e); }
  forgetLocal();
  location.replace(location.pathname);
}

function forgetLocal() {
  try { localStorage.removeItem(LAST_USER); } catch { /* nada */ }
  try {
    store.adapter?.local?.db?.close();
    indexedDB.deleteDatabase(localDbName(account.user.id));
  } catch { /* nada */ }
}

/** Cambiar la contraseña comprobando antes la actual. */
export async function changePassword(current, next) {
  const { error: e1 } = await account.client.auth.signInWithPassword({ email: account.user.email, password: current });
  if (e1) throw new Error('La contraseña actual no es correcta.');
  const { error: e2 } = await account.client.auth.updateUser({ password: next });
  if (e2) throw e2;
}

/**
 * Eliminar la cuenta y TODOS sus datos (medicamentos, tomas, historial,
 * reposiciones y ajustes). Pide escribir ELIMINAR para confirmar.
 */
export async function deleteAccount() {
  const ok = await confirmDialog({
    title: 'Eliminar la cuenta',
    message: 'Se borrarán para siempre tu cuenta y todos tus datos: medicamentos, tomas, historial, existencias, reposiciones y ajustes, en la nube y en este iPhone.\n\nNo se puede deshacer. Si quieres conservar tu historial, exporta antes un informe PDF o una copia de seguridad.',
    confirmLabel: 'Eliminar mi cuenta para siempre',
    typeToConfirm: 'ELIMINAR',
  });
  if (!ok) return false;
  if (navigator.onLine === false) { toast('Necesitas conexión a Internet para eliminar la cuenta', { kind: 'warn' }); return false; }
  const { error } = await account.client.rpc('eliminar_mi_cuenta');
  if (error) { toast(`No se pudo eliminar: ${error.message}`, { kind: 'warn', ms: 4000 }); return false; }
  try { await account.client.auth.signOut(); } catch { /* la cuenta ya no existe */ }
  forgetLocal();
  location.replace(`${location.pathname}?cuenta=eliminada`);
  return true;
}
