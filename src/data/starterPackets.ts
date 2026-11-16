import type { ExamPacket, Question } from '../types';

export const STARTER_PACKETS: Array<{ packet: ExamPacket; questions: Question[] }> = [
  {
    packet: {
      id: 'starter-matematika-sd-1',
      title: 'Simulasi TKA Matematika SD — Numerasi & Geometri',
      subject: 'Matematika',
      gradeLevel: 'Kelas 6',
      description:
        'Latihan soal operasi hitung campuran, pecahan, perbandingan, kecepatan, dan bangun datar/ruang untuk persiapan ujian SD.',
      durationMinutes: 20,
      questionCount: 8,
      status: 'published',
      createdBy: 'starter',
      source: 'starter',
    },
    questions: [
      {
        id: 'starter-mat-q1',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 1,
        subject: 'Matematika',
        difficulty: 'Mudah',
        prompt: 'Hasil dari 450 + 25 × 12 − 150 adalah ....',
        options: ['500', '600', '5.550', '5.850'],
        correctIndex: 1,
        explanation:
          'Dalam operasi hitung campuran, kerjakan perkalian terlebih dahulu sebelum penjumlahan dan pengurangan:\n1. 25 × 12 = 300\n2. 450 + 300 − 150 = 750 − 150 = 600.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q2',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 2,
        subject: 'Matematika',
        difficulty: 'Sedang',
        prompt:
          'Ibu membeli 2,5 kg gula pasir. Sebanyak 3/4 kg digunakan untuk membuat kue dan 0,5 kg untuk membuat teh manis. Sisa gula pasir Ibu sekarang adalah ....',
        options: ['1,25 kg', '1,50 kg', '1,75 kg', '2,00 kg'],
        correctIndex: 0,
        explanation:
          'Ubah semua pecahan ke bentuk desimal agar mudah dihitung:\n• Gula awal = 2,5 kg\n• Untuk kue = 3/4 kg = 0,75 kg\n• Untuk teh = 0,5 kg\nSisa gula = 2,5 − 0,75 − 0,5 = 1,25 kg.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q3',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 3,
        subject: 'Matematika',
        difficulty: 'Sedang',
        prompt:
          'Perbandingan banyak kelereng Arman dan Budi adalah 3 : 5. Jika selisih kelereng mereka 16 butir, jumlah kelereng Arman dan Budi adalah ....',
        options: ['40 butir', '48 butir', '64 butir', '80 butir'],
        correctIndex: 2,
        explanation:
          'Selisih perbandingan = 5 − 3 = 2 bagian, sedangkan jumlah perbandingan = 3 + 5 = 8 bagian.\nNilai 1 bagian = 16 : 2 = 8 butir.\nJumlah kelereng = 8 × 8 = 64 butir.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q4',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 4,
        subject: 'Matematika',
        difficulty: 'Sedang',
        prompt:
          'Sebuah taman berbentuk persegi panjang memiliki panjang 24 m dan lebar 16 m. Di sekeliling taman akan dipasang lampu dengan jarak antarlampu 4 m. Banyak lampu yang dibutuhkan adalah ....',
        options: ['16 buah', '18 buah', '20 buah', '24 buah'],
        correctIndex: 2,
        explanation:
          'Hitung keliling taman terlebih dahulu:\nKeliling = 2 × (panjang + lebar) = 2 × (24 + 16) = 2 × 40 = 80 m.\nBanyak lampu = Keliling : jarak = 80 : 4 = 20 buah.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q5',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 5,
        subject: 'Matematika',
        difficulty: 'HOTS',
        prompt:
          'Jarak kota A ke kota B adalah 150 km. Ayah berangkat mengendarai mobil pukul 07.15 dengan kecepatan rata-rata 60 km/jam. Ayah akan tiba di kota B pada pukul ....',
        options: ['09.15', '09.30', '09.45', '10.00'],
        correctIndex: 2,
        explanation:
          'Waktu tempuh = Jarak : Kecepatan = 150 km : 60 km/jam = 2,5 jam = 2 jam 30 menit.\nWaktu tiba = 07.15 + 2 jam 30 menit = 09.45.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q6',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 6,
        subject: 'Matematika',
        difficulty: 'Mudah',
        prompt: 'FPB dan KPK dari bilangan 24 dan 36 berturut-turut adalah ....',
        options: ['6 dan 72', '12 dan 72', '12 dan 144', '24 dan 72'],
        correctIndex: 1,
        explanation:
          'Faktorisasi prima:\n• 24 = 2³ × 3\n• 36 = 2² × 3²\nFPB (ambil pangkat terkecil yang sama) = 2² × 3 = 4 × 3 = 12.\nKPK (ambil pangkat terbesar semua faktor) = 2³ × 3² = 8 × 9 = 72.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q7',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 7,
        subject: 'Matematika',
        difficulty: 'HOTS',
        prompt:
          'Sebuah akuarium berbentuk balok berukuran panjang 60 cm, lebar 40 cm, dan tinggi 50 cm. Akuarium tersebut diisi air sebanyak 3/4 bagian. Volume air di dalam akuarium adalah ....',
        options: ['60 liter', '90 liter', '100 liter', '120 liter'],
        correctIndex: 1,
        explanation:
          'Volume penuh balok = 60 × 40 × 50 = 120.000 cm³ = 120 liter (karena 1 liter = 1.000 cm³).\nVolume air = 3/4 × 120 liter = 90 liter.',
        createdBy: 'starter',
      },
      {
        id: 'starter-mat-q8',
        packetId: 'starter-matematika-sd-1',
        packetStatus: 'published',
        order: 8,
        subject: 'Matematika',
        difficulty: 'Sedang',
        prompt:
          'Nilai ulangan matematika Dika sebanyak 4 kali adalah 80, 85, 90, dan 85. Rata-rata nilai ulangan Dika adalah ....',
        options: ['82,5', '84,0', '85,0', '86,5'],
        correctIndex: 2,
        explanation:
          'Jumlah nilai = 80 + 85 + 90 + 85 = 340.\nBanyak ulangan = 4 kali.\nRata-rata = 340 : 4 = 85,0.',
        createdBy: 'starter',
      },
    ],
  },
  {
    packet: {
      id: 'starter-bindo-sd-1',
      title: 'Simulasi TKA Bahasa Indonesia — Literasi Membaca',
      subject: 'Bahasa Indonesia',
      gradeLevel: 'Kelas 6',
      description:
        'Latihan memahami gagasan pokok, pesan tersirat teks bacaan, sinonim, kalimat efektif, dan ejaan baku bahasa Indonesia.',
      durationMinutes: 15,
      questionCount: 8,
      status: 'published',
      createdBy: 'starter',
      source: 'starter',
    },
    questions: [
      {
        id: 'starter-bi-q1',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 1,
        subject: 'Bahasa Indonesia',
        difficulty: 'Mudah',
        prompt:
          'Bacalah paragraf berikut!\n"Pohon bakau di pesisir pantai memiliki peran penting bagi lingkungan. Akarnya yang kuat mampu menahan abrasi atau pengikisan pantai oleh ombak. Selain itu, hutan bakau menjadi tempat hidup yang aman bagi berbagai jenis ikan kecil dan kepiting."\n\nGagasan pokok paragraf tersebut adalah ....',
        options: [
          'Jenis ikan kecil dan kepiting di laut',
          'Peran penting pohon bakau bagi lingkungan pesisir',
          'Penyebab terjadinya abrasi di pantai',
          'Bentuk akar pohon bakau yang unik',
        ],
        correctIndex: 1,
        explanation:
          'Kalimat utama berada di awal paragraf: "Pohon bakau di pesisir pantai memiliki peran penting bagi lingkungan." Kalimat berikutnya menjelaskan peran tersebut (menahan abrasi dan tempat hidup hewan laut).',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q2',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 2,
        subject: 'Bahasa Indonesia',
        difficulty: 'Mudah',
        prompt:
          'Rani selalu datang tepat waktu dan mengerjakan tugas dengan tekun. Sinonim kata "tekun" pada kalimat tersebut adalah ....',
        options: ['Malas', 'Rajin', 'Terburu-buru', 'Ceroboh'],
        correctIndex: 1,
        explanation:
          'Sinonim adalah kata yang memiliki makna sama atau mirip. Kata "tekun" berarti bersungguh-sungguh dan rajin dalam mengerjakan sesuatu.',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q3',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 3,
        subject: 'Bahasa Indonesia',
        difficulty: 'Sedang',
        prompt: 'Manakah kalimat berikut yang menggunakan ejaan kata baku dengan tepat?',
        options: [
          'Ayah pergi ke apotik membeli obat demam.',
          'Siswa kelas enam sedang melakukan praktek IPA.',
          'Jadwal upacara bendera hari Senin sudah diumumkan.',
          'Ibu membeli sekilo cabe merah di pasar pagi.',
        ],
        correctIndex: 2,
        explanation:
          'Kata "jadwal" sudah baku sesuai KBBI. Bentuk baku kata lainnya adalah "apotek" (bukan apotik), "praktik" (bukan praktek), dan "cabai" (bukan cabe).',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q4',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 4,
        subject: 'Bahasa Indonesia',
        difficulty: 'Sedang',
        prompt:
          'Perhatikan pantun berikut:\n"Pergi ke taman memetik melati,\nHarum baunya di pagi hari.\nRajin membaca setiap hari,\nIlmu bertambah cerdaskan diri."\n\nPesan (amanat) dari pantun tersebut adalah ....',
        options: [
          'Kita harus menanam bunga melati di taman',
          'Waktu terbaik berjalan-jalan adalah pagi hari',
          'Rajin membaca membuat ilmu bertambah dan diri semakin cerdas',
          'Memetik bunga tidak boleh dilakukan sembarangan',
        ],
        correctIndex: 2,
        explanation:
          'Amanat pantun selalu terletak pada baris ketiga dan keempat (bagian isi): "Rajin membaca setiap hari, ilmu bertambah cerdaskan diri."',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q5',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 5,
        subject: 'Bahasa Indonesia',
        difficulty: 'Sedang',
        prompt:
          'Kalimat majemuk yang menyatakan hubungan sebab-akibat terdapat pada ....',
        options: [
          'Adik menyapu halaman, sedangkan kakak mengepel lantai.',
          'Banjir terjadi di desa itu karena saluran air tersumbat sampah.',
          'Ayah membaca koran sambil minum teh hangat.',
          'Setelah makan malam, Sinta segera menyiapkan buku pelajaran.',
        ],
        correctIndex: 1,
        explanation:
          'Kata penghubung "karena" menunjukkan hubungan sebab-akibat. Akibatnya adalah banjir terjadi, dan sebabnya adalah saluran air tersumbat sampah.',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q6',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 6,
        subject: 'Bahasa Indonesia',
        difficulty: 'HOTS',
        prompt:
          'Bacalah kutipan cerita berikut:\n"Saat melihat dompet terjatuh di halaman sekolah, Bima segera memungutnya tanpa membuka isinya. Ia langsung menyerahkan dompet tersebut ke ruang guru agar diumumkan kepada pemiliknya."\n\nWatak tokoh Bima dalam cerita di atas adalah ....',
        options: ['Sombong dan penakut', 'Jujur dan bertanggung jawab', 'Pemalu dan pendiam', 'Keras kepala'],
        correctIndex: 1,
        explanation:
          'Tindakan Bima yang tidak mengambil isi dompet dan langsung menyerahkannya ke ruang guru menunjukkan sifat jujur dan bertanggung jawab.',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q7',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 7,
        subject: 'Bahasa Indonesia',
        difficulty: 'Mudah',
        prompt: 'Penulisan kalimat langsung dengan tanda baca yang benar adalah ....',
        options: [
          'Ibu berkata, "Jangan lupa sarapan sebelum berangkat sekolah!"',
          'Ibu berkata "Jangan lupa sarapan sebelum berangkat sekolah"!',
          'Ibu berkata: Jangan lupa sarapan sebelum berangkat sekolah!',
          '"Ibu berkata, Jangan lupa sarapan sebelum berangkat sekolah!"',
        ],
        correctIndex: 0,
        explanation:
          'Dalam kalimat langsung, tanda koma (,) diletakkan sebelum tanda petik pembuka, huruf awal kutipan menggunakan huruf kapital, dan tanda seru diletakkan di dalam tanda petik penutup.',
        createdBy: 'starter',
      },
      {
        id: 'starter-bi-q8',
        packetId: 'starter-bindo-sd-1',
        packetStatus: 'published',
        order: 8,
        subject: 'Bahasa Indonesia',
        difficulty: 'HOTS',
        prompt:
          'Perhatikan kalimat tidak efektif berikut:\n"Para siswa-siswa sekalian dimohon untuk segera masuk ke dalam kelas."\n\nPerbaikan menjadi kalimat efektif yang tepat adalah ....',
        options: [
          'Semua para siswa dimohon untuk masuk ke kelas.',
          'Para siswa dimohon segera masuk ke kelas.',
          'Siswa-siswa sekalian dimohon untuk masuk ke dalam kelas.',
          'Para siswa-siswa dimohon masuk ke kelas.',
        ],
        correctIndex: 1,
        explanation:
          'Kata "para", pengulangan "siswa-siswa", dan "sekalian" sama-sama bermakna jamak sehingga mubazir jika dipakai bersamaan. Cukup gunakan "Para siswa" atau "Siswa-siswa".',
        createdBy: 'starter',
      },
    ],
  },
  {
    packet: {
      id: 'starter-ipas-sd-1',
      title: 'Simulasi TKA IPAS SD — Alam, Energi & Tata Surya',
      subject: 'IPAS',
      gradeLevel: 'Kelas 6',
      description:
        'Latihan konsep fotosintesis, rantai makanan, perubahan wujud benda, gaya dan energi, serta sistem tata surya untuk SD.',
      durationMinutes: 15,
      questionCount: 8,
      status: 'published',
      createdBy: 'starter',
      source: 'starter',
    },
    questions: [
      {
        id: 'starter-ipas-q1',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 1,
        subject: 'IPAS',
        difficulty: 'Mudah',
        prompt:
          'Pada proses fotosintesis, tumbuhan hijau memerlukan cahaya matahari, air, dan karbon dioksida untuk menghasilkan ....',
        options: [
          'Nitrogen dan mineral',
          'Karbohidrat (glukosa) dan oksigen',
          'Karbon dioksida dan uap air',
          'Klorofil dan hidrogen',
        ],
        correctIndex: 1,
        explanation:
          'Tumbuhan hijau memanfaatkan energi cahaya matahari untuk mengubah air (H₂O) dan karbon dioksida (CO₂) menjadi zat makanan berupa glukosa/karbohidrat serta melepaskan gas oksigen (O₂) ke udara.',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q2',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 2,
        subject: 'IPAS',
        difficulty: 'Sedang',
        prompt:
          'Di sebuah ekosistem sawah terdapat rantai makanan: Padi → Tikus → Ular → Elang. Jika populasi ular tiba-tiba berkurang drastis karena diburu, dampak yang paling mungkin terjadi adalah ....',
        options: [
          'Populasi tikus meningkat dan hasil panen padi menurun',
          'Populasi tikus menurun dan populasi elang meningkat',
          'Populasi padi meningkat pesat',
          'Tidak ada perubahan pada ekosistem sawah',
        ],
        correctIndex: 0,
        explanation:
          'Ular adalah pemangsa tikus. Jika ular berkurang, pemangsa tikus berkurang sehingga jumlah tikus melonjak dan memakan lebih banyak tanaman padi.',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q3',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 3,
        subject: 'IPAS',
        difficulty: 'Mudah',
        prompt:
          'Kapur barus (kamper) yang diletakkan di dalam lemari pakaian lama-kelamaan akan mengecil dan menghilang. Perubahan wujud benda yang terjadi disebut ....',
        options: ['Menguap', 'Mencair', 'Menyublim', 'Mengkristal'],
        correctIndex: 2,
        explanation:
          'Kapur barus adalah benda padat yang berubah langsung menjadi gas (tercium baunya di lemari) tanpa mencair terlebih dahulu. Perubahan padat menjadi gas disebut menyublim.',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q4',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 4,
        subject: 'IPAS',
        difficulty: 'Sedang',
        prompt:
          'Perubahan bentuk energi yang terjadi ketika kipas angin dinyalakan adalah ....',
        options: [
          'Energi gerak menjadi energi listrik',
          'Energi listrik menjadi energi gerak',
          'Energi kimia menjadi energi panas',
          'Energi listrik menjadi energi bunyi',
        ],
        correctIndex: 1,
        explanation:
          'Kipas angin menggunakan arus listrik dari stopkontak untuk memutar motor baling-baling sehingga menghasilkan hembusan angin (energi gerak).',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q5',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 5,
        subject: 'IPAS',
        difficulty: 'Sedang',
        prompt:
          'Fungsi utama sel darah merah (eritrosit) dalam sistem peredaran darah manusia adalah ....',
        options: [
          'Membunuh kuman penyakit yang masuk ke tubuh',
          'Membantu proses pembekuan darah saat terluka',
          'Mengedarkan oksigen ke seluruh tubuh',
          'Mengatur suhu tubuh agar tetap hangat',
        ],
        correctIndex: 2,
        explanation:
          'Sel darah merah mengandung hemoglobin yang mengikat oksigen dari paru-paru dan mengedarkannya ke seluruh sel tubuh. Pembunuh kuman adalah sel darah putih, sedangkan pembekuan darah dilakukan keping darah (trombosit).',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q6',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 6,
        subject: 'IPAS',
        difficulty: 'HOTS',
        prompt:
          'Perhatikan peristiwa berikut:\n1) Terjadinya siang dan malam\n2) Pergantian musim di belahan bumi\n3) Gerak semu harian matahari dari timur ke barat\n4) Perbedaan waktu di berbagai wilayah Indonesia\n\nPeristiwa yang merupakan akibat dari rotasi bumi ditunjukkan oleh nomor ....',
        options: ['1, 2, dan 3', '1, 3, dan 4', '2, 3, dan 4', '1 dan 2 saja'],
        correctIndex: 1,
        explanation:
          'Rotasi bumi (perputaran bumi pada porosnya) menyebabkan siang dan malam (1), gerak semu harian matahari (3), dan pembagian zona waktu WIB/WITA/WIT (4). Pergantian musim (2) disebabkan oleh revolusi bumi terhadap matahari.',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q7',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 7,
        subject: 'IPAS',
        difficulty: 'Mudah',
        prompt:
          'Planet terbesar di dalam sistem tata surya kita yang memiliki bintik merah raksasa adalah ....',
        options: ['Saturnus', 'Mars', 'Jupiter', 'Neptunus'],
        correctIndex: 2,
        explanation:
          'Jupiter adalah planet terbesar di tata surya yang sebagian besar tersusun atas gas dan terkenal dengan badai raksasa bernama Bintik Merah Besar.',
        createdBy: 'starter',
      },
      {
        id: 'starter-ipas-q8',
        packetId: 'starter-ipas-sd-1',
        packetStatus: 'published',
        order: 8,
        subject: 'IPAS',
        difficulty: 'HOTS',
        prompt:
          'Ban sepeda dibuat beralur dan tidak halus agar pengendara tidak mudah tergelincir saat melewati jalan basah. Gaya yang dimanfaatkan pada desain alur ban tersebut adalah ....',
        options: ['Gaya gravitasi', 'Gaya pegas', 'Gaya magnet', 'Gaya gesek'],
        correctIndex: 3,
        explanation:
          'Alur pada ban memperbesar gaya gesek antara permukaan ban dan aspal sehingga ban mencengkeram jalan dengan kuat dan tidak mudah selip.',
        createdBy: 'starter',
      },
    ],
  },
];
