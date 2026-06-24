// ===== MoMot Blog - Core Scripts =====

// ============================================================
//  GitHub API 工具函数
// ============================================================
var GITHUB_CONFIG = {
  token: localStorage.getItem('momot_github_token') || '',
  owner: 'momot8488-alt',
  repo: 'momot-blog',
  branch: 'main',
  path: 'posts.json'
};

function getToken() {
  return localStorage.getItem('momot_github_token') || '';
}
function setToken(t) {
  localStorage.setItem('momot_github_token', t);
  GITHUB_CONFIG.token = t;
}
function hasToken() {
  return !!getToken();
}

function githubAPI(endpoint, method, body) {
  var url = 'https://api.github.com' + endpoint;
  var headers = {
    'Authorization': 'Bearer ' + GITHUB_CONFIG.token,
    'Accept': 'application/vnd.github.v3+json'
  };
  var opts = { method: method, headers: headers };
  if (body) {
    opts.body = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, opts).then(function(res) {
    if (!res.ok) {
      return res.json().then(function(err) {
        throw new Error(err.message || ('GitHub API error: ' + res.status));
      });
    }
    return res.json();
  });
}

// UTF-8 解码 base64 内容
function decodeBase64UTF8(b64) {
  var binary = atob(b64.replace(/\s/g, ''));
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// 从 GitHub 读取 posts.json
function fetchPostsFromGitHub() {
  var url = '/repos/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo + '/contents/' + GITHUB_CONFIG.path + '?ref=' + GITHUB_CONFIG.branch;
  return githubAPI(url, 'GET').then(function(data) {
    var content = decodeBase64UTF8(data.content);
    return JSON.parse(content);
  });
}

// 写入 posts.json 到 GitHub
function savePostsToGitHub(posts, sha, message) {
  var url = '/repos/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo + '/contents/' + GITHUB_CONFIG.path;
  var body = {
    message: message || 'Update posts.json',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(posts, null, 2)))),
    branch: GITHUB_CONFIG.branch,
    sha: sha
  };
  return githubAPI(url, 'PUT', body);
}

// 获取 posts.json 的 sha（写入前必须）
function getPostsSHA() {
  var url = '/repos/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo + '/contents/' + GITHUB_CONFIG.path + '?ref=' + GITHUB_CONFIG.branch;
  return githubAPI(url, 'GET').then(function(data) {
    return data.sha;
  });
}

// ============================================================
//  登录状态管理
// ============================================================
var AUTH_KEY = 'momot_admin_auth';

function isLoggedIn() {
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

function doLogin(password) {
  if (password === 'admin123') {
    sessionStorage.setItem(AUTH_KEY, 'true');
    return true;
  }
  return false;
}

function doLogout() {
  sessionStorage.removeItem(AUTH_KEY);
}

// 检查登录状态，未登录跳转 login.html
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = './login.html';
    return false;
  }
  return true;
}

// ============================================================
//  数据加载：优先从 GitHub，失败则回退到本地 posts.json
// ============================================================
function loadPosts() {
  return fetchPostsFromGitHub().catch(function(err) {
    console.warn('GitHub 加载失败，回退到本地 posts.json:', err.message);
    return fetch('./posts.json').then(function(res) {
      if (!res.ok) throw new Error('本地 posts.json 加载失败');
      return res.json();
    });
  });
}

// ============================================================
//  简易 Markdown 渲染器
// ============================================================
function renderMarkdown(md) {
  if (!md) return '';
  var html = md;

  // 转义 HTML 实体（先保护代码块）
  var codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
    var idx = codeBlocks.length;
    codeBlocks.push({ lang: lang, code: code.trim() });
    return '%%CODEBLOCK_' + idx + '%%';
  });

  // 转义内联 HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 恢复代码块
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, function(_, idx) {
    var cb = codeBlocks[parseInt(idx)];
    return '<pre><code' + (cb.lang ? ' class="language-' + cb.lang + '"' : '') + '>' + cb.code + '</code></pre>';
  });

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 粗体 + 斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 引用
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // 无序列表
  html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, function(m) {
    return '<ul>' + m + '</ul>';
  });

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 链接（排除图片语法 ![...](...)）
  html = html.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 图片
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // 段落：把连续的非标签文本行包裹为 <p>
  var lines = html.split('\n');
  var result = [];
  var buf = [];
  function flush() {
    if (buf.length > 0) {
      var text = buf.join('\n').trim();
      if (text && !/^<[a-z]/.test(text)) {
        result.push('<p>' + text + '</p>');
      } else if (text) {
        result.push(text);
      }
      buf = [];
    }
  }
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^<(h[1-3]|ul|ol|li|pre|blockquote|hr|div|table)/.test(line) || line.trim() === '') {
      flush();
      if (line.trim() !== '') result.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();

  return result.join('\n');
}

