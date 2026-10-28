
let currentUser = null;
let currentLang = 'hi';

const translations = {
    hi: {
        welcome: "Test with Ankita में आपका स्वागत है",
        loginTab: "लॉगिन",
        registerTab: "रजिस्टर",
        namePlaceholder: "अपना यूनीक नाम दर्ज करें",
        rollPlaceholder: "रोल नंबर दर्ज करें",
        passPlaceholder: "पासवर्ड दर्ज करें",
        loginBtn: "लॉगिन करें",
        registerBtn: "रजिस्टर करें",
        allTests: "सभी टेस्ट",
        maths: "गणित (Maths)",
        reasoning: "रीजनिंग (Reasoning)",
        hindi: "हिंदी (Hindi)",
        myResults: "मेरे परिणाम",
        leaderboard: "लीडरबोर्ड (Leaderboard)",
        logout: "लॉग आउट",
        startTest: "टेस्ट शुरू करें"
    },
    en: {
        welcome: "Welcome to Test with Ankita",
        loginTab: "Login",
        registerTab: "Register",
        namePlaceholder: "Enter unique name",
        rollPlaceholder: "Enter Roll Number",
        passPlaceholder: "Enter password",
        loginBtn: "Login",
        registerBtn: "Register",
        allTests: "All Tests",
        maths: "Maths",
        reasoning: "Reasoning",
        hindi: "Hindi",
        myResults: "My Results",
        leaderboard: "Leaderboard",
        logout: "Logout",
        startTest: "Start Test"
    }
};

function toggleLanguage() {
    currentLang = currentLang === 'hi' ? 'en' : 'hi';
    checkAuth();
}

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        currentUser = data.user;
        renderApp();
    } catch(e) {
        currentUser = null;
        renderApp();
    }
}

async function renderApp() {
    const navDiv = document.getElementById('auth-nav');
    const contentDiv = document.getElementById('app-content');
    const t = translations[currentLang];

    if (currentUser) {
        navDiv.innerHTML = `
            <span class="text-sm font-medium">👤 ${currentUser.name}</span>
            <button onclick="logout()" class="px-3 py-1 bg-indigo-700 hover:bg-indigo-800 rounded text-sm">${t.logout}</button>
        `;
        
        contentDiv.innerHTML = `
            <div class="ankita-home space-y-6">
                <section class="ankita-welcome">
                    <div class="ankita-welcome-text">
                        <h2>मेरी प्यारी teeniiiiii 😚🫂</h2>
                        <h3>${t.welcome}, ${currentUser.name}!</h3>
                        <p>अपने गोल सेट करें और परीक्षा की तैयारी शुरू करें। 🩷</p>
                    </div>
                    <img
                        src="/gifs/welcome-bunnygif.GIF"
                        alt="Cute bunny and teddy"
                        class="ankita-welcome-gif"
                    >
                    <div class="ankita-tabs">
                        <button onclick="switchTab('tests')" id="tab-tests-btn">${t.allTests}</button>
                        <button onclick="switchTab('results')" id="tab-results-btn">${t.myResults} 💗</button>
                        <button onclick="switchTab('leaderboard')" id="tab-leaderboard-btn">${t.leaderboard}</button>
                    </div>
                </section>
                <div id="tab-content"></div>
            </div>
        `;
        loadTestsView('all');

        
    } else {
        navDiv.innerHTML = '';
        contentDiv.innerHTML = `
            <div class="max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 mt-10">
                
<div class="text-center mb-6">
    <img
        src="/gifs/header-teddygif.GIF"
        alt="प्यारा टेडी"
        class="mx-auto mb-3 w-32 h-32 object-contain"
    >
    <h2 class="text-2xl font-bold text-pink-600 mt-2">
        Test with Ankita
    </h2>
    <p class="text-slate-500 text-sm">
        🩷 ऑनलाइन परीक्षा एवं प्रैक्टिस पोर्टल 🩷
    </p>
</div>

                <div class="flex border-b mb-6">
                    <button onclick="switchAuthMode('login')" id="auth-tab-login" class="flex-1 pb-2 font-semibold text-indigo-600 border-b-2 border-indigo-600">${t.loginTab}</button>
                    <button onclick="switchAuthMode('register')" id="auth-tab-register" class="flex-1 pb-2 font-semibold text-gray-400">${t.registerTab}</button>
                </div>
                <form id="auth-form" onsubmit="handleAuthSubmit(event)" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">यूज़रनेम (Name)</label>
                        <input type="text" id="auth-name" required placeholder="${t.namePlaceholder}" class="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div id="roll-field-wrapper">
                        <label class="block text-sm font-medium text-slate-700 mb-1">रोल नंबर (Roll Number)</label>
                        <input type="text" id="auth-roll" placeholder="${t.rollPlaceholder}" class="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">पासवर्ड (Password)</label>
                        <input type="password" id="auth-password" required placeholder="${t.passPlaceholder}" class="w-full px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <button type="submit" id="auth-submit-btn" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow transition">${t.loginBtn}</button>
                    <div id="auth-error" class="text-red-500 text-sm text-center font-medium hidden"></div>
                </form>
            </div>
        `;
    }
}

