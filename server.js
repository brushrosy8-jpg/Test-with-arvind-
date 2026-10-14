const fs = require('fs');

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

const app = express();

if (process.env.RENDER) app.set('trust proxy', 1);

const db = new Database(process.env.DB_PATH || 'data.sqlite');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 20,
  marks REAL NOT NULL DEFAULT 1,
  negative REAL NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  prompt TEXT NOT NULL,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  c TEXT NOT NULL,
  d TEXT NOT NULL,
  answer INTEGER NOT NULL,
  explanation TEXT DEFAULT '',
  FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  test_id INTEGER NOT NULL,
  student_name TEXT DEFAULT 'विद्यार्थी',
  score REAL NOT NULL,
  correct INTEGER NOT NULL,
  wrong INTEGER NOT NULL,
  attempted INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const adminUser = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'arvind';

if (!adminPass && !db.prepare('SELECT id FROM admins WHERE username=?').get(adminUser)) {
  console.warn('Set ADMIN_PASSWORD in environment before creating an admin account.');
} else if (!db.prepare('SELECT id FROM admins WHERE username=?').get(adminUser)) {
  db.prepare(
    'INSERT INTO admins(username,password_hash) VALUES(?,?)'
  ).run(adminUser, bcrypt.hashSync(adminPass, 12));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

function adminOnly(req, res, next) {
  if (req.session?.adminId) return next();
  return res.status(401).json({ error: 'पहले एडमिन लॉगिन करें।' });
}

const clean = value => String(value ?? '').trim();

function normalizeText(value) {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOptionLetter(value) {
  const s = String(value || '').toUpperCase();
  return ({ A: 0, B: 1, C: 2, D: 3 })[s];
}

/* ---------------- Authentication ---------------- */

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const row = db.prepare(
    'SELECT * FROM admins WHERE username=?'
  ).get(String(username || ''));

  if (!row || !bcrypt.compareSync(String(password || ''), row.password_hash)) {
    return res.status(401).json({ error: 'आईडी या पासवर्ड गलत है।' });
  }

  req.session.adminId = row.id;
  req.session.adminUsername = row.username;

  res.json({ ok: true, username: row.username });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  res.json({
    loggedIn: !!req.session?.adminId,
    username: req.session?.adminUsername || ''
  });
});

/* ---------------- PDF / Image Extraction ---------------- */

app.post(
  '/api/admin/extract-questions',
  adminOnly,
  upload.single('file'),
  async (req, res) => {
    let pdf;

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'PDF या फोटो चुनें।' });
      }

      const name = (req.file.originalname || '').toLowerCase();
      const isPdf =
        req.file.mimetype === 'application/pdf' || name.endsWith('.pdf');

      const isImage =
        ['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype) ||
        /\.(jpg|jpeg|png|webp)$/.test(name);

      if (!isPdf && !isImage) {
        return res.status(400).json({
          error: 'केवल PDF, JPG, PNG या WEBP फ़ाइल अपलोड करें।'
        });
      }

      let text = '';

      if (isPdf) {
        try {
          const result = await pdfParse(req.file.buffer);
          text = normalizeText(result.text);
        } catch (err) {
          console.warn('PDF text extraction failed:', err.message);
        }

        // स्कैन की हुई PDF या बहुत कम टेक्स्ट होने पर OCR fallback।
        if (text.length < 100) {
          const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
          const { createCanvas } = require('@napi-rs/canvas');

          pdf = await pdfjs.getDocument({
            data: new Uint8Array(req.file.buffer)
          }).promise;

          if (pdf.numPages > 30) {
            return res.status(400).json({
              error: 'PDF में 30 से अधिक पेज हैं। छोटे भागों में अपलोड करें।'
            });
          }

          const pages = [];

          for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
            const page = await pdf.getPage(pageNo);
            const viewport = page.getViewport({ scale: 2 });
            const width = Math.ceil(viewport.width);
            const height = Math.ceil(viewport.height);

            const canvas = createCanvas(width, height);
            const context = canvas.getContext('2d');

            await page.render({
              canvasContext: context,
              viewport
            }).promise;

            const fullResult = await Tesseract.recognize(
              canvas.toBuffer('image/png'),
              'hin+eng',
              { logger: () => {} }
            );

            let pageText = normalizeText(fullResult.data.text);

            // दो कॉलम वाले पेज के लिए दोनों हिस्से अलग OCR करें।
            // यह heuristic है; हर layout में कॉलम की पहचान सुनिश्चित नहीं।
            if (pageText.length < 100) {
              const half = Math.floor(width / 2);
              const columnTexts = [];

              for (const region of [
                { x: 0, width: half },
                { x: half, width: width - half }
              ]) {
                const crop = createCanvas(region.width, height);
                const cropContext = crop.getContext('2d');

                cropContext.drawImage(
                  canvas,
                  region.x, 0, region.width, height,
                  0, 0, region.width, height
                );

                const result = await Tesseract.recognize(
                  crop.toBuffer('image/png'),
                  'hin+eng',
                  { logger: () => {} }
                );

                columnTexts.push(normalizeText(result.data.text));
              }

              const splitText = columnTexts.filter(Boolean).join('\n\n');
              if (splitText.length > pageText.length) pageText = splitText;
            }

            pages.push(pageText);

            if (pages.join('\n\n').length >= 30000) break;
          }

          const ocrText = normalizeText(pages.join('\n\n'));
          if (ocrText.length > text.length) text = ocrText;
        }
      } else {
        const result = await Tesseract.recognize(
          req.file.buffer,
          'hin+eng',
          { logger: () => {} }
        );

        text = normalizeText(result.data.text);
      }

      if (!text) {
        return res.status(400).json({
          error: 'टेक्स्ट नहीं पढ़ पाया। साफ़ PDF या फोटो आज़माएँ।'
        });
      }

      return res.json({
        ok: true,
        extractedText: text.slice(0, 30000)
      });
    } catch (err) {
      console.error('Question extraction failed:', err);

      return res.status(500).json({
        error: 'फ़ाइल पढ़ने में समस्या हुई। कृपया दूसरी फ़ाइल आज़माएँ।'
      });
    } finally {
      if (pdf) {
        try { await pdf.destroy(); } catch {}
      }
    }
  }
);

