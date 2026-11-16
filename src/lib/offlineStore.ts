import type { AttemptRecord, ExamPacket, Question } from '../types';

const OFFLINE_PACKETS_KEY = 'pintartka_offline_packets_v1';
const LOCAL_ATTEMPTS_KEY = 'pintartka_local_attempts_v1';
const STUDENT_IDENTITY_KEY = 'pintartka_student_identity_v1';

export interface CachedPacketBundle {
  packet: ExamPacket;
  questions: Question[];
  cachedAtMs: number;
}

export interface StudentIdentity {
  displayName: string;
  className: string;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getOfflinePacketBundles(): Record<string, CachedPacketBundle> {
  return safeParse<Record<string, CachedPacketBundle>>(
    localStorage.getItem(OFFLINE_PACKETS_KEY),
    {}
  );
}

export function saveOfflinePacketBundle(packet: ExamPacket, questions: Question[]): void {
  const bundles = getOfflinePacketBundles();
  bundles[packet.id] = {
    packet,
    questions: [...questions].sort((a, b) => a.order - b.order),
    cachedAtMs: Date.now(),
  };
  localStorage.setItem(OFFLINE_PACKETS_KEY, JSON.stringify(bundles));
}

export function removeOfflinePacketBundle(packetId: string): void {
  const bundles = getOfflinePacketBundles();
  delete bundles[packetId];
  localStorage.setItem(OFFLINE_PACKETS_KEY, JSON.stringify(bundles));
}

export function isPacketCachedOffline(packetId: string): boolean {
  const bundles = getOfflinePacketBundles();
  return Boolean(bundles[packetId] && bundles[packetId].questions.length > 0);
}

export function getLocalAttempts(): AttemptRecord[] {
  const list = safeParse<AttemptRecord[]>(localStorage.getItem(LOCAL_ATTEMPTS_KEY), []);
  return list.sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export function saveLocalAttempt(attempt: AttemptRecord): void {
  const list = getLocalAttempts();
  const filtered = list.filter((item) => item.id !== attempt.id);
  filtered.unshift(attempt);
  localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(filtered.slice(0, 100)));
}

export function markAttemptSynced(attemptId: string): void {
  const list = getLocalAttempts();
  const updated = list.map((item) =>
    item.id === attemptId ? { ...item, syncedToCloud: true } : item
  );
  localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(updated));
}

export function deleteLocalAttempt(attemptId: string): void {
  const list = getLocalAttempts().filter((item) => item.id !== attemptId);
  localStorage.setItem(LOCAL_ATTEMPTS_KEY, JSON.stringify(list));
}

export function getStudentIdentity(): StudentIdentity {
  return safeParse<StudentIdentity>(localStorage.getItem(STUDENT_IDENTITY_KEY), {
    displayName: 'Siswa Hebat',
    className: 'Kelas 6',
  });
}

export function saveStudentIdentity(identity: StudentIdentity): void {
  localStorage.setItem(STUDENT_IDENTITY_KEY, JSON.stringify(identity));
}
