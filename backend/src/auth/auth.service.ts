import { ConflictException, HttpException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { LoginDto, RegisterDto } from './auth.dto';
import { hashPassword, verifyPassword } from './password';

export type SessionUser = { id: string; email: string; displayName: string };
const userSelect = { id: true, email: true, displayName: true } as const;
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const accountOwner = (id: string) => tokenHash(`account:${id}`);

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}

  private async throttle(key: string, limit = 15) {
    const now = new Date(Date.now()), expires = new Date(now.getTime() + 15 * 60000), id = tokenHash(key);
    const [entry] = await this.db.client.$queryRaw<Array<{ count: number }>>`
      INSERT INTO rate_limit_buckets (id,count,"expiresAt") VALUES (${id},1,${expires})
      ON CONFLICT (id) DO UPDATE SET
        count=CASE WHEN rate_limit_buckets."expiresAt" <= ${now} THEN 1 ELSE rate_limit_buckets.count+1 END,
        "expiresAt"=CASE WHEN rate_limit_buckets."expiresAt" <= ${now} THEN ${expires} ELSE rate_limit_buckets."expiresAt" END
      RETURNING count`;
    if (entry.count > limit) throw new HttpException('ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที', 429);
  }

  async register(body: RegisterDto, ip: string, guest?: string) {
    await this.throttle(`register:${ip}`, 30);
    const passwordHash = await hashPassword(body.password);
    let user: SessionUser;
    try { user = await this.db.client.user.create({ data: { email: body.email, displayName: body.displayName, passwordHash }, select: userSelect }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
      throw error;
    }
    return this.session(user, guest);
  }

  async login(body: LoginDto, ip: string, guest?: string) {
    await this.throttle(`login:${ip}`, 100);
    await this.throttle(`email:${body.email}`);
    const user = await this.db.client.user.findUnique({ where: { email: body.email } });
    // Use the same KDF cost even when the account does not exist.
    const hash = user?.passwordHash || `scrypt-v1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
    if (!(await verifyPassword(body.password, hash)) || !user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    await this.db.client.rateLimitBucket.deleteMany({ where: { id: tokenHash(`email:${body.email}`) } });
    return this.session({ id: user.id, email: user.email, displayName: user.displayName }, guest);
  }

  private async session(user: SessionUser, guest?: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600000);
    await this.db.client.$transaction(async (tx) => {
      await tx.authSession.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt } });
      if (guest && /^[a-f0-9]{48}$/.test(guest)) {
        const rows = await tx.lineupPrediction.findMany({ where: { ownerHash: tokenHash(guest), userId: null } });
        for (const prediction of rows) {
          const exists = await tx.lineupPrediction.findUnique({ where: { userId_fixtureId_teamId: { userId: user.id, fixtureId: prediction.fixtureId, teamId: prediction.teamId } } });
          if (!exists) await tx.lineupPrediction.update({ where: { id: prediction.id }, data: { userId: user.id, ownerHash: accountOwner(user.id) } });
        }
      }
    });
    return { user, token, expiresAt };
  }

  async authenticate(header?: string): Promise<SessionUser> {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (!/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    const session = await this.db.client.authSession.findUnique({ where: { tokenHash: tokenHash(token) }, select: { expiresAt: true, user: { select: userSelect } } });
    if (!session || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException('กรุณาเข้าสู่ระบบอีกครั้ง');
    return session.user;
  }

  async logout(header?: string) {
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
    if (/^[a-f0-9]{64}$/.test(token)) await this.db.client.authSession.deleteMany({ where: { tokenHash: tokenHash(token) } });
    return { ok: true };
  }
}