/* ---------------- Answer Key / MCQ Parsing ---------------- */

function parseAnswerKey(keyText) {
  const answers = {};
  const text = normalizeText(keyText)
    .replace(/[Ａ-Ｄａ-ｄ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

  // उदाहरण: 1-A, Q2: B, प्रश्न 3. C
  const re =
    /(?:^|\n|\s)(?:प्रश्न\s*|Question\s*|Q\s*)?(\d{1,3})\s*[-.):：।]\s*(?:उत्तर\s*[:.)-]?\s*|Ans(?:wer)?\s*[:.)-]?\s*)?\(?([A-D])\)?(?=\s|$|[,;])/gi;

  let m;
  while ((m = re.exec(text)) !== null) {
    answers[Number(m[1])] = m[2].toUpperCase();
  }

  // उदाहरण: 1 A
  for (const line of text.split('\n')) {
    const match = /^\s*(?:Q\s*)?(\d{1,3})\s+([A-D])\s*$/i.exec(line);
    if (match) answers[Number(match[1])] = match[2].toUpperCase();
  }

  return answers;
}

function parseMcqText(rawText, keyAnswers = {}) {
  const text = normalizeText(rawText)
    .replace(/[Ａ-Ｄａ-ｄ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

  // प्रश्न की शुरुआत को नई लाइन, Q1, Question 1, प्रश्न 1 आदि से पहचानें।
  const startRe =
    /(?:^|\n)\s*(?:(?:प्रश्न|Question|Q)\s*)?(\d{1,3})\s*[.)।:：]\s*/g;

  const starts = [];
  let match;

  while ((match = startRe.exec(text)) !== null) {
    starts.push({
      number: Number(match[1]),
      start: match.index,
      contentStart: startRe.lastIndex
    });
  }

  const questions = [];
  const seen = new Set();

  for (let i = 0; i < starts.length; i++) {
    const current = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].start : text.length;
    const block = text.slice(current.contentStart, end).trim();

    if (!block || seen.has(current.number)) continue;

    // विकल्प: (A), A), A. या A:
    const optionRe = /(?:^|\s)(?:\(([A-D])\)|([A-D])\s*[).:：])\s*/g;
    const found = [];
    let opt;

    while ((opt = optionRe.exec(block)) !== null) {
      found.push({
        letter: (opt[1] || opt[2]).toLowerCase(),
        markerStart: opt.index,
        contentStart: optionRe.lastIndex
      });
    }

    if (found.length < 4) continue;

    const options = {};
    let valid = true;

    for (let j = 0; j < found.length; j++) {
      const item = found[j];
      const optionEnd = j + 1 < found.length
        ? found[j + 1].markerStart
        : block.length;

      const value = normalizeText(
        block.slice(item.contentStart, optionEnd)
      ).replace(/\s+/g, ' ');

      if (!value || options[item.letter]) {
        valid = false;
        break;
      }

      options[item.letter] = value;
    }

    if (!valid || !['a', 'b', 'c', 'd'].every(k => options[k])) continue;

    const prompt = normalizeText(
      block.slice(0, found[0].markerStart)
    ).replace(/\s+/g, ' ');

    if (!prompt) continue;

    const letter = keyAnswers[current.number] || '';
    const answer = normalizeOptionLetter(letter);

    questions.push({
      number: current.number,
      prompt,
      a: options.a,
      b: options.b,
      c: options.c,
      d: options.d,
      answer: Number.isInteger(answer) ? answer : null,
      explanation: '',
      needsReview: !Number.isInteger(answer)
    });

    seen.add(current.number);
  }

  return questions;
}

