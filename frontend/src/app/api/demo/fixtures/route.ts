import { demoProxy } from '@/lib/demo-server';
export async function GET() { return demoProxy('/fixtures'); }
