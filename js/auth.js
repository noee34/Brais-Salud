// Pantalla de acceso: entrar, crear cuenta, recuperar y cambiar la contraseña.
import { logo, icons, scene } from './art.js';
import { esc, $ } from './ui.js';
import { getRemember, setRemember } from './account.js';

export const MIN_PASSWORD = 8;

/** Traduce los mensajes de Supabase a algo comprensible. */
export function authMessage(error) {
  const m = (error?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed')) return 'Falta confirmar el correo: abre el enlace que te enviamos y vuelve a entrar.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con ese correo. Entra con tu contraseña.';
  if (m.includes('same') && m.includes('password')) return 'La contraseña nueva debe ser distinta de la anterior.';
  if (m.includes('password') && (m.includes('at least') || m.includes('weak') || m.includes('short'))) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres y no ser demasiado común.`;
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) return 'El registro de cuentas nuevas está cerrado.';
  if (m.includes('fetch') || m.includes('network') || m.includes('failed to')) return 'No hay conexión. Comprueba Internet y vuelve a intentarlo.';
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Ese correo no parece válido.';
  return error?.message || 'Algo no ha funcionado. Inténtalo de nuevo.';
}

/**
 * Muestra la pantalla de acceso dentro de `root`.
 * mode: 'login' | 'signup' | 'reset' | 'recovery'
 */
export function showAuth(root, client, { mode = 'login', onSession, notice = '' }) {
  const tabbar = document.getElementById('tabbar');
  if (tabbar) tabbar.hidden = true;
  root.hidden = false;

  const titles = {
    login: ['Bienvenido', 'Entra para consultar tus medicamentos, tus tomas y tu historial desde cualquier dispositivo.'],
    signup: ['Crear cuenta', 'Tu cuenta es personal: solo tú verás tus medicamentos y tu historial.'],
    reset: ['Recuperar contraseña', 'Te enviaremos un enlace al correo para elegir una nueva.'],
    recovery: ['Nueva contraseña', 'Escribe la contraseña que quieres usar a partir de ahora.'],
  };
  const [title, sub] = titles[mode];
  const needEmail = mode !== 'recovery';
  const needPass = mode !== 'reset';
  const needRepeat = mode === 'signup' || mode === 'recovery';
  const submitLabel = { login: 'Entrar', signup: 'Crear cuenta', reset: 'Enviar enlace', recovery: 'Guardar contraseña' }[mode];

  root.innerHTML = `
  <div class="auth">
    <div class="auth-brand">${logo('lg')}</div>
    ${scene('welcome', { width: 230 })}
    <h1 class="h-display">${title}</h1>
    <p class="subtle auth-sub">${sub}</p>
    <form class="auth-form" novalidate>
      ${needEmail ? `<label class="auth-field"><span class="eyebrow">Correo electrónico</span>
        <input class="auth-input" type="email" name="email" id="auth-email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" required></label>` : ''}
      ${needPass ? `<label class="auth-field"><span class="eyebrow">Contraseña</span>
        <span class="auth-pass"><input class="auth-input" type="password" name="password" id="auth-password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="${MIN_PASSWORD}" required>
        <button type="button" class="auth-eye" data-toggle-pass aria-label="Mostrar contraseña">Ver</button></span></label>` : ''}
      ${needRepeat ? `<label class="auth-field"><span class="eyebrow">Repite la contraseña</span>
        <input class="auth-input" type="password" name="repeat" id="auth-repeat" autocomplete="new-password" required></label>
        <p class="field-hint" style="margin:0">Mínimo ${MIN_PASSWORD} caracteres.</p>` : ''}
      ${mode === 'login' || mode === 'signup' ? `<label class="remember"><input type="checkbox" name="remember" ${getRemember() ? 'checked' : ''}>
        <span><strong>Mantener la sesión iniciada</strong><br><span class="subtle">No tendrás que volver a escribir tus datos en este dispositivo.</span></span></label>` : ''}
      <p class="form-error" role="alert">${esc(notice)}</p>
      <button type="submit" class="btn btn-primary btn-block">${submitLabel}</button>
    </form>
    <div class="auth-links">
      ${mode === 'login' ? `<button class="link-btn" data-mode="reset">¿Has olvidado la contraseña?</button>
        <button class="link-btn" data-mode="signup">Crear una cuenta nueva</button>` : ''}
      ${mode === 'signup' || mode === 'reset' ? '<button class="link-btn" data-mode="login">Ya tengo cuenta · Entrar</button>' : ''}
    </div>
    <p class="subtle auth-foot">${icons.shield({ size: 16 })} Tus datos de salud son privados: solo los ve tu cuenta.</p>
  </div>`;

  const form = $('form', root);
  const err = $('.form-error', root);
  const btn = $('button[type="submit"]', form);
  const go = (m, n = '') => showAuth(root, client, { mode: m, onSession, notice: n });

  root.onclick = (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) go(m.dataset.mode);
    const t = e.target.closest('[data-toggle-pass]');
    if (t) {
      const input = form.password;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      t.textContent = show ? 'Ocultar' : 'Ver';
      t.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
    }
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.textContent = '';
    const email = form.email?.value.trim();
    const password = form.password?.value || '';
    if (needEmail && !/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Escribe tu correo electrónico.'; return; }
    if (needPass && mode !== 'login' && password.length < MIN_PASSWORD) { err.textContent = `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`; return; }
    if (mode === 'login' && !password) { err.textContent = 'Escribe tu contraseña.'; return; }
    if (needRepeat && password !== form.repeat.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    if (form.remember) setRemember(form.remember.checked);

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Un momento…';
    try {
      if (mode === 'login') {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return finish(data.session);
      }
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } });
        if (error) throw error;
        if (data.session) return finish(data.session);
        return go('login', 'Cuenta creada. Te hemos enviado un correo: abre el enlace para confirmarla y después entra aquí.');
      }
      if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
        if (error) throw error;
        return go('login', 'Si existe una cuenta con ese correo, te llegará un enlace en unos minutos. Revisa también la carpeta de spam.');
      }
      if (mode === 'recovery') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        const { data } = await client.auth.getSession();
        return finish(data.session);
      }
    } catch (ex) {
      err.textContent = authMessage(ex);
      btn.disabled = false;
      btn.textContent = label;
    }
  };

  function finish(session) {
    root.hidden = true;
    root.innerHTML = '';
    root.onclick = null;
    if (tabbar) tabbar.hidden = false;
    onSession(session);
  }

  (form.email || form.password)?.focus({ preventScroll: true });
}

/** Dirección de la app sin el #, para los enlaces de los correos. */
function appUrl() {
  return location.origin + location.pathname;
}
