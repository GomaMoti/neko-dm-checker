// ===== データ同期・マイグレーション用キャッシュ =====
let gckStorage = {
  whitelist: {},
  templates: {},
  cache: {},
  kidsMode: false
};

// --- マイグレーション処理 ---
// 古い localStorage にデータがあれば読み取って chrome.storage に移し、localStorage を消去する
function migrateLocalStorageData() {
  let migrated = false;
  const wlKey = 'gck_whitelist';
  const prefixKey = 'gck_tpl_scam_prefix';
  const suffixKey = 'gck_tpl_scam_suffix';
  const tweetsKey = 'gck_tpl_tweets';
  const cacheKey = 'gck_checked_handles';
  const kidsKey = 'gck_kids_mode';

  if (localStorage.getItem(wlKey)) {
    try { gckStorage.whitelist = JSON.parse(localStorage.getItem(wlKey)); migrated = true; } catch (e) { }
    localStorage.removeItem(wlKey);
  }
  if (localStorage.getItem(prefixKey)) { gckStorage.templates[prefixKey] = localStorage.getItem(prefixKey); migrated = true; localStorage.removeItem(prefixKey); }
  if (localStorage.getItem(suffixKey)) { gckStorage.templates[suffixKey] = localStorage.getItem(suffixKey); migrated = true; localStorage.removeItem(suffixKey); }
  if (localStorage.getItem(tweetsKey)) { gckStorage.templates[tweetsKey] = localStorage.getItem(tweetsKey); migrated = true; localStorage.removeItem(tweetsKey); }
  if (localStorage.getItem(cacheKey)) {
    try { gckStorage.cache = JSON.parse(localStorage.getItem(cacheKey)); migrated = true; } catch (e) { }
    localStorage.removeItem(cacheKey);
  }
  if (localStorage.getItem(kidsKey) !== null) {
    gckStorage.kidsMode = localStorage.getItem(kidsKey) === 'true';
    migrated = true;
    localStorage.removeItem(kidsKey);
  }

  if (migrated) {
    saveStorage();
  }
}

// 読み込み完了後にデータをChrome Storageから取得して反映する初期化処理
function initStorage(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['gck_whitelist', 'gck_templates', 'gck_cache', 'gck_kids_mode'], (res) => {
      if (res.gck_whitelist) gckStorage.whitelist = res.gck_whitelist;
      if (res.gck_templates) gckStorage.templates = res.gck_templates;
      if (res.gck_cache) gckStorage.cache = res.gck_cache;
      if (res.gck_kids_mode !== undefined) gckStorage.kidsMode = res.gck_kids_mode;

      migrateLocalStorageData();
      if (callback) callback();
    });
  } else {
    // 拡張機能APIが使えない環境用フォールバック
    migrateLocalStorageData();
    if (callback) callback();
  }
}

// データをChrome Storageへ保存
function saveStorage() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      'gck_whitelist': gckStorage.whitelist,
      'gck_templates': gckStorage.templates,
      'gck_cache': gckStorage.cache,
      'gck_kids_mode': gckStorage.kidsMode
    });
  }
}

// ===== 信頼度リスト =====
function getWhitelist() {
  return gckStorage.whitelist;
}
function setTrustLevel(handle, level) {
  const wl = getWhitelist();
  if (!level) { delete wl[handle]; }
  else { wl[handle] = level; }
  saveStorage();
}
function getTrustLevel(handle) {
  return getWhitelist()[handle] || '';
}

// 🛡️ ハンドルのサニタイズ（安全な文字のみ許可）
function sanitizeHandle(handle) {
  if (!handle) return '';
  // 英数字・アンダースコア・ハイフンのみ許可、長さ制限
  return handle.substring(0, 50).replace(/[^A-Za-z0-9_-]/g, '');
}

// ===== クエリテンプレート設定 =====
const TEMPLATE_KEYS = {
  SCAM_PREFIX: 'gck_tpl_scam_prefix',
  SCAM_SUFFIX: 'gck_tpl_scam_suffix',
  TWEETS: 'gck_tpl_tweets',
  TWEETS_KIDS: 'gck_tpl_tweets_kids',
  SCAM_PREFIX_KIDS: 'gck_tpl_scam_prefix_kids',
  SCAM_SUFFIX_KIDS: 'gck_tpl_scam_suffix_kids'
};

// カテゴリ定義
const SCAM_CATEGORIES = {
  '投資・副業': ['投資・副業の話をしてきた', '急にお金の話になった', '前払い・手数料・保証金を要求してきた'],
  'ロマンス': ['ビデオ通話を拒否された', '鍵アカウントに誘導してきた', '秘密にするよう求められた'],
  'グルーミング・海外案件': ['海外旅行・仕事を誘われた', '高額報酬・日当を提示された', '友人・知人も誘うよう求められた', 'パスポート・貴重品を預けるよう言われた', '有名人なのに内緒の仕事に誘われた', '集合場所や詳細が直前に変わった'],
  'ゲーム・アイテム': ['ゲーム・アイテム交換の話をしてきた', 'LINE・Discord・Telegramなど外部アプリに誘導してきた'],
  'なりすまし': ['有名人・公式を名乗っている', '日本語が不自然', 'アカウント凍結・通報の話をしてきた'],
  'その他': ['リンクを送ってきた', 'パスポート・身分証の写真を要求してきた', '主催・会社情報が曖昧'],
};

const CATEGORY_KEY = 'gck_categories';
const FILTER_STRENGTH_KEY = 'gck_filter_strength';

function getCategories() {
  try {
    const saved = localStorage.getItem(CATEGORY_KEY);
    if (saved) return JSON.parse(saved);
  } catch { }
  const def = {};
  Object.keys(SCAM_CATEGORIES).forEach(k => def[k] = true);
  return def;
}

function setCategories(cats) {
  localStorage.setItem(CATEGORY_KEY, JSON.stringify(cats));
}

function getFilterStrength() {
  return localStorage.getItem(FILTER_STRENGTH_KEY) || 'normal';
}

function setFilterStrength(val) {
  localStorage.setItem(FILTER_STRENGTH_KEY, val);
}

function getVisibleCheckItems(allItems) {
  const cats = getCategories();
  const visibleItems = new Set();
  Object.entries(SCAM_CATEGORIES).forEach(([cat, items]) => {
    if (cats[cat]) items.forEach(i => visibleItems.add(i));
  });
  return allItems.filter(item => {
    const inAnyCategory = Object.values(SCAM_CATEGORIES).some(items => items.includes(item));
    return !inAnyCategory || visibleItems.has(item);
  });
}

const SCAM_PREFIX_DEFAULT = "@{handle} のアカウントをDM詐欺総合チェック！DM怪しいチェッカーから。";
const SCAM_SUFFIX_DEFAULT = "安全第一！ヤバそうなら即ブロック＆通報にゃ！";
const TWEETS_QUERY_DEFAULT = "@{handle} の直近10ツイートとプロフィール文をまとめて分析して。内容・言語・トーン・詐欺パターンへの一致・プロフィール文のコピペ使い回しの可能性を教えて。";
const TWEETS_QUERY_KIDS_DEFAULT = `@{handle} の内容・言語・トーン・詐欺手口・プロフ使い回しを考慮し、小中学生への助言を3つだけで教えて。1.どんな人 2.あやしい点 3.なかよくしていい(理由)。専門用語・英語禁止。やさしく教えてにゃ。`;

const SCAM_PREFIX_KIDS_DEFAULT = `@{handle} について、小学校高学年〜中学生へのアドバイスを以下の3つだけで教えてにゃ。
1. この人はどんな人？（一言で）
2. あやしいポイントはある？（ないなら『なし！』）
3. なかよくしていい？（理由もやさしく）

専門用語・英語・横文字は使わずにわかりやすく教えてにゃ。`;
const SCAM_SUFFIX_KIDS_DEFAULT = "安全が一番！ちょっとでもこわいと思ったら、大人に言うようにやさしく教えてにゃ。";

function getTemplate(key, def) {
  return gckStorage.templates[key] !== undefined ? gckStorage.templates[key] : def;
}

function setTemplate(key, val) {
  gckStorage.templates[key] = val;
  saveStorage();
}

function replacePlaceholder(text, handle) {
  if (!text) return "";
  return text.replaceAll('{handle}', handle);
}

// ===== 小中学生モード =====
function getKidsMode() {
  return gckStorage.kidsMode;
}
function setKidsMode(val) {
  gckStorage.kidsMode = !!val;
  saveStorage();
}

// DM怪しいチェッカー v5 - DM内容入力ポップアップ対応

const CACHE_EXPIRE_MS = 60 * 60 * 1000;