let authMode = 'login';
function switchAuthMode(mode) {
    authMode = mode;
    const t = translations[currentLang];
    const loginBtn = document.getElementById('auth-tab-login');
    const regBtn = document.getElementById('auth-tab-register');
    const submitBtn = document.getElementById('auth-submit-btn');
    const rollWrapper = document.getElementById('roll-field-wrapper');
    const rollInput = document.getElementById('auth-roll');

    if(mode === 'login') {
        loginBtn.className = "flex-1 pb-2 font-semibold text-indigo-600 border-b-2 border-indigo-600";
        regBtn.className = "flex-1 pb-2 font-semibold text-gray-400";
        submitBtn.textContent = t.loginBtn;
        rollWrapper.style.display = 'none';
        rollInput.removeAttribute('required');
    } else {
        regBtn.className = "flex-1 pb-2 font-semibold text-indigo-600 border-b-2 border-indigo-600";
        loginBtn.className = "flex-1 pb-2 font-semibold text-gray-400";
        submitBtn.textContent = t.registerBtn;
        rollWrapper.style.display = 'block';
        rollInput.setAttribute('required', 'true');
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('auth-name').value;
    const password = document.getElementById('auth-password').value;
    const roll_number = document.getElementById('auth-roll')?.value || '';
    const errDiv = document.getElementById('auth-error');
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password, roll_number })
        });
        const data = await res.json();
        if(res.ok) checkAuth();
        else { errDiv.textContent = data.error || 'त्रुटि हुई'; errDiv.classList.remove('hidden'); }
    } catch(e) { errDiv.textContent = 'कनेक्शन त्रुटि'; errDiv.classList.remove('hidden'); }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    checkAuth();
}

function switchTab(tab) {
    ['tests', 'results', 'leaderboard'].forEach(t => {
        const btn = document.getElementById(`tab-${t}-btn`);
        if(btn) {
            if(t === tab) btn.className = "px-4 py-2 rounded-xl font-medium bg-indigo-600 text-white shadow";
            else btn.className = "px-4 py-2 rounded-xl font-medium bg-gray-200 text-gray-700";
        }
    });

    if(tab === 'tests') loadTestsView('all');
    else if(tab === 'results') loadResultsView();
    else if(tab === 'leaderboard') loadLeaderboardView('overall');
}

let allTestsCache = [];
let htmlTestsCache = [];

