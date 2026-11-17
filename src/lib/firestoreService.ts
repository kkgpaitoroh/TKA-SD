import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  db,
  handleFirestoreError,
  isBootstrappedAdminEmail,
  OperationType,
} from './firebase';
import { STARTER_PACKETS } from '../data/starterPackets';
import type {
  AdminRecord,
  AnswerValue,
  AttemptRecord,
  ExamPacket,
  LiveSessionRecord,
  LiveSessionStatus,
  PacketStatus,
  Question,
  QuestionType,
  UserProfile,
} from '../types';

export async function ensureBootstrappedAdminDoc(
  uid: string,
  email: string,
  name: string
): Promise<void> {
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (!snap.exists()) {
      await setDoc(doc(db, 'admins', uid), {
        uid,
        email: email.slice(0, 200),
        name: (name || 'Guru Admin').slice(0, 100),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function checkIsAdmin(uid: string, email?: string | null): Promise<boolean> {
  if (isBootstrappedAdminEmail(email)) {
    return true;
  }
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchAdminProfile(uid: string): Promise<AdminRecord | null> {
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    const updatedTs = data.updatedAt as { toMillis?: () => number } | undefined;
    return {
      uid: dStr(data.uid, uid),
      email: dStr(data.email, ''),
      name: dStr(data.name, 'Guru Admin'),
      roleTitle: data.roleTitle ? String(data.roleTitle) : '',
      schoolName: data.schoolName ? String(data.schoolName) : '',
      nip: data.nip ? String(data.nip) : '',
      updatedAtMs: updatedTs?.toMillis ? updatedTs.toMillis() : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function dStr(val: unknown, fallback: string): string {
  return typeof val === 'string' && val.length > 0 ? val : fallback;
}

export async function upsertAdminProfile(
  uid: string,
  email: string,
  updates: {
    name: string;
    roleTitle?: string;
    schoolName?: string;
    nip?: string;
  }
): Promise<AdminRecord> {
  const path = `admins/${uid}`;
  const cleanName = updates.name.trim().slice(0, 100) || 'Guru Admin';
  const cleanRole = (updates.roleTitle || '').trim().slice(0, 80);
  const cleanSchool = (updates.schoolName || '').trim().slice(0, 100);
  const cleanNip = (updates.nip || '').trim().slice(0, 40);
  const cleanEmail = email.trim().slice(0, 200);

  try {
    const ref = doc(db, 'admins', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email: cleanEmail,
        name: cleanName,
        roleTitle: cleanRole,
        schoolName: cleanSchool,
        nip: cleanNip,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: cleanName,
        roleTitle: cleanRole,
        schoolName: cleanSchool,
        nip: cleanNip,
        updatedAt: serverTimestamp(),
      });
    }
    return {
      uid,
      email: cleanEmail,
      name: cleanName,
      roleTitle: cleanRole,
      schoolName: cleanSchool,
      nip: cleanNip,
      updatedAtMs: Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid: String(data.uid || uid),
      displayName: String(data.displayName || 'Siswa'),
      className: String(data.className || 'Kelas 6'),
      schoolName: data.schoolName ? String(data.schoolName) : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function upsertUserProfile(profile: UserProfile): Promise<void> {
  const path = `users/${profile.uid}`;
  try {
    const ref = doc(db, 'users', profile.uid);
    const snap = await getDoc(ref);
    const payload: Record<string, unknown> = {
      uid: profile.uid,
      displayName: profile.displayName.trim().slice(0, 100) || 'Siswa',
      className: profile.className.trim().slice(0, 30) || 'Kelas 6',
      updatedAt: serverTimestamp(),
    };
    if (profile.schoolName?.trim()) {
      payload.schoolName = profile.schoolName.trim().slice(0, 100);
    }
    if (!snap.exists()) {
      payload.createdAt = serverTimestamp();
      await setDoc(ref, payload);
    } else {
      await updateDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchExamPackets(isAdmin: boolean): Promise<ExamPacket[]> {
  const path = 'examPackets';
  try {
    const q = isAdmin
      ? query(collection(db, path), orderBy('updatedAt', 'desc'))
      : query(collection(db, path), where('status', '==', 'published'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: String(data.title || ''),
        subject: data.subject,
        gradeLevel: data.gradeLevel,
        description: String(data.description || ''),
        durationMinutes: Number(data.durationMinutes || 15),
        questionCount: Number(data.questionCount || 0),
        status: data.status as PacketStatus,
        createdBy: String(data.createdBy || ''),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        source: 'cloud',
      } satisfies ExamPacket;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

function normalizeQuestionType(val: unknown): QuestionType {
  if (val === 'true_false' || val === 'mcma') return val;
  return 'pg';
}

function buildQuestionFields(
  q: Pick<
    Question,
    | 'prompt'
    | 'options'
    | 'correctIndex'
    | 'explanation'
    | 'difficulty'
    | 'subject'
    | 'questionType'
    | 'stimulus'
    | 'correctIndices'
    | 'correctBooleans'
  >,
  fallbackSubject: string,
  isUpdate: boolean
): Record<string, unknown> {
  const qType = normalizeQuestionType(q.questionType);
  const cleanOpts = q.options
    .map((o) => o.trim().slice(0, 500))
    .filter((o) => o.length > 0)
    .slice(0, 6);
  while (cleanOpts.length < 2) {
    cleanOpts.push(`Pilihan ${cleanOpts.length + 1}`);
  }
  const maxIdx = cleanOpts.length - 1;
  const safeCorrectIndex = Math.max(0, Math.min(maxIdx, Math.round(q.correctIndex || 0)));

  const fields: Record<string, unknown> = {
    questionType: qType,
    subject: q.subject.trim().slice(0, 60) || fallbackSubject,
    difficulty: q.difficulty,
    prompt: q.prompt.trim().slice(0, 2000),
    options: cleanOpts,
    correctIndex: safeCorrectIndex,
    explanation: q.explanation.trim().slice(0, 3000),
  };

  const cleanStimulus = (q.stimulus || '').trim().slice(0, 4000);
  if (cleanStimulus.length > 0) {
    fields.stimulus = cleanStimulus;
  } else if (isUpdate) {
    fields.stimulus = deleteField();
  }

  if (qType === 'mcma') {
    const rawIndices = Array.isArray(q.correctIndices) ? q.correctIndices : [];
    const valid = Array.from(
      new Set(rawIndices.filter((i) => Number.isInteger(i) && i >= 0 && i <= maxIdx))
    ).sort((a, b) => a - b);
    const finalIndices = valid.length > 0 ? valid : [safeCorrectIndex];
    fields.correctIndices = finalIndices;
    fields.correctIndex = finalIndices[0];
  } else if (isUpdate) {
    fields.correctIndices = deleteField();
  }

  if (qType === 'true_false') {
    const rawBools = Array.isArray(q.correctBooleans) ? q.correctBooleans : [];
    fields.correctBooleans = cleanOpts.map((_, idx) => Boolean(rawBools[idx]));
  } else if (isUpdate) {
    fields.correctBooleans = deleteField();
  }

  return fields;
}

export async function fetchQuestionsForPacket(
  packetId: string,
  isAdmin: boolean
): Promise<Question[]> {
  const path = 'questions';
  try {
    const q = isAdmin
      ? query(collection(db, path), where('packetId', '==', packetId))
      : query(
          collection(db, path),
          where('packetId', '==', packetId),
          where('packetStatus', '==', 'published')
        );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => {
      const data = d.data();
      const opts = Array.isArray(data.options) && data.options.length >= 2
        ? data.options.map(String)
        : ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'];
      const qType = normalizeQuestionType(data.questionType);
      return {
        id: d.id,
        packetId: String(data.packetId),
        packetStatus: data.packetStatus as PacketStatus,
        order: Number(data.order || 0),
        subject: String(data.subject || 'Campuran TKA'),
        difficulty: data.difficulty,
        questionType: qType,
        stimulus: typeof data.stimulus === 'string' && data.stimulus.trim() ? data.stimulus : undefined,
        prompt: String(data.prompt || ''),
        options: opts,
        correctIndex: Number(data.correctIndex || 0),
        correctIndices: Array.isArray(data.correctIndices)
          ? data.correctIndices.map(Number)
          : undefined,
        correctBooleans: Array.isArray(data.correctBooleans)
          ? data.correctBooleans.map(Boolean)
          : undefined,
        explanation: String(data.explanation || ''),
        createdBy: String(data.createdBy || ''),
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } satisfies Question;
    });
    return list.sort((a, b) => a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function createPacketWithQuestions(
  packetInput: Omit<ExamPacket, 'id' | 'questionCount' | 'createdAt' | 'updatedAt' | 'source'>,
  questionsInput: Array<Omit<Question, 'id' | 'packetId' | 'packetStatus' | 'order' | 'createdBy' | 'createdAt' | 'updatedAt'>>,
  uid: string
): Promise<string> {
  const packetId = `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `examPackets/${packetId}`;
  try {
    const batch = writeBatch(db);
    const packetRef = doc(db, 'examPackets', packetId);

    batch.set(packetRef, {
      title: packetInput.title.trim().slice(0, 160),
      subject: packetInput.subject,
      gradeLevel: packetInput.gradeLevel,
      description: packetInput.description.trim().slice(0, 500),
      durationMinutes: Math.max(1, Math.min(180, Math.round(packetInput.durationMinutes))),
      questionCount: questionsInput.length,
      status: packetInput.status,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    questionsInput.forEach((q, idx) => {
      const qId = `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      const qRef = doc(db, 'questions', qId);
      batch.set(qRef, {
        packetId,
        packetStatus: packetInput.status,
        order: idx + 1,
        ...buildQuestionFields(q, packetInput.subject, false),
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    return packetId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateExamPacket(
  packetId: string,
  updates: Partial<Pick<ExamPacket, 'title' | 'subject' | 'gradeLevel' | 'description' | 'durationMinutes' | 'status' | 'questionCount'>>
): Promise<void> {
  const path = `examPackets/${packetId}`;
  try {
    const packetRef = doc(db, 'examPackets', packetId);
    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.title !== undefined) payload.title = updates.title.trim().slice(0, 160);
    if (updates.subject !== undefined) payload.subject = updates.subject;
    if (updates.gradeLevel !== undefined) payload.gradeLevel = updates.gradeLevel;
    if (updates.description !== undefined) payload.description = updates.description.trim().slice(0, 500);
    if (updates.durationMinutes !== undefined)
      payload.durationMinutes = Math.max(1, Math.min(180, Math.round(updates.durationMinutes)));
    if (updates.questionCount !== undefined) payload.questionCount = updates.questionCount;
    if (updates.status !== undefined) payload.status = updates.status;

    if (updates.status !== undefined) {
      const qSnap = await getDocs(query(collection(db, 'questions'), where('packetId', '==', packetId)));
      const batch = writeBatch(db);
      batch.update(packetRef, payload);
      qSnap.docs.forEach((d) => {
        batch.update(d.ref, {
          packetStatus: updates.status,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
    } else {
      await updateDoc(packetRef, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteExamPacketAndQuestions(packetId: string): Promise<void> {
  const path = `examPackets/${packetId}`;
  try {
    const qSnap = await getDocs(query(collection(db, 'questions'), where('packetId', '==', packetId)));
    const batch = writeBatch(db);
    qSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'examPackets', packetId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addQuestionToPacket(
  packet: ExamPacket,
  questionInput: Omit<Question, 'id' | 'packetId' | 'packetStatus' | 'order' | 'createdBy' | 'createdAt' | 'updatedAt'>,
  order: number,
  uid: string
): Promise<string> {
  const qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const path = `questions/${qId}`;
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'questions', qId), {
      packetId: packet.id,
      packetStatus: packet.status,
      order,
      ...buildQuestionFields(questionInput, packet.subject, false),
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'examPackets', packet.id), {
      questionCount: packet.questionCount + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return qId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateQuestionDoc(
  questionId: string,
  updates: Pick<
    Question,
    | 'prompt'
    | 'options'
    | 'correctIndex'
    | 'explanation'
    | 'difficulty'
    | 'subject'
    | 'questionType'
    | 'stimulus'
    | 'correctIndices'
    | 'correctBooleans'
  >
): Promise<void> {
  const path = `questions/${questionId}`;
  try {
    await updateDoc(doc(db, 'questions', questionId), {
      ...buildQuestionFields(updates, 'Campuran TKA', true),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteQuestionDoc(packet: ExamPacket, questionId: string): Promise<void> {
  const path = `questions/${questionId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'questions', questionId));
    batch.update(doc(db, 'examPackets', packet.id), {
      questionCount: Math.max(0, packet.questionCount - 1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAttemptToCloud(attempt: AttemptRecord, uid: string): Promise<void> {
  const safeId = attempt.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const path = `attempts/${safeId}`;
  try {
    await setDoc(doc(db, 'attempts', safeId), {
      userId: uid,
      studentName: attempt.studentName.trim().slice(0, 100) || 'Siswa',
      className: attempt.className.trim().slice(0, 30) || 'Kelas 6',
      packetId: attempt.packetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128),
      packetTitle: attempt.packetTitle.trim().slice(0, 160),
      subject: attempt.subject.trim().slice(0, 60),
      mode: attempt.mode,
      score: Math.max(0, Math.min(100, Number(attempt.score))),
      correctCount: Math.max(0, Math.round(attempt.correctCount)),
      totalQuestions: Math.max(1, Math.round(attempt.totalQuestions)),
      durationSeconds: Math.max(0, Math.round(attempt.durationSeconds)),
      answers: attempt.answers,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function fetchAttempts(uid: string, isAdmin: boolean): Promise<AttemptRecord[]> {
  const path = 'attempts';
  try {
    const q = isAdmin
      ? query(collection(db, path), orderBy('createdAt', 'desc'))
      : query(collection(db, path), where('userId', '==', uid));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => {
      const data = d.data();
      const createdTs = data.createdAt as { toMillis?: () => number } | undefined;
      return {
        id: d.id,
        userId: String(data.userId || ''),
        studentName: String(data.studentName || 'Siswa'),
        className: String(data.className || 'Kelas 6'),
        packetId: String(data.packetId || ''),
        packetTitle: String(data.packetTitle || ''),
        subject: String(data.subject || ''),
        mode: data.mode === 'practice' ? 'practice' : 'timed',
        score: Number(data.score || 0),
        correctCount: Number(data.correctCount || 0),
        totalQuestions: Number(data.totalQuestions || 1),
        durationSeconds: Number(data.durationSeconds || 0),
        answers: (data.answers || {}) as Record<string, AnswerValue>,
        createdAtMs: createdTs?.toMillis ? createdTs.toMillis() : Date.now(),
        syncedToCloud: true,
      } satisfies AttemptRecord;
    });
    return list.sort((a, b) => b.createdAtMs - a.createdAtMs);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCloudAttempt(attemptId: string): Promise<void> {
  const path = `attempts/${attemptId}`;
  try {
    await deleteDoc(doc(db, 'attempts', attemptId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedStarterPacketsToCloud(uid: string): Promise<number> {
  let seeded = 0;
  for (const bundle of STARTER_PACKETS) {
    const packetRef = doc(db, 'examPackets', bundle.packet.id);
    const existing = await getDoc(packetRef);
    if (existing.exists()) continue;

    const batch = writeBatch(db);
    batch.set(packetRef, {
      title: bundle.packet.title,
      subject: bundle.packet.subject,
      gradeLevel: bundle.packet.gradeLevel,
      description: bundle.packet.description,
      durationMinutes: bundle.packet.durationMinutes,
      questionCount: bundle.questions.length,
      status: 'published',
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    bundle.questions.forEach((q) => {
      batch.set(doc(db, 'questions', q.id), {
        packetId: bundle.packet.id,
        packetStatus: 'published',
        order: q.order,
        subject: q.subject,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    seeded += 1;
  }
  return seeded;
}

export async function fetchAdmins(): Promise<AdminRecord[]> {
  const path = 'admins';
  try {
    const colRef = collection(db, path);
    let snap;
    try {
      snap = await getDocsFromServer(colRef);
    } catch {
      snap = await getDocs(colRef);
    }
    return snap.docs.map((d) => {
      const data = d.data();
      const updatedTs = data.updatedAt as { toMillis?: () => number } | undefined;
      return {
        uid: d.id,
        email: String(data.email || ''),
        name: String(data.name || ''),
        roleTitle: data.roleTitle ? String(data.roleTitle) : '',
        schoolName: data.schoolName ? String(data.schoolName) : '',
        nip: data.nip ? String(data.nip) : '',
        updatedAtMs: updatedTs?.toMillis ? updatedTs.toMillis() : undefined,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function addAdminRecord(uid: string, email: string, name: string): Promise<void> {
  const safeUid = uid.trim();
  const path = `admins/${safeUid}`;
  try {
    await setDoc(doc(db, 'admins', safeUid), {
      uid: safeUid,
      email: email.trim().slice(0, 200),
      name: name.trim().slice(0, 100),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeAdminRecord(uid: string): Promise<void> {
  const path = `admins/${uid}`;
  try {
    await deleteDoc(doc(db, 'admins', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertLiveSession(
  session: Omit<LiveSessionRecord, 'updatedAtMs'>,
  preferUpdate = false
): Promise<void> {
  const safeUid = session.userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  const safePacketId = session.packetId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'packet';
  const path = `liveSessions/${safeUid}`;

  const mutableFields = {
    studentName: session.studentName.trim().slice(0, 100) || 'Siswa',
    className: session.className.trim().slice(0, 30),
    packetId: safePacketId,
    packetTitle: session.packetTitle.trim().slice(0, 160) || 'Paket Ujian',
    subject: session.subject.trim().slice(0, 60) || 'Campuran TKA',
    mode: session.mode,
    status: session.status,
    currentQuestionNumber: Math.max(1, Math.min(500, Math.round(session.currentQuestionNumber))),
    answeredCount: Math.max(0, Math.min(500, Math.round(session.answeredCount))),
    flaggedCount: Math.max(0, Math.min(500, Math.round(session.flaggedCount))),
    totalQuestions: Math.max(1, Math.min(500, Math.round(session.totalQuestions))),
    secondsLeft: Math.max(0, Math.min(36000, Math.round(session.secondsLeft))),
    elapsedSeconds: Math.max(0, Math.min(36000, Math.round(session.elapsedSeconds))),
    examStartedAtMs: Math.max(0, Math.round(session.examStartedAtMs)),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'liveSessions', safeUid);
    if (preferUpdate) {
      try {
        await updateDoc(ref, mutableFields);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('No document to update') && !msg.includes('not-found')) {
          throw err;
        }
      }
    }

    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        userId: safeUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, mutableFields);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeLiveSessions(
  onData: (sessions: LiveSessionRecord[]) => void,
  onError?: (error: unknown) => void
): () => void {
  const path = 'liveSessions';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const data = d.data();
        const updatedTs = data.updatedAt as { toMillis?: () => number } | undefined;
        const statusRaw = String(data.status || 'working');
        const status: LiveSessionStatus =
          statusRaw === 'finished' || statusRaw === 'exited' ? statusRaw : 'working';

        return {
          userId: String(data.userId || d.id),
          studentName: String(data.studentName || 'Siswa'),
          className: String(data.className || ''),
          packetId: String(data.packetId || ''),
          packetTitle: String(data.packetTitle || ''),
          subject: String(data.subject || ''),
          mode: data.mode === 'practice' ? 'practice' : 'timed',
          status,
          currentQuestionNumber: Number(data.currentQuestionNumber || 1),
          answeredCount: Number(data.answeredCount || 0),
          flaggedCount: Number(data.flaggedCount || 0),
          totalQuestions: Number(data.totalQuestions || 1),
          secondsLeft: Number(data.secondsLeft || 0),
          elapsedSeconds: Number(data.elapsedSeconds || 0),
          examStartedAtMs: Number(data.examStartedAtMs || Date.now()),
          updatedAtMs: updatedTs?.toMillis ? updatedTs.toMillis() : Date.now(),
        } satisfies LiveSessionRecord;
      });
      list.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Already logged structured error via handleFirestoreError
      }
    }
  );
}

export async function deleteLiveSession(sessionId: string): Promise<void> {
  const path = `liveSessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'liveSessions', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearFinishedLiveSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const path = 'liveSessions';
  try {
    const batch = writeBatch(db);
    sessionIds.forEach((id) => {
      batch.delete(doc(db, 'liveSessions', id));
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