function getCache() {
  return gckStorage.cache;
}
function setCache(handle) {
  const cache = getCache();
  cache[handle] = Date.now();
  saveStorage();
}
function isRecentlyChecked(handle) {
  const cache = getCache();
  const t = cache[handle];
  return t && (Date.now() - t) < CACHE_EXPIRE_MS;
}
function removeOldPanel() {
  const oldPanel = document.getElementById('grok-checker-panel');
  if (oldPanel) oldPanel.remove();
  const oldFab = document.getElementById('gck-fab');
  if (oldFab) oldFab.remove();
}
function removeModal() {
  const old = document.getElementById('gck-modal-overlay');
  if (old) old.remove();
}

function getHandleFromPage() {
  // ページ内の@ハンドルリンクから取得
  const links = document.querySelectorAll('a[href*="x.com/"]');
  for (const link of links) {
    const match = link.href.match(/x\.com\/([A-Za-z0-9_]+)$/);
    if (match && !['messages', 'home', 'explore', 'notifications', 'settings', 'i', 'chat'].includes(match[1])) {
      return sanitizeHandle(match[1]);
    }
  }
  // @で始まるテキストから取得
  const atSpan = document.querySelector('a[href^="/"] span');
  if (atSpan && atSpan.textContent.startsWith('@')) {
    return sanitizeHandle(atSpan.textContent.replace('@', '').trim());
  }
  // プロフィール表示エリアの@ハンドル
  const profileHandle = [...document.querySelectorAll('div,span')].find(
    el => el.textContent.match(/^@[A-Za-z0-9_]+$/) && el.children.length === 0
  );
  if (profileHandle) return sanitizeHandle(profileHandle.textContent.replace('@', '').trim());

  const nameSpan = document.querySelector('[data-testid="DM_Conversation_Header_compact"] span[dir="ltr"]');
  if (nameSpan) return sanitizeHandle(nameSpan.innerText);
  return null;
}

// 子供向けデフォルトプロンプト（上部で定義済みのため削除）

function buildGrokQuery(handle, dmText, relationship, extraInfo, trustLevel, isMinor = false, isKidsMode = false) {
  const dmSection = dmText
    ? `【受け取ったDM内容】\n${dmText}\n`
    : (isKidsMode ? '【DMの内容】まだ入れてないにゃ\n' : '【DM内容】未入力\n');

  const relSection = relationship
    ? (isKidsMode ? `・どこで知り合った: ${relationship}\n` : `・相手との関係: ${relationship}\n`)
    : '';

  const extraSection = extraInfo
    ? (isKidsMode ? `・気になること: ${extraInfo}\n` : `・気になる点: ${extraInfo}\n`)
    : '';

  const trustNote = trustLevel === 'trust'
    ? '\n※送信者がこのアカウントを「信頼できる知人」として登録しています。誤検知の可能性も考慮して判定してにゃ。\n'
    : trustLevel === 'caution'
      ? '\n※送信者がこのアカウントを「要注意」として登録しています。\n'
      : trustLevel === 'danger'
        ? '\n※送信者がこのアカウントを「危険・詐欺確定」として登録しています。\n'
        : '';

  if (isKidsMode) {
    // ===== 小中学生モード（スイッチON時）のひらがなクエリ =====
    const prefixTpl = getTemplate(TEMPLATE_KEYS.SCAM_PREFIX_KIDS, SCAM_PREFIX_KIDS_DEFAULT);
    const suffixTpl = getTemplate(TEMPLATE_KEYS.SCAM_SUFFIX_KIDS, SCAM_SUFFIX_KIDS_DEFAULT);
    const prefix = replacePlaceholder(prefixTpl, handle);
    const suffix = replacePlaceholder(suffixTpl, handle);

    return `${prefix}${trustNote}

【アカウントのきほんチェック】
・どこの国・地域の人っぽいか（言葉・絵文字・時間帯から）
・アカウントをいつ作ったか・急にたくさんポストしてないか
・フォロワーやフォローの様子
・さいきんのポスト内容（プレゼント企画ばかりじゃないか）

${dmSection}
【その他の情報】
${relSection}${extraSection}
【子どもがだまされやすい手口チェック】
- 顔写真・自撮り・学校名・住所などを聞いてくる
- 「お互いに写真を送りあおう」と言ってくる（自画撮り被害のきっかけ）
- プレゼントに当選したと言って名前や住所を聞いてくる
- ゲームのアイテムや課金で近づいてくる
- LINE・Discord など別のアプリに移ろうと誘ってくる
- 優しくして仲良くなってから、だんだんへんなことを頼んでくる（グルーミング）
- 「秘密にして」と言ってくる
- 会いたいと言ってくる
- お金やプリペイドカードをほしがってくる
- 同じ年ごろの子のふりをしている

・怪しさを0〜10で評価して、理由もやさしく教えてください
・怪しいポイントを★で3つ以内にまとめてください
・点数にあわせて、どうすればいいかをやさしくアドバイスしてください
（目安： 0〜3点＝気をつけてお話ししてね、4〜6点＝おうちの人に画面を見せて相談してね、7〜10点＝あぶないから今すぐブロックしてね！）
${suffix}`;
  }

  // ===== 通常モード（大人UI / または学生チェックON時）の漢字クエリ =====
  const prefixTpl = getTemplate(TEMPLATE_KEYS.SCAM_PREFIX, SCAM_PREFIX_DEFAULT);
  const suffixTpl = getTemplate(TEMPLATE_KEYS.SCAM_SUFFIX, SCAM_SUFFIX_DEFAULT);
  const prefix = replacePlaceholder(prefixTpl, handle);
  const suffix = replacePlaceholder(suffixTpl, handle);

  const youthNote = isMinor
    ? '\n※重要：相手または自分が若年層（学生など）、あるいは相手が「立場が上（業界人など）」の疑いがあるケースにゃ。単なる詐欺だけでなく、「立場の差を利用した心理的支配（グルーミング）」や「夢・進路をエサにした不適切な誘い（オーディション名目、内緒の仕事、パパ活誘導、情報商材など）」の兆候がないか、マンガ業界などの過去の事例も踏まえて極めて厳しく判定してにゃ。\n'
    : '';

  const strength = getFilterStrength();
  const strengthNote = strength === 'weak'
    ? '\n※判定は参考程度で、誤検知の可能性も考慮してにゃ。\n'
    : strength === 'strong'
      ? '\n※少しでも怪しい点があれば厳しめに指摘してにゃ。見落とし厳禁にゃ。\n'
      : '';

  return `${prefix}${trustNote}${youthNote}${strengthNote}

【アカウント基本チェック】
・推定国・地域（言語・絵文字・タイムゾーンから）
・アカウント作成時期・急な活発化
・フォロワー/相互傾向（ボット・アジア系多め？）
・直近20ツイート傾向

${dmSection}
【追加情報】
${relSection}${extraSection}
【詐欺パターン一致チェック（2026年最新）】
- 偽懸賞: 「当選DMで情報/送料要求」「公式Web不在」「偽特産品」「相互リポスト群」
- 偽凍結: 「誤って報告」「凍結解除」「Discord/Telegram誘導」
- ロマンス: 「お金が必要」「投資成功者紹介」「飛行機代」
- 投資: 「絶対儲かる」「元本保証」「追加送金」「著名人装い」
- ニセ警察: 「未払い」「差し押さえ」「潔白証明」「資産提出」
- 闇バイト: 「無料海外旅行」「カンボジア/アジア仕事」「商品いいね稼ぎ」
- NFT/ウォレット: 「秘密鍵」「Gas Fee」「偽サイト」
- その他: 「臨時資金」「投票協力」「アンバサダー」「会員カード」

・総合怪しさ評価（0〜10）＋理由
・類似被害ニュース（2025-2026日本SNS詐欺）との一致度
・即ブロック推奨度（高/中/低）
※プレゼント企画や企業を名乗る場合、実態をWeb検索で裏付け確認してにゃ。
${suffix}`;
}

function buildTweetsQuery(handle, isKidsMode = false) {
  const key = isKidsMode ? TEMPLATE_KEYS.TWEETS_KIDS : TEMPLATE_KEYS.TWEETS;
  const def = isKidsMode ? TWEETS_QUERY_KIDS_DEFAULT : TWEETS_QUERY_DEFAULT;
  const tpl = getTemplate(key, def);
  return replacePlaceholder(tpl, handle);
}

function buildManualTweetsQuery(handle, tweetsText, isKidsMode = false) {
  if (isKidsMode) {
    return `@{handle} の内容・言語・トーン・詐欺手口・プロフ使い回しを考慮し、小中学生への助言を3つだけで教えてにゃ。
【はりつけられたポストの内容】
${tweetsText}

1.どんな人 2.あやしい点 3.なかよくしていい(理由)。専門用語・英語禁止。やさしく教えてにゃ。`;
  }
  return `@${handle} のツイート内容から詐欺チェックしてにゃ。
【貼り付けられたツイート内容】
${tweetsText}

内容・言語・トーン・詐欺パターンへの一致を教えて。`;
}

