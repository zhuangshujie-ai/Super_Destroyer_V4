// Super Destroyer — Fire Control
// 游戏逻辑：所有图片素材存放在 assets/ 文件夹。
// ==================== 中文学习批注 / 阅读指南 ====================
// 建议阅读顺序：变量与战备资料 → start() 初始化 → tick() 游戏循环 → input()/deploy() → draw() 页面刷新。
// function 用来定义可重复调用的功能；let 定义可以重新赋值的变量；const 定义不能重新赋值的绑定。
// 对象如 {x: 24, y: 24} 用于保存一组相关信息；数组如 [] 用于保存多项信息。
// 图片放在 assets 文件夹里。ART 和 MISSION_ART 保存图片文件路径，方便替换和维护。

   const ART = {
  "laser": "assets/stratagem_laser.svg",
  "precision": "assets/stratagem_precision.svg",
  "380": "assets/stratagem_380.svg",
  "gatling": "assets/stratagem_gatling.svg",
  "resupply": "assets/stratagem_resupply.svg",
  "reinforce": "assets/stratagem_reinforce.svg",
  "skull": "assets/stratagem_skull.png"
};
const MISSION_ART = {
  "extraction": "assets/extraction.png",
  "extraction_unavailable": "assets/extraction_unavailable.png",
  "mission1": "assets/mission1.png",
  "mission1_complete": "assets/mission1_complete.png",
  "mission2": "assets/mission2.png",
  "mission2_complete": "assets/mission2_complete.png"
};
// $ 是取得 HTML 元素的快捷函数，例如 $('map')；arrows 把 U/D/L/R 转换成可见箭头。
const $ = id => document.getElementById(id);
const arrows = { U: '↑', D: '↓', L: '←', R: '→' };
const code = c => c.split('').map(a => arrows[a]).join(' ');
// 战备配置列表：id 是识别名称，key 是正确指令，kind 区分攻击(red)和支援(blue)。
const specs = [{ id: 'laser', name: 'Orbital Laser', key: 'RDURD', kind: 'red', short: 'LASER' }, { id: 'precision', name: 'Orbital Precision Strike', key: 'RRU', kind: 'red', short: 'PRECISION' }, { id: '380', name: 'Orbital 380mm HE Barrage', key: 'RDUULDD', kind: 'red', short: '380MM' }, { id: 'gatling', name: 'Orbital Gatling Barrage', key: 'RDLUU', kind: 'red', short: 'GATLING' }, { id: 'resupply', name: 'Resupply', key: 'DDUR', kind: 'blue', short: 'RESUPPLY' }, { id: 'reinforce', name: 'Reinforce', key: 'UDRLU', kind: 'blue', short: 'REINFORCE' }];
// 把内嵌的骷髅 Logo 图片设置到网页对应的 <img> 标签。
$('skull').src = ART.skull;
$('overlay-skull').src = ART.skull;
$('codex').innerHTML = specs.map(s => `<div class="item"><img src="${ART[s.id]}"><div><div class="type">${s.kind === 'red' ? 'OFFENSIVE' : 'SUPPORT'}</div><b>${s.name}</b><div class="code">${code(s.key)}</div><div class="cooldown" id="cd-${s.id}"></div></div></div>`).join('');
// 通用工具函数：随机数、随机选取、限制坐标范围、计算距离、格式化坐标。
const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)], clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), near = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)), coord = p => String(p.x + 1).padStart(2, '0') + ',' + String(p.y + 1).padStart(2, '0');
// g 保存整局游戏状态；timer 保存定时器；reticle 是准星坐标；typed 是已输入的指令。
let g = null, timer = null, reticle = { x: 24, y: 24 }, typed = '', counter = 0;
// 统计普通战备数量；reinforce 增援不计入最多 3 个的上限。
const normalCount = () => g.requests.filter(r => r.spec.id !== 'reinforce').length;
// 判断指定 id 的战备请求是否已经存在，避免生成重复增援或补给。
const has = id => g.requests.some(r => r.spec.id === id);
// 只要存在蓝色支援信标，小队就暂停移动或执行任务。
const blocked = () => g.requests.some(r => r.spec.kind === 'blue');
// 更新操作日志：unshift 放到数组开头，slice 只保留最近 8 条。
function log(s) { g.logs.unshift(s); g.logs = g.logs.slice(0, 8); }
// 设置地图下方的提示文案，真正显示出来由 draw() 负责。
function say(s) { g.message = s; }
// 随机生成地图坐标，并尽量与已经存在的地点保持一定距离。
function pos(used, min = 12) { for (let i = 0; i < 1000; i++) {
    const p = { x: 3 + rnd(44), y: 3 + rnd(44) };
    if (used.every(t => distance(t, p) > min))
        return p;
} return { x: rnd(50), y: rnd(50) }; }
// 固定寻路顺序：Mission 1 完成前去 Mission 1；之后去 Mission 2；最后去撤离点。
function target() { return g.objectives[0].done ? (g.objectives[1].done ? g.evac : g.objectives[1]) : g.objectives[0]; }
// 计算下一个战备的生成间隔：V4 基础间隔增加约 60%；任务驻留时仍会更频繁。
function spawnDelay() { return (6.4 + Math.random() * 4.0) * 4 / Math.max(1, g.alive) * ((g.phase === 'objective' || g.phase === 'evac') ? .57 : 1); }
// 开始新任务：清除旧计时器，随机生成两项任务、撤离点和小队出生点。
function start() {
    if (timer)
        clearInterval(timer);
    // a=Mission 1，b=Mission 2，e=Extraction；它们都在 50×50 地图上随机生成。
    let a = pos([]), b = pos([a], 16), e = pos([a, b], 14);
    let team = null;
    // 重复尝试出生点，必须保证小队离 Mission 1 比 Mission 2 更近。
    for (let tries = 0; tries < 2000; tries++) {
        const p = pos([], 0);
        if (distance(p, a) < distance(p, b) && distance(p, a) >= 5 && distance(p, e) >= 8) {
            team = p;
            break;
        }
    }
    if (!team) {
        const options = [];
        for (let y = 2; y < 48; y++)
            for (let x = 2; x < 48; x++) {
                const p = { x, y };
                if (distance(p, a) < distance(p, b) && distance(p, a) >= 4)
                    options.push(p);
            }
        team = pick(options);
    }
    // 初始化所有游戏状态：任务是否完成、存活人数、失败次数、冷却、倒计时等。
    g = { objectives: [{ ...a, id: 'mission1', done: false }, { ...b, id: 'mission2', done: false }], evac: e, team, alive: 4, errors: 0, requests: [], cd: { resupply: 0, '380': 0 }, phase: 'march', hold: 0, moving: 0, elapsed: 0, spawnElapsed: 0, spawnNext: 5, logs: [], message: 'OPERATION STARTED. TRACK INCOMING REQUESTS.', checkedEvac: false, active: true, paused: false };
    g.spawnNext = spawnDelay();
    counter = 0;
    typed = '';
    reticle = { x: 24, y: 24 };
    $('overlay').style.display = 'none';
    $('pause').textContent = 'Ⅱ PAUSE';
    log('Helldiver squad deployed.');
    draw();
    // 每 100 毫秒调用一次 tick()，持续推进游戏时间（相当于每秒调用 10 次）。
    timer = setInterval(tick, 100);
}
// 为新战备寻找生成位置：尽量靠近小队，但避免重叠小队、任务点和已有信标。
function requestPos() { for (let i = 0; i < 400; i++) {
    let p = { x: clamp(g.team.x + rnd(27) - 13, 0, 49), y: clamp(g.team.y + rnd(27) - 13, 0, 49) };
    if (near(p, g.team) < 2 || near(p, g.team) > 13 || g.requests.some(q => near(q, p) <= 2) || g.objectives.some(o => near(o, p) <= 1) || near(g.evac, p) <= 1)
        continue;
    return p;
} return null; }
// 将一个战备加入地图；普通战备最多 3 个，增援不限时且不占这 3 个名额。
function addRequest(spec) { if (spec.id === 'reinforce') {
    if (has('reinforce'))
        return false;
}
else if (normalCount() >= 3)
    return false; if (spec.id === '380' && (g.cd['380'] > 0 || has('380')))
    return false; if (spec.id === 'resupply' && (g.cd.resupply > 0 || has('resupply')))
    return false; const p = requestPos(); if (!p)
    return false; g.requests.push({ ...p, id: ++counter, spec, remaining: spec.id === 'reinforce' ? null : 30 }); say('REQUEST: ' + spec.name.toUpperCase() + ' / ' + coord(p)); log('New request: ' + spec.name + ' @ ' + coord(p)); return true; }
