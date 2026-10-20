# DEAL! Boxing — Admin Dashboard v0.2 (แยกจากระบบรับเงิน)

อัปเดตนี้เพิ่ม Dashboard **ในระบบสมาชิกเดิม** ไม่สร้างสมาชิกใหม่ ไม่เปลี่ยน QR BOX, AKI/T-DEV, Cloudflare D1 เดิม หรือ LINE LIFF ID ที่ตั้งไว้แล้ว

## สิ่งที่เพิ่ม

- เว็บผู้ดูแล `/admin` (หน้าจอใหญ่ / มือถือ)
- สรุปสมาชิกทั้งหมด, สมาชิกใหม่, เช็กอิน, สมาชิกที่เช็กอินอย่างน้อย 2 ครั้งในช่วงเวลา
- กราฟเช็กอิน 7 / 30 / 90 วัน, แยกเครื่อง, รายชื่อสมาชิกพร้อมค้นหาและแบ่งหน้า, เช็กอินล่าสุด
- ดูจำนวนสมาชิกที่เลือกยินยอมการตลาด (ไม่เปิดดู LINE User ID)
- ทุก API แอดมินบังคับ signed LINE session + รายชื่อผู้ดูแล `admin_users` ฝั่ง D1
- ไม่มี API สำหรับเปลี่ยนข้อมูลสมาชิกและไม่มีการส่งข้อความออกจาก Dashboard รุ่นนี้

**ข้อความที่ต้องใช้กับข้อมูล:** “เช็กอิน” = สแกน/กดเช็กอินในระบบสมาชิก ไม่ใช่การยืนยันการจ่ายเงินจริงหรือการเล่นเกม

## 1. เอาโค้ดไปอัปเดต GitHub Repository เดิม

GitHub repo: `https://github.com/organization-Deal/boxing-members`

ZIP ชุดนี้เป็นไฟล์ **อัปเดตเฉพาะส่วนที่เพิ่ม/แก้** ไม่มี `wrangler.jsonc` เพื่อไม่ไปลบ LIFF ID กับ D1 ID ที่ตั้งค่าเสร็จแล้ว

### ใช้ Git บน Mac (ทางเลือกที่แน่นอน)

1. แตกไฟล์ `DEAL-Boxing-Admin-Update.zip` ไว้ใน Downloads
2. เปิด Terminal แล้วรัน (ใช้โฟลเดอร์ ZIP ที่แตกออกจริง):

```bash
cd ~/Downloads
git clone https://github.com/organization-Deal/boxing-members.git
cp -R DEAL-Boxing-Admin-Update/src/ boxing-members/src/
cp -R DEAL-Boxing-Admin-Update/public/ boxing-members/public/
cp -R DEAL-Boxing-Admin-Update/migrations/ boxing-members/migrations/
cp -R DEAL-Boxing-Admin-Update/tests/ boxing-members/tests/
cp DEAL-Boxing-Admin-Update/ADMIN_SETUP_TH.md boxing-members/ADMIN_SETUP_TH.md
cd boxing-members
npm install
npm test
git add src/worker.js src/admin-api.js public/admin.html public/admin.js public/admin.css migrations/0003_admin_dashboard.sql tests/worker.test.js ADMIN_SETUP_TH.md
git commit -m "feat: add secure boxing membership admin dashboard"
git push origin main
```

ถ้ามีโฟลเดอร์ `boxing-members` ที่ clone อยู่แล้ว ให้เข้าโฟลเดอร์เดิมและดึงโค้ดล่าสุด (`git pull`) แทนการ clone ซ้ำ จากนั้น copy เฉพาะไฟล์ที่อัปเดต

ถ้า GitHub ขอให้ลงชื่อเข้าใช้ ใช้การยืนยันผ่านบัญชีของคุณตามขั้นตอนปกติ ไม่ส่ง token หรือ secret ในแชต

### วิธี Web UI

อัปเดต/เพิ่มไฟล์เดียวกันใน Repository เดิม: `src/worker.js`, `src/admin-api.js`, `public/admin.html`, `public/admin.js`, `public/admin.css`, `migrations/0003_admin_dashboard.sql`, `tests/worker.test.js` และ `ADMIN_SETUP_TH.md`.

การอัปโหลด ZIP ขึ้น GitHub อย่างเดียว **ไม่ทำให้ไฟล์ด้านในถูกใช้งาน** ต้องแตก ZIP และนำไฟล์ไปไว้ในตำแหน่งเดิมตามชื่อข้างบน

## 2. สร้างตารางอนุญาตผู้ดูแลใน D1 เดิม

Cloudflare Dashboard → D1 → `boxing-members` → Console

เนื่องจากคุณเคยสร้างตารางอื่นด้วย Console มาแล้ว ให้วาง SQL ทีละคำสั่งตามนี้:

