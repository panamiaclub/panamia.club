import { NextRequest } from 'next/server';
import {
  encryptionBody,
  encryptionHttp,
  encryptionTransport,
} from '@/lib/server/encryption-request';
import {
  listEncryptedRooms,
  openEncryptedRoom,
} from '@/lib/server/encryption-rooms';

export function GET(request: NextRequest) {
  return encryptionHttp(request, (context) =>
    listEncryptedRooms(encryptionTransport(context))
  );
}

export function POST(request: NextRequest) {
  return encryptionHttp(request, (context) =>
    openEncryptedRoom(encryptionTransport(context), encryptionBody(context))
  );
}
