/* ============================================================
   mistakes.js —— 错题本
   依赖（按 HTML 中顺序）：texts.js、storage.js、app.js
   职责：记错题（文字为主、照片可选）、错题集翻阅搜索、
        掌握度标记（未掌握/复习中/已掌握）、随机自测
   ============================================================ */

/* ---------- 全局状态 ---------- */
var mistakes = loadMistakes();
var mEditingId = null;
var mImage = null;               // 当前表单里待保存的照片（dataURL）
var mFilterMastery = 'all';
var mKeyword = '';
var mOpenId = null;
var quizId = null;

/* ---------- 元素 ---------- */
var mViewForm = document.getElementById('m-view-form');
var mViewList = document.getElementById('m-view-list');
var mSubject = document.getElementById('m-subject');
var mQuestion = document.getElementById('m-question');
var mWrong = document.getElementById('m-wrong');
var mAnswer = document.getElementById('m-answer');
var mNote = document.getElementById('m-note');
var mEditTip = document.getElementById('m-edit-tip');
var mImageInput = document.getElementById('m-image-input');
var mImagePreview = document.getElementById('m-image-preview');
var mList = document.getElementById('m-list');
var mStats = document.getElementById('m-stats');
var mMask = document.getElementById('m-mask');
var qMask = document.getElementById('q-mask');

/* ---------- 子页切换（记错题 / 错题集，不播过场） ---------- */
var mSubtabs = document.querySelectorAll('.m-subtab');
function applyMView(view) {
  mSubtabs.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mview') === view); });
  mViewForm.classList.toggle('show', view === 'form');
  mViewList.classList.toggle('show', view === 'list');
  if (view === 'list') renderMistakes();
}
mSubtabs.forEach(function (btn) {
  btn.addEventListener('click', function () { applyMView(btn.getAttribute('data-mview')); });
});

/* ---------- 科目候选 ---------- */
(function () {
  var dl = document.getElementById('m-subject-list');
  MISTAKE_SUBJECTS.forEach(function (s) {
    var op = document.createElement('option');
    op.value = s;
    dl.appendChild(op);
  });
})();

/* ---------- 照片 ---------- */
document.getElementById('m-attach-btn').addEventListener('click', function () { mImageInput.click(); });
mImageInput.addEventListener('change', function () {
  var f = mImageInput.files && mImageInput.files[0];
  mImageInput.value = '';
  if (!f) return;
  compressImage(f, 1280, function (url) {
    if (!url) { showToast('这张图片没有读懂，换一张试试'); return; }
    mImage = url;
    renderMImage();
  });
});
function renderMImage() {
  if (mImage) {
    mImagePreview.innerHTML = '<img src="' + mImage + '" alt=""><i class="img-del" id="m-image-del">×</i>';
    mImagePreview.style.display = 'inline-block';
    document.getElementById('m-image-del').addEventListener('click', function () {
      mImage = null;
      renderMImage();
    });
  } else {
    mImagePreview.innerHTML = '';
    mImagePreview.style.display = 'none';
  }
}

/* ---------- 保存 / 重置 ---------- */
function resetMForm() {
  mEditingId = null;
  mSubject.value = '';
  mQuestion.value = '';
  mWrong.value = '';
  mAnswer.value = '';
  mNote.value = '';
  mImage = null;
  renderMImage();
  mEditTip.classList.remove('show');
}
document.getElementById('m-cancel-edit').addEventListener('click', resetMForm);

document.getElementById('m-save-btn').addEventListener('click', function () {
  var question = mQuestion.value.trim();
  if (!question && !mImage) { showToast('先把题目记下来吧'); mQuestion.focus(); return; }

  var subject = mSubject.value.trim() || '其他';
  if (mEditingId) {
    var item = mistakes.find(function (x) { return x.id === mEditingId; });
    if (item) {
      item.subject = subject;
      item.question = question;
      item.wrong = mWrong.value.trim();
      item.answer = mAnswer.value.trim();
      item.note = mNote.value.trim();
      item.updated = Date.now();
      if (mImage) item.image = mImage;
      else delete item.image;
    }
    if (!saveMistakes(mistakes)) { showToast('存储失败，空间可能不足；内容先留在编辑区'); return; }
    showToast('这道错题已重新整理好');
  } else {
    var entry = {
      id: uid(),
      ts: Date.now(),
      subject: subject,
      question: question,
      wrong: mWrong.value.trim(),
      answer: mAnswer.value.trim(),
      note: mNote.value.trim(),
      mastery: 'new'
    };
    if (mImage) entry.image = mImage;
    mistakes.push(entry);
    if (!saveMistakes(mistakes)) {
      mistakes.pop();
      showToast('存储失败，空间可能不足；内容先留在编辑区');
      return;
    }
    showToast(pick(MISTAKE_SAVE_TOASTS));
  }
  resetMForm();
  applyMView('list');
});

