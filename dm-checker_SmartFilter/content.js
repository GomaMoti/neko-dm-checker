// ===== スマートフィルター（ローカルリスク判定 v2） =====
function judgeDmRisk(signals) {
  const LABELS = {
    talkedInvestmentHighIncome: "投資・副業・高収入の話をしてきた",
    requestedAdvanceFeeDeposit: "前払い・手数料・保証金を要求してきた／出金条件として税金・認証料・追加入金を後出しで要求してきた",
    requestedAdditionalPayment: "送金後に追加送金を要求してきた／出金時に保証金・税金・認証料などを後出し請求してきた",
    changedPaymentMethod: "送金手段を途中で変更してきた",
    restrictedPaymentCryptoGift: "送金手段を暗号資産/ギフト券に限定してきた",
    guidedToExternalApp: "外部アプリに誘導してきた",
    sentLink: "リンクを送ってきた",
    threatenedLegalAction: "凍結・通報・法的措置の話で不安を煽ってきた",
    requestedPersonalInfo: "身分証・個人情報・口座情報を要求してきた／入金先に個人名義口座を指定してきた",
    requestedSmsOr2faCode: "SMS/2FAコードを要求してきた",
    requestedRemoteControlApp: "遠隔操作アプリ導入を要求してきた／非公式の証券・投資・FXアプリのインストールを要求してきた",
    claimedCelebrityOrAuthority: "有名人・公式・先生・業界人を名乗っている／登録番号詐称・政府公認・金融庁免許ありの虚偽を主張している",
    requestedSecrecy: "秘密にするよう求められた",
    askedToInviteFriends: "友人・知人を誘うよう求められた",
    screenshotOnlyProof: "画像スクショだけで取引証明しようとした",
    unnaturalJapaneseOrContradiction: "日本語が不自然/説明が矛盾している",
    // 学生フラグブースト用
    studentWelcomeEasyMoney: "「学生歓迎」「簡単に高収入」「即金」の言葉があった",
    twoPersonSecret: "「二人だけの秘密」「誰にも言うな」と言われた",
    dreamCareerSpecialTreatment: "夢・進路・芸能相談＋特別扱いを強調された",
  };

  // --- スコアリングコア（重要度グループ別管理） ---
  const _$c = ['requestedAdvanceFeeDeposit', 'requestedAdditionalPayment', 'restrictedPaymentCryptoGift', 'requestedPersonalInfo', 'requestedSmsOr2faCode', 'requestedRemoteControlApp'];
  const _$h = ['talkedInvestmentHighIncome', 'changedPaymentMethod', 'guidedToExternalApp', 'threatenedLegalAction', 'claimedCelebrityOrAuthority', 'requestedSecrecy', 'askedToInviteFriends', 'screenshotOnlyProof', 'studentWelcomeEasyMoney', 'twoPersonSecret', 'dreamCareerSpecialTreatment'];
  const _$m = ['sentLink', 'unnaturalJapaneseOrContradiction'];
  const _$pts = [3, 2, 1];
  function _$w(k) { return _$c.includes(k) ? _$pts[0] : _$h.includes(k) ? _$pts[1] : _$m.includes(k) ? _$pts[2] : 0; }
  const WEIGHTS = Object.fromEntries([..._$c.map(k => [k, _$pts[0]]), ..._$h.map(k => [k, _$pts[1]]), ..._$m.map(k => [k, _$pts[2]])]);

  const SINGLE_BLOCK = [
    'requestedAdvanceFeeDeposit',
    'restrictedPaymentCryptoGift',
    'requestedSmsOr2faCode',
    'requestedRemoteControlApp',
  ];

  const COMBO_BLOCKS = [
    { items: ['requestedAdditionalPayment', 'requestedAdvanceFeeDeposit'], label: '追加送金＋前払い要求' },
    { items: ['requestedAdditionalPayment', 'changedPaymentMethod'], label: '追加送金＋送金手段変更' },
    { items: ['guidedToExternalApp', 'requestedPersonalInfo'], label: '外部誘導＋個人情報要求' },
    { items: ['claimedCelebrityOrAuthority', 'requestedSecrecy', 'requestedAdvanceFeeDeposit'], label: '権威名乗り＋秘密強要＋前払い' },
    { items: ['screenshotOnlyProof', 'requestedAdvanceFeeDeposit'], label: 'スクショ証明のみ＋先払い要求' },
    { items: ['threatenedLegalAction', 'guidedToExternalApp'], label: '不安煽り＋外部誘導' },
    { items: ['claimedCelebrityOrAuthority', 'talkedInvestmentHighIncome', 'guidedToExternalApp'], label: '権威名乗り＋投資話＋外部誘導' },
    { items: ['talkedInvestmentHighIncome', 'askedToInviteFriends'], label: '投資話＋友人勧誘（マルチ疑い）' },
  ];

  const matchedKeys = Object.keys(LABELS).filter(k => !!signals[k]);
  const matchedItems = matchedKeys.map(k => LABELS[k]);

  // 単体BLOCK
  const singleBlockHits = SINGLE_BLOCK.filter(k => !!signals[k]);
  // 組み合わせBLOCK
  const comboBlockHits = COMBO_BLOCKS.filter(c => c.items.every(k => !!signals[k]));

  if (singleBlockHits.length > 0 || comboBlockHits.length > 0) {
    const reasons = [
      ...singleBlockHits.map(k => LABELS[k]),
      ...comboBlockHits.map(c => c.label),
    ].slice(0, 3);
    // 実スコアも計算する（Grokへの参考値として）
    let blockScore = 0;
    Object.keys(WEIGHTS).forEach(k => { if (signals[k]) blockScore += WEIGHTS[k]; });
    return { riskLevel: 'BLOCK', score: blockScore, matchedItems, reasons, matchedBlockRules: comboBlockHits.map(c => c.label) };
  }

  // スコア計算
  let score = 0;
  const scored = [];
  Object.keys(WEIGHTS).forEach(k => {
    if (signals[k]) { score += WEIGHTS[k]; scored.push({ key: k, pts: WEIGHTS[k] }); }
  });

  const boosts = [];
  const _b = _$pts;  // ブースト値参照
  if (signals.talkedInvestmentHighIncome && signals.requestedAdvanceFeeDeposit) { score += _b[0]; boosts.push('投資・副業＋前払い要求'); }
  if (signals.guidedToExternalApp && signals.sentLink) { score += _b[1]; boosts.push('外部誘導＋リンク送付'); }
  if (signals.claimedCelebrityOrAuthority && signals.requestedSecrecy) { score += _b[1]; boosts.push('権威名乗り＋秘密強要'); }
  if (signals.threatenedLegalAction && signals.claimedCelebrityOrAuthority) { score += _b[1]; boosts.push('凍結脅し＋権威名乗り'); }
  if (signals.studentWelcomeEasyMoney) { score += _b[1]; boosts.push('学生歓迎・即金の言葉あり'); }
  if (signals.twoPersonSecret) { score += _b[1]; boosts.push('二人だけの秘密・口止め'); }
  if (signals.claimedCelebrityOrAuthority && signals.requestedPersonalInfo) { score += _b[0]; boosts.push('先生・業界人名乗り＋個人情報要求'); }
  if (signals.dreamCareerSpecialTreatment) { score += _b[1]; boosts.push('夢・進路相談＋特別扱い強調'); }

  let riskLevel = 'LOW';
  if (score >= 10) riskLevel = 'CRITICAL';
  else if (score >= 7) riskLevel = 'HIGH';
  else if (score >= 4) riskLevel = 'MEDIUM';

  const topReasons = scored.sort((a, b) => b.pts - a.pts).slice(0, 3).map(x => LABELS[x.key]);
  const reasons = [...boosts, ...topReasons].slice(0, 3);
  return { riskLevel, score, matchedItems, reasons, matchedBlockRules: [] };
}

