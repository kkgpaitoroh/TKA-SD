import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Clock,
  CloudOff,
  DownloadCloud,
  Edit2,
  HardDriveDownload,
  Home,
  LayoutGrid,
  LogIn,
  LogOut,
  Play,
  Shield,
  Timer,
  User as UserIcon,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AttemptReview } from './components/AttemptReview';
import { ExamRunner } from './components/ExamRunner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ScoreHistoryView } from './components/ScoreHistoryView';
import { STARTER_PACKETS } from './data/starterPackets';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  auth,
  googleProvider,
  isBootstrappedAdminEmail,
} from './lib/firebase';
import {
  checkIsAdmin,
  deleteCloudAttempt,
  ensureBootstrappedAdminDoc,
  fetchAdminProfile,
  fetchAttempts,
  fetchExamPackets,
  fetchQuestionsForPacket,
  fetchUserProfile,
  saveAttemptToCloud,
  upsertUserProfile,
} from './lib/firestoreService';
import {
  deleteLocalAttempt,
  getLocalAttempts,
  getOfflinePacketBundles,
  getStudentIdentity,
  markAttemptSynced,
  removeOfflinePacketBundle,
  saveLocalAttempt,
  saveOfflinePacketBundle,
  saveStudentIdentity,
} from './lib/offlineStore';
import type {
  AdminRecord,
  AttemptMode,
  AttemptRecord,
  ExamPacket,
  Question,
  SubjectType,
} from './types';

type ActiveView = 'home' | 'packets' | 'history' | 'admin' | 'exam' | 'review';

const HERO_IMAGE_PATH = '/src/assets/images/hero_tka_student_1794829961520.jpg';

const SUBJECT_FILTERS: Array<'Semua' | SubjectType> = [
  'Semua',
  'Matematika',
  'Bahasa Indonesia',
  'IPAS',
  'Campuran TKA',
];