/* ---------- 错题集：筛选 / 搜索 / 渲染 ---------- */
var mFilters = document.getElementById('m-filters');
function buildMFilter(key, label) {
  var c = document.createElement('button');
  c.type = 'button';
  c.className = 'filter-chip' + (mFilterMastery === key ? ' sel' : '');
  c.textContent = label;
  c.addEventListener('click', function () {
    mFilterMastery = key;
    mFilters.querySelectorAll('.filter-chip').forEach(function (el) { el.classList.remove('sel'); });
    c.classList.add('sel');
    renderMistakes();
  });
  mFilters.appendChild(c);
}
buildMFilter('all', '全部');
MASTERY.forEach(function (m) { buildMFilter(m.key, m.name); });

var mSearchTimer = null;
document.getElementById('m-search-input').addEventListener('input', function () {
  var input = this;
  clearTimeout(mSearchTimer);
  mSearchTimer = setTimeout(function () {
    mKeyword = input.value.trim().toLowerCase();
    renderMistakes();
  }, 120);
});

function renderMistakes() {
  var list = mistakes.slice().sort(function (a, b) { return b.ts - a.ts; });
  var total = list.length;
  if (mFilterMastery !== 'all') list = list.filter(function (e) { return (e.mastery || 'new') === mFilterMastery; });
  if (mKeyword) {
    list = list.filter(function (e) {
      return (e.subject || '').toLowerCase().indexOf(mKeyword) !== -1 ||
             (e.question || '').toLowerCase().indexOf(mKeyword) !== -1 ||
             (e.answer || '').toLowerCase().indexOf(mKeyword) !== -1 ||
             (e.note || '').toLowerCase().indexOf(mKeyword) !== -1;
    });
  }

  var undone = mistakes.filter(function (e) { return (e.mastery || 'new') !== 'done'; }).length;
  mStats.textContent = total === 0
    ? '错题本还空着'
    : '共收进 ' + total + ' 道错题 · 还有 ' + undone + ' 道待攻克' +
      (list.length !== total ? ' · 此刻翻到 ' + list.length + ' 道' : '');

  if (list.length === 0) {
    mList.innerHTML = '<div class="empty"><div class="icon">✎</div><p>' +
      esc(total === 0 ? pick(MISTAKE_EMPTY_LINES) : '没有符合条件的错题，换个条件试试') + '</p></div>';
    return;
  }

  var html = '';
  list.forEach(function (e) {
    var mst = MASTERY_MAP[e.mastery] || MASTERY[0];
    var d = new Date(e.ts);
    html +=
      '<article class="entry m-entry" data-id="' + e.id + '">' +
        '<div class="entry-top">' +
          '<span class="m-subject">' + esc(e.subject || '其他') + '</span>' +
          '<span class="entry-title">' + esc((e.question || '图片题').split('\n')[0]) + '</span>' +
          '<span class="entry-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
        '</div>' +
        '<div class="entry-preview">' + esc(e.note || e.answer || e.question) + '</div>' +
        (e.image ? '<div class="entry-thumbs"><img src="' + e.image + '" alt="" loading="lazy"></div>' : '') +
        '<span class="mastery-tag" style="--mastery-color:' + mst.color + '">' + mst.name + '</span>' +
      '</article>';
  });
  mList.innerHTML = html;
}
/* 事件委托：错题集只挂一个监听 */
mList.addEventListener('click', function (ev) {
  var card = ev.target.closest ? ev.target.closest('.m-entry') : null;
  if (card) openMModal(card.getAttribute('data-id'));
});

/* ---------- 错题详情弹窗 ---------- */
function openMModal(id) {
  var e = mistakes.find(function (x) { return x.id === id; });
  if (!e) return;
  mOpenId = id;
  document.getElementById('m-modal-subject').textContent = e.subject || '其他';
  document.getElementById('m-modal-date').textContent = fullLabel(e.ts);
  document.getElementById('m-modal-question').textContent = e.question || '（图片题）';
  var imgBox = document.getElementById('m-modal-image');
  if (e.image) {
    imgBox.innerHTML = '<img src="' + e.image + '" alt="">';
    imgBox.style.display = 'block';
  } else {
    imgBox.innerHTML = '';
    imgBox.style.display = 'none';
  }
  setMField('m-modal-wrong-wrap', 'm-modal-wrong', e.wrong);
  setMField('m-modal-answer-wrap', 'm-modal-answer', e.answer);
  setMField('m-modal-note-wrap', 'm-modal-note', e.note);
  renderMasteryBtns(e);
  mMask.classList.add('show');
}
function setMField(wrapId, textId, val) {
  document.getElementById(wrapId).style.display = val ? 'block' : 'none';
  document.getElementById(textId).textContent = val || '';
}
function renderMasteryBtns(e) {
  var box = document.getElementById('m-mastery-btns');
  var html = '';
  MASTERY.forEach(function (m) {
    html += '<button type="button" class="filter-chip m-mastery-chip' +
            ((e.mastery || 'new') === m.key ? ' sel' : '') +
            '" data-key="' + m.key + '">' + m.name + '</button>';
  });
  box.innerHTML = html;
}
document.getElementById('m-mastery-btns').addEventListener('click', function (ev) {
  var key = ev.target.getAttribute && ev.target.getAttribute('data-key');
  if (!key) return;
  var e = mistakes.find(function (x) { return x.id === mOpenId; });
  if (!e) return;
  e.mastery = key;
  e.updated = Date.now();
  saveMistakes(mistakes);
  renderMasteryBtns(e);
  renderMistakes();
  showToast('已标记为「' + (MASTERY_MAP[key] || MASTERY[0]).name + '」');
});
function closeMModal() {
  mMask.classList.remove('show');
  mOpenId = null;
}
document.getElementById('m-close-btn').addEventListener('click', closeMModal);
mMask.addEventListener('click', function (ev) { if (ev.target === mMask) closeMModal(); });

