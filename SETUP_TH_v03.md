# DEAL! Boxing Club — Machine Registry & Membership QR v0.3

## ผลลัพธ์

เพิ่มหน้า `/admin/machines` ภายใต้ Worker **boxing-members เดิม** ไม่ใช่เว็บใหม่ โดย Admin ที่ได้รับสิทธิ์สามารถ:

- ดูรายการตู้ทุกเครื่อง พร้อมรหัสตู้/ชื่อ/โลเคชั่น/สถานะ/เช็กอินสะสม
- เพิ่มตู้ใหม่ด้วย Machine ID ไม่ซ้ำ, ผูกรหัส Lxxxx จาก Lark/DEAL! Master ที่มีอยู่แล้ว
- แก้ไขชื่อ/โลเคชั่น/เปิดหรือปิดการเช็กอิน (ไม่ลบประวัติเก่า)
- สร้าง QR สมัครสมาชิกประจำตู้ ดาวน์โหลดไฟล์ **SVG** และพิมพ์ป้ายติดตู้
- คัดลอก LIFF URL ของตู้ เช่น `https://liff.line.me/2012120948-rYfATUiF/m/BX001`

**ระบบชำระเงินยังไม่เปลี่ยน:** QR สมาชิก → LINE → สมัคร/เช็กอิน จากนั้นกด QR BOX → สแกนจ่าย → เครื่องเปิดตามระบบ AKI/T-DEV เดิม

**ข้อมูลเช็กอินไม่ใช่ข้อมูลชำระเงินหรือจำนวนเกมที่เล่นจริง** ไม่มีการเชื่อม API รับเงินหรือสั่งงานตู้

## รายละเอียดระบบที่อัปเดต

Repo ที่ถูกต้อง: `https://github.com/organization-Deal/boxing-members` (**อย่าไปอัปเดต `deal-property`**) 

Worker ที่ถูกต้อง: `boxing-members`

Base URL ปัจจุบัน: `https://boxing-members.organization-23c.workers.dev`

หน้า Admin เดิม: `/admin` (Analytics)

หน้าจัดการตู้ใหม่: `/admin/machines`

### สิ่งที่ไม่ต้องทำซ้ำ

- **ไม่ต้องสร้าง LINE OA/LINE Login/LIFF ใหม่**
- **ไม่ต้องสร้าง D1 หรือ migration ใหม่**: ใช้ `machines`, `members`, `checkins`, `admin_users` เดิม
- **ไม่ต้องแก้ `wrangler.jsonc` หรือ SESSION_SECRET**
- **ไม่ต้องเปลี่ยน QR BOX, AKI, T-DEV**

## 1. อัปเดตโค้ดใน GitHub เดิม

ZIP นี้เป็น **ชุดอัปเดตเท่านั้น** ไม่ใช่โปรเจกต์ใหม่ และไม่มี `wrangler.jsonc` เพื่อไม่ให้ค่าที่ตั้งเสร็จแล้วหายไป

### วิธีผ่าน Terminal บน Mac (แนะนำเพื่อรักษาโครงสร้างไฟล์)

แตก ZIP `DEAL-Boxing-Machines-v03-UPDATE.zip` ใน Downloads

ถ้ายังไม่มี repo ใน Mac ให้รัน:

```bash
cd ~/Downloads
git clone https://github.com/organization-Deal/boxing-members.git
```

หากมีโฟลเดอร์ `boxing-members` ที่เคย clone อยู่แล้ว ให้เข้าโฟลเดอร์เดิมและรัน `git pull` แทนการ clone ซ้ำ

จากนั้นรัน:

