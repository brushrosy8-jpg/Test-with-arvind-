const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let currentTest = null;
let timerHandle = null;
let remaining = 0;
let questionCount = 0;

async function api(url, opts = {}) {
  const r = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    },
    ...opts
  });

  let data = {};
  try { data = await r.json(); } catch {}

  if (!r.ok) throw new Error(data.error || 'कुछ गलत हो गया।');
  return data;
}

function showView(id) {
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');

  $$('.navbtn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === id)
  );
}

$$('.navbtn').forEach(b => {
  b.onclick = async () => {
    if (b.dataset.view === 'admin') {
      showView('admin');
      await checkAdmin();
    } else {
      showView('home');
    }
  };
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

$('#refresh').onclick = loadTests;

$('#back-home').onclick = () => {
  clearInterval(timerHandle);
  showView('home');
  loadTests();
};

async function loadTests() {
  const box = $('#test-list');

  try {
    const tests = await api('/api/tests');

    box.innerHTML = tests.length
      ? tests.map(t => `
        <article class="testcard">
          <h3>${esc(t.title)}</h3>
          <div class="meta">
            ${esc(t.subject || 'सामान्य टेस्ट')} ·
            ${t.question_count} प्रश्न ·
            ${t.duration} मिनट ·
            प्रति सही ${t.marks} अंक
          </div>
          <button class="primary" onclick="startTest(${t.id})">
            टेस्ट शुरू करें
          </button>
        </article>
      `).join('')
      : '<div class="empty">अभी कोई टेस्ट प्रकाशित नहीं है।</div>';
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function startTest(id) {
  try {
    currentTest = await api('/api/tests/' + id);
    showView('take-test');
    renderTest();
  } catch (e) {
    alert(e.message);
  }
}

function renderTest() {
  clearInterval(timerHandle);
  remaining = currentTest.duration * 60;

  $('#test-area').innerHTML = `
    <div class="panel">
      <div class="timer" id="timer"></div>
      <h2>${esc(currentTest.title)}</h2>
      <p class="muted">
        ${esc(currentTest.subject || '')} ·
        ${currentTest.questions.length} प्रश्न
      </p>

      <form id="answer-form">
        <label>
          अपना नाम (वैकल्पिक)
          <input name="studentName" maxlength="80"
            placeholder="विद्यार्थी का नाम">
        </label>

        <div id="test-questions">
          ${currentTest.questions.map((q, i) => `
            <div class="test-question">
              <h3>${i + 1}. ${esc(q.prompt)}</h3>
              ${[q.a, q.b, q.c, q.d].map((v, j) => `
                <label class="choice">
                  <input type="radio" name="q${q.id}" value="${j}">
                  <span>${'ABCD'[j]}. ${esc(v)}</span>
                </label>
              `).join('')}
            </div>
          `).join('')}
        </div>

        <button class="primary wide" type="submit">
          टेस्ट जमा करें
        </button>
      </form>
    </div>
  `;

  $('#answer-form').onsubmit = e => {
    e.preventDefault();
    submitTest(false);
  };

  tick();
  timerHandle = setInterval(tick, 1000);
}

function tick() {
  const el = $('#timer');
  if (!el) return;

  const m = Math.floor(remaining / 60);
  const s = remaining % 60;

  el.textContent =
    `समय: ${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  if (remaining <= 0) {
    clearInterval(timerHandle);
    submitTest(true);
  } else {
    remaining--;
  }
}

let submittingTest = false;

async function submitTest(auto) {
  if (!currentTest || !$('#answer-form') || submittingTest) return;

  submittingTest = true;
  clearInterval(timerHandle);

  const form = $('#answer-form');
  const data = new FormData(form);
  const answers = {};

  currentTest.questions.forEach(q => {
    answers[q.id] = data.get('q' + q.id);
  });

  const name = data.get('studentName') || 'विद्यार्थी';

  form.querySelectorAll('input, button').forEach(el => {
    el.disabled = true;
  });

  try {
    const r = await api(`/api/tests/${currentTest.id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers, name })
    });

    $('#test-area').innerHTML = `
      <div class="panel">
        <h2>${esc(r.title)} — परिणाम</h2>

        <div class="resultbox">
          <div class="score">${r.score} / ${r.maxScore}</div>
          <p>कुल प्रश्न: ${r.total} · प्रयास किए: ${r.attempted}</p>
          <p>
            सही उत्तर: <b>${r.correct}</b> ·
            गलत उत्तर: <b>${r.wrong}</b> ·
            छोड़े: <b>${r.total - r.attempted}</b>
          </p>
        </div>

        <h3>उत्तर और व्याख्या</h3>

        ${r.details.map((d, i) => {
          const q = currentTest.questions.find(x => x.id === d.id);
          if (!q) return '';

          return `
            <div class="test-question">
              <b>${i + 1}. ${esc(q.prompt)}</b>
              <p class="success">
                सही उत्तर: ${'ABCD'[d.correctAnswer]}.
                ${esc([q.a, q.b, q.c, q.d][d.correctAnswer])}
              </p>
              ${d.explanation ? `<p>${esc(d.explanation)}</p>` : ''}
            </div>
          `;
        }).join('')}

        <button class="primary wide"
          onclick="showView('home');loadTests()">
          होम पर जाएँ
        </button>
      </div>
    `;
  } catch (e) {
    alert(e.message);
    if ($('#answer-form')) {
      form.querySelectorAll('input, button').forEach(el => {
        el.disabled = false;
      });
    }
  } finally {
    submittingTest = false;
  }
}