document.getElementById('m-edit-btn').addEventListener('click', function () {
  var e = mistakes.find(function (x) { return x.id === mOpenId; });
  if (!e) return;
  mEditingId = e.id;
  mSubject.value = e.subject || '';
  mQuestion.value = e.question || '';
  mWrong.value = e.wrong || '';
  mAnswer.value = e.answer || '';
  mNote.value = e.note || '';
  mImage = e.image || null;
  renderMImage();
  mEditTip.classList.add('show');
  closeMModal();
  applyMView('form');
  mQuestion.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('m-delete-btn').addEventListener('click', function () {
  var e = mistakes.find(function (x) { return x.id === mOpenId; });
  if (!e) return;
  if (!confirm('确定删除这道错题吗？删除后无法恢复。')) return;
  mistakes = mistakes.filter(function (x) { return x.id !== mOpenId; });
  saveMistakes(mistakes);
  closeMModal();
  renderMistakes();
  showToast('这道错题已移除');
});

/* ---------- 随机自测 ---------- */
document.getElementById('m-quiz-btn').addEventListener('click', startQuiz);
document.getElementById('m-quiz-btn-2').addEventListener('click', startQuiz);

function startQuiz() {
  var pool = mistakes.filter(function (e) { return (e.mastery || 'new') !== 'done'; });
  if (!pool.length) { showToast(pick(QUIZ_EMPTY_LINES)); return; }
  var e = pick(pool);
  quizId = e.id;
  document.getElementById('q-subject').textContent = e.subject || '其他';
  document.getElementById('q-question').textContent = e.question || '（看图回忆这道题）';
  var qImg = document.getElementById('q-image');
  if (e.image) {
    qImg.innerHTML = '<img src="' + e.image + '" alt="">';
    qImg.style.display = 'block';
  } else {
    qImg.innerHTML = '';
    qImg.style.display = 'none';
  }
  /* 解析区先藏起来，考一考自己 */
  var detail = '';
  if (e.wrong) detail += '【当时的错解】\n' + e.wrong + '\n\n';
  if (e.answer) detail += '【正确解析】\n' + e.answer + '\n\n';
  if (e.note) detail += '【错因笔记】\n' + e.note;
  document.getElementById('q-answer').textContent = detail || '（这道题当时没有写解析）';
  document.getElementById('q-answer-wrap').classList.remove('show');
  document.getElementById('q-reveal-btn').style.display = '';
  document.getElementById('q-judge').classList.remove('show');
  qMask.classList.add('show');
}
document.getElementById('q-reveal-btn').addEventListener('click', function () {
  document.getElementById('q-answer-wrap').classList.add('show');
  document.getElementById('q-judge').classList.add('show');
  this.style.display = 'none';
});
function judgeQuiz(mastery) {
  var e = mistakes.find(function (x) { return x.id === quizId; });
  if (!e) { closeQuiz(); return; }
  e.mastery = mastery;
  e.updated = Date.now();
  saveMistakes(mistakes);
  closeQuiz();
  renderMistakes();
  showToast(mastery === 'done' ? pick(QUIZ_PRAISES) : '没关系，它会在错题集里等你');
}
document.getElementById('q-know-btn').addEventListener('click', function () { judgeQuiz('done'); });
document.getElementById('q-vague-btn').addEventListener('click', function () { judgeQuiz('learning'); });
function closeQuiz() {
  qMask.classList.remove('show');
  quizId = null;
}
document.getElementById('q-close-btn').addEventListener('click', closeQuiz);
qMask.addEventListener('click', function (ev) { if (ev.target === qMask) closeQuiz(); });

/* Esc 关闭错题相关弹窗（日记弹窗的 Esc 在 app.js 中处理） */
document.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Escape') return;
  if (qMask.classList.contains('show')) closeQuiz();
  else if (mMask.classList.contains('show')) closeMModal();
});