// モーダルポップアップ
function showModal(handle, onSubmit, isKidsMode = false) {
  removeModal();

  const overlay = document.createElement('div');
  overlay.id = 'gck-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'gck-modal';

  // タイトル
  // ×ボタン
  const closeXBtn = document.createElement('button');
  closeXBtn.className = 'gck-modal-close-x';
  closeXBtn.textContent = '✕';
  closeXBtn.addEventListener('click', () => {
    overlay.classList.remove('visible');
    setTimeout(removeModal, 300);
  });

  const title = document.createElement('div');
  title.className = 'gck-modal-title';
  title.textContent = isKidsMode ? '🐱 あやしいか見てみるにゃ！' : '🐱 詐欺チェック強化にゃ（任意）';

  const subtitle = document.createElement('div');
  subtitle.className = 'gck-modal-subtitle';
  subtitle.textContent = isKidsMode
    ? '「あぶない人じゃないかな？」と 思ったら、このツールを 使ってみてにゃ。AI（エーアイ）が いっしょに たしかめてくれるにゃ！'
    : 'DM内容を入れると判定精度が爆上がりするにゃ！空でもOK。';

  // ラベル＋テキストエリア
  function makeLabel(text) {
    const el = document.createElement('label');
    el.className = 'gck-modal-label';
    el.textContent = text;
    return el;
  }

  const dmLabel = makeLabel(isKidsMode ? '📩 届いたメッセージ（書かなくてもOKにゃ）' : '📩 受け取ったDMの内容（任意）');
  const dmInput = document.createElement('textarea');
  dmInput.className = 'gck-modal-textarea';
  dmInput.placeholder = isKidsMode
    ? 'メッセージをコピーして、ここにはりつけられるよ。もっとよくしらべてくれるよ。'
    : 'ここにDMの文章を貼り付けてにゃ…\n例: 「誤って報告してしまいました。解除のためにこちらへ…」';
  dmInput.rows = 4;

  // 🎓 学生・未成年向け（念入り調査）機能 (通常モード時)
  let youthCheckbox = null;
  let youthDesc = null;
  const minorRow = document.createElement('div');
  minorRow.className = 'gck-minor-row';
  if (!isKidsMode) {
    youthCheckbox = document.createElement('input');
    youthCheckbox.type = 'checkbox';
    youthCheckbox.className = 'gck-checkbox';
    youthCheckbox.id = 'gck-minor-check';
    const minorLbl = document.createElement('label');
    minorLbl.htmlFor = 'gck-minor-check';
    minorLbl.className = 'gck-checkbox-label';
    minorLbl.appendChild(youthCheckbox);
    minorLbl.appendChild(document.createTextNode(' 🎓 学生・未成年向け（念入り調査）'));

    youthDesc = document.createElement('div');
    youthDesc.className = 'gck-youth-desc';
    youthDesc.textContent = '※進路や夢の相談、仕事の誘いなど、相手が「立場が上（業界人など）」の場合はONにしてにゃ。若者を狙った不適切な誘いや搾取を見抜く力が上がるにゃ！';
    youthDesc.style.display = 'none';

    minorRow.appendChild(minorLbl);
    // minorRow.appendChild(youthDesc); // 直接入れずスクロール内に追加
  }

  const minorWarning = document.createElement('div');
  minorWarning.className = 'gck-minor-warning';
  if (!isKidsMode && youthCheckbox) {
    youthCheckbox.addEventListener('change', () => {
      const isChecked = youthCheckbox.checked;
      if (isChecked) {
        minorWarning.classList.add('visible');
        minorWarning.innerHTML = `
          <div class="gck-minor-title">🔔 未成年の方へ・大切なことにゃ</div>
          <div class="gck-minor-line">📵 住所・学校名・学生証・自撮りは絶対に送らないにゃ</div>
          <div class="gck-minor-line">🚫 LINE・Discord等への外部誘導は即ブロックにゃ</div>
          <div class="gck-minor-line">💬 わからないことは必ず親かAIに聞いてからにゃ</div>
          <div class="gck-minor-line">🎮 ゲームアイテム交換で個人情報は絶対ダメにゃ</div>
          <div class="gck-minor-line">👥 ネットの相手は会ったことがない他人にゃ。どんなに優しくても、すぐに信じないにゃ</div>
        `;
        youthDesc.style.display = 'block';
        if (typeof youthElements !== 'undefined') {
          youthElements.forEach(el => el.style.display = 'flex');
        }
      } else {
        minorWarning.classList.remove('visible');
        minorWarning.innerHTML = '';
        youthDesc.style.display = 'none';
        if (typeof youthElements !== 'undefined') {
          youthElements.forEach(el => el.style.display = 'none');
        }
      }
    });
  } else if (isKidsMode) {
    minorWarning.classList.add('visible');
    minorWarning.innerHTML = `
      <div class="gck-minor-title">🔔 小中学生のきみへ・大事なことにゃ</div>
      <div class="gck-minor-line">📵 住所・学校名・自撮り写真は絶対に送らないにゃ</div>
      <div class="gck-minor-line">🚫 LINE・Discordなど別のアプリへの誘導は即ブロックにゃ</div>
      <div class="gck-minor-line">💬 わからないことは必ずおうちの人かAIに聞いてからにゃ</div>
      <div class="gck-minor-line">🎮 ゲームのアイテムと引き換えに個人情報は絶対ダメにゃ</div>
      <div class="gck-minor-line">👥 ネットで仲良くなっても、会ったことがない相手は他人にゃ。優しくされても信じすぎないにゃ</div>
    `;
  }

  // ※ isKidsMode の初期適用は checkboxGroup 等の定義後に行う

  // 通常版チェックボックス項目
  const normalCheckItems = [
    '投資・副業の話をしてきた',
    'リンクを送ってきた',
    'ビデオ通話を拒否された',
    '急にお金の話になった',
    '海外旅行・仕事を誘われた',
    'アカウント凍結・通報の話をしてきた',
    '有名人・公式を名乗っている',
    '日本語が不自然',
    'ゲーム・アイテム交換の話をしてきた',
    'LINE・Discord・Telegramなど外部アプリに誘導してきた',
    '鍵アカウントに誘導してきた',
    '前払い・手数料・保証金を要求してきた',
    'パスポート・身分証の写真を要求してきた',
    '集合場所や詳細が直前に変わった',
    '主催・会社情報が曖昧',
    '高額報酬・日当を提示された',
    '友人・知人も誘うよう求められた',
    'パスポート・貴重品を預けるよう言われた',
    '有名人なのに内緒の仕事に誘われた',
    '秘密にするよう求められた',
  ];

  // 小中学生向けチェックボックス項目
  const kidsCheckItems = [
    'ゲームのアイテムやポイントをくれるといっている',
    'ゲームを教えてあげるといってきた',
    'リンク（URL）を送ってきた',
    '顔写真や自撮りをほしがっている',
    '「お互いに写真を送りあおう」といってきた',
    'プレゼントのお返しに何かしてほしいといっている',
    '学校名・学年・住所を聞いてきた',
    '制服や学生証の写真をほしがっている',
    '会いたいといってきた',
    'ボイスチャット・ビデオ通話にさそってきた',
    'LINE・Discordなど別のアプリに移ろうといっている',
    '秘密にしてほしいといっている',
    'すごくやさしくて悩みを聞いてくれる（でもなんか変な感じがする）',
    'お金やプリペイドカードをほしがっている',
    '有名人・公式アカウントのふりをしている',
    '鍵アカウント（非公開）にさそってきた',
    '相手はおとなっぽい',
    '日本語がなんか変',
  ];

  // 若年層向け追加チェック項目
  const youthExtraItems = [
    '将来の夢（漫画・芸能など）や仕事の相談内容',
    '「二人だけの秘密」や口止めを促されている',
    '相手が「有名人」「先生」「業界人」などの立場',
    '自撮りや身分証、連絡先の交換を求められた',
    'オーディション名目・内緒の仕事の誘い',
    '「特別扱い」を強調してきた'
  ];

  // チェックボックスを描画する関数
  let youthElements = [];
  function renderCheckItems(group, items, isYouthExtra = false) {
    items.forEach(item => {
      const lbl = document.createElement('label');
      lbl.className = 'gck-checkbox-label';
      if (isYouthExtra) {
        lbl.style.color = '#ffcc77';
        lbl.style.display = 'none'; // 初期非表示
        youthElements.push(lbl);
      }
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = item;
      cb.className = 'gck-checkbox';
      if (isYouthExtra) {
        cb.style.accentColor = '#ffaa33';
        cb.classList.add('gck-youth-cb'); // 区別用クラス
      }
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' ' + item));
      group.appendChild(lbl);
    });
  }

  const relLabel = makeLabel(isKidsMode ? '📍 どこで知り合ったにゃ？（なくてもOKにゃ）' : '📍 どこで知り合った？（任意）');

  // 警戒度マップ
  const meetingOptionsNormal = [
    { val: '', label: '選択しない', level: null },
    { val: '突然DMが来た', label: '突然DMが来た', level: 'high', icon: '🚨', text: '警戒度：高め。見知らぬ人からの突然のDMは詐欺の入口にゃ！' },
    { val: 'いいね・リプライから', label: 'いいね・リプライから', level: 'mid', icon: '⚠️', text: '警戒度：要確認。自然な絡みに見せて近づくのが詐欺の典型にゃ。' },
    { val: 'スペース・コミュニティから', label: 'スペース・コミュニティから', level: 'mid', icon: '🟡', text: '警戒度：中程度。共通の場にいた感が信頼感を演出するにゃ。' },
    { val: '共通フォロワー経由', label: '共通フォロワー経由', level: 'low', icon: '🟢', text: '警戒度：比較的低め。ただし共通フォロワーも騙されてる可能性があるにゃ。' },
    { val: '昔からのフォロワー', label: '昔からのフォロワー', level: 'safe', icon: '✅', text: '警戒度：低め。ただしアカウント乗っ取りには注意にゃ！' },
  ];
  const meetingOptionsKids = [
    { val: '', label: 'えらばない', level: null },
    { val: '突然DMが来た', label: 'とつぜんDMがきた', level: 'high', icon: '🚨', text: 'あぶない！知らない人からのとつぜんのDMは、だまそうとしてることが多いにゃ！' },
    { val: 'いいね・リプライから', label: 'いいねやへんしんからきた', level: 'mid', icon: '⚠️', text: 'ちょっとあやしいにゃ。なかよくなるふりをして近づくのは、よくあるだましの手口にゃ。' },
    { val: 'スペース・コミュニティから', label: 'スペースやコミュニティからきた', level: 'mid', icon: '🟡', text: 'すこし注意にゃ。同じ場所にいたからといって、安心しすぎないにゃ。' },
    { val: '共通フォロワー経由', label: 'おなじフォロワーがいる', level: 'low', icon: '🟢', text: 'わりと安全にゃ。でも、共通のフォロワーも同じようにだまされてるかもしれないにゃ。' },
    { val: '昔からのフォロワー', label: 'むかしからフォローしていた', level: 'safe', icon: '✅', text: '安全な方にゃ。でも、アカウントが悪い人に使われてることもあるから気をつけてにゃ！' },
  ];
  const meetingOptions = isKidsMode ? meetingOptionsKids : meetingOptionsNormal;

  const relSelect = document.createElement('select');
  relSelect.className = 'gck-modal-select';
  meetingOptions.forEach(({ val, label }) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    relSelect.appendChild(opt);
  });

  // 警戒度ヒント表示エリア
  const relHint = document.createElement('div');
  relHint.className = 'gck-rel-hint';

  relSelect.addEventListener('change', () => {
    const selected = meetingOptions.find(o => o.val === relSelect.value);
    if (!selected || !selected.level) {
      relHint.className = 'gck-rel-hint';
      relHint.textContent = '';
      return;
    }
    relHint.className = `gck-rel-hint gck-rel-hint--${selected.level} gck-rel-hint--visible`;
    relHint.textContent = `${selected.icon} ${selected.text}`;
  });

  let checkLabel = makeLabel(isKidsMode ? '🚩 あてはまるものにチェックしてにゃ' : '🚩 気になる点（チェックボックス）');
  const checkboxGroup = document.createElement('div');
  checkboxGroup.className = 'gck-checkbox-group';
  if (isKidsMode) {
    renderCheckItems(checkboxGroup, kidsCheckItems);
  } else {
    renderCheckItems(checkboxGroup, getVisibleCheckItems(normalCheckItems));
    renderCheckItems(checkboxGroup, youthExtraItems, true);
  }

  const extraLabel = makeLabel(isKidsMode ? '📝 ほかに気になることがあれば（なくてもいいにゃ）' : '📝 その他・気になる点（任意）)');
  const extraInput = document.createElement('input');
  extraInput.className = 'gck-modal-input';
  extraInput.type = 'text';
  extraInput.placeholder = isKidsMode ? '例: ゲームで知り合った / プロフィール写真がかわいすぎる気がする' : '例: 突然フォローしてきた / プロフィール写真が外国人モデル風';

  // トグルでONなら小中学生モードを初期適用
  if (isKidsMode) {
    // minorRow is not defined in this scope, assuming it was removed or handled elsewhere
    // minorRow.style.display = 'none';
    minorWarning.classList.add('visible'); // Ensure minorWarning is visible if isKidsMode is true
    minorWarning.innerHTML = `
      <div class="gck-minor-title">🚨 小中学生のみんなへ・大事な約束にゃ</div>
      <div class="gck-minor-line">🏠 住所（どこに住んでるか）、学校、自分の写真は絶対送っちゃダメにゃ！</div>
      <div class="gck-minor-line">📵 LINEやDiscordとか、別のアプリにさそわれたらすぐに逃げるにゃ！</div>
      <div class="gck-minor-line">👪 わからないときは、必ずおうちの人に相談するにゃ！</div>
      <div class="gck-minor-line">🎮 ゲームのアイテムをくれるといわれても、自分のことを教えちゃダメにゃ！</div>
      <div class="gck-minor-line">🤝 ネットで仲良くなっても、会ったことがない人は「知らない人」にゃ。信じすぎないで！</div>
    `;
    // The renderCheckItems and label/placeholder updates are already handled by the initial `isKidsMode` check
    // and the `checkLabel` and `extraInput.placeholder` definitions above.
  }

  // 見守りのヒント
  const monitoringTipsLabel = makeLabel('👀 見守りのヒント（任意）');
  const monitoringTipsInput = document.createElement('textarea');
  monitoringTipsInput.className = 'gck-modal-textarea';
  monitoringTipsInput.placeholder = '例: 子供が最近、見知らぬ人とゲームの話をしている / 普段と違う様子でスマホを見ている';
  monitoringTipsInput.rows = 2;
  monitoringTipsInput.style.display = isKidsMode ? 'block' : 'none'; // KidsModeでのみ表示

  // プライバシー注意書き
  const privacy = document.createElement('div');
  privacy.className = 'gck-modal-privacy';
  privacy.textContent = '🔒 入力内容はGrokにのみ送信。外部サーバーには送られないにゃ。';

  // ボタン行
  const btnRow = document.createElement('div');
  btnRow.className = 'gck-modal-btnrow';

  const skipBtn = document.createElement('button');
  skipBtn.className = 'gck-modal-btn-skip';
  skipBtn.textContent = 'スキップして調べる';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'gck-modal-btn-submit';
  submitBtn.textContent = isKidsMode ? '🔍 チェックするにゃ！' : '🔍 入力内容で調べるにゃ！';

  btnRow.append(skipBtn, submitBtn);

  // タイトル部（固定）
  const modalTop = document.createElement('div');
  modalTop.className = 'gck-modal-top';
  modalTop.append(closeXBtn, title, subtitle);

  // スクロールエリア
  const modalScroll = document.createElement('div');
  modalScroll.className = 'gck-modal-scroll';
  if (isKidsMode) {
    modalScroll.append(minorWarning, dmLabel, dmInput, relLabel, relSelect, relHint, checkLabel, checkboxGroup, extraLabel, extraInput, privacy);
  } else {
    modalScroll.append(minorRow, youthDesc, minorWarning, dmLabel, dmInput, relLabel, relSelect, relHint, checkLabel, checkboxGroup, extraLabel, extraInput, privacy);
  }

  // ボタン行（固定）
  const modalBottom = document.createElement('div');
  modalBottom.className = 'gck-modal-bottom';
  modalBottom.appendChild(btnRow);

  modal.append(modalTop, modalScroll, modalBottom);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // アニメーション
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // イベント
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(removeModal, 300);
  };

  skipBtn.addEventListener('click', () => {
    close();
    onSubmit('', '', '', '', false, isKidsMode);
  });

  submitBtn.addEventListener('click', () => {
    const dm = dmInput.value.trim().slice(0, 800);
    const rel = relSelect.value;
    const checked = [...checkboxGroup.querySelectorAll('input:checked')].map(cb => cb.value);
    const extraText = extraInput.value.trim().slice(0, 200);
    const extra = [...checked, ...(extraText ? [extraText] : [])].join(' / ').slice(0, 400);
    const isMinorInput = youthCheckbox ? youthCheckbox.checked : false;
    close();
    onSubmit(dm, rel, extra, getTrustLevel(handle), isMinorInput, isKidsMode);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); }
  });
}