// 随机选战备：任务执行期间偏向红色攻击；撤离期间偏向蓝色支援。
function randomRequest() { if (normalCount() >= 3)
    return; const reds = specs.filter(s => s.kind === 'red' && (s.id !== '380' || (g.cd['380'] <= 0 && !has('380')))); const blues = specs.filter(s => s.id === 'resupply' && g.cd.resupply <= 0 && !has('resupply')); const blueRate = g.phase === 'evac' ? .84 : g.phase === 'objective' ? .2 : .4; let pool = Math.random() < blueRate && blues.length ? blues : reds; if (pool.length)
    addRequest(pick(pool)); }
// 到达任务点后切换到驻留阶段；到达撤离点后开始等候 Pelican-1。
function arrive() { if (g.objectives.some(o => !o.done && o.x === g.team.x && o.y === g.team.y)) {
    g.phase = 'objective';
    g.hold = 0;
    say('SECURING OBJECTIVE. OFFENSIVE REQUESTS INCREASED.');
    log('Securing ' + (g.objectives[0].done ? 'MISSION 2' : 'MISSION 1') + '.');
}
else {
    g.phase = 'evac';
    g.hold = 0;
    say('EXTRACTION COMMENCED. SUPPORT REQUESTS INCREASED.');
    log('Reached extraction.');
    if (!g.checkedEvac) {
        g.checkedEvac = true;
        if (g.cd.resupply <= 0 && !has('resupply') && normalCount() < 3)
            addRequest(specs[4]);
        else
            log('Extraction Resupply suppressed: cooldown or full capacity.');
    }
} }
// 小队每次向 target() 所指的目标推进一格，到达目的地时执行 arrive()。
function moveTeam() { const t = target(); if (g.team.x !== t.x)
    g.team.x += Math.sign(t.x - g.team.x);
else if (g.team.y !== t.y)
    g.team.y += Math.sign(t.y - g.team.y); if (g.team.x === t.x && g.team.y === t.y)
    arrive(); }