// チェックボックスラベル→シグナルキー変換
const LABEL_TO_SIGNAL = {
  '投資・副業・高収入の話をしてきた': 'talkedInvestmentHighIncome',
  '前払い・手数料・保証金を要求してきた': 'requestedAdvanceFeeDeposit',
  '送金後に追加送金を要求してきた': 'requestedAdditionalPayment',
  '送金手段を途中で変更してきた（例: PayPay→ギフト券）': 'changedPaymentMethod',
  '送金手段を暗号資産/ギフト券に限定してきた': 'restrictedPaymentCryptoGift',
  'LINE・Discord・Telegram・Signalなど外部アプリに誘導してきた': 'guidedToExternalApp',
  'リンク（URL）を送ってきた': 'sentLink',
  '凍結・通報・法的措置の話で不安を煽ってきた': 'threatenedLegalAction',
  '身分証・個人情報・口座情報を要求してきた': 'requestedPersonalInfo',
  'SMS/2FAコードを要求してきた': 'requestedSmsOr2faCode',
  '遠隔操作アプリ導入を要求してきた': 'requestedRemoteControlApp',
  '有名人・公式・先生・業界人を名乗っている': 'claimedCelebrityOrAuthority',
  '秘密にするよう求められた': 'requestedSecrecy',
  '友人・知人を誘うよう求められた': 'askedToInviteFriends',
  '画像スクショだけで取引証明しようとした': 'screenshotOnlyProof',
  '日本語が不自然/説明が矛盾している': 'unnaturalJapaneseOrContradiction',
  // 学生フラグ
  '「学生歓迎」「簡単に高収入」「即金」の言葉があった': 'studentWelcomeEasyMoney',
  '「二人だけの秘密」「誰にも言うな」と言われた': 'twoPersonSecret',
  '夢・進路・芸能相談＋特別扱いを強調された': 'dreamCareerSpecialTreatment',
};