// 設定用モーダル (showModalの実装を流用)
function showSettingsModal() {
  removeModal();

  const overlay = document.createElement('div');
  overlay.id = 'gck-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'gck-modal';

  const closeXBtn = document.createElement('button');
  closeXBtn.className = 'gck-modal-close-x';
  closeXBtn.textContent = '✕';
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(removeModal, 300);
  };
  closeXBtn.addEventListener('click', close);

  const title = document.createElement('div');
  title.className = 'gck-modal-title';
  title.textContent = '⚙️ プロンプト基本設定';

  const subtitle = document.createElement('div');
  subtitle.className = 'gck-modal-subtitle';
  subtitle.textContent = 'AI（Grok）への依頼文をカスタマイズできるにゃ。100文字前後にまとめるとエラーが出にくいにゃ。{handle} は自動でユーザー名に置き換わるにゃ。';

  const modalTop = document.createElement('div');
  modalTop.className = 'gck-modal-top';
  modalTop.append(closeXBtn, title, subtitle);

  const modalScroll = document.createElement('div');
  modalScroll.className = 'gck-modal-scroll';

  // --- タブ切り替えUI ---
  const tabGroup = document.createElement('div');
  tabGroup.style.display = 'flex';
  tabGroup.style.gap = '8px';
  tabGroup.style.marginBottom = '15px';

  const normalTab = document.createElement('button');
  normalTab.className = 'gck-modal-btn-submit';
  normalTab.style.flex = '1';
  normalTab.style.padding = '8px';
  normalTab.style.background = '#007bff';
  normalTab.textContent = '📝 通常用';

  const kidsTab = document.createElement('button');
  kidsTab.className = 'gck-modal-btn-submit';
  kidsTab.style.flex = '1';
  kidsTab.style.padding = '8px';
  kidsTab.style.background = '#4a5a6a';
  kidsTab.textContent = '🧒 小中学生用';

  tabGroup.append(normalTab, kidsTab);
  modalScroll.appendChild(tabGroup);
  // ---------------------

  const formsContainer = document.createElement('div');
  modalScroll.appendChild(formsContainer);

  const createSettingRow = (label, key, defValue) => {
    const group = document.createElement('div');
    group.style.marginBottom = '15px';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '5px';

    const lbl = document.createElement('label');
    lbl.className = 'gck-modal-label';
    lbl.textContent = label;

    const resetBtn = document.createElement('button');
    resetBtn.className = 'gck-btn-reset';
    resetBtn.textContent = 'デフォルトに戻す';

    const confirmUI = document.createElement('div');
    confirmUI.style.display = 'none';
    confirmUI.style.fontSize = '12px';
    confirmUI.style.marginTop = '4px';
    confirmUI.style.color = '#ff8e53';
    confirmUI.innerHTML = `⚠️ デフォルトに戻しますか？ 
      <button class="gck-btn-reset" style="margin-left:8px; border-color:#ff6b6b; color:#ff6b6b;">はい</button>
      <button class="gck-btn-reset" style="margin-left:4px;">キャンセル</button>`;

    const [yesBtn, noBtn] = confirmUI.querySelectorAll('button');

    resetBtn.addEventListener('click', () => {
      confirmUI.style.display = 'block';
      resetBtn.style.display = 'none';
    });

    yesBtn.addEventListener('click', () => {
      textarea.value = defValue;
      setTemplate(key, defValue);
      confirmUI.style.display = 'none';
      resetBtn.style.display = 'inline-block';
    });

    noBtn.addEventListener('click', () => {
      confirmUI.style.display = 'none';
      resetBtn.style.display = 'inline-block';
    });

    header.append(lbl, resetBtn);

    const textarea = document.createElement('textarea');
    textarea.className = 'gck-modal-textarea';
    textarea.value = getTemplate(key, defValue);
    textarea.style.height = '120px';
    textarea.setAttribute('autocomplete', 'off'); // オートフィル非表示
    textarea.addEventListener('input', () => {
      setTemplate(key, textarea.value);
    });

    group.append(header, textarea, confirmUI);
    return group;
  };

  const createCategorySection = () => {
    const sec = document.createElement('div');
    sec.className = 'gck-setting-section';
    const title = document.createElement('div');
    title.className = 'gck-setting-label';
    title.textContent = '🚩 表示するチェック項目';
    sec.appendChild(title);
    const cats = getCategories();
    Object.keys(SCAM_CATEGORIES).forEach(catName => {
      const row = document.createElement('label');
      row.className = 'gck-checkbox-label';
      row.style.marginBottom = '4px';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'gck-checkbox';
      cb.checked = cats[catName] !== false;
      cb.addEventListener('change', () => {
        const current = getCategories();
        current[catName] = cb.checked;
        setCategories(current);
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(' ' + catName));
      sec.appendChild(row);
    });
    return sec;
  };

  const createStrengthSection = () => {
    const sec = document.createElement('div');
    sec.className = 'gck-setting-section';
    const title = document.createElement('div');
    title.className = 'gck-setting-label';
    title.textContent = '⚖️ 判定の強さ';
    sec.appendChild(title);
    const currentStrength = getFilterStrength();
    [['weak', '弱（誤検知を考慮）'], ['normal', '普通'], ['strong', '強（見落とし厳禁）']].forEach(([val, label]) => {
      const row = document.createElement('label');
      row.className = 'gck-checkbox-label';
      row.style.marginBottom = '4px';
      const rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'gck-strength';
      rb.value = val;
      rb.className = 'gck-checkbox';
      rb.checked = currentStrength === val;
      rb.addEventListener('change', () => setFilterStrength(val));
      row.appendChild(rb);
      row.appendChild(document.createTextNode(' ' + label));
      sec.appendChild(row);
    });
    return sec;
  };

  const renderNormalForms = () => {
    formsContainer.innerHTML = '';
    formsContainer.append(
      createCategorySection(),
      createStrengthSection(),
      createSettingRow('🔹 詐欺チェックの冒頭', TEMPLATE_KEYS.SCAM_PREFIX, SCAM_PREFIX_DEFAULT),
      createSettingRow('🔹 詐欺チェックの末尾', TEMPLATE_KEYS.SCAM_SUFFIX, SCAM_SUFFIX_DEFAULT),
      createSettingRow('🔹 直近ツイート分析プロンプト', TEMPLATE_KEYS.TWEETS, TWEETS_QUERY_DEFAULT)
    );
  };

  const renderKidsForms = () => {
    formsContainer.innerHTML = '';
    formsContainer.append(
      createSettingRow('👦 詐欺チェックの冒頭（小中学生用）', TEMPLATE_KEYS.SCAM_PREFIX_KIDS, SCAM_PREFIX_KIDS_DEFAULT),
      createSettingRow('👦 詐欺チェックの末尾（小中学生用）', TEMPLATE_KEYS.SCAM_SUFFIX_KIDS, SCAM_SUFFIX_KIDS_DEFAULT),
      createSettingRow('👦 ポスト分析プロンプト（小中学生用）', TEMPLATE_KEYS.TWEETS_KIDS, TWEETS_QUERY_KIDS_DEFAULT)
    );
  };

  normalTab.addEventListener('click', () => {
    normalTab.style.background = '#007bff';
    kidsTab.style.background = '#4a5a6a';
    renderNormalForms();
  });

  kidsTab.addEventListener('click', () => {
    kidsTab.style.background = '#ff8e53';
    normalTab.style.background = '#4a5a6a';
    renderKidsForms();
  });

  renderNormalForms(); // 初期状態は通常用

  const modalBottom = document.createElement('div');
  modalBottom.className = 'gck-modal-bottom';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gck-modal-btn-submit';
  closeBtn.textContent = '設定を閉じる';
  closeBtn.addEventListener('click', close);
  modalBottom.appendChild(closeBtn);

  modal.append(modalTop, modalScroll, modalBottom);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}


