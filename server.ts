import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isDev = process.env.NODE_ENV === 'development';

interface ImportBody {
  fileName?: string;
  mimeType?: string;
  base64Data?: string;
  rawText?: string;
  defaultSubject?: string;
}

type QuestionType = 'pg' | 'true_false' | 'mcma';

interface ExtractedQuestion {
  questionType: QuestionType;
  stimulus?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  correctIndices?: number[];
  correctBooleans?: boolean[];
  explanation: string;
  difficulty: 'Mudah' | 'Sedang' | 'HOTS';
  subject: string;
}

function htmlToStructuredText(html: string): string {
  return html
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|table)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\|/g, ' |')
    .replace(/\|\s*\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeDifficulty(val: unknown): 'Mudah' | 'Sedang' | 'HOTS' {
  if (val === 'Mudah' || val === 'Sedang' || val === 'HOTS') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower.includes('mudah') || lower.includes('easy')) return 'Mudah';
    if (lower.includes('hots') || lower.includes('sulit') || lower.includes('hard')) return 'HOTS';
  }
  return 'Sedang';
}

function normalizeQuestionType(val: unknown): QuestionType {
  if (typeof val === 'string') {
    const lower = val.trim().toLowerCase();
    if (lower === 'true_false' || lower.includes('benar') || lower.includes('salah')) {
      return 'true_false';
    }
    if (lower === 'mcma' || lower.includes('multiple') || lower.includes('kompleks')) {
      return 'mcma';
    }
  }
  return 'pg';
}

function normalizeSubject(val: unknown, fallback?: string): string {
  const allowed = ['Matematika', 'Bahasa Indonesia', 'IPAS', 'Campuran TKA'];
  if (typeof val === 'string') {
    const found = allowed.find((s) => s.toLowerCase() === val.trim().toLowerCase());
    if (found) return found;
    if (val.toLowerCase().includes('ipa') || val.toLowerCase().includes('sains')) return 'IPAS';
    if (val.toLowerCase().includes('mat') || val.toLowerCase().includes('hitung')) return 'Matematika';
    if (val.toLowerCase().includes('indo') || val.toLowerCase().includes('baca')) return 'Bahasa Indonesia';
    if (val.trim().length > 0) return val.trim().slice(0, 60);
  }
  return fallback && fallback.trim() ? fallback.trim().slice(0, 60) : 'Campuran TKA';
}