// ============================================================
//  Index Page: 动态加载文章卡片
// ============================================================
function renderPostGrid(posts) {
  var grid = document.querySelector('.post-grid');
  if (!grid) return;
  grid.innerHTML = '';
  // 按日期倒序
  posts.sort(function(a, b) { return b.date.localeCompare(a.date); });
  posts.forEach(function(post) {
    var tagsHtml = post.tags.map(function(t) {
      return '<span>' + t + '</span>';
    }).join('');
    var card = document.createElement('article');
    card.className = 'post-card';
    card.innerHTML =
      '<div class="post-card-img"><span>&#x1F4D8;</span></div>' +
      '<div class="post-card-body">' +
        '<span class="post-card-date">' + post.date + '</span>' +
        '<h3><a href="./post.html?id=' + post.id + '">' + post.title + '</a></h3>' +
        '<p class="post-card-excerpt">' + post.summary + '</p>' +
        '<div class="post-card-tags">' + tagsHtml + '</div>' +
      '</div>';
    grid.appendChild(card);
  });
  // 分页暂时隐藏（数据量少）
  var pag = document.querySelector('.pagination');
  if (pag) pag.style.display = 'none';
}

// ============================================================
//  Post Page: 通过 URL 参数加载单篇文章
// ============================================================
function renderPostPage(posts) {
  var article = document.getElementById('post-article');
  if (!article) return;
  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get('id')) || 1;
  var post = null;
  for (var i = 0; i < posts.length; i++) {
    if (posts[i].id === id) { post = posts[i]; break; }
  }
  if (!post) post = posts[0];
  if (!post) return;

  document.getElementById('page-title').textContent = post.title + ' - MoMot';

  var tagsHtml = post.tags.map(function(t) {
    return '<span>' + t + '</span>';
  }).join('');

  article.innerHTML =
    '<div class="post-header">' +
      '<h1>' + post.title + '</h1>' +
      '<div class="post-meta">' + post.date + ' &middot; ' + post.tags.length + ' 个标签</div>' +
    '</div>' +
    '<div class="post-content">' + renderMarkdown(post.content) + '</div>' +
    '<div class="post-footer">' +
      '<a href="./index.html">&larr; 返回首页</a>' +
    '</div>';
}

