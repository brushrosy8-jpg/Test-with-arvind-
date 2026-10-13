require('dotenv').config();
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
// Render terminates HTTPS at its proxy; trust it so secure session cookies work.
if (process.env.RENDER) app.set('trust proxy', 1);
const db = new Database(process.env.DB_PATH || 'data.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tests (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subject TEXT DEFAULT '', duration INTEGER NOT NULL DEFAULT 20, marks REAL NOT NULL DEFAULT 1, negative REAL NOT NULL DEFAULT 0, published INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, prompt TEXT NOT NULL, a TEXT NOT NULL, b TEXT NOT NULL, c TEXT NOT NULL, d TEXT NOT NULL, answer INTEGER NOT NULL, explanation TEXT DEFAULT '', FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, student_name TEXT DEFAULT 'विद्यार्थी', score REAL NOT NULL, correct INTEGER NOT NULL, wrong INTEGER NOT NULL, attempted INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);
db.pragma('foreign_keys = ON');

const adminUser = process.env.ADMIN_USERNAME || 'admin';
const adminPass = process.env.ADMIN_PASSWORD || 'ChangeThisPassword123!';
if (!db.prepare('SELECT id FROM admins WHERE username=?').get(adminUser)) {
  db.prepare('INSERT INTO admins(username,password_hash) VALUES(?,?)').run(adminUser, bcrypt.hashSync(adminPass, 12));
}
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8*60*60*1000 }
}));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

function adminOnly(req,res,next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({error:'पहले एडमिन लॉगिन करें।'});
}
app.post('/api/admin/login', (req,res) => {
  const {username,password} = req.body || {};
  const row = db.prepare('SELECT * FROM admins WHERE username=?').get(String(username||''));
  if (!row || !bcrypt.compareSync(String(password||''), row.password_hash)) return res.status(401).json({error:'आईडी या पासवर्ड गलत है।'});
  req.session.adminId = row.id;
  req.session.adminUsername = row.username;
  res.json({ok:true, username:row.username});
});
app.post('/api/admin/logout', (req,res) => { req.session.destroy(()=>res.json({ok:true})); });
app.get('/api/admin/me', (req,res) => res.json({loggedIn:!!req.session.adminId, username:req.session.adminUsername||''}));

app.post('/api/admin/extract-questions', adminOnly, upload.single('file'), async (req, res) => {
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
      const result = await pdfParse(req.file.buffer);
      text = result.text || '';
    } else {
      const result = await Tesseract.recognize(
        req.file.buffer,
        'eng',
        { logger: () => {} }
      );
      text = result.data.text || '';
    }

    if (!text.trim()) {
      return res.status(400).json({
        error: 'टेक्स्ट नहीं पढ़ पाया। साफ़ PDF या फोटो आज़माएँ।'
      });
    }

    res.json({ ok: true, extractedText: text.slice(0, 30000) });
  } catch (err) {
    console.error('Question extraction failed:', err.message);
    res.status(500).json({
      error: 'फ़ाइल पढ़ने में समस्या हुई। दूसरी फ़ाइल आज़माएँ।'
    });
  }
});

      
app.get('/api/tests', (req,res) => {
  const tests = db.prepare(`SELECT t.id,t.title,t.subject,t.duration,t.marks,t.negative,
    (SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id) question_count
    FROM tests t WHERE t.published=1 ORDER BY t.id DESC`).all();
  res.json(tests);
});
app.get('/api/tests/:id', (req,res) => {
  const t = db.prepare('SELECT id,title,subject,duration,marks,negative FROM tests WHERE id=? AND published=1').get(Number(req.params.id));
  if (!t) return res.status(404).json({error:'टेस्ट नहीं मिला।'});
  const qs = db.prepare('SELECT id,prompt,a,b,c,d FROM questions WHERE test_id=? ORDER BY id').all(t.id);
  res.json({...t,questions:qs});
});
app.post('/api/tests/:id/submit', (req,res) => {
  const id = Number(req.params.id);
  const t = db.prepare('SELECT * FROM tests WHERE id=? AND published=1').get(id);
  if (!t) return res.status(404).json({error:'टेस्ट नहीं मिला।'});
  const qs = db.prepare('SELECT id,answer,explanation FROM questions WHERE test_id=? ORDER BY id').all(id);
  const answers = req.body && req.body.answers || {};
  let correct=0, wrong=0, attempted=0, score=0;
  const details = qs.map((q,i) => {
    const val = answers[String(q.id)];
    const chosen = val === undefined || val === null || val === '' ? null : Number(val);
    if (chosen !== null) {
      attempted++;
      if (chosen === q.answer) { correct++; score += Number(t.marks); }
      else { wrong++; score -= Number(t.negative); }
    }
    return {id:q.id, correctAnswer:q.answer, explanation:q.explanation||''};
  });
  score = Math.round(score*100)/100;
  db.prepare('INSERT INTO results(test_id,student_name,score,correct,wrong,attempted) VALUES(?,?,?,?,?,?)')
    .run(id, String((req.body && req.body.name)||'विद्यार्थी').slice(0,80), score, correct, wrong, attempted);
  res.json({title:t.title, total:qs.length, correct, wrong, attempted, score, maxScore:qs.length*Number(t.marks), details});
});

