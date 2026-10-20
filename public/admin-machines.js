/* DEAL! Boxing Machine Registry: secured by existing LINE member session + admin_users. */
const $ = id => document.getElementById(id);
const state = { machines:[], role:null, editingCode:null, busy:false, qrObjectUrl:null, qrUrl:null, qrCode:null };
const number = x => Number(x||0).toLocaleString('th-TH');

async function api(url, method='GET', body) {
  const response = await fetch(url, {method,credentials:'same-origin',
    headers:body ? {'content-type':'application/json'} : {},
    body:body ? JSON.stringify(body) : undefined});
  const data = await response.json().catch(()=>({}));
  if(!response.ok){const e = new Error(data.message || `HTTP ${response.status}`);e.status=response.status;throw e;}
  return data;
}
function showAccess(title,message,mode='retry') {
  $('access-screen').classList.remove('hidden');$('machine-app').classList.add('hidden');
  $('access-title').textContent=title;$('access-message').textContent=message;
  $('sign-in').classList.toggle('hidden',mode!=='login');$('retry').classList.toggle('hidden',mode!=='retry');
}
function toast(text){const el=$('toast');el.textContent=text;el.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add('hidden'),3800);}
function alertInline(text){const el=$('registry-alert');el.textContent=text;el.classList.remove('hidden');}
function clearInline(){$('registry-alert').classList.add('hidden');$('registry-alert').textContent='';}
function cell(row,value,className='') {const td=document.createElement('td');td.textContent=value ?? '—';if(className)td.className=className;row.appendChild(td);return td;}
function subText(td,content,className='registry-name'){const node=document.createElement('div');node.className=className;node.textContent=content;td.appendChild(node);}
function button(text,action,klass='',disabled=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.className=klass;b.disabled=disabled;b.addEventListener('click',action);return b;}
function isOwner(){return state.role==='owner';}
function render() {
  $('role-chip').textContent=(state.role||'').toUpperCase();
  $('metric-total').textContent=number(state.machines.length);
  $('metric-active').textContent=number(state.machines.filter(m=>m.active).length);
  $('metric-unlinked').textContent=number(state.machines.filter(m=>!m.locationCode).length);
  const filter=$('machine-search').value.trim().toLowerCase();
  const items=state.machines.filter(m=>[m.code,m.name,m.locationName,m.locationCode||''].some(s=>s.toLowerCase().includes(filter)));
  const tbody=$('machine-rows');tbody.replaceChildren();
  for(const m of items){
    const tr=document.createElement('tr');
    const id=cell(tr,m.code,'code');subText(id,m.name);
    const loc=cell(tr,m.locationName);subText(loc,m.locationCode||'ยังไม่เชื่อม Location Master',m.locationCode?'registry-name':'tag-unlinked');
    const st=cell(tr,'');const chip=document.createElement('span');chip.className=m.active?'status':'status off';chip.textContent=m.active?'เปิดใช้งาน':'ปิดใช้งาน';st.appendChild(chip);
    cell(tr,number(m.checkins),'number');
    const actions=cell(tr,'');actions.className='machine-actions';
    actions.appendChild(button('QR สมาชิก',()=>openQr(m),'primary-action',!m.membershipUrl||!m.active));
    if(isOwner()){
      actions.appendChild(button('แก้ไข',()=>editMachine(m)));
      actions.appendChild(button(m.active?'ปิดการเช็กอิน':'เปิดใช้งาน',()=>toggleMachine(m)));
    }
    tbody.appendChild(tr);
  }
  if(!items.length){const tr=document.createElement('tr');const td=cell(tr,'ไม่พบตู้ที่ตรงกับการค้นหา','table-empty');td.colSpan=5;tbody.appendChild(tr);}
  $('registry-count').textContent=`แสดง ${number(items.length)} จาก ${number(state.machines.length)} ตู้ · ข้อมูลเช็กอิน ไม่ใช่จำนวนเกม`;
  const form=$('machine-form');for(const control of Array.from(form.elements)){
    if(control instanceof HTMLInputElement && control.id!=='machine-code') control.disabled=!isOwner();
  }
  $('machine-code').disabled=!isOwner()||Boolean(state.editingCode);
  $('save-machine').disabled=!isOwner();
  $('save-machine').classList.toggle('hidden',!isOwner());
  $('read-only-note').classList.toggle('hidden',isOwner());
  $('cancel-edit').classList.toggle('hidden',!state.editingCode);
}
async function loadMachines(){
  const response=await api('/api/admin/machines');
  state.machines=response.items;state.role=response.role;
  clearInline();
  if(response.truncated)alertInline('รายการตู้เกิน 500 เครื่อง ระบบแสดงเพียง 500 รายการแรก โปรดให้ทีม System เพิ่มระบบแบ่งหน้า');
  render();
}
function resetEditor(){
  state.editingCode=null;
  $('machine-form').reset();
  $('machine-code').value='';
  $('machine-active').checked=true;
  $('form-title').textContent='เพิ่มตู้ชกมวย';
  $('save-machine').textContent='บันทึกข้อมูลตู้';
  render();
}
function editMachine(m){
  state.editingCode=m.code;
  $('machine-code').value=m.code;
  $('machine-name').value=m.name;
  $('location-code').value=m.locationCode||'';
  $('location-name').value=m.locationName;
  $('machine-active').checked=Boolean(m.active);
  $('form-title').textContent=`แก้ไข ${m.code}`;
  $('save-machine').textContent='บันทึกการแก้ไข';
  clearInline();render();
  $('editor-section').scrollIntoView({behavior:'smooth',block:'start'});
}
function machineFormData(){return {
  machineCode:$('machine-code').value.trim().toUpperCase(),
  machineName:$('machine-name').value.trim(),
  locationCode:$('location-code').value.trim().toUpperCase(),
  locationName:$('location-name').value.trim(),
  active:$('machine-active').checked
};}
async function saveMachine(e){
  e.preventDefault();if(state.busy || !isOwner())return;
  const data=machineFormData();if(!/^BX[A-Z0-9-]{2,20}$/.test(data.machineCode)){toast('รหัสตู้ต้องเริ่ม BX และตามด้วยตัวเลข/ตัวอักษร');return;}
  if(data.locationCode && !/^L\d{4,8}$/.test(data.locationCode)){toast('รหัสโลเคชั่นควรอยู่ในรูปแบบ L0001 และต้องตรงกับ Master จริง');return;}
  state.busy=true;$('save-machine').disabled=true;clearInline();
  try{
    if(state.editingCode)await api(`/api/admin/machines/${encodeURIComponent(state.editingCode)}`,'PATCH',data);
    else await api('/api/admin/machines','POST',data);
    toast(state.editingCode?'บันทึกข้อมูลตู้เรียบร้อย':'เพิ่มตู้เรียบร้อย');
    resetEditor();await loadMachines();
  }catch(err){alertInline(err.message||'บันทึกข้อมูลไม่สำเร็จ');}
  finally{state.busy=false;$('save-machine').disabled=false;}
}
async function toggleMachine(m){
  if(!isOwner())return;
  if(m.active && !confirm(`ปิดการเช็กอินของ ${m.code} ใช่หรือไม่? QR ที่ติดหน้าตู้จะเช็กอินไม่ได้จนกว่าจะเปิดใช้งานใหม่`))return;
  try{
    await api(`/api/admin/machines/${encodeURIComponent(m.code)}`,'PATCH',{
      machineName:m.name,locationCode:m.locationCode||'',locationName:m.locationName,active:!m.active
    });
    await loadMachines();toast(!m.active?'เปิดใช้งานตู้แล้ว':'ปิดการเช็กอินของตู้นี้แล้ว');
  }catch(err){alertInline(err.message||'ปรับสถานะไม่สำเร็จ');}
}
async function openQr(m){
  if(!m.active||!m.membershipUrl)return;
  try{
    const response=await fetch(`/api/admin/machines/${encodeURIComponent(m.code)}/qr.svg`,{credentials:'same-origin'});
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.message||`HTTP ${response.status}`);}
    if(state.qrObjectUrl)URL.revokeObjectURL(state.qrObjectUrl);
    state.qrObjectUrl=URL.createObjectURL(await response.blob());
    state.qrUrl=m.membershipUrl;state.qrCode=m.code;
    $('qr-image').src=state.qrObjectUrl;
    $('qr-image').alt=`QR สมัครสมาชิกประจำ ${m.code}`;
    $('qr-machine-code').textContent=m.code;
    $('qr-location').textContent=m.locationName+(m.locationCode?` · ${m.locationCode}`:' · ยังไม่ได้ผูก Master');
    $('qr-link').textContent=state.qrUrl;
    $('qr-dialog').showModal();
  }catch(err){alertInline(err.message||'สร้าง QR ไม่สำเร็จ');}
}
function closeQr(){ $('qr-dialog').close();if(state.qrObjectUrl)URL.revokeObjectURL(state.qrObjectUrl);state.qrObjectUrl=null; }
async function copyQr(){if(!state.qrUrl)return;try{await navigator.clipboard.writeText(state.qrUrl);toast('คัดลอก LIFF URL แล้ว');}catch{window.prompt('คัดลอกลิงก์สมาชิก',state.qrUrl);}}
function downloadQr(){if(!state.qrObjectUrl||!state.qrCode)return;const a=document.createElement('a');a.href=state.qrObjectUrl;a.download=`DEAL-Boxing-${state.qrCode}-Membership-QR.svg`;document.body.appendChild(a);a.click();a.remove();}
async function init(){
  try{
    const config=await api('/api/config');
    if(!config.ready||!config.liffId)throw new Error('ยังไม่ตั้งค่า LINE LIFF หรือ SESSION_SECRET');
    if(!window.liff)throw new Error('โหลด LINE SDK ไม่สำเร็จ');
    await window.liff.init({liffId:config.liffId});
    if(!window.liff.isLoggedIn()){showAccess('เข้าสู่ระบบด้วย LINE','ใช้บัญชี LINE ที่ได้รับสิทธิ์ Admin เท่านั้น','login');return;}
    const idToken=window.liff.getIDToken();
    if(!idToken)throw new Error('ไม่พบ LINE ID Token โปรดตรวจ scope openid');
    const auth=await api('/api/auth/line','POST',{idToken});
    if(auth.registrationRequired){showAccess('ยังไม่ได้สมัครสมาชิก','โปรดสมัครสมาชิกผ่าน LINE ก่อนขอสิทธิ์ Admin','none');return;}
    await loadMachines();
    $('access-screen').classList.add('hidden');$('machine-app').classList.remove('hidden');
  }catch(err){
    if(err.status===403)showAccess('ไม่มีสิทธิ์ Admin','บัญชี LINE นี้ไม่ได้รับสิทธิ์ Admin จากผู้ดูแลระบบ','none');
    else if(err.status===401)showAccess('กรุณาล็อกอินอีกครั้ง','Session หมดอายุหรือ LINE ต้องยืนยันตัวตนใหม่','login');
    else showAccess('ระบบมีข้อผิดพลาด',err.message||'โหลดข้อมูลไม่สำเร็จ','retry');
  }
}
$('sign-in').addEventListener('click',()=>{if(window.liff&&!window.liff.isLoggedIn())window.liff.login({redirectUri:location.href});else init();});
$('retry').addEventListener('click',()=>location.reload());
$('refresh-machines').addEventListener('click',()=>loadMachines().then(()=>toast('อัปเดตทะเบียนตู้แล้ว')).catch(e=>alertInline(e.message)));
$('machine-form').addEventListener('submit',saveMachine);
$('cancel-edit').addEventListener('click',resetEditor);
$('machine-search').addEventListener('input',render);
$('close-qr').addEventListener('click',closeQr);
$('copy-qr-url').addEventListener('click',copyQr);
$('download-qr').addEventListener('click',downloadQr);
$('print-qr').addEventListener('click',()=>{if(state.qrObjectUrl)window.print();});
$('qr-dialog').addEventListener('click',e=>{if(e.target===$('qr-dialog'))closeQr();});
$('qr-dialog').addEventListener('cancel',()=>{if(state.qrObjectUrl)URL.revokeObjectURL(state.qrObjectUrl);state.qrObjectUrl=null;});
init();
