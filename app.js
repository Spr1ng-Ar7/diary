/* ============================================================
   app.js —— 页面主逻辑
   依赖（按 HTML 中顺序）：texts.js、storage.js、particles.js
   职责：状态管理、写日记、时间线翻阅、详情弹窗、
        过场动画编排（一句随机治愈文案 + 粒子）、
        今日一句、副标题轮换、初始化
   ============================================================ */

/* ---------- 全局状态 ---------- */
var entries = loadEntries();
var pickedMood = 'calm';
var editingId = null;
var filterMood = 'all';
var keyword = '';
var openId = null;

/* ---------- 轻提示 ---------- */
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, 1800);
}

/* ---------- 过场动画编排 ---------- */
var transEl = document.getElementById('trans');
var transLine = document.getElementById('trans-line');
var transBusy = false;
var particleSystem = createParticleSystem(
  document.getElementById('trans-canvas'),
  transEl
);

function playTransition(done) {
  if (transBusy) return;
  transBusy = true;

  var reduce = !!(window.matchMedia &&
                  window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var tSwitch = reduce ? 120  : 580;   // 幕布铺满后真正切换
  var tFadeOut = reduce ? 650 : 1780;  // 开始落幕
  var tEnd = reduce ? 1150    : 2360;  // 收尾

  transLine.textContent = pickHealing();
  transEl.classList.add('show');
  particleSystem.start();

  setTimeout(function () { if (done) done(); }, tSwitch);
  setTimeout(function () { transEl.classList.remove('show'); }, tFadeOut);
  setTimeout(function () {
    particleSystem.stop();
    transLine.textContent = '';
    transBusy = false;
  }, tEnd);
}

/* ---------- Tab 切换（带过场） ---------- */
var tabs = document.querySelectorAll('.tab');
function applyTab(target) {
  tabs.forEach(function (b) { b.classList.toggle('active', b.dataset.tab === target); });
  document.getElementById('panel-write').classList.toggle('show', target === 'write');
  document.getElementById('panel-browse').classList.toggle('show', target === 'browse');
  document.getElementById('panel-mistake').classList.toggle('show', target === 'mistake');
  document.getElementById('panel-answers').classList.toggle('show', target === 'answers');
  if (target === 'browse') renderTimeline();
  if (target === 'mistake' && typeof renderMistakes === 'function') renderMistakes();
  if (target === 'answers' && typeof renderAnswers === 'function') renderAnswers();
}
tabs.forEach(function (btn) {
  btn.addEventListener('click', function () {
    var target = btn.dataset.tab;
    var activeBtn = document.querySelector('.tab.active');
    if (activeBtn && activeBtn.dataset.tab === target) return;  // 已在当前页
    playTransition(function () { applyTab(target); });
  });
});
// 编辑入口直接切换，不播过场（弹窗已提供焦点）
function switchTab(name) { applyTab(name); }

/* ---------- 心情选择器 ---------- */
var moodPicker = document.getElementById('mood-picker');
MOODS.forEach(function (m) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'mood' + (m.key === pickedMood ? ' sel' : '');
  b.style.setProperty('--mood-color', m.color);
  b.innerHTML = '<span class="dot"></span>' + m.name;
  b.addEventListener('click', function () {
    pickedMood = m.key;
    moodPicker.querySelectorAll('.mood').forEach(function (el) { el.classList.remove('sel'); });
    b.classList.add('sel');
  });
  moodPicker.appendChild(b);
});

/* ---------- 心情筛选器 ---------- */
var filters = document.getElementById('filters');
function buildFilter(key, label) {
  var c = document.createElement('button');
  c.type = 'button';
  c.className = 'filter-chip' + (filterMood === key ? ' sel' : '');
  c.textContent = label;
  c.addEventListener('click', function () {
    filterMood = key;
    filters.querySelectorAll('.filter-chip').forEach(function (el) { el.classList.remove('sel'); });
    c.classList.add('sel');
    renderTimeline();
  });
  filters.appendChild(c);
}
buildFilter('all', '全部');
MOODS.forEach(function (m) { buildFilter(m.key, m.name); });