// 核心游戏循环：更新时钟、战备 30 秒期限、冷却、小队行动和新战备生成。
function tick() {
    if (!g?.active || g.paused)
        return;
    // dt=0.1 秒；每次 tick 都用 dt 扣减剩余时间。
    const dt = .1;
    g.elapsed += dt;
    for (const k of ['380', 'resupply'])
        g.cd[k] = Math.max(0, g.cd[k] - dt);
    const expired = g.requests.filter(r => r.remaining !== null && r.remaining - dt <= 0);
    g.requests.forEach(r => { if (r.remaining !== null)
        r.remaining -= dt; });
    if (expired.length) {
        g.requests = g.requests.filter(r => !expired.includes(r));
        g.errors += expired.length;
        expired.forEach(r => log('TIMEOUT ' + r.spec.name));
        typed = '';
        say('REQUEST EXPIRED. ERROR ' + g.errors + '/3');
        if (g.errors >= 3) {
            finish(false);
            return;
        }
    }
    if (!blocked()) {
        if (g.phase === 'march') {
            g.moving += dt;
            const step = .35 * 4 / Math.max(1, g.alive);
            while (g.moving >= step && g.phase === 'march') {
                g.moving -= step;
                moveTeam();
            }
        }
        else {
            g.hold += dt;
            const duration = g.phase === 'objective' ? 8 : 13;
            if (g.hold >= duration) {
                if (g.phase === 'objective') {
                    const ob = g.objectives.find(o => !o.done && o.x === g.team.x && o.y === g.team.y);
                    if (ob)
                        ob.done = true;
                    g.phase = 'march';
                    g.hold = 0;
                    say('OBJECTIVE SECURED. PROCEED TO NEXT WAYPOINT.');
                    log(ob?.id.toUpperCase() + ' secured.');
                }
                else {
                    finish(true);
                    return;
                }
            }
        }
    }
    g.spawnElapsed += dt;
    if (g.spawnElapsed >= g.spawnNext) {
        g.spawnElapsed = 0;
        g.spawnNext = spawnDelay();
        randomRequest();
    }
    draw();
}
// 任务胜利或失败：停止计时器，并显示结算覆盖层。
function finish(win) { g.active = false; clearInterval(timer); timer = null; draw(); $('overlay').style.display = 'flex'; $('overlay').innerHTML = `<div><img src="${ART.skull}"><h2>${win ? 'MISSION ACCOMPLISHED' : g.errors >= 3 ? 'GAME OVER<br>TRANSFERRED TO THE MINISTRY OF TRUTH' : 'GAME OVER'}</h2><p>${win ? 'Both objectives secured. Pelican-1 has extracted the squad.' : g.errors >= 3 ? 'Three failures or request timeouts recorded.' : 'All four Helldivers have been lost.'}</p><button class="btn gold" id="restart">↻ NEW OPERATION</button></div>`; $('restart').onclick = start; }
// 找出与准星格子完全重合的战备；只有选中的信标才能输入并执行指令。
const selected = () => g?.requests.find(r => r.x === reticle.x && r.y === reticle.y);
// 输入错误：失败次数 +1，清空已输入内容；累计 3 次触发 GAME OVER。
function wrong(text) { g.errors++; typed = ''; say(text + ' / FAILURE ' + g.errors + '/3'); log('Incorrect stratagem input.'); if (g.errors >= 3) {
    finish(false);
    return;
} draw(); }
// 输入一位方向指令：用 startsWith 检查当前输入是否仍匹配正确战备代码。
function input(d) { if (!g?.active || g.paused)
    return; const r = selected(); if (!r) {
    say('SELECT A STRATAGEM BEACON FIRST.');
    draw();
    return;
} const seq = typed + d; if (!r.spec.key.startsWith(seq)) {
    wrong('INCORRECT DIRECTION CODE');
    return;
} typed = seq; say(typed === r.spec.key ? 'CODE VERIFIED. AUTHORIZE DEPLOYMENT.' : 'DIRECTION ACCEPTED.'); draw(); }
// 按 Enter 投放：检查所选信标与完整代码，然后处理冷却、误伤、增援和补给。
function deploy() { if (!g?.active || g.paused)
    return; const r = selected(); if (!r) {
    say('NO BEACON SELECTED.');
    draw();
    return;
} if (typed !== r.spec.key) {
    wrong('INCOMPLETE CODE');
    return;
} g.requests = g.requests.filter(t => t.id !== r.id); typed = ''; log('Deployed ' + r.spec.name); if (r.spec.id === 'resupply') {
    g.cd.resupply = 20;
    say('RESUPPLY DEPLOYED. 20s COOLDOWN.');
}
else if (r.spec.id === 'reinforce') {
    g.alive = 4;
    say('REINFORCEMENT SUCCESSFUL. SQUAD 4/4.');
}
else {
    if (r.spec.id === '380')
        g.cd['380'] = 40;
    if (near(r, g.team) <= 3) {
        g.alive--;
        say('FRIENDLY FIRE! HELLDIVER KIA.');
    }
    else
        say(r.spec.name.toUpperCase() + ' DEPLOYED.');
} if (g.alive <= 0) {
    finish(false);
    return;
} if (g.alive < 4 && !has('reinforce'))
    addRequest(specs[5]); draw(); }
