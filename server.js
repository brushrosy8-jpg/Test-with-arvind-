
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Database Setup
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Database connection error:', err.message);
    else console.log('Connected to SQLite database.');
});

// Initialize Tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        roll_number TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subject TEXT DEFAULT 'गणित',
        duration INTEGER DEFAULT 20,
        marks_correct INTEGER DEFAULT 2,
        marks_incorrect INTEGER DEFAULT 1,
        published BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        explanation TEXT,
        FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER,
        student_name TEXT,
        test_id INTEGER,
        subject TEXT,
        score INTEGER,
        correct_count INTEGER,
        incorrect_count INTEGER,
        unanswered_count INTEGER,
        percentage REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(student_id) REFERENCES students(id)
    )`);
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/app.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'app.js'));
});

app.get('/styles.css', (req, res) => {
    res.sendFile(path.join(__dirname, 'styles.css'));
});

app.get('/admin-login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-login.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.use(session({
    store: new SQLiteStore({ db: 'sessions.db', dir: './data' }),
    secret: process.env.SESSION_SECRET || 'test-with-ankita-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true, secure: false }
}));

function requireStudent(req, res, next) {
    if (req.session && req.session.studentId) next();
    else res.status(401).json({ error: 'लॉगिन आवश्यक है' });
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.isAdmin) next();
    else res.status(401).json({ error: 'एडमिन लॉगिन आवश्यक है' });
}

// Student Auth
app.post('/api/auth/register', async (req, res) => {
    const { name, roll_number, password } = req.body;
    if (!name || !roll_number || !password) return res.status(400).json({ error: 'सभी फ़ील्ड आवश्यक हैं' });
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO students (name, roll_number, password) VALUES (?, ?, ?)`, [name, roll_number, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'यह रोल नंबर पहले से रजिस्टर्ड है।' });
                return res.status(500).json({ error: 'डेटाबेस त्रुटि' });
            }
            req.session.studentId = this.lastID;
            req.session.studentName = name;
            res.json({ success: true, user: { id: this.lastID, name } });
        });
    } catch(e) { res.status(500).json({ error: 'सर्वर त्रुटि' }); }
});

app.post('/api/auth/login', (req, res) => {
    const { name, password } = req.body;
    db.get(`SELECT * FROM students WHERE name = ?`, [name], async (err, student) => {
        if (err || !student) return res.status(400).json({ error: 'अमान्य नाम या पासवर्ड' });
        const match = await bcrypt.compare(password, student.password);
        if (match) {
            req.session.studentId = student.id;
            req.session.studentName = student.name;
            res.json({ success: true, user: { id: student.id, name: student.name } });
        } else {
            res.status(400).json({ error: 'अमान्य नाम या पासवर्ड' });
        }
    });
});

app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });
app.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.studentId) res.json({ user: { id: req.session.studentId, name: req.session.studentName } });
    else res.status(401).json({ error: 'Not authenticated' });
});

// Admin Auth
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    if (username === adminUser && password === adminPass) {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'अमान्य एडमिन क्रेडेंशियल्स' });
    }
});

app.post('/api/admin/logout', (req, res) => { req.session.isAdmin = false; res.json({ success: true }); });

// HTML Tests List
app.get('/api/html-tests', (req, res) => { res.json([]); });

