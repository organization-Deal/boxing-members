/* DEAL! Boxing Club Admin — every data request is restricted server-side. */
const $ = id => document.getElementById(id);
const state = { days:30, offset:0, q:'', searchTimer:null, loading:false };
const number = value => Number(value || 0).toLocaleString('th-TH');
const shortDate = input => input ? new Date(input).toLocaleDateString('th-TH', {timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric'}) : '—';
const fullDate = input => input ? new Date(input).toLocaleString('th-TH', {timeZone:'Asia/Bangkok',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

async function api(url, method = 'GET', body = null) {
  const response = await fetch(url, {method, credentials:'same-origin',
    headers:body ? {'content-type':'application/json'} : {},
    body:body ? JSON.stringify(body) : undefined});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.message || `HTTP ${response.status}`);error.status=response.status;throw error; }
  return data;
}
function access(message, title='กำลังตรวจสอบสิทธิ์', mode='retry') {
  $('access-screen').classList.remove('hidden'); $('admin-app').classList.add('hidden');
  $('access-title').textContent = title; $('access-message').textContent = message;
  $('sign-in').classList.toggle('hidden',mode!=='login');
  $('retry').classList.toggle('hidden',mode!=='retry');
}
function addCell(row, value, className='') {
  const cell = document.createElement('td'); cell.textContent = value ?? '—';
  if (className) cell.className = className;
  row.appendChild(cell); return cell;
}
function emptyTable(tbody, text, columns) {
  const tr=document.createElement('tr');const td=addCell(tr,text,'table-empty');td.colSpan=columns;tbody.replaceChildren(tr);
}
function changeText(key, value) { $(key).textContent=value; }
function renderChart(series) {
  const svg=$('activity-chart');svg.replaceChildren();
  const w=740,h=190,l=4,r=5,t=12,b=16;
  const vals=series.map(d=>Number(d.checkins||0));
  const max=Math.max(1,...vals);
  const x=i=>l+(w-l-r)*i/Math.max(1,vals.length-1);
  const y=v=>t+(h-t-b)*(1-v/max);
  const ns='http://www.w3.org/2000/svg';
  function line(kind,attrs){const el=document.createElementNS(ns,kind);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,String(v)));svg.appendChild(el);return el;}
  for(let i=0;i<4;i++){
    const cy=t+(h-t-b)*i/3;
    line('line',{x1:l,y1:cy,x2:w-r,y2:cy,stroke:'#e8eae6','stroke-width':1});
  }
  if(!vals.length)return;
  const coords=vals.map((v,i)=>`${x(i)},${y(v)}`);
  line('polygon',{points:`${l},${h-b} ${coords.join(' ')} ${w-r},${h-b}`,fill:'#eaf0e9'});
  line('polyline',{points:coords.join(' '),fill:'none',stroke:'#333e35','stroke-width':3,'stroke-linejoin':'round','stroke-linecap':'round'});
  if(vals.length===1)line('circle',{cx:x(0),cy:y(vals[0]),r:4,fill:'#333e35'});
  changeText('date-first',shortDate(`${series[0].day}T12:00:00Z`));
  changeText('date-last',shortDate(`${series[series.length-1].day}T12:00:00Z`));
}
function renderSummary(data) {
  const t=data.totals;
  changeText('metric-members',number(t.members));
  changeText('metric-new',number(t.newMembers));
  changeText('metric-checkins',number(t.checkins));
  changeText('metric-repeat',number(t.repeatMembers));
  changeText('metric-unique',number(t.uniqueMembers));
  changeText('metric-machines',number(t.activeMachines));
  const ratio=t.members ? Math.round(100*t.marketingOptIn/t.members):0;
  changeText('consent-rate',`${ratio}%`);changeText('consent-count',`${number(t.marketingOptIn)} จาก ${number(t.members)} สมาชิก`);
  $('consent-bar').style.width=`${ratio}%`;
  changeText('chart-summary',`${number(t.checkins)} เช็กอิน`);
  renderChart(data.daily);
  changeText('machine-count',`${number(data.machines.length)} ตู้`);
  const body=$('machine-rows');body.replaceChildren();
  for(const m of data.machines){
    const tr=document.createElement('tr');
    addCell(tr,m.code,'code');
    const loc=addCell(tr,m.locationName);if(m.locationCode){const sub=document.createElement('div');sub.className='muted';sub.textContent=m.locationCode;loc.appendChild(sub)}
    const statusCell=addCell(tr,'');const status=document.createElement('span');status.className=m.active?'status':'status off';status.textContent=m.active?'เปิดใช้งาน':'ปิดใช้งาน';statusCell.appendChild(status);
    addCell(tr,number(m.uniqueMembers),'number');addCell(tr,number(m.checkins),'number');body.appendChild(tr);
  }
  if(!data.machines.length)emptyTable(body,'ยังไม่มีข้อมูลตู้',5);
  changeText('updated-at',`อัปเดต ${fullDate(data.updatedAt)} · ข้อมูลเช็กอินเท่านั้น`);
}
function renderMembers(data) {
  const body=$('member-rows');body.replaceChildren();
  for(const m of data.items){
    const tr=document.createElement('tr');addCell(tr,m.memberCode,'code');addCell(tr,m.displayName);
    addCell(tr,shortDate(m.joinedAt));
    const consentCell=addCell(tr,'');const consent=document.createElement('span');consent.className=m.marketingOptIn?'status consent':'muted';consent.textContent=m.marketingOptIn?'ยินยอม':'ไม่ยินยอม';consentCell.appendChild(consent);
    addCell(tr,number(m.checkins),'number');body.appendChild(tr);
  }
  if(!data.items.length)emptyTable(body,'ไม่พบสมาชิกตามที่ค้นหา',5);
  const first=data.total ? data.offset+1 : 0;
  const last=Math.min(data.total,data.offset+data.items.length);
  changeText('page-info',`${number(first)}–${number(last)} จาก ${number(data.total)} คน`);
  $('prev-page').disabled=data.offset===0;
  $('next-page').disabled=data.offset+data.limit>=data.total;
}
function renderRecent(data){
  const body=$('recent-rows');body.replaceChildren();
  for(const event of data.items){
    const tr=document.createElement('tr');addCell(tr,fullDate(event.checkedInAt));
    const member=addCell(tr,event.displayName);const code=document.createElement('div');code.textContent=event.memberCode;code.className='muted';member.appendChild(code);
    addCell(tr,event.machineCode,'code');addCell(tr,event.locationName);body.appendChild(tr);
  }
  if(!data.items.length)emptyTable(body,'ยังไม่มีรายการเช็กอินในช่วงที่เลือก',4);
}
async function loadMembers(){
  const data=await api(`/api/admin/members?q=${encodeURIComponent(state.q)}&offset=${state.offset}`);renderMembers(data);
}
async function loadDashboard(){
  if(state.loading)return;state.loading=true;$('refresh').disabled=true;
  try{
    const [summary, recent, members]=await Promise.all([
      api(`/api/admin/summary?days=${state.days}`),
      api(`/api/admin/recent?days=${state.days}`),
      api(`/api/admin/members?q=${encodeURIComponent(state.q)}&offset=${state.offset}`)
    ]);
    renderSummary(summary);renderRecent(recent);renderMembers(members);
    $('access-screen').classList.add('hidden');$('admin-app').classList.remove('hidden');
  } catch (e){
    if(e.status===403)access('บัญชี LINE นี้ไม่มีสิทธิ์ Admin โปรดให้ผู้ดูแลเพิ่มสิทธิ์ในฐานข้อมูล','ไม่มีสิทธิ์เข้าถึง','none');
    else if(e.status===401)access('เซสชันหมดอายุ กรุณาล็อกอินผ่าน LINE อีกครั้ง','เข้าสู่ระบบอีกครั้ง','login');
    else access(e.message||'โหลดข้อมูลไม่สำเร็จ','ระบบมีข้อผิดพลาด','retry');
  } finally{state.loading=false;$('refresh').disabled=false}
}
async function init(){
  access('กำลังตรวจสอบ LINE และสิทธิ์ Admin','กำลังตรวจสอบสิทธิ์','none');
  try{
    const config=await api('/api/config');
    if(!config.liffId || !config.ready)throw new Error('ยังไม่ตั้งค่า LIFF หรือ SESSION_SECRET');
    if(!window.liff)throw new Error('ไม่สามารถโหลด LINE SDK ได้');
    await window.liff.init({liffId:config.liffId});
    if(!window.liff.isLoggedIn()) {access('เข้าสู่ระบบด้วย LINE ที่ได้รับสิทธิ์ Admin','ลงชื่อเข้าใช้งาน','login');return;}
    const idToken=window.liff.getIDToken();
    if(!idToken)throw new Error('ไม่พบ LINE ID Token: โปรดตรวจ scope openid');
    const auth=await api('/api/auth/line','POST',{idToken});
    if(auth.registrationRequired){access('ต้องสมัครสมาชิกผ่านหน้าปกติก่อนจึงจะขอสิทธิ์ Admin ได้','ยังไม่ได้สมัครสมาชิก','none');return;}
    await loadDashboard();
  }catch(e){access(e.message||'เชื่อมต่อไม่ได้','ไม่สามารถเริ่มระบบได้','retry')}
}
$('sign-in').addEventListener('click',()=>{if(window.liff&&!window.liff.isLoggedIn())window.liff.login({redirectUri:location.href});else init()});
$('retry').addEventListener('click',()=>location.reload());
$('days').addEventListener('change',event=>{state.days=Number(event.target.value);loadDashboard()});
$('refresh').addEventListener('click',loadDashboard);
$('member-search').addEventListener('input',event=>{
  clearTimeout(state.searchTimer);state.q=event.target.value;state.offset=0;
  state.searchTimer=setTimeout(()=>loadMembers().catch(e=>access(e.message,'เกิดข้อผิดพลาด','retry')),250);
});
$('prev-page').addEventListener('click',()=>{state.offset=Math.max(0,state.offset-20);loadMembers().catch(e=>access(e.message,'เกิดข้อผิดพลาด','retry'))});
$('next-page').addEventListener('click',()=>{state.offset+=20;loadMembers().catch(e=>access(e.message,'เกิดข้อผิดพลาด','retry'))});
init();
