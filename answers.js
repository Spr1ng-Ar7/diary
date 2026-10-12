/* ============================================================
   answers.js —— 答案之书 & 每日一签
   依赖（按 HTML 中顺序）：texts.js、storage.js、app.js
   职责：经典答案之书（默念问题 → 轻触书页 → 一句答案）、
        每日一签（一天一签，抽中后当天不变）
   ============================================================ */

/* ---------- 答案之书 ---------- */
var answerBook = document.getElementById('answer-book');
var answerText = document.getElementById('answer-text');
var answerHint = document.getElementById('answer-hint');
var bookBusy = false;
var lastAnswerIdx = -1;
var reduceMotion = !!(window.matchMedia &&
                      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

answerBook.addEventListener('click', function () {
  if (bookBusy) return;
  bookBusy = true;

  var i;
  do { i = Math.floor(Math.random() * ANSWER_LINES.length); }
  while (i === lastAnswerIdx && ANSWER_LINES.length > 1);
  lastAnswerIdx = i;
  var line = ANSWER_LINES[i];

  if (reduceMotion) {
    answerText.textContent = line;
    answerText.classList.add('show');
    bookBusy = false;
    return;
  }

  answerText.classList.remove('show');
  answerHint.classList.add('hide');
  answerBook.classList.add('flipping');

  setTimeout(function () {
    answerText.textContent = line;
    answerText.classList.add('show');
  }, 620);
  setTimeout(function () {
    answerBook.classList.remove('flipping');
    answerHint.classList.remove('hide');
    answerHint.textContent = '心有新的疑问时，再轻触一次';
    bookBusy = false;
  }, 1150);
});

/* ---------- 每日一签（抽中后当天不变） ---------- */
var signCover = document.getElementById('sign-cover');
var signResult = document.getElementById('sign-result');
var signText = document.getElementById('sign-text');

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function renderAnswers() {
  var saved = loadSign();
  if (saved && saved.date === todayStr() && SIGN_LINES[saved.idx]) {
    signCover.style.display = 'none';
    signResult.classList.add('show');
    signText.textContent = SIGN_LINES[saved.idx];
  } else {
    signCover.style.display = '';
    signResult.classList.remove('show');
  }
}

signCover.addEventListener('click', function () {
  var idx = Math.floor(Math.random() * SIGN_LINES.length);
  saveSign({ date: todayStr(), idx: idx });
  signCover.style.display = 'none';
  signText.textContent = SIGN_LINES[idx];
  signResult.classList.add('show');
  showToast('今日签已收好，明天再来');
});
