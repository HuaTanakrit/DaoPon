# Deploy DaoPon บน Vercel

Frontend และ NestJS backend อยู่ใน Vercel project เดียวผ่าน Services ฐานข้อมูลใช้ Neon เดิม ตัวตั้งเวลาภายนอกเรียก HTTP job เพื่อให้ตรวจคะแนนอัตโนมัติได้บน Hobby โดยไม่ต้องเปิดเครื่องค้างไว้

## 1. เตรียมฐานข้อมูล

โค้ดต้องใช้ migrations ถึง `202610310002_serverless_workers` เพื่อเพิ่มตัวล็อกงาน โควตา API และตัวจำกัดการล็อกอินร่วมกัน ทุกตารางเป็นตารางเพิ่มใหม่ ไม่ลบผู้ใช้ คำทำนาย หรือคะแนนเดิม

จาก root บนเครื่องที่มี `backend/.env` ถูกต้อง:

```sh
npm --prefix backend ci
npm run db:migrate
```

ใช้ Neon เดิมได้ ไม่ต้องสร้างฐานข้อมูลใหม่ หากเริ่มจากฐานข้อมูลเปล่าต้องนำทีม ตารางแข่ง และข้อมูลนักเตะเข้าก่อนตาม README

## 2. Import ทั้งโปรเจกต์

1. Import GitHub repository `HuaTanakrit/DaoPon` ใน Vercel
2. Root Directory เป็น root ของ repository (`./`) โค้ดมี `vercel.json` กำหนดทั้งสอง Services แล้ว
3. หากหน้าจอแสดงตัวเลือก ให้เลือก Import multi-service project; ไม่เลือก Import single project ของ frontend
4. ล้าง Build / Output / Install overrides ระดับ project ที่เคยใส่ไว้ ใช้คำสั่งแยกต่อ service ใน `vercel.json`
5. ถ้าเคยใส่ `BACKEND_URL` เป็น localhost หรือ Railway ใน Project Variables ให้ลบค่านั้น Vercel จะฉีด URL ภายในผ่าน binding ให้ frontend เอง

Install Command ของทั้งสอง service ต้องใช้ `npm ci --include=dev` ตาม `vercel.json` เพราะขั้น build ต้องใช้ TypeScript, type declarations, Nest CLI และ Prisma CLI แม้ `NODE_ENV=production` หากเคย override Install Command ในหน้า Vercel ให้ล้าง override เพื่อใช้ค่าจากไฟล์

การจัดเส้นทาง:

| เส้นทางสาธารณะ | Service |
|---|---|
| `/api/jobs/tick` | Backend; ต้องใช้ Bearer CRON_SECRET |
| `/api/health` และ `/api/health/ready` | Backend |
| หน้าเว็บ, `/api/auth/*`, `/api/predictions/*`, `/api/me/*`, `/api/demo*` | Next.js frontend |

API auth และคำทำนายผ่าน Next.js เพื่อเก็บ session ใน HttpOnly cookie ตามเดิม ไม่ส่ง `/api/*` ทั้งหมดไป NestJS Backend routes อื่นเข้าผ่าน private service binding จึงไม่ต้องเปิด API ผู้ดูแลต่อสาธารณะ

## 3. ตั้ง Environment Variables

ใช้ชื่อใน `.env.example` ที่ root เป็นรายการอ้างอิง ใส่ค่าจริงใน Vercel Settings → Environment Variables

| Key | ค่า |
|---|---|
| `DATABASE_URL` | Neon connection string เดิม เก็บ SSL parameters ให้ครบ |
| `API_FOOTBALL_KEY` | API-Football key ของคุณ |
| `ADMIN_API_KEY` | ค่าเดิมจาก `backend/.env` หรือ token สุ่ม |
| `CRON_SECRET` | token สุ่มอย่างน้อย 32 ตัวอักษร; บนเครื่องเตรียมไว้ใน `backend/.env` แล้ว |
| `NODE_ENV` | `production` |
| `BACKGROUND_JOBS_ENABLED` | `false` |
| `PREDICTION_SCORING_ENABLED` | `true` |
| `REPLAY_STATS_SYNC_ENABLED` | `true` |
| `AUTO_SYNC_ENABLED` | `false` |
| `FOOTBALL_DAILY_LIMIT` | `100` สำหรับแพ็กเกจ Free; ระบบกันไว้ 5 calls |
| `FRONTEND_URL` | origin ของเว็บ เช่น `https://your-project.vercel.app` |
| `DEMO_CONTROLS_ENABLED` | `false` เว้นแต่จะเปิดเดโมให้ผู้ดูแล |