function sanitizeQuestions(rawQuestions: unknown[], defaultSubject?: string): ExtractedQuestion[] {
  const cleaned: ExtractedQuestion[] = [];
  for (const item of rawQuestions) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const prompt = String(record.prompt ?? '').trim().slice(0, 2000);
    if (prompt.length < 3) continue;

    const qType = normalizeQuestionType(record.questionType);
    const stimulus = String(record.stimulus ?? '').trim().slice(0, 4000);

    const rawOptions = Array.isArray(record.options)
      ? record.options.map((opt) => String(opt ?? '').trim().slice(0, 500)).filter(Boolean)
      : [];

    let options: string[];
    if (qType === 'pg') {
      while (rawOptions.length < 4) {
        rawOptions.push(`Pilihan ${String.fromCharCode(65 + rawOptions.length)}`);
      }
      options = rawOptions.slice(0, 4);
    } else if (qType === 'mcma') {
      while (rawOptions.length < 3) {
        rawOptions.push(`Pilihan ${String.fromCharCode(65 + rawOptions.length)}`);
      }
      options = rawOptions.slice(0, 6);
    } else {
      // true_false statements
      while (rawOptions.length < 2) {
        rawOptions.push(`Pernyataan ${rawOptions.length + 1}`);
      }
      options = rawOptions.slice(0, 6);
    }

    const maxIdx = options.length - 1;
    let correctIndex = Number(record.correctIndex);
    if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > maxIdx) {
      correctIndex = 0;
    }

    let correctIndices: number[] | undefined;
    if (qType === 'mcma') {
      const rawIdxArr = Array.isArray(record.correctIndices)
        ? record.correctIndices
            .map(Number)
            .filter((n) => Number.isInteger(n) && n >= 0 && n <= maxIdx)
        : [];
      const unique = Array.from(new Set(rawIdxArr)).sort((a, b) => a - b);
      correctIndices = unique.length > 0 ? unique : [correctIndex];
      correctIndex = correctIndices[0];
    }

    let correctBooleans: boolean[] | undefined;
    if (qType === 'true_false') {
      const rawBools = Array.isArray(record.correctBooleans) ? record.correctBooleans : [];
      correctBooleans = options.map((_, i) => Boolean(rawBools[i]));
    }

    let explanation = String(record.explanation ?? '').trim().slice(0, 3000);
    if (explanation.length < 3) {
      if (qType === 'true_false' && correctBooleans) {
        explanation = `Kunci pernyataan Benar/Salah: ${correctBooleans.map((b, i) => `${i + 1}. ${b ? 'Benar' : 'Salah'}`).join(', ')}.`;
      } else if (qType === 'mcma' && correctIndices) {
        explanation = `Jawaban benar adalah ${correctIndices.map((i) => String.fromCharCode(65 + i)).join(', ')}.`;
      } else {
        explanation = `Jawaban yang benar adalah ${String.fromCharCode(65 + correctIndex)}. ${options[correctIndex]}`;
      }
    }

    cleaned.push({
      questionType: qType,
      ...(stimulus ? { stimulus } : {}),
      prompt,
      options,
      correctIndex,
      ...(correctIndices ? { correctIndices } : {}),
      ...(correctBooleans ? { correctBooleans } : {}),
      explanation,
      difficulty: normalizeDifficulty(record.difficulty),
      subject: normalizeSubject(record.subject, defaultSubject),
    });

    if (cleaned.length >= 60) break;
  }
  return cleaned;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.post('/api/import-questions', async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as ImportBody;
      const { fileName = '', mimeType = '', base64Data = '', rawText = '', defaultSubject = 'Campuran TKA' } = body;

      const ai = getGenAIClient();
      if (!ai) {
        res.status(500).json({
          error: 'GEMINI_API_KEY belum dikonfigurasi pada server. Periksa panel Settings > Secrets.',
        });
        return;
      }

      const lowerName = fileName.toLowerCase();
      const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf');
      const isDocx =
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        lowerName.endsWith('.docx');
      const isLegacyDoc = mimeType === 'application/msword' || lowerName.endsWith('.doc');

      if (isLegacyDoc) {
        res.status(400).json({
          error: 'Format .doc lama belum didukung langsung. Silakan simpan ulang dokumen menjadi .docx atau .pdf terlebih dahulu.',
        });
        return;
      }

      const systemPrompt = [
        'Anda adalah asisten guru Sekolah Dasar (SD) di Indonesia yang ahli menyusun dan mengekstrak soal CAT TKA / AKM SD (Matematika, Bahasa Indonesia, IPAS, Literasi, Numerasi).',
        'Tugas Anda: Ekstrak seluruh soal dari dokumen/teks dan PISAHKAN secara otomatis berdasarkan jenis soalnya:',
        '1. `questionType = "pg"` (Pilihan Ganda Biasa): memiliki tepat 4 pilihan jawaban (A, B, C, D) tanpa label "A.", "B.", dst di awal teks, dan 1 jawaban benar pada `correctIndex` (0..3).',
        '2. `questionType = "true_false"` (Pilihan Ganda Kompleks Benar/Salah): soal yang menyajikan 2–6 pernyataan (biasanya berbentuk tabel Benar/Salah atau Sesuai/Tidak Sesuai). Isi `options` dengan daftar kalimat pernyataan (tanpa kolom Benar/Salah), dan isi `correctBooleans` dengan array boolean (true = Benar/Sesuai, false = Salah/Tidak Sesuai) dengan jumlah elemen sama persis dengan `options`.',
        '3. `questionType = "mcma"` (Pilihan Ganda Kompleks MCMA / Multiple Choice Multiple Answer): soal yang meminta memilih lebih dari satu jawaban benar (mis. "Pilihlah dua/beberapa jawaban yang benar", "Berilah tanda centang pada pernyataan yang tepat"). Isi `options` dengan 3–6 pilihan jawaban tanpa huruf awalan, dan isi `correctIndices` dengan array indeks yang benar (mis. [0, 2]).',
        '4. `stimulus` (Soal Cerita / Wacana / Ilustrasi / Tabel): Jika soal didahului teks cerita, puisi, infografik, tabel, atau ilustrasi gambar di dokumen (termasuk di PDF), ekstrak teks wacana atau deskripsi jelas isi ilustrasi/tabel tersebut ke kolom `stimulus`. Jika 1 bacaan/ilustrasi digunakan untuk beberapa nomor soal berturut-turut, SERTAKAN `stimulus` tersebut pada setiap nomor soal yang merujuknya. Jika soal berdiri sendiri tanpa cerita/ilustrasi, kosongkan `stimulus` ("").',
        '5. Tulis `explanation` (pembahasan) dalam bahasa Indonesia yang ramah anak SD, runtut langkah demi langkah, menjelaskan kunci setiap opsi/pernyataan.',
        '6. Klasifikasikan `difficulty` sebagai "Mudah", "Sedang", atau "HOTS", dan `subject` sebagai "Matematika", "Bahasa Indonesia", "IPAS", atau "Campuran TKA".',
      ].join('\n');

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          suggestedTitle: {
            type: Type.STRING,
            description: 'Judul singkat paket soal yang cocok untuk siswa SD.',
          },
          suggestedSubject: {
            type: Type.STRING,
            description: 'Mata pelajaran utama: Matematika, Bahasa Indonesia, IPAS, atau Campuran TKA.',
          },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                questionType: {
                  type: Type.STRING,
                  description: 'Jenis soal: "pg", "true_false", atau "mcma".',
                },
                stimulus: {
                  type: Type.STRING,
                  description: 'Teks bacaan, soal cerita, atau deskripsi ilustrasi/tabel jika ada; kosongkan jika tidak ada.',
                },
                prompt: { type: Type.STRING, description: 'Pertanyaan inti soal secara lengkap dan jelas.' },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Pilihan jawaban (PG=4, MCMA=3-6) atau daftar pernyataan (Benar/Salah=2-6) tanpa awalan huruf.',
                },
                correctIndex: { type: Type.INTEGER, description: 'Indeks jawaban benar untuk PG (0..3).' },
                correctIndices: {
                  type: Type.ARRAY,
                  items: { type: Type.INTEGER },
                  description: 'Daftar indeks jawaban benar untuk MCMA (misal [0, 2]).',
                },
                correctBooleans: {
                  type: Type.ARRAY,
                  items: { type: Type.BOOLEAN },
                  description: 'Daftar boolean Benar (true) / Salah (false) untuk setiap pernyataan pada true_false.',
                },
                explanation: { type: Type.STRING, description: 'Pembahasan lengkap ramah anak SD.' },
                difficulty: { type: Type.STRING, description: 'Mudah, Sedang, atau HOTS.' },
                subject: { type: Type.STRING, description: 'Mata pelajaran soal.' },
              },
              required: ['questionType', 'prompt', 'options', 'correctIndex', 'explanation', 'difficulty', 'subject'],
            },
          },
        },
        required: ['questions'],
      };

      let contents: string | { parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> };

      if (rawText.trim().length > 0) {
        contents = `Mata pelajaran default: ${defaultSubject}\n\nEkstrak dan pisahkan jenis soal (PG, Benar/Salah, MCMA, serta stimulus Soal Cerita/Ilustrasi) dari teks berikut:\n\n${rawText.slice(0, 60000)}`;
      } else if (isPdf && base64Data) {
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        contents = {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: cleanBase64,
              },
            },
            {
              text: `Ekstrak seluruh soal dari dokumen PDF ini (${fileName}) dan pisahkan otomatis jenis soalnya (pg, true_false, mcma) beserta teks wacana/deskripsi ilustrasi di field stimulus. Mata pelajaran default: ${defaultSubject}. Sertakan pembahasan lengkap untuk setiap soal.`,
            },
          ],
        };
      } else if (isDocx && base64Data) {
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const htmlResult = await mammoth.convertToHtml({ buffer });
        let docText = htmlToStructuredText(htmlResult.value || '');
        if (!docText) {
          const rawFallback = await mammoth.extractRawText({ buffer });
          docText = rawFallback.value.trim();
        }
        if (!docText) {
          res.status(400).json({
            error: 'File Word (.docx) tampak kosong atau hanya berisi gambar yang tidak dapat dibaca teksnya. Coba simpan sebagai PDF lalu unggah kembali.',
          });
          return;
        }
        contents = `Nama file: ${fileName}\nMata pelajaran default: ${defaultSubject}\n\nEkstrak dan pisahkan jenis soal (pg, true_false, mcma, serta stimulus soal cerita/tabel) dari teks dokumen Word berikut:\n\n${docText.slice(0, 60000)}`;
      } else if (base64Data) {
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const textDecoded = Buffer.from(cleanBase64, 'base64').toString('utf8').trim();
        if (!textDecoded) {
          res.status(400).json({ error: 'File tidak berisi teks yang dapat dibaca.' });
          return;
        }
        contents = `Nama file: ${fileName}\nMata pelajaran default: ${defaultSubject}\n\nEkstrak dan pisahkan jenis soal dari teks berikut:\n\n${textDecoded.slice(0, 60000)}`;
      } else {
        res.status(400).json({ error: 'Unggah file PDF / Word (.docx) atau tempel teks soal terlebih dahulu.' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const rawJson = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson) as {
        suggestedTitle?: string;
        suggestedSubject?: string;
        questions?: unknown[];
      };

      const questions = sanitizeQuestions(Array.isArray(parsed.questions) ? parsed.questions : [], defaultSubject);

      if (questions.length === 0) {
        res.status(422).json({
          error: 'Tidak ditemukan soal yang jelas dari berkas tersebut. Pastikan soal memiliki pertanyaan yang terbaca.',
        });
        return;
      }

      res.json({
        suggestedTitle: String(parsed.suggestedTitle || fileName.replace(/\.[^.]+$/, '') || 'Paket Impor TKA SD').slice(0, 160),
        suggestedSubject: normalizeSubject(parsed.suggestedSubject, defaultSubject),
        questions,
      });
    } catch (err) {
      console.error('Error in /api/import-questions:', err);
      const message = err instanceof Error ? err.message : 'Gagal memproses dokumen soal.';
      res.status(500).json({
        error: `Gagal mengekstrak soal: ${message}`,
      });
    }
  });

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PintarTKA SD server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
