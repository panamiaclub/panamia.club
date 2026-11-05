import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

for (const language of ['en', 'es'] as const) {
  const signin: Record<string, string> = JSON.parse(
    readFileSync(
      new URL(`../locales/${language}/signin.json`, import.meta.url),
      'utf8'
    )
  );
  const common: {
    nav: { signUp: string; signIn: string };
    authMenu: { open: string };
  } = JSON.parse(
    readFileSync(
      new URL(`../locales/${language}/common.json`, import.meta.url),
      'utf8'
    )
  );

  test(`${language} explicitly offers account creation and returning-member access`, () => {
    assert.equal(
      signin.welcomeTitle.replace(/\s+/g, ' '),
      language === 'en'
        ? 'Create an account or sign in'
        : 'Crea una cuenta o inicia sesión'
    );
    assert.equal(
      common.nav.signUp,
      language === 'en' ? 'Create account' : 'Crear cuenta'
    );
    assert.equal(
      common.nav.signIn,
      language === 'en' ? 'Sign in' : 'Iniciar sesión'
    );
    assert.equal(
      common.authMenu.open,
      language === 'en'
        ? 'Create account or sign in'
        : 'Crear cuenta o iniciar sesión'
    );
    assert.match(signin.welcomeDesc, /<strong>.+<\/strong>/);
    assert.equal(
      signin.welcomeDesc.match(/<strong>/g)?.length,
      2,
      'both new and returning members need a clear introduction'
    );
  });

  test(`${language} keeps email actions neutral and explains the passwordless flow`, () => {
    assert.equal(
      signin.continueEmail,
      language === 'en'
        ? 'Continue with email'
        : 'Continuar con correo electrónico'
    );
    assert.equal(
      signin.sendLink,
      language === 'en' ? 'Email me a link' : 'Enviarme un enlace'
    );
    assert.ok(signin.emailLabel);
    assert.match(
      signin.emailHint,
      language === 'en' ? /No password needed/ : /No necesitas contraseña/
    );
  });

  test(`${language} does not advertise Google when that provider is unavailable`, () => {
    assert.match(signin.welcomeDesc, /Google/);
    assert.doesNotMatch(signin.welcomeDescOptions, /Google/);
    assert.doesNotMatch(signin.welcomeDescEmail, /Google/);
    assert.match(
      signin.welcomeDescEmail,
      language === 'en' ? /Enter your email/ : /Escribe tu correo/
    );
  });
}
