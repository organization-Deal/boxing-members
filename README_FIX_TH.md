# DEAL! Boxing Membership — แก้ปุ่มเข้าสู่ระบบ LINE หน้า `/admin/machines` (v0.3.1)

**ที่แก้:** เมื่อ LINE SDK แจ้ง `isLoggedIn() === true` แต่ API ส่ง HTTP 401 โค้ดเดิมเรียก `init()` ซ้ำ ทำให้กดปุ่มเข้าสู่ระบบแล้วไม่ไปไหน

## เนื้อหาการแก้
- ตรวจ signed session จาก `/api/admin/machines` ก่อนเรียก LINE Login ซ้ำ ถ้า Session ยังดี ให้เข้าหน้าทะเบียนตู้ทันที
- หาก Session หมดอายุ ให้ตรวจ LINE ID Token ถ้าใช้ไม่ได้ ให้แสดงข้อความที่บอกสาเหตุ
- ปุ่มเข้าสู่ระบบใหม่จะ `liff.logout()` แล้ว `liff.login()` สำหรับ Chrome/Safari/เบราว์เซอร์ภายนอก ไม่วน `init()` ซ้ำ
- ถ้าเปิดใน LIFF browser จะเปิดลิงก์ LIFF ทางการ เพราะ `liff.login()` ไม่รองรับใน LIFF browser
- ตัด `utm_source` ออกจาก Redirect URL ของการล็อกอิน โดยใช้ URL เดิม `/admin/machines` เสมอ
- ฝั่ง API ยังบังคับตรวจสิทธิ์จาก `admin_users` ทุกครั้ง ไม่ได้เปิด Dashboard ให้สาธารณะ

## ติดตั้งผ่าน GitHub เว็บไซต์ (แก้ไฟล์เดียว)

1. เปิด `https://github.com/organization-Deal/boxing-members/blob/main/public/admin-machines.js`
2. กด **Edit this file** (ปุ่มรูปดินสอ)
3. นำเนื้อหาทั้งหมดของไฟล์ `public/admin-machines.js` **ใน ZIP นี้** มาแทนเนื้อหาเดิม ไม่ต้องแก้ไฟล์อื่น
4. กด **Commit changes** → Commit directly to `main`
5. รอ Cloudflare Workers → `boxing-members` → Builds / Deployments แสดง **Success**
6. เปิด `https://boxing-members.organization-23c.workers.dev/admin/machines` ใน Chrome แล้วกดรีเฟรชแบบไม่ใช้ cache (`Cmd + Shift + R`)
7. หากขึ้นหน้าล็อกอิน ให้กด **เข้าสู่ระบบด้วย LINE** และใช้บัญชีที่ได้รับสิทธิ์ `owner` อยู่แล้ว

## ห้ามทำ
- ไม่ต้องสร้าง D1/LIFF/LINE OA ใหม่
- ไม่ต้องเปลี่ยน `SESSION_SECRET`, `wrangler.jsonc` หรือ `admin_users`
- ไม่ต้องแก้ระบบจ่ายเงิน QR BOX, AKI หรือ T-DEV

## ถ้ายังไม่ผ่าน

เปิด DevTools → Network จากหน้า `/admin/machines` แล้วตรวจว่า request ไหนตอบ 401:
- `/api/auth/line`: LINE ID Token ถูกปฏิเสธ ให้ลองเข้าสู่ระบบ LINE ใหม่ หรือเช็กความถูกต้องของ Channel
- `/api/admin/machines`: signed session ไม่ถูกส่ง/ไม่ถูกยอมรับ ให้ตรวจ cookies สำหรับ origin เดียวกันและ `SESSION_SECRET` ที่ Deploy อยู่
- HTTP 403: ไม่ใช่ข้อผิดพลาดล็อกอิน แต่ไม่มีสิทธิ์ใน `admin_users`
- HTTP 500: ตรวจ Cloudflare Workers → Observability → Logs

**ห้ามส่ง LINE token, session cookie หรือ `SESSION_SECRET` มาในแชต** ส่งได้เฉพาะ URL ของ request, status และข้อความ error ที่ตัด secret ออกแล้ว

## ทดสอบ

ไฟล์ `tests/auth-recovery.test.mjs` มี 4 regression tests ที่ใช้ `node` ทดสอบเส้นทางล็อกอิน โดยรันจากโฟลเดอร์ที่แตกไฟล์ ZIP ด้วยคำสั่ง `node tests/auth-recovery.test.mjs`
