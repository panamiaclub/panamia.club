import { NextRequest } from 'next/server';
import { encryptionHttp } from '@/lib/server/encryption-request';
import { downloadEncryptionBackup } from '@/lib/server/encryption-recovery';

export function GET(
  request: NextRequest,
  { params }: { params: Promise<{ backupId: string }> }
) {
  return encryptionHttp(request, async ({ scope }) =>
    downloadEncryptionBackup(scope, (await params).backupId)
  );
}
