# Premier League Backend

Vercel ใช้ [คู่มือ deploy](../docs/DEPLOY_VERCEL.md) HTTP GET/POST `/api/jobs/tick` ต้องมี Bearer `CRON_SECRET` (อย่างน้อย 32 ตัวอักษร) แต่ละ request ทำงานหนึ่งแมตช์ผ่าน lease ใน PostgreSQL เมื่ออยู่บน Vercel ต้องปิด `BACKGROUND_JOBS_ENABLED`; endpoint ยังทำงานได้ตาม flags ตรวจคะแนน/สถิติ เวลาเดโมอ่านจาก DB ต่อ request และ rate limits ของ provider/login ใช้ DB ร่วมกัน

## เวลาเดโม

`replay_settings` เก็บเวลาที่เลือกและโหลดใหม่ทุก request ผ่าน AsyncLocalStorage เพื่อแยก snapshot ของ request ที่ซ้อนกัน เปิดด้วย `DEMO_CONTROLS_ENABLED=true` และ `DEMO_CONTROL_TOKEN` สุ่มอย่างน้อย 32 ตัวอักษร โดยใช้ค่าเดียวกันเฉพาะ server env ของ Next.js (`frontend/.env.local`) บน Vercel ต้อง Login ด้วยอีเมลใน `DEMO_ADMIN_EMAILS` ด้วย API `/api/demo` (GET/PUT) และ `/api/demo/fixtures` (GET) ต้องมี Bearer token สำหรับเดโม ส่วน Next.js มี proxy และตรวจ Origin สำหรับคำขอแก้ไข

PUT body `{ "replayAt": "2024-11-02T22:00:00+07:00" }` หยุดเวลาเกมไว้ ณ จุดนั้น รองรับ 1 สิงหาคม 2024 ถึง 30 มิถุนายน 2025 ส่ง `{ "replayAt": null }` เพื่อกลับเวลาจริงย้อนหลัง 2 ปี เก็บข้ามการรีสตาร์ต ตารางแข่ง สถิติ การล็อกคำทำนาย และการเฉลยใช้ clock เดียวกัน แต่ session expiry, rate limits, quota reset และ retry leases ยังใช้เวลาจริง

เปลี่ยนเวลาแล้วจะปรับ runAt ของงานตรวจที่ค้างไว้ POST `/api/demo/process` body `{ "fixture": 1208116 }` สั่งตรวจแมตช์ที่เลือกทันทีถ้าถึง kickoff +3h; UI ทำขั้นตอนนี้ให้หลังเปลี่ยนเวลา งานอื่นดำเนินต่อทุกนาที คะแนนทั้งสองประเภทไม่ถูกล้างและคำทำนายที่ให้คะแนนแล้วแก้ไม่ได้แม้ย้อนเวลา ระหว่าง DEMO หยุด cron backfill สถิติทั้งลีก เพื่อไม่ให้การข้ามไกลใช้โควตาจำนวนมาก งานตรวจคำทำนายยังเรียกข้อมูลจริงตามปกติและรอเมื่อข้อมูล/โควตายังไม่พร้อม

## บัญชีผู้เล่นและคะแนนแยกสโมสร

ผู้ใช้สมัครด้วยชื่อ อีเมล และรหัสผ่านอย่างน้อย 8 ตัวอักษร ผ่าน `POST /api/auth/register` หรือเข้าสู่ระบบด้วย `POST /api/auth/login` ใช้ `GET /api/auth/me` ตรวจบัญชี และ `POST /api/auth/logout` ยกเลิก session ปัจจุบัน Next.js เก็บ session ใน HttpOnly / SameSite=Lax cookie ฝั่ง backend เก็บเฉพาะ SHA-256 ของ token และ hash รหัสผ่านด้วย scrypt พร้อม salt แยกรายบัญชี อายุ session 30 วัน

API อ่าน/บันทึกคำทำนาย `/api/predictions/:apiId` และ `/api/me/scores` ต้องมี `Authorization: Bearer <session>` ทุก query จำกัดเฉพาะ userId ใน session ไม่รับ userId หรือคะแนนจาก client ทีมเดิมของ guest ในเบราว์เซอร์จะถูกโอนเข้าบัญชีเมื่อสมัคร/เข้าสู่ระบบโดยใช้ guest cookie เดิม หากบัญชีมีคำทำนายแมตช์/สโมสรนั้นอยู่แล้ว จะเก็บของบัญชีไว้