async function checkAdmin() {
  try {
    const d = await api('/api/admin/me');

    $('#login-panel').classList.toggle('hidden', d.loggedIn);
    $('#dashboard').classList.toggle('hidden', !d.loggedIn);

    if (d.loggedIn) await loadAdminTests();
  } catch {
    $('#login-panel').classList.remove('hidden');
    $('#dashboard').classList.add('hidden');
  }
}

$('#login-form').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({
        username: f.get('username'),
        password: f.get('password')
      })
    });

    $('#login-error').textContent = '';
    await checkAdmin();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
};

$('#logout').onclick = async () => {
  try {
    await api('/api/admin/logout', { method: 'POST' });
    await checkAdmin();
  } catch (e) {
    alert(e.message);
  }
};

$$('.tab').forEach(b => {
  b.onclick = async () => {
    $$('.tab').forEach(x => x.classList.toggle('active', x === b));

    ['create', 'manage', 'results', 'password'].forEach(t => {
      $('#tab-' + t).classList.toggle('hidden', t !== b.dataset.tab);
    });

    if (b.dataset.tab === 'manage') await loadAdminTests();
    if (b.dataset.tab === 'results') await loadResults();
  };
});

/* नया प्रश्न जोड़ना */
function addQuestion() {
  const el = document.createElement('div');
  el.className = 'question-editor';

  el.innerHTML = `
    <div class="question-top">
      <strong>प्रश्न</strong>
      <button type="button" class="danger">हटाएँ</button>
    </div>

    <label>प्रश्न
      <textarea data-k="prompt" rows="2" required
        placeholder="यहाँ प्रश्न लिखें"></textarea>
    </label>

    <div class="optiongrid">
      ${['a', 'b', 'c', 'd'].map((k, i) => `
        <label>विकल्प ${'ABCD'[i]}
          <input data-k="${k}" required>
        </label>
      `).join('')}
    </div>

    <label>सही उत्तर
      <select data-k="answer" required>
        <option value="">उत्तर जाँचकर चुनें</option>
        <option value="0">A</option>
        <option value="1">B</option>
        <option value="2">C</option>
        <option value="3">D</option>
      </select>
    </label>

    <label>समाधान / व्याख्या (वैकल्पिक)
      <textarea data-k="explanation" rows="2"></textarea>
    </label>
  `;

  el.querySelector('.danger').onclick = () => {
    el.remove();
    renumberQuestions();
  };

  $('#questions').appendChild(el);
  renumberQuestions();
}

function renumberQuestions() {
  $$('.question-editor .question-top strong').forEach((x, i) => {
    x.textContent = 'प्रश्न ' + (i + 1);
  });
}

$('#add-question').onclick = addQuestion;
addQuestion();

/* टेस्ट सेव करना */
$('#test-form').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  const questions = $$('.question-editor').map(el => {
    const q = {};

    el.querySelectorAll('[data-k]').forEach(x => {
      q[x.dataset.k] = x.value;
    });

    q.answer = q.answer === '' ? null : Number(q.answer);
    return q;
  });

  if (!questions.length) {
    $('#create-msg').textContent = 'कम से कम एक प्रश्न जोड़ें।';
    $('#create-msg').className = 'message error';
    return;
  }

  if (questions.some(q => ![0, 1, 2, 3].includes(q.answer))) {
    $('#create-msg').textContent =
      'हर प्रश्न का सही उत्तर जाँचकर चुनें।';
    $('#create-msg').className = 'message error';
    return;
  }

  try {
    await api('/api/admin/tests', {
      method: 'POST',
      body: JSON.stringify({
        title: f.get('title'),
        subject: f.get('subject'),
        duration: Number(f.get('duration')),
        marks: Number(f.get('marks')),
        negative: Number(f.get('negative')),
        published: f.get('published') === 'on',
        questions
      })
    });

    $('#create-msg').textContent = 'टेस्ट सफलतापूर्वक सेव हो गया।';
    $('#create-msg').className = 'message success';

    e.target.reset();
    $('#questions').innerHTML = '';
    addQuestion();

    await loadAdminTests();
  } catch (err) {
    $('#create-msg').textContent = err.message;
    $('#create-msg').className = 'message error';
  }
};

