/**
 * DEAL! Boxing — machine registry + print-ready membership QR codes.
 * Admin allowlist checked by handleAdminApi BEFORE this handler is invoked.
 * This feature has no interface with QR BOX, payment providers, or machine activation.
 */
import { membershipQrSvg } from './qr-svg.js';

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};
const CODE_PATTERN = /^BX[A-Z0-9-]{2,20}$/;
const LOCATION_ID_PATTERN = /^L\d{4,8}$/;
const MAX_MACHINE_LIST = 500;

function json(data, status = 200) { return new Response(JSON.stringify(data), {status, headers: HEADERS}); }
function reject(error, message, status = 400) { return json({error, message}, status); }
function sameOrigin(request) { return request.headers.get('origin') === new URL(request.url).origin; }
function normalize(value) { return typeof value === 'string' ? value.trim() : ''; }
function validText(value, max) { return Boolean(value) && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); }
function targetUrl(env, code) {
  return /^\d{10}-[A-Za-z0-9_-]+$/.test(env.LIFF_ID || '')
    ? `https://liff.line.me/${env.LIFF_ID}/m/${code}` : null;
}
async function getPayload(request) {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (!Number.isFinite(contentLength) || contentLength > 8_192) throw new Error('PAYLOAD_TOO_LARGE');
  if (!(request.headers.get('content-type') || '').includes('application/json')) throw new Error('JSON_REQUIRED');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 8_192) throw new Error('PAYLOAD_TOO_LARGE');
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('INVALID_JSON');
  return data;
}
function cleanMachineFields(input, withCode = false) {
  const code = normalize(input.machineCode).toUpperCase();
  const name = normalize(input.machineName);
  const locName = normalize(input.locationName);
  const locCode = normalize(input.locationCode).toUpperCase();
  const active = input.active;
  if (withCode && !CODE_PATTERN.test(code)) throw new Error('MACHINE_CODE_INVALID');
  if (!validText(name, 100) || !validText(locName, 120)) throw new Error('INVALID_MACHINE_NAME_OR_LOCATION');
  if (locCode && !LOCATION_ID_PATTERN.test(locCode)) throw new Error('LOCATION_CODE_INVALID');
  if (typeof active !== 'boolean') throw new Error('ACTIVE_REQUIRED');
  return {code, name, locCode: locCode || null, locName, active: active ? 1 : 0};
}

async function getMachines(env, admin) {
  const all = await env.DB.prepare(`
    SELECT m.machine_code AS code, m.location_code AS locationCode,
      m.location_name AS locationName, m.machine_name AS name,
      m.active AS active, m.created_at AS createdAt,
      COUNT(c.id) AS checkins, COUNT(DISTINCT c.member_id) AS uniqueMembers
    FROM machines m LEFT JOIN checkins c ON c.machine_code = m.machine_code
    GROUP BY m.machine_code
    ORDER BY m.machine_code ASC
    LIMIT ?
  `).bind(MAX_MACHINE_LIST + 1).all();
  const rows = all.results || [];
  return json({
    role: admin.role,
    truncated: rows.length > MAX_MACHINE_LIST,
    items: rows.slice(0, MAX_MACHINE_LIST).map(r => ({
      code:r.code, name:r.name, locationCode:r.locationCode, locationName:r.locationName,
      active:Boolean(r.active), checkins:Number(r.checkins||0), uniqueMembers:Number(r.uniqueMembers||0),
      createdAt:r.createdAt, membershipUrl:targetUrl(env,r.code)
    }))
  });
}
async function createMachine(request, env) {
  let input, data;
  try { input = await getPayload(request); data = cleanMachineFields(input,true); }
  catch(e) { return reject('INVALID_INPUT', String(e.message || 'กรอกข้อมูลไม่ถูกต้อง')); }
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO machines (machine_code,location_code,location_name,machine_name,active)
    VALUES (?,?,?,?,?)
  `).bind(data.code,data.locCode,data.locName,data.name,data.active).run();
  if (!(inserted?.meta?.changes ?? inserted?.changes)) return reject('MACHINE_ALREADY_EXISTS','มีรหัสตู้นี้อยู่แล้ว',409);
  console.info('machine_added', {machineCode:data.code});
  return json({code:data.code, created:true},201);
}
async function updateMachine(request,env,code) {
  let input,data;
  try { input=await getPayload(request); data=cleanMachineFields(input); }
  catch(e) { return reject('INVALID_INPUT',String(e.message||'กรอกข้อมูลไม่ถูกต้อง')); }
  const result = await env.DB.prepare(`
    UPDATE machines SET machine_name=?,location_code=?,location_name=?,active=?
    WHERE machine_code=?
  `).bind(data.name,data.locCode,data.locName,data.active,code).run();
  if (!(result?.meta?.changes ?? result?.changes)) return reject('MACHINE_NOT_FOUND','ไม่พบรหัสตู้นี้',404);
  console.info('machine_updated', {machineCode:code, active:Boolean(data.active)});
  return json({code,updated:true});
}

export async function handleMachineAdminApi(request, env, admin) {
  const url = new URL(request.url);
  const path = url.pathname;
  const list = path === '/api/admin/machines';
  const update = path.match(/^\/api\/admin\/machines\/(BX[A-Z0-9-]{2,20})$/);
  const qr = path.match(/^\/api\/admin\/machines\/(BX[A-Z0-9-]{2,20})\/qr\.svg$/);
  if (!list && !update && !qr) return reject('NOT_FOUND','ไม่พบ API',404);

  if (request.method === 'GET' && list) return getMachines(env,admin);
  if (request.method === 'GET' && qr) {
    const code = qr[1];
    const machine = await env.DB.prepare('SELECT machine_code, active FROM machines WHERE machine_code = ?').bind(code).first();
    if (!machine) return reject('MACHINE_NOT_FOUND','ไม่พบตู้ที่ต้องการ',404);
    if (!machine.active) return reject('MACHINE_DISABLED','ตู้นี้ปิดการเช็กอินอยู่',409);
    const target = targetUrl(env,code);
    if (!target) return reject('LIFF_NOT_CONFIGURED','LIFF ยังไม่พร้อม',503);
    const svg = membershipQrSvg(target);
    return new Response(svg,{status:200,headers:{
      'content-type':'image/svg+xml; charset=utf-8',
      'cache-control':'private, no-store',
      'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'",
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer'
    }});
  }
  if (request.method === 'POST' && list || request.method === 'PATCH' && update) {
    if (admin.role !== 'owner') return reject('OWNER_ONLY','เฉพาะ Owner เท่านั้นที่แก้ทะเบียนตู้ได้',403);
    if (!sameOrigin(request)) return reject('ORIGIN_REJECTED','Origin ไม่ถูกต้อง',403);
    if (request.method === 'POST') return createMachine(request,env);
    return updateMachine(request,env,update[1]);
  }
  return reject('METHOD_NOT_ALLOWED','Method not allowed',405);
}