/* ---------- 日期标签 & 字数 ---------- */
function renderToday() {
  var now = new Date();
  var week = ['日', '一', '二', '三', '四', '五', '六'][now.getDay()];
  document.getElementById('today-label').textContent =
    now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月 ' + now.getDate() + ' 日 · 星期' + week;
}

var titleInput = document.getElementById('title-input');
var contentInput = document.getElementById('content-input');
var wordCount = document.getElementById('word-count');
function updateCount() {
  wordCount.textContent = (contentInput.value.replace(/\s/g, '').length) + ' 字';
}
contentInput.addEventListener('input', updateCount);

/* ---------- 日记附图 ---------- */
var pendingImages = [];
var imageInput = document.getElementById('image-input');
var imageThumbs = document.getElementById('image-thumbs');
var MAX_IMAGES = 6;

document.getElementById('attach-btn').addEventListener('click', function () { imageInput.click(); });
imageInput.addEventListener('change', function () {
  var files = Array.prototype.slice.call(imageInput.files || []);
  imageInput.value = '';
  files.forEach(function (f) {
    if (pendingImages.length >= MAX_IMAGES) { showToast('一篇最多附 ' + MAX_IMAGES + ' 张图'); return; }
    compressImage(f, 1280, function (url) {
      if (!url) { showToast('这张图片没有读懂，换一张试试'); return; }
      pendingImages.push(url);
      renderImageThumbs();
    });
  });
});

function renderImageThumbs() {
  var html = '';
  pendingImages.forEach(function (url, i) {
    html += '<span class="img-thumb"><img src="' + url + '" alt="">' +
            '<i class="img-del" data-del="' + i + '">×</i></span>';
  });
  imageThumbs.innerHTML = html;
  imageThumbs.style.display = pendingImages.length ? 'flex' : 'none';
}
imageThumbs.addEventListener('click', function (ev) {
  var del = ev.target.getAttribute && ev.target.getAttribute('data-del');
  if (del != null) {
    pendingImages.splice(Number(del), 1);
    renderImageThumbs();
  }
});

/* ---------- 保存 / 清空 / 取消编辑 ---------- */
function resetForm() {
  editingId = null;
  titleInput.value = '';
  contentInput.value = '';
  pendingImages = [];
  renderImageThumbs();
  pickedMood = 'calm';
  moodPicker.querySelectorAll('.mood').forEach(function (el, i) {
    el.classList.toggle('sel', MOODS[i].key === 'calm');
  });
  document.getElementById('edit-tip').classList.remove('show');
  updateCount();
  renderToday();
}

document.getElementById('save-btn').addEventListener('click', function () {
  var content = contentInput.value.trim();
  if (!content && pendingImages.length === 0) { showToast('先写点什么，再轻轻收起吧'); contentInput.focus(); return; }

  var title = titleInput.value.trim();
  if (!title) {
    title = content.split('\n')[0].slice(0, 18);
    if (content.length > 18) title += '…';
    if (!title) title = '今日碎片';
  }

  if (editingId) {
    var item = entries.find(function (e) { return e.id === editingId; });
    if (item) {
      item.title = title;
      item.content = content;
      item.mood = pickedMood;
      item.updated = Date.now();
      if (pendingImages.length) item.images = pendingImages.slice();
      else delete item.images;
    }
    if (!saveEntries(entries)) { showToast('存储失败，空间可能不足；内容先留在编辑区，别慌'); return; }
    showToast(pick(EDIT_TOASTS));
  } else {
    var entry = {
      id: uid(),
      ts: Date.now(),
      title: title,
      content: content,
      mood: pickedMood
    };
    if (pendingImages.length) entry.images = pendingImages.slice();
    entries.push(entry);
    if (!saveEntries(entries)) {
      entries.pop();
      showToast('存储失败，空间可能不足；内容先留在编辑区，别慌');
      return;
    }
    showToast(pick(SAVE_TOASTS));
  }
  resetForm();
  renderTimeline();
});