// 🐱 裏取り中アニメーション（Grokタブに戻ったら消える）
function showWaitingAnimation(panel, isKidsMode = false) {
  const existing = panel.querySelector('.gck-waiting');
  if (existing) existing.remove();

  const messages = isKidsMode ? [
    '🐱 Grokが調べてるにゃ…まってにゃ！',
    '🔍 相手のことを見てるにゃ…',
    '⚠️ あやしいかどうか確認中にゃ…',
    '📊 危険度をはかってるにゃ…',
    '🛡️ きみを守るためにがんばってるにゃ！',
  ] : [
    '🐱 今、Grokが裏取り中だにゃ…',
    '🔍 ツイート履歴を掘ってるにゃ…',
    '🌐 接続元を調べてるにゃ…',
    '⚠️ 詐欺パターンと照合中にゃ…',
    '📊 怪しさスコア計算中にゃ…',
  ];

  const waiting = document.createElement('div');
  waiting.className = 'gck-waiting';

  const text = document.createElement('span');
  text.className = 'gck-waiting-text';
  text.textContent = messages[0];

  const dots = document.createElement('span');
  dots.className = 'gck-waiting-dots';
  dots.textContent = '';

  waiting.append(text, dots);
  panel.appendChild(waiting);

  // メッセージをランダムに切り替え
  let i = 0;
  const msgInterval = setInterval(() => {
    i = (i + 1) % messages.length;
    text.textContent = messages[i];
  }, 2000);

  // ドットアニメーション
  let d = 0;
  const dotInterval = setInterval(() => {
    d = (d + 1) % 4;
    dots.textContent = '.'.repeat(d);
  }, 400);

  // タブが戻ってきたら消える
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      clearInterval(msgInterval);
      clearInterval(dotInterval);
      waiting.classList.add('gck-waiting-fade');
      setTimeout(() => waiting.remove(), 600);
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  // 最大30秒で自動消滅
  setTimeout(() => {
    clearInterval(msgInterval);
    clearInterval(dotInterval);
    document.removeEventListener('visibilitychange', onVisible);
    waiting.classList.add('gck-waiting-fade');
    setTimeout(() => waiting.remove(), 600);
  }, 30000);
}

