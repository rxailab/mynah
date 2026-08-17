// Mynah 30 秒广告 — 1080×1920。手机内所有界面均按 ios/Mynah 源码复刻
// （Ink.swift / Typography.swift / Components.swift / CallScreen.swift / ComposeScreen.swift），
// 文案取自 Resources/zh-Hans.lproj/Localizable.strings。
const { useComposition, Shot, Captions, Easing, animate, clamp } = window;

const INK = {
  lime:'#9FE870', limePale:'#E2F6D5', text:'#0E0F0C', deep:'#163300', body:'#454745',
  mute:'#868685', card:'#FFFFFF', canvas:'#E8EBE6', cardSoft:'#F8FAF6', divider:'#EEF0EA',
  hairline:'rgba(14,15,12,0.1)', rim:'#C9CDC5', canvasSoft:'#F2F4EF', positive:'#2EAD4B',
  warning:'#FFD11A', warningInk:'#4A3B1C', negative:'#D03238', onLime:'#0E0F0C',
  onDark:'#FFFFFF', onDarkMute:'#868685', onDarkBody:'#B9BAB6',
  onDarkWash:'rgba(255,255,255,0.09)', onDarkRim:'rgba(255,255,255,0.3)', onDarkBubble:'#2A2A28'
};
const F = "'Inter', 'Noto Sans SC', 'PingFang SC', system-ui, sans-serif";
const MONO = "'Roboto Mono', 'Noto Sans SC', monospace";

// 手机几何：一处定义，界面严格按内屏尺寸排版。
const PH = { w: 848, h: 1600, x: 116, y: 46, pad: 16 };
const SCR = { w: PH.w - PH.pad * 2, h: PH.h - PH.pad * 2 };

const MOTION = {
  enter: (T, at, dur = 0.6, dy = 28) => {
    const e = Easing.easeOutCubic(clamp((T - at) / dur, 0, 1));
    return { opacity: e, transform: `translateY(${(1 - e) * dy}px)` };
  },
  pop: (T, at, dur = 0.5) => {
    const u = clamp((T - at) / dur, 0, 1);
    return { opacity: Math.min(1, u * 2.5), transform: `scale(${0.5 + 0.5 * Easing.easeOutBack(u)})` };
  },
  slide: (T, a, b, from = 0, to = 1, ease = Easing.easeInOutCubic) =>
    animate({ from, to, start: a, end: b, ease })(T)
};