แต่ละบัญชีมีคำทำนายได้หนึ่งชุดต่อแมตช์ต่อสโมสร แก้ไขได้ตั้งแต่ 7 วันก่อนเริ่มจนก่อน kickoff ตามเวลาจำลอง เก็บ picks เป็น player FK และ slot แต่การให้คะแนนตรวจเฉพาะ player ID ที่อยู่ใน startXI ไม่พิจารณา slot, formation หรือตำแหน่งที่ลง ทายถูกคนละ 1 คะแนน สูงสุด 11 คะแนน และรวมแยกตามสโมสรที่เลือกทาย

คำทำนายสกอร์เก็บในตาราง `score_predictions` แยกจากตัวจริง หนึ่งแถวต่อ user/fixture/club ใช้ `GET /api/predictions/:apiId/score?team=40` และ `PUT /api/predictions/:apiId/score` (Bearer session) โดย body เป็น `{ "team": 40, "homeGoals": 2, "awayGoals": 1 }` ต้องระบุประตูทั้งสองฝั่งเป็นจำนวนเต็ม 0–99 ใช้ช่วงเปิดรับและการล็อก kickoff เดียวกัน บันทึกสกอร์อย่างเดียวได้โดยไม่ต้องเลือก 11 คน

สกอร์ตรงทั้งคู่ได้ 3 คะแนน หากไม่ตรงแต่ผลเจ้าบ้านชนะ/เสมอ/ทีมเยือนชนะถูกได้ 1 คะแนน นอกนั้นได้ 0 คะแนน ไม่บวก 3+1 รวมแยกตามสโมสรใน `/api/me/scores`: `points` เป็นตัวจริง ส่วน `scorePoints` เป็นทายสกอร์ พร้อมประวัติ `scorePredictions` แยกจาก `predictions` ค่า `points=null` หมายถึงรอตรวจ ต่างจากทายผิดที่ได้ 0

ตั้ง `PREDICTION_SCORING_ENABLED=true` เพื่อเปิด worker ตรวจงานทุกนาที งาน `sync_jobs.kind=LINEUPS` ถูกเก็บใน PostgreSQL กำหนด runAt เป็น kickoff ตามเวลาในเกม + 3 ชั่วโมง แล้วแปลงกลับเป็นเวลาจริงโดยเลื่อน 2 ปี Worker รับงานด้วย lease / SKIP LOCKED และตรวจเวลาอีกครั้งก่อนบันทึกคะแนน หากมีสกอร์รอตรวจจะเรียก `/fixtures?id=...` เพื่อรับผลและใช้ lineups ใน response เดียวกัน หากรอเฉพาะตัวจริงจะเรียก `/fixtures/lineups` ตรวจว่ามีตัวจริง 11 คนต่อทีมครบและไม่ซ้ำก่อนให้คะแนนรายชื่อ ส่วนคะแนนสกอร์ต้องได้สถานะ FT/AET/PEN และจำนวนประตูที่ยืนยันแล้ว แต่ละประเภทตรวจได้อิสระแม้อีกประเภทข้อมูลยังไม่ครบ

ถ้ารายชื่อไม่ครบ, API ล้มเหลว หรือโควตาเหลือน้อย จะเก็บคะแนนเป็น null (รอเฉลย) แล้ว retry ตามงานที่เก็บไว้ โดยสำรองโควตา 5 calls งานที่สำเร็จอัปเดตคะแนนเฉพาะ prediction ที่ยังไม่มีคะแนนใน transaction เดียว จึงไม่บวกซ้ำเมื่อ worker รันซ้ำ คะแนนรวมคำนวณจากแถวคำทำนายที่ตรวจแล้ว ไม่ใช้การ increment ยอดรวมแยกต่างหาก งานที่ผิดพลาดซ้ำเกิน maxAttempts จะเป็น FAILED และต้องให้ผู้ดูแลตรวจสอบ

