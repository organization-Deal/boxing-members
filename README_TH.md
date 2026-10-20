# DEAL! Boxing Club — Membership MVP v0.1

เว็บสมาชิก LINE สำหรับผู้ใช้ตู้ชกมวยของ DEAL! โดย **ไม่แตะ QR BOX, AKI, T-DEV, ระบบชำระเงิน หรือการเปิดเกม**

สถานะโครงการ: **โค้ด MVP พร้อมนำไปติดตั้งและทดสอบ** แต่ **ยังไม่ได้ Deploy, เชื่อม LIFF ID, ตั้งค่า D1 หรือรับสมัครสมาชิกจริง**

## ฟีเจอร์ที่โค้ดนี้ทำได้

- LINE Login และ LIFF (Channel ที่สร้างแล้ว: LINE Login ID `2012120948`)
- สมัครสมาชิกด้วย LINE User ID โดยผู้ใช้ยอมรับนโยบายความเป็นส่วนตัวก่อนสร้างบัญชี
- ไม่บังคับเบอร์โทรและอีเมล และไม่บังคับยินยอมรับการตลาด
- ลงทะเบียนเพียงครั้งเดียว สมาชิกซ้ำถูกเชื่อมกับบัญชีเดิม
- QR หน้าเครื่อง: `/m/BX001`, `/m/BX002` ฯลฯ เพื่อระบุเครื่องและโลเคชั่น
- เช็กอินรายเครื่อง (ระบบจำกัดเช็กอินซ้ำภายใน 10 นาที)
- ดูประวัติเช็กอินและจำนวนเช็กอินของตนเอง
- เปิด/ปิดความยินยอมการตลาด และลบบัญชีสมาชิกได้
- ตรวจ LINE ID Token ผ่าน LINE Server ก่อนยืนยันตัวตน
- Session Cookie แบบ HttpOnly / Secure / SameSite=Lax ที่ลงลายเซ็นด้วย HMAC
- โค้ดทดสอบอัตโนมัติด้วย Node.js

**หมายเหตุ:** การเช็กอินเป็นเพียงกิจกรรมบนเว็บไซต์ ไม่ใช่หลักฐานว่าลูกค้าสแกนจ่ายหรือได้ชกแล้ว ต่อให้สแกน QR ที่โลเคชั่นก็ยังไม่ยืนยันการอยู่หน้าตู้จริง

## ระบบประกอบด้วย

```
QR สมาชิกหน้าเครื่อง → LINE LIFF → Cloudflare Worker → Cloudflare D1
                                              ↳ Members
                                              ↳ Machines (อ้างรหัสโลเคชั่น Lark Master)
                                              ↳ Check-ins
                                              ↳ Marketing consent

QR BOX → AKI / T-DEV → เงินเข้า → ตู้เปิดเกม  (ไม่เปลี่ยนแปลง)
```

### สิ่งที่ต้องมี

- Account Cloudflare ที่ใช้ deploy Workers และ D1 ได้
- Account LINE Developers: Provider `Boxing DEAL!` พร้อม LINE Login channel และ LINE OA ที่เชื่อมแล้ว
- คอมพิวเตอร์ที่มี Node.js v20+ และ npm
- แอป LINE บนมือถือเพื่อทดสอบการสมัครจริง

## ขั้นตอนติดตั้งบน Cloudflare

เปิด Terminal ที่โฟลเดอร์นี้

### 1. ติดตั้งแพ็กเกจ และเข้าสู่ Cloudflare

```bash
npm install
npx wrangler login
```

### 2. สร้างฐานข้อมูลแยกจาก Dividend Engine / D1 เดิม

```bash
npx wrangler d1 create boxing-members
```

คำสั่งจะแสดง `database_id` ของฐานข้อมูลที่เพิ่งสร้าง **คัดลอก UUID นั้น** ไปแทน `REPLACE_WITH_YOUR_D1_DATABASE_ID` ใน `wrangler.jsonc`

**สำคัญ:** อย่าเอา D1 ของเว็บไซต์ปันผลเดิมมาใส่ในระบบนี้

### 3. สร้างตารางสมาชิกและเครื่องทดสอบ

```bash
npm run db:migrate:remote
```

คำสั่งนี้จะสร้าง 4 ตาราง (`members`, `machines`, `checkins`, `marketing_consent_events`) และตู้ทดสอบ `BX001` (ต้องแก้ข้อมูลโลเคชั่นจริงก่อนเปิดรับลูกค้า)

### 4. สร้าง SESSION_SECRET

บน Mac ใช้คำสั่งนี้เพื่อสร้างรหัสลับแบบสุ่ม:

```bash
openssl rand -hex 32
```

จากนั้นสั่ง:

```bash
npx wrangler secret put SESSION_SECRET
```

วางค่าที่สุ่มได้ใน Terminal เมื่อ Wrangler ขอรหัส **ห้ามส่ง SESSION_SECRET, Access Token หรือ Channel Secret ลงแชต / GitHub** และอย่าเขียนมันลง `wrangler.jsonc`

### 5. Deploy เว็บรอบแรก เพื่อให้ได้ HTTPS URL

```bash
npm run deploy
```

Wrangler จะให้ URL เช่น `https://deal-boxing-membership.<YOUR_ACCOUNT>.workers.dev/` (ใช้ URL ที่ได้จริงเท่านั้น)

เปิด URL นี้แล้วควรเห็นหน้าแรกของเว็บ พร้อมคำเตือนว่ายังไม่ได้เชื่อม LIFF ID — เป็นพฤติกรรมที่ตั้งใจไว้

### 6. สร้าง LIFF ใน LINE Developers

เข้า LINE Developers → Provider `Boxing DEAL!` → Channel `DEAL! Boxing Club` **(ประเภท LINE Login)** → แท็บ **LIFF** → Add

