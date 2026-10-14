
const $ = (selector) => document.querySelector(selector);

const state = {
  tests: [],
  htmlTests: [],
  currentTest: null,
  timer: null,
  remaining: 0,
  submitting: false
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && typeof options.body === "string"
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "कुछ गलत हो गया।");
  }

  return data;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function notice(message, isError = false) {
  const box = $("#notice");
  if (!box) return;

  box.textContent = message;
  box.classList.remove("hidden");
  box.style.color = isError ? "#b42318" : "#166534";
}

function showAuth(type) {
  ["login", "register", "admin"].forEach(name => {
    const form = $(`#${name}Form`);
    if (form) form.classList.toggle("hidden", name !== type);
  });

  document.querySelectorAll("[data-auth]").forEach(button => {
    button.classList.toggle("active", button.dataset.auth === type);
  });

  notice("");
}

function renderDashboard(title, content) {
  $("#auth").classList.add("hidden");

  const dashboard = $("#dashboard");
  dashboard.classList.remove("hidden");
  dashboard.innerHTML = `
    <section class="panel">
      <h2>${escapeHTML(title)}</h2>
      <button id="homeButton" type="button">होम / लॉगिन</button>
      <div id="dashboardContent">${content}</div>
    </section>
  `;

  $("#homeButton").onclick = () => {
    dashboard.classList.add("hidden");
    $("#auth").classList.remove("hidden");
    showAuth("login");
    loadTests();
  };
}

async function loadTests() {
  const dashboard = $("#dashboard");
  dashboard.classList.remove("hidden");
  $("#auth").classList.add("hidden");

  dashboard.innerHTML = `
    <section class="panel">
      <h2>उपलब्ध टेस्ट</h2>
      <button id="refreshTests" type="button">Refresh</button>
      <div id="testList">टेस्ट लोड हो रहे हैं...</div>
    </section>
  `;

  $("#refreshTests").onclick = loadTests;

  const box = $("#testList");

  const [databaseResult, htmlResult] = await Promise.allSettled([
    api("/api/tests"),
    api("/api/html-tests")
  ]);

  state.tests =
    databaseResult.status === "fulfilled"
      ? databaseResult.value
      : [];

  state.htmlTests =
    htmlResult.status === "fulfilled"
      ? htmlResult.value
      : [];

  const databaseCards = state.tests.map(test => `
    <article class="panel">
      <h3>${escapeHTML(test.title)}</h3>
      <p>${escapeHTML(test.subject || "सामान्य टेस्ट")}</p>
      <p>${Number(test.question_count || 0)} प्रश्न ·
         ${Number(test.duration || 0)} मिनट</p>
      <button type="button" data-test-id="${Number(test.id)}">
        टेस्ट शुरू करें
      </button>
    </article>
  `);

  const htmlCards = state.htmlTests.map(test => `
    <article class="panel">
      <h3>${escapeHTML(test.title)}</h3>
      <p>Standalone HTML टेस्ट</p>
      <a href="${escapeHTML(test.url)}">टेस्ट खोलें</a>
    </article>
  `);

  box.innerHTML = [...databaseCards, ...htmlCards].join("")
    || "<p>अभी कोई टेस्ट उपलब्ध नहीं है।</p>";

  box.querySelectorAll("[data-test-id]").forEach(button => {
    button.onclick = () => startTest(button.dataset.testId);
  });

  if (databaseResult.status === "rejected" ||
      htmlResult.status === "rejected") {
    const error = document.createElement("p");
    error.textContent =
      "कुछ टेस्ट लोड नहीं हुए। सर्वर और API की जाँच करें।";
    box.appendChild(error);
  }
}

async function startTest(id) {
  try {
    const test = await api(`/api/tests/${encodeURIComponent(id)}`);
    if (!Array.isArray(test.questions) || !test.questions.length) {
      throw new Error("इस टेस्ट में प्रश्न उपलब्ध नहीं हैं।");
    }

    state.currentTest = test;
    state.submitting = false;
    state.remaining = Math.max(1, Number(test.duration) || 20) * 60;

    renderTest();
  } catch (error) {
    notice(error.message, true);
  }
}

function renderTest() {
  clearInterval(state.timer);

  const test = state.currentTest;
  const dashboard = $("#dashboard");
  dashboard.classList.remove("hidden");

  dashboard.innerHTML = `
    <section class="panel">
      <h2>${escapeHTML(test.title)}</h2>
      <p id="testTimer"></p>

      <form id="testForm">
        <label>अपना नाम
          <input name="studentName" maxlength="80"
                 placeholder="अपना नाम लिखें">
        </label>

        ${test.questions.map((question, index) => `
          <article class="panel">
            <h3>${index + 1}. ${escapeHTML(question.prompt)}</h3>
            ${[question.a, question.b, question.c, question.d]
              .map((option, optionIndex) => `
                <label>
                  <input type="radio"
                    name="q${Number(question.id)}"
                    value="${optionIndex}">
                  ${"ABCD"[optionIndex]}. ${escapeHTML(option)}
                </label><br>
              `).join("")}
          </article>
        `).join("")}

        <button type="submit">टेस्ट जमा करें</button>
      </form>
    </section>
  `;

  $("#testForm").onsubmit = event => {
    event.preventDefault();
    submitTest();
  };

  updateTimer();
  state.timer = setInterval(updateTimer, 1000);
}

