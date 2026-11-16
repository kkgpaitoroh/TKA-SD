import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Flag,
  LayoutGrid,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import { upsertLiveSession } from '../lib/firestoreService';
import {
  formatCorrectAnswerLabel,
  getEffectiveCorrectBooleans,
  getEffectiveCorrectIndices,
  getQuestionType,
  getQuestionTypeLabel,
  isQuestionAnswered,
  isQuestionCorrect,
} from '../lib/questionUtils';
import type {
  AnswerValue,
  AttemptMode,
  AttemptRecord,
  ExamPacket,
  LiveSessionStatus,
  Question,
} from '../types';

interface ExamRunnerProps {
  packet: ExamPacket;
  questions: Question[];
  mode: AttemptMode;
  studentName: string;
  className: string;
  userId: string;
  canSyncLive?: boolean;
  onExit: () => void;
  onComplete: (attempt: AttemptRecord) => void;
}

function formatTimer(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ExamRunner: React.FC<ExamRunnerProps> = ({
  packet,
  questions,
  mode,
  studentName,
  className,
  userId,
  canSyncLive = false,
  onExit,
  onComplete,
}) => {
  const totalSecondsLimit = packet.durationMinutes * 60;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [flaggedIds, setFlaggedIds] = useState<Record<string, boolean>>({});
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [secondsLeft, setSecondsLeft] = useState(totalSecondsLimit);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showNavSheet, setShowNavSheet] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const examStartedAtMsRef = useRef<number>(Date.now());
  const sessionInitializedRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

  const stats = useMemo(() => {
    let answered = 0;
    let flagged = 0;
    questions.forEach((q) => {
      if (isQuestionAnswered(q, answers[q.id])) answered += 1;
      if (flaggedIds[q.id]) flagged += 1;
    });
    return {
      answered,
      flagged,
      unanswered: questions.length - answered,
    };
  }, [answers, flaggedIds, questions]);

  const latestLiveStateRef = useRef({
    currentIndex,
    answeredCount: stats.answered,
    flaggedCount: stats.flagged,
    secondsLeft,
    elapsedSeconds,
    isSubmitted,
  });
  latestLiveStateRef.current = {
    currentIndex,
    answeredCount: stats.answered,
    flaggedCount: stats.flagged,
    secondsLeft,
    elapsedSeconds,
    isSubmitted,
  };

  const pushLiveSession = useCallback(
    async (status: LiveSessionStatus, overrideSeconds?: { left?: number; elapsed?: number }) => {
      if (!canSyncLive || !navigator.onLine || questions.length === 0) return;
      const snap = latestLiveStateRef.current;
      try {
        await upsertLiveSession(
          {
            userId,
            studentName: studentName.trim() || 'Siswa',
            className: className.trim() || 'Kelas 6',
            packetId: packet.id,
            packetTitle: packet.title,
            subject: packet.subject,
            mode,
            status,
            currentQuestionNumber: Math.max(1, snap.currentIndex + 1),
            answeredCount: snap.answeredCount,
            flaggedCount: snap.flaggedCount,
            totalQuestions: questions.length,
            secondsLeft:
              overrideSeconds?.left !== undefined
                ? overrideSeconds.left
                : mode === 'timed'
                ? snap.secondsLeft
                : 0,
            elapsedSeconds:
              overrideSeconds?.elapsed !== undefined
                ? overrideSeconds.elapsed
                : snap.elapsedSeconds,
            examStartedAtMs: examStartedAtMsRef.current,
          },
          sessionInitializedRef.current
        );
        sessionInitializedRef.current = true;
      } catch {
        // Never block student exam execution if live proctoring sync fails
      }
    },
    [canSyncLive, className, mode, packet.id, packet.subject, packet.title, questions.length, studentName, userId]
  );

  // Initial session registration + 15s heartbeat
  useEffect(() => {
    if (!canSyncLive || questions.length === 0) return;
    pushLiveSession('working');

    const heartbeat = window.setInterval(() => {
      if (!latestLiveStateRef.current.isSubmitted) {
        pushLiveSession('working');
      }
    }, 15000);

    return () => window.clearInterval(heartbeat);
  }, [canSyncLive, pushLiveSession, questions.length]);

  // Debounced sync when student moves question, answers, or toggles flag
  useEffect(() => {
    if (!canSyncLive || isSubmitted || !sessionInitializedRef.current) return;
    const t = window.setTimeout(() => {
      pushLiveSession('working');
    }, 800);
    return () => window.clearTimeout(t);
  }, [canSyncLive, currentIndex, stats.answered, stats.flagged, isSubmitted, pushLiveSession]);

  const handleExitExam = useCallback(() => {
    if (canSyncLive && !isSubmitted) {
      void pushLiveSession('exited');
    }
    onExit();
  }, [canSyncLive, isSubmitted, onExit, pushLiveSession]);

  const finalizeExam = useCallback(
    (finalElapsed: number) => {
      if (isSubmitted) return;
      setIsSubmitted(true);

      let correctCount = 0;
      const sanitizedAnswers: Record<string, AnswerValue> = {};
      questions.forEach((q) => {
        const chosen = answers[q.id];
        const qType = getQuestionType(q);
        if (qType === 'pg' && typeof chosen === 'number' && chosen >= 0 && chosen < q.options.length) {
          sanitizedAnswers[q.id] = chosen;
          if (isQuestionCorrect(q, chosen)) correctCount += 1;
        } else if (qType === 'mcma' && Array.isArray(chosen)) {
          const validNums = Array.from(
            new Set(
              chosen.filter(
                (v): v is number => typeof v === 'number' && v >= 0 && v < q.options.length
              )
            )
          ).sort((a, b) => a - b);
          if (validNums.length > 0) {
            sanitizedAnswers[q.id] = validNums;
            if (isQuestionCorrect(q, validNums)) correctCount += 1;
          }
        } else if (qType === 'true_false' && Array.isArray(chosen)) {
          const bools = q.options.map((_, idx) => Boolean(chosen[idx]));
          if (isQuestionAnswered(q, chosen)) {
            sanitizedAnswers[q.id] = bools;
            if (isQuestionCorrect(q, bools)) correctCount += 1;
          }
        }
      });

      const total = Math.max(1, questions.length);
      const score = Math.round((correctCount / total) * 1000) / 10;

      if (canSyncLive) {
        void pushLiveSession('finished', {
          left: mode === 'timed' ? Math.max(0, totalSecondsLimit - finalElapsed) : 0,
          elapsed: Math.max(1, finalElapsed),
        });
      }

      const attempt: AttemptRecord = {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId,
        studentName: studentName.trim() || 'Siswa',
        className: className.trim() || 'Kelas 6',
        packetId: packet.id,
        packetTitle: packet.title,
        subject: packet.subject,
        mode,
        score,
        correctCount,
        totalQuestions: questions.length,
        durationSeconds: Math.max(1, finalElapsed),
        answers: sanitizedAnswers,
        createdAtMs: Date.now(),
        syncedToCloud: false,
        questionsSnapshot: questions,
      };

      onComplete(attempt);
    },
    [
      answers,
      canSyncLive,
      className,
      isSubmitted,
      mode,
      onComplete,
      packet,
      pushLiveSession,
      questions,
      studentName,
      totalSecondsLimit,
      userId,
    ]
  );

  useEffect(() => {
    if (isSubmitted) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (mode === 'timed') {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isSubmitted, mode]);

  useEffect(() => {
    if (mode === 'timed' && secondsLeft === 0 && !isSubmitted) {
      finalizeExam(totalSecondsLimit);
    }
  }, [finalizeExam, isSubmitted, mode, secondsLeft, totalSecondsLimit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showConfirmModal || !currentQuestion) return;
      const key = e.key.toLowerCase();
      if (key === 'arrowright' && currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
        return;
      }
      if (key === 'arrowleft' && currentIndex > 0) {
        setCurrentIndex((i) => i - 1);
        return;
      }

      const qType = getQuestionType(currentQuestion);
      const keyIdxMap: Record<string, number> = {
        a: 0,
        '1': 0,
        b: 1,
        '2': 1,
        c: 2,
        '3': 2,
        d: 3,
        '4': 3,
        e: 4,
        '5': 4,
        f: 5,
        '6': 5,
      };
      const optIdx = keyIdxMap[key];
      if (optIdx === undefined || optIdx >= currentQuestion.options.length) return;

      if (qType === 'pg') {
        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: optIdx }));
      } else if (qType === 'mcma') {
        setAnswers((prev) => {
          const existing = Array.isArray(prev[currentQuestion.id])
            ? (prev[currentQuestion.id] as number[])
            : [];
          const next = existing.includes(optIdx)
            ? existing.filter((i) => i !== optIdx)
            : [...existing, optIdx].sort((a, b) => a - b);
          return { ...prev, [currentQuestion.id]: next };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, currentQuestion, questions.length, showConfirmModal]);

  if (!currentQuestion) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <p className="text-base font-medium text-slate-700">
          Paket soal ini belum memiliki pertanyaan.
        </p>
        <button
          type="button"
          onClick={handleExitExam}
          className="mt-4 min-h-[44px] rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Kembali
        </button>
      </div>
    );
  }

  const currentType = getQuestionType(currentQuestion);
  const currentAnswer = answers[currentQuestion.id];
  const currentIsAnswered = isQuestionAnswered(currentQuestion, currentAnswer);
  const currentIsCorrect = isQuestionCorrect(currentQuestion, currentAnswer);
  const isFlagged = Boolean(flaggedIds[currentQuestion.id]);
  const isRevealed = mode === 'practice' && Boolean(revealedIds[currentQuestion.id]);
  const isLowTime = mode === 'timed' && secondsLeft <= 120;

  const toggleFlag = () => {
    setFlaggedIds((prev) => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }));
  };

  const handleToggleMcma = (optIdx: number) => {
    setAnswers((prev) => {
      const existing = Array.isArray(prev[currentQuestion.id])
        ? (prev[currentQuestion.id] as number[])
        : [];
      const next = existing.includes(optIdx)
        ? existing.filter((i) => i !== optIdx)
        : [...existing, optIdx].sort((a, b) => a - b);
      return { ...prev, [currentQuestion.id]: next };
    });
  };

  const handleSetTrueFalse = (stmtIdx: number, value: boolean) => {
    setAnswers((prev) => {
      const currentArr = Array.isArray(prev[currentQuestion.id])
        ? ([...(prev[currentQuestion.id] as Array<boolean | undefined>)] as boolean[])
        : Array.from({ length: currentQuestion.options.length }, () => undefined as unknown as boolean);
      while (currentArr.length < currentQuestion.options.length) {
        currentArr.push(undefined as unknown as boolean);
      }
      currentArr[stmtIdx] = value;
      return { ...prev, [currentQuestion.id]: currentArr };
    });
  };

  const renderNumberGrid = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-5">
        {questions.map((q, idx) => {
          const isCurrent = idx === currentIndex;
          const isAnswered = isQuestionAnswered(q, answers[q.id]);
          const qFlagged = Boolean(flaggedIds[q.id]);

          let style =
            'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50';
          if (qFlagged) {
            style = 'border-amber-400 bg-amber-50 text-amber-900';
          } else if (isAnswered) {
            style = 'border-emerald-500 bg-emerald-50 text-emerald-900';
          }

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                setCurrentIndex(idx);
                setShowNavSheet(false);
              }}
              aria-label={`Soal nomor ${idx + 1}${isAnswered ? ', sudah dijawab' : ''}${qFlagged ? ', ragu-ragu' : ''}`}
              className={`relative flex min-h-[44px] items-center justify-center rounded-xl border font-mono text-sm font-semibold tabular-nums transition-colors ${style} ${
                isCurrent ? 'ring-2 ring-blue-600 ring-offset-1' : ''
              }`}
            >
              <span>{idx + 1}</span>
              {qFlagged && (
                <Flag
                  className="absolute right-1 top-1 h-2.5 w-2.5 text-amber-600"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
            Sudah dijawab
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {stats.answered}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            Ragu-ragu
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {stats.flagged}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="inline-block h-3.5 w-3.5 rounded border border-slate-300 bg-white" />
            Belum dijawab
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {stats.unanswered}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Compact Sticky Exam Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleExitExam}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Keluar dari ujian"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold text-slate-900 sm:text-base">
                {packet.title}
              </p>
              <p className="truncate text-xs text-slate-500">
                {mode === 'timed' ? 'Mode Ujian Berwaktu' : 'Mode Latihan Mandiri'} · {studentName}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {mode === 'timed' ? (
              <div
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono text-sm font-bold tabular-nums ${
                  isLowTime
                    ? 'border-rose-300 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-800'
                }`}
                aria-label="Sisa waktu ujian"
              >
                {isLowTime ? (
                  <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />
                ) : (
                  <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />
                )}
                <span>{formatTimer(secondsLeft)}</span>
              </div>
            ) : (
              <div className="hidden items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold tabular-nums text-slate-700 sm:flex">
                <Clock className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>{formatTimer(elapsedSeconds)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowNavSheet(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                {currentIndex + 1}/{questions.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 whitespace-nowrap shrink-0 sm:px-4 sm:text-sm"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>Kumpulkan</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column CAT Workspace */}
      <main className="mx-auto mt-5 max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Question Card */}
          <section className="lg:col-span-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 text-xs text-slate-500">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-bold tabular-nums text-blue-700">
                    Soal {currentIndex + 1} / {questions.length}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{currentQuestion.subject}</span>
                  <span aria-hidden="true">·</span>
                  <span>Tingkat {currentQuestion.difficulty}</span>
                  <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                    {getQuestionTypeLabel(currentType)}
                  </span>
                </div>
                {isFlagged && (
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                    <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                    Ditandai Ragu-ragu
                  </span>
                )}
              </div>

              {/* Optional Soal Cerita / Wacana / Ilustrasi Stimulus */}
              {currentQuestion.stimulus && currentQuestion.stimulus.trim().length > 0 && (
                <div className="mt-5 rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-800">
                    <BookOpen className="h-4 w-4" aria-hidden="true" />
                    <span>Bacaan / Ilustrasi Soal</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800 sm:text-base">
                    {currentQuestion.stimulus}
                  </p>
                </div>
              )}

              <div className="mt-5">
                <p className="whitespace-pre-line text-base leading-relaxed font-medium text-slate-900 sm:text-lg">
                  {currentQuestion.prompt}
                </p>
                {currentType === 'mcma' && (
                  <p className="mt-1.5 text-xs font-semibold text-blue-700">
                    Pilih semua jawaban yang benar (bisa lebih dari satu pilihan).
                  </p>
                )}
                {currentType === 'true_false' && (
                  <p className="mt-1.5 text-xs font-semibold text-blue-700">
                    Tentukan Benar atau Salah untuk setiap pernyataan di bawah ini.
                  </p>
                )}
              </div>

              {/* Answer Input Area per Question Type */}
              {currentType === 'pg' && (
                <div className="mt-6 space-y-3" role="radiogroup" aria-label="Pilihan jawaban">
                  {currentQuestion.options.map((optText, idx) => {
                    const isChosen = currentAnswer === idx;
                    const isCorrectOpt = currentQuestion.correctIndex === idx;

                    let buttonClasses =
                      'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-slate-50';
                    let letterClasses = 'border-slate-200 bg-slate-100 text-slate-700';

                    if (isRevealed) {
                      if (isCorrectOpt) {
                        buttonClasses = 'border-emerald-500 bg-emerald-50 text-emerald-950';
                        letterClasses = 'border-emerald-600 bg-emerald-600 text-white';
                      } else if (isChosen && !isCorrectOpt) {
                        buttonClasses = 'border-rose-400 bg-rose-50 text-rose-950';
                        letterClasses = 'border-rose-600 bg-rose-600 text-white';
                      }
                    } else if (isChosen) {
                      buttonClasses = 'border-blue-600 bg-blue-50 text-blue-950';
                      letterClasses = 'border-blue-600 bg-blue-600 text-white';
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        role="radio"
                        aria-checked={isChosen}
                        onClick={() => {
                          setAnswers((prev) => ({ ...prev, [currentQuestion.id]: idx }));
                        }}
                        className={`flex min-h-[54px] w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${buttonClasses}`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border font-mono text-sm font-bold ${letterClasses}`}
                        >
                          {optionLabels[idx]}
                        </span>
                        <span className="flex-1 text-sm leading-snug font-medium sm:text-base">
                          {optText}
                        </span>
                        {isRevealed && isCorrectOpt && (
                          <CheckCircle2
                            className="h-5 w-5 shrink-0 text-emerald-600"
                            aria-label="Jawaban benar"
                          />
                        )}
                        {isRevealed && isChosen && !isCorrectOpt && (
                          <XCircle
                            className="h-5 w-5 shrink-0 text-rose-600"
                            aria-label="Jawaban kurang tepat"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentType === 'mcma' && (
                <div className="mt-6 space-y-3" role="group" aria-label="Pilihan jawaban ganda kompleks">
                  {currentQuestion.options.map((optText, idx) => {
                    const chosenList = Array.isArray(currentAnswer)
                      ? (currentAnswer as number[])
                      : [];
                    const isChosen = chosenList.includes(idx);
                    const expectedList = getEffectiveCorrectIndices(currentQuestion);
                    const isCorrectOpt = expectedList.includes(idx);

                    let buttonClasses =
                      'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-slate-50';
                    let checkClasses = 'border-slate-300 bg-white text-transparent';

                    if (isRevealed) {
                      if (isCorrectOpt) {
                        buttonClasses = 'border-emerald-500 bg-emerald-50 text-emerald-950';
                        checkClasses = isChosen
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-emerald-600 bg-white text-emerald-600';
                      } else if (isChosen && !isCorrectOpt) {
                        buttonClasses = 'border-rose-400 bg-rose-50 text-rose-950';
                        checkClasses = 'border-rose-600 bg-rose-600 text-white';
                      }
                    } else if (isChosen) {
                      buttonClasses = 'border-blue-600 bg-blue-50 text-blue-950';
                      checkClasses = 'border-blue-600 bg-blue-600 text-white';
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        role="checkbox"
                        aria-checked={isChosen}
                        onClick={() => handleToggleMcma(idx)}
                        className={`flex min-h-[54px] w-full items-center gap-3.5 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${buttonClasses}`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${checkClasses}`}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {optionLabels[idx]}.
                        </span>
                        <span className="flex-1 text-sm leading-snug font-medium sm:text-base">
                          {optText}
                        </span>
                        {isRevealed && isCorrectOpt && (
                          <span className="shrink-0 text-xs font-semibold text-emerald-700">
                            {isChosen ? 'Benar' : 'Kunci (Terlewat)'}
                          </span>
                        )}
                        {isRevealed && isChosen && !isCorrectOpt && (
                          <span className="shrink-0 text-xs font-semibold text-rose-700">
                            Salah pilih
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentType === 'true_false' && (
                <div className="mt-6 space-y-3">
                  {currentQuestion.options.map((stmtText, idx) => {
                    const currentBools = Array.isArray(currentAnswer)
                      ? (currentAnswer as Array<boolean | undefined>)
                      : [];
                    const chosenVal = currentBools[idx];
                    const expectedBools = getEffectiveCorrectBooleans(currentQuestion);
                    const expectedVal = expectedBools[idx];
                    const stmtIsRight = typeof chosenVal === 'boolean' && chosenVal === expectedVal;

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                          isRevealed
                            ? stmtIsRight
                              ? 'border-emerald-400 bg-emerald-50/50'
                              : 'border-rose-300 bg-rose-50/50'
                            : 'border-slate-200 bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 sm:flex-1">
                          <span className="mt-0.5 font-mono text-xs font-bold text-slate-500">
                            {idx + 1}.
                          </span>
                          <span className="text-sm leading-snug font-medium text-slate-900 sm:text-base">
                            {stmtText}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetTrueFalse(idx, true)}
                            className={`min-h-[40px] min-w-[82px] rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                              chosenVal === true
                                ? 'border-emerald-600 bg-emerald-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50'
                            }`}
                          >
                            Benar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetTrueFalse(idx, false)}
                            className={`min-h-[40px] min-w-[82px] rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                              chosenVal === false
                                ? 'border-rose-600 bg-rose-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-rose-400 hover:bg-rose-50'
                            }`}
                          >
                            Salah
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Practice mode instant explanation toggle */}
              {mode === 'practice' && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  {!isRevealed ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedIds((prev) => ({ ...prev, [currentQuestion.id]: true }))
                      }
                      disabled={!currentIsAnswered}
                      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <BookOpen className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {currentIsAnswered
                          ? 'Periksa Jawaban & Pembahasan'
                          : currentType === 'true_false'
                          ? 'Isi semua pernyataan Benar/Salah terlebih dahulu'
                          : 'Pilih jawaban dulu untuk melihat pembahasan'}
                      </span>
                    </button>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold text-slate-600">
                        {currentIsCorrect
                          ? 'Bagus! Jawabanmu benar semua.'
                          : `Belum tepat. Kunci jawaban: ${formatCorrectAnswerLabel(currentQuestion)}.`}
                      </p>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                        {currentQuestion.explanation}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Navigation Controls */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  <span>Sebelumnya</span>
                </button>

                <button
                  type="button"
                  onClick={toggleFlag}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isFlagged
                      ? 'border-amber-400 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  <span>{isFlagged ? 'Hapus Ragu' : 'Ragu-ragu'}</span>
                </button>

                {currentIndex < questions.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <span>Selanjutnya</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Selesai & Nilai</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Right: Desktop/Tablet Question Navigator */}
          <aside className="hidden lg:col-span-4 lg:block">
            <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h2 className="font-display text-base font-bold text-slate-900">
                Navigasi Nomor Soal
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Ketuk nomor untuk melompat langsung ke soal tersebut.
              </p>
              <div className="mt-4">{renderNumberGrid()}</div>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile/Tablet Bottom Sheet for Number Navigator */}
      {showNavSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs lg:hidden">
          <div className="w-full max-w-xl rounded-t-3xl bg-white p-5 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="flex items-center justify-between pb-3">
              <h2 className="font-display text-base font-bold text-slate-900">
                Daftar Nomor Soal
              </h2>
              <button
                type="button"
                onClick={() => setShowNavSheet(false)}
                aria-label="Tutup daftar soal"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto pb-4">{renderNumberGrid()}</div>
          </div>
        </div>
      )}

      {/* Confirm Submit Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Kumpulkan Jawaban Ujian?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Setelah dikumpulkan, nilai akan langsung dihitung otomatis beserta pembahasan lengkap setiap soal.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <div>
                <p className="text-xs text-slate-500">Terjawab</p>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-emerald-700">
                  {stats.answered}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ragu-ragu</p>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-amber-700">
                  {stats.flagged}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Kosong</p>
                <p className="mt-0.5 font-mono text-lg font-bold tabular-nums text-slate-700">
                  {stats.unanswered}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Periksa Lagi
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  finalizeExam(elapsedSeconds);
                }}
                className="min-h-[44px] rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