ต้องเปิด backend ไว้เพื่อให้ worker ทำงาน หากเครื่องปิด งานค้างจะเริ่มหลังเปิดใหม่ ส่วนการกู้รหัสผ่าน/ยืนยันอีเมลยังไม่ได้รวมในเวอร์ชันนี้ API fixture สาธารณะปิดสกอร์/lineup/events ของนัดที่ยังไม่ถึงเวลาจำลอง + 3 ชั่วโมง แม้มีข้อมูลย้อนหลังเก็บไว้แล้ว

NestJS + TypeScript + PostgreSQL + Prisma สำหรับเว็บสถิติพรีเมียร์ลีก ฝั่ง frontend ใช้ Next.js เรียก API นี้ได้โดยตรง

## เริ่มใช้งาน

คำสั่งในเอกสารนี้ให้รันจาก `Premier/backend`

ต้องใช้ Node.js 22.12+ หรือ 24+ ตามช่วงเวอร์ชันที่ Prisma 7 รองรับ แนะนำ Node.js 24 LTS

```sh
npm install
npm run start:dev
```

backend ใช้พอร์ต **3001** และ frontend เริ่มต้นใช้ `http://localhost:3000`

- Swagger: http://localhost:3001/api/docs
- Health: http://localhost:3001/api/health
- Database readiness: http://localhost:3001/api/health/ready

หลัง clone ให้คัดลอก `.env.example` เป็น `.env` แล้วใส่ DATABASE_URL, API-Football key และ ADMIN_API_KEY แบบสุ่มของเครื่องนั้น Repository ไม่รวม `.env` หรือค่าลับจริง และ `.gitignore` ตั้งให้ข้ามไฟล์ค่าจริงเหล่านี้

เมื่อยังไม่ใส่ DATABASE_URL แอปจะเปิดได้และ health จะแสดง `not_configured` ส่วน API ที่อ่านฐานข้อมูลจะคืน HTTP 503 ไม่ได้มีข้อมูลจำลองแสดงแทนข้อมูลจริง

## เชื่อม Neon หรือ PostgreSQL

1. สร้าง PostgreSQL database ใหม่สำหรับโปรเจกต์นี้ เช่น บน Neon
2. คัดลอก connection string มาใส่ `DATABASE_URL` ใน `.env` โดยเก็บ query parameters SSL ที่ผู้ให้บริการให้มาครบ
3. รันจากโฟลเดอร์ `backend`:

```sh
npm run db:migrate
npm run start:dev
```

migrate จะสร้างตารางจาก migrations ใน `prisma/migrations` หากไม่มี DATABASE_URL คำสั่งจะหยุดโดยไม่พยายามเชื่อมฐานข้อมูลอื่น

อีกทางหนึ่ง ใช้ PostgreSQL บนเครื่องผ่าน Docker:

```sh
docker compose up -d
```

แล้วกำหนดค่าใน `.env` ให้ตรงกับ compose:

```env
DATABASE_URL=postgresql://football:football_dev@localhost:5432/premier_league
```

ไฟล์ compose ใช้รหัสผ่านสำหรับการพัฒนาเฉพาะเครื่อง และผูกพอร์ตกับ 127.0.0.1 หากเปลี่ยน POSTGRES_PASSWORD ต้องเปลี่ยนรหัสใน DATABASE_URL ให้ตรงกันด้วย ข้อมูลเก็บใน Docker named volume ไม่ได้หายเมื่อปิด container

## API ที่มีแล้ว

ทุก path ID และ query `team`/`league` ใช้ **API-Football ID** เช่น Liverpool = 40, พรีเมียร์ลีก = 39 ไม่ใช่รหัสภายใน PostgreSQL