ไม่ต้องใส่ `BACKEND_URL` หรือ `PORT` เอง และไม่ใช้ `NEXT_PUBLIC_` กับค่าลับ หลังเปลี่ยน Variables ให้ redeploy หากยังไม่ทราบโดเมนจริง ใส่ origin ที่จะใช้ก่อน แล้วอัปเดต FRONTEND_URL หลัง deploy ครั้งแรก

กด Deploy แล้วเปิด `https://โดเมนของคุณ/api/health/ready` ต้องได้ HTTP 200 จากนั้นตรวจหน้าเลือกทีม, Login, หน้าทาย และคะแนนของฉัน

## 4. เปิดงานอัตโนมัติ — ต้องตั้งหลังมี URL

Vercel Hobby ไม่รองรับ cron schedule ทุกนาที โค้ดจึงไม่ได้ฝัง schedule ที่จะทำให้ Hobby deploy ไม่ผ่าน ให้ใช้ตัวตั้งเวลาภายนอกเรียก:

```text
GET https://โดเมน-production-ของคุณ/api/jobs/tick
Authorization: Bearer <CRON_SECRET ค่าเดียวกับ Vercel>
```

ตัวอย่างใช้ cron-job.org:

1. สมัครที่ `https://console.cron-job.org/` แล้ว Create cronjob
2. ใส่ URL ข้างบนและเลือก Every minute
3. ใน Advanced ตั้ง Request method เป็น GET และเพิ่ม custom header `Authorization` ค่า `Bearer ` ตามด้วย CRON_SECRET
4. บันทึกแล้วใช้ Test run ตรวจว่าได้ HTTP 200 อย่าใส่ secret ใน query string หรือ URL

หาก deployment เปิด Vercel Authentication/Deployment Protection ต้องให้เครื่องมือ cron เข้าถึง production endpoint ได้ โดยตั้งค่าตามระบบป้องกันของ Vercel; CRON_SECRET ในแอปยังต้องส่งเสมอ

แต่ละ tick ตรวจคะแนนที่ถึง kickoff +3h ก่อน หากไม่มีคะแนนค้างจึงเติมสถิติรายนัดหนึ่งแมตช์ ทำงานแบบแบ่งรอบ ไม่ backfill ทั้งฤดูกาลใน request เดียว ไม่เขียน cache ลง filesystem บน Vercel ตัวล็อกใน PostgreSQL ป้องกันงานชนกันและไม่บวกคะแนนซ้ำ แม้ provider หรือ connection ล้มเหลว งานที่ค้างอยู่ยังถูกเก็บในฐานข้อมูล

cron-job.org แบบฟรีจำกัดเวลา request 30 วินาที; โค้ดเรียก provider สูงสุดหนึ่งครั้งต่อ tick หากพบ timeout ให้ตรวจ Function Logs และสถานะงาน การเรียกซ้ำไม่บวกคะแนนซ้ำ เลือก scheduler ที่ยอมให้รอนานขึ้นได้หาก latency สูง Vercel Function ถูกตั้งไว้สูงสุด 60 วินาที

ต้องใช้ URL production ที่คงที่ ไม่ใช้ preview URL ของแต่ละ commit เมื่อ cloud worker ทำงานแล้ว ให้หยุด worker บนเครื่องหรือกำหนด `BACKGROUND_JOBS_ENABLED=false` บนเครื่องเพื่อใช้ผู้เรียกงานชุดเดียว

## 5. เวลาเดโมบนเว็บสาธารณะ

เปิดเฉพาะเมื่อใช้งาน โดยตั้งใน Vercel:

```env
DEMO_CONTROLS_ENABLED=true
DEMO_CONTROL_TOKEN=<สุ่มอย่างน้อย 32 ตัวอักษร>
DEMO_ADMIN_EMAILS=<อีเมลบัญชีผู้ดูแลที่สมัครใน DaoPon แล้ว>
```

DEMO_ADMIN_EMAILS ใส่หลายอีเมลคั่นด้วย comma ได้ ต้อง Login ด้วยบัญชีที่อนุญาตก่อนใช้ `/demo` ผู้ชมทั่วไปเปลี่ยนเวลาไม่ได้ เวลาเก็บใน Neon และอ่านใหม่ทุก request จึงตรงกันแม้มีหลาย instance คำทำนายที่ตรวจคะแนนแล้วไม่สามารถแก้ไขหลังย้อนเวลาได้

## อ้างอิง

- [Vercel Services และ bindings](https://vercel.com/kb/guide/vercel-services)
- [Vercel Cron scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [cron-job.org custom headers และ timeout](https://cron-job.org/en/faq/)
