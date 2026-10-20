/* DEAL! Boxing Club: LIFF client. No payments, no machine-activation access. */
const $ = (id) => document.getElementById(id);
const screens = ["loading-screen", "welcome-screen", "register-screen", "home-screen", "error-screen"];
const state = { liffId: null, idToken: null, member: null, currentMachine: null, machineCode: null, ready: false, lineName: "สมาชิกใหม่" };
let toastTimeout;
function show(screen) { for (const id of screens) $(id).classList.toggle("is-visible", id === screen); window.scrollTo({top: 0, behavior: "instant"}); }
function toast(message) { const el = $("toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 3500); }
function err(message) { $("error-message").textContent = message; show("error-screen"); }
async function api(path, method = "GET", body = undefined) {
  const res = await fetch(path, { method, credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || "เชื่อมต่อระบบไม่ได้"); e.code = data.error; throw e; }
  return data;
}
function getCodeAfterLiffInit() {
  // LINE initially encodes extra path in liff.state. Never read path or rewrite URL before liff.init().
  const match = location.pathname.match(/^\/m\/(BX[A-Z0-9-]{2,20})\/?$/i);
  return match ? match[1].toUpperCase() : null;
}
async function loadMachine() {
  state.machineCode = getCodeAfterLiffInit();
  if (!state.machineCode) { $("no-machine-panel").classList.remove("is-hidden"); return; }
  try {
    const { machine } = await api(`/api/machine?code=${encodeURIComponent(state.machineCode)}`);
    state.currentMachine = machine;
    $("machine-name").textContent = machine.name;
    $("machine-location").textContent = `${machine.locationName} · ${machine.locationCode || "—"}`;
    $("machine-tag").textContent = machine.code;
    $("machine-welcome-text").textContent = `${machine.name} · ${machine.locationName}`;
    $("machine-chip-welcome").classList.remove("is-hidden");
    $("machine-panel").classList.remove("is-hidden");
  } catch (e) {
    $("no-machine-panel").classList.remove("is-hidden");
    $("no-machine-panel").querySelector("h2").textContent = "ไม่พบตู้ที่เปิดใช้งาน";
    $("no-machine-panel").querySelector("p.location-description").textContent = `รหัส ${state.machineCode} ยังไม่ได้ลงทะเบียนกับ DEAL! Boxing Club`;
  }
}
function displayName(value) { return (value || "สมาชิก DEAL! Boxing").slice(0, 100); }
async function auth(accepted = false, marketing = false) {
  return api("/api/auth/line", "POST", { idToken: state.idToken, privacyAccepted: accepted, marketingOptIn: marketing });
}
async function presentHome() {
  const response = await api("/api/me");
  state.member = response.member;
  $("member-name").textContent = displayName(response.member.displayName);
  $("member-code").textContent = response.member.code;
  $("member-since").textContent = `JOINED ${new Date(response.member.joinedAt).toLocaleDateString("en-GB", { month: "short", year: "numeric" }).toUpperCase()}`;
  $("visit-count").textContent = String(response.totalCheckins);
  $("marketing-toggle").checked = response.member.marketingOptIn;
  const container = $("activity-list");
  container.replaceChildren();
  if (!response.checkins.length) {
    const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = "ยังไม่มีประวัติเช็กอิน"; container.appendChild(empty);
  } else {
    for (const entry of response.checkins) {
      const row = document.createElement("div"); row.className = "history-row";
      const left = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = `${entry.machineCode} · ${entry.locationName}`;
      const time = document.createElement("p"); time.textContent = new Date(entry.at).toLocaleString("th-TH", { timeZone:"Asia/Bangkok", day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
      left.append(title,time);
      const stamp = document.createElement("span"); stamp.className = "checkin-stamp"; stamp.textContent = "เช็กอิน";
      row.append(left,stamp); container.appendChild(row);
    }
  }
  show("home-screen");
}
async function init() {
  show("loading-screen");
  try {
    const config = await api("/api/config");
    if (!config.liffId || !config.ready) {
      $("line-login-button").disabled = true;
      $("setup-warning").textContent = "เว็บไซต์ตัวอย่างพร้อมแล้ว แต่ยังต้องตั้งค่า LIFF ID, ฐานข้อมูล D1 และ SESSION_SECRET ก่อนเปิดลงทะเบียนจริง";
      $("setup-warning").classList.remove("is-hidden");
      show("welcome-screen");
      return;
    }
    if (!window.liff) { err("โหลด LINE SDK ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่"); return; }
    state.liffId = config.liffId;
    await window.liff.init({ liffId: state.liffId });
    // IMPORTANT: read machine path only AFTER liff.init() resolves.
    await loadMachine();
    if (!window.liff.isLoggedIn()) { show("welcome-screen"); return; }
    state.idToken = window.liff.getIDToken();
    state.lineName = displayName(window.liff.getDecodedIDToken()?.name);
    if (!state.idToken) { err("ยังไม่ได้รับสิทธิ OpenID กรุณาตรวจว่า LIFF เปิด scope openid"); return; }
    const result = await auth();
    if (result.registrationRequired) {
      $("register-name").textContent = state.lineName;
      show("register-screen");
    } else {
      await presentHome();
    }
  } catch (e) { console.error("Initialization failed", e?.code || e?.message); err(e?.message || "เริ่มระบบสมาชิกไม่สำเร็จ"); }
}
$("line-login-button").addEventListener("click", () => {
  if (!state.liffId || !window.liff) return;
  if (!window.liff.isLoggedIn()) window.liff.login({ redirectUri: location.href });
  else init();
});
$("privacy-checkbox").addEventListener("change", () => { $("register-button").disabled = !$("privacy-checkbox").checked; });
$("register-button").addEventListener("click", async () => {
  if (!$("privacy-checkbox").checked) return;
  const button = $("register-button"); button.disabled = true; button.textContent = "กำลังสร้างบัญชี...";
  try {
    const response = await auth(true, $("marketing-checkbox").checked);
    if (response.registrationRequired) throw new Error("สร้างสมาชิกไม่สำเร็จ");
    await presentHome(); toast("ยินดีต้อนรับสู่ DEAL! Boxing Club");
  } catch (e) { toast(e.message); }
  finally { button.disabled = false; button.replaceChildren(document.createTextNode("สร้างบัญชีสมาชิก →")); }
});
$("checkin-button").addEventListener("click", async () => {
  if (!state.currentMachine) return;
  const button = $("checkin-button"); button.disabled = true;
  try {
    const data = await api("/api/checkin", "POST", { machineCode: state.currentMachine.code });
    toast(data.deduplicated ? "เช็กอินตู้เครื่องนี้ไปแล้วในช่วง 10 นาทีที่ผ่านมา" : "บันทึกการเช็กอินสำเร็จ (ไม่ใช่การยืนยันการชำระเงิน)");
    await presentHome();
  } catch (e) { toast(e.message); }
  finally { button.disabled = false; }
});
$("marketing-toggle").addEventListener("change", async (ev) => {
  const toggle = ev.currentTarget;
  const newValue = toggle.checked; toggle.disabled = true;
  try { await api("/api/marketing", "POST", { optIn: newValue }); toast(newValue ? "เปิดรับข่าวสารแล้ว" : "ปิดรับข่าวสารแล้ว"); }
  catch (e) { toggle.checked = !newValue; toast(e.message); }
  finally { toggle.disabled = false; }
});
$("logout-button").addEventListener("click", async () => {
  try { await api("/api/logout", "POST", {}); if (window.liff?.isLoggedIn()) window.liff.logout(); }
  catch (e) { toast(e.message); return; }
  location.assign("/");
});
$("delete-button").addEventListener("click", async () => {
  if (!confirm("ลบบัญชีสมาชิกและประวัติการเช็กอินทั้งหมดอย่างถาวร?")) return;
  if (!confirm("ยืนยันอีกครั้ง: การลบข้อมูลนี้ไม่สามารถย้อนกลับได้")) return;
  try { await api("/api/me", "DELETE", { confirm: "DELETE" }); if (window.liff?.isLoggedIn()) window.liff.logout(); location.assign("/"); }
  catch (e) { toast(e.message); }
});
$("retry-button").addEventListener("click", () => location.reload());
init();