function showTrustListModal() {
  removeModal(); // 他のモーダルが開いていれば閉じる

  const overlay = document.createElement('div');
  overlay.id = 'gck-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'gck-modal';

  const closeXBtn = document.createElement('button');
  closeXBtn.className = 'gck-modal-close-x';
  closeXBtn.textContent = '✕';
  const close = () => {
    overlay.classList.remove('visible');
    setTimeout(removeModal, 300);
  };
  closeXBtn.addEventListener('click', close);

  const title = document.createElement('div');
  title.className = 'gck-modal-title';
  title.textContent = getKidsMode() ? '📋 登録した人リスト（このブラウザに保存）' : '📋 信頼度リスト (ローカル保存)';

  const modalTop = document.createElement('div');
  modalTop.className = 'gck-modal-top';
  modalTop.append(closeXBtn, title);

  const modalScroll = document.createElement('div');
  modalScroll.className = 'gck-modal-scroll';

  const wl = getWhitelist();
  const handles = Object.keys(wl);

  if (handles.length === 0) {
    const empty = document.createElement('div');
    empty.style.textAlign = 'center';
    empty.style.padding = '20px';
    empty.style.color = '#556677';
    empty.textContent = 'まだ誰も登録されてないにゃ🐾';
    modalScroll.appendChild(empty);
  } else {
    handles.forEach(handle => {
      const level = wl[handle];
      const row = document.createElement('div');
      row.className = 'gck-trust-list-row';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid #2a3a4a';

      const handleSpan = document.createElement('span');
      handleSpan.className = 'gck-trust-list-handle';
      handleSpan.style.flex = '1';
      handleSpan.textContent = `@${handle}`;

      const badge = document.createElement('span');
      badge.className = `gck-trust-list-badge gck-trust-list-${level}`;
      if (level === 'trust') badge.textContent = '✅ 信頼';
      else if (level === 'caution') badge.textContent = '⚠️ 要注意';
      else if (level === 'danger') badge.textContent = '🚨 危険';
      badge.style.marginRight = '8px';

      const delBtn = document.createElement('button');
      delBtn.className = 'gck-panel-close';
      delBtn.textContent = '✕';
      delBtn.title = '削除';
      delBtn.addEventListener('click', () => {
        setTrustLevel(handle, '');
        row.remove();
        if (modalScroll.querySelectorAll('.gck-trust-list-row').length === 0) {
          const empty = document.createElement('div');
          empty.style.textAlign = 'center';
          empty.style.padding = '20px';
          empty.style.color = '#556677';
          empty.textContent = 'まだ誰も登録されてないにゃ🐾';
          modalScroll.appendChild(empty);
        }

        const viewingHandleEl = document.querySelector('.gck-handle');
        const trustSelect = document.querySelector('.gck-trust-select');
        if (viewingHandleEl && viewingHandleEl.textContent === `@${handle}` && trustSelect) {
          trustSelect.value = '';
        }
      });

      row.append(handleSpan, badge, delBtn);
      modalScroll.appendChild(row);
    });
  }

  const modalBottom = document.createElement('div');
  modalBottom.className = 'gck-modal-bottom';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gck-modal-btn-submit';
  closeBtn.textContent = '閉じる';
  closeBtn.addEventListener('click', close);
  modalBottom.appendChild(closeBtn);

  modal.append(modalTop, modalScroll, modalBottom);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}