function buildSignalsFromChecked(checkedLabels) {
  const signals = {};
  checkedLabels.forEach(label => {
    const key = LABEL_TO_SIGNAL[label];
    if (key) signals[key] = true;
  });
  return signals;
}

// ===== データ同期・マイグレーション用キャッシュ =====
let gckStorage = {
  whitelist: {},
  templates: {},
  cache: {}
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

  if (migrated) {
    saveStorage(); // chrome.storageに保存
  }
}

// 読み込み完了後にデータをChrome Storageから取得して反映する初期化処理
function initStorage(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['gck_whitelist', 'gck_templates', 'gck_cache'], (res) => {
      if (res.gck_whitelist) gckStorage.whitelist = res.gck_whitelist;
      if (res.gck_templates) gckStorage.templates = res.gck_templates;
      if (res.gck_cache) gckStorage.cache = res.gck_cache;

      migrateLocalStorageData(); // localStorageから移行すべきデータがあれば移行する
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
      'gck_cache': gckStorage.cache
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
  SCAM_PREFIX_KIDS: 'gck_tpl_scam_prefix_kids',
  SCAM_SUFFIX_KIDS: 'gck_tpl_scam_suffix_kids'
};

// カテゴリ定義
const SCAM_CATEGORIES = {
  '金銭・送金': ['投資・副業・高収入の話をしてきた', '前払い・手数料・保証金を要求してきた', '送金後に追加送金を要求してきた', '送金手段を途中で変更してきた（例: PayPay→ギフト券）', '送金手段を暗号資産/ギフト券に限定してきた'],
  '誘導・フィッシング': ['LINE・Discord・Telegram・Signalなど外部アプリに誘導してきた', 'リンク（URL）を送ってきた', '遠隔操作アプリ導入を要求してきた', 'SMS/2FAコードを要求してきた'],
  '脅迫・なりすまし': ['凍結・通報・法的措置の話で不安を煽ってきた', '有名人・公式・先生・業界人を名乗っている', '日本語が不自然/説明が矛盾している'],
  '個人情報・秘密': ['身分証・個人情報・口座情報を要求してきた', '秘密にするよう求められた', '画像スクショだけで取引証明しようとした'],
  '勧誘・その他': ['友人・知人を誘うよう求められた'],
};

const CATEGORY_KEY = 'gck_categories_v2';  // v2: カテゴリ再設計で旧データを自動無効化
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

// ===== 再発判定（v1.8）=====
const RECUR_KEY = 'gck_recur_history';

function getRecurHistory() {
  if (!gckStorage.recurHistory) gckStorage.recurHistory = {};
  return gckStorage.recurHistory;
}
function saveRecurHistory() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ [RECUR_KEY]: gckStorage.recurHistory });
  }
}
function recordRecurCheck(handle, riskLevel, score) {
  if (!handle) return;
  const h = sanitizeHandle(handle);
  if (!h) return;
  const history = getRecurHistory();
  if (!history[h]) history[h] = { checkCount: 0, lastLevel: null, lastScore: 0, lastChecked: null };
  history[h].checkCount += 1;
  history[h].lastLevel = riskLevel;
  history[h].lastScore = score;
  history[h].lastChecked = new Date().toISOString().slice(0, 10);
  gckStorage.recurHistory = history;
  saveRecurHistory();
}
function applyRecurBoost(handle, result) {
  if (!handle) return result;
  const h = sanitizeHandle(handle);
  if (!h) return result;
  const history = getRecurHistory();
  const rec = history[h];
  if (!rec || rec.checkCount < 1) return result;
  let { riskLevel, score } = result;
  const boostReasons = [...(result.reasons || [])];
  if (rec.checkCount >= 1) {
    score += 2;
    boostReasons.push(`⚠️ 同じ相手に${rec.checkCount + 1}回目の確認（再発+2点）`);
  }
  if (rec.checkCount >= 2) {
    const levelUp = { LOW: 'MEDIUM', MEDIUM: 'HIGH', HIGH: 'CRITICAL', CRITICAL: 'BLOCK', BLOCK: 'BLOCK' };
    if (riskLevel !== 'BLOCK') riskLevel = levelUp[riskLevel] || riskLevel;
  }
  if (riskLevel !== 'BLOCK') {
    if (score >= 10) riskLevel = 'BLOCK';
    else if (score >= 7) riskLevel = 'CRITICAL';
    else if (score >= 5) riskLevel = 'HIGH';
    else if (score >= 3) riskLevel = 'MEDIUM';
    else riskLevel = 'LOW';
  }
  return { ...result, score, riskLevel, reasons: boostReasons };
}
function loadRecurHistory(cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([RECUR_KEY], (res) => {
      if (res[RECUR_KEY]) gckStorage.recurHistory = res[RECUR_KEY];
      if (cb) cb();
    });
  } else { if (cb) cb(); }
}
// ===== 再発判定ここまで =====
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

