import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../src/worker.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(currentDir, '..');
const origin = 'https://boxing.example.test';

class D1Shim {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys=ON;');
    this.sqlite.exec(fs.readFileSync(path.join(root, 'migrations/0001_initial.sql'), 'utf8'));
    this.sqlite.exec(fs.readFileSync(path.join(root, 'migrations/0002_demo_machine.sql'), 'utf8'));
  }
  prepare(sql) {
    const stmt = this.sqlite.prepare(sql);
    return {
      bind: (...args) => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => stmt.run(...args)
      })
    };
  }
  async batch(statements) { return Promise.all(statements.map(s => s.run())); }
}

function setup() {
  const env = {
    DB: new D1Shim(),
    SESSION_SECRET: 'an-appropriately-long-private-hmac-secret-used-for-tests',
    LINE_LOGIN_CHANNEL_ID: '2012120948',
    LIFF_ID: '2012120948-demoLIFF'
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url === 'https://api.line.me/oauth2/v2.1/verify') {
      const token = new URLSearchParams(init.body).get('id_token');
      if (token === 'invalid'.repeat(10)) return new Response(JSON.stringify({message:'invalid'}), {status:400});
      return Response.json({ iss: 'https://access.line.me', aud: '2012120948', sub: 'U123testuser', name: 'คุณทดสอบ' });
    }
    throw new Error('Unexpected network access ' + url);
  };
  return { env, restore: () => { globalThis.fetch = originalFetch; } };
}
function request(endpoint, method = 'GET', body, cookie, setOrigin = true) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET' && setOrigin) headers.origin = origin;
  return new Request(`${origin}${endpoint}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const validToken = 'validIdToken'.repeat(8);

test('requires consent before account registration; securely stores check-ins and consent choices', async () => {
  const { env, restore } = setup();
  try {
    let response = await worker.fetch(request('/api/config'), env);
    assert.equal((await response.json()).ready, true);
    response = await worker.fetch(request('/api/me'), env);
    assert.equal(response.status, 401);

    response = await worker.fetch(request('/api/auth/line', 'POST', { idToken: validToken }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).registrationRequired, true);
    assert.equal(env.DB.sqlite.prepare('select count(*) as c from members').get().c, 0);

    response = await worker.fetch(request('/api/auth/line', 'POST', { idToken: validToken, privacyAccepted: true, marketingOptIn: false }), env);
    assert.equal(response.status, 200);
    const reg = await response.json();
    assert.equal(reg.member.code, 'DBX000001');
    assert.equal(reg.member.marketingOptIn, false);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
    assert.ok(response.headers.get('set-cookie').includes('Secure'));

    response = await worker.fetch(request('/api/me', 'GET', undefined, cookie), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).totalCheckins, 0);
    response = await worker.fetch(request('/api/checkin', 'POST', {machineCode:'BX001'}, cookie), env);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).confirmedPayment, false);
    response = await worker.fetch(request('/api/checkin', 'POST', {machineCode:'BX001'}, cookie), env);
    assert.equal((await response.json()).deduplicated, true);
    response = await worker.fetch(request('/api/me', 'GET', undefined, cookie), env);
    const me = await response.json();
    assert.equal(me.totalCheckins, 1);
    assert.equal(me.checkins[0].machineCode, 'BX001');

    response = await worker.fetch(request('/api/marketing', 'POST', {optIn:true}, cookie), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).marketingOptIn, true);
    assert.equal(env.DB.sqlite.prepare('select count(*) as c from marketing_consent_events').get().c, 2);

    response = await worker.fetch(request('/api/auth/line', 'POST', { idToken: validToken }), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).member.code, 'DBX000001');
    assert.equal(env.DB.sqlite.prepare('select count(*) as c from members').get().c, 1);

    response = await worker.fetch(request('/api/me', 'DELETE', {confirm:'DELETE'}, cookie), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).deleted, true);
    assert.equal(env.DB.sqlite.prepare('select count(*) as c from members').get().c, 0);
    assert.equal(env.DB.sqlite.prepare('select count(*) as c from checkins').get().c, 0);
    response = await worker.fetch(request('/api/me', 'GET', undefined, cookie), env);
    assert.equal(response.status, 401);
  } finally { restore(); }
});

test('rejects cross-origin mutations, rejects invalid machines and invalid LINE tokens', async () => {
  const { env, restore } = setup();
  try {
    let response = await worker.fetch(request('/api/auth/line', 'POST', {idToken:validToken}, undefined, false), env);
    assert.equal(response.status, 403);
    response = await worker.fetch(request('/api/auth/line', 'POST', {idToken:'invalid'.repeat(10), privacyAccepted:true}), env);
    assert.equal(response.status, 401);
    response = await worker.fetch(request('/api/machine?code=BX001'), env);
    assert.equal(response.status, 200);
    response = await worker.fetch(request('/api/machine?code=BX999'), env);
    assert.equal(response.status, 404);
    response = await worker.fetch(request('/api/machine?code=FOO'), env);
    assert.equal(response.status, 400);
    response = await worker.fetch(request('/api/qrbox/pay'), env);
    assert.equal(response.status, 404);
  } finally { restore(); }
});
