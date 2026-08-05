(function(){
  function syncHeaderHeight(){
    const h = document.querySelector('header.nav');
    if(!h) return;
    document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
  }
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);
  window.addEventListener('orientationchange', syncHeaderHeight);
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(syncHeaderHeight); }

  /* ================= copy buttons ================= */
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.copy-btn');
    if(!btn) return;
    const text = btn.getAttribute('data-copy');
    if(!text) return;
    navigator.clipboard.writeText(text).then(function(){
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function(){ btn.textContent = prev; }, 1400);
    }).catch(function(){});
  });

  /* ================= scroll reveal ================= */
  const revealEls = document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    const io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, {threshold:0.12});
    revealEls.forEach(function(el){ io.observe(el); });
  } else {
    revealEls.forEach(function(el){ el.classList.add('in'); });
  }

  /* ================= quicklook tabs ================= */
  const tabBtns = document.querySelectorAll('.tabbtn');
  tabBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      tabBtns.forEach(function(b){ b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelector('.tab-panel[data-panel="'+btn.dataset.tab+'"]').classList.add('active');
    });
  });

  /* =========================================================
  
     Mini interpreter for the $function language described
     in the docs, powers the live console above.
     ========================================================= */

  class StopSignal extends Error {}

  function splitArgs(inner){
    const args = []; let depth = 0; let cur = '';
    for(let i=0;i<inner.length;i++){
      const ch = inner[i];
      if(ch === '[') depth++;
      if(ch === ']') depth--;
      if(ch === ';' && depth === 0){ args.push(cur); cur = ''; }
      else cur += ch;
    }
    args.push(cur);
    if(args.length === 1 && args[0] === '') return [];
    return args;
  }

  function parse(str){
    const nodes = []; let i = 0; let buf = '';
    while(i < str.length){
      const ch = str[i];
      if(ch === '$' && /[A-Za-z]/.test(str[i+1] || '')){
        if(buf){ nodes.push({t:'text', v:buf}); buf = ''; }
        let j = i + 1; let name = '';
        while(j < str.length && /[A-Za-z]/.test(str[j])){ name += str[j]; j++; }
        if(str[j] === '['){
          let depth = 1; let k = j + 1; const start = k;
          while(k < str.length && depth > 0){
            if(str[k] === '[') depth++;
            else if(str[k] === ']') depth--;
            if(depth > 0) k++;
          }
          const inner = str.slice(start, k);
          nodes.push({t:'fn', name:name, args:splitArgs(inner)});
          i = k + 1;
        } else {
          nodes.push({t:'fn', name:name, args:[]});
          i = j;
        }
      } else {
        buf += ch; i++;
      }
    }
    if(buf) nodes.push({t:'text', v:buf});
    return nodes;
  }

  function splitTop(str, token){ return str.split(token); }

  function evalCondition(raw){
    const str = raw.trim();
    const orParts = splitTop(str, '||');
    if(orParts.length > 1) return orParts.some(function(p){ return evalCondition(p); });
    const andParts = splitTop(str, '&&');
    if(andParts.length > 1) return andParts.every(function(p){ return evalCondition(p); });
    const ops = ['==','!=','>=','<=','>','<'];
    for(const op of ops){
      const idx = str.indexOf(op);
      if(idx > -1){
        const lhs = str.slice(0, idx).trim();
        const rhs = str.slice(idx + op.length).trim();
        const isNum = function(s){ return /^-?\d+(\.\d+)?$/.test(s); };
        const bothNum = isNum(lhs) && isNum(rhs);
        const ln = parseFloat(lhs), rn = parseFloat(rhs);
        switch(op){
          case '==': return bothNum ? ln === rn : lhs === rhs;
          case '!=': return bothNum ? ln !== rn : lhs !== rhs;
          case '>=': return bothNum ? ln >= rn : lhs >= rhs;
          case '<=': return bothNum ? ln <= rn : lhs <= rhs;
          case '>':  return bothNum ? ln > rn  : lhs > rhs;
          case '<':  return bothNum ? ln < rn  : lhs < rhs;
        }
      }
    }
    return str !== '' && str !== 'false' && str !== '0';
  }

  function safeMath(expr){
    let i = 0;
    function peek(){ return expr[i]; }
    function skipWs(){ while(expr[i] === ' ') i++; }
    function parseExpr(){
      skipWs(); let v = parseTerm();
      while(true){
        skipWs(); const c = peek();
        if(c === '+'){ i++; v += parseTerm(); }
        else if(c === '-'){ i++; v -= parseTerm(); }
        else break;
      }
      return v;
    }
    function parseTerm(){
      skipWs(); let v = parseFactor();
      while(true){
        skipWs(); const c = peek();
        if(c === '*'){ i++; v *= parseFactor(); }
        else if(c === '/'){ i++; v /= parseFactor(); }
        else if(c === '%'){ i++; v %= parseFactor(); }
        else break;
      }
      return v;
    }
    function parseFactor(){
      skipWs(); let v = parseUnary();
      skipWs();
      if(peek() === '^'){ i++; v = Math.pow(v, parseFactor()); }
      return v;
    }
    function parseUnary(){
      skipWs();
      if(peek() === '-'){ i++; return -parseUnary(); }
      if(peek() === '+'){ i++; return parseUnary(); }
      return parseAtom();
    }
    function parseAtom(){
      skipWs();
      if(peek() === '('){ i++; const v = parseExpr(); skipWs(); if(peek() === ')') i++; return v; }
      const start = i;
      while(/[0-9.]/.test(peek() || '')) i++;
      const numStr = expr.slice(start, i);
      return numStr ? parseFloat(numStr) : 0;
    }
    try { const r = parseExpr(); return isFinite(r) ? r : 'NaN'; } catch(e){ return 'NaN'; }
  }

  function sleep(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }

  const LAZY = new Set(['if','onlyIf','switch','try','repeat']);

  async function evalTemplate(str, ctx){
    const nodes = parse(str || '');
    let out = '';
    for(const node of nodes){
      if(node.t === 'text'){ out += node.v; }
      else { out += await evalFn(node.name, node.args, ctx); }
    }
    return out;
  }

  async function evalFn(name, rawArgs, ctx){
    if(LAZY.has(name)) return evalLazy(name, rawArgs, ctx);
    const args = [];
    for(const r of rawArgs) args.push(await evalTemplate(r, ctx));
    return evalEager(name, args, ctx);
  }

  async function evalLazy(name, rawArgs, ctx){
    if(name === 'if'){
      const cond = evalCondition(await evalTemplate(rawArgs[0] || '', ctx));
      if(cond) return evalTemplate(rawArgs[1] !== undefined ? rawArgs[1] : '', ctx);
      return rawArgs[2] !== undefined ? evalTemplate(rawArgs[2], ctx) : '';
    }
    if(name === 'switch'){
      const value = await evalTemplate(rawArgs[0] || '', ctx);
      let i = 1;
      while(i + 1 < rawArgs.length){
        const caseVal = await evalTemplate(rawArgs[i], ctx);
        if(caseVal === value) return evalTemplate(rawArgs[i+1], ctx);
        i += 2;
      }
      if(i < rawArgs.length) return evalTemplate(rawArgs[i], ctx);
      return '';
    }
    if(name === 'onlyIf'){
      const cond = evalCondition(await evalTemplate(rawArgs[0] || '', ctx));
      if(!cond){
        if(rawArgs[1] !== undefined){
          const msg = await evalTemplate(rawArgs[1], ctx);
          if(msg) ctx.output(msg);
        }
        throw new StopSignal();
      }
      return '';
    }
    if(name === 'try'){
      try { return await evalTemplate(rawArgs[0] || '', ctx); }
      catch(e){ return rawArgs[1] !== undefined ? evalTemplate(rawArgs[1], ctx) : ''; }
    }
    if(name === 'repeat'){
      const count = Math.min(1000, Math.max(0, parseInt(await evalTemplate(rawArgs[0] || '0', ctx)) || 0));
      let out = '';
      const prev = ctx.loopIndex;
      for(let idx = 0; idx < count; idx++){
        ctx.loopIndex = idx;
        out += await evalTemplate(rawArgs[1] || '', ctx);
      }
      ctx.loopIndex = prev;
      return out;
    }
    return '';
  }

  async function evalEager(name, a, ctx){
    switch(name){
      case 'message': return a[0] !== undefined ? (ctx.messageWords[parseInt(a[0])] || '') : ctx.messageText;
      case 'args': return a[0] !== undefined ? (ctx.args[parseInt(a[0])] || '') : ctx.args.join(' ');
      case 'argsCount': return String(ctx.args.length);
      case 'mention': return '';
      case 'mentionsCount': return '0';
      case 'authorID': return ctx.authorID;
      case 'username': return ctx.username;
      case 'isBot': return 'false';
      case 'channelID': return ctx.channelID;
      case 'channelName': return ctx.channelName;
      case 'serverID': return ctx.serverID;
      case 'serverName': return ctx.serverName;
      case 'prefix': return ctx.prefix;
      case 'ping': return String(ctx.ping);
      case 'loopIndex': return String(ctx.loopIndex || 0);

      case 'sendMessage': ctx.output(a[0] || ''); return '';
      case 'reply': ctx.output(a[0] || '', {reply:true}); return '';
      case 'dm': ctx.output(a[1] || '', {dm:true, to:a[0]}); return '';
      case 'editMessage': ctx.editLast(a[0] || ''); return '';
      case 'deleteMessage': ctx.deleteLast(); return '';
      case 'addReaction': ctx.reactLast(a[0] || ''); return '';
      case 'wait': await sleep(Math.min(parseInt(a[0]) || 0, 2500)); return '';
      case 'startTyping': ctx.setTyping(true); return '';
      case 'stopTyping': ctx.setTyping(false); return '';

      case 'setVar': { const s = a[2] || 'server'; ctx.vars[s] = ctx.vars[s] || {}; ctx.vars[s][a[0]] = a[1]; return ''; }
      case 'getVar': { const s = a[2] || 'server'; const v = ctx.vars[s] && ctx.vars[s][a[0]]; return v !== undefined ? v : (a[1] || ''); }
      case 'addVar': { const s = a[2] || 'server'; ctx.vars[s] = ctx.vars[s] || {}; const cur = parseFloat(ctx.vars[s][a[0]]) || 0; const nv = cur + (parseFloat(a[1]) || 0); ctx.vars[s][a[0]] = String(nv); return String(nv); }
      case 'subVar': { const s = a[2] || 'server'; ctx.vars[s] = ctx.vars[s] || {}; const cur = parseFloat(ctx.vars[s][a[0]]) || 0; const nv = cur - (parseFloat(a[1]) || 0); ctx.vars[s][a[0]] = String(nv); return String(nv); }
      case 'deleteVar': { const s = a[2] || 'server'; if(ctx.vars[s]) delete ctx.vars[s][a[0]]; return ''; }
      case 'hasVar': { const s = a[2] || 'server'; return (ctx.vars[s] && Object.prototype.hasOwnProperty.call(ctx.vars[s], a[0])) ? 'true' : 'false'; }

      case 'math': return String(safeMath(a[0] || ''));
      case 'random': { const lo = parseInt(a[0]) || 0, hi = parseInt(a[1]) || 0; return String(Math.floor(Math.random() * (hi - lo + 1)) + lo); }
      case 'randomText': return a.length ? a[Math.floor(Math.random() * a.length)] : '';
      case 'comment': return '';
      case 'newline': return '\n';

      case 'length': return String((a[0] || '').length);
      case 'substring': return (a[0] || '').slice(parseInt(a[1]) || 0, a[2] !== undefined ? parseInt(a[2]) : undefined);
      case 'replace': return (a[0] || '').split(a[1] || '').join(a[2] !== undefined ? a[2] : '');
      case 'split': { const parts = (a[0] || '').split(a[1] !== undefined ? a[1] : ','); return a[2] !== undefined ? (parts[parseInt(a[2])] || '') : parts.join(','); }
      case 'trim': return (a[0] || '').trim();
      case 'indexOf': return String((a[0] || '').indexOf(a[1] !== undefined ? a[1] : ''));
      case 'includes': return (a[0] || '').includes(a[1] !== undefined ? a[1] : '') ? 'true' : 'false';
      case 'capitalize': { const s = a[0] || ''; return s.charAt(0).toUpperCase() + s.slice(1); }
      case 'upperCase': return (a[0] || '').toUpperCase();
      case 'lowerCase': return (a[0] || '').toLowerCase();
      case 'padStart': return (a[0] || '').padStart(parseInt(a[1]) || 0, a[2] !== undefined ? a[2] : ' ');
      case 'padEnd': return (a[0] || '').padEnd(parseInt(a[1]) || 0, a[2] !== undefined ? a[2] : ' ');
      case 'repeatText': return (a[0] || '').repeat(Math.min(1000, Math.max(0, parseInt(a[1]) || 0)));

      case 'round': { const n = parseFloat(a[0]) || 0; const d = a[1] !== undefined ? parseInt(a[1]) : 0; return String(Number(n.toFixed(d))); }
      case 'floor': return String(Math.floor(parseFloat(a[0]) || 0));
      case 'ceil': return String(Math.ceil(parseFloat(a[0]) || 0));
      case 'abs': return String(Math.abs(parseFloat(a[0]) || 0));
      case 'timestamp': return String(Date.now());
      case 'formatDate': return new Date(a[0] !== undefined ? parseInt(a[0]) : Date.now()).toISOString();

      case 'not': return evalCondition(a[0] || '') ? 'false' : 'true';

      default: return '';
    }
  }

  /* ================= demo console wiring ================= */

  const demoVars = {};
  const consoleBody = document.getElementById('consoleBody');
  const codeInput = document.getElementById('codeInput');
  const msgInput = document.getElementById('msgInput');
  const runBtn = document.getElementById('runBtn');
  const presetSelect = document.getElementById('presetSelect');

  let lastBotBubble = null;
  let typingEl = null;

  const PRESETS = {
    ping: { code: 'Pong! $ping ms', msg: '!ping' },
    say: { code: '$onlyIf[$argsCount>0;You need to give me something to say!]$sendMessage[$args]', msg: '!say hello from the demo console' },
    score: { code: '$if[$args[0]==add;\n  $addVar[score;1;$authorID]You\'re now at $getVar[score;0;$authorID] points!;\n  Your score is $getVar[score;0;$authorID]\n]', msg: '!score add' },
    blank: { code: '', msg: '!' }
  };

  function escapeHTML(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function addBubble(text, cls, whoLabel){
    const div = document.createElement('div');
    div.className = 'bubble ' + cls;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = whoLabel;
    div.appendChild(who);
    const body = document.createElement('span');
    body.className = 'body';
    body.textContent = text;
    div.appendChild(body);
    consoleBody.appendChild(div);
    consoleBody.scrollTop = consoleBody.scrollHeight;
    return div;
  }

  function renderIncoming(text){
    if(!text) return;
    lastBotBubble = null;
    addBubble(text, 'user', 'guest');
  }

  function renderBotOutput(text, opts){
    opts = opts || {};
    const label = opts.dm ? 'bot → dm' : (opts.reply ? 'bot (reply)' : 'bot');
    lastBotBubble = addBubble(text, 'bot', label);
  }

  function renderError(text){
    addBubble(text, 'err', 'error');
  }

  function editLastBubble(text){
    if(lastBotBubble){ lastBotBubble.querySelector('.body').textContent = text; }
  }

  function deleteLastBubble(){
    if(lastBotBubble){ lastBotBubble.remove(); lastBotBubble = null; }
  }

  function reactLastBubble(emoji){
    if(lastBotBubble){
      const r = document.createElement('span');
      r.className = 'react';
      r.textContent = emoji;
      lastBotBubble.appendChild(r);
    }
  }

  function setTypingUI(on){
    if(on && !typingEl){
      typingEl = document.createElement('div');
      typingEl.className = 'typing';
      typingEl.textContent = 'bot is typing…';
      consoleBody.appendChild(typingEl);
      consoleBody.scrollTop = consoleBody.scrollHeight;
    } else if(!on && typingEl){
      typingEl.remove();
      typingEl = null;
    }
  }

  async function runDemo(){
    consoleBody.innerHTML = '';
    lastBotBubble = null;
    typingEl = null;

    const code = codeInput.value;
    const rawMsg = msgInput.value || '';
    const prefix = '!';
    const body = rawMsg.startsWith(prefix) ? rawMsg.slice(prefix.length) : rawMsg;
    const parts = body.trim().split(/\s+/).filter(Boolean);
    const args = parts.slice(1);

    renderIncoming(rawMsg);

    const ctx = {
      args: args,
      messageText: body,
      messageWords: body.split(/\s+/),
      authorID: 'usr_29fk3q',
      username: 'guest',
      channelID: 'chn_general',
      channelName: 'general',
      serverID: 'srv_demo',
      serverName: 'Demo Server',
      prefix: prefix,
      ping: Math.floor(Math.random() * 40 + 12),
      vars: demoVars,
      loopIndex: 0,
      output: function(text, opts){ renderBotOutput(text, opts); },
      editLast: editLastBubble,
      deleteLast: deleteLastBubble,
      reactLast: reactLastBubble,
      setTyping: setTypingUI
    };

    try {
      const result = await evalTemplate(code, ctx);
      if(result && result.trim().length){
        renderBotOutput(result, {reply:true});
      }
    } catch(err){
      if(!(err instanceof StopSignal)){
        renderError('⚠ ' + err.message);
      }
    }
    setTypingUI(false);
  }

  function loadPreset(key){
    const p = PRESETS[key];
    if(!p) return;
    codeInput.value = p.code;
    msgInput.value = p.msg;
    presetSelect.value = key;
    runDemo();
  }

  runBtn.addEventListener('click', runDemo);
  presetSelect.addEventListener('change', function(){ loadPreset(presetSelect.value); });
  document.querySelectorAll('[data-load-preset]').forEach(function(btn){
    btn.addEventListener('click', function(){
      loadPreset(btn.getAttribute('data-load-preset'));
      document.querySelector('.console').scrollIntoView({behavior:'smooth', block:'center'});
    });
  });

  loadPreset('score');

  /* ================= function reference data + filter ================= */

  const REF = [
    {cat:'context', sig:'$message[index?]', desc:'Full message content, or a specific word by index'},
    {cat:'context', sig:'$args[index?]', desc:'All args joined, or one arg by index'},
    {cat:'context', sig:'$argsCount', desc:'Number of args passed to the command'},
    {cat:'context', sig:'$mention[index?]', desc:'Formats a mentioned user\u2019s ID as <@id>'},
    {cat:'context', sig:'$mentionsCount', desc:'Number of users mentioned in the message'},
    {cat:'context', sig:'$authorID', desc:'ID of the message author'},
    {cat:'context', sig:'$username', desc:'Username of the message author'},
    {cat:'context', sig:'$isBot', desc:'"true"/"false" — whether the message author is a bot'},
    {cat:'context', sig:'$channelID / $channelName', desc:'Current channel\u2019s ID / display name'},
    {cat:'context', sig:'$serverID / $serverName', desc:'Current server\u2019s ID / name'},
    {cat:'context', sig:'$prefix', desc:'The prefix that triggered this command'},
    {cat:'context', sig:'$ping', desc:'Client latency in ms'},

    {cat:'actions', sig:'$sendMessage[content;channelID?]', desc:'Sends a message'},
    {cat:'actions', sig:'$reply[content]', desc:'Replies to the triggering message'},
    {cat:'actions', sig:'$deleteMessage[delayMs?]', desc:'Deletes the last sent (or triggering) message'},
    {cat:'actions', sig:'$editMessage[content]', desc:'Edits the last message sent via $sendMessage'},
    {cat:'actions', sig:'$addReaction[emoji]', desc:'Reacts to the last sent (or triggering) message'},
    {cat:'actions', sig:'$dm[userID;content]', desc:'Sends a direct message to a user'},
    {cat:'actions', sig:'$wait[ms]', desc:'Pauses execution'},
    {cat:'actions', sig:'$startTyping / $stopTyping', desc:'Shows/hides the typing indicator in the current channel'},

    {cat:'logic', sig:'$if[condition;then;else?]', desc:'Branches; supports ==, !=, >, <, >=, <=, &&, ||'},
    {cat:'logic', sig:'$not[condition]', desc:'Negates a condition string — "true"/"false"'},
    {cat:'logic', sig:'$switch[value;case1;result1;case2;result2;...;default?]', desc:'Matches value against each case in order; only the matching branch (or default) is evaluated'},
    {cat:'logic', sig:'$onlyIf[condition;errorMessage?]', desc:'Stops the whole command if the condition is false, optionally sending errorMessage first'},
    {cat:'logic', sig:'$stop[message?]', desc:'Unconditionally stops the rest of the command, optionally sending message first'},
    {cat:'logic', sig:'$try[code;fallback?]', desc:'Runs code; if it throws or triggers $stop/$onlyIf, runs fallback instead without halting the outer command'},
    {cat:'logic', sig:'$repeat[count;code]', desc:'Runs code up to count times (max 1000)'},
    {cat:'logic', sig:'$loopIndex', desc:'Current index inside $repeat (0-based)'},

    {cat:'variables', sig:'$setVar[name;value;scope?]', desc:'Stores a value (scope defaults to the server ID)'},
    {cat:'variables', sig:'$getVar[name;fallback?;scope?]', desc:'Reads a value'},
    {cat:'variables', sig:'$addVar[name;amount;scope?] / $subVar[...]', desc:'Increments/decrements a numeric value'},
    {cat:'variables', sig:'$deleteVar[name;scope?]', desc:'Deletes a value'},
    {cat:'variables', sig:'$hasVar[name;scope?]', desc:'"true"/"false"'},

    {cat:'utility', sig:'$math[expression]', desc:'Safe arithmetic: + - * / % ^ ()'},
    {cat:'utility', sig:'$random[min;max]', desc:'Random integer, inclusive'},
    {cat:'utility', sig:'$randomText[a;b;c;...]', desc:'Picks one argument at random'},
    {cat:'utility', sig:'$comment[anything]', desc:'Evaluates to nothing (for notes in your code)'},
    {cat:'utility', sig:'$newline', desc:'Inserts \\n'},
    {cat:'utility', sig:'$length[text]', desc:'Character count'},
    {cat:'utility', sig:'$substring[text;start;end?]', desc:'Slice of text'},
    {cat:'utility', sig:'$replace[text;search;replacement]', desc:'Replaces every occurrence of search'},
    {cat:'utility', sig:'$split[text;separator;index?]', desc:'Splits text; returns one part by index, or all parts comma-joined'},
    {cat:'utility', sig:'$trim[text]', desc:'Removes leading/trailing whitespace'},
    {cat:'utility', sig:'$indexOf[text;search]', desc:'Position of search in text, or -1'},
    {cat:'utility', sig:'$includes[text;search]', desc:'"true"/"false"'},
    {cat:'utility', sig:'$capitalize[text]', desc:'Uppercases the first character'},
    {cat:'utility', sig:'$upperCase[text] / $lowerCase[text]', desc:'Case conversion'},
    {cat:'utility', sig:'$padStart[text;length;padChar?] / $padEnd[...]', desc:'Pads to a fixed length'},
    {cat:'utility', sig:'$repeatText[text;count]', desc:'Repeats text count times (max 1000)'},
    {cat:'utility', sig:'$round[number;decimals?]', desc:'Rounds to decimals places (default 0)'},
    {cat:'utility', sig:'$floor[number] / $ceil[number] / $abs[number]', desc:'Standard math rounding/absolute value'},
    {cat:'utility', sig:'$timestamp', desc:'Current time as unix milliseconds'},
    {cat:'utility', sig:'$formatDate[ms?]', desc:'ISO 8601 string for ms, or the current time if omitted'}
  ];

  const CAT_LABELS = { context:'Context / reading', actions:'Actions', logic:'Logic', variables:'Variables', utility:'Utility' };

  const refList = document.getElementById('refList');
  const refSearch = document.getElementById('refSearch');
  const refEmpty = document.getElementById('refEmpty');
  const refCount = document.getElementById('refCount');
  const chips = document.querySelectorAll('.chip');
  let activeCat = 'all';

  function renderRef(){
    const q = refSearch.value.trim().toLowerCase();
    const filtered = REF.filter(function(r){
      const catOk = activeCat === 'all' || r.cat === activeCat;
      const qOk = !q || r.sig.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q);
      return catOk && qOk;
    });

    refList.innerHTML = '';
    const cats = ['context','actions','logic','variables','utility'];
    let shown = 0;
    cats.forEach(function(cat){
      const rows = filtered.filter(function(r){ return r.cat === cat; });
      if(!rows.length) return;
      const catDiv = document.createElement('div');
      catDiv.className = 'ref-cat';
      const h = document.createElement('h3');
      h.textContent = CAT_LABELS[cat];
      catDiv.appendChild(h);
      rows.forEach(function(r){
        const row = document.createElement('div');
        row.className = 'ref-row';
        const sig = document.createElement('div');
        sig.className = 'sig';
        sig.textContent = r.sig;
        const desc = document.createElement('div');
        desc.className = 'desc';
        desc.textContent = r.desc;
        row.appendChild(sig);
        row.appendChild(desc);
        catDiv.appendChild(row);
        shown++;
      });
      refList.appendChild(catDiv);
    });
    refEmpty.style.display = shown ? 'none' : 'block';
    refCount.textContent = shown + ' / ' + REF.length + ' functions';
  }

  refSearch.addEventListener('input', renderRef);
  chips.forEach(function(chip){
    chip.addEventListener('click', function(){
      chips.forEach(function(c){ c.classList.remove('active'); });
      chip.classList.add('active');
      activeCat = chip.getAttribute('data-cat');
      renderRef();
    });
  });

  renderRef();

})();