// Tests
app.get('/api/tests', requireStudent, (req, res) => {
    db.all(`SELECT id, title, subject, duration, marks_correct, marks_incorrect FROM tests WHERE published = 1`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});

app.get('/api/tests/:id', requireStudent, (req, res) => {
    const testId = req.params.id;
    db.get(`SELECT * FROM tests WHERE id = ? AND published = 1`, [testId], (err, test) => {
        if (err || !test) return res.status(404).json({ error: 'टेस्ट नहीं मिला' });
        db.all(`SELECT id, question, option_a, option_b, option_c, option_d FROM questions WHERE test_id = ?`, [testId], (err, questions) => {
            if (err) return res.status(500).json({ error: 'DB error' });
            res.json({ test, questions });
        });
    });
});

// Submit Test & Calculate Score (+2, -1, 0)
app.post('/api/tests/submit', requireStudent, (req, res) => {
    const { test_id, answers } = req.body;
    const studentId = req.session.studentId;
    const studentName = req.session.studentName;

    db.get(`SELECT * FROM tests WHERE id = ? AND published = 1`, [test_id], (err, test) => {
        if (err || !test) return res.status(404).json({ error: 'अमान्य टेस्ट' });

        db.all(`SELECT * FROM questions WHERE test_id = ?`, [test_id], (err, questions) => {
            if (err) return res.status(500).json({ error: 'DB error' });

            let rawScore = 0;
            let correctCount = 0;
            let incorrectCount = 0;
            let unansweredCount = 0;
            const plus = test.marks_correct || 2;
            const minus = test.marks_incorrect || 1;

            questions.forEach(q => {
                const userAns = answers[q.id];
                const correctAnswer = q.correct_answer;
                if (!userAns) unansweredCount++;
                else if (userAns === correctAnswer) {
                    rawScore += plus;
                    correctCount++;
                } else {
                    rawScore -= minus;
                    incorrectCount++;
                }
            });

            const finalScore = Math.max(0, rawScore);
            const maxScore = questions.length * plus;
            const percentage = maxScore > 0 ? ((finalScore / maxScore) * 100).toFixed(1) : 0;

            db.run(
                `INSERT INTO results (student_id, student_name, test_id, subject, score, correct_count, incorrect_count, unanswered_count, percentage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [studentId, studentName, test_id, test.subject, finalScore, correctCount, incorrectCount, unansweredCount, percentage],
                function(err) {
                    if (err) console.error(err);
                    res.json({ success: true, score: finalScore, maxScore, percentage, correct_count: correctCount, incorrect_count: incorrectCount, unanswered_count: unansweredCount });
                }
            );
        });
    });
});

app.get('/api/my-results', requireStudent, (req, res) => {
    const studentId = req.session.studentId;
    db.all(`SELECT * FROM results WHERE student_id = ? ORDER BY created_at DESC`, [studentId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});

// Leaderboard
app.get('/api/leaderboard', requireStudent, (req, res) => {
    const type = req.query.type || 'overall';
    let query = '';
    let params = [];
    if (type === 'overall') {
        query = `SELECT student_name, SUM(score) as total_score, COUNT(*) as attempts FROM results GROUP BY student_name ORDER BY total_score DESC LIMIT 50`;
    } else {
        query = `SELECT student_name, SUM(score) as total_score, COUNT(*) as attempts FROM results WHERE subject = ? GROUP BY student_name ORDER BY total_score DESC LIMIT 50`;
        params = [type];
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});

// Admin API
app.get('/api/admin/data', requireAdmin, (req, res) => {
    db.get(`SELECT COUNT(*) as count FROM students`, [], (err, studentRow) => {
        db.all(`SELECT * FROM tests ORDER BY created_at DESC`, [], (err, tests) => {
            db.all(`SELECT * FROM results ORDER BY created_at DESC`, [], (err, results) => {
                res.json({ studentCount: studentRow ? studentRow.count : 0, tests, results });
            });
        });
    });
});

// Robust HTML Parser & Importer
app.post('/api/admin/upload-html', requireAdmin, upload.single('htmlFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'कोई HTML फ़ाइल अपलोड नहीं की गई' });
    const { subject, title } = req.body;
    try {
        const htmlContent = fs.readFileSync(req.file.path, 'utf8');
        fs.unlinkSync(req.file.path);

        // Simple robust regex parsing for question blocks
        const questions = [];
        const blocks = htmlContent.split(/<div[^>]*class=["']question-block["'][^>]*>/i);
        
        blocks.slice(1).forEach((block, idx) => {
            const qMatch = block.match(/<p[^>]*class=["']question["'][^>]*>([\s\S]*?)<\/p>/i);
            const aMatch = block.match(/<p[^>]*class=["']answer["'][^>]*>([\s\S]*?)<\/p>/i);
            const eMatch = block.match(/<p[^>]*class=["']explanation["'][^>]*>([\s\S]*?)<\/p>/i);
            
            const options = [];
            const liMatches = block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
            for (const li of liMatches) {
                options.push(li[1].replace(/^[A-Da-d]\)\s*/, '').trim());
            }

            if (qMatch && options.length >= 2) {
                let correctAns = 'A';
                if (aMatch) {
                    const ansText = aMatch[1].toUpperCase();
                    if (ansText.includes('B')) correctAns = 'B';
                    else if (ansText.includes('C')) correctAns = 'C';
                    else if (ansText.includes('D')) correctAns = 'D';
                }
                questions.push({
                    question: qMatch[1].replace(/<[^>]*>/g, '').trim(),
                    option_a: options[0] || 'विकल्प A',
                    option_b: options[1] || 'विकल्प B',
                    option_c: options[2] || 'विकल्प C',
                    option_d: options[3] || 'विकल्प D',
                    correct_answer: correctAns,
                    explanation: eMatch ? eMatch[1].replace(/<[^>]*>/g, '').trim() : ''
                });
            }
        });

        // Fallback if no specific blocks found
        if (questions.length === 0) {
            questions.push({
                question: 'इम्पोर्टेड प्रश्न 1 (कृपया एडिटर में एडिट करें)',
                option_a: 'विकल्प A', option_b: 'विकल्प B', option_c: 'विकल्प C', option_d: 'विकल्प D',
                correct_answer: 'A', explanation: 'व्याख्या जोड़ें'
            });
        }

        db.run(`INSERT INTO tests (title, subject, duration, published) VALUES (?, ?, 20, 0)`, [title || 'इम्पोर्टेड टेस्ट', subject || 'गणित'], function(err) {
            if (err) return res.status(500).json({ error: 'DB error creating test' });
            const testId = this.lastID;
            const stmt = db.prepare(`INSERT INTO questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
            questions.forEach(q => {
                stmt.run(testId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.explanation);
            });
            stmt.finalize();
            res.json({ success: true, testId, count: questions.length });
        });
    } catch(e) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'HTML पार्सिंग त्रुटि' });
    }
});

