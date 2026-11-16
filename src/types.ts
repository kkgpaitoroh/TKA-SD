export type SubjectType = 'Matematika' | 'Bahasa Indonesia' | 'IPAS' | 'Campuran TKA';
export type GradeLevel = 'Kelas 4' | 'Kelas 5' | 'Kelas 6';
export type DifficultyLevel = 'Mudah' | 'Sedang' | 'HOTS';
export type PacketStatus = 'draft' | 'published';
export type AttemptMode = 'timed' | 'practice';
export type QuestionType = 'pg' | 'true_false' | 'mcma';
export type AnswerValue = number | number[] | boolean[];

export interface ExamPacket {
  id: string;
  title: string;
  subject: SubjectType;
  gradeLevel: GradeLevel;
  description: string;
  durationMinutes: number;
  questionCount: number;
  status: PacketStatus;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  source?: 'cloud' | 'starter';
}

export interface Question {
  id: string;
  packetId: string;
  packetStatus: PacketStatus;
  order: number;
  subject: string;
  difficulty: DifficultyLevel;
  questionType?: QuestionType;
  stimulus?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  correctIndices?: number[];
  correctBooleans?: boolean[];
  explanation: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AttemptRecord {
  id: string;
  userId: string;
  studentName: string;
  className: string;
  packetId: string;
  packetTitle: string;
  subject: string;
  mode: AttemptMode;
  score: number;
  correctCount: number;
  totalQuestions: number;
  durationSeconds: number;
  answers: Record<string, AnswerValue>;
  createdAtMs: number;
  syncedToCloud: boolean;
  questionsSnapshot?: Question[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  className: string;
  schoolName?: string;
}

export interface ImportedQuestionDraft {
  tempId: string;
  questionType: QuestionType;
  stimulus?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  correctIndices?: number[];
  correctBooleans?: boolean[];
  explanation: string;
  difficulty: DifficultyLevel;
  subject: string;
}

export interface AdminRecord {
  uid: string;
  email: string;
  name: string;
  roleTitle?: string;
  schoolName?: string;
  nip?: string;
  updatedAtMs?: number;
}

export type LiveSessionStatus = 'working' | 'finished' | 'exited';

export interface LiveSessionRecord {
  userId: string;
  studentName: string;
  className: string;
  packetId: string;
  packetTitle: string;
  subject: string;
  mode: AttemptMode;
  status: LiveSessionStatus;
  currentQuestionNumber: number;
  answeredCount: number;
  flaggedCount: number;
  totalQuestions: number;
  secondsLeft: number;
  elapsedSeconds: number;
  examStartedAtMs: number;
  updatedAtMs: number;
}