// 图标 path 数据逐字取自 WiseIcons.swift（24 网格，2.2 圆头描边）。
const PATHS = {
  arrowLeft: ['M19 12H5', 'm11 18-6-6 6-6'],
  mic: ['M12 4.2a2.5 2.5 0 0 1 2.5 2.5v4.8a2.5 2.5 0 0 1-5 0V6.7A2.5 2.5 0 0 1 12 4.2z', 'M6.6 11.2a5.4 5.4 0 0 0 10.8 0', 'M12 16.6v3.2'],
  check: ['M5 13l5 5L20 7'],
  arrowUp: ['M12 19V5', 'm5 12 7-7 7 7']
};
const WIcon = ({ icon, size = 40, color = INK.text, sw = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
    {PATHS[icon].map((d, i) => (
      <path key={i} d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);

const pulse = (T, phase = 0) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(T * 5.5 + phase));
const PulsingDot = ({ T, color, size = 14, phase = 0 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', background: color, opacity: pulse(T, phase), flex: 'none' }} />
);
const Waveform = ({ T, color = INK.lime, h = 26 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: h, flex: 'none' }}>
    {[0, 1, 2, 3].map(i => (
      <div key={i} style={{ width: 5, height: h, borderRadius: 3, background: color,
        transform: `scaleY(${0.3 + 0.7 * (0.5 + 0.5 * Math.sin(T * 6 + i * 0.9))})` }} />
    ))}
  </div>
);

function StatusBar({ dark }) {
  const c = dark ? INK.onDark : INK.text;
  return (
    <div style={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 56px 0', flex: 'none', position: 'relative' }}>
      <div style={{ font: `600 29px ${F}`, color: c, letterSpacing: '-0.3px' }}>9:41</div>
      <div style={{ position: 'absolute', left: '50%', top: 22, transform: 'translateX(-50%)', width: 226, height: 68, borderRadius: 40, background: '#000' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <svg width="34" height="22" viewBox="0 0 18 12">{[3,5.5,8,10.5].map((h, i) => <rect key={i} x={i * 4.6} y={12 - h} width="3" height={h} rx="1" fill={c} />)}</svg>
        <svg width="30" height="22" viewBox="0 0 16 12"><path d="M1 4.5a11 11 0 0 1 14 0M3.5 7.2a7 7 0 0 1 9 0M6 9.9a3.4 3.4 0 0 1 4 0" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round"/><circle cx="8" cy="11" r="1.1" fill={c}/></svg>
        <svg width="46" height="22" viewBox="0 0 25 12"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" fill="none" stroke={c} strokeWidth="1" opacity="0.4"/><rect x="2" y="2" width="14" height="8" rx="2" fill={c}/><path d="M23 4v4a2.2 2.2 0 0 0 0-4z" fill={c} opacity="0.4"/></svg>
      </div>
    </div>
  );
}

// 两种热线：对方说中文，或对方说英文。界面语言是中文，所以通话语言不同时
// 每句话下面跟一行中文译文 —— 与 CallScreen.swift 里 Transcript 的判断一致。
const CALL = {
  '中文热线': {
    name: '东方航空 客服热线', num: '+86 21 9552 0888', initial: '东', caller: '东方航空 客服',
    typed: '帮我打给东方航空，把周四的 MU5108 改到周六同一时段，要靠走道，顺便问清改签差价',
    queueNote: '语音菜单已过，助理在替您排队',
    headline: '已改签：周六 14:35 MU5122',
    rows: [['新航班', '周六 14:35 · MU5122', false], ['座位', '32C 靠走道', false], ['改签差价', '¥180', false], ['话费与时长', '3分12秒 · ¥0.36', true]],
    noteAt: 4.7,
    lines: [
      { dt: 0.5, kind: 'agent', h: 200, text: '您好，我要改签一张机票。订单号 8LK2QF，原航班 MU5108，周四 15:20 飞上海。' },
      { dt: 2.9, kind: 'caller', h: 162, text: '查到了。周六同一时段有 MU5122，14:35 起飞，还有座位。' },
      { dt: 4.7, kind: 'owner', h: 78, text: '常旅客卡号 CZ8871042' },
      { dt: 5.5, kind: 'agent', h: 162, text: '请用常旅客卡号 CZ8871042。改签差价多少？还有靠走道的位子吗？' },
      { dt: 7.6, kind: 'caller', h: 162, text: '差价 180 元。32C 靠走道，已经帮您留好了。' }
    ]
  },
  '英文热线': {
    name: 'British Airways 客服热线', num: '+44 344 493 0787', initial: 'B', caller: 'BRITISH AIRWAYS',
    typed: '帮我打给英国航空，把周四的 BA168 改到周六同一时段，要靠走道，顺便问清改签差价',
    queueNote: '英文语音菜单已过，助理在替您排队',
    headline: '已改签：周六 14:35 BA172',
    rows: [['新航班', '周六 14:35 · BA172', false], ['座位', '32C 靠走道', false], ['改签差价', '£62', false], ['话费与时长', '3分12秒 · £0.28', true]],
    noteAt: 5.0,
    lines: [
      { dt: 0.5, kind: 'agent', h: 292,
        text: 'Hello \u2014 I\u2019d like to change a booking. Reference 8LK2QF, flight BA168, Thursday 15:20 to London.',
        sub: '您好，我要改签一张机票。订单号 8LK2QF，原航班 BA168，周四 15:20 飞伦敦。' },
      { dt: 3.1, kind: 'caller', h: 220,
        text: 'Found it. Saturday has BA172 at 14:35, and there are seats left.',
        sub: '查到了。周六有 BA172，14:35 起飞，还有座位。' },
      { dt: 5.0, kind: 'owner', h: 78, text: '常旅客卡号 BA8871042' },
      { dt: 5.8, kind: 'agent', h: 292,
        text: 'Please use frequent-flyer BA8871042. What\u2019s the fare difference, and is an aisle seat free?',
        sub: '请用常旅客卡号 BA8871042。改签差价多少？还有靠走道的位子吗？' },
      { dt: 8.0, kind: 'caller', h: 220,
        text: 'The difference is \u00a362. Seat 32C on the aisle is held for you.',
        sub: '差价 62 英镑。32C 靠走道，已经帮您留好了。' }
    ]
  }
};

// ── 新通话（ComposeScreen.swift）─────────────────────────────────────────────
function ComposeUI({ T, K, cfg }) {
  const TYPED = cfg.typed;
  const typeStart = K.ask + 1.1, typeDur = 2.9;
  const n = Math.round(TYPED.length * clamp((T - typeStart) / typeDur, 0, 1));
  const done = n >= TYPED.length;
  const caretOn = (T * 2) % 1 < 0.55 || !done;
  const pu = clamp((T - (K.dial - 0.4)) / 0.32, 0, 1);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 92, background: INK.canvas, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={false} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 20px 0', flex: 'none' }}>
        <div style={{ width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WIcon icon="arrowLeft" size={40} />
        </div>
        <div style={{ font: `700 32px ${F}`, color: INK.text, letterSpacing: '-0.4px' }}>新通话</div>
      </div>
      <div style={{ padding: '22px 32px 0', flex: 1, minHeight: 0 }}>
        <div style={{ background: INK.card, borderRadius: 30, padding: '26px 28px 22px' }}>
          <div style={{ height: 232, font: `400 28px/1.5 ${F}`, color: n ? INK.text : INK.mute }}>
            {n ? TYPED.slice(0, n) : '例如：周五晚七点半在 The Ivy 订四人桌，靠窗，要一个儿童椅'}
            {n > 0 && <span style={{ display: 'inline-block', width: 3, height: 32, background: INK.text, marginLeft: 3, verticalAlign: '-4px', opacity: caretOn ? 1 : 0 }} />}
          </div>
          <div style={{ height: 1, background: INK.divider, margin: '14px 0' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ font: `400 21px/1.45 ${F}`, color: INK.mute, flex: 1 }}>未提及的内容将留空，不会被随意猜测</div>
            <div style={{ width: 66, height: 66, borderRadius: '50%', background: INK.canvasSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <WIcon icon="mic" size={31} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
          {['帮我改约周二的牙医', '问 DPD 包裹几点送到'].map((s, i) => (
            <div key={i} style={{ font: `600 22px ${F}`, color: INK.text, padding: '14px 20px', background: INK.card, borderRadius: 18, border: `1px solid ${INK.hairline}` }}>{s}</div>
          ))}
        </div>
      </div>
      <div style={{ padding: '0 32px 40px', flex: 'none' }}>
        <div style={{
          height: 98, borderRadius: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: done ? INK.lime : INK.canvasSoft, color: done ? INK.onLime : INK.mute,
          font: `700 30px ${F}`, transform: `scale(${1 - 0.04 * Math.sin(Math.PI * pu)})`
        }}>下一步：核对信息</div>
      </div>
    </div>
  );
}

// ── 通话中（CallScreen.swift）────────────────────────────────────────────────
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const GOALS = ['报订单号与改签需求', '确认周六航班有座', '问清改签差价', '选靠走道的位子'];
const AREA_H = 700;

function ChecklistRow({ T, label, doneAt, activeAt }) {
  const done = T >= doneAt;
  const active = !done && T >= activeAt;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 36 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', flex: 'none',
        background: done ? INK.lime : 'transparent',
        border: done ? 'none' : `3px solid ${active ? INK.lime : INK.onDarkRim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {done && <div style={MOTION.pop(T, doneAt, 0.4)}><WIcon icon="check" size={20} color={INK.onLime} sw={2.8} /></div>}
        {active && <PulsingDot T={T} color={INK.lime} size={14} />}
      </div>
      <div style={{ font: `${active ? 700 : 400} 26px ${F}`, color: done ? INK.onDarkMute : active ? INK.onDark : INK.onDarkMute }}>{label}</div>
    </div>
  );
}

function Bubble({ T, at, who, kind, text, sub }) {
  const e = MOTION.enter(T, at, 0.55, 30);
  if (kind === 'owner') return (
    <div style={{ ...e, display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 22px', borderRadius: 999, background: INK.onDarkWash }}>
        <WIcon icon="arrowUp" size={19} color={INK.lime} />
        <span style={{ font: `400 22px ${F}`, color: INK.onDark }}>已插话：{text}</span>
      </div>
    </div>
  );
  const me = kind === 'agent';
  return (
    <div style={{ ...e, display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', marginBottom: 18 }}>
      <div style={{ font: `700 21px ${F}`, letterSpacing: '1.1px', color: INK.onDarkMute, padding: '0 14px', marginBottom: 5 }}>{who}</div>
      <div style={{ maxWidth: 620, padding: '20px 26px', borderRadius: 34, background: me ? INK.lime : INK.onDarkBubble }}>
        <div style={{ font: `400 27px/1.48 ${F}`, color: me ? INK.onLime : INK.onDark }}>{text}</div>
        {sub && <div style={{ height: 1, background: me ? 'rgba(14,15,12,0.15)' : INK.onDarkRim, margin: '10px 0' }} />}
        {sub && <div style={{ font: `400 22px/1.45 ${F}`, color: me ? INK.deep : INK.onDarkMute }}>{sub}</div>}
      </div>
    </div>
  );
}

function CallUI({ T, K, cfg }) {
  const queued = T >= K.dial + 1.4 && T < K.call;
  const answered = T >= K.call;
  const elapsed = T - K.dial;
  const ringU = i => ((T / 1.8) + i / 3) % 1;
  const BUBS = cfg.lines.map(l => Object.assign({}, l, {
    at: K.call + l.dt,
    who: l.kind === 'agent' ? '助理' : l.kind === 'owner' ? '您' : cfg.caller
  }));
  let visH = 0;
  BUBS.forEach(b => { visH += b.h * Easing.easeOutCubic(clamp((T - b.at) / 0.55, 0, 1)); });
  const shift = Math.max(0, visH - AREA_H);
  return (
    <div style={{ position: 'absolute', inset: 0, borderRadius: 92, background: INK.text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={true} />
      <div style={{ textAlign: 'center', padding: '18px 32px 22px', flex: 'none' }}>
        <div style={{ font: `800 40px ${F}`, color: INK.onDark, letterSpacing: '-0.5px' }}>{cfg.name}</div>
        <div style={{ font: `400 25px ${MONO}`, color: INK.onDarkMute, marginTop: 6 }}>{cfg.num}</div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '12px 26px', borderRadius: 999, background: INK.onDarkWash, marginTop: 16 }}>
          <PulsingDot T={T} color={answered ? INK.lime : INK.warning} size={13} />
          <span style={{ font: `600 25px ${F}`, color: INK.onDark }}>{answered ? '通话中' : queued ? '等待接听' : '正在拨号…'}</span>
          <span style={{ font: `400 25px ${MONO}`, color: INK.onDarkMute }}>{fmt(elapsed)}</span>
        </div>
      </div>

      {/* 拨号与排队 */}
      <Shot from={K.dial} to={K.call}>
        <div style={{ position: 'absolute', left: 32, right: 32, top: 300, bottom: 40, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: 'rgba(255,209,26,0.16)', borderRadius: 30, padding: '22px 26px', textAlign: 'center', flex: 'none', opacity: queued ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <span style={{ font: `700 21px ${F}`, letterSpacing: '1.2px', color: INK.warning }}>排队中</span>
              <span style={{ font: `400 25px ${MONO}`, color: INK.onDark }}>{fmt(Math.max(0, T - K.dial - 1.4) + 102)}</span>
            </div>
            <div style={{ font: `400 21px/1.5 ${F}`, color: INK.onDarkMute, marginTop: 8 }}>排队和通话一样计费。如果进展缓慢，可以先挂断，晚点再打。</div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40 }}>
            <div style={{ position: 'relative', width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {[0, 1].map(i => (
                <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `4px solid ${queued ? INK.warning : INK.lime}`,
                  transform: `scale(${0.9 + 0.65 * ringU(i)})`, opacity: 0.55 * (1 - ringU(i)) }} />
              ))}
              <div style={{ width: 176, height: 176, borderRadius: '50%', background: INK.onDarkWash, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `900 58px ${F}`, color: queued ? INK.warning : INK.lime }}>{cfg.initial}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {queued && <Waveform T={T} color={INK.warning} h={22} />}
              <div style={{ font: `400 27px ${F}`, color: INK.onDarkMute }}>{queued ? cfg.queueNote : '等对方接起来…'}</div>
            </div>
          </div>
        </div>
      </Shot>

      {/* 对话 */}
      <Shot from={K.call} to={K.end + 5}>
        <div style={{ position: 'absolute', left: 32, right: 32, top: 300, bottom: 34, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...MOTION.enter(T, K.call + 0.1, 0.6), background: INK.onDarkWash, borderRadius: 40, padding: '26px 30px', flex: 'none' }}>
            <div style={{ font: `700 21px ${F}`, letterSpacing: '1.2px', color: INK.onDarkMute, marginBottom: 18 }}>这通电话要办的事</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {GOALS.map((g, i) => (
                <ChecklistRow key={i} T={T} label={g} activeAt={K.call + [0, 2.4, 5.2, 7.4][i]} doneAt={K.call + [2.4, 5.2, 7.4, 8.9][i]} />
              ))}
            </div>
          </div>
          <div style={{ height: AREA_H, overflow: 'hidden', marginTop: 22, flex: 'none' }}>
            <div style={{ transform: `translateY(${-shift}px)` }}>
              {BUBS.map((b, i) => <Bubble key={i} T={T} {...b} />)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 28px', borderRadius: 999, background: INK.onDarkWash, marginTop: 22, flex: 'none' }}>
            <div style={{ font: `400 22px ${F}`, color: INK.onDarkMute, flex: 1 }}>输入一句话，助理会自然带入对话…</div>
            <div style={{ width: 68, height: 68, borderRadius: '50%', background: T >= K.call + cfg.noteAt - 0.3 && T < K.call + cfg.noteAt + 0.5 ? INK.lime : INK.onDarkWash, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <WIcon icon="arrowUp" size={27} color={T >= K.call + cfg.noteAt - 0.3 && T < K.call + cfg.noteAt + 0.5 ? INK.onLime : INK.onDarkMute} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 22, flex: 'none' }}>
            <div style={{ flex: 1, height: 92, borderRadius: 46, border: `2px solid ${INK.onDarkRim}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 27px ${F}`, color: INK.onDark }}>接管</div>
            <div style={{ flex: 1, height: 92, borderRadius: 46, background: INK.negative, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 27px ${F}`, color: INK.onDark }}>挂断</div>
          </div>
        </div>
      </Shot>
    </div>
  );
}

// ── 结果（CallScreen.swift ResultSheet）─────────────────────────────────────
function ResultUI({ T, K, cfg }) {
  const y = MOTION.slide(T, K.done - 0.05, K.done + 0.6, SCR.h, 0);
  const rows = cfg.rows;
  return (
    <Shot from={K.done - 0.05} to={K.end + 5}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 92, overflow: 'hidden', background: INK.card, transform: `translateY(${y}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '110px 46px 0' }}>
        <div style={{ ...MOTION.pop(T, K.done + 0.55, 0.55), width: 116, height: 116, borderRadius: '50%', background: INK.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <WIcon icon="check" size={54} color={INK.onLime} sw={2.8} />
        </div>
        <div style={{ ...MOTION.enter(T, K.done + 0.75), font: `900 50px/1.25 ${F}`, color: INK.text, letterSpacing: '-0.8px', textAlign: 'center', marginTop: 34 }}>{cfg.headline}</div>
        <div style={{ ...MOTION.enter(T, K.done + 0.9), font: `400 28px ${F}`, color: INK.body, marginTop: 14 }}>{cfg.name}</div>
        <div style={{ ...MOTION.enter(T, K.done + 1.1), alignSelf: 'stretch', background: INK.canvasSoft, borderRadius: 30, marginTop: 44 }}>
          {rows.map(([k, v, mono], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, padding: '22px 28px', borderTop: i ? `1px solid ${INK.hairline}` : 'none' }}>
              <span style={{ font: `400 26px ${F}`, color: INK.body }}>{k}</span>
              <span style={{ font: mono ? `500 24px ${MONO}` : `700 28px ${F}`, color: INK.text }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ ...MOTION.enter(T, K.done + 1.3), alignSelf: 'stretch', marginTop: 44 }}>
          <div style={{ height: 94, borderRadius: 46, border: `2px solid ${INK.text}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 30px ${F}`, color: INK.text }}>查看记录</div>
          <div style={{ height: 98, borderRadius: 46, background: INK.lime, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 30px ${F}`, color: INK.onLime, marginTop: 18 }}>完成</div>
        </div>
      </div>
    </Shot>
  );
}

function Phone({ T, K, cfg }) {
  const inn = MOTION.slide(T, K.ask - 0.55, K.ask + 0.6);
  const out = MOTION.slide(T, K.end - 0.55, K.end - 0.05);
  return (
    <div style={{
      position: 'absolute', left: PH.x, top: PH.y, width: PH.w, height: PH.h,
      transform: `translateY(${(1 - inn) * 1900}px) scale(${1 - 0.09 * out})`,
      transformOrigin: 'center', opacity: 1 - out,
      background: '#1A1B18', borderRadius: 108, padding: PH.pad,
      boxShadow: '0 50px 110px rgba(14,15,12,0.32)'
    }}>
      <div style={{ position: 'relative', width: SCR.w, height: SCR.h, borderRadius: 92, overflow: 'hidden', isolation: 'isolate', background: INK.canvas }}>
        <Shot from={0} to={K.dial}><ComposeUI T={T} K={K} cfg={cfg} /></Shot>
        <Shot from={K.dial} to={K.end + 5}><CallUI T={T} K={K} cfg={cfg} /></Shot>
        <ResultUI T={T} K={K} cfg={cfg} />
      </div>
    </div>
  );
}

// ── 开场与片尾 ──────────────────────────────────────────────────────────────
function Hook({ T, K }) {
  const a = MOTION.enter(T, 0.25, 0.7), aOut = MOTION.slide(T, 1.8, 2.2);
  const b = MOTION.enter(T, 2.35, 0.7), bOut = MOTION.slide(T, K.ask - 0.35, K.ask + 0.1);
  const drift = 1 + 0.015 * Math.min(T, 5);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 100 }}>
      <div style={{ position: 'absolute', opacity: a.opacity * (1 - aOut), transform: `${a.transform} translateY(${-40 * aOut}px) scale(${drift})`, font: `900 104px/1.24 ${F}`, color: INK.text, letterSpacing: '-2px', maxWidth: 820 }}>
        没人喜欢<br />打客服电话。
      </div>
      <div style={{ position: 'absolute', opacity: b.opacity * (1 - bOut), transform: `${b.transform} scale(${drift})`, font: `900 104px/1.3 ${F}`, color: INK.text, letterSpacing: '-2px', maxWidth: 880 }}>
        所以让 <span style={{ background: INK.lime, borderRadius: 22, padding: '4px 20px', whiteSpace: 'nowrap' }}>Mynah</span><br />替你打。
      </div>
    </div>
  );
}

function EndCard({ T, K }) {
  const on = T >= K.end - 0.6;
  const drift = 1 + 0.012 * Math.max(0, T - K.end);
  return (
    <div style={{ position: 'absolute', inset: 0, display: on ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${drift})` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[80, 160, 100].map((h, i) => (
          <div key={i} style={{ ...MOTION.pop(T, K.end - 0.35 + i * 0.09, 0.5), width: 40, height: h, borderRadius: 999, background: INK.lime }} />
        ))}
      </div>
      <div style={{ ...MOTION.enter(T, K.end - 0.1), font: `900 128px ${F}`, color: INK.text, letterSpacing: '-4px', marginTop: 34 }}>Mynah</div>
      <div style={{ ...MOTION.enter(T, K.end + 0.15), font: `500 42px ${F}`, color: INK.body, marginTop: 18 }}>打电话的事，交给助理</div>
      {/* 官方徽标原样使用，不改比例、不加圆角。App Store 108.85×40；Google Play 图内含官方留白，
          按 250/192 放大以让两枚黑底胶囊同高。 */}
      <div style={{ ...MOTION.enter(T, K.end + 0.45), display: 'flex', alignItems: 'center', gap: 28, marginTop: 68 }}>
        <img src="assets/app-store-badge-zh-cn.svg" alt="从 App Store 下载" style={{ height: 100, width: 272, display: 'block' }} />
        <img src="assets/google-play-badge-zh-cn.png" alt="去商店下载 Google Play" style={{ height: 130, width: 336, display: 'block' }} />
      </div>
    </div>
  );
}

// ── 整片 ────────────────────────────────────────────────────────────────────
function Piece({ tweaks }) {
  const { T, CUES, time } = useComposition();
  const K = { ask: CUES['说一句话'], dial: CUES['拨号排队'], call: CUES['通话中'], done: CUES['办成了'], end: CUES['片尾'] };
  const sec = Math.floor(time);
  React.useEffect(() => {
    const el = document.querySelector('[data-om-exportable-video-with-duration-secs]');
    if (el) el.setAttribute('data-screen-label', 't=' + sec + 's');
  }, [sec]);

  const uAsk = MOTION.slide(T, K.ask + 1.1, K.ask + 3.6) * (1 - MOTION.slide(T, K.ask + 4.4, K.dial - 0.05));
  const uCall = MOTION.slide(T, K.call + 0.4, K.call + 8.4, 0, 1, Easing.easeInOutSine) * (1 - MOTION.slide(T, K.done - 0.35, K.done + 0.6));
  const s = 1 + 0.08 * uAsk + 0.05 * uCall;
  const ty = 50 * uAsk;
  const mode = CALL[tweaks.callLanguage] ? tweaks.callLanguage : '英文热线';
  const cfg = CALL[mode];
  const bilingual = mode === '英文热线';

  const captions = [
    { at: K.ask + 0.5, until: K.dial - 0.4, text: '一句话说清就行。' },
    { at: K.dial + 0.3, until: K.dial + 1.5, text: bilingual ? '英文语音菜单，它自己过。' : '语音菜单，它自己过。' },
    { at: K.dial + 1.6, until: K.call + 0.3, text: '排队等着的是它，不是你。' },
    { at: K.call + 0.8, until: K.call + 4.4, text: bilingual ? '英文通话，中文字幕跟着走。' : '每句话，实时显示。' },
    { at: K.call + 4.6, until: K.call + 7.2, text: '想补一句？随时插话。' },
    { at: K.call + 7.4, until: K.done + 0.5, text: '细节都替你记下来。' },
    { at: K.done + 0.9, until: K.done + 3.4, text: '办完了 —— 你一次都没拿起电话。' }
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: INK.canvas, fontFamily: F, overflow: 'hidden' }}>
      <Shot from={0} to={K.ask + 0.5}><Hook T={T} K={K} /></Shot>
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${ty}px) scale(${s})`, transformOrigin: '540px 740px' }}>
        <Phone T={T} K={K} cfg={cfg} />
      </div>
      <EndCard T={T} K={K} />
      <Captions items={captions} style={{
        left: '50%', right: 'auto', bottom: 44, transform: 'translateX(-50%)',
        width: 'max-content', maxWidth: '88%', padding: '20px 40px', borderRadius: 999,
        background: INK.text, color: '#FFFFFF', font: `600 33px ${F}`, textShadow: 'none'
      }} />
    </div>
  );
}

function MynahAd() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CompositionStage width={1080} height={1920} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg={INK.canvas}>
        <Piece tweaks={t} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="动效" />
        <TweakToggle label="时间轴编辑器" value={t.motionEditor} onChange={v => setTweak('motionEditor', v)} />
        <TweakSection label="内容" />
        <TweakRadio label="对方说什么语言" value={t.callLanguage} options={['中文热线', '英文热线']} onChange={v => setTweak('callLanguage', v)} />
      </TweaksPanel>
    </div>
  );
}
window.MynahAd = MynahAd;
