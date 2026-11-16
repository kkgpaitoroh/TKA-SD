import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  countCorrectStatements,
  getEffectiveCorrectBooleans,
  getEffectiveCorrectIndices,
  getQuestionType,
  getQuestionTypeLabel,
  isQuestionAnswered,
  isQuestionCorrect,
} from '../lib/questionUtils';
import type { AttemptRecord, Question } from '../types';

interface AttemptReviewProps {
  attempt: AttemptRecord;
  questions: Question[];
  onBackHome: () => void;
  onRetry?: () => void;
  onViewHistory: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s} detik`;
  return `${m} menit ${s} detik`;
}

function getEncouragement(score: number): { title: string; message: string } {
  if (score >= 90) {
    return {
      title: 'Luar Biasa! Hasil Sangat Memuaskan',
      message:
        'Pemahamanmu sudah sangat kuat. Tetap pertahankan ketelitianmu dengan membaca kembali pembahasan soal.',
    };
  }
  if (score >= 75) {
    return {
      title: 'Hebat! Kamu Sudah Lulus KKM',
      message:
        'Hasil yang bagus! Yuk pelajari lagi beberapa soal yang masih keliru agar nilaimu semakin sempurna.',
    };
  }
  if (score >= 55) {
    return {
      title: 'Terus Semangat! Kemajuan yang Baik',
      message:
        'Kamu sudah memahami sebagian materi. Baca pembahasan langkah demi langkah di bawah ini lalu coba lagi.',
    };
  }
  return {
    title: 'Jangan Menyerah! Ayo Belajar Bersama',
    message:
      'Setiap latihan membuatmu semakin pintar. Simak pembahasan lengkap di bawah ini dan ulangi latihannya kapan saja.',
  };
}

export const AttemptReview: React.FC<AttemptReviewProps> = ({
  attempt,
  questions,
  onBackHome,
  onRetry,
  onViewHistory,
}) => {
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'correct'>('all');
  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const encouragement = getEncouragement(attempt.score);
  const wrongOrBlank = attempt.totalQuestions - attempt.correctCount;

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const answer = attempt.answers[q.id];
      const isCorrect = isQuestionCorrect(q, answer);
      if (filter === 'correct') return isCorrect;
      if (filter === 'incorrect') return !isCorrect;
      return true;
    });
  }, [attempt.answers, filter, questions]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Kembali ke Daftar Paket</span>
        </button>

        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Ulangi Latihan</span>
            </button>
          )}
          <button
            type="button"
            onClick={onViewHistory}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Award className="h-4 w-4" aria-hidden="true" />
            <span>Riwayat Skor</span>
          </button>
        </div>
      </div>

      {/* Summary Score Card */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium text-slate-500">
              {attempt.packetTitle} · {attempt.studentName} ({attempt.className})
            </p>
            <h1 className="mt-1.5 font-display text-2xl font-bold text-slate-900 sm:text-3xl">
              {encouragement.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {encouragement.message}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 px-7 py-5 text-center">
            <span className="text-xs font-semibold text-blue-700">Nilai Akhir</span>
            <span className="mt-1 font-mono text-4xl font-bold tabular-nums text-blue-900">
              {attempt.score}
            </span>
            <span className="mt-1 text-xs text-blue-700">dari 100</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500">Jawaban Benar</p>
              <p className="font-mono text-base font-bold tabular-nums text-slate-900">
                {attempt.correctCount} dari {attempt.totalQuestions}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <XCircle className="h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500">Salah / Belum Dijawab</p>
              <p className="font-mono text-base font-bold tabular-nums text-slate-900">
                {wrongOrBlank} soal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <Clock className="h-5 w-5 shrink-0 text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-xs text-slate-500">Waktu Pengerjaan</p>
              <p className="font-mono text-base font-bold tabular-nums text-slate-900">
                {formatDuration(attempt.durationSeconds)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Bar for Explanations */}
      <section className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold text-slate-900">
              Pembahasan Lengkap
            </h2>
          </div>

          <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({questions.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('incorrect')}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filter === 'incorrect'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Dipelajari ({wrongOrBlank})
            </button>
            <button
              type="button"
              onClick={() => setFilter('correct')}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filter === 'correct'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Benar ({attempt.correctCount})
            </button>
          </div>
        </div>

        {questions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            Detail soal untuk riwayat ini tidak tersedia di cache lokal.
          </div>
        ) : filteredQuestions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
            Tidak ada soal pada kategori filter ini.
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            {filteredQuestions.map((q) => {
              const originalNumber = questions.findIndex((item) => item.id === q.id) + 1;
              const qType = getQuestionType(q);
              const userAns = attempt.answers[q.id];
              const isCorrect = isQuestionCorrect(q, userAns);
              const isUnanswered = !isQuestionAnswered(q, userAns);

              return (
                <article
                  key={q.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold tabular-nums text-slate-700">
                        Soal {originalNumber} · {q.subject} · {q.difficulty}
                      </span>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                        {getQuestionTypeLabel(qType)}
                      </span>
                    </div>

                    {isCorrect ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        Jawaban Kamu Benar
                      </span>
                    ) : isUnanswered ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Belum Lengkap / Tidak Dijawab
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        {qType === 'true_false'
                          ? `Benar ${countCorrectStatements(q, userAns)}/${q.options.length} pernyataan`
                          : 'Kurang Tepat'}
                      </span>
                    )}
                  </div>

                  {q.stimulus && q.stimulus.trim().length > 0 && (
                    <div className="mt-4 rounded-xl border border-blue-200/80 bg-blue-50/40 p-4">
                      <p className="text-xs font-bold text-blue-800">Bacaan / Ilustrasi Soal</p>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                        {q.stimulus}
                      </p>
                    </div>
                  )}

                  <p className="mt-4 whitespace-pre-line text-base leading-relaxed font-medium text-slate-900">
                    {q.prompt}
                  </p>

                  {qType === 'pg' && (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, optIdx) => {
                        const isKey = optIdx === q.correctIndex;
                        const isUserChoice = optIdx === userAns;

                        let boxClass = 'border-slate-200 bg-slate-50/70 text-slate-700';
                        if (isKey) {
                          boxClass = 'border-emerald-400 bg-emerald-50 text-emerald-950 font-medium';
                        } else if (isUserChoice && !isKey) {
                          boxClass = 'border-rose-300 bg-rose-50 text-rose-950';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${boxClass}`}
                          >
                            <span className="font-mono font-bold">{optionLabels[optIdx]}.</span>
                            <span className="flex-1">{opt}</span>
                            {isKey && (
                              <span className="shrink-0 text-[11px] font-semibold text-emerald-700">
                                Kunci
                              </span>
                            )}
                            {isUserChoice && !isKey && (
                              <span className="shrink-0 text-[11px] font-semibold text-rose-700">
                                Pilihanmu
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {qType === 'mcma' && (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {q.options.map((opt, optIdx) => {
                        const expectedKeys = getEffectiveCorrectIndices(q);
                        const chosenList = Array.isArray(userAns) ? (userAns as number[]) : [];
                        const isKey = expectedKeys.includes(optIdx);
                        const isUserChoice = chosenList.includes(optIdx);

                        let boxClass = 'border-slate-200 bg-slate-50/70 text-slate-700';
                        if (isKey) {
                          boxClass = 'border-emerald-400 bg-emerald-50 text-emerald-950 font-medium';
                        } else if (isUserChoice && !isKey) {
                          boxClass = 'border-rose-300 bg-rose-50 text-rose-950';
                        }

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${boxClass}`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                isUserChoice
                                  ? isKey
                                    ? 'border-emerald-600 bg-emerald-600 text-white'
                                    : 'border-rose-600 bg-rose-600 text-white'
                                  : isKey
                                  ? 'border-emerald-500 bg-white text-emerald-600'
                                  : 'border-slate-300 bg-white text-transparent'
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </span>
                            <span className="font-mono font-bold">{optionLabels[optIdx]}.</span>
                            <span className="flex-1">{opt}</span>
                            {isKey && (
                              <span className="shrink-0 text-[11px] font-semibold text-emerald-700">
                                {isUserChoice ? 'Kunci ✓' : 'Kunci (Terlewat)'}
                              </span>
                            )}
                            {isUserChoice && !isKey && (
                              <span className="shrink-0 text-[11px] font-semibold text-rose-700">
                                Salah pilih
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {qType === 'true_false' && (
                    <div className="mt-4 space-y-2">
                      {q.options.map((stmt, idx) => {
                        const expectedBools = getEffectiveCorrectBooleans(q);
                        const userBools = Array.isArray(userAns)
                          ? (userAns as Array<boolean | undefined>)
                          : [];
                        const expectedVal = expectedBools[idx];
                        const userVal = userBools[idx];
                        const stmtMatch = typeof userVal === 'boolean' && userVal === expectedVal;

                        return (
                          <div
                            key={idx}
                            className={`flex flex-col gap-2 rounded-xl border px-3.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${
                              stmtMatch
                                ? 'border-emerald-300 bg-emerald-50/70'
                                : 'border-rose-300 bg-rose-50/60'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-mono font-bold text-slate-600">{idx + 1}.</span>
                              <span className="text-slate-900">{stmt}</span>
                            </div>
                            <div className="flex shrink-0 items-center gap-2 text-xs font-semibold">
                              <span className="rounded-md bg-white px-2 py-1 text-slate-700 border border-slate-200">
                                Jawabanmu:{' '}
                                {typeof userVal === 'boolean' ? (userVal ? 'Benar' : 'Salah') : 'Kosong'}
                              </span>
                              <span className="rounded-md bg-emerald-100 px-2 py-1 text-emerald-800">
                                Kunci: {expectedVal ? 'Benar' : 'Salah'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                    <p className="text-xs font-bold text-blue-900">Pembahasan</p>
                    <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                      {q.explanation}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