| Method | Path | การใช้งาน |
|---|---|---|
| GET | `/api/teams?page=1&limit=20` | รายชื่อทีมที่นำข้อมูลเข้าแล้ว |
| GET | `/api/teams/40` | รายละเอียดทีม |
| GET | `/api/fixtures?season=2024&team=40&status=FT` | ตารางแข่ง กรองฤดูกาล/ทีม/สถานะ |
| GET | `/api/fixtures/upcoming?season=2024&team=40` | เฉพาะนัดหลังเวลาจำลองย้อนหลัง 2 ปี ไม่ส่งสกอร์หรือเฉลย |
| GET | `/api/fixtures/1208396` | สกอร์ ตัวจริง ตัวสำรอง สถิติ และเหตุการณ์ |
| GET | `/api/players?season=2024&search=Salah` | ค้นหานักเตะที่มีสถิติในฤดูกาล |
| GET | `/api/players/replay?season=2024&team=40` | รวมสถิติรายนัดถึงวันจำลอง พร้อมความครบของข้อมูล |
| GET | `/api/players/306` | โปรไฟล์และ season snapshots |
| GET | `/api/players/leaderboard?season=2024&metric=goals` | อันดับประตูหรือ assists รวมทุกสโมสรของนักเตะในลีก/ฤดูกาลเดียวกัน |
| GET | `/api/admin/sync/status` | โควตารายวันที่ทราบจาก request ล่าสุด |
| POST | `/api/admin/sync/fixtures` | นำตารางพรีเมียร์ลีกของฤดูกาลเข้า |
| POST | `/api/admin/sync/fixtures/1208396` | ดึงข้อมูลรายนัด หากจบเกมแล้วจะดึง lineup/stats/events |
| POST | `/api/admin/sync/players` | ดึง season snapshots ของทีม วนครบทุกหน้า |

API อ่านข้อมูลจาก PostgreSQL จึงไม่ใช้โควตา API-Football ทุกครั้งที่มีผู้ชมเว็บ Pagination จำกัดสูงสุด 100 รายการต่อหน้า วันเวลาใน JSON เป็น ISO UTC ฝั่ง frontend แปลงแสดงเป็น Asia/Bangkok ได้ ส่วน rating แบบ Decimal ส่งเป็น string และสถิติที่ยังไม่ทราบคงเป็น null

## นำข้อมูลเข้าครั้งแรก

ตั้ง ADMIN_API_KEY ในช่อง Authorize ของ Swagger เป็น bearer token หรือส่ง header `Authorization: Bearer <ADMIN_API_KEY>` ค่า token อ่านจาก `.env` บนเครื่อง ห้ามส่ง token นี้จากหน้าเว็บสาธารณะ

ทำตามลำดับผ่าน Swagger หลัง database readiness เป็น ready:

1. POST `/api/admin/sync/fixtures` พร้อม body `{"season": 2024}`
2. POST `/api/admin/sync/fixtures/1208396` สำหรับนัดตัวอย่าง Liverpool–Crystal Palace
3. POST `/api/admin/sync/players` พร้อม body `{"season": 2024, "team": 40}`

ตัวอย่างนัด 1208396 จบ 1–1 มี Salah ยิงและ Gakpo แอสซิสต์ ขั้นที่สามช่วยให้ leaderboard มี season totals โดยไม่ต้อง backfill 380 นัดก่อน การ sync เพียง Liverpool จะยังไม่ทำให้ leaderboard ครบทั้งลีก ต้อง sync ทุกทีมที่ต้องการและติดตามความครบถ้วนเอง

**ข้อจำกัดบัญชีที่ทดสอบ:** Free ใช้ได้ 100 requests/วัน และ API ระบุว่าเข้าถึงปีเริ่มฤดูกาล 2022–2024 เท่านั้น ฤดูกาล 2026/27 ถูกปฏิเสธจริง ระบบตรวจ business errors ใน HTTP 200 และคืน `SEASON_NOT_SUPPORTED` แทนการบันทึกข้อมูลว่าง

ค่าเริ่มต้น season ของ API อ่านข้อมูลคือ 2024 เพื่อให้ตรงกับบัญชีที่มี เมื่อเปลี่ยนเป็นแพ็กเกจที่ใช้ปี 2026 ได้ ให้ระบุ `season=2026` ใน query/body และแก้ AUTO_SYNC_SEASON ใน `.env` ด้วย

การนำตารางเข้าอาจใช้เวลาตาม latency ของฐานข้อมูล ส่วน season-player sync ต้องเรียกหลายหน้า จึงควรใช้จาก admin ระหว่างพัฒนา ไม่เรียกซ้ำจากหน้าเว็บของผู้ชม หาก request นำตารางหยุดกลางทาง เรียกใหม่ได้โดย upsert ข้อมูลเดิม

## งานอัตโนมัติหลังจบเกม

### ตารางแข่งในโหมดจำลอง