| ช่อง | ค่า |
|---|---|
| LIFF app name | DEAL! Boxing Club |
| Size | Full |
| Endpoint URL | URL HTTPS ของ Worker ที่เพิ่ง Deploy **ลงท้าย `/`** |
| Scopes | `openid`, `profile` |
| Bot link feature | เลือกวิธีชวนเพิ่ม LINE OA ตามต้องการ |

สร้างสำเร็จจะได้ **LIFF ID** ที่มีลักษณะ `1234567890-abcdef` (ตัวอย่างเท่านั้น)

LINE เอกสารอ้างอิง: https://developers.line.biz/en/docs/liff/registering-liff-apps/

### 7. เอา LIFF ID มาใส่เว็บและ Deploy อีกครั้ง

แก้ `wrangler.jsonc`:

```json
"LIFF_ID": "<LIFF_ID_ที่ได้รับจริง>"
```

แล้วรัน:

```bash
npm run deploy
```

### 8. ปรับข้อมูลตู้และทดลอง QR จริง

ตัวอย่างแก้ `BX001` (แทนค่าจาก Master จริงเท่านั้น):

```bash
npx wrangler d1 execute boxing-members --remote --command "UPDATE machines SET location_code='Lxxxx', location_name='ชื่อโลเคชั่นจริง', machine_name='ตู้ชกมวย BX001' WHERE machine_code='BX001';"
```

เพิ่มตู้ที่สอง:

```bash
npx wrangler d1 execute boxing-members --remote --command "INSERT INTO machines (machine_code, location_code, location_name, machine_name) VALUES ('BX002', 'Lxxxx', 'ชื่อโลเคชั่นจริง', 'ตู้ชกมวย BX002');"
```

หลังจากมี LIFF ID จริงแล้ว ให้สร้าง QR โดยใช้ URL ในรูปแบบ:

```
https://liff.line.me/<LIFF_ID_จริง>/m/BX001
https://liff.line.me/<LIFF_ID_จริง>/m/BX002
```

ลูกค้าสแกน → LINE Login → สมัครสมาชิกครั้งแรก → เช็กอิน → จากนั้น **ไปกด QR BOX บนตู้และจ่ายเงินตามปกติ**

> หมายเหตุจาก LINE: ต้องอ่าน path และ query parameter หลัง `liff.init()` เสร็จ เพราะ LIFF จะใช้ `liff.state` ใน redirect รอบแรก; โค้ดนี้ทำตามหลักดังกล่าวแล้ว

## เช็กลิสต์ก่อนเปิดจริง

- [ ] Deploy Cloudflare Workers สำเร็จ
- [ ] D1 schema ผ่าน และ `SESSION_SECRET` ตั้งค่าแล้ว
- [ ] LIFF ID จริงถูกใส่ใน `wrangler.jsonc`
- [ ] ทดลอง LINE Login สร้างบัญชีครั้งแรกและล็อกอินซ้ำผ่านมือถือได้
- [ ] ข้อมูลรหัสตู้กับ Location Master ตรงกัน
- [ ] ทดลองเช็กอินและประวัติทั้ง 1 เครื่องและหลายเครื่อง
- [ ] แก้ไข `/public/privacy.html` ให้เป็นนโยบายความเป็นส่วนตัวฉบับจริงที่ฝ่ายกฎหมายอนุมัติ พร้อมข้อมูลผู้ควบคุม/ช่องทางติดต่อ/ระยะเวลาเก็บข้อมูล (ไฟล์ปัจจุบันเป็นร่าง)
- [ ] วางมาตรการจำกัดความถี่ API และติดตามความผิดปกติก่อนใช้งานวงกว้าง
- [ ] ทดสอบว่า QR BOX เดิมยังรับเงินและเปิดเกมได้ปกติ หากเว็บสมาชิกใช้งานไม่ได้
- [ ] เปิดใช้งานในกลุ่มทดสอบก่อน แล้วจึงเปลี่ยนสถานะ Channel เป็น Published เมื่อพร้อมและทำตามข้อกำหนดของ LINE

## ทดสอบโค้ด

```bash
npm test
```

## สิ่งที่ยังไม่มีใน MVP นี้

- ไม่มีการรับเงินผ่าน LINE / PromptPay / Payment API
- ไม่มีระบบเปิดเกมผ่านเว็บสมาชิก
- ไม่มีการยืนยันการชำระเงินหรือพิสูจน์ว่าใครเล่นจริง
- ไม่มีระบบสะสมแต้มตามจำนวนเกม
- ไม่มีระบบ Automation ส่งข้อความ LINE / Broadcast
- ไม่มี Admin Dashboard และการ Sync Lark Master อัตโนมัติ (มีแค่รหัสอ้างอิงโลเคชั่น)

## โครงไฟล์

```
public/index.html           เว็บสมาชิก
public/style.css            สไตล์ UI
public/app.js               LINE LIFF Frontend
public/privacy.html         **ร่าง** Privacy Policy ต้องแก้ก่อนเปิดจริง
src/worker.js               API สำหรับสมาชิก/เช็กอิน/ยินยอม/ลบ
migrations/0001_initial.sql สร้างฐานข้อมูล
migrations/0002_demo_machine.sql ตู้ทดสอบ BX001
wrangler.jsonc              Cloudflare Worker / D1 config
package.json                npm scripts
/tests                      ทดสอบ API
```

### เอกสารอ้างอิงทางการ

- https://developers.line.biz/en/docs/liff/registering-liff-apps/
- https://developers.line.biz/en/docs/liff/using-user-profile/
- https://developers.line.biz/en/docs/liff/opening-liff-app/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/wrangler/commands/d1/