document.getElementById('clear-btn').addEventListener('click', function () {
  if (editingId) { resetForm(); return; }
  if (!titleInput.value && !contentInput.value && pendingImages.length === 0) return;
  titleInput.value = '';
  contentInput.value = '';
  pendingImages = [];
  renderImageThumbs();
  updateCount();
});

document.getElementById('cancel-edit').addEventListener('click', resetForm);

/* ---------- 翻阅：搜索与时间线 ---------- */
var searchInput = document.getElementById('search-input');
var emptyPhrase = pick(EMPTY_LINES);
var noResultPhrase = pick(NO_RESULT_LINES);
var searchTimer = null;
// 输入防抖：连续打字时只在停顿后才重建时间线
searchInput.addEventListener('input', function () {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () {
    keyword = searchInput.value.trim().toLowerCase();
    renderTimeline();
  }, 120);
});
// 每次重新聚焦搜索框时，换一句“没找到”的安慰
searchInput.addEventListener('focus', function () { noResultPhrase = pick(NO_RESULT_LINES); });

function renderTimeline() {
  var box = document.getElementById('timeline');
  var stats = document.getElementById('stats');

  var list = entries.slice().sort(function (a, b) { return b.ts - a.ts; });
  var total = list.length;
  if (filterMood !== 'all') list = list.filter(function (e) { return e.mood === filterMood; });
  if (keyword) {
    list = list.filter(function (e) {
      return (e.title || '').toLowerCase().indexOf(keyword) !== -1 ||
             (e.content || '').toLowerCase().indexOf(keyword) !== -1;
    });
  }

  stats.textContent = total === 0
    ? '还没有日记，不妨从今天写第一页'
    : '已收藏 ' + total + ' 段日子' + (list.length !== total ? ' · 此刻翻到 ' + list.length + ' 段' : '');

  if (list.length === 0) {
    box.innerHTML = '<div class="empty"><div class="icon">❦</div><p>' +
      (total === 0 ? emptyPhrase : noResultPhrase) + '</p></div>';
    return;
  }

  // 按月份分组
  var groups = {};
  var order = [];
  list.forEach(function (e) {
    var d = new Date(e.ts);
    var key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(e);
  });

  var html = '';
  order.forEach(function (key) {
    var parts = key.split('-');
    html += '<div class="month-head">' + parts[0] + ' 年 ' + parseInt(parts[1], 10) + ' 月</div>';
    groups[key].forEach(function (e) {
      var m = MOOD_MAP[e.mood] || MOODS[0];
      var d = new Date(e.ts);
      var thumbs = '';
      if (e.images && e.images.length) {
        thumbs = '<div class="entry-thumbs">';
        e.images.slice(0, 3).forEach(function (url) {
          thumbs += '<img src="' + url + '" alt="" loading="lazy">';
        });
        if (e.images.length > 3) thumbs += '<span class="more">+' + (e.images.length - 3) + '</span>';
        thumbs += '</div>';
      }
      html +=
        '<article class="entry" data-id="' + e.id + '" style="--mood-color:' + m.color + '">' +
          '<div class="entry-top">' +
            '<span class="entry-dot"></span>' +
            '<span class="entry-title">' + esc(e.title) + '</span>' +
            '<span class="entry-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span>' +
          '</div>' +
          '<div class="entry-preview">' + esc(e.content) + '</div>' +
          thumbs +
          '<span class="entry-mood-tag" style="--mood-color:' + m.color + '">' + m.name + '</span>' +
        '</article>';
    });
  });
  box.innerHTML = html;
}

/* 事件委托：整个时间线只挂一个监听，渲染再多卡片也不用逐个绑定 */
document.getElementById('timeline').addEventListener('click', function (ev) {
  var card = ev.target.closest ? ev.target.closest('.entry') : null;
  if (card) openModal(card.getAttribute('data-id'));
});