async function loadAdminTests() {
  try {
    const ts = await api('/api/admin/tests');

    $('#admin-tests').innerHTML = ts.length
      ? `<div class="tablewrap"><table>
          <thead><tr>
            <th>टेस्ट</th><th>प्रश्न</th><th>स्थिति</th><th>कार्य</th>
          </tr></thead>
          <tbody>
            ${ts.map(t => `
              <tr>
                <td>${esc(t.title)}</td>
                <td>${t.question_count}</td>
                <td>${t.published ? 'प्रकाशित' : 'ड्राफ्ट'}</td>
                <td>
                  <button class="secondary"
                    onclick="togglePublish(${t.id},${!t.published})">
                    ${t.published ? 'अनपब्लिश' : 'प्रकाशित'}
                  </button>
                  <button class="danger"
                    onclick="deleteTest(${t.id})">हटाएँ</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`
      : '<p class="muted">अभी कोई टेस्ट नहीं बनाया गया।</p>';
  } catch (e) {
    $('#admin-tests').textContent = e.message;
  }
}

async function togglePublish(id, published) {
  try {
    await api('/api/admin/tests/' + id + '/publish', {
      method: 'PUT',
      body: JSON.stringify({ published })
    });
    await loadAdminTests();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteTest(id) {
  if (!confirm('क्या आप यह टेस्ट और उसके परिणाम हटाना चाहते हैं?')) return;

  try {
    await api('/api/admin/tests/' + id, { method: 'DELETE' });
    await loadAdminTests();
  } catch (e) {
    alert(e.message);
  }
}

async function loadResults() {
  try {
    const rs = await api('/api/admin/results');

    $('#results-table').innerHTML = rs.length
      ? `<div class="tablewrap"><table>
          <thead><tr>
            <th>टेस्ट</th><th>विद्यार्थी</th><th>अंक</th>
            <th>सही</th><th>गलत</th><th>प्रयास</th><th>तिथि</th>
          </tr></thead>
          <tbody>
            ${rs.map(r => `
              <tr>
                <td>${esc(r.test_title)}</td>
                <td>${esc(r.student_name)}</td>
                <td>${r.score}</td>
                <td>${r.correct}</td>
                <td>${r.wrong}</td>
                <td>${r.attempted}</td>
                <td>${esc(r.created_at)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>`
      : '<p class="muted">अभी कोई परिणाम नहीं है।</p>';
  } catch (e) {
    $('#results-table').textContent = e.message;
  }
}

$('#password-form').onsubmit = async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await api('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: f.get('oldPassword'),
        newPassword: f.get('newPassword')
      })
    });

    $('#password-msg').textContent = 'पासवर्ड सफलतापूर्वक बदल गया।';
    $('#password-msg').className = 'message success';
    e.target.reset();
  } catch (err) {
    $('#password-msg').textContent = err.message;
    $('#password-msg').className = 'message error';
  }
};

/* PDF/फोटो से टेक्स्ट निकालना */
const extractButton = $('#extract-questions');
const autoCreateButton = $('#auto-create-questions');

async function readUploadedFile(file) {
  const data = new FormData();
  data.append('file', file);

  const res = await fetch('/api/admin/extract-questions', {
    method: 'POST',
    body: data
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(result.error || 'फ़ाइल पढ़ने में समस्या हुई।');
  }

  return result.extractedText || '';
}

/* Answer Key से उत्तर पहचानना */
function parseAnswerKey(keyText) {
  const answers = {};
  const lines = keyText.split(/\r?\n/);

  for (const line of lines) {
    const text = line.trim();

    // उदाहरण: 1-A, 1. A, प्रश्न 1 उत्तर B
    const m = text.match(
      /^(?:प्रश्न\s*)?(\d+)\s*[-.)।:]?\s*(?:उत्तर\s*[:.-]?\s*)?([A-D])(?:\s|$|[.)।,:])/i
    );

    if (m) {
      answers[Number(m[1])] = m[2].toUpperCase();
      continue;
    }

    // उदाहरण: 1. (A) या 1. Ans: A
    const n = text.match(
      /^(?:प्रश्न\s*)?(\d+)\s*[-.)।:]\s*(?:उत्तर|Ans(?:wer)?)?\s*[:.)-]?\s*\(?([A-D])\)?\s*$/i
    );

    if (n) answers[Number(n[1])] = n[2].toUpperCase();
  }

  return answers;
}