```bash
cd ~/Downloads/boxing-members
git pull
cp -R ~/Downloads/DEAL-Boxing-Machines-v03-UPDATE/src/. src/
cp -R ~/Downloads/DEAL-Boxing-Machines-v03-UPDATE/public/. public/
cp -R ~/Downloads/DEAL-Boxing-Machines-v03-UPDATE/tests/. tests/
cp ~/Downloads/DEAL-Boxing-Machines-v03-UPDATE/SETUP_TH_v03.md ./SETUP_TH_v03.md
npm install
npm test
git add src public tests SETUP_TH_v03.md
git commit -m "feat: add machine registry and printable membership QR"
git push origin main
```

ถ้า `git commit` แจ้งว่าไม่มีไฟล์เปลี่ยน แปลว่าไฟล์ถูกอัปเดตไปแล้ว

**ถ้าติดปัญหา Permission ใน GitHub** ให้ผู้ที่มี Write Access ของ Repository นี้ทำการอัปเดต ห้ามแชร์ Personal Access Token หรือ Secret ลงแชต

### ใช้ GitHub เว็บแทน Terminal

ต้องนำไฟล์ไปอยู่ตำแหน่งเดิมตรงกับ `src/`, `src/vendor/qr/`, `public/` และ `tests/` **ห้ามอัปโหลด ZIP ทั้งก้อนเป็นไฟล์เดียว** และอย่าให้เกิดโฟลเดอร์ซ้อน `DEAL-Boxing-Machines-v03-UPDATE/` ภายใน repo

ไฟล์ที่แทนของเดิม:
- `src/worker.js`
- `src/admin-api.js`
- `public/admin.html`
- `tests/worker.test.js`

ไฟล์ใหม่:
- `src/machine-admin-api.js`
- `src/qr-svg.js`
- `src/vendor/qr/` (อัลกอริทึม QR พร้อม notices/license)
- `public/admin-machines.html`
- `public/admin-machines.css`
- `public/admin-machines.js`
- `SETUP_TH_v03.md`

## 2. ตรวจ Cloudflare Build

เปิด Cloudflare → Workers & Pages → `boxing-members` → Builds / Deployments

หลัง Commit เข้า `main` รอบล่าสุดต้องขึ้น **Success**

ไม่จำเป็นต้องเพิ่ม D1 binding หรือ Variables เพราะใช้ binding `DB` และ `LIFF_ID` ที่ตั้งอยู่แล้ว

## 3. เข้า Admin และเพิ่มตู้จริง

เข้า:

`https://boxing-members.organization-23c.workers.dev/admin/machines`

ใช้บัญชี LINE เดิมที่เป็น **owner** (ใน D1 `admin_users`) เพื่อเพิ่มหรือแก้ไขตู้

- Machine ID: `BX002` (ตัวอย่างรหัส; ใช้รหัสไม่ซ้ำจริง)
- ชื่อเครื่อง: ระบุชื่อจริงที่ทีม PX ใช้
- Location Code: คัดจาก DEAL! Master เดิม เช่นรูปแบบ `L0001` ไม่เดารหัส
- Location Name: ชื่อสถานที่จริง
- Active: เปิดใช้งาน

คลิก **บันทึกข้อมูลตู้** แล้วตรวจว่าแถวใหม่ขึ้นจริง

## 4. ดาวน์โหลด QR สมาชิกสำหรับแปะหน้าตู้

จากหน้า `/admin/machines` กดปุ่ม **QR สมาชิก** ตรงเครื่องที่ต้องการ แล้วเลือก:

- **ดาวน์โหลด SVG** — ไฟล์เวกเตอร์พิมพ์คมชัด
- **พิมพ์ QR** — เลย์เอาต์ A5 พร้อมรหัสตู้และคำอธิบาย
- **คัดลอกลิงก์** — ใช้ตรวจหรือส่งให้ทีม PX

ก่อนพิมพ์จริงตรวจว่า Location Code/Name ถูกต้อง ไม่ใช่โลเคชั่นทดสอบ

**สำคัญ:** ป้ายนี้คือ **QR สมัครสมาชิก** ต้องติดแยกจาก **QR BOX สำหรับรับเงิน** อย่างชัดเจน