function updateTimer() {
  const timer = $("#testTimer");
  if (!timer) return;

  const minutes = Math.floor(state.remaining / 60);
  const seconds = state.remaining % 60;

  timer.textContent =
    `बाकी समय: ${String(minutes).padStart(2, "0")}:` +
    String(seconds).padStart(2, "0");

  if (state.remaining <= 0) {
    clearInterval(state.timer);
    submitTest();
  } else {
    state.remaining--;
  }
}

async function submitTest() {
  if (!state.currentTest || state.submitting) return;

  state.submitting = true;
  clearInterval(state.timer);

  const form = $("#testForm");
  const formData = new FormData(form);
  const answers = {};

  state.currentTest.questions.forEach(question => {
    answers[question.id] = formData.get(`q${question.id}`);
  });

  form.querySelectorAll("input, button").forEach(element => {
    element.disabled = true;
  });

  try {
    const result = await api(
      `/api/tests/${state.currentTest.id}/submit`,
      {
        method: "POST",
        body: JSON.stringify({
          name: formData.get("studentName") || "विद्यार्थी",
          answers
        })
      }
    );

    renderDashboard(
      "टेस्ट परिणाम",
      `<h3>अंक: ${Number(result.score)} / ${Number(result.maxScore)}</h3>
       <p>सही उत्तर: ${Number(result.correct)}</p>
       <p>गलत उत्तर: ${Number(result.wrong)}</p>
       <p>रैंक: ${escapeHTML(result.rank ?? "—")}</p>
       <button id="backTests" type="button">दूसरा टेस्ट दें</button>`
    );

    $("#backTests").onclick = loadTests;
  } catch (error) {
    state.submitting = false;
    notice(error.message, true);
  }
}

async function adminLogin(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password")
      })
    });

    await adminDashboard();
  } catch (error) {
    notice(error.message, true);
  }
}

async function adminDashboard() {
  try {
    const [tests, results] = await Promise.all([
      api("/api/admin/tests"),
      api("/api/admin/results")
    ]);

    renderDashboard("Admin Dashboard", `
      <h3>सभी टेस्ट</h3>
      <div>${tests.map(test => `
        <article class="panel">
          <strong>${escapeHTML(test.title)}</strong>
          <p>प्रश्न: ${Number(test.question_count)}</p>
          <p>स्थिति: ${Number(test.published) ? "Published" : "Draft"}</p>
          <button data-publish="${Number(test.id)}"
                  data-value="${Number(test.published) ? 0 : 1}">
            ${Number(test.published) ? "Unpublish" : "Publish"}
          </button>
        </article>
      `).join("") || "अभी कोई टेस्ट नहीं है।"}</div>

      <h3>विद्यार्थियों के परिणाम</h3>
      <div>${results.map(result => `
        <article class="panel">
          <p>विद्यार्थी: ${escapeHTML(result.student_name)}</p>
          <p>टेस्ट: ${escapeHTML(result.test_title)}</p>
          <p>अंक: ${Number(result.score)}</p>
          <p>सही: ${Number(result.correct)} · गलत: ${Number(result.wrong)}</p>
          <p>${escapeHTML(result.created_at)}</p>
        </article>
      `).join("") || "अभी कोई परिणाम नहीं है।"}</div>

      <button id="adminLogout" type="button">Admin Logout</button>
    `);

    document.querySelectorAll("[data-publish]").forEach(button => {
      button.onclick = async () => {
        try {
          await api(`/api/admin/tests/${button.dataset.publish}/publish`, {
            method: "PUT",
            body: JSON.stringify({
              published: button.dataset.value === "1"
            })
          });
          await adminDashboard();
        } catch (error) {
          notice(error.message, true);
        }
      };
    });

    $("#adminLogout").onclick = async () => {
      try {
        await api("/api/admin/logout", { method: "POST" });
        $("#dashboard").classList.add("hidden");
        $("#auth").classList.remove("hidden");
        showAuth("login");
      } catch (error) {
        notice(error.message, true);
      }
    };
  } catch (error) {
    notice(error.message, true);
  }
}

document.querySelectorAll("[data-auth]").forEach(button => {
  button.addEventListener("click", () => showAuth(button.dataset.auth));
});

$("#loginForm").addEventListener("submit", event => {
  event.preventDefault();
  notice(
    "Student login API अभी server.js में उपलब्ध नहीं है।",
    true
  );
});

$("#registerForm").addEventListener("submit", event => {
  event.preventDefault();
  notice(
    "Student registration API जोड़ने के लिए server.js में भी बदलाव ज़रूरी है।",
    true
  );
});

$("#adminForm").addEventListener("submit", adminLogin);

loadTests().catch(error => notice(error.message, true));