// 把坐标转换为地图上的百分比定位，并生成任务/信标/小队的 HTML 标记。
function symbol(p, kind, inner, label) { const x = (p.x + .5) * 2, y = (p.y + .5) * 2; let s = `<span class="mark ${kind}" style="left:${x}%;top:${y}%">${inner}</span>`; if (label)
    s += `<span class="marklabel ${kind}" style="left:${x}%;top:${y}%;${p.x > 34 ? 'transform:translate(calc(-100% - 13px),-50%)' : ''}">${label}</span>`; return s; }
// 重新绘制全部画面：图标颜色、进度、倒计时、准星、右侧状态面板等。
function draw() { if (!g)
    return; let html = ''; g.objectives.forEach(o => html += symbol(o, 'obj mission-pin', `<img src="${MISSION_ART[o.id + (o.done ? '_complete' : '')]}" alt="${o.id}">`, '')); html += symbol(g.evac, 'evac mission-pin', `<img src="${MISSION_ART[g.objectives.every(o => o.done) ? 'extraction' : 'extraction_unavailable']}" alt="extraction">`, ''); g.requests.forEach(r => html += symbol(r, r.spec.id === 'reinforce' ? 'reinforce' : r.spec.kind, `<img src="${ART[r.spec.id]}">`, r.spec.short + ' ' + (r.remaining === null ? '∞' : Math.max(0, Math.ceil(r.remaining)) + 's'))); html += symbol(g.team, 'team', '★', ''); $('marks').innerHTML = html; const t = target(); $('route').setAttribute('x1', (g.team.x + .5) * 2); $('route').setAttribute('y1', (g.team.y + .5) * 2); $('route').setAttribute('x2', (t.x + .5) * 2); $('route').setAttribute('y2', (t.y + .5) * 2); $('reticle').style.left = (reticle.x + .5) * 2 + '%'; $('reticle').style.top = (reticle.y + .5) * 2 + '%'; $('coords').textContent = 'RETICLE ' + coord(reticle); $('clock').textContent = 'T+' + String(Math.floor(g.elapsed / 60)).padStart(2, '0') + ':' + String(Math.floor(g.elapsed % 60)).padStart(2, '0'); $('phase').textContent = g.paused ? 'PAUSED' : g.active ? 'OPERATION ACTIVE' : 'MISSION ENDED'; $('alive').textContent = g.alive + ' / 4'; $('objectives').textContent = g.objectives.filter(o => o.done).length + ' / 2'; $('errors').textContent = g.errors + ' / 3'; $('activity').textContent = blocked() ? 'AWAITING SUPPORT' : g.phase === 'objective' ? 'SECURING OBJECTIVE' : g.phase === 'evac' ? 'AWAITING EXTRACTION' : 'ADVANCING'; $('hold').textContent = g.phase === 'objective' ? 'HOLD ' + Math.ceil(Math.max(0, 8 - g.hold)) + 's' : g.phase === 'evac' ? 'HOLD ' + Math.ceil(Math.max(0, 13 - g.hold)) + 's' : 'MARCH SPEED ' + (g.alive * 25) + '%'; $('resupplycd').textContent = g.cd.resupply > 0 ? Math.ceil(g.cd.resupply) + 's' : 'READY'; $('barragecd').textContent = g.cd['380'] > 0 ? Math.ceil(g.cd['380']) + 's' : 'READY'; $('cd-380').textContent = g.cd['380'] > 0 ? 'COOLDOWN ' + Math.ceil(g.cd['380']) + 's' : ''; $('cd-resupply').textContent = g.cd.resupply > 0 ? 'COOLDOWN ' + Math.ceil(g.cd.resupply) + 's' : ''; $('message').textContent = g.message; $('input').textContent = typed ? code(typed) : '—'; const r = selected(); $('selected').textContent = r ? r.spec.name : 'NONE'; $('expected').textContent = r ? code(r.spec.key) : '—'; $('count').textContent = normalCount() + '/ 3' + (has('reinforce') ? ' + R' : ''); $('requests').innerHTML = g.requests.length ? g.requests.map(q => `<button class="request ${q.spec.id === 'reinforce' ? 'reinforce' : q.spec.kind} ${r?.id === q.id ? 'on' : ''}" data-id="${q.id}"><div style="display:flex;align-items:center;gap:8px"><img src="${ART[q.spec.id]}"><div style="flex:1;min-width:0"><b style="font-size:12px">${q.spec.name}</b><br><small>${coord(q)}</small></div><span class="time" style="${q.remaining !== null && q.remaining < 5 ? 'color:#ff7966' : ''}">${q.remaining === null ? '∞' : Math.max(0, q.remaining).toFixed(1) + 's'}</span></div>${q.remaining === null ? '' : `<div class="bar"><i style="width:${Math.max(0, q.remaining) * (100 / 30)}%"></i></div>`}</button>`).join('') : '<div class="label" style="padding:12px 0">NO ACTIVE REQUESTS</div>'; $('logs').innerHTML = g.logs.map(l => '<div>' + l + '</div>').join(''); }