```sql
CREATE TABLE IF NOT EXISTS admin_users (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('viewer','owner')),
  granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

ตรวจรหัสสมาชิกจากฐานข้อมูลก่อนให้สิทธิ์:

```sql
SELECT id, display_name FROM members ORDER BY id;
```

ในภาพทดสอบก่อนหน้านี้ `id=1` คือบัญชี LINE ชื่อ `Not` ให้ตรวจว่าตรงกับบัญชีที่คุณใช้ดูแลระบบจริง จึงค่อยรัน **คำสั่งให้สิทธิ์นี้**:

```sql
INSERT OR IGNORE INTO admin_users (member_id, role)
VALUES (1, 'owner');
```

ตรวจซ้ำ:

```sql
SELECT a.member_id, m.display_name, a.role
FROM admin_users a JOIN members m ON m.id = a.member_id;
```

**ห้ามให้สิทธิ์ Admin โดยอัตโนมัติแก่สมาชิกทุกคน** และห้ามใช้ Member ID ที่ไม่ได้ตรวจว่าเป็นเจ้าของบัญชีจริง

อนาคตถ้าจะเพิ่มผู้ดูแลคนอื่น ต้องให้เขาสมัครสมาชิก LINE ก่อน จากนั้นตรวจสอบ Member ID กับเจ้าตัวและอนุมัติสิทธิ์เป็นรายบุคคล

### Index สำหรับระบบจริง (ทำเพิ่มภายหลังได้)

ไฟล์ `migrations/0003_admin_dashboard.sql` มี Index เพิ่มเติม แต่ `admin_users` ตารางเดียวก็เพียงพอให้ทดลองได้ ถ้าต้องการให้ Wrangler จัด Migration ทั้งหมดให้สอดคล้องกันในภายหลัง ใช้:

```bash
npx wrangler d1 migrations apply boxing-members --remote
```

Migration 0001 และ 0002 เขียนให้ใช้ `IF NOT EXISTS` และ `INSERT OR IGNORE` จึงไม่ควรสร้างสมาชิก/เครื่องทดสอบซ้ำ ทั้งนี้ให้ Backup และตรวจอีกครั้งก่อนใช้กับฐานข้อมูลที่มีข้อมูลลูกค้าจำนวนมาก

## 3. ตรวจ Cloudflare Deploy

หลัง Commit ขึ้น GitHub → Cloudflare Workers → `boxing-members` → Builds / Deployments ต้องขึ้น `Success`

เข้าเว็บหลังบ้าน:

`https://boxing-members.organization-23c.workers.dev/admin`

เปิดด้วย LINE บัญชีที่ได้รับสิทธิ์ `owner` (ถ้า LINE Login Channel ยังเป็น Developing ให้ใช้บัญชีที่มีสิทธิ์ทดสอบ Channel นั้น)

หากเห็นข้อความ `บัญชีนี้ไม่ได้รับอนุญาต` (403) ให้ตรวจสิทธิ์ใน `admin_users` ไม่ใช่แก้ให้ API เป็น public

หากเห็น `SERVER_ERROR` (500) ให้เช็กว่าสร้างตาราง `admin_users` และ Deploy โค้ดล่าสุดครบแล้ว

## 4. Acceptance Tests

- สมัครสมาชิกและเช็กอินหน้าเว็บลูกค้าตามปกติได้โดยไม่เปลี่ยนพฤติกรรม
- ผู้ใช้งานทั่วไปไป `/admin` แล้วถูกปฏิเสธ (403)
- Admin login ผ่าน LINE ได้ ดูข้อมูลเฉพาะผู้ที่อนุญาต
- Dashboard แสดงสมาชิกที่มีจริง และเช็กอินที่บันทึกได้ใน D1
- เลือกช่วง 7/30/90 วันแล้วตัวเลขเช็กอินเปลี่ยนตามเวลา
- ค้นหาสมาชิกด้วยชื่อหรือ `DBX000001` ได้
- ไม่มีข้อมูล `line_user_id`, secret หรือ token ถูกส่งออกจาก Admin API
- เลิกใช้งานระบบสมาชิกชั่วคราวแล้ว QR BOX เดิมยังชำระเงินและเปิดเครื่องได้ตามปกติ

## ข้อจำกัดรุ่นนี้

- ยังไม่เชื่อมชำระเงิน, ไม่ยืนยันการเล่นจริง, ไม่สะสมแต้มจากเกม
- ไม่ส่ง LINE Broadcast, ยังไม่ Sync กับ Lark Base
- ยังไม่มีระบบจัดการผู้ดูแลผ่าน UI: ให้สิทธิ์/ถอนสิทธิ์ด้วย D1 Console และควรบันทึกผู้อนุมัติไว้
- การค้นหาชื่อใน SQLite ที่เป็นภาษาอังกฤษ/ภาษาไทยมีความสามารถแตกต่างกันบางกรณี ให้ทดสอบก่อนใช้กับข้อมูลจำนวนมาก
- ต้องเพิ่มมาตรการควบคุมสิทธิ์และตรวจ PDPA / นโยบายเก็บข้อมูล / Logging ก่อนใช้งานวงกว้าง

## Security Notes

รหัส LINE User ID อยู่ฝั่งสมาชิกแต่ละคนและในฐานข้อมูลเท่านั้น ไม่ถูกส่งออกในรายงานหลังบ้าน ไม่มีการใช้วิธี `id=1` เพื่อให้สิทธิ์แบบฮาร์ดโค้ดใน Worker: การให้สิทธิ์ครั้งแรกต้องทำด้วย SQL โดยเจ้าของระบบเอง