app.post(
  '/api/admin/parse-mcq-text',
  adminOnly,
  express.text({ type: '*/*', limit: '1mb' }),
  (req, res) => {
    try {
      const text = String(req.body || '').slice(0, 30000);

      if (!text.trim()) {
        return res.status(400).json({ error: 'पेपर का टेक्स्ट खाली है।' });
      }

      const questions = parseMcqText(text, {});
      res.json({ ok: true, questions });
    } catch (err) {
      console.error('MCQ parsing failed:', err);
      res.status(500).json({ error: 'प्रश्न पढ़ने में समस्या हुई।' });
    }
  }
);

/* ---------------- Public Tests ---------------- */

app.get('/api/html-tests', (req, res) => {
  try {
    const ignored = new Set(['index.html', 'admin.html']);

    const tests = fs.readdirSync(__dirname, {
      withFileTypes: true
    })
      .filter(entry =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.html')
      )
      .map(entry => entry.name)
      .filter(name => !ignored.has(name.toLowerCase()))
      .map(file => ({
        title: path.basename(file, '.html')
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
        url: '/' + encodeURIComponent(file)
      }));

    res.json(tests);
  } catch (error) {
    console.error('HTML test listing failed:', error);
    res.status(500).json({
      error: 'HTML टेस्ट सूची लोड नहीं हो सकी।'
    });
  }
});

app.post('/api/tests/:id/submit', (req, res) => {
  const id = Number(req.params.id);
  const test = db.prepare(
    'SELECT * FROM tests WHERE id=? AND published=1'
  ).get(id);

  if (!test) {
    return res.status(404).json({ error: 'टेस्ट नहीं मिला।' });
  }

  const questions = db.prepare(`
    SELECT id, prompt, a, b, c, d, answer, explanation
    FROM questions WHERE test_id=? ORDER BY id
  `).all(id);

  const answers = req.body?.answers || {};
  let correct = 0;
  let wrong = 0;
  let attempted = 0;
  let score = 0;

  const details = questions.map(q => {
    const value = answers[String(q.id)];
    const chosen = value === undefined || value === null || value === ''
      ? null
      : Number(value);

    const validChoice = [0, 1, 2, 3].includes(chosen);
    const chosenAnswer = validChoice ? chosen : null;

    if (chosenAnswer !== null) {
      attempted++;

      if (chosenAnswer === q.answer) {
        correct++;
        score += Number(test.marks);
      } else {
        wrong++;
        score -= Number(test.negative);
      }
    }

    return {
      id: q.id,
      prompt: q.prompt,
      options: [q.a, q.b, q.c, q.d],
      chosenAnswer,
      correctAnswer: q.answer,
      isCorrect: chosenAnswer === q.answer,
      explanation: q.explanation || ''
    };
  });

  score = Math.round(score * 100) / 100;

  const studentName = String(req.body?.name || 'विद्यार्थी')
    .trim()
    .slice(0, 80) || 'विद्यार्थी';

  const saved = db.prepare(`
    INSERT INTO results
      (test_id, student_name, score, correct, wrong, attempted)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, studentName, score, correct, wrong, attempted);

  const rank = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM results
    WHERE test_id = ?
      AND (
        score > ?
        OR (score = ? AND correct > ?)
        OR (
          score = ? AND correct = ?
          AND (
            created_at < (
              SELECT created_at FROM results WHERE id = ?
            )
            OR (
              created_at = (
                SELECT created_at FROM results WHERE id = ?
              )
              AND id < ?
            )
          )
        )
      )
  `).get(
    id, score, score, correct,
    score, correct, saved.lastInsertRowid,
    saved.lastInsertRowid, saved.lastInsertRowid
  ).rank;

  res.json({
    title: test.title,
    total: questions.length,
    correct,
    wrong,
    attempted,
    skipped: questions.length - attempted,
    score,
    maxScore: questions.length * Number(test.marks),
    rank,
    resultId: saved.lastInsertRowid,
    details
  });
});