async function loadTestsView(subjectFilter) {
    const container = document.getElementById('tab-content');
    container.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-col sm:flex-row justify-between gap-4">
                <input type="text" id="test-search" oninput="filterTests()" placeholder="टेस्ट खोजें..." class="px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-72">
                <div class="flex flex-wrap gap-2">
                    <button onclick="loadTestsView('all')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${subjectFilter==='all'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">सभी</button>
                    <button onclick="loadTestsView('गणित')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${subjectFilter==='गणित'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">गणित</button>
                    <button onclick="loadTestsView('रीजनिंग')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${subjectFilter==='रीजनिंग'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">रीजनिंग</button>
                    <button onclick="loadTestsView('हिंदी')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${subjectFilter==='हिंदी'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">हिंदी</button>
                </div>
            </div>
            <div id="tests-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        </div>
    `;

    try {
        const [testsRes, htmlRes] = await Promise.all([ fetch('/api/tests'), fetch('/api/html-tests') ]);
        allTestsCache = await testsRes.json();
        htmlTestsCache = await htmlRes.json();
        renderTests(allTestsCache, htmlTestsCache, subjectFilter);
    } catch(e) { console.error(e); }
}

function filterTests() { renderTests(allTestsCache, htmlTestsCache, 'all'); }

function renderTests(serverTests, htmlTests, subject) {
    const grid = document.getElementById('tests-grid');
    const query = (document.getElementById('test-search')?.value || '').toLowerCase();

    let filteredServer = serverTests.filter(t => (subject === 'all' || t.subject === subject) && t.title.toLowerCase().includes(query));
    let htmlOutput = '';

    filteredServer.forEach(t => {
        htmlOutput += `
            <div class="bg-white rounded-2xl shadow-md p-6 border flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex justify-between items-center mb-2">
                        <span class="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold">मॉक टेस्ट</span>
                        <span class="text-xs font-bold text-gray-500">${t.subject}</span>
                    </div>
                    <h3 class="font-bold text-lg text-slate-800">${t.title}</h3>
                    <p class="text-sm text-slate-500 mt-1">अवधि: ${t.duration} मिनट | अंक: +${t.marks_correct} / -${t.marks_incorrect}</p>
                </div>
                <button onclick="startServerTest(${t.id})" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow transition">टेस्ट शुरू करें</button>
            </div>
        `;
    });

    grid.innerHTML = htmlOutput || '<p class="text-slate-500 col-span-full text-center py-10">कोई टेस्ट नहीं मिला।</p>';
}


async function loadResultsView() {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<p>परिणाम लोड हो रहे हैं...</p>';

    try {
        const res = await fetch('/api/my-results');
        if (!res.ok) throw new Error('Results load failed');

        const results = await res.json();

        container.innerHTML = `
            <div class="bg-white rounded-2xl shadow-md p-6">
                <h3 class="text-lg font-bold mb-4">
                    मेरे पिछले टेस्ट परिणाम
                </h3>

                <div class="space-y-4">
                    ${results.map(r => `
                        <button
                            type="button"
                            onclick="openSavedReview(${r.id})"
                            class="w-full text-left p-4 border rounded-xl
                                   bg-slate-50 hover:bg-indigo-50">
                            <h4 class="font-bold">
                                टेस्ट ID: ${r.test_id} — ${r.subject}
                            </h4>
                            <p class="text-xs text-gray-500">
                                ${new Date(r.created_at).toLocaleString()}
                            </p>
                            <p class="text-xl font-bold text-indigo-600">
                                ${r.score} अंक (${r.percentage}%)
                            </p>
                            <p class="text-xs text-gray-500">
                                सही: ${r.correct_count} |
                                गलत: ${r.incorrect_count} |
                                अनुत्तरित: ${r.unanswered_count}
                            </p>
                            <p class="mt-2 text-indigo-700 font-semibold">
                                📘 पूरा पेपर और समाधान खोलें →
                            </p>
                        </button>
                    `).join('') ||
                    '<p>आपने अभी तक कोई टेस्ट नहीं दिया है।</p>'}
                </div>
            </div>
        `;
    } catch (e) {
        container.innerHTML =
            '<p class="text-red-500">परिणाम लोड नहीं हुए। दोबारा कोशिश करें।</p>';
    }
}

async function openSavedReview(resultId) {
    const container = document.getElementById('tab-content');
    container.innerHTML = '<p>पेपर और समाधान लोड हो रहे हैं...</p>';

    try {
        const res = await fetch(
            `/api/my-results/${resultId}/review`
        );
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'पेपर लोड नहीं हुआ');
        }

        document.getElementById('app-content').innerHTML =
            '<div id="saved-review-screen"></div>';

        renderResultScreen(data);
    } catch (e) {
        container.innerHTML = `
            <p class="text-red-600">
                ${e.message || 'पेपर लोड नहीं हुआ।'}
            </p>
            <button onclick="loadResultsView()">
                वापस जाएँ
            </button>
        `;
    }
}


async function loadLeaderboardView(type) {
    const container = document.getElementById('tab-content');
    container.innerHTML = `
        <div class="bg-white rounded-2xl shadow-md p-6 space-y-6">
            <div class="flex flex-col sm:flex-row justify-between items-center gap-4 border-b pb-4">
                <h3 class="text-xl font-bold text-slate-800">🏆 परीक्षा लीडरबोर्ड</h3>
                <div class="flex flex-wrap gap-2">
                    <button onclick="loadLeaderboardView('overall')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${type==='overall'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">ओवरऑल</button>
                    <button onclick="loadLeaderboardView('गणित')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${type==='गणित'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">गणित</button>
                    <button onclick="loadLeaderboardView('रीजनिंग')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${type==='रीजनिंग'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">रीजनिंग</button>
                    <button onclick="loadLeaderboardView('हिंदी')" class="px-3 py-1.5 rounded-lg text-sm font-medium ${type==='हिंदी'?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}">हिंदी</button>
                </div>
            </div>
            <div id="leaderboard-content" class="overflow-x-auto">लोड हो रहा है...</div>
        </div>
    `;

    try {
        const res = await fetch(`/api/leaderboard?type=${encodeURIComponent(type)}`);
        const lb = await res.json();
        document.getElementById('leaderboard-content').innerHTML = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-gray-100 border-b text-sm">
                        <th class="p-3">रैंक</th>
                        <th class="p-3">छात्र नाम</th>
                        <th class="p-3">कुल स्कोर</th>
                        <th class="p-3">कुल प्रयास</th>
                    </tr>
                </thead>
                <tbody>
                    ${lb.map((row, idx) => {
                        let badge = `#${idx+1}`;
                        if(idx === 0) badge = '🥇 1st'; else if(idx === 1) badge = '🥈 2nd'; else if(idx === 2) badge = '🥉 3rd';
                        const isMe = currentUser && row.student_name === currentUser.name;
                        return `
                            <tr class="border-b text-sm ${isMe ? 'bg-indigo-50 font-bold' : ''}">
                                <td class="p-3">${badge}</td>
                                <td class="p-3">${row.student_name} ${isMe ? '(आप)' : ''}</td>
                                <td class="p-3 text-indigo-600">${row.total_score} अंक</td>
                                <td class="p-3">${row.attempts}</td>
                            </tr>
                        `;
                    }).join('') || '<tr><td colspan="4" class="p-4 text-center text-gray-500">कोई लीडरबोर्ड डेटा नहीं है।</td></tr>'}
                </tbody>
            </table>
        `;
    } catch(e) { document.getElementById('leaderboard-content').innerHTML = '<p class="text-red-500">लोड करने में विफल।</p>'; }
}

// Test Engine
let activeTest = null;
let currentQuestionIndex = 0;
let userAnswers = {};
let markedForReview = {};
let timerInterval = null;
let timeRemainingSeconds = 0;

async function startServerTest(testId) {
    try {
        const res = await fetch(`/api/tests/${testId}`);
        const data = await res.json();
        if(!data.test || !data.questions || data.questions.length === 0) {
            alert('इस टेस्ट में कोई प्रश्न उपलब्ध नहीं है।');
            return;
        }
        activeTest = data;
        currentQuestionIndex = 0;
        userAnswers = {};
        markedForReview = {};
        timeRemainingSeconds = (activeTest.test.duration || 20) * 60;

        renderTestScreen();
        startTestTimer();
    } catch(e) { alert('टेस्ट लोड करने में त्रुटि'); }
}

function startTestTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        timeRemainingSeconds--;
        const min = Math.floor(timeRemainingSeconds / 60);
        const sec = timeRemainingSeconds % 60;
        const timerEl = document.getElementById('test-timer');
        if(timerEl) timerEl.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        if(timeRemainingSeconds <= 0) {
            clearInterval(timerInterval);
            alert('समय समाप्त हो गया है! आपका टेस्ट स्वतः सबमिट किया जा रहा है।');
            submitActiveTest(true);
        }
    }, 1000);
}

function renderTestScreen() {
    const contentDiv = document.getElementById('app-content');
    const q = activeTest.questions[currentQuestionIndex];
    const totalQ = activeTest.questions.length;
    const min = Math.floor(timeRemainingSeconds / 60);
    const sec = timeRemainingSeconds % 60;

    contentDiv.innerHTML = `
        <div class="bg-white rounded-2xl shadow-xl p-6 space-y-6 max-w-4xl mx-auto">
            <div class="flex justify-between items-center border-b pb-4">
                
