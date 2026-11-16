import React, { useMemo } from 'react';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  CloudUpload,
  Eye,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { AttemptRecord } from '../types';

interface ScoreHistoryViewProps {
  attempts: AttemptRecord[];
  isSignedIn: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  onSyncPending: () => void;
  onInspectAttempt: (attempt: AttemptRecord) => void;
  onDeleteAttempt: (attempt: AttemptRecord) => void;
  onStartPractice: () => void;
}

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ms));
}

export const ScoreHistoryView: React.FC<ScoreHistoryViewProps> = ({
  attempts,
  isSignedIn,
  isOnline,
  isSyncing,
  onSyncPending,
  onInspectAttempt,
  onDeleteAttempt,
  onStartPractice,
}) => {
  const stats = useMemo(() => {
    if (attempts.length === 0) {
      return { total: 0, avg: 0, best: 0, unsynced: 0 };
    }
    const sum = attempts.reduce((acc, item) => acc + item.score, 0);
    const best = Math.max(...attempts.map((item) => item.score));
    const unsynced = attempts.filter((item) => !item.syncedToCloud).length;
    return {
      total: attempts.length,
      avg: Math.round((sum / attempts.length) * 10) / 10,
      best,
      unsynced,
    };
  }, [attempts]);

  const subjectAverages = useMemo(() => {
    const map = new Map<string, { sum: number; count: number }>();
    attempts.forEach((a) => {
      const key = a.subject || 'Campuran TKA';
      const prev = map.get(key) || { sum: 0, count: 0 };
      map.set(key, { sum: prev.sum + a.score, count: prev.count + 1 });
    });
    return Array.from(map.entries()).map(([subject, data]) => ({
      subject,
      avg: Math.round((data.sum / data.count) * 10) / 10,
      count: data.count,
    }));
  }, [attempts]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">
            Riwayat Skor & Perkembangan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pantau kemajuan latihanmu dan buka kembali pembahasan kapan saja, baik online maupun offline.
          </p>
        </div>

        {stats.unsynced > 0 && isSignedIn && isOnline && (
          <button
            type="button"
            onClick={onSyncPending}
            disabled={isSyncing}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            <span>
              {isSyncing
                ? 'Menyinkronkan...'
                : `Sinkronkan ${stats.unsynced} Hasil Offline`}
            </span>
          </button>
        )}
      </div>

      {/* 3-Column KPI Strip */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Latihan Selesai</span>
            <BarChart3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.total}
          </p>
          <p className="mt-1 text-xs text-slate-500">Paket soal dikerjakan</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Rata-rata Nilai</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.avg}
          </p>
          <p className="mt-1 text-xs text-slate-500">Skala 0 – 100</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Nilai Tertinggi</span>
            <Award className="h-4 w-4 text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-slate-900">
            {stats.best}
          </p>
          <p className="mt-1 text-xs text-slate-500">Pencapaian terbaik</p>
        </div>
      </div>

      {attempts.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xs sm:p-12">
          <Award className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
          <h2 className="mt-3 font-display text-lg font-bold text-slate-900">
            Belum Ada Riwayat Latihan
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            Pilih salah satu paket soal TKA SD di beranda untuk memulai ujian berwaktu atau latihan mandiri.
          </p>
          <button
            type="button"
            onClick={onStartPractice}
            className="mt-5 min-h-[44px] rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Pilih Paket Soal
          </button>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Subject Breakdown */}
          <section className="lg:col-span-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="font-display text-base font-bold text-slate-900">
                Rata-rata per Mata Pelajaran
              </h2>
              <div className="mt-4 space-y-4">
                {subjectAverages.map((item) => (
                  <div key={item.subject}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800">{item.subject}</span>
                      <span className="font-mono font-bold tabular-nums text-slate-700">
                        {item.avg} ({item.count}×)
                      </span>
                    </div>
                    <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, item.avg))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Attempt List */}
          <section className="lg:col-span-8">
            <div className="rounded-2xl border border-slate-200 bg-white shadow-xs">
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Daftar Hasil Ujian & Latihan
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {attempts.map((att) => {
                  const isGood = att.score >= 75;
                  return (
                    <div
                      key={att.id}
                      className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{att.subject}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {att.mode === 'timed' ? 'Ujian Berwaktu' : 'Mode Latihan'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formatDateTime(att.createdAtMs)}</span>
                          {!att.syncedToCloud && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-amber-700">
                                Tersimpan Lokal
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="mt-1 truncate font-display text-base font-bold text-slate-900">
                          {att.packetTitle}
                        </h3>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                            {att.correctCount}/{att.totalQuestions} benar
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            {Math.floor(att.durationSeconds / 60)}m {att.durationSeconds % 60}d
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                        <div className="text-left sm:text-right">
                          <span className="block text-[11px] font-medium text-slate-500">
                            Skor
                          </span>
                          <span
                            className={`font-mono text-2xl font-bold tabular-nums ${
                              isGood ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {att.score}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onInspectAttempt(att)}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0"
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                            <span>Pembahasan</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteAttempt(att)}
                            aria-label={`Hapus riwayat ${att.packetTitle}`}
                            className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
