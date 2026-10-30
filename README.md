# DaoPon

บัญชีผู้เล่น: http://localhost:3000/register · เข้าสู่ระบบ: http://localhost:3000/login · คะแนนแยกสโมสร: http://localhost:3000/account

คำทำนายผูกกับบัญชี และให้คะแนน 1 คะแนนต่อรายชื่อที่ตรงกับตัวจริง โดยเริ่มตรวจหลังเวลาเริ่มแข่งในเกม 3 ชั่วโมง Worker ต้องมี backend ทำงานอยู่ เปิดด้วย `PREDICTION_SCORING_ENABLED=true` ใน `backend/.env` (เครื่องนี้เปิดแล้ว)

หน้าเลือกตัวจริงมีช่องทายสกอร์แยก บันทึกสกอร์อย่างเดียวได้ สกอร์ตรงเป๊ะได้ 3 คะแนน หากสกอร์ไม่ตรงแต่ผลชนะ/เสมอ/แพ้ถูกได้ 1 คะแนน ผิดได้ 0 คะแนน (สูงสุด 3 ไม่บวกเป็น 4) คะแนนสกอร์และคะแนนตัวจริงแสดงแยกกันตามสโมสรในหน้า `/account` เปิดรับ 7 วันก่อนแข่งและล็อกเมื่อ kickoff ตรวจสกอร์หลัง kickoff ในเกม 3 ชั่วโมงเมื่อ API ยืนยันผลจบแล้ว

เว็บสถิติพรีเมียร์ลีก ใช้ Next.js + React + TypeScript, NestJS และ PostgreSQL ผ่าน Prisma

หน้าเดโม: http://localhost:3000/demo เลือกวันเวลาไทยในฤดูกาล 2024/25 หรือเลือกแมตช์แล้วข้ามไปก่อนแข่ง 1 วัน, kickoff, kickoff +3 ชั่วโมงได้ เวลาที่เลือกหยุดค้างและใช้ร่วมกันทุกหน้า/ทุกบัญชี เก็บในฐานข้อมูลข้ามการรีสตาร์ต มีปุ่มกลับเวลาปกติ และตรวจคะแนนแมตช์ที่เลือกทันทีเมื่อถึงเวลา (ใช้ผลจริงจาก API) คะแนนที่ตรวจแล้วคงอยู่และไม่เปิดให้แก้คำทำนายเมื่อย้อนเวลา เครื่องนี้เปิดเครื่องมือแล้วและมีแถบ “ปรับเวลาเดโม” ด้านบนเว็บ

## โครงสร้าง

```text
Premier/
├── backend/           NestJS API
│   ├── src/           modules: teams, players, fixtures, sync ฯลฯ
│   ├── prisma/        schema และ migrations
│   ├── test/          unit / integration tests
│   ├── scripts/       migrate และนำข้อมูลเข้า
│   ├── .env           API key และค่าฐานข้อมูลเฉพาะเครื่อง
│   └── package.json
├── frontend/          Next.js
│   ├── src/app/       หน้าเลือกทีมและรายชื่อนักเตะ
│   └── package.json
└── package.json       คำสั่งเรียกแต่ละแอปจาก root
```

แต่ละแอปมี dependencies และ lockfile ของตัวเอง ต้องใช้ Node.js 22.12+ หรือ 24+

## เริ่มใช้งาน

หลัง clone repository ให้ติดตั้งจาก root ของโปรเจกต์:

```sh
npm --prefix backend ci
npm --prefix frontend ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

ใส่ PostgreSQL `DATABASE_URL`, `API_FOOTBALL_KEY` และ `ADMIN_API_KEY` ของคุณใน `backend/.env` ส่วน frontend ใช้ `frontend/.env.local` เพื่อกำหนด `BACKEND_URL` ไฟล์ค่าจริงไม่อยู่ใน repository มีเฉพาะ `.env.example` ที่ไม่มี key จริง อย่าใส่ key หรือรหัสฐานข้อมูลในตัวแปร `NEXT_PUBLIC_`

สร้างตารางและนำข้อมูลเข้าครั้งแรก:

```sh
npm run db:migrate
npm run data:seed
npm run data:fixtures
npm run data:replay-stats
```

การนำข้อมูลเข้าใช้โควตา API-Football และอาจต้องรอหลายวันตามแพ็กเกจ รายละเอียดอยู่ใน `backend/README.md` เปิด worker หรือโหมดเดโมเมื่อกำหนดค่าตาม `.env.example` แล้ว

เปิดสอง terminal ที่ root ของ Premier:

```sh
npm run backend:dev
```

```sh
npm run frontend:dev
```

- เว็บ: http://localhost:3000
- API: http://localhost:3001/api
- Swagger: http://localhost:3001/api/docs
- ตรวจการเชื่อมฐานข้อมูล: http://localhost:3001/api/health/ready

## คำสั่งจาก root

| คำสั่ง | การใช้งาน |
|---|---|
| `npm run backend:build` | Generate Prisma client และ build NestJS |
| `npm run backend:start` | เปิด backend จาก build |
| `npm run backend:test` | ทดสอบ backend |
| `npm run backend:lint` | ตรวจ TypeScript ของ backend |
| `npm run frontend:build` | Build Next.js |
| `npm run frontend:start` | เปิด frontend จาก build |
| `npm run db:migrate` | Apply migrations ของ backend |
| `npm run db:studio` | เปิด Prisma Studio |
| `npm run data:seed` | นำข้อมูลเข้าโดยใช้ cache ของ backend |
| `npm run data:fixtures` | นำตารางแข่ง 380 นัดเข้าโดยใช้ cache หรือ API 1 request |
| `npm run data:replay-stats` | เติมสถิติรายนัดถึงวันจำลอง โดยหยุดก่อนโควตาหมด |

รันคำสั่งภายในแต่ละแอปโดยตรงได้เช่นกัน เช่น `cd backend` แล้ว `npm run start:dev`

รายละเอียด API, scheduler และการทดสอบอยู่ใน [backend/README.md](backend/README.md) ส่วนหน้าเว็บและข้อจำกัดข้อมูลอยู่ใน [frontend/README.md](frontend/README.md)

หน้าตารางแข่งขัน: http://localhost:3000/fixtures ใช้เวลาจำลองย้อนหลัง 2 ปี และแสดงเฉพาะนัดที่ยังไม่ถึงเวลาแข่งขันของฤดูกาล 2024/25 โดยซ่อนผลการแข่งขัน

ข้อมูลที่มีเป็นฤดูกาล 2024/25 ตามสิทธิ์ API-Football Free และบางสโมสรมีรายชื่อไม่ครบตามข้อจำกัด pagination ที่หน้าเว็บแสดงไว้