หน้าเว็บ `/fixtures` ใช้ `/api/fixtures/upcoming` โดย backend คำนวณเวลาไทยย้อนหลัง 2 ปีจากเวลาจริงของ server เช่น 29/10/2026 → 29/10/2024 แล้วเลือกเฉพาะ `kickoffAt` ที่มากกว่าเวลานั้น แม้นัดย้อนหลังจะมีสถานะ FT ในฐานข้อมูลก็ตาม ตัดเกมยกเลิก/เลื่อน/ยุติ และเกมที่ไม่มีเวลาเริ่มออก ไม่รับเวลาจำลองจาก query ของผู้ชม

Response มี `clock.realNow`, `clock.replayNow` และ `replayKickoffAt` สำหรับเวลาแข่งที่เลื่อนมาในปีจริง ส่งเฉพาะข้อมูลโปรแกรมกับสถานะ `UPCOMING` ไม่มีสกอร์, lineup, events หรือ match stats วันที่ 29 กุมภาพันธ์จะถูกปรับเป็นวันสุดท้ายของเดือนเมื่อปีปลายทางไม่ใช่ปีอธิกสุรทิน

นำโปรแกรม 380 นัดเข้าอย่างเดียวด้วย `npm run data:fixtures` ใช้ API 1 request เมื่อไม่มี cache และ upsert จาก cache ในการรันครั้งต่อไป สคริปต์นี้ไม่สร้างงาน sync รายแมตช์ย้อนหลัง หน้าเว็บอ่าน PostgreSQL และไม่ใช้โควตา provider

หน้ารายชื่อนักเตะใช้ `/api/players/replay` เพื่อรวมประตู แอสซิสต์ นาทีลงเล่น และจำนวนนัดจาก `player_match_stats` เฉพาะแมตช์ที่เริ่มมาแล้วอย่างน้อย 3 ชั่วโมงตามเวลาจำลอง ไม่ใช้ยอดรวมเต็มฤดูกาล นักเตะที่ไม่มีรายชื่อในข้อมูลแมตช์ถึงวันนั้นจะไม่ปรากฏ ตำแหน่งอ้างอิงข้อมูลรายนัดล่าสุด และไม่นับตัวสำรองที่ไม่ได้ลงเล่นเป็น appearance

Response มี `coverage.expectedMatches`, `importedMatches` และ `complete` สำหรับทีมที่เลือก ถ้ายังนำข้อมูลเข้าไม่ครบ หน้าเว็บจะแสดงหมายเหตุว่ายอดรวมยังไม่ครบ แทนการนำยอดเต็มฤดูกาลมาเติม นักเตะที่อยู่ใน match sheet แต่ไม่ได้ลงสนามมี appearances = 0

รัน `npm run data:replay-stats` เพื่อเติมข้อมูลย้อนหลัง สคริปต์เรียก `/fixtures?id=...` ครั้งละหนึ่งนัด (Free ไม่อนุญาต `ids`) เก็บ cache ใน `.cache/football/2024/matches` และใช้ฐานข้อมูลติดตามนัดที่นำเข้าแล้ว โดยเริ่ม Liverpool แล้ว Arsenal ก่อน ใช้เวลาเรียก API ห่างกัน 6.5 วินาทีและหยุดเมื่อโควตาเหลือไม่เกิน 5 ครั้ง ถ้าประตู/แอสซิสต์ของผู้เล่นเป็น null จะอ้างอิง goal events ที่มีผลจริง เก็บข้อมูลต้นฉบับไว้ใน rawStatistics เสมอ

ตั้ง `REPLAY_STATS_SYNC_ENABLED=true` เพื่อให้ backend เติมข้อมูลที่ยังขาดทุกชั่วโมงที่นาที 05 รวมแมตช์ใหม่ที่จบแล้วในเกม ต้องเปิด backend ไว้ เมื่อโควตารีเซ็ต 07:00 ไทย รอบ 07:05 จะเติมต่อได้ ค่าเริ่มต้นใน `.env.example` ปิดไว้ ส่วนเครื่องนี้เปิด worker เฉพาะ replay stats แล้ว `AUTO_SYNC_ENABLED` สำหรับ scheduler เดิมยังปิดอยู่