// ============================================================
//  Admin: 管理后台逻辑
// ============================================================
function initAdmin() {
  if (!requireAuth()) return;

  var currentPosts = [];
  var editingId = null;
  var currentSHA = null;

  var panelWrite = document.getElementById('panel-write');
  var panelList = document.getElementById('panel-list');
  var btnWrite = document.getElementById('btn-write');
  var btnList = document.getElementById('btn-list');
  var btnLogout = document.getElementById('btn-logout');
  var formTitle = document.getElementById('post-title');
  var formContent = document.getElementById('post-content');
  var formPreview = document.getElementById('post-preview');
  var btnPublish = document.getElementById('btn-publish');
  var btnPreview = document.getElementById('btn-preview');
  var btnInsertImage = document.getElementById('btn-insert-image');
  var imageFileInput = document.getElementById('image-file-input');
  var uploadStatus = document.getElementById('upload-status');
  var tableBody = document.getElementById('posts-table-body');
  var statusMsg = document.getElementById('status-msg');

  // Tab 切换
  function showPanel(panel) {
    panelWrite.style.display = 'none';
    panelList.style.display = 'none';
    btnWrite.classList.remove('active');
    btnList.classList.remove('active');
    if (panel === 'write') {
      panelWrite.style.display = 'block';
      btnWrite.classList.add('active');
    } else {
      panelList.style.display = 'block';
      btnList.classList.add('active');
    }
  }

  btnWrite.addEventListener('click', function() { showPanel('write'); });
  btnList.addEventListener('click', function() { showPanel('list'); });

  // 退出登录
  btnLogout.addEventListener('click', function() {
    doLogout();
    window.location.href = './login.html';
  });

  // 预览切换
  btnPreview.addEventListener('click', function() {
    if (formPreview.style.display === 'none' || !formPreview.style.display) {
      formPreview.innerHTML = renderMarkdown(formContent.value);
      formPreview.style.display = 'block';
      formContent.style.display = 'none';
      btnPreview.textContent = '编辑';
    } else {
      formPreview.style.display = 'none';
      formContent.style.display = 'block';
      btnPreview.textContent = '预览';
    }
  });

  // 图片上传功能
  btnInsertImage.addEventListener('click', function() {
    imageFileInput.click();
  });

  imageFileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;

    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      setStatus('请选择图片文件', true);
      return;
    }

    uploadStatus.style.display = 'block';
    uploadStatus.textContent = '正在上传图片...';

    var reader = new FileReader();
    reader.onload = function(ev) {
      var base64Full = ev.target.result;
      // 去掉 data:image/xxx;base64, 前缀
      var base64Content = base64Full.split(',')[1];
      if (!base64Content) {
        uploadStatus.textContent = '读取图片失败';
        return;
      }

      // 生成唯一文件名：年月日时分秒_随机数.ext
      var ext = file.name.split('.').pop() || 'png';
      var now = new Date();
      var ts = now.getFullYear() +
        String(now.getMonth()+1).padStart(2,'0') +
        String(now.getDate()).padStart(2,'0') +
        String(now.getHours()).padStart(2,'0') +
        String(now.getMinutes()).padStart(2,'0') +
        String(now.getSeconds()).padStart(2,'0');
      var rand = Math.random().toString(36).substring(2, 6);
      var fileName = ts + '_' + rand + '.' + ext;
      var imagePath = 'images/' + fileName;

      // 上传到 GitHub
      var uploadUrl = '/repos/' + GITHUB_CONFIG.owner + '/' + GITHUB_CONFIG.repo +
        '/contents/' + imagePath;
      var body = {
        message: 'Upload image: ' + fileName,
        content: base64Content,
        branch: GITHUB_CONFIG.branch
      };
      var headers = {
        'Authorization': 'Bearer ' + GITHUB_CONFIG.token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      };

      fetch('https://api.github.com' + uploadUrl, {
        method: 'PUT', headers: headers, body: JSON.stringify(body)
      }).then(function(res) {
        if (!res.ok) {
          return res.json().then(function(err) {
            throw new Error(err.message || ('上传失败: ' + res.status));
          });
        }
        return res.json();
      }).then(function(result) {
        // 图片 URL
        var imageUrl = 'https://momot.top/' + imagePath;
        // 插入 Markdown 图片语法到编辑器光标位置
        var mdImg = '![' + file.name + '](' + imageUrl + ')';
        var ta = formContent;
        var start = ta.selectionStart;
        var end = ta.selectionEnd;
        var text = ta.value;
        ta.value = text.substring(0, start) + '\n' + mdImg + '\n' + text.substring(end);
        // 移动光标到插入内容之后
        ta.selectionStart = ta.selectionEnd = start + mdImg.length + 2;
        ta.focus();

        uploadStatus.textContent = '图片已上传: ' + imageUrl;
        setTimeout(function() { uploadStatus.style.display = 'none'; }, 5000);
      }).catch(function(err) {
        uploadStatus.textContent = '上传失败: ' + err.message;
      });
    };
    reader.readAsDataURL(file);

    // 清除文件选择器值，允许重复选择同一文件
    imageFileInput.value = '';
  });

  // 状态提示
  function setStatus(msg, isError) {
    statusMsg.textContent = msg;
    statusMsg.className = 'status-msg' + (isError ? ' error' : ' success');
    statusMsg.style.display = 'block';
    setTimeout(function() { statusMsg.style.display = 'none'; }, 4000);
  }

  // 加载文章列表
  function loadPostList() {
    loadPosts().then(function(posts) {
      currentPosts = posts;
      renderTable();
    }).catch(function(err) {
      setStatus('加载文章失败: ' + err.message, true);
    });
  }

  // 渲染表格
  function renderTable() {
    tableBody.innerHTML = '';
    currentPosts.sort(function(a, b) { return b.date.localeCompare(a.date); });
    currentPosts.forEach(function(post) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + post.title + '</td>' +
        '<td>' + post.date + '</td>' +
        '<td class="actions">' +
          '<button class="btn-edit" data-id="' + post.id + '">编辑</button>' +
          '<button class="btn-del" data-id="' + post.id + '">删除</button>' +
        '</td>';
      tableBody.appendChild(tr);
    });

    // 编辑按钮
    tableBody.querySelectorAll('.btn-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        var post = currentPosts.find(function(p) { return p.id === id; });
        if (post) {
          editingId = id;
          formTitle.value = post.title;
          formContent.value = post.content;
          showPanel('write');
          btnPublish.textContent = '更新文章';
        }
      });
    });

    // 删除按钮
    tableBody.querySelectorAll('.btn-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = parseInt(this.getAttribute('data-id'));
        if (!confirm('确定要删除这篇文章吗？此操作不可撤销。')) return;
        deletePost(id);
      });
    });
  }

  // 发布/更新文章
  btnPublish.addEventListener('click', function() {
    var title = formTitle.value.trim();
    var content = formContent.value.trim();
    if (!title) { setStatus('请输入文章标题', true); return; }
    if (!content) { setStatus('请输入文章内容', true); return; }

    // 生成 summary：取内容前 120 个字符
    var summary = content.replace(/[#*`>\-\n\r]/g, '').trim().substring(0, 120);
    if (content.length > 120) summary += '...';

    var now = new Date();
    var dateStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    // 简单提取 tags（从内容中的 ## 标题提取）
    var tags = [];
    var h2Matches = content.match(/^## (.+)$/gm);
    if (h2Matches) {
      h2Matches.slice(0, 4).forEach(function(h) {
        var tag = h.replace(/^## /, '').trim().substring(0, 8);
        if (tag) tags.push(tag);
      });
    }
    if (tags.length === 0) tags = ['未分类'];

    if (editingId !== null) {
      // 编辑模式
      var post = currentPosts.find(function(p) { return p.id === editingId; });
      if (post) {
        post.title = title;
        post.content = content;
        post.summary = summary;
        post.date = dateStr;
        post.tags = tags;
      }
    } else {
      // 新建模式
      var maxId = 0;
      currentPosts.forEach(function(p) { if (p.id > maxId) maxId = p.id; });
      currentPosts.push({
        id: maxId + 1,
        title: title,
        date: dateStr,
        summary: summary,
        tags: tags,
        content: content
      });
    }

    // 同步到 GitHub
    getPostsSHA().then(function(sha) {
      return savePostsToGitHub(currentPosts, sha, editingId !== null ? 'Update post #' + editingId : 'Add new post');
    }).then(function() {
      setStatus(editingId !== null ? '文章已更新并同步到 GitHub' : '文章已发布并同步到 GitHub');
      resetForm();
      loadPostList();
    }).catch(function(err) {
      setStatus('同步到 GitHub 失败: ' + err.message, true);
    });
  });

  function resetForm() {
    editingId = null;
    formTitle.value = '';
    formContent.value = '';
    formPreview.innerHTML = '';
    formPreview.style.display = 'none';
    formContent.style.display = 'block';
    btnPublish.textContent = '发布文章';
    btnPreview.textContent = '预览';
  }

  // 删除文章
  function deletePost(id) {
    currentPosts = currentPosts.filter(function(p) { return p.id !== id; });
    getPostsSHA().then(function(sha) {
      return savePostsToGitHub(currentPosts, sha, 'Delete post #' + id);
    }).then(function() {
      setStatus('文章已删除');
      renderTable();
    }).catch(function(err) {
      setStatus('删除失败: ' + err.message, true);
      loadPostList();
    });
  }

  // 初始化
  loadPostList();
  showPanel('write');
}

// ============================================================
//  Init: 页面入口分发
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', function() {
      links.classList.toggle('open');
    });
  }

  // Set active nav link
  var currentPath = window.location.pathname;
  var navLinks = document.querySelectorAll('.nav-links a');
  navLinks.forEach(function(link) {
    var href = link.getAttribute('href');
    if (href && currentPath.endsWith(href.replace('./', ''))) {
      link.classList.add('active');
    } else if (href === './index.html' && (currentPath.endsWith('/') || currentPath.endsWith('index.html'))) {
      link.classList.add('active');
    }
  });

  // 页面路由：根据当前页面执行对应逻辑
  var pageName = currentPath.split('/').pop().split('?')[0] || 'index.html';

  if (pageName === 'index.html' || pageName === '') {
    // 首页：动态加载文章
    loadPosts().then(function(posts) {
      renderPostGrid(posts);
    }).catch(function(err) {
      console.error('加载文章失败:', err);
    });
  } else if (pageName === 'post.html') {
    // 文章详情页
    loadPosts().then(function(posts) {
      renderPostPage(posts);
    }).catch(function(err) {
      console.error('加载文章失败:', err);
    });
  } else if (pageName === 'admin.html') {
    initAdmin();
  }
});