/* प्रश्न-पत्र को MCQ में बदलना */
function parseQuestionPaper(paperText, keyAnswers) {
  const normalized = paperText
    .replace(/\r/g, '')
    .replace(/[Ａ-Ｄａ-ｄ]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );

  const blocks = normalized
    .split(/\n(?=\s*(?:प्रश्न\s*)?\d+\s*[.)।:]\s*)/)
    .map(s => s.trim())
    .filter(Boolean);

  const questions = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (!lines.length) continue;

    const first = lines[0].match(
      /^(?:प्रश्न\s*)?(\d+)\s*[.)।:]\s*(.*)$/
    );

    if (!first) continue;

    const number = Number(first[1]);
    const promptParts = [first[2]];
    const opts = {};

    for (const line of lines.slice(1)) {
      const m = line.match(/^\s*([A-D])\s*[).:]?\s+(.+)$/i);

      if (m) {
        opts[m[1].toLowerCase()] = m[2].trim();
      } else {
        promptParts.push(line);
      }
    }

    const prompt = promptParts.join(' ').trim();

    if (!(prompt && opts.a && opts.b && opts.c && opts.d)) continue;

    const answerLetter = keyAnswers[number] || '';
    const answerIndex = answerLetter
      ? ['A', 'B', 'C', 'D'].indexOf(answerLetter)
      : -1;

    questions.push({
      prompt,
      a: opts.a,
      b: opts.b,
      c: opts.c,
      d: opts.d,
      answer: answerIndex >= 0 ? answerIndex : null,
      explanation: ''
    });
  }

  return questions;
}

/* Paper + Answer Key से प्रश्न बनाना */
if (autoCreateButton) {
  autoCreateButton.onclick = async () => {
    const paperFile = $('#question-file')?.files[0];
    const keyFile = $('#answer-key-file')?.files[0];
    const msg = $('#auto-create-msg');

    if (!paperFile || !keyFile) {
      msg.textContent = 'पहले प्रश्न-पत्र और Answer Key दोनों चुनें।';
      return;
    }

    autoCreateButton.disabled = true;
    msg.textContent = 'फ़ाइलें पढ़ी जा रही हैं…';

    try {
      const paperText = await readUploadedFile(paperFile);
      const keyText = await readUploadedFile(keyFile);

      const keyAnswers = parseAnswerKey(keyText);
      const questions = parseQuestionPaper(paperText, keyAnswers);

      if (!questions.length) {
        throw new Error(
          'MCQ नहीं मिले। प्रश्न और A/B/C/D विकल्पों का फॉर्मेट जाँचें।'
        );
      }

      await autoFillQuestions(questions);

      const missing = questions.filter(q => q.answer === null).length;

      msg.textContent = missing
        ? `${questions.length} प्रश्न बने। ${missing} प्रश्नों के सही उत्तर नहीं मिले—उन्हें जाँचकर चुनें।`
        : `${questions.length} प्रश्न बने। कृपया Answer Key से उत्तर जाँच लें।`;

    } catch (error) {
      msg.textContent = error.message;
    } finally {
      autoCreateButton.disabled = false;
    }
  };
}

/* OCR टेक्स्ट दिखाना */
if (extractButton) {
  extractButton.onclick = async () => {
    const file = $('#question-file')?.files[0];
    const message = $('#extract-msg');

    if (!file) {
      message.textContent = 'पहले PDF या फोटो चुनें।';
      return;
    }

    extractButton.disabled = true;
    message.textContent = 'फ़ाइल पढ़ी जा रही है, कृपया प्रतीक्षा करें…';

    try {
      const text = await readUploadedFile(file);

      message.textContent = text
        ? 'निकला हुआ टेक्स्ट नीचे देखें और जाँचें।'
        : 'कोई टेक्स्ट नहीं मिला।';

      let output = $('#extracted-text');

      if (!output) {
        output = document.createElement('textarea');
        output.id = 'extracted-text';
        output.rows = 12;
        output.style.width = '100%';
        message.after(output);
      }

      output.value = text;
    } catch (error) {
      message.textContent = error.message;
    } finally {
      extractButton.disabled = false;
    }
  };
}

/* प्रश्न एडिटर में OCR से बने प्रश्न भरना */
async function autoFillQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error('कोई MCQ नहीं मिला।');
  }

  $('#questions').innerHTML = '';

  questions.forEach(q => {
    addQuestion();

    const el = $$('.question-editor').at(-1);

    el.querySelector('[data-k="prompt"]').value = q.prompt || '';

    ['a', 'b', 'c', 'd'].forEach(k => {
      el.querySelector(`[data-k="${k}"]`).value = q[k] || '';
    });

    el.querySelector('[data-k="answer"]').value =
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3
        ? String(q.answer)
        : '';

    el.querySelector('[data-k="explanation"]').value =
      q.explanation || '';
  });
}

loadTests();