function buildGrokQuery(handle, dmText, relationship, extraInfo, trustLevel, isYouth, localNote = '') {
  const dmSection = dmText
    ? `【受け取ったDM内容】\n${dmText}\n`
    : '【DM内容】未入力\n';

  const relSection = relationship
    ? `・相手との関係: ${relationship}\n`
    : '';

  const extraSection = extraInfo
    ? `・気になる点: ${extraInfo}\n`
    : '';

  const trustNote = trustLevel === 'trust'
    ? '\n※送信者がこのアカウントを「信頼できる知人」として登録しています。誤検知の可能性も考慮して判定してにゃ。\n'
    : trustLevel === 'caution'
      ? '\n※送信者がこのアカウントを「要注意」として登録しています。\n'
      : trustLevel === 'danger'
        ? '\n※送信者がこのアカウントを「危険・詐欺確定」として登録しています。\n'
        : '';

  const youthNote = isYouth
    ? '\n※重要：相手または自分が若年層（学生など）、あるいは相手が「立場が上（業界人など）」の疑いがあるケースにゃ。単なる詐欺だけでなく、「立場の差を利用した心理的支配（グルーミング）」や「夢・進路をエサにした不適切な誘い（オーディション名目、内緒の仕事、パパ活誘導、情報商材など）」の兆候がないか、マンガ業界などの過去の事例も踏まえて極めて厳しく判定してにゃ。\n'
    : '';

  const prefixTpl = getTemplate(TEMPLATE_KEYS.SCAM_PREFIX, SCAM_PREFIX_DEFAULT);
  const suffixTpl = getTemplate(TEMPLATE_KEYS.SCAM_SUFFIX, SCAM_SUFFIX_DEFAULT);

  const prefix = replacePlaceholder(prefixTpl, handle);
  const suffix = replacePlaceholder(suffixTpl, handle);

  const strength = getFilterStrength();
  const strengthNote = strength === 'weak'
    ? '\n※判定は参考程度で、誤検知の可能性も考慮してにゃ。\n'
    : strength === 'strong'
      ? '\n※少しでも怪しい点があれば厳しめに指摘してにゃ。見落とし厳禁にゃ。\n'
      : '';

  return `${prefix}${trustNote}${youthNote}${strengthNote}${localNote}

【アカウント基本チェック】
・推定国・地域（言語・絵文字・タイムゾーンから）
・アカウント作成時期・急な活発化
・フォロワー/相互傾向（ボット・アジア系多め？）
・直近20ツイート傾向

${dmSection}
【追加情報】
${relSection}${extraSection}
【詐欺パターン一致チェック（2026年最新）】
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
${suffix}`;
}

function buildTweetsQuery(handle) {
  const tpl = getTemplate(TEMPLATE_KEYS.TWEETS, TWEETS_QUERY_DEFAULT);
  return replacePlaceholder(tpl, handle);
}

function buildManualTweetsQuery(handle, tweetsText) {
  return `@${handle} のツイート内容から詐欺チェックしてにゃ。
【貼り付けられたツイート内容】
${tweetsText}

内容・言語・トーン・詐欺パターンへの一致を教えて。`;
}

