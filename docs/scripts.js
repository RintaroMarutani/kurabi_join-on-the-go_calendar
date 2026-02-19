    (async () => {
      // APIエンドポイントはindex.htmlで定義されたグローバル変数を使用
      const API_ENDPOINT = CALENDAR_API_ENDPOINT;

      // fetchを即座にPromiseとして開始（awaitしない）
      // スケルトンUI構築と並行してデータ取得を進める
      const _fetchPromise = fetch(API_ENDPOINT, { cache: 'default', mode: 'cors' })
        .then(res => res.json())
        .then(json => (json && Array.isArray(json.data)) ? json.data : [])
        .catch(() => null);

      const HOUR_H = 60;
      const tz = 'Asia/Tokyo';

      // グローバル変数: UTMパラメータを保存
      window.receivedUTMParams = {
        utm_source: '',
        utm_medium: '',
        utm_content: ''
      };

      // サーバーサイドから渡されたUTMパラメータを優先的に使用
      if (typeof SERVER_UTM_SOURCE !== 'undefined' && (SERVER_UTM_SOURCE || SERVER_UTM_MEDIUM || SERVER_UTM_CONTENT)) {
        window.receivedUTMParams = {
          utm_source: SERVER_UTM_SOURCE || '',
          utm_medium: SERVER_UTM_MEDIUM || '',
          utm_content: SERVER_UTM_CONTENT || ''
        };
      }

      // Cookieから値を取得するヘルパー関数
      const getCookie = (name) => {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
      };

      // Cookieから UTM パラメータを取得（最優先）
      const cookieUtmSource = getCookie('utm_source');
      const cookieUtmMedium = getCookie('utm_medium');
      const cookieUtmContent = getCookie('utm_content');

      if (cookieUtmSource || cookieUtmMedium || cookieUtmContent) {
        window.receivedUTMParams = {
          utm_source: cookieUtmSource,
          utm_medium: cookieUtmMedium,
          utm_content: cookieUtmContent
        };
      }

      // 最上位フレーム（window.top）のURLを取得してみる
      let topUrl = null;
      try {
        if (window.top && window.top !== window) {
          topUrl = window.top.location.href;
        }
      } catch (e) {
        // クロスオリジン制限
      }

      // 親フレーム（window.parent）のURLを取得してみる
      let parentUrl = null;
      try {
        if (window.parent && window.parent !== window) {
          parentUrl = window.parent.location.href;
        }
      } catch (e) {
        // クロスオリジン制限
      }

      // UTMパラメータを取得する優先順位:
      // 1. window.top.location.href（最上位フレーム）
      // 2. window.parent.location.href（直接の親フレーム）
      // 3. document.referrer
      let utmSource = '';
      let utmMedium = '';
      let utmContent = '';
      let source = '';

      // 方法1: window.topから取得
      if (topUrl) {
        try {
          const url = new URL(topUrl);
          utmSource = url.searchParams.get('utm_source') || '';
          utmMedium = url.searchParams.get('utm_medium') || '';
          utmContent = url.searchParams.get('utm_content') || '';
          if (utmSource || utmMedium || utmContent) {
            source = 'window.top';
          }
        } catch (e) {
          // URL解析エラー
        }
      }

      // 方法2: window.parentから取得
      if (!source && parentUrl) {
        try {
          const url = new URL(parentUrl);
          utmSource = url.searchParams.get('utm_source') || '';
          utmMedium = url.searchParams.get('utm_medium') || '';
          utmContent = url.searchParams.get('utm_content') || '';
          if (utmSource || utmMedium || utmContent) {
            source = 'window.parent';
          }
        } catch (e) {
          // URL解析エラー
        }
      }

      // 方法3: document.referrerから取得
      if (!source && document.referrer) {
        try {
          const referrerUrl = new URL(document.referrer);
          utmSource = referrerUrl.searchParams.get('utm_source') || '';
          utmMedium = referrerUrl.searchParams.get('utm_medium') || '';
          utmContent = referrerUrl.searchParams.get('utm_content') || '';
          if (utmSource || utmMedium || utmContent) {
            source = 'document.referrer';
          }
        } catch (e) {
          // URL解析エラー
        }
      }

      // 方法4: window.location.searchから直接取得（iframe srcのパラメータ）
      if (!source) {
        try {
          const searchParams = new URLSearchParams(window.location.search);
          utmSource = searchParams.get('utm_source') || '';
          utmMedium = searchParams.get('utm_medium') || '';
          utmContent = searchParams.get('utm_content') || '';
          if (utmSource || utmMedium || utmContent) {
            source = 'window.location.search';
          }
        } catch (e) {
          // URL解析エラー
        }
      }

      // 結果を保存
      if (source) {
        window.receivedUTMParams = {
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_content: utmContent
        };
      }

      // postMessageでUTMパラメータを受信（上書き可能）
      window.addEventListener('message', function(event) {
        if (!event.data) {
          return;
        }

        // origin検証: 自身と同一オリジン、または親ページからのメッセージのみ許可
        try {
          const allowedOrigin = window.location.origin;
          const referrerOrigin = document.referrer ? new URL(document.referrer).origin : null;
          if (event.origin !== allowedOrigin && event.origin !== referrerOrigin) {
            return;
          }
        } catch (e) {
          return;
        }

        // UTM_PARAMSタイプのメッセージを処理
        if (event.data.type === 'UTM_PARAMS') {
          window.receivedUTMParams = {
            utm_source: event.data.utm_source || '',
            utm_medium: event.data.utm_medium || '',
            utm_content: event.data.utm_content || ''
          };
        }
      }, false);

      // 親ページにpostMessageリクエストを送信（iframe内の場合）
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'REQUEST_UTM_PARAMS' }, '*');
      }

      // JST基準で日付コンポーネントを取得するヘルパー関数
      // フォーマッターを1回だけ生成してキャッシュ（毎回newするコストを削減）
      const _fmtYear = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, year: 'numeric' });
      const _fmtMonth = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, month: 'numeric' });
      const _fmtDay = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, day: 'numeric' });
      const _fmtWeekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
      const _fmtYMD = new Intl.DateTimeFormat('ja-JP', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const _weekdayIndex = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };

      const getJSTYear = (date) => parseInt(_fmtYear.formatToParts(date).find(p => p.type === 'year').value);
      const getJSTMonth = (date) => parseInt(_fmtMonth.formatToParts(date).find(p => p.type === 'month').value) - 1;
      const getJSTDate = (date) => parseInt(_fmtDay.formatToParts(date).find(p => p.type === 'day').value);
      const getJSTDay = (date) => _weekdayIndex[_fmtWeekday.format(date)] || 0;

      const today0 = () => {
        const [{ value: y }, , { value: m }, , { value: d }] = _fmtYMD.formatToParts(new Date());
        return new Date(y + '-' + m + '-' + d + 'T00:00:00+09:00');
      };
      const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
      const parseJP = (s) => { const [y, m, d] = s.split('/').map(Number); return new Date(y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T00:00:00+09:00'); };
      const atTimeFromYMD = (ymdStr, hm) => {
        const [H, M] = hm.split(':').map(Number);
        const [y, m, d] = ymdStr.split('/').map(Number);
        return new Date(y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') + 'T' + String(H).padStart(2, '0') + ':' + String(M).padStart(2, '0') + ':00+09:00');
      };
      const sameYMD = (a, b) => _fmtYMD.format(a) === _fmtYMD.format(b);

      const fmtHeader = (date, pos, short = false) => {
        if (pos === 0) return 'Today';
        const weekdays = short
          ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const wd = weekdays[getJSTDay(date)];
        const d = String(getJSTDate(date)).padStart(2, '0');
        const m = String(getJSTMonth(date) + 1).padStart(2, '0');
        return wd + ' ' + d + '/' + m;
      };

      // HTMLエスケープ関数（XSS対策）
      const escapeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      };

      // SVGサニタイズ関数（script/イベントハンドラを除去）
      const sanitizeSVG = (svgStr) => {
        if (!svgStr) return '';
        const div = document.createElement('div');
        div.innerHTML = svgStr;
        div.querySelectorAll('script').forEach(el => el.remove());
        div.querySelectorAll('*').forEach(el => {
          for (const attr of [...el.attributes]) {
            if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
          }
        });
        return div.innerHTML;
      };

      const root = document.getElementById('week-calendar');
      root.innerHTML = '';

      const container = document.createElement('div');
      container.className = 'cal-container';
      root.appendChild(container);

      const base = today0();
      const days = [base, addDays(base, 1), addDays(base, 2)];

      let currentDayIndex = 0;
      const mobileNav = document.createElement('div');
      mobileNav.className = 'mobile-nav';
      mobileNav.innerHTML = '<button class="mobile-nav__button" id="prev-day">' +
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff" style="transform: scaleX(-1);">' +
      '<path d="M647-440H200q-17 0-28.5-11.5T160-480q0-17 11.5-28.5T200-520h447L451-716q-12-12-11.5-28t12.5-28q12-11 28-11.5t28 11.5l264 264q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L508-188q-11 11-27.5 11T452-188q-12-12-12-28.5t12-28.5l195-195Z"/>' +
    '</svg>' +
  '</button>' +
  '<div class="mobile-nav__date" id="mobile-date">Today</div>' +
  '<button class="mobile-nav__button" id="next-day">' +
    '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#ffffff">' +
      '<path d="M647-440H200q-17 0-28.5-11.5T160-480q0-17 11.5-28.5T200-520h447L451-716q-12-12-11.5-28t12.5-28q12-11 28-11.5t28 11.5l264 264q6 6 8.5 13t2.5 15q0 8-2.5 15t-8.5 13L508-188q-11 11-27.5 11T452-188q-12-12-12-28.5t12-28.5l195-195Z"/>' +
    '</svg>' +
  '</button>';
      container.appendChild(mobileNav);

      const body = document.createElement('div');
      body.className = 'cal-body';
      container.appendChild(body);

      const timesCol = document.createElement('div');
      timesCol.className = 'cal-times';

      const timesHeader = document.createElement('div');
      timesHeader.className = 'cal-times__header';
      timesCol.appendChild(timesHeader);

      const timesBody = document.createElement('div');
      timesBody.className = 'cal-times__body';

      // 日時フルフォーマッター（nowJSTForClock/nowJST共用）
      const _fmtFull = new Intl.DateTimeFormat('ja-JP', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const _parseFullParts = (date) => {
        const parts = _fmtFull.formatToParts(date);
        const get = (type) => { const p = parts.find(p => p.type === type); return p ? p.value : undefined; };
        return { y: get('year'), m: get('month'), d: get('day'), H: get('hour'), M: get('minute'), S: get('second') };
      };
      const nowJSTForClock = () => {
        const { y, m, d, H, M, S } = _parseFullParts(new Date());
        return new Date(y + '-' + m + '-' + d + 'T' + H + ':' + M + ':' + S + '+09:00');
      };

      const currentTime = nowJSTForClock();
      // UTC時刻 + 9時間 = 日本時間（どの国からアクセスしても正しく計算）
      const currentHour = (currentTime.getUTCHours() + 9) % 24;
      const currentMinute = currentTime.getUTCMinutes();

      const svgDawn = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60.915" height="40.855" viewBox="0 0 60.915 40.855">' +
  '<defs>' +
    '<clipPath id="clip-path">' +
      '<rect id="Rettangolo_52" data-name="Rettangolo 52" width="60.915" height="40.855" fill="#e0926c"/>' +
    '</clipPath>' +
  '</defs>' +
  '<g id="Raggruppa_159" data-name="Raggruppa 159" clip-path="url(#clip-path)">' +
    '<path id="Tracciato_811" data-name="Tracciato 811" d="M67.213,53.156A14.073,14.073,0,0,1,81.271,67.213H53.156A14.073,14.073,0,0,1,67.213,53.156" transform="translate(-36.756 -36.756)" fill="#e0926c"/>' +
    '<path id="Tracciato_812" data-name="Tracciato 812" d="M93.468,11.714a2.344,2.344,0,0,0,2.343-2.343V2.343a2.343,2.343,0,1,0-4.686,0V9.371a2.344,2.344,0,0,0,2.343,2.343" transform="translate(-63.011)" fill="#e0926c"/>' +
    '<path id="Tracciato_813" data-name="Tracciato 813" d="M141.8,36.345a2.334,2.334,0,0,0,1.656-.686l4.97-4.97a2.343,2.343,0,0,0-3.313-3.313l-4.97,4.97a2.343,2.343,0,0,0,1.656,4" transform="translate(-96.428 -18.455)" fill="#e0926c"/>' +
    '<path id="Tracciato_814" data-name="Tracciato 814" d="M32.346,35.659a2.343,2.343,0,0,0,3.313-3.313l-4.971-4.97a2.343,2.343,0,0,0-3.313,3.313Z" transform="translate(-18.455 -18.455)" fill="#e0926c"/>' +
    '<path id="Tracciato_815" data-name="Tracciato 815" d="M58.572,91.125H2.343a2.343,2.343,0,0,0,0,4.686H58.572a2.343,2.343,0,0,0,0-4.686" transform="translate(0 -63.011)" fill="#e0926c"/>' +
    '<path id="Tracciato_816" data-name="Tracciato 816" d="M74.854,117.231H41.431c-.769,0-1.393,1.05-1.393,2.343s.624,2.343,1.393,2.343H74.854c.769,0,1.393-1.05,1.393-2.343s-.624-2.343-1.393-2.343" transform="translate(-27.685 -81.062)" fill="#e0926c"/>' +
  '</g>' +
'</svg>';

      const svgNoon = '<svg id="Raggruppa_162" data-name="Raggruppa 162" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="60.915" height="60.915" viewBox="0 0 60.915 60.915">' +
  '<defs>' +
    '<clipPath id="clip-path-noon">' +
      '<rect id="Rettangolo_53" data-name="Rettangolo 53" width="60.915" height="60.915" fill="#e0926c"/>' +
    '</clipPath>' +
  '</defs>' +
  '<g id="Raggruppa_161" data-name="Raggruppa 161" clip-path="url(#clip-path-noon)">' +
    '<path id="Tracciato_817" data-name="Tracciato 817" d="M67.213,53.156A14.057,14.057,0,1,0,81.271,67.213,14.073,14.073,0,0,0,67.213,53.156" transform="translate(-36.756 -36.756)" fill="#e0926c"/>' +
    '<path id="Tracciato_818" data-name="Tracciato 818" d="M93.468,11.714a2.344,2.344,0,0,0,2.343-2.343V2.343a2.343,2.343,0,1,0-4.686,0V9.371a2.344,2.344,0,0,0,2.343,2.343" transform="translate(-63.011)" fill="#e0926c"/>' +
    '<path id="Tracciato_819" data-name="Tracciato 819" d="M93.468,159.469a2.344,2.344,0,0,0-2.343,2.343v7.029a2.343,2.343,0,1,0,4.686,0v-7.029a2.344,2.344,0,0,0-2.343-2.343" transform="translate(-63.011 -110.269)" fill="#e0926c"/>' +
    '<path id="Tracciato_820" data-name="Tracciato 820" d="M168.84,91.125h-7.029a2.343,2.343,0,1,0,0,4.686h7.029a2.343,2.343,0,1,0,0-4.686" transform="translate(-110.269 -63.011)" fill="#e0926c"/>' +
    '<path id="Tracciato_821" data-name="Tracciato 821" d="M11.714,93.468a2.344,2.344,0,0,0-2.343-2.343H2.343a2.343,2.343,0,0,0,0,4.686H9.371a2.344,2.344,0,0,0,2.343-2.343" transform="translate(0 -63.011)" fill="#e0926c"/>' +
    '<path id="Tracciato_822" data-name="Tracciato 822" d="M141.8,36.345a2.334,2.334,0,0,0,1.656-.686l4.97-4.97a2.343,2.343,0,0,0-3.313-3.313l-4.97,4.97a2.343,2.343,0,0,0,1.656,4" transform="translate(-96.428 -18.455)" fill="#e0926c"/>' +
    '<path id="Tracciato_823" data-name="Tracciato 823" d="M32.346,140.135l-4.97,4.97a2.342,2.342,0,1,0,3.313,3.313l4.971-4.97a2.343,2.343,0,0,0-3.313-3.313" transform="translate(-18.455 -96.425)" fill="#e0926c"/>' +
    '<path id="Tracciato_824" data-name="Tracciato 824" d="M143.451,140.135a2.343,2.343,0,0,0-3.313,3.313l4.971,4.97a2.342,2.342,0,0,0,3.313-3.313Z" transform="translate(-96.428 -96.425)" fill="#e0926c"/>' +
    '<path id="Tracciato_825" data-name="Tracciato 825" d="M32.346,35.659a2.343,2.343,0,0,0,3.313-3.313l-4.971-4.97a2.343,2.343,0,0,0-3.313,3.313Z" transform="translate(-18.455 -18.455)" fill="#e0926c"/>' +
  '</g>' +
'</svg>';

      const svgNight = '<svg id="Raggruppa_164" data-name="Raggruppa 164" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="42.454" height="42.321" viewBox="0 0 42.454 42.321">' +
  '<defs>' +
    '<clipPath id="clip-path-night">' +
      '<rect id="Rettangolo_54" data-name="Rettangolo 54" width="42.454" height="42.321" fill="#e0926c"/>' +
    '</clipPath>' +
  '</defs>' +
  '<g id="Raggruppa_163" data-name="Raggruppa 163" clip-path="url(#clip-path-night)">' +
    '<path id="Tracciato_826" data-name="Tracciato 826" d="M42.454,26.931a.756.756,0,0,0-1.073-.438A18.349,18.349,0,0,1,15.3,1.2.758.758,0,0,0,14.558.01,21.247,21.247,0,0,0,6.2,5.323C-7.212,19.07,2.58,42.3,21.775,42.319c9.186.124,18.5-6.385,20.678-15.388" transform="translate(0 0)" fill="#e0926c"/>' +
    '<path id="Tracciato_827" data-name="Tracciato 827" d="M103.013,27.316l-.869,5.079c-.136.793.572.842,1.1.794l4.565-2.4,4.557,2.4a.759.759,0,0,0,1.1-.794l-.869-5.079,3.688-3.6a.763.763,0,0,0-.423-1.285l-5.094-.741-2.283-4.625a.786.786,0,0,0-1.353,0l-2.283,4.625-5.094.741a.769.769,0,0,0-.423,1.285Z" transform="translate(-79.386 -13.361)" fill="#e0926c"/>' +
  '</g>' +
'</svg>';

      const svgClock = '<svg xmlns="http://www.w3.org/2000/svg" width="46.457" height="46.457" viewBox="0 0 46.457 46.457">' +
  '<g id="clock" transform="translate(0)">' +
    '<path id="Tracciato_787" data-name="Tracciato 787" d="M39.229,62.457A23.229,23.229,0,1,1,62.457,39.229,23.228,23.228,0,0,1,39.229,62.457ZM57.812,39.229A18.583,18.583,0,1,0,39.229,57.812,18.583,18.583,0,0,0,57.812,39.229ZM48.52,36.906a2.323,2.323,0,0,1,0,4.646H41.552a4.659,4.659,0,0,1-4.646-4.646V27.614a2.323,2.323,0,1,1,4.646,0v9.291Z" transform="translate(-16 -16)" fill="#ffa100" fill-rule="evenodd"/>' +
  '</g>' +
'</svg>';

      const timeIcons = [
        { offset: 0.5, svg: svgDawn, label: 'Dawn', type: 'timeOfDay' },
        { offset: 6.5, svg: svgNoon, label: 'Noon', type: 'timeOfDay' },
        { offset: 13.5, svg: svgNight, label: 'Night', type: 'timeOfDay' }
      ];

      let currentOffset = null;

      if ((currentHour === 5 && currentMinute >= 30) || (currentHour >= 6 && currentHour < 21)) {
        const currentMinutesFromStart = (currentHour - 5) * 60 + currentMinute - 30;
        currentOffset = currentMinutesFromStart / 60;
        timeIcons.push({ offset: currentOffset, svg: svgClock, label: 'Current Time', type: 'current' });
      }

      // DocumentFragmentを使用してバッチでDOM追加
      const timeIconsFragment = document.createDocumentFragment();
      timeIcons.forEach(t => {
        const iconDiv = document.createElement('div');
        let className = t.type === 'timeOfDay' ? 'cal-time-icon cal-time-icon--timeOfDay' : 'cal-time-icon';
        if (t.label === 'Night') {
          className += ' cal-time-icon--night';
        }
        iconDiv.className = className;
        const percentPos = (t.offset / 15.5) * 100;
        iconDiv.style.top = percentPos + '%';
        iconDiv.innerHTML = t.svg;
        timeIconsFragment.appendChild(iconDiv);
      });
      timesBody.appendChild(timeIconsFragment);

      timesCol.appendChild(timesBody);
      body.appendChild(timesCol);

      const daysContainer = document.createElement('div');
      daysContainer.className = 'cal-days';
      body.appendChild(daysContainer);

      // DocumentFragmentを使用してヘッダーをバッチで追加
      const headersFragment = document.createDocumentFragment();
      const dayHeaders = [];
      days.forEach((d, i) => {
        const dayHeader = document.createElement('div');
        dayHeader.className = i === 0 ? 'cal-day__header cal-day__header--today' : 'cal-day__header cal-day__header--other';
        dayHeader.textContent = fmtHeader(d, i, window.innerWidth < 1024);
        dayHeader.dataset.dayIndex = i;
        headersFragment.appendChild(dayHeader);
        dayHeaders.push(dayHeader);
      });
      daysContainer.appendChild(headersFragment);

      // 画面幅に応じてヘッダーテキストを更新
      const updateHeaderTexts = () => {
        const useShort = window.innerWidth < 1024;
        dayHeaders.forEach((header, i) => {
          header.textContent = fmtHeader(days[i], i, useShort);
        });
      };

      // リサイズ時にヘッダーテキストを更新（デバウンス付き）
      let resizeTimeout;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateHeaderTexts, 100);
      });

      // DocumentFragmentを使用してボディをバッチで追加
      const bodiesFragment = document.createDocumentFragment();
      const dayCols = days.map((d, i) => {
        const dayBody = document.createElement('div');
        dayBody.className = 'cal-day__body ' + (i === 0 ? 'cal-day--today' : (i === 1 ? 'cal-day--day1' : 'cal-day--day2'));
        dayBody.dataset.dayIndex = i;

        if (i === 0) {
          if ((currentHour === 5 && currentMinute >= 30) || (currentHour >= 6 && currentHour < 21)) {
            const currentMinutesFromStart = (currentHour - 5) * 60 + currentMinute - 30;
            const currentPercentPos = (currentMinutesFromStart / (15.5 * 60)) * 100;

            dayBody.style.background = 'linear-gradient(to bottom, ' +
          'var(--bg-today-past) 0%, ' +
          'var(--bg-today-past) ' + currentPercentPos + '%, ' +
          'var(--bg-today-future) ' + currentPercentPos + '%, ' +
          'var(--bg-today-future) 100%)';
          } else if (currentHour < 5 || (currentHour === 5 && currentMinute < 30)) {
            dayBody.style.background = 'var(--bg-today-future)';
          } else {
            dayBody.style.background = 'var(--bg-today-past)';
          }
        }

        const mobileBorder = document.createElement('div');
        mobileBorder.className = 'cal-day__mobile-border';
        dayBody.appendChild(mobileBorder);

        const dayContent = document.createElement('div');
        dayContent.className = 'cal-day__content';

        dayBody.appendChild(dayContent);

        if (i === 0 && ((currentHour === 5 && currentMinute >= 30) || (currentHour >= 6 && currentHour < 21))) {
          const noonLine = document.createElement('div');
          noonLine.className = 'cal-line--noon';
          const currentMinutesFromStart = (currentHour - 5) * 60 + currentMinute - 30;
          const currentPercentPos = (currentMinutesFromStart / (15.5 * 60)) * 100;
          noonLine.style.top = currentPercentPos + '%';
          dayBody.appendChild(noonLine);
        }
        bodiesFragment.appendChild(dayBody);
        return dayContent;
      });
      daysContainer.appendChild(bodiesFragment);

      const updateMobileDay = () => {
        const allHeaders = daysContainer.querySelectorAll('.cal-day__header');
        const allBodies = daysContainer.querySelectorAll('.cal-day__body');
        allHeaders.forEach(header => header.classList.remove('active'));
        allBodies.forEach(body => body.classList.remove('active'));

        allHeaders[currentDayIndex].classList.add('active');
        allBodies[currentDayIndex].classList.add('active');

        document.body.classList.remove('mobile-view-day0', 'mobile-view-day1', 'mobile-view-day2');
        document.body.classList.add('mobile-view-day' + currentDayIndex);

        const mobileDate = document.getElementById('mobile-date');
        mobileDate.textContent = fmtHeader(days[currentDayIndex], currentDayIndex, true);

        const prevBtn = document.getElementById('prev-day');
        const nextBtn = document.getElementById('next-day');
        prevBtn.disabled = currentDayIndex === 0;
        nextBtn.disabled = currentDayIndex === days.length - 1;
      };

      updateMobileDay();

      document.getElementById('prev-day').addEventListener('click', () => {
        if (currentDayIndex > 0) {
          currentDayIndex--;
          updateMobileDay();
        }
      });

      document.getElementById('next-day').addEventListener('click', () => {
        if (currentDayIndex < days.length - 1) {
          currentDayIndex++;
          updateMobileDay();
        }
      });

      const loading = document.createElement('div');
      loading.className = 'cal-loading';
      loading.innerHTML = '<div class="cal-loading__spinner"></div>';
      container.appendChild(loading);

      // IIFE冒頭で開始したfetchの結果をここでawait（スケルトンUI構築済み）
      let items = [];
      try {
        const fetchResult = await _fetchPromise;
        if (fetchResult === null) {
          // fetchがcatchされた場合（ネットワークエラー等）
          const warn = document.createElement('div');
          warn.style.color = '#b91c1c'; warn.style.margin = '10px 0'; warn.style.padding = '12px';
          warn.textContent = 'Failed to load data. Please check your connection and try again.';
          root.insertBefore(warn, container);
        } else {
          items = fetchResult;
        }
      } catch (e) {
        const warn = document.createElement('div');
        warn.style.color = '#b91c1c'; warn.style.margin = '10px 0'; warn.style.padding = '12px';
        warn.textContent = 'Failed to load data. Please check your connection and try again.';
        root.insertBefore(warn, container);
      } finally {
        if (loading.parentNode) {
          loading.parentNode.removeChild(loading);
        }
      }

      const g = (o, k) => {
        if (o && o[k] !== undefined) return o[k];
        if (o && o[k.trim()] !== undefined) return o[k.trim()];
        return undefined;
      };
      const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

      const nowJST = () => {
        const { y, m, d, H, M, S } = _parseFullParts(new Date());
        return new Date(y + '-' + m + '-' + d + 'T' + H + ':' + M + ':' + S + '+09:00');
      };

      const now = nowJST();
      const eventsByDay = [[], [], []];

      (items || []).forEach(ev => {
        if (!g(ev, '開催日') || !g(ev, '開始時間') || !g(ev, '終了時間')) return;

        const ymdStr = g(ev, '開催日');
        const baseDay = parseJP(ymdStr);
        const st = atTimeFromYMD(ymdStr, g(ev, '開始時間'));
        let en = atTimeFromYMD(ymdStr, g(ev, '終了時間'));
        if (en <= st) en = new Date(en.getTime() + 86400000);

        const parts = [];
        const endOfStart = new Date(baseDay.getTime() + 86400000);
        if (en <= endOfStart) {
          parts.push({ d: new Date(baseDay), s: new Date(st), e: new Date(en) });
        } else {
          parts.push({ d: new Date(baseDay), s: new Date(st), e: endOfStart });
          const next = new Date(baseDay.getTime() + 86400000);
          const nextEnd = (en - next > 86400000) ? new Date(next.getTime() + 86400000) : en;
          parts.push({ d: next, s: next, e: nextEnd });
        }

        parts.forEach(p => {
          const idx = days.findIndex(D => sameYMD(D, p.d));
          if (idx === -1) return;

          // UTC時刻 + 9時間 = 日本時間（どの国からアクセスしても正しく計算）
          const jstHours = (p.s.getUTCHours() + 9) % 24;
          const jstMinutes = p.s.getUTCMinutes();
          const mins = jstHours * 60 + jstMinutes - 330;
          const dur = Math.max(1, (p.e - p.s) / 60000);
          const totalMins = 15.5 * 60;

          const topPercent = clamp((mins / totalMins) * 100, 0, 100);
          const heightPercent = Math.max((dur / totalMins) * 100, 3);
          const safeHeightPercent = Math.max(1, Math.min(heightPercent, 100 - topPercent - 0.2));

          const card = document.createElement('div');
          let className = 'cal-event';

          if (safeHeightPercent < 2.5) {
            className += ' cal-event--tiny';
          } else if (safeHeightPercent < 5) {
            className += ' cal-event--small';
          }

          const title = g(ev, 'タイトル') || '';
          const timeStr = g(ev, '開始時間') + ' - ' + g(ev, '終了時間');

          const remainingSpots = g(ev, '参加可能な人数');

          const thirtyMinutesBeforeStart = new Date(p.s.getTime() - 30 * 60 * 1000);
          const isPast = now > thirtyMinutesBeforeStart;
          const isFull = remainingSpots !== undefined && remainingSpots !== null && remainingSpots !== '' && Number(remainingSpots) === 0;
          if (isPast || isFull) {
            className += ' cal-event--inactive';
          }

          card.className = className;
          // cssTextで一括設定してリフロー削減
          card.style.cssText = 'top:' + topPercent + '%;min-height:' + safeHeightPercent + '%;cursor:pointer;';

          const eventIconSvg = g(ev, 'SVG');

          let iconHtml = '';
          let hasIcon = false;

          if (eventIconSvg && eventIconSvg.trim() !== '') {
            iconHtml = '<div class="cal-event__icon">' +
            sanitizeSVG(eventIconSvg) +
          '</div>';
            hasIcon = true;
          }

          let spotsHtml = '';
          if (remainingSpots !== undefined && remainingSpots !== null && remainingSpots !== '') {
            spotsHtml = '<div class="cal-event__spots">' +
            'Remaining spots: ' + escapeHTML(remainingSpots) +
            '<svg viewBox="0 0 24 24">' +
              '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>' +
            '</svg>' +
          '</div>';
          }

          card.innerHTML = spotsHtml +
        iconHtml +
        '<div class="cal-event__content">' +
          '<div class="cal-event__title">' + escapeHTML(title) + '</div>' +
          '<div class="cal-event__time">' + escapeHTML(timeStr) + '</div>' +
        '</div>';

          card.addEventListener('click', () => {
            openEventModal(ev, title, timeStr, p.s, eventIconSvg);
          });

          const distanceFromNow = Math.abs(p.s - now);

          eventsByDay[idx].push({
            card,
            start: p.s,
            end: p.e,
            topPercent,
            heightPercent: safeHeightPercent,
            distanceFromNow,
            duration: dur
          });
        });
      });

      eventsByDay.forEach((dayEvents, dayIdx) => {
        if (dayEvents.length === 0) return;

        dayEvents.sort((a, b) => a.start - b.start);

        // 最適化: 各グループの最大終了時刻を追跡してO(n²)からO(n*g)に削減
        const groups = [];
        const groupMaxEnds = []; // 各グループの最大終了時刻

        dayEvents.forEach(event => {
          let foundGroupIdx = -1;

          // イベントは開始時刻順にソート済みなので、
          // グループの最大終了時刻と比較するだけでOK
          for (let i = 0; i < groups.length; i++) {
            if (event.start < groupMaxEnds[i]) {
              // 重なりあり
              foundGroupIdx = i;
              break;
            }
          }

          if (foundGroupIdx !== -1) {
            groups[foundGroupIdx].push(event);
            // グループの最大終了時刻を更新
            if (event.end > groupMaxEnds[foundGroupIdx]) {
              groupMaxEnds[foundGroupIdx] = event.end;
            }
          } else {
            groups.push([event]);
            groupMaxEnds.push(event.end);
          }
        });

        groups.forEach(group => {
          const columns = [];
          group.forEach(event => {
            let placed = false;
            for (let col of columns) {
              const lastEventInCol = col[col.length - 1];
              if (lastEventInCol.end <= event.start) {
                col.push(event);
                placed = true;
                break;
              }
            }
            if (!placed) {
              columns.push([event]);
            }
          });

          const numColumns = columns.length;

          columns.forEach((col, colIdx) => {
            col.forEach(event => {
              const widthPercent = 100 / numColumns;
              const leftPercent = (colIdx * widthPercent);
              const gap = 2;

              const actualLeft = colIdx === 0 ? leftPercent : leftPercent + (gap / 2);
              const actualWidth = colIdx === numColumns - 1
                ? widthPercent - (colIdx === 0 ? 0 : gap / 2)
                : widthPercent - (colIdx === 0 ? gap / 2 : gap);

              // cssTextで一括設定してリフロー削減
              const currentCss = event.card.style.cssText;
              event.card.style.cssText = currentCss + 'left:' + actualLeft + '%;width:' + actualWidth + '%;right:auto;';

              if (numColumns >= 2) {
                const currentHeight = event.card.style.height;
                // cssTextで一括設定してリフロー削減
                const css = event.card.style.cssText;
                event.card.style.cssText = css + 'min-height:' + currentHeight + ';height:auto;';

                if (numColumns >= 3) {
                  event.card.classList.add('cal-event--very-narrow');
                } else {
                  event.card.classList.add('cal-event--narrow');
                }
              }
            });
          });
        });

        // 時刻が遅いものほどz-indexが高くなるようにソート（開始時刻の昇順）
        dayEvents.sort((a, b) => a.start - b.start);

        // DocumentFragmentを使用してバッチでDOM追加、zIndexもcssTextで設定
        const dayFragment = document.createDocumentFragment();
        dayEvents.forEach((event, i) => {
          const css = event.card.style.cssText;
          event.card.style.cssText = css + 'z-index:' + (i + 1) + ';';
          dayFragment.appendChild(event.card);
        });
        dayCols[dayIdx].appendChild(dayFragment);
      });

      function convertDriveLink(url) {
        if (!url || url.trim() === '') {
          return null;
        }

        if (url.includes('drive.google.com/uc?export=view')) {
          return url;
        }

        if (url.includes('drive.google.com/thumbnail?')) {
          return url;
        }

        if (url.includes('drive.google.com/uc?export=download')) {
          return url;
        }

        let fileId = null;

        let match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
          fileId = match[1];
        }

        if (!fileId) {
          match = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            fileId = match[1];
          }
        }

        if (!fileId) {
          match = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            fileId = match[1];
          }
        }

        if (fileId) {
          const newUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=s600';
          return newUrl;
        }

        return url;
      }

      // プレースホルダー画像URL
      const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/600x400/cccccc/666666?text=Image+Not+Available';

      // プリロード済み画像のキャッシュ
      const preloadedImageCache = new Map();

      // 画像プリロード関数（バックグラウンドで実行）
      function preloadImage(url) {
        if (!url || preloadedImageCache.has(url)) return;

        const img = new Image();
        img.onload = () => {
          preloadedImageCache.set(url, { success: true, url: url });
        };
        img.onerror = () => {
          preloadedImageCache.set(url, { success: false, url: url });
        };
        img.src = url;
      }

      // 全イベントの画像をバックグラウンドでプリロード
      function preloadAllEventImages(events) {
        // requestIdleCallback がサポートされていればアイドル時に実行
        const preloadBatch = () => {
          events.forEach(ev => {
            const photo1 = convertDriveLink(g(ev, '写真1'));
            if (photo1) preloadImage(photo1);
          });
        };

        if ('requestIdleCallback' in window) {
          requestIdleCallback(preloadBatch, { timeout: 3000 });
        } else {
          // フォールバック: 500ms後に実行
          setTimeout(preloadBatch, 500);
        }
      }

      // カレンダー表示後にプリロードを開始
      preloadAllEventImages(items);

      function openEventModal(eventData, title, timeStr, startDate, eventIconSvg) {
        const modal = document.getElementById('event-modal');

        const url = new URL(window.location);
        url.searchParams.set('modal', 'open');
        url.searchParams.set('event', encodeURIComponent(title));
        history.pushState({ modalOpen: true, eventTitle: title }, '', url);

        document.getElementById('modal-title').textContent = title;

        const modalIcon = document.getElementById('modal-icon');
        if (eventIconSvg && eventIconSvg.trim() !== '') {
          modalIcon.innerHTML = sanitizeSVG(eventIconSvg);
          modalIcon.style.display = '';
        } else {
          modalIcon.style.display = 'none';
          modalIcon.innerHTML = '';
        }

        const today = today0();
        const tomorrow = addDays(today, 1);

        // モーダル表示用のdateText（Today/Tomorrow表示）
        let modalDateText = '';
        if (sameYMD(startDate, today)) {
          modalDateText = 'Today';
        } else if (sameYMD(startDate, tomorrow)) {
          modalDateText = 'Tomorrow';
        } else {
          const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][getJSTDay(startDate)];
          const d = String(getJSTDate(startDate)).padStart(2, '0');
          const m = String(getJSTMonth(startDate) + 1).padStart(2, '0');
          modalDateText = wd + ' ' + d + '/' + m;
        }
        document.getElementById('modal-date').textContent = modalDateText;

        // WhatsApp用のdateText（常に日付形式）
        const wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][getJSTDay(startDate)];
        const d = String(getJSTDate(startDate)).padStart(2, '0');
        const m = String(getJSTMonth(startDate) + 1).padStart(2, '0');
        const dateText = wd + ' ' + d + '/' + m;

        document.getElementById('modal-time').textContent = timeStr;

        const location = g(eventData, '集合場所') || 'Location to be announced';
        document.getElementById('modal-location').textContent = location;

        const formatPriceWithCommas = (priceText) => {
          if (!priceText) return priceText;
          const str = String(priceText);
          return str.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,');
        };

        const price = g(eventData, '料金') || '¥3,000';
        document.getElementById('modal-price').textContent = formatPriceWithCommas(price) + ' per person';

        const subtitle = g(eventData, 'サブタイトル') || 'Join an authentic experience!';
        document.getElementById('modal-subtitle').textContent = subtitle;

        const detailsList = document.getElementById('modal-details');
        const detailItems = [];

        const flow = g(eventData, '体験の流れ');
        const features = g(eventData, '体験の特徴');
        const includes = g(eventData, '含まれるもの');

        if (flow) {
          flow.split('\n').filter(item => item.trim()).forEach(item => {
            detailItems.push(item);
          });
        }
        if (features) {
          features.split('\n').filter(item => item.trim()).forEach(item => {
            detailItems.push(item);
          });
        }
        if (includes) {
          includes.split('\n').filter(item => item.trim()).forEach(item => {
            detailItems.push(item);
          });
        }

        if (detailItems.length > 0) {
          detailsList.innerHTML = detailItems.map(item => '<li>' + escapeHTML(item) + '</li>').join('');
        } else {
          detailsList.innerHTML = '<li>Experience details will appear here</li>';
        }

        const photo1Url = g(eventData, '写真1');
        const photo2Url = g(eventData, '写真2');
        const photo3Url = g(eventData, '写真3');

        const photo1 = convertDriveLink(photo1Url);
        const photo2 = convertDriveLink(photo2Url);
        const photo3 = convertDriveLink(photo3Url);

        const photos = [];
        const originalUrls = [];

        if (photo1) {
          photos.push(photo1);
          originalUrls.push(photo1Url);
        }
        if (photo2) {
          photos.push(photo2);
          originalUrls.push(photo2Url);
        }
        if (photo3) {
          photos.push(photo3);
          originalUrls.push(photo3Url);
        }

        const modalImageContainer = document.querySelector('.modal-image-container');

        modalImageContainer.style.display = 'none';

        const showModal = () => {
          modal.style.display = 'flex';
          modal.offsetHeight;
          requestAnimationFrame(() => {
            modal.classList.add('active');
          });

          // モバイルでのスクロールを防止
          document.body.style.overflow = 'hidden';
        };

        if (photos.length === 0) {
          modalImageContainer.style.display = 'none';
          showModal();
        } else {

          let currentPhotoIndex = 0;
          const modalImage = document.getElementById('modal-image');
          const dotsContainer = document.querySelector('.modal-image-dots');

          // 最適化: シンプルなエラーハンドリング
          modalImage.onerror = function () {
            this.src = PLACEHOLDER_IMAGE;
            this.alt = '画像を読み込めませんでした';
            this.classList.remove('loading');
            // プレースホルダーが表示された場合は画像コンテナを非表示
            if (this.src === PLACEHOLDER_IMAGE) {
              modalImageContainer.style.display = 'none';
            }
          };

          modalImage.onload = function () {
            this.classList.remove('loading');
            modalImageContainer.style.display = 'block';
          };

          // モーダルを即座に表示（画像読み込みを待たない）
          showModal();

          // プリロード済みキャッシュを確認
          const cachedFirst = preloadedImageCache.get(photos[0]);
          if (cachedFirst && cachedFirst.success) {
            modalImage.src = photos[0];
            modalImageContainer.style.display = 'block';
          } else {
            // 非同期で画像を読み込み（モーダル表示をブロックしない）
            modalImage.src = photos[0];
          }

          modalImage.classList.add('loading');

          const switchImage = (index) => {
            modalImage.classList.add('fade-out');

            setTimeout(() => {
              currentPhotoIndex = index;
              modalImage.classList.add('loading');
              delete modalImage.dataset.fallbackIndex;
              modalImage.src = photos[index];

              dotsContainer.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
              dotsContainer.querySelectorAll('.dot')[index].classList.add('active');

              modalImage.classList.remove('fade-out');
            }, 300);
          };

          dotsContainer.innerHTML = '';
          photos.forEach((photo, index) => {
            const dot = document.createElement('span');
            dot.className = 'dot' + (index === 0 ? ' active' : '');
            dot.addEventListener('click', () => {
              switchImage(index);
              if (window.modalSlideShowInterval) {
                clearInterval(window.modalSlideShowInterval);
                startSlideShow();
              }
            });
            dotsContainer.appendChild(dot);
          });

          if (photos.length === 1) {
            dotsContainer.style.display = 'none';
          } else {
            dotsContainer.style.display = 'flex';
          }

          const startSlideShow = () => {
            if (window.modalSlideShowInterval) {
              clearInterval(window.modalSlideShowInterval);
            }

            if (photos.length > 1) {
              window.modalSlideShowInterval = setInterval(() => {
                currentPhotoIndex = (currentPhotoIndex + 1) % photos.length;
                switchImage(currentPhotoIndex);
              }, 3000);
            }
          };

          startSlideShow();
        }

        const mapsLink = document.getElementById('modal-maps-link');
        const mapsContainer = document.getElementById('modal-maps-container');
        const mapsIframe = document.getElementById('modal-maps-iframe');

        if (location && location !== 'Location to be announced') {
          mapsLink.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);

          // Google Maps Embed URL
          const embedUrl = 'https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=' + encodeURIComponent(location);
          mapsIframe.src = embedUrl;
          mapsContainer.style.display = 'block';
        } else {
          mapsLink.href = '#';
          mapsContainer.style.display = 'none';
        }

        // WhatsAppボタンの設定（whatsapp.htmlで定義された関数を使用）
        setupWhatsAppButton({
          whatsappNumber: WHATSAPP_NUMBER,
          logEndpoint: CALENDAR_API_ENDPOINT,
          title: title,
          dateText: dateText,
          timeStr: timeStr,
          price: price
        });

      }

      function closeModal(skipHistory = false) {
        const modal = document.getElementById('event-modal');
        if (window.modalSlideShowInterval) {
          clearInterval(window.modalSlideShowInterval);
        }
        modal.classList.remove('active');
        setTimeout(() => {
          modal.style.display = 'none';
        }, 300);

        if (!skipHistory) {
          const url = new URL(window.location);
          url.searchParams.delete('modal');
          url.searchParams.delete('event');
          history.pushState({}, '', url);
        }

        // スクロールを元に戻す
        document.body.style.overflow = '';
      }

      document.getElementById('modal-close').addEventListener('click', () => closeModal());

      document.getElementById('modal-back').addEventListener('click', () => closeModal());

      document.getElementById('event-modal').addEventListener('click', (e) => {
        if (e.target.id === 'event-modal') {
          closeModal();
        }
      });

      window.addEventListener('popstate', (event) => {
        const modal = document.getElementById('event-modal');
        const url = new URL(window.location);
        const modalParam = url.searchParams.get('modal');

        if (modalParam === 'open') {
        } else {
          if (modal.classList.contains('active')) {
            closeModal(true);
          }
        }
      });

    })();