// 更新准星：普通方向键移动 1 格，按住 Shift 加方向键移动 5 格；限制在 0 到 49。
function move(dx, dy, absolute = false) { if (!g?.active || g.paused)
    return; reticle = absolute ? { x: clamp(dx, 0, 49), y: clamp(dy, 0, 49) } : { x: clamp(reticle.x + dx, 0, 49), y: clamp(reticle.y + dy, 0, 49) }; typed = ''; draw(); }
// 鼠标点击地图时，把点击的像素位置换算成 50×50 的格子坐标。
$('map').addEventListener('click', e => { if (e.target.closest('.overlay'))
    return; const r = $('map').getBoundingClientRect(); move(Math.floor((e.clientX - r.left) / r.width * 50), Math.floor((e.clientY - r.top) / r.height * 50), true); });
// 点击右侧战备请求时，将准星快速定位到对应信标。
$('requests').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b || !g)
    return; const r = g.requests.find(q => q.id === Number(b.dataset.id)); if (r)
    move(r.x, r.y, true); });
// 给网页上的方向按钮绑定事件；点击按钮和按 WASD 的效果相同。
document.querySelectorAll('[data-d]').forEach(b => b.onclick = () => input(b.dataset.d));
// onclick 是点击事件：点击“开始任务”时调用 start()。
$('begin').onclick = start;
$('new').onclick = start;
// 暂停按钮只切换 g.paused 的 true/false；tick() 检查这个状态决定是否推进。
$('pause').onclick = () => { if (!g?.active)
    return; g.paused = !g.paused; $('pause').textContent = g.paused ? '▶ RESUME' : 'Ⅱ PAUSE'; draw(); };