app.get('/api/admin/tests', adminOnly, (req,res) => {
  res.json(db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM questions q WHERE q.test_id=t.id) question_count FROM tests t ORDER BY t.id DESC`).all());
});
app.post('/api/admin/tests', adminOnly, (req,res) => {
  const {title,subject='',duration=20,marks=1,negative=0,published=false,questions=[]}=req.body||{};
  if (!String(title||'').trim()) return res.status(400).json({error:'टेस्ट का नाम लिखें।'});
  if (!Array.isArray(questions)) return res.status(400).json({error:'प्रश्नों का प्रारूप गलत है।'});
  const create = db.transaction(() => {
    const result = db.prepare('INSERT INTO tests(title,subject,duration,marks,negative,published) VALUES(?,?,?,?,?,?)')
      .run(String(title).slice(0,160), String(subject).slice(0,100), Math.max(1,Math.min(600,Number(duration)||20)), Math.max(0,Number(marks)||1), Math.max(0,Number(negative)||0), published?1:0);
    const ins = db.prepare('INSERT INTO questions(test_id,prompt,a,b,c,d,answer,explanation) VALUES(?,?,?,?,?,?,?,?)');
    for (const q of questions) {
      if (!String(q.prompt||'').trim() || ![q.a,q.b,q.c,q.d].every(v=>String(v||'').trim()) || ![0,1,2,3].includes(Number(q.answer))) throw new Error('हर प्रश्न में प्रश्न, चार विकल्प और सही उत्तर भरें।');
      ins.run(result.lastInsertRowid, String(q.prompt).slice(0,2000), String(q.a).slice(0,500), String(q.b).slice(0,500), String(q.c).slice(0,500), String(q.d).slice(0,500), Number(q.answer), String(q.explanation||'').slice(0,2000));
    }
    return result.lastInsertRowid;
  });
  try { res.json({ok:true,id:create()}); } catch(e) { res.status(400).json({error:e.message||'टेस्ट नहीं बन पाया।'}); }
});
app.put('/api/admin/tests/:id/publish', adminOnly, (req,res) => {
  const t = db.prepare('SELECT id FROM tests WHERE id=?').get(Number(req.params.id));
  if (!t) return res.status(404).json({error:'टेस्ट नहीं मिला।'});
  db.prepare('UPDATE tests SET published=? WHERE id=?').run(req.body.published?1:0,t.id);
  res.json({ok:true});
});
app.delete('/api/admin/tests/:id', adminOnly, (req,res) => {
  const id=Number(req.params.id);
  db.prepare('DELETE FROM questions WHERE test_id=?').run(id);
  db.prepare('DELETE FROM results WHERE test_id=?').run(id);
  db.prepare('DELETE FROM tests WHERE id=?').run(id);
  res.json({ok:true});
});
app.get('/api/admin/results', adminOnly, (req,res) => {
  res.json(db.prepare(`SELECT r.*,t.title AS test_title FROM results r JOIN tests t ON t.id=r.test_id ORDER BY r.id DESC LIMIT 300`).all());
});
app.post('/api/admin/change-password', adminOnly, (req,res) => {
  const {oldPassword,newPassword}=req.body||{};
  if (String(newPassword||'').length < 12) return res.status(400).json({error:'नया पासवर्ड कम से कम 12 अक्षरों का रखें।'});
  const row=db.prepare('SELECT * FROM admins WHERE id=?').get(req.session.adminId);
  if (!row || !bcrypt.compareSync(String(oldPassword||''),row.password_hash)) return res.status(400).json({error:'पुराना पासवर्ड गलत है।'});
  db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(newPassword),12),row.id);
  res.json({ok:true});
});

const port = Number(process.env.PORT)||3000;
app.listen(port, ()=>console.log(`Exam Saathi running on port ${port}`));