ก่อนเปิดเกมทายจริงยังต้องเพิ่มการป้องกันเฉลยให้ครอบคลุม API ประวัติ `/fixtures`, `/fixtures/:apiId`, `/players`, `/players/:apiId` และ `/players/leaderboard` ซึ่งยังคืนข้อมูลย้อนหลัง/ยอดเต็มฤดูกาลตามเดิม หน้าเว็บนักเตะและตารางจำลองไม่เรียก API เหล่านั้นเพื่อแสดงสถิติ

### Scheduler สำหรับแมตช์จริง

ค่าเริ่มต้น `.env` คือ `AUTO_SYNC_ENABLED=false` เพื่อไม่ให้แอปใช้โควตาทันทีที่เริ่มรัน เปิดหลังตั้งค่าฐานข้อมูลและตรวจสิทธิ์ฤดูกาลแล้ว:

```env
AUTO_SYNC_ENABLED=true
AUTO_SYNC_SEASON=2024
```

- รัน sync ตารางด้วย admin หนึ่งครั้งก่อน แล้วระบบจะ refresh ตารางทุกวันเวลา 07:15 น. ไทย
- นัดที่ยังไม่จบและเพิ่งเริ่มหรือกำลังจะเริ่ม จะสร้าง job ที่ kickoff + 3 ชั่วโมง เช่น 21:00 น. → 00:00 น. วันถัดไป
- worker ตรวจงานทุกนาที เช็กสถานะ FT/AET/PEN ก่อนดึงข้อมูลหลังจบเกม หากยังแข่งอยู่จะเลื่อน 15 นาที
- เก็บ job ใน PostgreSQL มี retry สูงสุดและ lease เพื่อรับงานค้างหลังรีสตาร์ต ใช้ `FOR UPDATE SKIP LOCKED` รับงานอย่างเป็นอะตอม
- เมื่อสำเร็จจะสร้าง RECONCILE job อีก 24 ชั่วโมงเพื่อรับข้อมูลแก้ย้อนหลัง
- เกมเลื่อนหรือยกเลิกจะหยุด job เมื่อ refresh ตารางพบกำหนดใหม่จึงเปิด job ที่ยกเลิกกลับมาตามเวลาใหม่
- งานฤดูกาลที่แพ็กเกจไม่รองรับจะเป็น UNSUPPORTED ไม่วนเรียก API ต่อไป
- นัดในอดีตที่จบแล้วไม่ถูกสร้าง job backfill ทั้งหมดอัตโนมัติ ใช้ admin sync เฉพาะนัดที่ต้องการ

**ขอบเขตเวอร์ชันนี้:** worker อัปเดตเฉพาะรายนัด ยังไม่ refresh season snapshots อัตโนมัติ ต้องใช้ POST `/api/admin/sync/players` เมื่อต้องการปรับ leaderboard; ยังไม่มี pre-match lineup polling, UI จัดการงาน หรือการแจ้งเตือนงานล้มเหลว

HTTP replay worker รองรับหลาย instance โดยใช้ lease กลางใน `worker_leases` จำกัดงานหนึ่งแมตช์ต่อ invocation ตัวจำกัด API เก็บช่วงห่างอย่างน้อย 6.5 วินาทีและโควตารายวันร่วมใน `football_api_state` (เก็บเฉพาะ hash ของ key) ส่วน login limits เก็บใน `rate_limit_buckets` Scheduler legacy สำหรับแมตช์จริงยังควรใช้หนึ่ง process; บน Vercel ปิด timer และ legacy scheduler แล้วใช้ `/api/jobs/tick`

โควตาต่อวันยังต้องเผื่อ retries, reconciliation และ pagination ด้วย การรีเซ็ตโควตาคือ 00:00 UTC หรือ 07:00 น. ไทย ฟังก์ชัน quota status เป็นค่าที่เห็นล่าสุด ไม่ใช่ตัวนับถาวรข้ามการรีสตาร์ต

## โครงสร้าง

```text
src/
  config/        ตรวจ environment
  database/      Prisma service และ PostgreSQL adapter
  health/        liveness/readiness
  teams/         API ทีม
  fixtures/      ตารางและรายละเอียดแมตช์
  players/       นักเตะและ leaderboard
  football-api/  ติดต่อ provider และจำกัดอัตราเรียก
  sync/          admin guard, importer และ scheduler
  generated/     Prisma client ที่สร้างอัตโนมัติ ไม่เก็บใน Git
prisma/
  schema.prisma
  migrations/
test/
  fixtures/      response สาธารณะจริงสำหรับทดสอบแบบ offline
```