$('deploy').onclick = deploy;
// 键盘监听：WASD 输入战备代码；方向键移动准星；Shift+方向键加速；Enter 投放。
document.addEventListener('keydown', e => { if (e.ctrlKey || e.altKey || e.metaKey || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName))
    return; const k = e.key.toLowerCase(), codes = { w: 'U', a: 'L', s: 'D', d: 'R' }, moves = { arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }; if (codes[k]) {
    e.preventDefault();
    if (!e.repeat)
        input(codes[k]);
}
else if (moves[k]) {
    e.preventDefault();
    move(moves[k][0] * (e.shiftKey ? 5 : 1), moves[k][1] * (e.shiftKey ? 5 : 1));
}
else if (k === 'enter' && e.target?.tagName !== 'BUTTON') {
    e.preventDefault();
    deploy();
} });


// ==================== ESP32 控制器 ====================
// 通过浏览器 Web Serial API 读取 ESP32 Serial.println() 输出的逐行控制命令。
// 继续调用游戏中已有的 move()/input()/deploy()，不修改原来的游戏规则。
let serialPort = null;
let serialReader = null;
let serialActive = false;
let serialBuffer = '';
const serialConnectButton = $('serial-connect');
const serialDisconnectButton = $('serial-disconnect');
const serialStatus = $('serial-status');
const serialLast = $('serial-last');