// モーダルポップアップ
function showModal(handle, onSubmit) {
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
  title.textContent = '🐱 詐欺チェック強化にゃ（任意）';

  const subtitle = document.createElement('div');
  subtitle.className = 'gck-modal-subtitle';
  subtitle.textContent = 'DM内容を入れると判定精度が爆上がりするにゃ！空でもOK。';

  // ラベル＋テキストエリア
  function makeLabel(text) {
    const el = document.createElement('label');
    el.className = 'gck-modal-label';
    el.textContent = text;
    return el;
  }

  // -------------------------
  // 🎓 学生・20代向け（念入り調査）機能 (最上部)
  // -------------------------
  const youthWrap = document.createElement('div');
  youthWrap.className = 'gck-youth-wrap';

  const youthCheckLabel = document.createElement('label');
  youthCheckLabel.className = 'gck-youth-main-label';
  const youthCheckbox = document.createElement('input');
  youthCheckbox.type = 'checkbox';
  youthCheckbox.className = 'gck-checkbox';
  youthCheckLabel.appendChild(youthCheckbox);
  youthCheckLabel.appendChild(document.createTextNode(' 🎓 学生・20代向け（念入り調査）'));

  const youthDesc = document.createElement('div');
  youthDesc.className = 'gck-youth-desc';
  youthDesc.textContent = '※進路や夢の相談、仕事の誘いなど、相手が「立場が上（業界人など）」の場合はONにしてにゃ。若者を狙った特殊な詐欺や心理的支配（搾取）を見抜く力が上がるにゃ！';
  youthDesc.style.display = 'none'; // 初期は折り畳み

  youthWrap.append(youthCheckLabel, youthDesc);
  // -------------------------

  const dmLabel = makeLabel('📩 受け取ったDMの内容（任意）');
  const dmInput = document.createElement('textarea');
  dmInput.className = 'gck-modal-textarea';
  dmInput.placeholder = 'ここにDMの文章を貼り付けてにゃ…\n例: 「誤って報告してしまいました。解除のためにこちらへ…」';
  dmInput.rows = 4;
  dmInput.maxLength = 800; const relLabel = makeLabel('📍 どこで知り合った？（任意）');

  // 警戒度マップ
  const meetingOptions = [
    { val: '', label: '選択しない', level: null },
    { val: '突然DMが来た', label: '突然DMが来た', level: 'high', icon: '🚨', text: '警戒度：高め。見知らぬ人からの突然のDMは詐欺の入口にゃ！' },
    { val: 'いいね・リプライから', label: 'いいね・リプライから', level: 'mid', icon: '⚠️', text: '警戒度：要確認。自然な絡みに見せて近づくのが詐欺の典型にゃ。' },
    { val: 'スペース・コミュニティから', label: 'スペース・コミュニティから', level: 'mid', icon: '🟡', text: '警戒度：中程度。共通の場にいた感が信頼感を演出するにゃ。' },
    { val: '共通フォロワー経由', label: '共通フォロワー経由', level: 'low', icon: '🟢', text: '警戒度：比較的低め。ただし共通フォロワーも騙されてる可能性があるにゃ。' },
    { val: '昔からのフォロワー', label: '昔からのフォロワー', level: 'safe', icon: '✅', text: '警戒度：低め。ただしアカウント乗っ取りには注意にゃ！' },
  ];

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

  const checkLabel = makeLabel('🚩 気になる点（チェックボックス）');
  const checkItems = [
    '投資・副業・高収入の話をしてきた',
    '前払い・手数料・保証金を要求してきた',
    '送金後に追加送金を要求してきた',
    '送金手段を途中で変更してきた（例: PayPay→ギフト券）',
    '送金手段を暗号資産/ギフト券に限定してきた',
    'LINE・Discord・Telegram・Signalなど外部アプリに誘導してきた',
    'リンク（URL）を送ってきた',
    '凍結・通報・法的措置の話で不安を煽ってきた',
    '身分証・個人情報・口座情報を要求してきた',
    'SMS/2FAコードを要求してきた',
    '遠隔操作アプリ導入を要求してきた',
    '有名人・公式・先生・業界人を名乗っている',
    '秘密にするよう求められた',
    '友人・知人を誘うよう求められた',
    '画像スクショだけで取引証明しようとした',
    '日本語が不自然/説明が矛盾している',
  ];

  // 学生フラグON時の追加チェック項目（ブースト用）
  const youthExtraItems = [
    '「学生歓迎」「簡単に高収入」「即金」の言葉があった',
    '「二人だけの秘密」「誰にも言うな」と言われた',
    '夢・進路・芸能相談＋特別扱いを強調された',
  ];

  // リスクメーター
  const riskMeter = document.createElement('div');
  riskMeter.className = 'gck-risk-meter';
  riskMeter.style.display = 'none';

  function refreshRiskMeter() {
    const allChecked = [...checkboxGroup.querySelectorAll('input:checked')].map(cb => cb.value);
    if (allChecked.length === 0) { riskMeter.style.display = 'none'; return; }
    const signals = buildSignalsFromChecked(allChecked);
    const rawResult = judgeDmRisk(signals);
    const result = applyRecurBoost(handle, rawResult);
    const colors = { LOW: '#2a7a4a', MEDIUM: '#b07a00', HIGH: '#c05000', CRITICAL: '#aa0000', BLOCK: '#aa0000' };
    const bgColors = { LOW: '#0a1a0f', MEDIUM: '#1a1200', HIGH: '#1a0800', CRITICAL: '#1a0000', BLOCK: '#1a0000' };
    const icons = { LOW: '✅', MEDIUM: '⚠️', HIGH: '🚨', CRITICAL: '🔴', BLOCK: '🛑' };
    const levelText = { LOW: 'LOW', MEDIUM: 'MEDIUM — 注意', HIGH: 'HIGH — 高リスク', CRITICAL: 'CRITICAL — 極めて危険', BLOCK: 'BLOCK — 即ブロック推奨' };
    riskMeter.style.display = 'block';
    riskMeter.style.borderColor = colors[result.riskLevel];
    riskMeter.style.background = bgColors[result.riskLevel];
    riskMeter.innerHTML = '';
    const levelEl = document.createElement('div');
    levelEl.className = 'gck-risk-level';
    levelEl.style.color = colors[result.riskLevel];
    levelEl.textContent = icons[result.riskLevel] + ' ' + levelText[result.riskLevel] + (result.riskLevel !== 'BLOCK' ? '  (スコア: ' + result.score + ')' : '');
    riskMeter.appendChild(levelEl);
    if (result.reasons.length > 0) {
      const reasonEl = document.createElement('div');
      reasonEl.className = 'gck-risk-reasons';
      result.reasons.forEach(r => {
        const span = document.createElement('span');
        span.className = 'gck-risk-tag';
        span.textContent = r;
        reasonEl.appendChild(span);
      });
      riskMeter.appendChild(reasonEl);
    }
    if (result.riskLevel === 'BLOCK' || result.riskLevel === 'CRITICAL') {
      riskMeter.classList.add('gck-risk-blink');
    } else {
      riskMeter.classList.remove('gck-risk-blink');
    }
  }

  const checkboxGroup = document.createElement('div');
  checkboxGroup.className = 'gck-checkbox-group';

  // カテゴリON/OFFで表示を絞る
  const visibleItems = getVisibleCheckItems(checkItems);
  visibleItems.forEach(item => {
    const lbl = document.createElement('label');
    lbl.className = 'gck-checkbox-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = item;
    cb.className = 'gck-checkbox';
    cb.addEventListener('change', refreshRiskMeter);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + item));
    checkboxGroup.appendChild(lbl);
  });

  // ユース向けアイテムの追加（同じグループ内にオレンジ色で追加・初期非表示）
  const youthElements = [];
  youthExtraItems.forEach(item => {
    const lbl = document.createElement('label');
    lbl.className = 'gck-checkbox-label';
    lbl.style.color = '#ffcc77';
    lbl.style.display = 'none'; // 初期非表示
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = item;
    cb.className = 'gck-checkbox';
    cb.style.accentColor = '#ffaa33';
    cb.classList.add('gck-youth-cb'); // 区別用クラス
    cb.addEventListener('change', refreshRiskMeter);
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + item));
    checkboxGroup.appendChild(lbl);
    youthElements.push(lbl);
  });

  // 連動ギミック
  youthCheckbox.addEventListener('change', () => {
    const isChecked = youthCheckbox.checked;
    youthDesc.style.display = isChecked ? 'block' : 'none';
    youthWrap.classList.toggle('active', isChecked);

    youthElements.forEach(el => {
      el.style.display = isChecked ? 'flex' : 'none';
    });
  });

  const extraLabel = makeLabel('📝 その他・気になる点（任意）');
  const extraInput = document.createElement('input');
  extraInput.className = 'gck-modal-input';
  extraInput.type = 'text';
  extraInput.maxLength = 200;
  extraInput.placeholder = '例: 突然フォローしてきた / プロフィール写真が外国人モデル風';

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
  submitBtn.textContent = '🔍 入力内容で調べるにゃ！';

  btnRow.append(skipBtn, submitBtn);

  // タイトル部（固定）
  const modalTop = document.createElement('div');
  modalTop.className = 'gck-modal-top';
  modalTop.append(closeXBtn, title, subtitle);

  // スクロールエリア
  const modalScroll = document.createElement('div');
  modalScroll.className = 'gck-modal-scroll';
  modalScroll.append(youthWrap, dmLabel, dmInput, relLabel, relSelect, relHint, checkLabel, riskMeter, checkboxGroup, extraLabel, extraInput, privacy);

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
    onSubmit('', '', '', '', false);
  });

  submitBtn.addEventListener('click', () => {
    const dm = dmInput.value.trim().slice(0, 800);
    const rel = relSelect.value;
    const checked = [...checkboxGroup.querySelectorAll('input:checked:not(.gck-youth-cb)')].map(cb => cb.value);
    const youthChecked = youthCheckbox.checked
      ? [...checkboxGroup.querySelectorAll('input.gck-youth-cb:checked')].map(cb => cb.value)
      : [];
    const extraText = extraInput.value.trim().slice(0, 200);
    const allChecked = [...checked, ...youthChecked];
    const signals = buildSignalsFromChecked(allChecked);
    const rawLocalResult = judgeDmRisk(signals);
    const localResult = applyRecurBoost(handle, rawLocalResult);
    // 再発履歴に記録するにゃ
    recordRecurCheck(handle, localResult.riskLevel, localResult.score);

    // localNote：件数＋主因のみ（重複排除・圧縮）
    const riskLabel = { BLOCK: '即遮断条件に該当', CRITICAL: '極めて高リスク', HIGH: '高リスク', MEDIUM: '中程度のリスク', LOW: '低リスク' };

    // 再発カウント取得にゃ
    const recurHistory = getRecurHistory();
    const recurRec = recurHistory[sanitizeHandle(handle)];
    const recurNote = recurRec && recurRec.checkCount > 1
      ? `\n【再確認警告】この相手を${recurRec.checkCount}回確認済み。繰り返し確認は危険なサインの可能性があるにゃ。\n`
      : '';

    // BLOCK強調にゃ
    const blockWarnNote = localResult.riskLevel === 'BLOCK'
      ? '\n【重要】ローカル判定でBLOCK（即遮断）です。公開情報が正常でもDM内容が極めて危険にゃ。公開情報より判定を信頼してにゃ。\n'
      : '';

    const localNote = allChecked.length > 0
      ? `\n【ローカル事前判定】${riskLabel[localResult.riskLevel]} / ${localResult.matchedItems.length}件一致 / 主因:[${localResult.reasons.slice(0, 2).join(' / ')}]${localResult.matchedBlockRules.length > 0 ? ' / 即遮断ルール:[' + localResult.matchedBlockRules[0] + ']' : ''}\n${blockWarnNote}${recurNote}`
      : `\n【チェックなし】DM内容・チェック項目の入力なし。公開情報とアカウント調査のみにゃ。\n${recurNote}`;
    // extraはフリーテキストのみ（チェックボックス項目は重複するので除外）
    const extra = extraText ? extraText.slice(0, 200) : '';
    close();
    onSubmit(dm, rel, extra, getTrustLevel(handle), youthCheckbox.checked, localNote);
  });

  overlay.addEventListener('click', (e) => {
    // 外クリックでは閉じないにゃ（×ボタンのみ）
  });
}