app.get('/api/admin/tests/:id/questions', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM questions WHERE test_id = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json(rows);
    });
});

app.put('/api/admin/tests/:id/questions', requireAdmin, (req, res) => {
    const testId = req.params.id;
    const { questions } = req.body;
    db.run(`DELETE FROM questions WHERE test_id = ?`, [testId], (err) => {
        const stmt = db.prepare(`INSERT INTO questions (test_id, question, option_a, option_b, option_c, option_d, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
        questions.forEach(q => {
            stmt.run(testId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.explanation);
        });
        stmt.finalize();
        res.json({ success: true });
    });
});

app.put('/api/admin/tests/:id/publish', requireAdmin, (req, res) => {
    db.run(`UPDATE tests SET published = ? WHERE id = ?`, [req.body.published ? 1 : 0, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'DB error' });
        res.json({ success: true });
    });
});

app.delete('/api/admin/tests/:id', requireAdmin, (req, res) => {
    db.run(`DELETE FROM tests WHERE id = ?`, [req.params.id], () => {
        db.run(`DELETE FROM questions WHERE test_id = ?`, [req.params.id], () => res.json({ success: true }));
    });
});

// CSV Export
app.get('/api/admin/results/csv', requireAdmin, (req, res) => {
    db.all(`SELECT * FROM results ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).send('DB error');
        let csv = 'ID,Student Name,Test ID,Subject,Score,Correct,Incorrect,Unanswered,Percentage,Date\n';
        rows.forEach(r => {
            csv += `${r.id},"${r.student_name}",${r.test_id},"${r.subject}",${r.score},${r.correct_count},${r.incorrect_count},${r.unanswered_count},${r.percentage}%,"${r.created_at}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="test-with-ankita-results.csv"');
        res.send(csv);
    });
});

app.listen(PORT, () => { console.log(`Test with Ankita server running on port ${PORT}`); });