app.get('/api/tests/:id/leaderboard', (req, res) => {
  const id = Number(req.params.id);

  const test = db.prepare(
    'SELECT id, title FROM tests WHERE id=?'
  ).get(id);

  if (!test) {
    return res.status(404).json({ error: 'टेस्ट नहीं मिला।' });
  }

  const rows = db.prepare(`
    SELECT student_name, score, correct, created_at
    FROM results
    WHERE test_id=?
    ORDER BY score DESC, correct DESC, created_at ASC, id ASC
    LIMIT 10
  `).all(id);

  res.json({
    title: test.title,
    leaderboard: rows.map((row, index) => ({
      rank: index + 1,
      name: row.student_name,
      score: row.score,
      correct: row.correct,
      date: row.created_at
    }))
  });
});


/* ---------------- Admin Test Management ---------------- */

app.get('/api/admin/tests', adminOnly, (req, res) => {
  res.json(db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id) question_count
    FROM tests t ORDER BY t.id DESC
  `).all());
});

app.post('/api/admin/tests', adminOnly, (req, res) => {
  const {
    title, subject = '', duration = 20, marks = 1,
    negative = 0, published = false, questions = []
  } = req.body || {};

  if (!String(title || '').trim()) {
    return res.status(400).json({ error: 'टेस्ट का नाम लिखें।' });
  }

  if (!Array.isArray(questions) || !questions.length) {
    return res.status(400).json({ error: 'कम से कम एक प्रश्न जोड़ें।' });
  }

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO tests(title,subject,duration,marks,negative,published)
      VALUES(?,?,?,?,?,?)
    `).run(
      String(title).slice(0, 160),
      String(subject).slice(0, 100),
      Math.max(1, Math.min(600, Number(duration) || 20)),
      Math.max(0, Number(marks) || 1),
      Math.max(0, Number(negative) || 0),
      published ? 1 : 0
    );

    const insert = db.prepare(`
      INSERT INTO questions(test_id,prompt,a,b,c,d,answer,explanation)
      VALUES(?,?,?,?,?,?,?,?)
    `);

    for (const q of questions) {
      if (
        !String(q.prompt || '').trim() ||
        ![q.a, q.b, q.c, q.d].every(v => String(v || '').trim()) ||
        ![0, 1, 2, 3].includes(Number(q.answer))
      ) {
        throw new Error('हर प्रश्न में प्रश्न, चार विकल्प और सही उत्तर भरें।');
      }

      insert.run(
        result.lastInsertRowid,
        String(q.prompt).slice(0, 2000),
        String(q.a).slice(0, 500),
        String(q.b).slice(0, 500),
        String(q.c).slice(0, 500),
        String(q.d).slice(0, 500),
        Number(q.answer),
        String(q.explanation || '').slice(0, 2000)
      );
    }

    return result.lastInsertRowid;
  });

  try {
    res.json({ ok: true, id: create() });
  } catch (err) {
    res.status(400).json({ error: err.message || 'टेस्ट नहीं बन पाया।' });
  }
});

app.put('/api/admin/tests/:id/publish', adminOnly, (req, res) => {
  const test = db.prepare('SELECT id FROM tests WHERE id=?')
    .get(Number(req.params.id));

  if (!test) return res.status(404).json({ error: 'टेस्ट नहीं मिला।' });

  db.prepare('UPDATE tests SET published=? WHERE id=?')
    .run(req.body?.published ? 1 : 0, test.id);

  res.json({ ok: true });
});

app.delete('/api/admin/tests/:id', adminOnly, (req, res) => {
  const id = Number(req.params.id);

  const remove = db.transaction(() => {
    db.prepare('DELETE FROM questions WHERE test_id=?').run(id);
    db.prepare('DELETE FROM results WHERE test_id=?').run(id);
    db.prepare('DELETE FROM tests WHERE id=?').run(id);
  });

  remove();
  res.json({ ok: true });
});

app.get('/api/admin/results', adminOnly, (req, res) => {
  res.json(db.prepare(`
    SELECT r.*,t.title AS test_title
    FROM results r JOIN tests t ON t.id=r.test_id
    ORDER BY r.id DESC LIMIT 300
  `).all());
});

app.post('/api/admin/change-password', adminOnly, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (String(newPassword || '').length < 12) {
    return res.status(400).json({
      error: 'नया पासवर्ड कम से कम 12 अक्षरों का रखें।'
    });
  }

  const row = db.prepare('SELECT * FROM admins WHERE id=?')
    .get(req.session.adminId);

  if (!row || !bcrypt.compareSync(String(oldPassword || ''), row.password_hash)) {
    return res.status(400).json({ error: 'पुराना पासवर्ड गलत है।' });
  }

  db.prepare('UPDATE admins SET password_hash=? WHERE id=?')
    .run(bcrypt.hashSync(String(newPassword), 12), row.id);

  res.json({ ok: true });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Exam Saathi running on port ${port}`));