// 設定用モーダル (showModalの実装を流用)
function showSettingsModal(onClose = null) {
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
    textarea.maxLength = 1000;
    textarea.setAttribute('autocomplete', 'off'); // オートフィル非表示
    textarea.addEventListener('input', () => {
      setTemplate(key, textarea.value);
    });

    group.append(header, textarea, confirmUI);
    return group;
  };

  // カテゴリON/OFF
  const catSection = document.createElement('div');
  catSection.className = 'gck-setting-section';
  const catTitle = document.createElement('div');
  catTitle.className = 'gck-setting-label';
  catTitle.textContent = '🚩 表示するチェック項目';
  catSection.appendChild(catTitle);

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
    catSection.appendChild(row);
  });

  // フィルター強度
  const strengthSection = document.createElement('div');
  strengthSection.className = 'gck-setting-section';
  const strengthTitle = document.createElement('div');
  strengthTitle.className = 'gck-setting-label';
  strengthTitle.textContent = '⚖️ 判定の強さ';
  strengthSection.appendChild(strengthTitle);

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
    strengthSection.appendChild(row);
  });

  modalScroll.append(
    catSection,
    strengthSection
  );

  modalScroll.append(
    createSettingRow('🔹 詐欺チェックの冒頭', TEMPLATE_KEYS.SCAM_PREFIX, SCAM_PREFIX_DEFAULT),
    createSettingRow('🔹 詐欺チェックの末尾', TEMPLATE_KEYS.SCAM_SUFFIX, SCAM_SUFFIX_DEFAULT),
    createSettingRow('🔹 直近ツイート分析プロンプト', TEMPLATE_KEYS.TWEETS, TWEETS_QUERY_DEFAULT)
  );

  const modalBottom = document.createElement('div');
  modalBottom.className = 'gck-modal-bottom';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'gck-modal-btn-submit';
  closeBtn.textContent = '設定を閉じる';
  closeBtn.addEventListener('click', () => { close(); if (onClose) onClose(); });
  modalBottom.appendChild(closeBtn);

  modal.append(modalTop, modalScroll, modalBottom);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));
}