## ตรวจโปรเจกต์

```sh
npm run build
npm run lint
npm test
```

`npm test` ตรวจ HTTP validation, admin authentication และ provider errors โดยไม่เรียก API จริง Integration tests จะข้ามหากไม่ตั้ง TEST_DATABASE_URL

หากต้องการรัน integration ให้ใช้ฐานข้อมูลทดสอบแยก ชื่อฐานข้อมูลต้องลงท้าย `_test` คำสั่งทดสอบจะล้างตารางในฐานข้อมูลนั้น:

```sh
DATABASE_URL='postgresql://USER:PASSWORD@HOST/football_test' npm run db:migrate
TEST_DATABASE_URL='postgresql://USER:PASSWORD@HOST/football_test' npm test
```

ทดสอบ integration ด้วยข้อมูลที่บันทึกจาก API จริง ไม่ใช้โควตาเพิ่ม ครอบคลุมการนำข้อมูลเข้าซ้ำ, เก็บข้อมูลเดิมเมื่อ response ไม่ครบ, null stats, pagination, ยอดรวมหลังย้ายทีม, API อ่านข้อมูล และ worker หลังจบเกม

สำหรับ build ที่รันโดยไม่ watch:

```sh
npm run build
npm start
```

server ใช้ `127.0.0.1` ใน development และ `0.0.0.0` เมื่อ `NODE_ENV=production` กำหนดเองได้ด้วย `HOST` และอ่านพอร์ตจาก `PORT` ของ hosting

### Railway

เชื่อม GitHub repo แล้วเลือกเฉพาะ backend ตั้ง Root Directory `/backend`, Build Command `npm run build`, Start Command `npm start` และ Healthcheck Path `/api/health/ready` ใช้หนึ่ง replica และปิด Serverless เพื่อให้ worker ทำงานต่อเนื่อง

ตั้ง Variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `DATABASE_URL` จาก Neon เดิม, `API_FOOTBALL_KEY`, `ADMIN_API_KEY`, `FRONTEND_URL` เป็น origin ของ Vercel, `PREDICTION_SCORING_ENABLED=true`, `REPLAY_STATS_SYNC_ENABLED=true`, `AUTO_SYNC_ENABLED=false`, `DEMO_CONTROLS_ENABLED=false` ไม่ต้องกำหนด PORT เอง คัดลอกค่าลับจาก `.env` บนเครื่องไปใส่ใน Railway โดยตรง ไม่ commit ค่าจริง

Neon เดิมมี migrations และข้อมูลแล้ว หากใช้ฐานข้อมูลใหม่ให้รัน `npm run db:migrate` และนำข้อมูลเข้าก่อนเปิด worker หลัง deploy ไป Settings → Networking → Generate Domain ตรวจ `/api/health/ready` แล้วนำ origin ที่ได้ไปใส่ `BACKEND_URL` ฝั่ง Vercel โดยไม่เติม `/api`

## Frontend: DaoPon

หน้าเว็บ Next.js + React + TypeScript อยู่ที่ `../frontend/` มีหน้าเลือก 20 สโมสรและหน้ารายชื่อนักเตะ แสดงข้อมูลจริงฤดูกาล 2024/25 จากฐานข้อมูล Neon

รัน backend ตามเดิม แล้วเปิดอีก terminal ที่ root ของ Premier:

```sh
npm run frontend:dev
```

เปิด http://localhost:3000 รายละเอียดและข้อจำกัดข้อมูลอยู่ใน `../frontend/README.md`

มี migration เพิ่มตาราง `season_teams` สำหรับสมาชิกสโมสรแต่ละฤดูกาล พร้อม coverage ของการดึงนักเตะ GET `/api/teams` รับ season/league และ GET `/api/players` รับ team เพื่อป้องกันข้อมูลข้ามสโมสร ส่วน `npm run data:seed` ใช้เตรียมข้อมูลผ่าน cache และ upsert ซ้ำได้