/* ---------- 详情弹窗 ---------- */
var mask = document.getElementById('mask');
function openModal(id) {
  var e = entries.find(function (x) { return x.id === id; });
  if (!e) return;
  openId = id;
  var m = MOOD_MAP[e.mood] || MOODS[0];
  var dot = document.getElementById('modal-dot');
  dot.style.background = m.color;
  document.getElementById('modal-mood').textContent = m.name;
  document.getElementById('modal-mood').style.setProperty('--mood-color', m.color);
  document.getElementById('modal-date').textContent = fullLabel(e.ts);
  document.getElementById('modal-title').textContent = e.title;
  document.getElementById('modal-body').textContent = e.content;
  var mImgBox = document.getElementById('modal-images');
  if (e.images && e.images.length) {
    var ih = '';
    e.images.forEach(function (url) { ih += '<img src="' + url + '" alt="">'; });
    mImgBox.innerHTML = ih;
    mImgBox.style.display = 'block';
  } else {
    mImgBox.innerHTML = '';
    mImgBox.style.display = 'none';
  }
  mask.classList.add('show');
}
function closeModal() {
  mask.classList.remove('show');
  openId = null;
}
document.getElementById('close-btn').addEventListener('click', closeModal);
mask.addEventListener('click', function (ev) { if (ev.target === mask) closeModal(); });
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && mask.classList.contains('show')) closeModal();
});

document.getElementById('modal-edit-btn').addEventListener('click', function () {
  var e = entries.find(function (x) { return x.id === openId; });
  if (!e) return;
  editingId = e.id;
  pickedMood = e.mood;
  titleInput.value = e.title || '';
  contentInput.value = e.content || '';
  pendingImages = (e.images || []).slice();
  renderImageThumbs();
  moodPicker.querySelectorAll('.mood').forEach(function (el, i) {
    el.classList.toggle('sel', MOODS[i].key === e.mood);
  });
  document.getElementById('edit-tip').classList.add('show');
  updateCount();
  closeModal();
  switchTab('write');
  contentInput.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('delete-btn').addEventListener('click', function () {
  var e = entries.find(function (x) { return x.id === openId; });
  if (!e) return;
  if (!confirm('确定删除《' + e.title + '》吗？删除后无法恢复。')) return;
  entries = entries.filter(function (x) { return x.id !== openId; });
  saveEntries(entries);
  if (entries.length === 0) emptyPhrase = pick(EMPTY_LINES);
  closeModal();
  renderTimeline();
  showToast('这一页已轻轻合上');
});

/* ---------- 今日一句（每天固定一句） ---------- */
function dayOfYear() {
  var now = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now - start) / 86400000);
}
document.getElementById('daily-quote-text').textContent =
  HEALING_LINES[dayOfYear() % HEALING_LINES.length];

/* ---------- 副标题每 7 秒轻声轮换 ---------- */
var subEl = document.getElementById('sub-text');
var subIdx = 0;
setInterval(function () {
  subEl.classList.add('swapping');
  setTimeout(function () {
    subIdx = (subIdx + 1) % SUB_LINES.length;
    subEl.textContent = SUB_LINES[subIdx];
    subEl.classList.remove('swapping');
  }, 500);
}, 7000);

/* ---------- 备份 / 恢复 ---------- */
document.getElementById('backup-btn').addEventListener('click', function () {
  exportBackup(entries, typeof mistakes !== 'undefined' ? mistakes : []);
  showToast('备份文件已开始下载，请妥善收好');
});
var importInput = document.getElementById('import-input');
document.getElementById('restore-btn').addEventListener('click', function () { importInput.click(); });
importInput.addEventListener('change', function () {
  var f = importInput.files && importInput.files[0];
  importInput.value = '';
  if (!f) return;
  var reader = new FileReader();
  reader.onload = function () {
    var data = parseBackup(reader.result);
    if (!data) { showToast('这个文件不是有效的备份'); return; }
    if (!confirm('恢复备份将覆盖当前所有日记与错题，确定继续吗？')) return;
    entries = data.entries;
    saveEntries(entries);
    if (typeof mistakes !== 'undefined') {
      mistakes = data.mistakes;
      saveMistakes(mistakes);
      if (typeof renderMistakes === 'function') renderMistakes();
    }
    resetForm();
    renderTimeline();
    showToast('已从备份里，找回那些日子');
  };
  reader.readAsText(f);
});

/* ---------- 初始化 ---------- */
renderToday();
updateCount();
renderTimeline();