export default function App() {
  const isOnline = useOnlineStatus();

  // Auth & Role
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminRecord | null>(null);

  // Student identity (works both offline & signed-in)
  const [studentName, setStudentName] = useState(() => getStudentIdentity().displayName);
  const [className, setClassName] = useState(() => getStudentIdentity().className);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [tempName, setTempName] = useState(studentName);
  const [tempClass, setTempClass] = useState(className);

  // Navigation
  const [view, setView] = useState<ActiveView>('home');
  const [subjectFilter, setSubjectFilter] = useState<'Semua' | SubjectType>('Semua');
  const [onlyOfflineFilter, setOnlyOfflineFilter] = useState(false);

  // Data
  const [cloudPackets, setCloudPackets] = useState<ExamPacket[]>([]);
  const [offlineBundles, setOfflineBundles] = useState(() => getOfflinePacketBundles());
  const [attempts, setAttempts] = useState<AttemptRecord[]>(() => getLocalAttempts());
  const [loadingData, setLoadingData] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Active Exam / Review State
  const [activeExamPacket, setActiveExamPacket] = useState<ExamPacket | null>(null);
  const [activeExamQuestions, setActiveExamQuestions] = useState<Question[]>([]);
  const [activeExamMode, setActiveExamMode] = useState<AttemptMode>('timed');
  const [reviewAttempt, setReviewAttempt] = useState<AttemptRecord | null>(null);
  const [reviewQuestions, setReviewQuestions] = useState<Question[]>([]);
  const [cachingPacketId, setCachingPacketId] = useState<string | null>(null);

  // Toast feedback
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const notify = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4200);
  }, []);

  // Ensure starter packets are always cached offline for instant use anywhere
  useEffect(() => {
    const current = getOfflinePacketBundles();
    let changed = false;
    STARTER_PACKETS.forEach(({ packet, questions }) => {
      if (!current[packet.id]) {
        saveOfflinePacketBundle(packet, questions);
        changed = true;
      }
    });
    if (changed) {
      setOfflineBundles(getOfflinePacketBundles());
    }
  }, []);

  const loadCloudData = useCallback(
    async (currentUser: User | null, adminFlag: boolean) => {
      if (!currentUser || !navigator.onLine) return;
      setLoadingData(true);
      try {
        const [pkts, cloudAttempts] = await Promise.all([
          fetchExamPackets(adminFlag),
          fetchAttempts(currentUser.uid, adminFlag),
        ]);
        setCloudPackets(pkts);

        const localList = getLocalAttempts();
        const cloudIds = new Set(cloudAttempts.map((a) => a.id));
        const unsyncedLocals = localList.filter((a) => !cloudIds.has(a.id));

        // Merge local snapshots into cloud attempts when matching locally
        const localById = new Map(localList.map((l) => [l.id, l]));
        const mergedCloud = cloudAttempts.map((ca) => {
          const localMatch = localById.get(ca.id);
          return localMatch?.questionsSnapshot
            ? { ...ca, questionsSnapshot: localMatch.questionsSnapshot }
            : ca;
        });

        setAttempts([...unsyncedLocals, ...mergedCloud].sort((a, b) => b.createdAtMs - a.createdAtMs));
      } catch (err) {
        console.error('Error loading cloud data:', err);
      } finally {
        setLoadingData(false);
      }
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        let adminFlag = false;
        try {
          if (
            isBootstrappedAdminEmail(firebaseUser.email) &&
            firebaseUser.emailVerified
          ) {
            await ensureBootstrappedAdminDoc(
              firebaseUser.uid,
              firebaseUser.email || '',
              firebaseUser.displayName || 'Guru Admin'
            );
            adminFlag = true;
          } else {
            adminFlag = await checkIsAdmin(firebaseUser.uid, firebaseUser.email);
          }
        } catch {
          adminFlag = isBootstrappedAdminEmail(firebaseUser.email);
        }
        setIsAdmin(adminFlag);

        if (adminFlag) {
          try {
            const admProf = await fetchAdminProfile(firebaseUser.uid);
            if (admProf) {
              setAdminProfile(admProf);
            } else {
              setAdminProfile({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                name: firebaseUser.displayName || 'Guru Admin',
              });
            }
          } catch {
            setAdminProfile({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || 'Guru Admin',
            });
          }
        } else {
          setAdminProfile(null);
        }

        try {
          const profile = await fetchUserProfile(firebaseUser.uid);
          if (profile) {
            setStudentName(profile.displayName);
            setClassName(profile.className || 'Kelas 6');
            setTempName(profile.displayName);
            setTempClass(profile.className || 'Kelas 6');
            saveStudentIdentity({
              displayName: profile.displayName,
              className: profile.className || 'Kelas 6',
            });
          } else if (firebaseUser.displayName) {
            const name = firebaseUser.displayName;
            setStudentName(name);
            setTempName(name);
            saveStudentIdentity({ displayName: name, className });
            await upsertUserProfile({
              uid: firebaseUser.uid,
              displayName: name,
              className,
            });
          }
        } catch {
          // Offline or profile fetch skipped gracefully
        }

        await loadCloudData(firebaseUser, adminFlag);
      } else {
        setIsAdmin(false);
        setAdminProfile(null);
        setCloudPackets([]);
        setAttempts(getLocalAttempts());
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [className, loadCloudData]);

  // Combined packet catalog (Cloud + Offline Starter fallbacks)
  const visiblePackets = useMemo(() => {
    const map = new Map<string, ExamPacket>();

    // Add cloud packets first (filter out drafts unless in admin)
    cloudPackets.forEach((p) => {
      if (isAdmin || p.status === 'published') {
        map.set(p.id, p);
      }
    });

    // Add offline cached packets (including starter packets) if not already in map
    Object.values(offlineBundles).forEach((bundle) => {
      if (!map.has(bundle.packet.id)) {
        map.set(bundle.packet.id, bundle.packet);
      }
    });

    return Array.from(map.values());
  }, [cloudPackets, isAdmin, offlineBundles]);

  const filteredPackets = useMemo(() => {
    return visiblePackets.filter((p) => {
      if (subjectFilter !== 'Semua' && p.subject !== subjectFilter) return false;
      if (onlyOfflineFilter && !offlineBundles[p.id]) return false;
      if (!isAdmin && p.status !== 'published') return false;
      return true;
    });
  }, [isAdmin, offlineBundles, onlyOfflineFilter, subjectFilter, visiblePackets]);

  const studentAttempts = useMemo(() => {
    if (!user) return attempts;
    return attempts.filter((a) => a.userId === user.uid || a.userId === 'offline-student');
  }, [attempts, user]);

  // Handle Google redirect sign-in result (used as fallback when pop-ups are blocked on standalone/Vercel)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          notify('Berhasil masuk dengan akun Google.', 'success');
        }
      })
      .catch((err) => {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/unauthorized-domain') {
          notify(
            `Domain "${window.location.hostname}" belum ditambahkan di Firebase Console → Authentication → Authorized domains.`,
            'error'
          );
        } else if (code) {
          notify('Gagal menyelesaikan login Google. Silakan coba lagi.', 'error');
        }
      });
  }, [notify]);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      notify('Berhasil masuk dengan akun Google.', 'success');
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      console.error('Sign in failed:', err);

      if (code === 'auth/unauthorized-domain') {
        notify(
          `Domain "${window.location.hostname}" belum diizinkan di Firebase Authentication → Authorized domains.`,
          'error'
        );
        return;
      }

      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        notify('Login Google dibatalkan.', 'error');
        return;
      }

      const isStandaloneWindow = typeof window !== 'undefined' && window.self === window.top;
      if (
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment') &&
        isStandaloneWindow
      ) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          console.error('Redirect sign in failed:', redirectErr);
        }
      }

      if (code === 'auth/popup-blocked') {
        notify(
          'Pop-up login diblokir oleh browser. Izinkan pop-up untuk situs ini atau buka di tab baru.',
          'error'
        );
      } else {
        notify(
          'Gagal masuk dengan Google. Pastikan pop-up diizinkan dan domain terdaftar di Firebase.',
          'error'
        );
      }
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    if (view === 'admin') setView('home');
    notify('Anda telah keluar dari akun.', 'success');
  };

  const handleSaveIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = tempName.trim() || 'Siswa Hebat';
    const cleanClass = tempClass.trim() || 'Kelas 6';
    setStudentName(cleanName);
    setClassName(cleanClass);
    saveStudentIdentity({ displayName: cleanName, className: cleanClass });
    setEditingIdentity(false);

    if (user && isOnline) {
      try {
        await upsertUserProfile({
          uid: user.uid,
          displayName: cleanName,
          className: cleanClass,
        });
      } catch {
        // Local saved even if cloud update fails
      }
    }
    notify('Profil siswa diperbarui.', 'success');
  };

  const resolvePacketQuestions = async (packet: ExamPacket): Promise<Question[]> => {
    const cached = offlineBundles[packet.id];
    if (!isOnline || packet.source === 'starter') {
      if (cached?.questions?.length) return cached.questions;
    }

    if (user && isOnline && packet.source === 'cloud') {
      try {
        const qs = await fetchQuestionsForPacket(packet.id, isAdmin);
        if (qs.length > 0) {
          saveOfflinePacketBundle(packet, qs);
          setOfflineBundles(getOfflinePacketBundles());
          return qs;
        }
      } catch {
        if (cached?.questions?.length) return cached.questions;
      }
    }

    if (cached?.questions?.length) return cached.questions;
    const starterMatch = STARTER_PACKETS.find((s) => s.packet.id === packet.id);
    return starterMatch ? starterMatch.questions : [];
  };

  const handleStartExam = async (packet: ExamPacket, mode: AttemptMode) => {
    const qs = await resolvePacketQuestions(packet);
    if (qs.length === 0) {
      notify('Paket ini belum memiliki soal. Tambahkan soal di Panel Guru terlebih dahulu.', 'error');
      return;
    }
    setActiveExamPacket(packet);
    setActiveExamQuestions(qs);
    setActiveExamMode(mode);
    setView('exam');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleToggleOfflineCache = async (packet: ExamPacket) => {
    if (offlineBundles[packet.id]) {
      if (packet.source === 'starter') {
        notify('Paket bawaan selalu tersedia untuk mode offline.', 'success');
        return;
      }
      removeOfflinePacketBundle(packet.id);
      setOfflineBundles(getOfflinePacketBundles());
      notify(`"${packet.title}" dihapus dari penyimpanan offline.`, 'success');
      return;
    }

    setCachingPacketId(packet.id);
    try {
      const qs = await resolvePacketQuestions(packet);
      if (qs.length === 0) {
        notify('Paket ini belum memiliki soal untuk disimpan offline.', 'error');
        return;
      }
      saveOfflinePacketBundle(packet, qs);
      setOfflineBundles(getOfflinePacketBundles());
      notify(`"${packet.title}" siap dikerjakan secara offline!`, 'success');
    } catch {
      notify('Gagal mengunduh paket untuk mode offline.', 'error');
    } finally {
      setCachingPacketId(null);
    }
  };

  const handleExamComplete = async (attempt: AttemptRecord) => {
    let savedAttempt = { ...attempt };
    saveLocalAttempt(savedAttempt);

    if (user && isOnline) {
      try {
        await saveAttemptToCloud(savedAttempt, user.uid);
        markAttemptSynced(savedAttempt.id);
        savedAttempt = { ...savedAttempt, syncedToCloud: true };
        notify('Nilai berhasil disimpan dan disinkronkan ke Cloud.', 'success');
      } catch {
        notify('Nilai tersimpan lokal dan akan disinkronkan saat online.', 'success');
      }
    } else {
      notify('Nilai tersimpan di perangkat (Mode Offline).', 'success');
    }

    setAttempts((prev) => [savedAttempt, ...prev.filter((item) => item.id !== savedAttempt.id)]);
    setReviewAttempt(savedAttempt);
    setReviewQuestions(attempt.questionsSnapshot || activeExamQuestions);
    setView('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSyncPendingAttempts = async () => {
    if (!user || !isOnline) return;
    const pending = getLocalAttempts().filter((a) => !a.syncedToCloud);
    if (pending.length === 0) return;

    setIsSyncing(true);
    let syncedCount = 0;
    for (const att of pending) {
      try {
        await saveAttemptToCloud(att, user.uid);
        markAttemptSynced(att.id);
        syncedCount += 1;
      } catch {
        // Keep unsynced on failure
      }
    }
    await loadCloudData(user, isAdmin);
    setIsSyncing(false);
    if (syncedCount > 0) {
      notify(`${syncedCount} hasil latihan offline berhasil disinkronkan.`, 'success');
    }
  };

  const handleInspectAttempt = async (att: AttemptRecord) => {
    let qs = att.questionsSnapshot || [];
    if (qs.length === 0) {
      const targetPacket =
        visiblePackets.find((p) => p.id === att.packetId) ||
        offlineBundles[att.packetId]?.packet;
      if (targetPacket) {
        qs = await resolvePacketQuestions(targetPacket);
      }
    }
    setReviewAttempt(att);
    setReviewQuestions(qs);
    setView('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteAttempt = async (att: AttemptRecord) => {
    deleteLocalAttempt(att.id);
    setAttempts((prev) => prev.filter((item) => item.id !== att.id));
    if (att.syncedToCloud && user && isOnline) {
      try {
        await deleteCloudAttempt(att.id);
      } catch {
        // Ignore if already deleted
      }
    }
    notify('Riwayat nilai dihapus.', 'success');
  };

  if (view === 'exam' && activeExamPacket) {
    return (
      <>
        <ExamRunner
          packet={activeExamPacket}
          questions={activeExamQuestions}
          mode={activeExamMode}
          studentName={studentName}
          className={className}
          userId={user?.uid || 'offline-student'}
          canSyncLive={Boolean(user && user.emailVerified && isOnline)}
          onExit={() => setView('packets')}
          onComplete={handleExamComplete}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 md:pb-8">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setView('home')}
            className="font-display text-lg font-extrabold tracking-tight text-blue-700 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            PintarTKA SD
          </button>

          {/* Zone 2: 4 single-line text nav links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex"
          >
            <button
              type="button"
              onClick={() => setView('home')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                view === 'home' ? 'text-blue-700 underline decoration-2 underline-offset-8' : ''
              }`}
            >
              Beranda
            </button>
            <button
              type="button"
              onClick={() => setView('packets')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                view === 'packets' ? 'text-blue-700 underline decoration-2 underline-offset-8' : ''
              }`}
            >
              Paket Soal
            </button>
            <button
              type="button"
              onClick={() => setView('history')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                view === 'history' ? 'text-blue-700 underline decoration-2 underline-offset-8' : ''
              }`}
            >
              Riwayat Skor
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 ${
                  view === 'admin' ? 'text-blue-700 underline decoration-2 underline-offset-8' : ''
                }`}
              >
                Panel Guru
              </button>
            )}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            {!authReady ? (
              <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                Memuat...
              </span>
            ) : user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>Keluar ({isAdmin ? 'Guru' : 'Siswa'})</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Masuk Google</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      {view === 'review' && reviewAttempt && (
        <AttemptReview
          attempt={reviewAttempt}
          questions={reviewQuestions}
          onBackHome={() => setView('packets')}
          onViewHistory={() => setView('history')}
          onRetry={() => {
            const pkt = visiblePackets.find((p) => p.id === reviewAttempt.packetId);
            if (pkt) {
              handleStartExam(pkt, reviewAttempt.mode);
            }
          }}
        />
      )}

      {view === 'history' && (
        <ScoreHistoryView
          attempts={studentAttempts}
          isSignedIn={Boolean(user)}
          isOnline={isOnline}
          isSyncing={isSyncing}
          onSyncPending={handleSyncPendingAttempts}
          onInspectAttempt={handleInspectAttempt}
          onDeleteAttempt={handleDeleteAttempt}
          onStartPractice={() => setView('packets')}
        />
      )}

      {view === 'admin' && isAdmin && user && (
        <AdminDashboard
          uid={user.uid}
          userEmail={user.email || ''}
          adminProfile={adminProfile}
          packets={visiblePackets}
          allAttempts={attempts}
          onRefreshData={() => loadCloudData(user, true)}
          onAdminProfileUpdated={(updated) => {
            setAdminProfile(updated);
            setStudentName(updated.name);
            setTempName(updated.name);
            saveStudentIdentity({
              displayName: updated.name,
              className: updated.roleTitle || className,
            });
          }}
          onNotify={notify}
        />
      )}

      {(view === 'home' || view === 'packets') && (
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          {/* Hero Section shown on Home */}
          {view === 'home' && (
            <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
              <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
                <div className="flex flex-col justify-between lg:col-span-7">
                  <div>
                    <p className="text-xs font-semibold text-blue-700">
                      CAT TKA Sekolah Dasar · Bebas Iklan · Bisa Offline
                    </p>
                    <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 text-balance sm:text-4xl">
                      Latihan Ujian TKA SD Lebih Mudah, Seru, dan Terarah
                    </h1>
                    <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600">
                      Berlatih soal Matematika, Bahasa Indonesia, dan IPAS dengan simulasi ujian berwaktu, penilaian otomatis, serta pembahasan langkah demi langkah yang mudah dipahami anak-anak.
                    </p>

                    {/* Editable Student Identity Strip */}
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                      {!editingIdentity ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 text-sm text-slate-700">
                            <UserIcon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                            <span>
                              Peserta: <strong>{studentName}</strong> · {className}
                            </span>
                            {isAdmin && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                                Mode Guru Aktif
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setTempName(studentName);
                              setTempClass(className);
                              setEditingIdentity(true);
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                          >
                            <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Ubah Nama</span>
                          </button>
                        </div>
                      ) : (
                        <form
                          onSubmit={handleSaveIdentity}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <input
                            type="text"
                            required
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value)}
                            placeholder="Nama Siswa"
                            className="min-h-[38px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                          />
                          <input
                            type="text"
                            required
                            value={tempClass}
                            onChange={(e) => setTempClass(e.target.value)}
                            placeholder="Kelas (mis. 6A)"
                            className="min-h-[38px] w-28 rounded-xl border border-slate-300 bg-white px-3 text-sm"
                          />
                          <button
                            type="submit"
                            className="min-h-[38px] rounded-xl bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Simpan
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const first = visiblePackets[0];
                        if (first) {
                          handleStartExam(first, 'timed');
                        } else {
                          setView('packets');
                        }
                      }}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      <span>Mulai Ujian Berwaktu</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setView('history')}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
                      <span>Riwayat Skor</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setView('admin')}
                        className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 whitespace-nowrap shrink-0"
                      >
                        <Shield className="h-4 w-4" aria-hidden="true" />
                        <span>Kelola Soal (Guru)</span>
                      </button>
                    )}

                    <PWAInstallButton />
                  </div>
                </div>

                {/* Right Hero Illustration */}
                <div className="lg:col-span-5">
                  {!heroImgFailed ? (
                    <img
                      src={HERO_IMAGE_PATH}
                      alt="Siswa SD belajar bersama mengerjakan soal TKA menggunakan tablet dan buku catatan"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="h-60 w-full rounded-2xl border border-slate-200 object-cover lg:h-full"
                    />
                  ) : (
                    <div className="flex h-60 w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-blue-50 p-6 text-center lg:h-full">
                      <BookOpen className="h-12 w-12 text-blue-600" aria-hidden="true" />
                      <p className="mt-3 font-display text-base font-bold text-slate-900">
                        Siap Belajar TKA SD
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Exam Packets Catalog */}
          <section id="paket-soal">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900">
                  Pilih Paket Latihan TKA SD
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Pilih <strong>Ujian Berwaktu</strong> untuk simulasi nyata, atau{' '}
                  <strong>Mode Latihan</strong> untuk belajar dengan pembahasan langsung.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOnlyOfflineFilter((v) => !v)}
                  className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    onlyOfflineFilter
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <HardDriveDownload className="h-4 w-4" aria-hidden="true" />
                  <span>Siap Offline ({Object.keys(offlineBundles).length})</span>
                </button>
              </div>
            </div>

            {/* Subject Filter Tabs */}
            <div className="mt-4 flex items-center gap-1.5 overflow-x-auto pb-2">
              {SUBJECT_FILTERS.map((subj) => {
                const active = subjectFilter === subj;
                return (
                  <button
                    key={subj}
                    type="button"
                    onClick={() => setSubjectFilter(subj)}
                    className={`min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
                      active
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {subj}
                  </button>
                );
              })}
            </div>

            {loadingData && visiblePackets.length === 0 ? (
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
                  />
                ))}
              </div>
            ) : filteredPackets.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
                <p className="mt-3 font-display text-base font-bold text-slate-900">
                  Tidak ada paket soal pada filter ini
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Coba pilih mata pelajaran lain atau tampilkan semua paket.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {filteredPackets.map((pkt) => {
                  const isCached = Boolean(offlineBundles[pkt.id]);
                  const isCachingThis = cachingPacketId === pkt.id;

                  return (
                    <article
                      key={pkt.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-colors hover:border-blue-200"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                          <span className="truncate font-medium">
                            {pkt.subject} · {pkt.gradeLevel}
                          </span>
                          {pkt.status === 'draft' && (
                            <span className="shrink-0 font-semibold text-amber-700">Draft</span>
                          )}
                        </div>

                        <h3 className="mt-2 font-display text-lg font-bold leading-snug text-slate-900">
                          {pkt.title}
                        </h3>

                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">
                          {pkt.description}
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <BookOpen className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                            {pkt.questionCount} soal
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
                            {pkt.durationMinutes} menit
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartExam(pkt, 'timed')}
                            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
                          >
                            <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>Ujian Berwaktu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartExam(pkt, 'practice')}
                            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
                          >
                            <BookOpen className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                            <span>Mode Latihan</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleOfflineCache(pkt)}
                          disabled={isCachingThis}
                          className={`flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            isCached
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {isCached ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                              <span>Tersedia Offline</span>
                            </>
                          ) : (
                            <>
                              <DownloadCloud className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                              <span>
                                {isCachingThis ? 'Menyimpan...' : 'Simpan untuk Mode Offline'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {/* Mobile Fixed Bottom Navigation Bar (hidden on md+ and during active exam) */}
      <nav
        aria-label="Navigasi seluler"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      >
        <div className={`grid h-14 items-center ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <button
            type="button"
            onClick={() => setView('home')}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              view === 'home' ? 'text-blue-700' : 'text-slate-500'
            }`}
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            <span>Beranda</span>
          </button>

          <button
            type="button"
            onClick={() => setView('packets')}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              view === 'packets' ? 'text-blue-700' : 'text-slate-500'
            }`}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden="true" />
            <span>Paket</span>
          </button>

          <button
            type="button"
            onClick={() => setView('history')}
            className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              view === 'history' ? 'text-blue-700' : 'text-slate-500'
            }`}
          >
            <Award className="h-5 w-5" aria-hidden="true" />
            <span>Riwayat</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setView('admin')}
              className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                view === 'admin' ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <Shield className="h-5 w-5" aria-hidden="true" />
              <span>Guru</span>
            </button>
          )}
        </div>
      </nav>

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-20 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg md:bottom-5 ${
            toast.type === 'error'
              ? 'border-rose-300 bg-rose-50 text-rose-900'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.type === 'error' ? (
            <CloudOff className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
