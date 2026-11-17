import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  BookPlus,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileText,
  FileUp,
  Flag,
  FolderOpen,
  Globe,
  Loader2,
  MonitorCheck,
  Plus,
  Radio,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import {
  addAdminRecord,
  addQuestionToPacket,
  clearFinishedLiveSessions,
  createPacketWithQuestions,
  deleteExamPacketAndQuestions,
  deleteLiveSession,
  deleteQuestionDoc,
  fetchAdmins,
  fetchQuestionsForPacket,
  removeAdminRecord,
  seedStarterPacketsToCloud,
  subscribeLiveSessions,
  updateExamPacket,
  updateQuestionDoc,
  upsertAdminProfile,
  upsertUserProfile,
} from '../lib/firestoreService';
import { isSuperAdminEmail } from '../lib/firebase';
import {
  formatCorrectAnswerLabel,
  getEffectiveCorrectBooleans,
  getEffectiveCorrectIndices,
  getQuestionType,
  getQuestionTypeShortLabel,
} from '../lib/questionUtils';
import type {
  AdminRecord,
  AttemptRecord,
  DifficultyLevel,
  ExamPacket,
  GradeLevel,
  ImportedQuestionDraft,
  LiveSessionRecord,
  PacketStatus,
  Question,
  QuestionType,
  SubjectType,
} from '../types';

interface AdminDashboardProps {
  uid: string;
  userEmail: string;
  adminProfile: AdminRecord | null;
  packets: ExamPacket[];
  allAttempts: AttemptRecord[];
  onRefreshData: () => Promise<void>;
  onAdminProfileUpdated: (profile: AdminRecord) => void;
  onNotify: (msg: string, type?: 'success' | 'error') => void;
}

