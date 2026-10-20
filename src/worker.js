import { handleAdminApi } from './admin-api.js';
/**
 * DEAL! Boxing Membership MVP
 * - LINE-verified registration, session cookie, check-ins, self-service consent and deletion.
 * - Does not interact with QR BOX, AKI, T-DEV, payments, or machine activation.
 */
const SECURE_JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY"
};
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ID_PATTERN = /^BX[A-Z0-9-]{2,20}$/;

function json(value, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(value), { status, headers: { ...SECURE_JSON_HEADERS, ...extraHeaders } });
}
function fail(code, message, status = 400) {
  return json({ error: code, message }, status);
}
function b64url(data) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  let binary = "";
  for (const c of bytes) binary += String.fromCharCode(c);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function deb64url(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmacKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function newSession(memberId, env) {
  const payload = b64url(JSON.stringify({ id: memberId, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const key = await hmacKey(env);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `${payload}.${b64url(sig)}`;
}
async function sessionMember(request, env) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)boxing_session=([^;]+)/);
  if (!match) return null;
  const segments = match[1].split(".");
  if (segments.length !== 2 || !segments[0] || !segments[1]) return null;
  try {
    const key = await hmacKey(env);
    const valid = await crypto.subtle.verify("HMAC", key, deb64url(segments[1]), new TextEncoder().encode(segments[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(deb64url(segments[0])));
    if (!Number.isInteger(payload.id) || payload.id < 1 || payload.exp <= Date.now() / 1000) return null;
    const member = await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(payload.id).first();
    return member || null;
  } catch {
    return null;
  }
}
function sessionCookie(session) {
  return `boxing_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}
function clearCookie() {
  return "boxing_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
function asMember(row) {
  return {
    code: `DBX${String(row.id).padStart(6, "0")}`,
    displayName: row.display_name,
    marketingOptIn: Boolean(row.marketing_opt_in),
    joinedAt: row.created_at
  };
}
function asMachine(row) {
  return { code: row.machine_code, locationCode: row.location_code, locationName: row.location_name, name: row.machine_name };
}
async function verifyLineIdToken(token, channelId) {
  if (typeof token !== "string" || token.length < 50 || token.length > 8192) throw new Error("INVALID_ID_TOKEN");
  const body = new URLSearchParams({ id_token: token, client_id: channelId });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(7000)
  });
  if (!res.ok) throw new Error("LINE_TOKEN_REJECTED");
  const identity = await res.json();
  if (identity.aud !== channelId || !identity.sub || identity.iss !== "https://access.line.me") throw new Error("LINE_IDENTITY_INVALID");
  return { userId: identity.sub, name: (identity.name || "สมาชิก DEAL! Boxing").slice(0, 100) };
}
async function bodyJson(request) {
  if (Number(request.headers.get("content-length") || 0) > 16_384) throw new Error("PAYLOAD_TOO_LARGE");
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("JSON_REQUIRED");
  return request.json();
}
function correctOrigin(request) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}
async function getMe(request, env) {
  const member = await sessionMember(request, env);
  if (!member) return fail("UNAUTHENTICATED", "โปรดเข้าสู่ระบบ LINE อีกครั้ง", 401);
  const last = await env.DB.prepare(`
    SELECT c.id, c.machine_code AS machineCode, c.checked_in_at AS at, m.location_name AS locationName
    FROM checkins c JOIN machines m ON m.machine_code = c.machine_code
    WHERE c.member_id = ? ORDER BY c.checked_in_at DESC LIMIT 8
  `).bind(member.id).all();
  const count = await env.DB.prepare("SELECT COUNT(1) AS total FROM checkins WHERE member_id = ?").bind(member.id).first();
  return json({ member: asMember(member), checkins: last.results, totalCheckins: count?.total ?? 0 });
}
async function authLine(request, env) {
  if (!env.LINE_LOGIN_CHANNEL_ID || !env.DB) return fail("SETUP_REQUIRED", "โปรดยืนยันการตั้งค่าระบบ", 503);
  let payload;
  try { payload = await bodyJson(request); } catch { return fail("BAD_REQUEST", "ข้อมูลไม่ถูกต้อง"); }
  let identity;
  try { identity = await verifyLineIdToken(payload.idToken, env.LINE_LOGIN_CHANNEL_ID); }
  catch { return fail("LOGIN_FAILED", "ยืนยันบัญชี LINE ไม่สำเร็จ กรุณาลองใหม่", 401); }

  const existing = await env.DB.prepare("SELECT * FROM members WHERE line_user_id = ?").bind(identity.userId).first();
  if (!existing && payload.privacyAccepted !== true) {
    return json({ registrationRequired: true });
  }
  const now = new Date().toISOString();
  const marketing = payload.marketingOptIn === true ? 1 : 0;
  let member = existing;
  if (!existing) {
    // Unique LINE User ID protects against duplicate registrations.
    await env.DB.prepare(`INSERT OR IGNORE INTO members
      (line_user_id, display_name, marketing_opt_in, privacy_accepted_at, marketing_changed_at, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(identity.userId, identity.name, marketing, now, now, now, now, now).run();
    member = await env.DB.prepare("SELECT * FROM members WHERE line_user_id = ?").bind(identity.userId).first();
    if (member && member.created_at === now) {
      await env.DB.prepare("INSERT INTO marketing_consent_events (id, member_id, opted_in, source, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), member.id, marketing, "registration", now).run();
    }
  } else {
    await env.DB.prepare("UPDATE members SET display_name = ?, updated_at = ?, last_login_at = ? WHERE id = ?")
      .bind(identity.name, now, now, existing.id).run();
    member.display_name = identity.name;
  }
  if (!member) return fail("DB_ERROR", "สร้างสมาชิกไม่สำเร็จ", 500);
  const session = await newSession(member.id, env);
  return json({ member: asMember(member), registrationRequired: false }, 200, { "set-cookie": sessionCookie(session) });
}
async function checkin(request, env) {
  const member = await sessionMember(request, env);
  if (!member) return fail("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ", 401);
  let body;
  try { body = await bodyJson(request); } catch { return fail("BAD_REQUEST", "ข้อมูลเช็กอินไม่ถูกต้อง"); }
  const code = typeof body.machineCode === "string" ? body.machineCode.toUpperCase().trim() : "";
  if (!ID_PATTERN.test(code)) return fail("INVALID_MACHINE", "รหัสตู้ไม่ถูกต้อง");
  const machine = await env.DB.prepare("SELECT * FROM machines WHERE machine_code = ? AND active = 1").bind(code).first();
  if (!machine) return fail("MACHINE_NOT_FOUND", "ไม่พบตู้ที่เปิดใช้งาน", 404);
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const recent = await env.DB.prepare("SELECT id, checked_in_at FROM checkins WHERE member_id = ? AND machine_code = ? AND checked_in_at >= ? ORDER BY checked_in_at DESC LIMIT 1")
    .bind(member.id, code, cutoff).first();
  if (recent) return json({ id: recent.id, at: recent.checked_in_at, deduplicated: true, confirmedPayment: false });
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO checkins (id, member_id, machine_code, checked_in_at) VALUES (?, ?, ?, ?)")
    .bind(id, member.id, code, now).run();
  return json({ id, at: now, deduplicated: false, confirmedPayment: false }, 201);
}
async function marketing(request, env) {
  const member = await sessionMember(request, env);
  if (!member) return fail("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ", 401);
  let body;
  try { body = await bodyJson(request); } catch { return fail("BAD_REQUEST", "ข้อมูลไม่ถูกต้อง"); }
  if (typeof body.optIn !== "boolean") return fail("BAD_REQUEST", "โปรดเลือกสถานะความยินยอม");
  const marketingValue = body.optIn ? 1 : 0;
  if (member.marketing_opt_in !== marketingValue) {
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE members SET marketing_opt_in = ?, marketing_changed_at = ?, updated_at = ? WHERE id = ?")
        .bind(marketingValue, now, now, member.id),
      env.DB.prepare("INSERT INTO marketing_consent_events (id, member_id, opted_in, source, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), member.id, marketingValue, "settings", now)
    ]);
  }
  return json({ marketingOptIn: Boolean(marketingValue) });
}
async function deleteMember(request, env) {
  const member = await sessionMember(request, env);
  if (!member) return fail("UNAUTHENTICATED", "กรุณาเข้าสู่ระบบ", 401);
  let body;
  try { body = await bodyJson(request); } catch { return fail("BAD_REQUEST", "ข้อมูลไม่ถูกต้อง"); }
  if (body.confirm !== "DELETE") return fail("CONFIRM_REQUIRED", "กรุณายืนยันการลบบัญชี", 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM marketing_consent_events WHERE member_id = ?").bind(member.id),
    env.DB.prepare("DELETE FROM checkins WHERE member_id = ?").bind(member.id),
    env.DB.prepare("DELETE FROM members WHERE id = ?").bind(member.id)
  ]);
  return json({ deleted: true }, 200, { "set-cookie": clearCookie() });
}
async function asset(request, env) {
  if (!env.ASSETS) return fail("ASSETS_MISSING", "เว็บยังไม่ได้ถูกอัปโหลด", 503);
  const url = new URL(request.url);
  // Do not server-redirect LIFF primary URL before liff.init() completes.
  const isMachines = url.pathname === "/admin/machines" || url.pathname === "/admin/machines/" || url.pathname === "/admin-machines.html";
  const isAdmin = url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/admin.html";
  if (isAdmin || isMachines || url.pathname === "/" || /^\/m\/BX[A-Z0-9-]{2,20}\/?$/.test(url.pathname)) {
    const index = new URL(isMachines ? "/admin-machines.html" : isAdmin ? "/admin.html" : "/index.html", url.origin);
    const response = await env.ASSETS.fetch(new Request(index, { method: "GET" }));
    return new Response(response.body, { status: response.status, headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'self'; script-src 'self' https://static.line-scdn.net; connect-src 'self' https://*.line.me https://*.line-scdn.net https://api.line.me; img-src 'self' data: https://*.line-scdn.net; style-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    }});
  }
  return env.ASSETS.fetch(request);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/")) {
        if (!env.DB && path !== "/api/config") return fail("DB_NOT_CONFIGURED", "ฐานข้อมูลยังไม่พร้อม", 503);
        // Admin data always passes both signed-session and admin_users checks.
        if (path.startsWith("/api/admin/")) {
          const signedInMember = await sessionMember(request, env);
          return handleAdminApi(request, env, signedInMember);
        }
        if (!["GET", "POST", "DELETE"].includes(request.method)) return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
        if (request.method !== "GET" && !correctOrigin(request)) return fail("ORIGIN_REJECTED", "Origin ไม่ถูกต้อง", 403);
        if (path === "/api/config" && request.method === "GET") return json({
          name: "DEAL! Boxing Club",
          liffId: env.LIFF_ID && env.LIFF_ID !== "REPLACE_WITH_LIFF_ID" ? env.LIFF_ID : null,
          ready: Boolean(env.LIFF_ID && env.LIFF_ID !== "REPLACE_WITH_LIFF_ID" && env.LINE_LOGIN_CHANNEL_ID && env.DB && env.SESSION_SECRET),
          paymentsIntegrated: false
        });
        if (path === "/api/machine" && request.method === "GET") {
          const code = (url.searchParams.get("code") || "").toUpperCase();
          if (!ID_PATTERN.test(code)) return fail("INVALID_MACHINE", "รหัสตู้ไม่ถูกต้อง");
          const machine = await env.DB.prepare("SELECT * FROM machines WHERE machine_code = ? AND active = 1").bind(code).first();
          return machine ? json({ machine: asMachine(machine) }) : fail("MACHINE_NOT_FOUND", "ไม่พบตู้ชกมวยนี้", 404);
        }
        if (path === "/api/auth/line" && request.method === "POST") return authLine(request, env);
        if (path === "/api/me" && request.method === "GET") return getMe(request, env);
        if (path === "/api/checkin" && request.method === "POST") return checkin(request, env);
        if (path === "/api/marketing" && request.method === "POST") return marketing(request, env);
        if (path === "/api/me" && request.method === "DELETE") return deleteMember(request, env);
        if (path === "/api/logout" && request.method === "POST") return json({ loggedOut: true }, 200, { "set-cookie": clearCookie() });
        return fail("NOT_FOUND", "API ไม่พบ", 404);
      }
      if (request.method !== "GET" && request.method !== "HEAD") return fail("METHOD_NOT_ALLOWED", "Method not allowed", 405);
      return asset(request, env);
    } catch (e) {
      console.error("Worker error", String(e?.message || e));
      return fail("SERVER_ERROR", "ระบบขัดข้อง กรุณาลองใหม่ภายหลัง", 500);
    }
  }
};