function createPanel(handle) {
  // 1. 現在のパネルとFABの状態を確認 (書き換え時に状態を維持するため)
  const oldPanel = document.getElementById('grok-checker-panel');
  const wasOpen = oldPanel && oldPanel.classList.contains('open');

  removeOldPanel();

  const alreadyChecked = isRecentlyChecked(handle);

  // === フローティングボタン ===
  const fab = document.createElement('button');
  fab.id = 'gck-fab';
  fab.textContent = '🐱';
  fab.title = 'DMチェッカー簡易版';
  document.body.appendChild(fab);

  // === サイドパネル ===
  const panel = document.createElement('div');
  panel.id = 'grok-checker-panel';

  // ヘッダー
  const panelHeader = document.createElement('div');
  panelHeader.className = 'gck-panel-header';
  const panelTitle = document.createElement('span');
  panelTitle.textContent = '🐱 DMチェッカー簡易版';
  panelTitle.className = 'gck-panel-title';

  const headerBtns = document.createElement('div');
  headerBtns.style.display = 'flex';
  headerBtns.style.gap = '8px';
  headerBtns.style.alignItems = 'center';

  const panelClose = document.createElement('button');
  panelClose.className = 'gck-panel-close';
  panelClose.textContent = '✕';
  panelClose.onclick = () => {
    panel.classList.remove('open');
    fab.classList.remove('active');
  };

  headerBtns.append(panelClose);
  panelHeader.append(panelTitle, headerBtns);
  panel.appendChild(panelHeader);

  // ===== モードトグルバー =====
  let isKidsMode = getKidsMode();

  const applyMode = (kids) => {
    isKidsMode = kids;
    setKidsMode(kids);
    if (kids) {
      panel.classList.add('gck-kids-mode');
      panelTitle.textContent = '👦 小中学生モード';
      fab.textContent = '👦';
      fab.classList.add('kids');
      toggleTrack.classList.add('on');
      // テキスト切り替え
      trustLabel.textContent = 'この人は？：';
      mainBtn.textContent = alreadyChecked ? '✅ 調べたよ（もう一回）' : '🔍 あやしいか調べるにゃ！';
      locationBtn.textContent = '📍 どこの人か見てみる';
      tweetsBtn.textContent = '📜 さいきんのポストを見てみる ▼';
      listBtn.textContent = '📋 登録した人のリスト';
      publicTitle.textContent = '📢 ふつうのアカウントの場合：';
      publicBtn.textContent = '🔍 自動で しらべるにゃ！';
      lockedTitle.textContent = '🔑 鍵（かぎ）のアカウントの場合：';
      lockedTextarea.placeholder = '相手のポストを 5〜10こくらい コピーして ここにはってにゃ...';
      lockedSubmitBtn.textContent = '🔍 コピーして はって しらべるにゃ！';
      editBtn.title = '別の人のIDを入れるにゃ';
      disclaimer.childNodes[0].textContent = '⚠️ 調べた結果はDMの相手には内緒にゃ。AIがまちがえることもあるから、おうちの人にも相談するにゃ。';
      hintTitle.textContent = '📖 つかいかた';
      hintContent.innerHTML = `
        1. 届いたメッセージをコピーするにゃ！<br>
        2. オレンジ色の「🔍 あやしいか見てみるにゃ！」をおすにゃ。<br>
        3. メッセージをはりつけて、「🔍 チェックするにゃ！」をおすにゃ。<br>
        4. AI（エーアイ）が「あぶないよ」と言っていないか、よく読むにゃ！
      `;
      // 信頼度プルダウン選択肢
      trustSelect.options[0].textContent = 'まだきめてない';
      trustSelect.options[1].textContent = '✅ しってる人';
      trustSelect.options[2].textContent = '⚠️ あやしい';
      trustSelect.options[3].textContent = '🚨 きけん！';
      if (document.getElementById('gck-gear-btn')) document.getElementById('gck-gear-btn').style.display = 'none';
    } else {
      panel.classList.remove('gck-kids-mode');
      panelTitle.textContent = '🐱 DMチェッカー簡易版';
      fab.textContent = '🐱';
      fab.classList.remove('kids');
      toggleTrack.classList.remove('on');
      // テキストを戻す
      trustLabel.textContent = '信頼度：';
      mainBtn.textContent = alreadyChecked ? '✅ 調査済み（再調査）' : '🔍 Grokで詐欺チェックにゃ';
      locationBtn.textContent = '📍 接続元・国を確認';
      tweetsBtn.textContent = '📜 直近ツイート ▼';
      listBtn.textContent = '📋 信頼度リスト';
      publicTitle.textContent = '📢 公開アカウントの場合：';
      publicBtn.textContent = '🔍 自動で分析にゃ！';
      lockedTextarea.placeholder = '相手のツイートを5〜10件くらいコピペしてね...';
      lockedSubmitBtn.textContent = '🔍 コピペで分析にゃ！';
      editBtn.title = '別のハンドルを手動で入力にゃ';
      disclaimer.childNodes[0].textContent = '⚠️ 判定結果はDM相手には秘密にゃ。人間関係を損なってもAIは責任を取れないにゃ。参考程度にするにゃ。';
      hintTitle.textContent = '🛡️ 見守りのヒント';
      hintContent.innerHTML = `
        SNSで知り合った相手が「会いたい」「写真を送って」と言ってきたら、それは危険なサインです。<br>
        子供は悪意を見抜くことが難しく、親しくなってから要求がエスカレートするケースが多くあります。<br>
        住所・学校名・自撮り写真・身分証は、どんな理由があっても送らせないでください。<br>
        LINEやDiscordなど外部アプリへの誘導も、出会い系・性被害の入口になりやすいです。<br>
        このツールの判定はあくまで参考です。気になる相手がいたら、必ず一緒に確認してあげてください。<br>
        <br>
        🔗 <a href="https://www.soumu.go.jp/use_the_internet_wisely/trouble/" target="_blank" rel="noopener noreferrer">総務省「上手にネットと付き合おう！」</a>
      `;
      // 信頼度プルダウン選択肢を戻す
      trustSelect.options[0].textContent = '未設定';
      trustSelect.options[1].textContent = '✅ 信頼';
      trustSelect.options[2].textContent = '⚠️ 要注意';
      trustSelect.options[3].textContent = '🚨 危険';
      if (document.getElementById('gck-gear-btn')) document.getElementById('gck-gear-btn').style.display = 'block';
    }
  };

  const modeBar = document.createElement('div');
  modeBar.className = 'gck-mode-bar';

  const normalLabel = document.createElement('span');
  normalLabel.className = 'gck-mode-label';
  normalLabel.textContent = '🐱 通常';

  const toggleTrack = document.createElement('div');
  toggleTrack.className = 'gck-toggle-track';
  const toggleThumb = document.createElement('div');
  toggleThumb.className = 'gck-toggle-thumb';
  toggleTrack.appendChild(toggleThumb);

  const kidsLabel = document.createElement('span');
  kidsLabel.className = 'gck-mode-label';
  kidsLabel.textContent = '👦 小中学生';

  toggleTrack.addEventListener('click', () => applyMode(!isKidsMode));
  normalLabel.addEventListener('click', () => applyMode(false));
  kidsLabel.addEventListener('click', () => applyMode(true));

  modeBar.append(normalLabel, toggleTrack, kidsLabel);
  panel.appendChild(modeBar);

  // スクロールエリア
  const panelBody = document.createElement('div');
  panelBody.className = 'gck-panel-body';
  panel.appendChild(panelBody);

  // ハンドル表示
  const handleRow = document.createElement('div');
  handleRow.className = 'gck-row';
  const handleSpan = document.createElement('span');
  handleSpan.className = 'gck-handle';
  handleSpan.textContent = `@${handle}`;

  const editBtn = document.createElement('button');
  editBtn.className = 'gck-edit-btn';
  editBtn.textContent = '✏️';
  editBtn.title = '別のハンドルを手動で入力にゃ';
  editBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'gck-handle-input';
    input.value = handle;
    handleRow.replaceChild(input, handleSpan);
    editBtn.style.display = 'none';
    input.focus();
    input.select();

    let finished = false;
    const finishEdit = () => {
      if (finished) return;
      finished = true;
      const newHandle = input.value.trim().replace('@', '');
      if (newHandle && newHandle !== handle) {
        createPanel(newHandle);
      } else {
        handleRow.replaceChild(handleSpan, input);
        editBtn.style.display = '';
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finishEdit();
      if (e.key === 'Escape') {
        finished = true;
        handleRow.replaceChild(handleSpan, input);
        editBtn.style.display = '';
      }
    });
    input.addEventListener('blur', finishEdit);
  });

  handleRow.append(handleSpan, editBtn);
  panelBody.appendChild(handleRow);

  // 信頼度プルダウン
  const trustRow = document.createElement('div');
  trustRow.className = 'gck-trust-row';
  const trustLabel = document.createElement('span');
  trustLabel.className = 'gck-trust-label';
  trustLabel.textContent = '信頼度：';
  const trustSelect = document.createElement('select');
  trustSelect.className = 'gck-trust-select';
  [
    ['', '未設定'],
    ['trust', '✅ 信頼'],
    ['caution', '⚠️ 要注意'],
    ['danger', '🚨 危険'],
  ].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val; opt.textContent = label;
    if (val === getTrustLevel(handle)) opt.selected = true;
    trustSelect.appendChild(opt);
  });
  trustSelect.addEventListener('change', () => setTrustLevel(handle, trustSelect.value));
  trustRow.append(trustLabel, trustSelect);
  panelBody.appendChild(trustRow);
  const btnGroup = document.createElement('div');
  btnGroup.className = 'gck-btn-group';

  const mainBtn = document.createElement('button');
  mainBtn.className = alreadyChecked ? 'gck-btn-main checked' : 'gck-btn-main';
  mainBtn.textContent = alreadyChecked ? '✅ 調査済み（再調査）' : '🔍 Grokで詐欺チェックにゃ';

  const locationBtn = document.createElement('button');
  locationBtn.className = 'gck-btn-location';
  locationBtn.textContent = '📍 接続元・国を確認';

  const tweetsBtn = document.createElement('button');
  tweetsBtn.className = 'gck-btn-sub';
  tweetsBtn.textContent = '📜 直近ツイート ▼';

  const listBtn = document.createElement('button');
  listBtn.className = 'gck-btn-sub';
  listBtn.textContent = '📋 信頼度リスト';

  btnGroup.append(mainBtn, locationBtn, tweetsBtn, listBtn);
  panelBody.appendChild(btnGroup);

  // ツイートパネル
  const tweetsPanel = document.createElement('div');
  tweetsPanel.className = 'gck-tweets-panel';

  // --- 公開アカウント用 ---
  const publicContainer = document.createElement('div');
  publicContainer.className = 'gck-card-section gck-public-section';

  const publicTitle = document.createElement('div');
  publicTitle.className = 'gck-card-title';
  publicTitle.textContent = '📢 公開アカウントの場合：';
  publicTitle.style.fontWeight = 'bold';

  const publicBtn = document.createElement('button');
  publicBtn.className = 'gck-btn-mini gck-btn-blue';
  publicBtn.textContent = '🔍 自動で分析にゃ！';
  publicBtn.addEventListener('click', () => {
    const query = buildTweetsQuery(handle, isKidsMode);
    window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
    showWaitingAnimation(panelBody, isKidsMode);
  });

  publicContainer.append(publicTitle, publicBtn);

  // --- 鍵アカウント用 ---
  const lockedContainer = document.createElement('div');
  lockedContainer.className = 'gck-card-section gck-locked-section';

  const lockedTitle = document.createElement('div');
  lockedTitle.className = 'gck-card-title';
  lockedTitle.textContent = '🔑 鍵アカウントの場合：';
  lockedTitle.style.fontWeight = 'bold';

  const lockedTextarea = document.createElement('textarea');
  lockedTextarea.className = 'gck-panel-textarea';
  lockedTextarea.placeholder = '相手のツイートを5〜10件くらいコピペしてね...';

  const lockedSubmitBtn = document.createElement('button');
  lockedSubmitBtn.className = 'gck-btn-mini';
  lockedSubmitBtn.textContent = '🔍 コピペで分析にゃ！';
  lockedSubmitBtn.addEventListener('click', () => {
    const text = lockedTextarea.value.trim();
    if (!text) return;
    const query = buildManualTweetsQuery(handle, text, isKidsMode);
    window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
    showWaitingAnimation(panelBody, isKidsMode);
  });

  lockedContainer.append(lockedTitle, lockedTextarea, lockedSubmitBtn);

  tweetsPanel.append(publicContainer, lockedContainer);
  panelBody.appendChild(tweetsPanel);

  // 接続元ツールチップ
  const locationTooltip = document.createElement('div');
  locationTooltip.className = 'gck-location-tooltip';
  panelBody.appendChild(locationTooltip);

  // === 🛡️ 見守りのヒント ===
  const hintWrap = document.createElement('div');
  hintWrap.className = 'gck-parent-hint-wrap';

  const hintTitle = document.createElement('div');
  hintTitle.className = 'gck-parent-hint-title';
  hintTitle.textContent = '🛡️ 見守りのヒント';

  const hintContent = document.createElement('div');
  hintContent.className = 'gck-parent-hint-content';
  hintContent.innerHTML = `
    SNSで知り合った相手が「会いたい」「写真を送って」と言ってきたら、それは危険なサインです。<br>
    子供は悪意を見抜くことが難しく、親しくなってから要求がエスカレートするケースが多くあります。<br>
    住所・学校名・自撮り写真・身分証は、どんな理由があっても送らせないでください。<br>
    LINEやDiscordなど外部アプリへの誘導も、出会い系・性被害の入口になりやすいです。<br>
    このツールの判定はあくまで参考です。気になる相手がいたら、必ず一緒に確認してあげてください。<br>
    <br>
    🔗 <a href="https://www.soumu.go.jp/use_the_internet_wisely/trouble/" target="_blank" rel="noopener noreferrer">総務省「上手にネットと付き合おう！」</a>
  `;

  hintTitle.addEventListener('click', () => {
    hintWrap.classList.toggle('open');
  });

  hintWrap.append(hintTitle, hintContent);
  panelBody.appendChild(hintWrap);

  // 注意書き（パネル下部固定）
  const disclaimer = document.createElement('div');
  disclaimer.className = 'gck-disclaimer';
  disclaimer.style.position = 'relative'; // 追加: ギアボタンの基準にする
  disclaimer.textContent = isKidsMode
    ? '⚠️ 調べた結果はDMの相手には内緒にゃ。AIがまちがえることもあるから、おうちの人にも相談するにゃ。'
    : '⚠️ 判定結果はDM相手には秘密にゃ。人間関係を損なってもAIは責任を取れないにゃ。参考程度にするにゃ。';

  // ギアボタンを右下に配置
  const gearBtn = document.createElement('button');
  gearBtn.id = 'gck-gear-btn';
  gearBtn.className = 'gck-header-btn';
  gearBtn.textContent = '⚙️';
  gearBtn.title = 'プロンプト設定を開くにゃ';
  gearBtn.style.position = 'absolute';
  gearBtn.style.right = '4px';
  gearBtn.style.bottom = '4px';
  gearBtn.onclick = () => showSettingsModal();

  disclaimer.appendChild(gearBtn);
  panel.appendChild(disclaimer);

  document.body.appendChild(panel);

  // 初期状態を適用（全要素定義後）
  applyMode(isKidsMode);

  // ツイート折りたたみフラグ
  let tweetsOpen = false;

  // 各サブメニューを閉じる共通関数 (アコーディオン形式)
  const closeAllSubMenus = () => {
    // 1. 直近ツイートを閉じる
    tweetsPanel.classList.remove('open');
    tweetsBtn.classList.remove('active');
    tweetsOpen = false;
    tweetsBtn.textContent = isKidsMode ? '📜 最近の投稿を見る ▼' : '📜 直近ツイート ▼';

    // 2. 接続元ツールチップを閉じる
    locationTooltip.classList.remove('open');
    locationBtn.classList.remove('active');

    // 3. 信頼度リストを閉じる（パネル内リスト破棄の処理を削除。代わりにボタンのactiveだけトグル準備）
    listBtn.classList.remove('active');
  };

  // 2. 以前が「開」状態なら、新しいパネルも「開」にする (ハンドル編集用)
  if (wasOpen) {
    panel.classList.add('open');
    fab.classList.add('active');
  }

  // === FABトグル ===
  fab.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    fab.classList.toggle('active', isOpen);
  });

  // 信頼度リストボタン（モーダル展開）
  listBtn.addEventListener('click', () => {
    closeAllSubMenus();
    showTrustListModal();
  });

  // 接続元ボタン
  locationBtn.addEventListener('click', () => {
    const wasActive = locationBtn.classList.contains('active');
    closeAllSubMenus();
    if (wasActive) {
      // 既に開いていたなら閉じる（closeAllSubMenusで既に閉じられている）
      return;
    }
    locationBtn.classList.add('active');
    window.open(`https://x.com/${handle}`, '_blank');
    locationTooltip.classList.add('open');
    locationTooltip.textContent = '';
    const lines = isKidsMode ? [
      '📍 プロフィールが開いたにゃ！',
      '「参加日 XX年XX月」→「このアカウントについて」で確認にゃ',
      '',
      '・住んでる場所（例: Japan、United States）',
      '・使ってるアプリ（App Store / Google Play / Web）',
      '',
      '・場所のよこの❗は、場所がまちがってるかもにゃ',
      '・盾🛡️の中の❗は、場所をかくしてる可能性が高いにゃ',
      '',
      '⚠️ 今いる場所じゃなくて、むかしの情報をもとにしてるにゃ。かならず正しいわけじゃないにゃ！',
    ] : [
      '📍 プロフィールが開いたにゃ！',
      '「Joined XX年XX月」→「このアカウントについて」で確認にゃ',
      '',
      '・所在地（例: Japan、United States）',
      '・接続元（App Store / Google Play / Web）',
      '',
      '・所在地横の❗は、位置情報が不正確かもにゃ',
      '・盾🛡️の中の❗ は、VPN・プロキシの可能性が高いにゃ',
      '',
      '⚠️ リアルタイム位置ではなく過去の傾向ベースにゃ。過信しないでにゃ！',
    ];
    lines.forEach(line => {
      const el = document.createElement('div');
      el.className = line.startsWith('⚠️') ? 'gck-tooltip-warn' : (line === '' ? 'gck-tooltip-spacer' : 'gck-tooltip-line');
      el.textContent = line;
      locationTooltip.appendChild(el);
    });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'gck-tooltip-close';
    closeBtn.textContent = '✕ 閉じる';
    closeBtn.addEventListener('click', () => {
      locationTooltip.classList.remove('open');
      locationBtn.classList.remove('active');
    });
    locationTooltip.appendChild(closeBtn);
  });

  // メインボタン
  mainBtn.addEventListener('click', () => {
    showModal(handle, (dmText, relationship, extraInfo, trustLevel, isMinor, isKids) => {
      setCache(handle);
      mainBtn.textContent = isKidsMode ? '✅ 調べたよ（もう一回）' : '✅ 調査済み（再調査）';
      mainBtn.classList.add('checked');
      const query = buildGrokQuery(handle, dmText, relationship, extraInfo, trustLevel, isMinor, isKids);
      window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
      showWaitingAnimation(panelBody, isKidsMode);
    }, isKidsMode);
  });

  // ツイート折りたたみ
  tweetsBtn.addEventListener('click', () => {
    const nextState = !tweetsOpen;
    closeAllSubMenus();
    if (nextState) {
      tweetsOpen = true;
      tweetsPanel.classList.add('open');
      tweetsBtn.classList.add('active');
      tweetsBtn.textContent = isKidsMode ? '📜 最近の投稿を見る ▲' : '📜 直近ツイート ▲';
    }
  });

}


let lastHandle = '';
const observer = new MutationObserver(() => {
  const isDMPage = location.pathname.startsWith('/messages/') || location.pathname.startsWith('/i/chat/');
  if (!isDMPage) {
    if (lastHandle !== '') {
      lastHandle = '';
      removeOldPanel();
    }
    return;
  }
  const handle = getHandleFromPage();
  if (handle && handle !== lastHandle) {
    lastHandle = handle;
    setTimeout(() => createPanel(handle), 700);
  }
});
// 拡張機能の初期化
initStorage(() => {
  observer.observe(document.body, { childList: true, subtree: true });

  if (location.pathname.startsWith('/messages/') || location.pathname.startsWith('/i/chat/')) {
    setTimeout(() => {
      const handle = getHandleFromPage();
      if (handle) { lastHandle = handle; createPanel(handle); }
    }, 1000);
  } else {
    removeOldPanel();
  }
});