const SUBJECTS: SubjectType[] = ['Matematika', 'Bahasa Indonesia', 'IPAS', 'Campuran TKA'];
const GRADES: GradeLevel[] = ['Kelas 4', 'Kelas 5', 'Kelas 6'];
const DIFFICULTIES: DifficultyLevel[] = ['Mudah', 'Sedang', 'HOTS'];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatRelativeSeconds(diffMs: number): string {
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 8) return 'Baru saja';
  if (sec < 60) return `${sec} detik lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  return `${hr} jam lalu`;
}

const LIVE_STALE_MS = 45_000;

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  uid,
  userEmail,
  adminProfile,
  packets,
  allAttempts,
  onRefreshData,
  onAdminProfileUpdated,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<
    'packets' | 'import' | 'monitor' | 'results' | 'profile'
  >('packets');

  // Packets & Question Manager state
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);
  const [packetQuestions, setPacketQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // New / Edit Packet form
  const [showNewPacketForm, setShowNewPacketForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState<SubjectType>('Matematika');
  const [newGrade, setNewGrade] = useState<GradeLevel>('Kelas 6');
  const [newDuration, setNewDuration] = useState(20);
  const [newDesc, setNewDesc] = useState('');
  const [newStatus, setNewStatus] = useState<PacketStatus>('published');
  const [savingPacket, setSavingPacket] = useState(false);

  // Manual Question Editor state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qType, setQType] = useState<QuestionType>('pg');
  const [qStimulus, setQStimulus] = useState('');
  const [qPrompt, setQPrompt] = useState('');
  const [qOpts, setQOpts] = useState<string[]>(['', '', '', '']);
  const [qCorrect, setQCorrect] = useState(0);
  const [qCorrectIndices, setQCorrectIndices] = useState<number[]>([0]);
  const [qCorrectBooleans, setQCorrectBooleans] = useState<boolean[]>([true, false, false, false]);
  const [qExplanation, setQExplanation] = useState('');
  const [qDifficulty, setQDifficulty] = useState<DifficultyLevel>('Sedang');
  const [qSubject, setQSubject] = useState('Matematika');
  const [savingQuestion, setSavingQuestion] = useState(false);

  // PDF / Word Importer state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [rawPasteText, setRawPasteText] = useState('');
  const [importDefaultSubject, setImportDefaultSubject] = useState<SubjectType>('Campuran TKA');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedDrafts, setExtractedDrafts] = useState<ImportedQuestionDraft[]>([]);
  const [importFilterType, setImportFilterType] = useState<'all' | QuestionType | 'stimulus'>('all');
  const [openStimulusDraftIds, setOpenStimulusDraftIds] = useState<Record<string, boolean>>({});
  const [importTargetMode, setImportTargetMode] = useState<'new' | 'existing'>('new');
  const [importTargetPacketId, setImportTargetPacketId] = useState('');
  const [importPacketTitle, setImportPacketTitle] = useState('');
  const [importPacketSubject, setImportPacketSubject] = useState<SubjectType>('Campuran TKA');
  const [importPacketGrade, setImportPacketGrade] = useState<GradeLevel>('Kelas 6');
  const [importPacketDuration, setImportPacketDuration] = useState(20);
  const [importPacketStatus, setImportPacketStatus] = useState<PacketStatus>('published');
  const [isSavingImport, setIsSavingImport] = useState(false);

  // Results & Admin management state
  const [searchAttempt, setSearchAttempt] = useState('');
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [adminsLoaded, setAdminsLoaded] = useState(false);
  const [newAdminUid, setNewAdminUid] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [removingAdminUid, setRemovingAdminUid] = useState<string | null>(null);
  const isSuperAdmin = isSuperAdminEmail(userEmail);

  // Live Monitor state
  const [liveSessions, setLiveSessions] = useState<LiveSessionRecord[]>([]);
  const [liveReady, setLiveReady] = useState(false);
  const [liveSearch, setLiveSearch] = useState('');
  const [liveStatusFilter, setLiveStatusFilter] = useState<
    'all' | 'active' | 'stale' | 'finished' | 'exited'
  >('all');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clearingMonitor, setClearingMonitor] = useState(false);

  // Admin Profile Editor state
  const [profileName, setProfileName] = useState(adminProfile?.name || 'Guru Admin');
  const [profileRoleTitle, setProfileRoleTitle] = useState(adminProfile?.roleTitle || '');
  const [profileSchoolName, setProfileSchoolName] = useState(adminProfile?.schoolName || '');
  const [profileNip, setProfileNip] = useState(adminProfile?.nip || '');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (adminProfile) {
      setProfileName(adminProfile.name || 'Guru Admin');
      setProfileRoleTitle(adminProfile.roleTitle || '');
      setProfileSchoolName(adminProfile.schoolName || '');
      setProfileNip(adminProfile.nip || '');
    }
  }, [adminProfile]);

  // Real-time Firestore listener for active student exam sessions
  useEffect(() => {
    if (!navigator.onLine) {
      setLiveReady(true);
      return;
    }
    const unsub = subscribeLiveSessions(
      (sessions) => {
        setLiveSessions(sessions);
        setLiveReady(true);
      },
      () => {
        setLiveReady(true);
      }
    );
    return () => unsub();
  }, []);

  // Tick every 5s when viewing live monitor so heartbeats & relative times stay accurate
  useEffect(() => {
    if (activeTab !== 'monitor') return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, [activeTab]);

  const cloudPackets = useMemo(
    () => packets.filter((p) => p.source === 'cloud'),
    [packets]
  );

  const selectedPacket = useMemo(
    () => cloudPackets.find((p) => p.id === selectedPacketId) || null,
    [cloudPackets, selectedPacketId]
  );

  const loadQuestionsForPacket = async (packet: ExamPacket) => {
    setSelectedPacketId(packet.id);
    setLoadingQuestions(true);
    setEditingQuestionId(null);
    resetQuestionForm(packet.subject);
    try {
      const qs = await fetchQuestionsForPacket(packet.id, true);
      setPacketQuestions(qs);
    } catch {
      onNotify('Gagal memuat daftar soal paket ini.', 'error');
    } finally {
      setLoadingQuestions(false);
    }
  };

  const resetQuestionForm = (subj = 'Matematika') => {
    setEditingQuestionId(null);
    setQType('pg');
    setQStimulus('');
    setQPrompt('');
    setQOpts(['', '', '', '']);
    setQCorrect(0);
    setQCorrectIndices([0]);
    setQCorrectBooleans([true, false, false, false]);
    setQExplanation('');
    setQDifficulty('Sedang');
    setQSubject(subj);
  };

  const handleChangeManualType = (nextType: QuestionType) => {
    setQType(nextType);
    if (nextType === 'pg') {
      const nextOpts = qOpts.slice(0, 4);
      while (nextOpts.length < 4) nextOpts.push('');
      setQOpts(nextOpts);
      setQCorrect((prev) => Math.max(0, Math.min(nextOpts.length - 1, prev)));
    } else if (nextType === 'mcma') {
      const nextOpts = qOpts.slice(0, 6);
      while (nextOpts.length < 3) nextOpts.push('');
      setQOpts(nextOpts);
      setQCorrectIndices((prev) => {
        const valid = prev.filter((i) => i >= 0 && i < nextOpts.length);
        return valid.length > 0 ? valid : [0];
      });
    } else {
      const nextOpts = qOpts.slice(0, 6);
      while (nextOpts.length < 2) nextOpts.push('');
      setQOpts(nextOpts);
      setQCorrectBooleans((prev) => nextOpts.map((_, idx) => Boolean(prev[idx] ?? idx === 0)));
    }
  };

  const handleSeedStarters = async () => {
    setIsSeeding(true);
    try {
      const count = await seedStarterPacketsToCloud(uid);
      await onRefreshData();
      if (count > 0) {
        onNotify(`${count} paket soal bawaan TKA SD berhasil disalin ke Cloud.`, 'success');
      } else {
        onNotify('Semua paket soal bawaan sudah tersedia di Cloud.', 'success');
      }
    } catch {
      onNotify('Gagal menyinkronkan paket bawaan ke Cloud.', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCreatePacket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTitle.trim().length < 3) {
      onNotify('Judul paket minimal 3 karakter.', 'error');
      return;
    }
    setSavingPacket(true);
    try {
      const createdId = await createPacketWithQuestions(
        {
          title: newTitle.trim(),
          subject: newSubject,
          gradeLevel: newGrade,
          description: newDesc.trim() || `Latihan CAT ${newSubject} untuk ${newGrade}`,
          durationMinutes: newDuration,
          status: newStatus,
          createdBy: uid,
        },
        [],
        uid
      );
      await onRefreshData();
      setShowNewPacketForm(false);
      setNewTitle('');
      setNewDesc('');
      setSelectedPacketId(createdId);
      setPacketQuestions([]);
      onNotify('Paket ujian baru berhasil dibuat.', 'success');
    } catch {
      onNotify('Gagal membuat paket ujian baru.', 'error');
    } finally {
      setSavingPacket(false);
    }
  };

  const handleTogglePacketStatus = async (packet: ExamPacket) => {
    const nextStatus: PacketStatus = packet.status === 'published' ? 'draft' : 'published';
    try {
      await updateExamPacket(packet.id, { status: nextStatus });
      await onRefreshData();
      onNotify(
        nextStatus === 'published'
          ? 'Paket diterbitkan dan kini terlihat oleh siswa.'
          : 'Paket diubah menjadi Draft.',
        'success'
      );
    } catch {
      onNotify('Gagal mengubah status paket.', 'error');
    }
  };

  const handleDeletePacket = async (packet: ExamPacket) => {
    try {
      await deleteExamPacketAndQuestions(packet.id);
      if (selectedPacketId === packet.id) {
        setSelectedPacketId(null);
        setPacketQuestions([]);
      }
      await onRefreshData();
      onNotify(`Paket "${packet.title}" dihapus.`, 'success');
    } catch {
      onNotify('Gagal menghapus paket.', 'error');
    }
  };

  const handleSaveManualQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPacket) return;
    if (qPrompt.trim().length < 5 || qOpts.some((o) => !o.trim()) || qExplanation.trim().length < 5) {
      onNotify(
        'Pastikan pertanyaan, semua pilihan/pernyataan, dan pembahasan terisi lengkap.',
        'error'
      );
      return;
    }
    if (qType === 'mcma' && qCorrectIndices.length === 0) {
      onNotify('Pilih minimal satu kunci jawaban benar untuk soal MCMA.', 'error');
      return;
    }

    const questionPayload = {
      questionType: qType,
      stimulus: qStimulus.trim() || undefined,
      prompt: qPrompt,
      options: qOpts,
      correctIndex: qType === 'mcma' ? (qCorrectIndices[0] ?? 0) : qCorrect,
      correctIndices: qType === 'mcma' ? [...qCorrectIndices].sort((a, b) => a - b) : undefined,
      correctBooleans: qType === 'true_false' ? qCorrectBooleans.slice(0, qOpts.length) : undefined,
      explanation: qExplanation,
      difficulty: qDifficulty,
      subject: qSubject,
    };

    setSavingQuestion(true);
    try {
      if (editingQuestionId) {
        await updateQuestionDoc(editingQuestionId, questionPayload);
        onNotify('Soal berhasil diperbarui.', 'success');
      } else {
        await addQuestionToPacket(
          selectedPacket,
          questionPayload,
          packetQuestions.length + 1,
          uid
        );
        onNotify('Soal baru ditambahkan ke paket.', 'success');
      }
      await onRefreshData();
      const refreshedQs = await fetchQuestionsForPacket(selectedPacket.id, true);
      setPacketQuestions(refreshedQs);
      resetQuestionForm(selectedPacket.subject);
    } catch {
      onNotify('Gagal menyimpan soal.', 'error');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleEditQuestionClick = (q: Question) => {
    const type = getQuestionType(q);
    const opts = q.options.length >= 2 ? [...q.options] : ['', '', '', ''];
    setEditingQuestionId(q.id);
    setQType(type);
    setQStimulus(q.stimulus || '');
    setQPrompt(q.prompt);
    setQOpts(opts);
    setQCorrect(Math.max(0, Math.min(opts.length - 1, q.correctIndex || 0)));
    setQCorrectIndices(getEffectiveCorrectIndices({ ...q, options: opts }));
    setQCorrectBooleans(getEffectiveCorrectBooleans({ ...q, options: opts }));
    setQExplanation(q.explanation);
    setQDifficulty(q.difficulty);
    setQSubject(q.subject);
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!selectedPacket) return;
    try {
      await deleteQuestionDoc(selectedPacket, qId);
      await onRefreshData();
      const refreshedQs = await fetchQuestionsForPacket(selectedPacket.id, true);
      setPacketQuestions(refreshedQs);
      onNotify('Soal berhasil dihapus.', 'success');
    } catch {
      onNotify('Gagal menghapus soal.', 'error');
    }
  };

  const handleExtractQuestions = async () => {
    if (!importFile && !rawPasteText.trim()) {
      onNotify('Pilih berkas PDF / Word (.docx) atau tempel teks soal terlebih dahulu.', 'error');
      return;
    }
    setIsExtracting(true);
    try {
      let payload: Record<string, string> = {
        defaultSubject: importDefaultSubject,
      };
      if (importFile) {
        const base64Data = await readFileAsBase64(importFile);
        payload = {
          ...payload,
          fileName: importFile.name,
          mimeType: importFile.type || 'application/octet-stream',
          base64Data,
        };
      } else {
        payload = {
          ...payload,
          rawText: rawPasteText,
        };
      }

      const res = await fetch('/api/import-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal mengekstrak soal.');
      }

      const drafts: ImportedQuestionDraft[] = (data.questions || []).map(
        (q: Partial<ImportedQuestionDraft>, idx: number) => {
          const type: QuestionType =
            q.questionType === 'true_false' || q.questionType === 'mcma' ? q.questionType : 'pg';
          const opts = Array.isArray(q.options) && q.options.length >= 2
            ? q.options.map(String)
            : ['Pilihan A', 'Pilihan B', 'Pilihan C', 'Pilihan D'];
          const maxIdx = opts.length - 1;
          const cIdx = Math.max(0, Math.min(maxIdx, Number(q.correctIndex || 0)));
          const cIndices =
            type === 'mcma'
              ? Array.isArray(q.correctIndices) && q.correctIndices.length > 0
                ? Array.from(new Set(q.correctIndices.filter((i) => i >= 0 && i <= maxIdx))).sort(
                    (a, b) => a - b
                  )
                : [cIdx]
              : undefined;
          const cBools =
            type === 'true_false'
              ? opts.map((_, i) => Boolean(q.correctBooleans?.[i]))
              : undefined;
          return {
            tempId: `draft_${Date.now()}_${idx}`,
            questionType: type,
            stimulus: typeof q.stimulus === 'string' && q.stimulus.trim() ? q.stimulus.trim() : undefined,
            prompt: String(q.prompt || ''),
            options: opts,
            correctIndex: cIdx,
            correctIndices: cIndices,
            correctBooleans: cBools,
            explanation: String(q.explanation || ''),
            difficulty: (q.difficulty as DifficultyLevel) || 'Sedang',
            subject: String(q.subject || importDefaultSubject),
          };
        }
      );

      setExtractedDrafts(drafts);
      setImportFilterType('all');
      setOpenStimulusDraftIds({});
      if (data.suggestedTitle) setImportPacketTitle(data.suggestedTitle);
      if (SUBJECTS.includes(data.suggestedSubject)) {
        setImportPacketSubject(data.suggestedSubject);
      }

      const pgCount = drafts.filter((d) => d.questionType === 'pg').length;
      const tfCount = drafts.filter((d) => d.questionType === 'true_false').length;
      const mcmaCount = drafts.filter((d) => d.questionType === 'mcma').length;
      const stimCount = drafts.filter((d) => Boolean(d.stimulus?.trim())).length;
      const parts: string[] = [];
      if (pgCount > 0) parts.push(`${pgCount} PG`);
      if (tfCount > 0) parts.push(`${tfCount} Benar/Salah`);
      if (mcmaCount > 0) parts.push(`${mcmaCount} MCMA`);
      if (stimCount > 0) parts.push(`${stimCount} soal cerita/ilustrasi`);

      onNotify(
        `${drafts.length} soal berhasil dipisahkan (${parts.join(', ') || 'siap diperiksa'})!`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengekstrak berkas.';
      onNotify(msg, 'error');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveImportedQuestions = async () => {
    if (extractedDrafts.length === 0) return;
    setIsSavingImport(true);
    try {
      const mappedQuestions = extractedDrafts.map((d) => ({
        questionType: d.questionType,
        stimulus: d.stimulus?.trim() || undefined,
        prompt: d.prompt,
        options: d.options,
        correctIndex: d.questionType === 'mcma' ? (d.correctIndices?.[0] ?? 0) : d.correctIndex,
        correctIndices: d.questionType === 'mcma' ? d.correctIndices : undefined,
        correctBooleans: d.questionType === 'true_false' ? d.correctBooleans : undefined,
        explanation: d.explanation,
        difficulty: d.difficulty,
        subject: d.subject,
      }));

      if (importTargetMode === 'new') {
        const title = importPacketTitle.trim() || 'Paket Impor TKA SD';
        await createPacketWithQuestions(
          {
            title,
            subject: importPacketSubject,
            gradeLevel: importPacketGrade,
            description: `Diimpor dari ${importFile ? importFile.name : 'dokumen soal'} (${extractedDrafts.length} soal).`,
            durationMinutes: importPacketDuration,
            status: importPacketStatus,
            createdBy: uid,
          },
          mappedQuestions,
          uid
        );
      } else {
        const target = cloudPackets.find((p) => p.id === importTargetPacketId);
        if (!target) {
          onNotify('Pilih paket tujuan terlebih dahulu.', 'error');
          setIsSavingImport(false);
          return;
        }
        let nextOrder = target.questionCount + 1;
        for (const qItem of mappedQuestions) {
          await addQuestionToPacket(
            { ...target, questionCount: nextOrder - 1 },
            qItem,
            nextOrder,
            uid
          );
          nextOrder += 1;
        }
      }

      await onRefreshData();
      setExtractedDrafts([]);
      setImportFile(null);
      setRawPasteText('');
      setActiveTab('packets');
      onNotify('Semua soal hasil impor berhasil disimpan ke bank soal!', 'success');
    } catch {
      onNotify('Gagal menyimpan soal impor ke Cloud.', 'error');
    } finally {
      setIsSavingImport(false);
    }
  };

  const loadAdminsList = async () => {
    try {
      const list = await fetchAdmins();
      setAdmins(list);
      setAdminsLoaded(true);
    } catch {
      onNotify('Gagal memuat daftar guru admin.', 'error');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUid = newAdminUid.trim();
    const cleanEmail = newAdminEmail.trim();
    const cleanName = newAdminName.trim();
    if (!cleanUid || !cleanEmail || !cleanName) return;
    if (!/^[a-zA-Z0-9_-]{4,128}$/.test(cleanUid)) {
      onNotify(
        'Format Firebase UID tidak valid. Pastikan hanya menyalin huruf, angka, "_" atau "-" tanpa spasi.',
        'error'
      );
      return;
    }
    try {
      await addAdminRecord(cleanUid, cleanEmail, cleanName);
      setNewAdminUid('');
      setNewAdminEmail('');
      setNewAdminName('');
      await loadAdminsList();
      onNotify('Guru admin baru berhasil ditambahkan.', 'success');
    } catch {
      onNotify('Gagal menambahkan guru admin. Periksa format UID.', 'error');
    }
  };

  const handleRemoveAdmin = async (adm: AdminRecord) => {
    if (!isSuperAdmin) {
      onNotify(
        'Hanya admin utama (kkgptoroh@gmail.com) yang memiliki wewenang mencabut akses admin.',
        'error'
      );
      return;
    }
    if (adm.uid === uid || isSuperAdminEmail(adm.email)) {
      onNotify('Akun admin utama tidak dapat dicabut aksesnya.', 'error');
      return;
    }
    setRemovingAdminUid(adm.uid);
    try {
      await removeAdminRecord(adm.uid);
      setAdmins((prev) => prev.filter((item) => item.uid !== adm.uid));
      await loadAdminsList();
      onNotify(`Akses admin "${adm.name}" berhasil dicabut.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('permission')) {
        onNotify(
          'Izin ditolak oleh Firestore. Pastikan email akun Anda terverifikasi dan terdaftar sebagai admin.',
          'error'
        );
      } else {
        onNotify('Gagal mencabut akses guru admin. Periksa koneksi internet Anda.', 'error');
      }
    } finally {
      setRemovingAdminUid(null);
    }
  };

  const handleDownloadCSV = () => {
    const header = ['Nama Siswa', 'Kelas', 'Paket Ujian', 'Mata Pelajaran', 'Mode', 'Benar', 'Total Soal', 'Skor', 'Waktu (detik)', 'Tanggal'];
    const rows = allAttempts.map((a) => [
      `"${a.studentName.replace(/"/g, '""')}"`,
      `"${a.className.replace(/"/g, '""')}"`,
      `"${a.packetTitle.replace(/"/g, '""')}"`,
      `"${a.subject}"`,
      a.mode,
      a.correctCount,
      a.totalQuestions,
      a.score,
      a.durationSeconds,
      `"${new Date(a.createdAtMs).toLocaleString('id-ID')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-nilai-tka-sd-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredAttempts = useMemo(() => {
    const q = searchAttempt.trim().toLowerCase();
    if (!q) return allAttempts;
    return allAttempts.filter(
      (a) =>
        a.studentName.toLowerCase().includes(q) ||
        a.className.toLowerCase().includes(q) ||
        a.packetTitle.toLowerCase().includes(q)
    );
  }, [allAttempts, searchAttempt]);

  const liveStats = useMemo(() => {
    let active = 0;
    let stale = 0;
    let finished = 0;
    let exited = 0;
    liveSessions.forEach((s) => {
      if (s.status === 'finished') finished += 1;
      else if (s.status === 'exited') exited += 1;
      else if (nowMs - s.updatedAtMs > LIVE_STALE_MS) stale += 1;
      else active += 1;
    });
    return { active, stale, finished, exited, total: liveSessions.length };
  }, [liveSessions, nowMs]);

  const filteredLiveSessions = useMemo(() => {
    const q = liveSearch.trim().toLowerCase();
    return liveSessions.filter((s) => {
      const isStale = s.status === 'working' && nowMs - s.updatedAtMs > LIVE_STALE_MS;
      const isActive = s.status === 'working' && !isStale;
      if (liveStatusFilter === 'active' && !isActive) return false;
      if (liveStatusFilter === 'stale' && !isStale) return false;
      if (liveStatusFilter === 'finished' && s.status !== 'finished') return false;
      if (liveStatusFilter === 'exited' && s.status !== 'exited') return false;

      if (!q) return true;
      return (
        s.studentName.toLowerCase().includes(q) ||
        s.className.toLowerCase().includes(q) ||
        s.packetTitle.toLowerCase().includes(q)
      );
    });
  }, [liveSearch, liveSessions, liveStatusFilter, nowMs]);

  const handleClearFinishedSessions = async () => {
    const finishedIds = liveSessions
      .filter((s) => s.status === 'finished' || s.status === 'exited')
      .map((s) => s.userId);
    if (finishedIds.length === 0) return;
    setClearingMonitor(true);
    try {
      await clearFinishedLiveSessions(finishedIds);
      onNotify(`${finishedIds.length} sesi selesai/keluar dibersihkan dari pantauan.`, 'success');
    } catch {
      onNotify('Gagal membersihkan daftar sesi.', 'error');
    } finally {
      setClearingMonitor(false);
    }
  };

  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      onNotify('Nama lengkap admin tidak boleh kosong.', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await upsertAdminProfile(uid, userEmail, {
        name: profileName,
        roleTitle: profileRoleTitle,
        schoolName: profileSchoolName,
        nip: profileNip,
      });
      await upsertUserProfile({
        uid,
        displayName: updated.name,
        className: updated.roleTitle || 'Guru Admin',
        schoolName: updated.schoolName,
      });
      onAdminProfileUpdated(updated);
      if (adminsLoaded) {
        await loadAdminsList();
      }
      onNotify('Profil admin berhasil disimpan ke Cloud.', 'success');
    } catch {
      onNotify('Gagal menyimpan profil admin.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              Panel Guru &amp; Pengelola Materi
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {adminProfile?.name ? (
                <>
                  Masuk sebagai <strong className="text-slate-900">{adminProfile.name}</strong>
                  {adminProfile.roleTitle ? ` · ${adminProfile.roleTitle}` : ''}
                  {adminProfile.schoolName ? ` · ${adminProfile.schoolName}` : ''}
                </>
              ) : (
                'Kelola paket soal TKA SD, pantau siswa ujian secara langsung, dan atur profil guru.'
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="inline-flex min-h-[40px] items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 sm:self-auto"
          >
            <UserCog className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <span>Edit Profil Admin</span>
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('packets')}
            className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
              activeTab === 'packets'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Paket &amp; Bank Soal
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
              activeTab === 'import'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Impor PDF &amp; Word
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('monitor')}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
              activeTab === 'monitor'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Radio
              className={`h-3.5 w-3.5 ${
                liveStats.active > 0 ? 'text-emerald-600' : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>Pantau Ujian</span>
            {liveStats.active > 0 && (
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-800">
                {liveStats.active}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('results');
              if (!adminsLoaded) loadAdminsList();
            }}
            className={`min-h-[40px] rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
              activeTab === 'results'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rekap Nilai &amp; Guru
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
              activeTab === 'profile'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Profil Admin</span>
          </button>
        </div>
      </div>

      {/* TAB 1: PACKETS & QUESTION MANAGER */}
      {activeTab === 'packets' && (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowNewPacketForm((v) => !v)}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Buat Paket Baru</span>
              </button>
              <button
                type="button"
                onClick={handleSeedStarters}
                disabled={isSeeding}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <BookPlus className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>
                  {isSeeding ? 'Menyinkronkan...' : 'Muat Paket Bawaan ke Cloud'}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <FileUp className="h-4 w-4" aria-hidden="true" />
              <span>Impor Soal dari PDF / Word</span>
            </button>
          </div>

          {showNewPacketForm && (
            <form
              onSubmit={handleCreatePacket}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Buat Paket Ujian TKA SD Baru
                </h2>
                <button
                  type="button"
                  onClick={() => setShowNewPacketForm(false)}
                  aria-label="Tutup formulir"
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Judul Paket Ujian
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Contoh: Tryout TKA Matematika Kelas 6"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mata Pelajaran
                  </label>
                  <select
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value as SubjectType)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Tingkat Kelas
                  </label>
                  <select
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value as GradeLevel)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Durasi Ujian (Menit)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={newDuration}
                    onChange={(e) => setNewDuration(Number(e.target.value) || 15)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Status Publikasi
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as PacketStatus)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  >
                    <option value="published">Diterbitkan (Terlihat Siswa)</option>
                    <option value="draft">Draft (Disimpan Guru)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Deskripsi Singkat
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Materi yang diujikan pada paket ini..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={savingPacket}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  <span>{savingPacket ? 'Menyimpan...' : 'Simpan Paket'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Packet List */}
            <div className="space-y-3 lg:col-span-5">
              <h2 className="font-display text-base font-bold text-slate-900">
                Daftar Paket di Cloud ({cloudPackets.length})
              </h2>

              {cloudPackets.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                  <FolderOpen className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="mt-2 font-medium text-slate-800">
                    Belum ada paket ujian di Cloud.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Klik &ldquo;Muat Paket Bawaan ke Cloud&rdquo;, buat paket baru, atau impor dari PDF/Word.
                  </p>
                </div>
              ) : (
                cloudPackets.map((pkt) => {
                  const isSelected = pkt.id === selectedPacketId;
                  return (
                    <div
                      key={pkt.id}
                      className={`rounded-2xl border bg-white p-4 transition-colors ${
                        isSelected
                          ? 'border-blue-600 ring-1 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">
                            {pkt.subject} · {pkt.gradeLevel} ·{' '}
                            <span className="font-mono tabular-nums">{pkt.questionCount} soal</span> ·{' '}
                            <span className="font-mono tabular-nums">{pkt.durationMinutes} mnt</span>
                          </p>
                          <h3 className="mt-1 font-display text-base font-bold text-slate-900">
                            {pkt.title}
                          </h3>
                        </div>
                        <span
                          className={`shrink-0 text-xs font-semibold ${
                            pkt.status === 'published' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {pkt.status === 'published' ? 'Terbit' : 'Draft'}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        <button
                          type="button"
                          onClick={() => loadQuestionsForPacket(pkt)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Kelola Soal</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePacketStatus(pkt)}
                          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{pkt.status === 'published' ? 'Jadikan Draft' : 'Terbitkan'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePacket(pkt)}
                          aria-label={`Hapus paket ${pkt.title}`}
                          className="ml-auto inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Packet Questions Editor */}
            <div className="lg:col-span-7">
              {!selectedPacket ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                  Pilih salah satu paket di sebelah kiri dan klik <strong>Kelola Soal</strong> untuk menambah atau menyunting pertanyaan.
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {editingQuestionId ? 'Sunting Soal' : `Tambah Soal ke: ${selectedPacket.title}`}
                    </h3>

                    <form onSubmit={handleSaveManualQuestion} className="mt-4 space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Jenis Soal
                        </label>
                        <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {(
                            [
                              { id: 'pg', label: 'Pilihan Ganda (PG)' },
                              { id: 'true_false', label: 'PG Kompleks · Benar/Salah' },
                              { id: 'mcma', label: 'PG Kompleks · MCMA' },
                            ] as const
                          ).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => handleChangeManualType(t.id)}
                              className={`min-h-[40px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                                qType === t.id
                                  ? 'border-blue-600 bg-blue-50 text-blue-800'
                                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Teks Bacaan / Soal Cerita / Deskripsi Ilustrasi (Opsional)
                        </label>
                        <textarea
                          rows={2}
                          value={qStimulus}
                          onChange={(e) => setQStimulus(e.target.value)}
                          placeholder="Jika soal memiliki bacaan cerita, tabel, atau ilustrasi khusus, tulis di sini agar tampil terpisah di atas pertanyaan..."
                          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-slate-50/70 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:bg-white focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Pertanyaan Soal
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={qPrompt}
                          onChange={(e) => setQPrompt(e.target.value)}
                          placeholder="Tulis inti pertanyaan soal di sini..."
                          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      {qType === 'true_false' ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-700">
                              Daftar Pernyataan &amp; Kunci (Benar / Salah)
                            </label>
                            {qOpts.length < 6 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setQOpts([...qOpts, '']);
                                  setQCorrectBooleans([...qCorrectBooleans, true]);
                                }}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Tambah Pernyataan</span>
                              </button>
                            )}
                          </div>
                          {qOpts.map((optText, idx) => {
                            const isTrue = Boolean(qCorrectBooleans[idx]);
                            return (
                              <div key={idx} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                <span className="w-6 shrink-0 font-mono text-xs font-bold text-slate-500">
                                  {idx + 1}.
                                </span>
                                <input
                                  type="text"
                                  required
                                  value={optText}
                                  onChange={(e) => {
                                    const next = [...qOpts];
                                    next[idx] = e.target.value;
                                    setQOpts(next);
                                  }}
                                  placeholder={`Isi pernyataan ke-${idx + 1}...`}
                                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                                />
                                <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...qCorrectBooleans];
                                      next[idx] = true;
                                      setQCorrectBooleans(next);
                                    }}
                                    className={`px-2.5 py-1.5 text-xs font-bold ${
                                      isTrue
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    Benar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = [...qCorrectBooleans];
                                      next[idx] = false;
                                      setQCorrectBooleans(next);
                                    }}
                                    className={`border-l border-slate-200 px-2.5 py-1.5 text-xs font-bold ${
                                      !isTrue
                                        ? 'bg-rose-600 text-white'
                                        : 'bg-white text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    Salah
                                  </button>
                                </div>
                                {qOpts.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQOpts(qOpts.filter((_, i) => i !== idx));
                                      setQCorrectBooleans(qCorrectBooleans.filter((_, i) => i !== idx));
                                    }}
                                    aria-label="Hapus pernyataan"
                                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : qType === 'mcma' ? (
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-700">
                              Pilihan Jawaban MCMA (Klik huruf untuk centang lebih dari satu kunci)
                            </label>
                            {qOpts.length < 6 && (
                              <button
                                type="button"
                                onClick={() => setQOpts([...qOpts, ''])}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Tambah Pilihan</span>
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            {qOpts.map((optText, idx) => {
                              const label = String.fromCharCode(65 + idx);
                              const isChecked = qCorrectIndices.includes(idx);
                              return (
                                <div key={idx} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQCorrectIndices((prev) => {
                                        if (prev.includes(idx)) {
                                          const filtered = prev.filter((i) => i !== idx);
                                          return filtered.length > 0 ? filtered : prev;
                                        }
                                        return [...prev, idx].sort((a, b) => a - b);
                                      });
                                    }}
                                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-xs font-bold transition-colors ${
                                      isChecked
                                        ? 'bg-emerald-600 text-white'
                                        : 'border border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                                    }`}
                                    title="Klik untuk menandai kunci jawaban benar"
                                  >
                                    {isChecked ? <Check className="h-4 w-4" /> : label}
                                  </button>
                                  <input
                                    type="text"
                                    required
                                    value={optText}
                                    onChange={(e) => {
                                      const next = [...qOpts];
                                      next[idx] = e.target.value;
                                      setQOpts(next);
                                    }}
                                    placeholder={`Pilihan ${label}`}
                                    className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                                      isChecked
                                        ? 'border-emerald-500 bg-emerald-50/40'
                                        : 'border-slate-300 focus:border-blue-600'
                                    }`}
                                  />
                                  {qOpts.length > 3 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextOpts = qOpts.filter((_, i) => i !== idx);
                                        setQOpts(nextOpts);
                                        setQCorrectIndices((prev) => {
                                          const adjusted = prev
                                            .filter((i) => i !== idx)
                                            .map((i) => (i > idx ? i - 1 : i));
                                          return adjusted.length > 0 ? adjusted : [0];
                                        });
                                      }}
                                      aria-label={`Hapus pilihan ${label}`}
                                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {qOpts.map((optText, idx) => {
                            const label = String.fromCharCode(65 + idx);
                            return (
                              <div key={label}>
                                <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                                  <span>Pilihan {label}</span>
                                  <button
                                    type="button"
                                    onClick={() => setQCorrect(idx)}
                                    className={`text-xs font-semibold ${
                                      qCorrect === idx
                                        ? 'text-emerald-700'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    {qCorrect === idx ? 'Kunci Jawaban' : 'Jadikan Kunci'}
                                  </button>
                                </label>
                                <input
                                  type="text"
                                  required
                                  value={optText}
                                  onChange={(e) => {
                                    const next = [...qOpts];
                                    next[idx] = e.target.value;
                                    setQOpts(next);
                                  }}
                                  placeholder={`Isi jawaban ${label}`}
                                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none ${
                                    qCorrect === idx
                                      ? 'border-emerald-500 bg-emerald-50/40'
                                      : 'border-slate-300 focus:border-blue-600'
                                  }`}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Tingkat Kesulitan
                          </label>
                          <select
                            value={qDifficulty}
                            onChange={(e) => setQDifficulty(e.target.value as DifficultyLevel)}
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            {DIFFICULTIES.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Mata Pelajaran Soal
                          </label>
                          <input
                            type="text"
                            value={qSubject}
                            onChange={(e) => setQSubject(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          Pembahasan Lengkap (Ramah Anak SD)
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={qExplanation}
                          onChange={(e) => setQExplanation(e.target.value)}
                          placeholder="Jelaskan langkah penyelesaian agar siswa paham mengapa jawaban tersebut benar..."
                          className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {editingQuestionId && (
                          <button
                            type="button"
                            onClick={() => resetQuestionForm(selectedPacket.subject)}
                            className="min-h-[42px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Batal Edit
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={savingQuestion}
                          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Save className="h-4 w-4" aria-hidden="true" />
                          <span>
                            {savingQuestion
                              ? 'Menyimpan...'
                              : editingQuestionId
                              ? 'Perbarui Soal'
                              : 'Tambah Soal'}
                          </span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* List of existing questions in packet */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                    <h4 className="font-display text-base font-bold text-slate-900">
                      Daftar Soal ({packetQuestions.length})
                    </h4>

                    {loadingQuestions ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Memuat daftar soal...</span>
                      </div>
                    ) : packetQuestions.length === 0 ? (
                      <p className="py-6 text-sm text-slate-500">
                        Belum ada soal di paket ini. Tambahkan melalui formulir di atas atau impor dari PDF/Word.
                      </p>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {packetQuestions.map((q, idx) => {
                          const qTypeLabel = getQuestionTypeShortLabel(getQuestionType(q));
                          return (
                            <div
                              key={q.id}
                              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
                                  <span>Nomor {idx + 1}</span>
                                  <span>·</span>
                                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-bold text-blue-800">
                                    {qTypeLabel}
                                  </span>
                                  {q.stimulus && (
                                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">
                                      Cerita/Ilustrasi
                                    </span>
                                  )}
                                  <span>· {q.difficulty}</span>
                                  <span>· Kunci: {formatCorrectAnswerLabel(q)}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleEditQuestionClick(q)}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteQuestion(q.id)}
                                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </div>
                              {q.stimulus && (
                                <p className="mt-2 line-clamp-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
                                  <strong className="text-slate-700">Bacaan/Ilustrasi:</strong>{' '}
                                  {q.stimulus}
                                </p>
                              )}
                              <p className="mt-1.5 whitespace-pre-line text-sm font-medium text-slate-900">
                                {q.prompt}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PDF & WORD IMPORTER */}
      {activeTab === 'import' && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Impor Soal Otomatis dari PDF, Word (.docx), atau Teks
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Unggah dokumen soal ujian Anda. Sistem akan otomatis memisahkan{' '}
              <strong className="text-slate-800">Pilihan Ganda (PG)</strong>,{' '}
              <strong className="text-slate-800">PG Kompleks (Benar/Salah)</strong>,{' '}
              <strong className="text-slate-800">PG Kompleks (MCMA)</strong>, serta melampirkan{' '}
              <strong className="text-slate-800">Soal Cerita / Teks / Ilustrasi</strong> ke setiap nomor terkait lengkap dengan kunci jawaban dan pembahasan anak SD.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  1. Unggah Berkas PDF atau Word (.docx)
                </label>
                <label className="mt-2 flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40">
                  <Upload className="h-8 w-8 text-blue-600" aria-hidden="true" />
                  <span className="mt-2 text-sm font-semibold text-slate-800">
                    {importFile ? importFile.name : 'Klik untuk pilih berkas PDF atau Word (.docx)'}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    Mendukung .pdf, .docx, dan .txt (maksimal 20 MB)
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setImportFile(f);
                      if (f) setRawPasteText('');
                    }}
                  />
                </label>
                {importFile && (
                  <button
                    type="button"
                    onClick={() => setImportFile(null)}
                    className="mt-2 text-xs font-semibold text-rose-600 hover:underline"
                  >
                    Hapus berkas terpilih
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Atau Tempel Teks Soal Langsung (Salin dari Word/PDF)
                </label>
                <textarea
                  rows={6}
                  value={rawPasteText}
                  onChange={(e) => {
                    setRawPasteText(e.target.value);
                    if (e.target.value) setImportFile(null);
                  }}
                  placeholder="Contoh:&#10;1. Ibu membeli 3 kg apel seharga Rp45.000. Harga 1 kg apel adalah...&#10;A. Rp12.000&#10;B. Rp15.000&#10;C. Rp18.000&#10;D. Rp20.000"
                  className="mt-2 w-full rounded-2xl border border-slate-300 p-3.5 text-sm focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-5">
              <div className="w-full sm:w-64">
                <label className="block text-xs font-semibold text-slate-700">
                  Mata Pelajaran Default
                </label>
                <select
                  value={importDefaultSubject}
                  onChange={(e) => setImportDefaultSubject(e.target.value as SubjectType)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleExtractQuestions}
                disabled={isExtracting}
                className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Sedang Membaca & Menyusun Soal...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    <span>Ekstrak Soal Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Preview & Edit Extracted Questions */}
          {extractedDrafts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Pratinjau & Sunting Soal Hasil Impor ({extractedDrafts.length} Soal)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Periksa kunci jawaban dan pembahasan sebelum disimpan ke Bank Soal Cloud.
                  </p>
                </div>

                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setImportTargetMode('new')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      importTargetMode === 'new'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Buat Paket Baru
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportTargetMode('existing')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      importTargetMode === 'existing'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Gabung ke Paket Ada
                  </button>
                </div>
              </div>

              {importTargetMode === 'new' ? (
                <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">Judul Paket</label>
                    <input
                      type="text"
                      value={importPacketTitle}
                      onChange={(e) => setImportPacketTitle(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Mapel</label>
                    <select
                      value={importPacketSubject}
                      onChange={(e) => setImportPacketSubject(e.target.value as SubjectType)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      {SUBJECTS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Kelas & Waktu</label>
                    <div className="mt-1 flex gap-2">
                      <select
                        value={importPacketGrade}
                        onChange={(e) => setImportPacketGrade(e.target.value as GradeLevel)}
                        className="w-1/2 rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs"
                      >
                        {GRADES.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={importPacketDuration}
                        onChange={(e) => setImportPacketDuration(Number(e.target.value) || 20)}
                        className="w-1/2 rounded-xl border border-slate-300 bg-white px-2 py-2 font-mono text-xs"
                        aria-label="Durasi dalam menit"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Status</label>
                    <select
                      value={importPacketStatus}
                      onChange={(e) => setImportPacketStatus(e.target.value as PacketStatus)}
                      className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="published">Diterbitkan</option>
                      <option value="draft">Draft</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block text-xs font-semibold text-slate-700">
                    Pilih Paket Tujuan di Cloud
                  </label>
                  <select
                    value={importTargetPacketId}
                    onChange={(e) => setImportTargetPacketId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
                  >
                    <option value="">-- Pilih Paket --</option>
                    {cloudPackets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.questionCount} soal)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filter & Summary Type Chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(
                  [
                    { id: 'all', label: `Semua (${extractedDrafts.length})` },
                    {
                      id: 'pg',
                      label: `Pilihan Ganda (${extractedDrafts.filter((d) => d.questionType === 'pg').length})`,
                    },
                    {
                      id: 'true_false',
                      label: `Benar/Salah (${extractedDrafts.filter((d) => d.questionType === 'true_false').length})`,
                    },
                    {
                      id: 'mcma',
                      label: `MCMA (${extractedDrafts.filter((d) => d.questionType === 'mcma').length})`,
                    },
                    {
                      id: 'stimulus',
                      label: `Cerita / Ilustrasi (${extractedDrafts.filter((d) => Boolean(d.stimulus?.trim())).length})`,
                    },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setImportFilterType(chip.id)}
                    className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      importFilterType === chip.id
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 space-y-4">
                {extractedDrafts
                  .map((draft, origIdx) => ({ draft, origIdx }))
                  .filter(({ draft }) => {
                    if (importFilterType === 'all') return true;
                    if (importFilterType === 'stimulus') return Boolean(draft.stimulus?.trim());
                    return draft.questionType === importFilterType;
                  })
                  .map(({ draft, origIdx }) => {
                    const showStimulusBox =
                      Boolean(draft.stimulus?.trim()) || Boolean(openStimulusDraftIds[draft.tempId]);

                    const switchDraftType = (nextType: QuestionType) => {
                      setExtractedDrafts((prev) =>
                        prev.map((item) => {
                          if (item.tempId !== draft.tempId) return item;
                          let nextOpts = [...item.options];
                          if (nextType === 'pg') {
                            nextOpts = nextOpts.slice(0, 4);
                            while (nextOpts.length < 4) nextOpts.push('');
                            return {
                              ...item,
                              questionType: 'pg',
                              options: nextOpts,
                              correctIndex: Math.max(0, Math.min(nextOpts.length - 1, item.correctIndex)),
                            };
                          }
                          if (nextType === 'mcma') {
                            nextOpts = nextOpts.slice(0, 6);
                            while (nextOpts.length < 3) nextOpts.push('');
                            const baseIndices =
                              item.correctIndices && item.correctIndices.length > 0
                                ? item.correctIndices.filter((i) => i < nextOpts.length)
                                : [Math.max(0, Math.min(nextOpts.length - 1, item.correctIndex))];
                            return {
                              ...item,
                              questionType: 'mcma',
                              options: nextOpts,
                              correctIndices: baseIndices.length > 0 ? baseIndices : [0],
                            };
                          }
                          nextOpts = nextOpts.slice(0, 6);
                          while (nextOpts.length < 2) nextOpts.push('');
                          return {
                            ...item,
                            questionType: 'true_false',
                            options: nextOpts,
                            correctBooleans: nextOpts.map((_, i) =>
                              Boolean(item.correctBooleans?.[i] ?? i === 0)
                            ),
                          };
                        })
                      );
                    };

                    return (
                      <div
                        key={draft.tempId}
                        className="rounded-xl border border-slate-200 bg-white p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold text-blue-700">
                              Soal #{origIdx + 1}
                            </span>
                            <select
                              value={draft.questionType}
                              onChange={(e) => switchDraftType(e.target.value as QuestionType)}
                              aria-label={`Jenis soal ${origIdx + 1}`}
                              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800"
                            >
                              <option value="pg">Pilihan Ganda (PG)</option>
                              <option value="true_false">PG Kompleks (Benar/Salah)</option>
                              <option value="mcma">PG Kompleks (MCMA)</option>
                            </select>
                            {!showStimulusBox && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenStimulusDraftIds((prev) => ({
                                    ...prev,
                                    [draft.tempId]: true,
                                  }))
                                }
                                className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
                              >
                                <BookOpen className="h-3 w-3" aria-hidden="true" />
                                <span>+ Cerita / Ilustrasi</span>
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setExtractedDrafts((prev) =>
                                prev.filter((item) => item.tempId !== draft.tempId)
                              )
                            }
                            className="text-xs font-semibold text-rose-600 hover:underline"
                          >
                            Hapus Soal Ini
                          </button>
                        </div>

                        {showStimulusBox && (
                          <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-800">
                                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                Teks Bacaan / Soal Cerita / Deskripsi Ilustrasi
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setExtractedDrafts((prev) =>
                                    prev.map((item) =>
                                      item.tempId === draft.tempId
                                        ? { ...item, stimulus: undefined }
                                        : item
                                    )
                                  );
                                  setOpenStimulusDraftIds((prev) => ({
                                    ...prev,
                                    [draft.tempId]: false,
                                  }));
                                }}
                                className="text-[11px] font-semibold text-slate-500 hover:text-rose-600"
                              >
                                Hapus Cerita/Ilustrasi
                              </button>
                            </div>
                            <textarea
                              rows={2}
                              value={draft.stimulus || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setExtractedDrafts((prev) =>
                                  prev.map((item) =>
                                    item.tempId === draft.tempId ? { ...item, stimulus: val } : item
                                  )
                                );
                              }}
                              placeholder="Tulis teks bacaan, cerita, atau deskripsi ilustrasi/tabel..."
                              className="mt-1.5 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs sm:text-sm focus:border-blue-600 focus:outline-none"
                            />
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={draft.prompt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setExtractedDrafts((prev) =>
                              prev.map((item) =>
                                item.tempId === draft.tempId ? { ...item, prompt: val } : item
                              )
                            );
                          }}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        />

                        {draft.questionType === 'true_false' ? (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-600">
                                Pernyataan Benar / Salah
                              </span>
                              {draft.options.length < 6 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExtractedDrafts((prev) =>
                                      prev.map((item) =>
                                        item.tempId === draft.tempId
                                          ? {
                                              ...item,
                                              options: [...item.options, ''],
                                              correctBooleans: [
                                                ...(item.correctBooleans || []),
                                                true,
                                              ],
                                            }
                                          : item
                                      )
                                    )
                                  }
                                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                                >
                                  + Tambah Pernyataan
                                </button>
                              )}
                            </div>
                            {draft.options.map((optVal, optIdx) => {
                              const isTrue = Boolean(draft.correctBooleans?.[optIdx]);
                              return (
                                <div key={optIdx} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                                  <span className="w-5 shrink-0 font-mono text-xs font-bold text-slate-500">
                                    {optIdx + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    value={optVal}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setExtractedDrafts((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== draft.tempId) return item;
                                          const nextOpts = [...item.options];
                                          nextOpts[optIdx] = val;
                                          return { ...item, options: nextOpts };
                                        })
                                      );
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs sm:text-sm"
                                  />
                                  <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExtractedDrafts((prev) =>
                                          prev.map((item) => {
                                            if (item.tempId !== draft.tempId) return item;
                                            const nextBools = item.options.map((_, i) =>
                                              i === optIdx ? true : Boolean(item.correctBooleans?.[i])
                                            );
                                            return { ...item, correctBooleans: nextBools };
                                          })
                                        )
                                      }
                                      className={`px-2.5 py-1 text-[11px] font-bold ${
                                        isTrue ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600'
                                      }`}
                                    >
                                      Benar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExtractedDrafts((prev) =>
                                          prev.map((item) => {
                                            if (item.tempId !== draft.tempId) return item;
                                            const nextBools = item.options.map((_, i) =>
                                              i === optIdx ? false : Boolean(item.correctBooleans?.[i])
                                            );
                                            return { ...item, correctBooleans: nextBools };
                                          })
                                        )
                                      }
                                      className={`border-l border-slate-200 px-2.5 py-1 text-[11px] font-bold ${
                                        !isTrue ? 'bg-rose-600 text-white' : 'bg-white text-slate-600'
                                      }`}
                                    >
                                      Salah
                                    </button>
                                  </div>
                                  {draft.options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExtractedDrafts((prev) =>
                                          prev.map((item) =>
                                            item.tempId === draft.tempId
                                              ? {
                                                  ...item,
                                                  options: item.options.filter((_, i) => i !== optIdx),
                                                  correctBooleans: (item.correctBooleans || []).filter(
                                                    (_, i) => i !== optIdx
                                                  ),
                                                }
                                              : item
                                          )
                                        )
                                      }
                                      aria-label="Hapus pernyataan"
                                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : draft.questionType === 'mcma' ? (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-slate-600">
                                Pilihan MCMA (Klik huruf untuk centang lebih dari satu kunci benar)
                              </span>
                              {draft.options.length < 6 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExtractedDrafts((prev) =>
                                      prev.map((item) =>
                                        item.tempId === draft.tempId
                                          ? { ...item, options: [...item.options, ''] }
                                          : item
                                      )
                                    )
                                  }
                                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                                >
                                  + Tambah Pilihan
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {draft.options.map((optVal, optIdx) => {
                                const lbl = String.fromCharCode(65 + optIdx);
                                const isChecked = (draft.correctIndices || []).includes(optIdx);
                                return (
                                  <div key={lbl} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExtractedDrafts((prev) =>
                                          prev.map((item) => {
                                            if (item.tempId !== draft.tempId) return item;
                                            const curr = item.correctIndices || [item.correctIndex];
                                            const next = curr.includes(optIdx)
                                              ? curr.filter((i) => i !== optIdx)
                                              : [...curr, optIdx].sort((a, b) => a - b);
                                            return {
                                              ...item,
                                              correctIndices: next.length > 0 ? next : curr,
                                            };
                                          })
                                        )
                                      }
                                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold ${
                                        isChecked
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-slate-100 text-slate-700'
                                      }`}
                                      title="Klik untuk mencentang/menghapus kunci jawaban benar"
                                    >
                                      {isChecked ? <Check className="h-3.5 w-3.5" /> : lbl}
                                    </button>
                                    <input
                                      type="text"
                                      value={optVal}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setExtractedDrafts((prev) =>
                                          prev.map((item) => {
                                            if (item.tempId !== draft.tempId) return item;
                                            const nextOpts = [...item.options];
                                            nextOpts[optIdx] = val;
                                            return { ...item, options: nextOpts };
                                          })
                                        );
                                      }}
                                      className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs sm:text-sm"
                                    />
                                    {draft.options.length > 3 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExtractedDrafts((prev) =>
                                            prev.map((item) => {
                                              if (item.tempId !== draft.tempId) return item;
                                              const nextOpts = item.options.filter(
                                                (_, i) => i !== optIdx
                                              );
                                              const adjusted = (item.correctIndices || [])
                                                .filter((i) => i !== optIdx)
                                                .map((i) => (i > optIdx ? i - 1 : i));
                                              return {
                                                ...item,
                                                options: nextOpts,
                                                correctIndices:
                                                  adjusted.length > 0 ? adjusted : [0],
                                              };
                                            })
                                          )
                                        }
                                        aria-label={`Hapus pilihan ${lbl}`}
                                        className="rounded p-1 text-slate-400 hover:text-rose-600"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {draft.options.map((optVal, optIdx) => {
                              const lbl = String.fromCharCode(65 + optIdx);
                              return (
                                <div key={lbl} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExtractedDrafts((prev) =>
                                        prev.map((item) =>
                                          item.tempId === draft.tempId
                                            ? { ...item, correctIndex: optIdx }
                                            : item
                                        )
                                      )
                                    }
                                    className={`h-8 w-8 shrink-0 rounded-lg font-mono text-xs font-bold ${
                                      draft.correctIndex === optIdx
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                    title="Klik untuk menandai sebagai kunci jawaban"
                                  >
                                    {lbl}
                                  </button>
                                  <input
                                    type="text"
                                    value={optVal}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setExtractedDrafts((prev) =>
                                        prev.map((item) => {
                                          if (item.tempId !== draft.tempId) return item;
                                          const nextOpts = [...item.options];
                                          nextOpts[optIdx] = val;
                                          return { ...item, options: nextOpts };
                                        })
                                      );
                                    }}
                                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs sm:text-sm"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-3">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Pembahasan
                          </label>
                          <textarea
                            rows={2}
                            value={draft.explanation}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExtractedDrafts((prev) =>
                                prev.map((item) =>
                                  item.tempId === draft.tempId ? { ...item, explanation: val } : item
                                )
                              );
                            }}
                            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:text-sm"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setExtractedDrafts([])}
                  className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveImportedQuestions}
                  disabled={isSavingImport}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>
                    {isSavingImport
                      ? 'Menyimpan ke Cloud...'
                      : `Simpan ${extractedDrafts.length} Soal ke Bank Soal`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STUDENT RESULTS & ADMIN MANAGEMENT */}
      {activeTab === 'results' && (
        <div className="mt-6 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Rekap Nilai Seluruh Siswa ({filteredAttempts.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Data hasil ujian CAT siswa yang telah tersinkronisasi ke Cloud.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={searchAttempt}
                  onChange={(e) => setSearchAttempt(e.target.value)}
                  placeholder="Cari nama siswa atau paket..."
                  className="min-h-[40px] rounded-xl border border-slate-300 px-3.5 text-sm focus:border-blue-600 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleDownloadCSV}
                  disabled={allAttempts.length === 0}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  <span>Unduh Rekap CSV</span>
                </button>
              </div>
            </div>

            {filteredAttempts.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">
                <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                <p className="mt-2">Belum ada data nilai siswa yang cocok.</p>
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-3 pr-4">Siswa</th>
                      <th className="py-3 pr-4">Kelas</th>
                      <th className="py-3 pr-4">Paket Ujian</th>
                      <th className="py-3 pr-4">Benar</th>
                      <th className="py-3 pr-4">Skor</th>
                      <th className="py-3">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAttempts.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-4 font-semibold text-slate-900">{a.studentName}</td>
                        <td className="py-3 pr-4 text-slate-600">{a.className}</td>
                        <td className="py-3 pr-4 text-slate-700">{a.packetTitle}</td>
                        <td className="py-3 pr-4 font-mono tabular-nums text-slate-700">
                          {a.correctCount}/{a.totalQuestions}
                        </td>
                        <td className="py-3 pr-4 font-mono font-bold tabular-nums text-blue-700">
                          {a.score}
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          {new Date(a.createdAtMs).toLocaleDateString('id-ID')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Co-Teacher Admin Access */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="font-display text-lg font-bold text-slate-900">
                Akses Guru Pengelola (Admin)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Tambahkan UID guru rekan sejawat agar mereka dapat ikut mengelola bank soal. UID Anda:{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-800">
                {uid}
              </code>
              {!isSuperAdmin && (
                <span className="mt-1 block text-[11px] text-slate-500">
                  Catatan: Wewenang mencabut akses admin hanya dimiliki oleh admin utama (kkgptoroh@gmail.com).
                </span>
              )}
            </p>

            <form onSubmit={handleAddAdmin} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                type="text"
                required
                value={newAdminUid}
                onChange={(e) => setNewAdminUid(e.target.value)}
                placeholder="Firebase UID Guru"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                required
                value={newAdminEmail}
                onChange={(e) => setNewAdminEmail(e.target.value)}
                placeholder="Email Guru"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                required
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Nama Lengkap Guru"
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="min-h-[42px] rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Tambah Guru
              </button>
            </form>

            {admins.length > 0 && (
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {admins.map((adm) => {
                  const isTargetSuperAdmin = isSuperAdminEmail(adm.email);
                  const canRevoke = isSuperAdmin && adm.uid !== uid && !isTargetSuperAdmin;
                  return (
                    <div
                      key={adm.uid}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Users className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{adm.name}</p>
                          <p className="truncate text-xs text-slate-500">
                            {adm.email} · {adm.uid}
                          </p>
                        </div>
                      </div>
                      {adm.uid === uid ? (
                        <span className="shrink-0 rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                          Akun Anda Saat Ini
                        </span>
                      ) : isTargetSuperAdmin ? (
                        <span className="shrink-0 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          Admin Utama
                        </span>
                      ) : canRevoke ? (
                        <button
                          type="button"
                          disabled={removingAdminUid === adm.uid}
                          onClick={() => handleRemoveAdmin(adm)}
                          className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          {removingAdminUid === adm.uid ? 'Mencabut...' : 'Cabut Akses'}
                        </button>
                      ) : (
                        <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          Guru Admin
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: REAL-TIME LIVE EXAM MONITOR */}
      {activeTab === 'monitor' && (
        <div className="mt-6 space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>Aktif Mengerjakan</span>
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
              </div>
              <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-emerald-950">
                {liveStats.active}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                <span>Terputus / Idle</span>
                <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-amber-950">
                {liveStats.stale}
              </p>
            </div>
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
                <span>Selesai Ujian</span>
                <CheckCircle2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-blue-950">
                {liveStats.finished}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Total Terpantau</span>
                <MonitorCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-extrabold tabular-nums text-slate-900">
                {liveStats.total}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Pemantauan Klien Ujian Secara Langsung
                </h2>
                <p className="text-xs text-slate-500">
                  Memantau progres siswa yang masuk dengan akun Google dan sedang mengerjakan soal secara online.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={liveSearch}
                  onChange={(e) => setLiveSearch(e.target.value)}
                  placeholder="Cari nama siswa, kelas, paket..."
                  className="min-h-[40px] rounded-xl border border-slate-300 px-3.5 text-sm focus:border-blue-600 focus:outline-none"
                />
                {(liveStats.finished > 0 || liveStats.exited > 0) && (
                  <button
                    type="button"
                    onClick={handleClearFinishedSessions}
                    disabled={clearingMonitor}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                    <span>{clearingMonitor ? 'Membersihkan...' : 'Bersihkan Selesai'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Chips */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: `Semua (${liveStats.total})` },
                  { id: 'active', label: `Aktif (${liveStats.active})` },
                  { id: 'stale', label: `Terputus (${liveStats.stale})` },
                  { id: 'finished', label: `Selesai (${liveStats.finished})` },
                  { id: 'exited', label: `Keluar (${liveStats.exited})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLiveStatusFilter(f.id)}
                  className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                    liveStatusFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {!liveReady ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Menghubungkan pemantauan langsung...</span>
              </div>
            ) : filteredLiveSessions.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="mx-auto h-9 w-9 text-slate-300" aria-hidden="true" />
                <p className="mt-3 font-display text-base font-bold text-slate-800">
                  Belum ada siswa yang sedang dipantau
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Saat siswa yang login mengerjakan paket ujian atau latihan, progres mereka akan muncul di sini secara otomatis.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                {filteredLiveSessions.map((sess) => {
                  const diffMs = nowMs - sess.updatedAtMs;
                  const isStale = sess.status === 'working' && diffMs > LIVE_STALE_MS;
                  const isActive = sess.status === 'working' && !isStale;
                  const pct = Math.min(
                    100,
                    Math.round((sess.answeredCount / Math.max(1, sess.totalQuestions)) * 100)
                  );

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
                      Aktif Mengerjakan
                    </span>
                  );
                  if (isStale) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        Tidak Merespons
                      </span>
                    );
                  } else if (sess.status === 'finished') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Selesai Mengumpulkan
                      </span>
                    );
                  } else if (sess.status === 'exited') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        Keluar Sebelum Selesai
                      </span>
                    );
                  }

                  return (
                    <div
                      key={sess.userId}
                      className={`rounded-2xl border p-4 transition-colors ${
                        isActive
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : isStale
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate font-display text-base font-bold text-slate-900">
                              {sess.studentName}
                            </h3>
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              {sess.className || 'Tanpa Kelas'}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-600">
                            {sess.packetTitle} ·{' '}
                            {sess.mode === 'timed' ? 'Ujian Berwaktu' : 'Latihan'}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {statusBadge}
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await deleteLiveSession(sess.userId);
                                onNotify('Sesi pantauan dihapus.', 'success');
                              } catch {
                                onNotify('Gagal menghapus sesi pantauan.', 'error');
                              }
                            }}
                            aria-label={`Hapus pantauan ${sess.studentName}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-600">Progres Jawaban</span>
                          <span className="font-mono font-bold tabular-nums text-slate-900">
                            {sess.answeredCount}/{sess.totalQuestions} soal ({pct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              sess.status === 'finished'
                                ? 'bg-blue-600'
                                : isStale
                                ? 'bg-amber-500'
                                : 'bg-emerald-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      {/* Telemetry Strip */}
                      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-xs">
                        <div>
                          <p className="text-[11px] text-slate-500">Posisi Soal</p>
                          <p className="mt-0.5 font-mono font-bold tabular-nums text-slate-800">
                            #{sess.currentQuestionNumber}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">Ragu-ragu</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 font-mono font-bold tabular-nums text-amber-700">
                            <Flag className="h-3 w-3" aria-hidden="true" />
                            {sess.flaggedCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">
                            {sess.mode === 'timed' ? 'Sisa Waktu' : 'Durasi'}
                          </p>
                          <p className="mt-0.5 inline-flex items-center gap-1 font-mono font-bold tabular-nums text-slate-800">
                            <Clock className="h-3 w-3 text-blue-600" aria-hidden="true" />
                            {sess.mode === 'timed'
                              ? formatClock(sess.secondsLeft)
                              : formatClock(sess.elapsedSeconds)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
                        <span>Sinyal terakhir: {formatRelativeSeconds(diffMs)}</span>
                        <span>
                          Mulai: {new Date(sess.examStartedAtMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: EDIT ADMIN PROFILE */}
      {activeTab === 'profile' && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Profile Preview Card */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-3.5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 font-display text-xl font-extrabold text-white">
                  {(profileName || 'G').trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate font-display text-lg font-bold text-slate-900">
                    {profileName || 'Guru Admin'}
                  </h2>
                  <p className="truncate text-xs font-semibold text-blue-700">
                    {profileRoleTitle || 'Guru Pengelola TKA SD'}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  <span>{profileSchoolName || 'Sekolah belum diisi'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span className="truncate">{userEmail}</span>
                </div>
                {profileNip && (
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="font-mono">NIP/NUPTK: {profileNip}</span>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
                <p className="font-semibold text-slate-700">ID Admin (UID):</p>
                <code className="mt-1 block break-all font-mono text-slate-800">{uid}</code>
              </div>
            </div>
          </div>

          {/* Profile Edit Form */}
          <div className="lg:col-span-8">
            <form
              onSubmit={handleSaveAdminProfile}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7"
            >
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Edit Profil Admin &amp; Guru
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Perbarui identitas pengelola ujian Anda. Perubahan akan langsung tersimpan di Cloud Firestore.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Lengkap Guru / Admin <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={100}
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="Contoh: Ibu Siti Aminah, S.Pd."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Jabatan / Peran
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={profileRoleTitle}
                    onChange={(e) => setProfileRoleTitle(e.target.value)}
                    placeholder="Contoh: Guru Kelas 6 / Operator TKA"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    NIP / NUPTK (Opsional)
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={profileNip}
                    onChange={(e) => setProfileNip(e.target.value)}
                    placeholder="Contoh: 198504122010012018"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Sekolah
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={profileSchoolName}
                    onChange={(e) => setProfileSchoolName(e.target.value)}
                    placeholder="Contoh: SDN 1 Sukamaju"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Email Akun Google (Terverifikasi)
                  </label>
                  <input
                    type="email"
                    disabled
                    value={userEmail}
                    className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Email terikat dengan autentikasi Google Anda dan tidak dapat diubah secara manual.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Menyimpan Profil...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      <span>Simpan Profil Admin</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
