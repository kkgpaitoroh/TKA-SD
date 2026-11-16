import type { AnswerValue, Question, QuestionType } from '../types';

export function getQuestionType(q: Pick<Question, 'questionType'>): QuestionType {
  if (q.questionType === 'true_false' || q.questionType === 'mcma') {
    return q.questionType;
  }
  return 'pg';
}

export function getQuestionTypeLabel(type: QuestionType): string {
  switch (type) {
    case 'true_false':
      return 'PG Kompleks · Benar / Salah';
    case 'mcma':
      return 'PG Kompleks · Pilih Banyak Jawaban (MCMA)';
    default:
      return 'Pilihan Ganda';
  }
}

export function getQuestionTypeShortLabel(type: QuestionType): string {
  switch (type) {
    case 'true_false':
      return 'Benar/Salah';
    case 'mcma':
      return 'MCMA';
    default:
      return 'PG';
  }
}

export function getEffectiveCorrectIndices(
  q: Pick<Question, 'correctIndex' | 'correctIndices' | 'options'>
): number[] {
  const max = Math.max(0, q.options.length - 1);
  if (Array.isArray(q.correctIndices) && q.correctIndices.length > 0) {
    const valid = Array.from(
      new Set(q.correctIndices.filter((i) => Number.isInteger(i) && i >= 0 && i <= max))
    ).sort((a, b) => a - b);
    if (valid.length > 0) return valid;
  }
  const single = Math.max(0, Math.min(max, Number(q.correctIndex || 0)));
  return [single];
}

export function getEffectiveCorrectBooleans(
  q: Pick<Question, 'correctBooleans' | 'options'>
): boolean[] {
  const len = q.options.length;
  if (Array.isArray(q.correctBooleans) && q.correctBooleans.length > 0) {
    return Array.from({ length: len }, (_, idx) => Boolean(q.correctBooleans?.[idx]));
  }
  return Array.from({ length: len }, (_, idx) => idx === 0);
}

export function isQuestionAnswered(q: Question, answer: AnswerValue | undefined): boolean {
  const type = getQuestionType(q);
  if (type === 'pg') {
    return typeof answer === 'number' && answer >= 0 && answer < q.options.length;
  }
  if (type === 'mcma') {
    return Array.isArray(answer) && answer.some((v) => typeof v === 'number');
  }
  // true_false: all statements must be chosen (true or false)
  if (!Array.isArray(answer) || answer.length !== q.options.length) {
    return false;
  }
  return answer.every((v) => typeof v === 'boolean');
}

export function isQuestionCorrect(q: Question, answer: AnswerValue | undefined): boolean {
  const type = getQuestionType(q);
  if (type === 'pg') {
    return typeof answer === 'number' && answer === q.correctIndex;
  }
  if (type === 'mcma') {
    if (!Array.isArray(answer)) return false;
    const chosen = Array.from(
      new Set(answer.filter((v): v is number => typeof v === 'number' && v >= 0 && v < q.options.length))
    ).sort((a, b) => a - b);
    const expected = getEffectiveCorrectIndices(q);
    if (chosen.length !== expected.length) return false;
    return chosen.every((val, idx) => val === expected[idx]);
  }
  // true_false
  if (!Array.isArray(answer) || answer.length !== q.options.length) return false;
  const expected = getEffectiveCorrectBooleans(q);
  return expected.every((val, idx) => answer[idx] === val);
}

export function countCorrectStatements(q: Question, answer: AnswerValue | undefined): number {
  if (getQuestionType(q) !== 'true_false' || !Array.isArray(answer)) return 0;
  const expected = getEffectiveCorrectBooleans(q);
  return expected.reduce((acc, val, idx) => (answer[idx] === val ? acc + 1 : acc), 0);
}

export function formatCorrectAnswerLabel(q: Question): string {
  const type = getQuestionType(q);
  if (type === 'pg') {
    return String.fromCharCode(65 + Math.max(0, q.correctIndex));
  }
  if (type === 'mcma') {
    return getEffectiveCorrectIndices(q)
      .map((i) => String.fromCharCode(65 + i))
      .join(', ');
  }
  return getEffectiveCorrectBooleans(q)
    .map((b) => (b ? 'B' : 'S'))
    .join('-');
}
