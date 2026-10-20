import { handleMachineAdminApi } from './machine-admin-api.js';
/**
 * DEAL! Boxing Admin — all analytics are CHECK-INS, never payment or game-play proof.
 * Authorization is done on EVERY /api/admin request using the signed member session
 * and an explicit admin_users allowlist in the SAME D1 database.
 */
const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
function n(value) { return Number(value || 0); }
function isoDaysAgo(days) { return new Date(Date.now() - days * 86400000).toISOString(); }
function parseDays(url) {
  const value = Number(url.searchParams.get('days') || '30');
  return [7, 30, 90].includes(value) ? value : 30;
}
function parseOffset(url) {
  const value = Number(url.searchParams.get('offset') || '0');
  return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 100000) : 0;
}
function publicMemberCode(id) { return `DBX${String(id).padStart(6, '0')}`; }

async function summary(env, url) {
  const days = parseDays(url);
  const since = isoDaysAgo(days);
  const [membership, newMembers, activity, repeated, byMachine, daily] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(marketing_opt_in),0) AS optIn FROM members').first(),
    env.DB.prepare('SELECT COUNT(*) AS total FROM members WHERE created_at >= ?').bind(since).first(),
    env.DB.prepare(`SELECT COUNT(*) AS checkins, COUNT(DISTINCT member_id) AS members,
       COUNT(DISTINCT machine_code) AS machines FROM checkins WHERE checked_in_at >= ?`).bind(since).first(),
    env.DB.prepare(`SELECT COUNT(*) AS total FROM (
       SELECT member_id FROM checkins WHERE checked_in_at >= ?
       GROUP BY member_id HAVING COUNT(*) >= 2
    )`).bind(since).first(),
    env.DB.prepare(`SELECT m.machine_code AS code, m.machine_name AS name,
       m.location_name AS locationName, m.location_code AS locationCode,
       m.active AS active, COUNT(c.id) AS checkins,
       COUNT(DISTINCT c.member_id) AS uniqueMembers
       FROM machines m
       LEFT JOIN checkins c ON c.machine_code = m.machine_code AND c.checked_in_at >= ?
       GROUP BY m.machine_code
       ORDER BY checkins DESC, m.machine_code ASC LIMIT 100`).bind(since).all(),
    env.DB.prepare(`SELECT substr(checked_in_at,1,10) AS day, COUNT(*) AS checkins
       FROM checkins WHERE checked_in_at >= ?
       GROUP BY substr(checked_in_at,1,10) ORDER BY day ASC`).bind(since).all()
  ]);
  const dailyMap = new Map((daily.results || []).map(x => [x.day, n(x.checkins)]));
  const calendar = [];
  // Includes today, with timestamps kept in UTC to match database timestamps.
  const today = new Date();
  const midnightUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(midnightUtc - i * 86400000).toISOString().slice(0, 10);
    calendar.push({ day, checkins: dailyMap.get(day) || 0 });
  }
  return json({
    days,
    totals: {
      members: n(membership?.total),
      newMembers: n(newMembers?.total),
      marketingOptIn: n(membership?.optIn),
      checkins: n(activity?.checkins),
      uniqueMembers: n(activity?.members),
      repeatMembers: n(repeated?.total),
      activeMachines: n(activity?.machines)
    },
    machines: (byMachine.results || []).map(row => ({
      code: row.code, name: row.name, locationName: row.locationName,
      locationCode: row.locationCode, active: Boolean(row.active),
      checkins: n(row.checkins), uniqueMembers: n(row.uniqueMembers)
    })),
    daily: calendar,
    updatedAt: new Date().toISOString(),
    dataType: 'checkins_only',
    paymentsIntegrated: false
  });
}

async function members(env, url) {
  const offset = parseOffset(url);
  const limit = 20;
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  // instr() treats % and _ literally; the parameter is always bound.
  const where = `( ? = '' OR instr(lower(m.display_name), lower(?)) > 0
                      OR instr(lower(printf('DBX%06d',m.id)), lower(?)) > 0 )`;
  const [count, items] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM members m WHERE ${where}`)
      .bind(q, q, q).first(),
    env.DB.prepare(`SELECT m.id, m.display_name AS displayName,
       m.created_at AS joinedAt, m.last_login_at AS lastLogin,
       m.marketing_opt_in AS marketingOptIn,
       COUNT(c.id) AS checkins, MAX(c.checked_in_at) AS lastCheckin
       FROM members m LEFT JOIN checkins c ON m.id = c.member_id
       WHERE ${where}
       GROUP BY m.id ORDER BY m.id DESC LIMIT ? OFFSET ?`)
       .bind(q, q, q, limit, offset).all()
  ]);
  return json({ total: n(count?.total), offset, limit, items: (items.results || []).map(r => ({
    memberCode: publicMemberCode(r.id), displayName: r.displayName,
    joinedAt: r.joinedAt, lastLogin: r.lastLogin,
    marketingOptIn: Boolean(r.marketingOptIn),
    checkins: n(r.checkins), lastCheckin: r.lastCheckin
  })) });
}

async function recent(env, url) {
  const since = isoDaysAgo(parseDays(url));
  const items = await env.DB.prepare(`SELECT c.id, c.machine_code AS machineCode,
    c.checked_in_at AS checkedInAt, m.id AS memberId,
    m.display_name AS displayName, x.location_name AS locationName
    FROM checkins c JOIN members m ON c.member_id=m.id
    JOIN machines x ON c.machine_code=x.machine_code
    WHERE c.checked_in_at >= ?
    ORDER BY c.checked_in_at DESC LIMIT 30`).bind(since).all();
  return json({ items: (items.results || []).map(r => ({
    machineCode: r.machineCode, checkedInAt: r.checkedInAt,
    memberCode: publicMemberCode(r.memberId), displayName: r.displayName,
    locationName: r.locationName
  })) });
}

export async function handleAdminApi(request, env, signedInMember) {
  if (!signedInMember) return json({ error: 'UNAUTHENTICATED', message: 'กรุณาเข้าสู่ระบบ LINE' }, 401);
  // NO automatic elevation. An authorized operator must INSERT a verified member_id.
  const admin = await env.DB.prepare('SELECT role FROM admin_users WHERE member_id = ?').bind(signedInMember.id).first();
  if (!admin) return json({ error: 'ADMIN_FORBIDDEN', message: 'บัญชีนี้ไม่ได้รับอนุญาตให้ดูข้อมูลหลังบ้าน' }, 403);
  if (new URL(request.url).pathname.startsWith('/api/admin/machines')) {
    return handleMachineAdminApi(request, env, admin);
  }
  if (request.method !== 'GET') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
  const url = new URL(request.url);
  if (url.pathname === '/api/admin/summary') return summary(env, url);
  if (url.pathname === '/api/admin/members') return members(env, url);
  if (url.pathname === '/api/admin/recent') return recent(env, url);
  return json({ error: 'NOT_FOUND' }, 404);
}