## 5. ทดสอบ

1. เปิด `/admin/machines` ด้วย LINE owner; ต้องเห็น BX001 พร้อมรายการสถิติ
2. เพิ่มตู้ทดสอบใหม่หนึ่งเครื่องผ่านหน้าเว็บ แล้วตรวจใน D1: `SELECT * FROM machines ORDER BY machine_code;`
3. กด QR สมาชิกจากตู้ใหม่ และทดลองสแกนผ่าน LINE; หน้าเว็บต้องแสดง Machine ID ตรงกัน
4. เช็กอินตู้ใหม่ แล้วตรวจใน D1: `SELECT member_id,machine_code,checked_in_at FROM checkins ORDER BY checked_in_at DESC LIMIT 10;`
5. กดปิดใช้งานตู้ → QR สมาชิกของตู้นั้นต้องไม่สามารถเช็กอินใหม่ แต่ประวัติเก่ายังคงอยู่
6. ลองบัญชี Viewer หรือสมาชิกทั่วไป → ต้องไม่สามารถเพิ่มหรือแก้ไขตู้
7. ตรวจตู้จริงยังรับเงินผ่าน QR BOX และเริ่มเกมได้เหมือนเดิม

## หมายเหตุการใช้งาน

- `BX001` ตอนนี้ยังเป็น **โลเคชั่นทดสอบ** ต้องอัปเดตเป็นรหัสและชื่อสถานที่จริงก่อนพิมพ์ QR ไปติดหน้าตู้
- ระบบนี้ไม่ Sync กับ Lark Master โดยอัตโนมัติ: ให้กรอกรหัส Location Code ที่ทีมยืนยันแล้วเท่านั้น
- การเปิดหรือปิดสถานะเป็นการเปิด/ปิด **เช็กอินของสมาชิก** ไม่ได้เปิด/ปิดเครื่องหรือการชำระเงินจริง
- การสร้างรหัสตู้ใหม่ควรใช้ทะเบียนกลางของทีม PX ไม่ควรให้หลายคนใช้ Machine ID เดียวกันกับเครื่องคนละตัว
- QR สร้างภายใน Worker (ไม่ต้องส่งข้อมูล QR ไปเว็บภายนอก) ด้วยไลบรารีที่มี License อยู่ใน `src/vendor/qr/`
- ไม่ลบตู้ที่มีประวัติ; ใช้การปิดใช้งานเพื่อรักษาข้อมูลเช็กอินเดิม
- Code tests 6 ชุดผ่านในเครื่องด้วย Node.js; **ยังต้อง Deploy และทดสอบบน Cloudflare จริง**

## Troubleshooting

- HTTP 401: ต้องล็อกอิน LINE อีกครั้ง
- HTTP 403: สมาชิกยังไม่ได้รับสิทธิ์ `admin_users` หรือไม่ใช่ `owner` สำหรับการแก้ไข
- HTTP 404 `/admin/machines`: โค้ดยังไม่ได้ขึ้น Cloudflare หรือ file path ผิด
- HTTP 500: ตรวจ Worker Logs และการผูก D1; ตรวจว่า `admin_users` มีอยู่แล้ว
- QR ปิดใช้งาน: เปิด Active ในหน้าทะเบียนตู้ก่อนสร้างหรือสแกน
- ตู้ใหม่สแกนแล้วขึ้น "ไม่พบตู้": ตรวจ Machine ID ใน D1 และว่า Active=1

## ความปลอดภัย

ทุก API Admin ต้องผ่าน Session ที่เซ็นชื่อจาก LINE + ตารางสิทธิ์ `admin_users` ก่อนเสมอ; POST/PATCH ต้องตรวจ Same-Origin เพิ่มและเปิดให้เฉพาะ `owner` เท่านั้น ไม่มีการเปิดข้อมูล LINE User ID ออกในรายงานทะเบียนตู้