<div class="flex items-center gap-2">
    <img
        src="/gifs/test-buddygif.GIF"
        alt="टेस्ट बडी"
        class="w-12 h-12 object-contain"
    >
    <h2 class="text-xl font-bold text-pink-600">
        ${activeTest.test.title}
    </h2>
</div>

                <div class="flex items-center space-x-4">
                    <span class="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg font-bold text-sm" id="test-timer">${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}</span>
                    <button onclick="confirmSubmitTest()" class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-semibold">टेस्ट सबमिट करें</button>
                </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div class="lg:col-span-3 space-y-4">
                    <div class="flex justify-between text-sm text-gray-500">
                        <span>प्रश्न ${currentQuestionIndex + 1} / ${totalQ}</span>
                        <span>अंक: +${activeTest.test.marks_correct} / -${activeTest.test.marks_incorrect}</span>
                    </div>
                    <h3 class="text-lg font-semibold text-slate-800"
    style="white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7;">${q.question.replace(/(कथन\s*2\s*:)/g, '<br><br>$1')}</h3>
                    <div class="space-y-3">
                        ${['A', 'B', 'C', 'D'].map(opt => `
                            <label class="flex items-center p-3 border rounded-xl cursor-pointer hover:bg-indigo-50 transition ${userAnswers[q.id] === opt ? 'border-indigo-600 bg-indigo-50' : 'border-gray-200'}">
                                <input type="radio" name="q_option" value="${opt}" ${userAnswers[q.id] === opt ? 'checked' : ''} onchange="selectAnswer(${q.id}, '${opt}')" class="mr-3">
                                <span class="font-medium text-slate-700">${opt}. ${q['option_' + opt.toLowerCase()]}</span>
                            </label>
                        `).join('')}
                    </div>
                    <div class="flex justify-between pt-4 border-t">
                        <div class="space-x-2">
                            <button onclick="clearAnswer(${q.id})" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium">उत्तर साफ़ करें</button>
                            <button onclick="toggleReview(${q.id})" class="px-4 py-2 bg-amber-100 text-amber-800 rounded-xl text-sm font-medium">समीक्षा के लिए चिह्नित करें</button>
                        </div>
                        <div class="space-x-2">
                            <button onclick="prevQuestion()" ${currentQuestionIndex === 0 ? 'disabled' : ''} class="px-4 py-2 bg-gray-100 disabled:opacity-50 text-gray-700 rounded-xl text-sm font-medium">पिछला</button>
                            <button onclick="nextQuestion()" ${currentQuestionIndex === totalQ - 1 ? 'disabled' : ''} class="px-4 py-2 bg-indigo-600 disabled:opacity-50 text-white rounded-xl text-sm font-medium">अगला</button>
                        </div>
                    </div>
                </div>
                <div class="border-l pl-0 lg:pl-6 space-y-4">
                    <h4 class="font-bold text-slate-700 text-sm">प्रश्न पट्टिका</h4>
                    <div class="grid grid-cols-5 gap-2">
                        ${activeTest.questions.map((item, idx) => {
                            let btnBg = "bg-gray-100 text-gray-700 border";
                            if(userAnswers[item.id]) btnBg = "bg-green-600 text-white font-bold";
                            if(markedForReview[item.id]) btnBg = "bg-amber-500 text-white font-bold";
                            if(idx === currentQuestionIndex) btnBg += " ring-2 ring-indigo-600";
                            return `<button onclick="goToQuestion(${idx})" class="w-10 h-10 rounded-lg text-sm ${btnBg}">${idx + 1}</button>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function selectAnswer(qid, opt) { userAnswers[qid] = opt; renderTestScreen(); }
function clearAnswer(qid) { delete userAnswers[qid]; renderTestScreen(); }
function toggleReview(qid) { if(markedForReview[qid]) delete markedForReview[qid]; else markedForReview[qid] = true; renderTestScreen(); }
function prevQuestion() { if(currentQuestionIndex > 0) { currentQuestionIndex--; renderTestScreen(); } }
function nextQuestion() { if(currentQuestionIndex < activeTest.questions.length - 1) { currentQuestionIndex++; renderTestScreen(); } }
function goToQuestion(idx) { currentQuestionIndex = idx; renderTestScreen(); }
function confirmSubmitTest() { if(confirm('क्या आप वाकई अपना टेस्ट सबमिट करना चाहते हैं?')) submitActiveTest(false); }

async function submitActiveTest(isAuto = false) {
    clearInterval(timerInterval);
    try {
        const res = await fetch('/api/tests/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_id: activeTest.test.id, answers: userAnswers })
        });
        const result = await res.json();
        if(res.ok) renderResultScreen(result);
        else { alert(result.error || 'सबमिशन में त्रुटि'); checkAuth(); }
    } catch(e) { alert('नेटवर्क त्रुटि'); }
}


function renderResultScreen(res) {
    const contentDiv = document.getElementById('app-content');
    const score = Number(res.percentage) || 0;

    let message = '';
    let gif = '';

    if (score >= 80 && score <= 100) {
        message = 'Ale meri laado Ummmaa😘';
        gif = '/gifs/laado-teddy.gif';
    } 
    else if (score >= 71 && score < 80) {
        message = 'aaaja meri rusmlai 😚';
        gif = '/gifs/rusmlai.gif';
    } 
    else if (score >= 60 && score < 71) {
        message = 'Love you ji aap jit gye 🥰🥰🫂🫂';
        gif = '/gifs/love-bunnies.gif';
    } 
    else if (score >= 50 && score < 60) {
        message = 'y kya h 🫤';
        gif = '/gifs/y-kya-h-cat.gif';
    } 
    else {
        message = '😤😤😤😤😤😤atraaaaa kmmm😤😤😤';
        gif = '/gifs/atraaaaa-kmmm.gif';
    }

    contentDiv.innerHTML = `
        <div class="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-5 sm:p-8 text-center space-y-5">
            <h2 class="text-2xl sm:text-3xl font-bold text-pink-600">
                ${message}
            </h2>

            <img
                src="${gif}"
                alt="Special animated GIF"
                class="mx-auto w-full max-w-xs rounded-xl object-contain"
                style="max-height: 360px"
            />

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl">
                <div>
                    <p class="text-xs text-gray-500">कुल स्कोर</p>
                    <p class="text-xl font-bold text-indigo-600">${res.score} अंक</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">प्रतिशत</p>
                    <p class="text-xl font-bold text-emerald-600">${res.percentage}%</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">सही उत्तर</p>
                    <p class="text-xl font-bold text-green-600">${res.correct_count}</p>
                </div>
                <div>
                    <p class="text-xs text-gray-500">गलत उत्तर</p>
                    <p class="text-xl font-bold text-red-600">${res.incorrect_count}</p>
                </div>
            </div>

            <div class="text-left space-y-4">
    <h3 class="text-xl font-bold text-slate-800 border-b pb-2">
        📘 प्रश्नों के सही उत्तर और समाधान
    </h3>

    ${(res.review || []).map((item, index) => {
        const correctText =
            item.options?.[item.correct_answer] || 'उत्तर उपलब्ध नहीं';

        const chosenText = item.user_answer
            ? item.options?.[item.user_answer]
            : 'उत्तर नहीं दिया';

        return `
            <div class="border rounded-xl p-4 space-y-2
                ${item.is_correct
                    ? 'border-green-200 bg-green-50'
                    : 'border-red-200 bg-red-50'}">

                <p class="font-bold text-slate-800">
                    प्रश्न ${index + 1}: ${item.question}
                </p>

                <p>
                    <b>आपका उत्तर:</b>
                    ${item.user_answer
                        ? item.user_answer + '. ' + chosenText
                        : chosenText}
                </p>

                <p class="text-green-800">
                    <b>सही उत्तर:</b>
                    ${item.correct_answer}. ${correctText}
                </p>

                <p>
                    <b>व्याख्या / समाधान:</b>
                    ${item.explanation ||
                      'इस प्रश्न की व्याख्या अभी उपलब्ध नहीं है।'}
                </p>
            </div>
        `;
    }).join('')}
</div>

<button onclick="checkAuth()"
    class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow">
    डैशबोर्ड पर लौटें
</button>
        </div>
    `;
}

checkAuth();