function setSerialStatus(message, connected = false) {
    serialStatus.textContent = message;
    serialStatus.classList.toggle('connected', connected);
    serialConnectButton.disabled = connected;
    serialDisconnectButton.disabled = !connected;
}

// Serial 输出一行必须是完整命令，不能带其他字符。
function handleHardwareCommand(line) {
    line = line.trim().toUpperCase();
    const cursor = { CURSOR_LEFT: [-1, 0], CURSOR_RIGHT: [1, 0], CURSOR_UP: [0, -1], CURSOR_DOWN: [0, 1] };
    const codes = { CODE_LEFT: 'L', CODE_RIGHT: 'R', CODE_UP: 'U', CODE_DOWN: 'D' };
    const cursorMatch = line.match(/^(CURSOR_(?:LEFT|RIGHT|UP|DOWN))(?:\s+([1-5]))?$/);
    if (cursorMatch) {
        const delta = cursor[cursorMatch[1]];
        const steps = Number(cursorMatch[2] || 1);
        move(delta[0] * steps, delta[1] * steps);
    } else if (Object.prototype.hasOwnProperty.call(codes, line)) {
        input(codes[line]);
    } else if (line === 'DEPLOY') {
        deploy();
    } else {
        return; // 忽略固件版本、启动文字和 UID 等调试内容
    }
    serialLast.textContent = 'LAST INPUT: ' + line;
}

async function serialReadLoop(port) {
    const decoder = new TextDecoder();
    try {
        while (serialActive && port.readable) {
            const reader = port.readable.getReader();
            serialReader = reader;
            try {
                while (serialActive) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    serialBuffer += decoder.decode(value, { stream: true });
                    const lines = serialBuffer.split(/\r?\n/);
                    serialBuffer = lines.pop();
                    for (const line of lines) handleHardwareCommand(line);
                    if (serialBuffer.length > 1024) serialBuffer = '';
                }
            } finally {
                reader.releaseLock();
                if (serialReader === reader) serialReader = null;
            }
            // 读端发生不可恢复的错误时不无限重连
            break;
        }
    } catch (err) {
        if (serialActive) setSerialStatus('READ ERROR: ' + err.message);
    } finally {
        if (serialPort === port) {
            serialActive = false;
            try { await port.close(); } catch (e) { /* 设备断开时关闭可能失败 */ }
            serialPort = null;
            setSerialStatus('DISCONNECTED');
        }
    }
}

async function connectESP32() {
    if (!('serial' in navigator)) {
        setSerialStatus('USE CHROME / EDGE ON LOCALHOST');
        return;
    }
    if (!window.isSecureContext) {
        setSerialStatus('OPEN VIA LOCALHOST OR HTTPS');
        return;
    }
    if (serialActive) return;
    try {
        // 必须由真实点击事件触发端口选择窗口
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 });
        serialPort = port;
        serialBuffer = '';
        serialActive = true;
        setSerialStatus('CONNECTED · 115200', true);
        serialReadLoop(port);
    } catch (err) {
        setSerialStatus(err.name === 'NotFoundError' ? 'PORT SELECTION CANCELED' : 'CONNECT FAILED: ' + err.message);
    }
}

async function disconnectESP32() {
    if (!serialActive) return;
    serialActive = false;
    if (serialReader) {
        try { await serialReader.cancel(); } catch (e) { /* 已断线 */ }
    }
    // serialReadLoop 的 finally 会释放 reader 并关闭端口
}

serialConnectButton.addEventListener('click', connectESP32);
serialDisconnectButton.addEventListener('click', disconnectESP32);
if (!('serial' in navigator)) setSerialStatus('WEB SERIAL NOT AVAILABLE: USE CHROME / EDGE');