// 🐱 裏取り中アニメーション（Grokタブに戻ったら消える）
function showWaitingAnimation(panel) {
  const existing = panel.querySelector('.gck-waiting');
  if (existing) existing.remove();

  const messages = [
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

function showTrustList(container) {
  let existingList = container.querySelector('.gck-trust-list');
  if (existingList) {
    existingList.remove();
    return;
  }

  const listDiv = document.createElement('div');
  listDiv.className = 'gck-trust-list';

  const title = document.createElement('div');
  title.className = 'gck-trust-list-title';
  title.textContent = '📋 信頼度リスト (ローカル保存)';
  listDiv.appendChild(title);

  const wl = getWhitelist();
  const handles = Object.keys(wl);

  if (handles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gck-trust-list-empty';
    empty.textContent = 'まだ登録されてないにゃ🐾';
    listDiv.appendChild(empty);
  } else {
    handles.forEach(handle => {
      const level = wl[handle];
      const row = document.createElement('div');
      row.className = 'gck-trust-list-row';

      const handleSpan = document.createElement('span');
      handleSpan.className = 'gck-trust-list-handle';
      handleSpan.textContent = `@${handle}`;

      const badge = document.createElement('span');
      badge.className = `gck-trust-list-badge gck-trust-list-${level}`;
      if (level === 'trust') badge.textContent = '✅ 信頼';
      else if (level === 'caution') badge.textContent = '⚠️ 要注意';
      else if (level === 'danger') badge.textContent = '🚨 危険';

      const delBtn = document.createElement('button');
      delBtn.className = 'gck-panel-close';
      delBtn.textContent = '✕';
      delBtn.title = '削除';
      delBtn.addEventListener('click', () => {
        setTrustLevel(handle, '');
        row.remove();
        if (listDiv.querySelectorAll('.gck-trust-list-row').length === 0) {
          const empty = document.createElement('div');
          empty.className = 'gck-trust-list-empty';
          empty.textContent = 'まだ登録されてないにゃ🐾';
          listDiv.appendChild(empty);
        }

        const viewingHandleEl = document.querySelector('.gck-handle');
        const trustSelect = document.querySelector('.gck-trust-select');
        if (viewingHandleEl && viewingHandleEl.textContent === `@${handle}` && trustSelect) {
          trustSelect.value = '';
        }
      });

      row.append(handleSpan, badge, delBtn);
      listDiv.appendChild(row);
    });
  }
  container.appendChild(listDiv);
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
    const query = buildTweetsQuery(handle);
    window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
    showWaitingAnimation(panelBody);
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
  lockedTextarea.maxLength = 1000;

  const lockedSubmitBtn = document.createElement('button');
  lockedSubmitBtn.className = 'gck-btn-mini';
  lockedSubmitBtn.textContent = '🔍 コピペで分析にゃ！';
  lockedSubmitBtn.addEventListener('click', () => {
    const text = lockedTextarea.value.trim();
    if (!text) return;
    const query = buildManualTweetsQuery(handle, text);
    window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
    showWaitingAnimation(panelBody);
  });

  lockedContainer.append(lockedTitle, lockedTextarea, lockedSubmitBtn);

  tweetsPanel.append(publicContainer, lockedContainer);
  panelBody.appendChild(tweetsPanel);

  // 接続元ツールチップ
  const locationTooltip = document.createElement('div');
  locationTooltip.className = 'gck-location-tooltip';
  panelBody.appendChild(locationTooltip);

  // 注意書き（パネル下部固定）
  const disclaimer = document.createElement('div');
  disclaimer.className = 'gck-disclaimer';
  disclaimer.style.position = 'relative'; // 追加: ギアボタンの基準にする
  disclaimer.textContent = '⚠️ 判定結果はDM相手には秘密にゃ。人間関係を損なってもAIは責任を取れないにゃ。参考程度にするにゃ。';

  // ギアボタンを右下に配置
  const gearBtn = document.createElement('button');
  gearBtn.className = 'gck-header-btn';
  gearBtn.textContent = '⚙️';
  gearBtn.title = 'プロンプト設定を開くにゃ';
  gearBtn.style.position = 'absolute';
  gearBtn.style.right = '4px';
  gearBtn.style.bottom = '4px';
  gearBtn.onclick = () => showSettingsModal(() => {
    // 設定変更後にチェックボックスを即時再描画
    const group = document.querySelector('.gck-checkbox-group');
    if (group) {
      // 通常チェックボックスのみ再描画（youth-cbは除く）
      [...group.querySelectorAll('input.gck-checkbox:not(.gck-youth-cb)')].forEach(cb => {
        const lbl = cb.parentElement;
        if (lbl) lbl.style.display = '';
      });
      const visible = new Set(getVisibleCheckItems([...group.querySelectorAll('input.gck-checkbox:not(.gck-youth-cb)')].map(cb => cb.value)));
      [...group.querySelectorAll('input.gck-checkbox:not(.gck-youth-cb)')].forEach(cb => {
        cb.parentElement.style.display = visible.has(cb.value) ? '' : 'none';
      });
    }
  });

  disclaimer.appendChild(gearBtn);
  panel.appendChild(disclaimer);

  document.body.appendChild(panel);

  // ツイート折りたたみフラグ
  let tweetsOpen = false;

  // 各サブメニューを閉じる共通関数 (アコーディオン形式)
  const closeAllSubMenus = () => {
    // 1. 直近ツイートを閉じる
    tweetsPanel.classList.remove('open');
    tweetsBtn.classList.remove('active');
    tweetsOpen = false;
    tweetsBtn.textContent = '📜 直近ツイート ▼';

    // 2. 接続元ツールチップを閉じる
    locationTooltip.classList.remove('open');
    locationBtn.classList.remove('active');

    // 3. 信頼度リストを閉じる
    const existingList = panelBody.querySelector('.gck-trust-list');
    if (existingList) existingList.remove();
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

  // 信頼度リストボタン (閉じるロジック等で再定義)
  listBtn.addEventListener('click', () => {
    const wasActive = listBtn.classList.contains('active');
    closeAllSubMenus();
    if (!wasActive) {
      listBtn.classList.add('active');
      showTrustList(panelBody);
    }
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
    const lines = [
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
    showModal(handle, (dmText, relationship, extraInfo, trustLevel, isYouth, localNote) => {
      setCache(handle);
      mainBtn.textContent = '✅ 調査済み（再調査）';
      mainBtn.classList.add('checked');
      const query = buildGrokQuery(handle, dmText, relationship, extraInfo, trustLevel, isYouth, localNote);
      window.open(`https://x.com/i/grok?text=${encodeURIComponent(query)}`, '_blank');
      showWaitingAnimation(panelBody);
    });
  });

  // ツイート折りたたみ
  tweetsBtn.addEventListener('click', () => {
    const nextState = !tweetsOpen;
    closeAllSubMenus();
    if (nextState) {
      tweetsOpen = true;
      tweetsPanel.classList.add('open');
      tweetsBtn.classList.add('active');
      tweetsBtn.textContent = '📜 直近ツイート ▲';
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
