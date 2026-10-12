/* ============================================================
   storage.js —— 本地存储读写与通用小工具
   依赖：无
   说明：日记保存在浏览器 localStorage，键名与旧版单文件一致，
        从 diary.html 拆分后原有日记不会丢失。
   ============================================================ */

var STORE_KEY = 'morandi_diary_entries_v1';

/* 读取全部日记；数据损坏时返回空数组 */
function loadEntries() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    var data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/* 保存全部日记；成功返回 true，失败（如空间不足）返回 false */
function saveEntries(entries) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    return true;
  } catch (e) {
    return false;
  }
}

/* 通过 DOM 转义，避免日记内容被当作 HTML 执行（复用同一个节点） */
var escDiv = document.createElement('div');
function esc(str) {
  escDiv.textContent = str == null ? '' : String(str);
  return escDiv.innerHTML;
}

/* 生成日记编号 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* 两位补零 */
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/* YYYY-M-D 形式的日期串 */
function dateStr(ts) {
  var d = new Date(ts);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/* 详情弹窗使用的完整时间：YYYY 年 M 月 D 日 · 星期X HH:MM */
function fullLabel(ts) {
  var d = new Date(ts);
  var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() +
         ' 日 · 星期' + week + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

/* ============================================================
   错题本存储
   ============================================================ */
var MISTAKE_KEY = 'morandi_mistakes_v1';

function loadMistakes() {
  try {
    var raw = localStorage.getItem(MISTAKE_KEY);
    var data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveMistakes(list) {
  try {
    localStorage.setItem(MISTAKE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================================================
   每日一签存储（记录今天抽到的签，一天不变）
   ============================================================ */
var SIGN_KEY = 'morandi_daily_sign_v1';

function loadSign() {
  try {
    var raw = localStorage.getItem(SIGN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveSign(obj) {
  try {
    localStorage.setItem(SIGN_KEY, JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

/* ============================================================
   图片压缩：File → 缩放后的 JPEG dataURL
   localStorage 容量有限，长边压到 maxEdge、质量 0.82，
   通常每张可控制在几百 KB 内。
   ============================================================ */
function compressImage(file, maxEdge, cb) {
  if (!file || !/^image\//.test(file.type)) { cb(null); return; }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var w = img.width, h = img.height;
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, cw, ch);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = function () { cb(null); };
    img.src = reader.result;
  };
  reader.onerror = function () { cb(null); };
  reader.readAsDataURL(file);
}

/* ============================================================
   备份 / 恢复
   导出：日记 + 错题打成一个 JSON 文件下载；
   解析：校验文件结构，返回 { entries, mistakes } 或 null。
   ============================================================ */
var BACKUP_VERSION = 1;

function exportBackup(entries, mistakes) {
  var payload = {
    app: 'xiansui-diary',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    entries: entries,
    mistakes: mistakes
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var d = new Date();
  a.href = url;
  a.download = '闲碎备份_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function parseBackup(text) {
  try {
    var data = JSON.parse(text);
    if (!data || typeof data !== 'object') return null;
    if (!Array.isArray(data.entries)) return null;
    return {
      entries: data.entries,
      mistakes: Array.isArray(data.mistakes) ? data.mistakes : []
    };
  } catch (e) {
    return null;
  }
}
