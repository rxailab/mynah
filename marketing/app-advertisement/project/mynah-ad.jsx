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
  arrowUp: ['M12 19V5', 'm5 12 7-7 7 7'],
  loop: ['M20.5 12a8.5 8.5 0 1 1-2.49-6.01', 'M20.5 3.6v4.2h-4.2'],
  phone: ['M6.6 3.4a1.6 1.6 0 0 1 2.13.43l1.7 2.43a1.6 1.6 0 0 1-.32 2.16l-1.27 1.05a12.7 12.7 0 0 0 4.36 4.36l1.05-1.27a1.6 1.6 0 0 1 2.16-.32l2.43 1.7a1.6 1.6 0 0 1 .43 2.13l-.85 1.32c-.74 1.15-2.2 1.6-3.5 1.08A19 19 0 0 1 5.45 8.1c-.5-1.3-.05-2.76 1.1-3.5z'],
  bell: ['M18.2 16.4V11a6.2 6.2 0 0 0-12.4 0v5.4L4 19.2h16z', 'M9.9 19.2a2.1 2.1 0 0 0 4.2 0'],
  msg: ['M20 14.8a2.2 2.2 0 0 1-2.2 2.2H8.6L4.8 20.2V6.6a2.2 2.2 0 0 1 2.2-2.2h10.8A2.2 2.2 0 0 1 20 6.6z'],
  voicemail: ['M6.6 9.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z', 'M17.4 9.4a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z', 'M6.6 15.6h10.8'],
  keypad: ['M5 5h.01', 'M12 5h.01', 'M19 5h.01', 'M5 12h.01', 'M12 12h.01', 'M19 12h.01', 'M5 19h.01', 'M12 19h.01', 'M19 19h.01']
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

function StatusBar({ dark, padX = 56, h = 96, notchW = 226, notchH = 68, fs = 29 }) {
  const c = dark ? INK.onDark : INK.text;
  return (
    <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `8px ${padX}px 0`, flex: 'none', position: 'relative' }}>
      <div style={{ font: `600 ${fs}px ${F}`, color: c, letterSpacing: '-0.3px' }}>9:41</div>
      <div style={{ position: 'absolute', left: '50%', top: 22, transform: 'translateX(-50%)', width: notchW, height: notchH, borderRadius: 40, background: '#000' }} />
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
    name: '航空公司 客服热线', num: '+86 21 9500 0000', initial: '航', caller: '航空公司 客服',
    typed: '帮我打给航空公司，把周四的航班改到周六同一时段，要靠走道，顺便问清改签差价',
    queueNote: '语音菜单已过，助理在替您排队',
    headline: '已改签：周六 14:35 起飞',
    rows: [['新航班', '周六 14:35 · 直飞', false], ['座位', '32C 靠走道', false], ['改签差价', '¥180', false], ['话费与时长', '3分12秒 · ¥0.36', true]],
    noteAt: 4.7,
    lines: [
      { dt: 0.5, kind: 'agent', h: 200, text: '您好，我要改签一张机票。订单号 8LK2QF，原航班周四 15:20 飞上海。' },
      { dt: 2.9, kind: 'caller', h: 162, text: '查到了。周六同一时段有一班，14:35 起飞，还有座位。' },
      { dt: 4.7, kind: 'owner', h: 78, text: '常旅客卡号 FF8871042' },
      { dt: 5.5, kind: 'agent', h: 162, text: '请用常旅客卡号 FF8871042。改签差价多少？还有靠走道的位子吗？' },
      { dt: 7.6, kind: 'caller', h: 162, text: '差价 180 元。32C 靠走道，已经帮您留好了。' }
    ]
  },
  '英文热线': {
    name: '航空公司 客服热线', num: '+44 20 7946 0958', initial: '航', caller: 'AIRLINE SUPPORT',
    typed: '帮我打给航空公司，把周四的航班改到周六同一时段，要靠走道，顺便问清改签差价',
    queueNote: '英文语音菜单已过，助理在替您排队',
    headline: '已改签：周六 14:35 起飞',
    rows: [['新航班', '周六 14:35 · 直飞', false], ['座位', '32C 靠走道', false], ['改签差价', '£62', false], ['话费与时长', '3分12秒 · £0.28', true]],
    noteAt: 5.0,
    lines: [
      { dt: 0.5, kind: 'agent', h: 292,
        text: 'Hello \u2014 I\u2019d like to change a booking. Reference 8LK2QF, Thursday 15:20 to London.',
        sub: '您好，我要改签一张机票。订单号 8LK2QF，原航班周四 15:20 飞伦敦。' },
      { dt: 3.1, kind: 'caller', h: 220,
        text: 'Found it. Saturday has a 14:35 departure, and there are seats left.',
        sub: '查到了。周六有一班 14:35 起飞，还有座位。' },
      { dt: 5.0, kind: 'owner', h: 78, text: '常旅客卡号 FF8871042' },
      { dt: 5.8, kind: 'agent', h: 292,
        text: 'Please use frequent-flyer FF8871042. What\u2019s the fare difference, and is an aisle seat free?',
        sub: '请用常旅客卡号 FF8871042。改签差价多少？还有靠走道的位子吗？' },
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
// 开场（0–3.5s）不再是漂浮的小卡片，而是留学生手机上真实发生的两件事：
// 拨过去卡在英文语音菜单里绕回原点，或者锁屏上未接来电越堆越高。
// 全屏、无边框 —— 观众先以为自己在看手机，7 秒后镜头拉开才发现那是 Mynah。
// 三版由 Tweaks「开场版本」切换，标题文案与原片一字不改。
const garble = (s, u) => [...s].map((ch, i) =>
  ch === ' ' ? ' ' : (((i * 97 + 13) % 100) / 100 < u ? '?' : ch)).join('');

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// 语音菜单：绕了三层，最后一句把你送回起点。
const IVR_FULL = [
  { at: -0.45, text: 'Thank you for calling the airline booking line.' },
  { at: -0.12, text: 'Please listen carefully — our menu options have changed.' },
  { at: 0.95, text: 'To change or cancel a flight, press 2.' },
  { at: 2.00, text: 'Please enter your 6-digit booking reference.' },
  { at: 2.42, text: 'Sorry — I didn’t catch that.', garbleAt: 2.60 },
  { at: 2.86, text: 'Returning you to the main menu.', bad: true }
];
const IVR_SHORT = [
  { at: -0.2, text: 'To change or cancel a flight, press 2.' },
  { at: 0.62, text: 'Please enter your 6-digit booking reference.' },
  { at: 0.98, text: 'Sorry — I didn’t catch that.', garbleAt: 1.12 },
  { at: 1.34, text: 'Returning you to the main menu.', bad: true }
];

function IvrLine({ t, at, text, garbleAt, bad }) {
  const e = Easing.easeOutCubic(clamp((t - at) / 0.42, 0, 1));
  const g = garbleAt ? clamp((t - garbleAt) / 0.5, 0, 1) * 0.8 : 0;
  return (
    <div style={{
      opacity: e, transform: `translateY(${(1 - e) * 26}px)`,
      alignSelf: 'flex-start', maxWidth: 880, marginBottom: 20,
      padding: '22px 30px', borderRadius: 34,
      background: bad ? 'rgba(255,209,26,0.17)' : INK.onDarkWash,
      display: 'flex', alignItems: 'center', gap: 18
    }}>
      {bad && <div style={{ flex: 'none', transform: `rotate(${(t - at) * 210}deg)` }}><WIcon icon="loop" size={34} color={INK.warning} /></div>}
      <div style={{ font: `400 31px/1.42 ${MONO}`, color: bad ? INK.warning : INK.onDarkBody, letterSpacing: '0.2px' }}>
        {g ? garble(text, g) : text}
      </div>
    </div>
  );
}

// 版本 A：整屏就是那通打不通的电话。计时器从 47 分钟起走，键盘按下去也没用。
function IvrScreen({ t, lines, pressAt, label = '自动语音', held0 = 2832 }) {
  const held = held0 + Math.max(0, t) * 1;
  const press = clamp((t - pressAt) / 0.26, 0, 1) * (1 - clamp((t - pressAt - 0.3) / 0.4, 0, 1));
  const shown = lines.filter(l => t >= l.at - 0.02);
  return (
    <div style={{ position: 'absolute', inset: 0, background: INK.text, display: 'flex', flexDirection: 'column' }}>
      <StatusBar dark={true} padX={74} h={124} notchW={300} notchH={88} fs={38} />
      <div style={{ padding: '20px 74px 0', flex: 'none' }}>
        <div style={{ font: `700 26px ${F}`, letterSpacing: '2.4px', color: INK.onDarkMute }}>通话中</div>
        <div style={{ font: `900 62px ${F}`, color: INK.onDark, letterSpacing: '-1.2px', marginTop: 12 }}>航空公司 客服热线</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 16 }}>
          <span style={{ font: `400 34px ${MONO}`, color: INK.onDarkMute }}>+44 20 7946 0958</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '10px 22px', borderRadius: 999, background: 'rgba(255,209,26,0.17)' }}>
            <PulsingDot T={t} color={INK.warning} size={14} />
            <span style={{ font: `500 30px ${MONO}`, color: INK.warning }}>{fmt(held)}</span>
          </span>
        </div>
      </div>
      <div style={{ padding: '46px 74px 0', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flex: 'none', marginBottom: 26 }}>
          <Waveform T={t} color={INK.rim} h={26} />
          <span style={{ font: `700 24px ${F}`, letterSpacing: '2.2px', color: INK.onDarkMute }}>{label}</span>
        </div>
        {shown.map((l, i) => <IvrLine key={l.at} t={t} {...l} />)}
      </div>
      <div style={{ padding: '0 74px 74px', flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 136px)', gap: 26 }}>
          {KEYS.map(k => {
            const hot = k === '2' ? press : 0;
            return (
              <div key={k} style={{
                height: 136, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: hot ? INK.lime : INK.onDarkWash, color: hot ? INK.onLime : INK.onDarkBody,
                font: `400 50px ${F}`, transform: `scale(${1 - 0.06 * hot})`
              }}>{k}</div>
            );
          })}
        </div>
        <div style={{ width: 136, height: 136, borderRadius: '50%', background: INK.negative, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WIcon icon="phone" size={58} color={INK.onDark} sw={2} />
        </div>
      </div>
    </div>
  );
}

// 版本 B：锁屏。未接来电、语音留言、今天截止的提醒一条压一条，最后那通又打进来了。
const NOTIFS = [
  { at: 0.00, icon: 'phone', tint: INK.positive, app: '电话', title: '未接来电 · 2 次', body: '航空公司客服  +44 20 7946 0958', when: '09:12' },
  { at: 0.00, icon: 'voicemail', tint: INK.lime, dark: true, app: '语音留言', title: '1 条未读 · 0:48', body: 'We tried to reach you about booking 8LK2QF…', when: '09:14' },
  { at: 0.10, icon: 'bell', tint: INK.warning, dark: true, app: '提醒', title: '今天截止', body: '打给航空公司，把周四的航班改到周六', when: '今天' },
  { at: 0.86, icon: 'phone', tint: INK.positive, app: '电话', title: '未接来电', body: '房东 Mr. Hughes  ·  押金还没退', when: '昨天' },
  { at: 1.30, icon: 'msg', tint: 'rgba(255,255,255,0.18)', app: '信息', title: '银行', body: '您的银行卡已被锁定，请致电客服解锁', when: '昨天' },
  { at: 1.74, icon: 'phone', tint: INK.positive, app: '电话', title: '未接来电', body: '学校学费办公室  ·  +44 20 7946 0102', when: '周一' },
  { at: 2.16, icon: 'voicemail', tint: INK.lime, dark: true, app: '语音留言', title: '1 条未读 · 1:12', body: 'Please call us back regarding your account…', when: '周一' }
];

function Notif({ t, at, icon, tint, dark, app, title, body, when }) {
  const e = Easing.easeOutCubic(clamp((t - at) / 0.44, 0, 1));
  return (
    <div style={{
      opacity: e, transform: `translateY(${(1 - e) * 40}px) scale(${0.94 + 0.06 * e})`,
      background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.13)',
      borderRadius: 44, padding: '26px 30px', display: 'flex', alignItems: 'flex-start', gap: 24, marginBottom: 20
    }}>
      <div style={{ width: 76, height: 76, borderRadius: 22, background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <WIcon icon={icon} size={40} color={dark ? INK.onLime : INK.onDark} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <span style={{ font: `700 25px ${F}`, letterSpacing: '1.8px', color: INK.onDarkMute }}>{app}</span>
          <span style={{ font: `400 25px ${MONO}`, color: INK.onDarkMute, flex: 'none' }}>{when}</span>
        </div>
        <div style={{ font: `700 34px ${F}`, color: INK.onDark, marginTop: 10 }}>{title}</div>
        <div style={{ font: `400 29px/1.4 ${F}`, color: INK.onDarkBody, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{body}</div>
      </div>
    </div>
  );
}

function IncomingBanner({ t, at }) {
  const e = Easing.easeOutBack(clamp((t - at) / 0.5, 0, 1));
  const buzz = t > at ? Math.sin((t - at) * 46) * 4 * Math.max(0, 1 - (t - at) / 0.9) : 0;
  return (
    <div style={{
      position: 'absolute', left: 56, right: 56, top: 150,
      opacity: clamp((t - at) / 0.2, 0, 1), transform: `translate(${buzz}px, ${(1 - e) * -90}px)`,
      background: INK.card, borderRadius: 52, padding: '30px 34px', boxShadow: '0 40px 90px rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', gap: 26
    }}>
      <div style={{ width: 100, height: 100, borderRadius: '50%', background: INK.text, color: INK.onDark, font: `900 40px ${F}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>航</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `700 24px ${F}`, letterSpacing: '2px', color: INK.mute }}>来电</div>
        <div style={{ font: `800 40px ${F}`, color: INK.text, marginTop: 6, letterSpacing: '-0.5px' }}>航空公司客服</div>
      </div>
      <div style={{ display: 'flex', gap: 18, flex: 'none' }}>
        <div style={{ width: 104, height: 104, borderRadius: '50%', background: INK.negative, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(135deg)' }}>
          <WIcon icon="phone" size={46} color={INK.onDark} />
        </div>
        <div style={{ width: 104, height: 104, borderRadius: '50%', background: INK.positive, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <WIcon icon="phone" size={46} color={INK.onDark} />
        </div>
      </div>
    </div>
  );
}

function LockScreen({ t, notifs, callAt, focus }) {
  const shift = Math.max(0, notifs.filter(n => t >= n.at).length * 194 - 1080);
  const fz = focus ? Easing.easeInOutCubic(clamp((t - focus) / 0.85, 0, 1)) : 0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: INK.text, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 60% at 50% -8%, rgba(159,232,112,0.13), rgba(14,15,12,0) 70%)' }} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${1 + 0.07 * fz}) translateY(${-150 * fz}px)`, transformOrigin: '540px 900px', display: 'flex', flexDirection: 'column' }}>
        <StatusBar dark={true} padX={74} h={124} notchW={300} notchH={88} fs={38} />
        <div style={{ textAlign: 'center', flex: 'none', paddingTop: 6 }}>
          <div style={{ font: `400 38px ${F}`, color: INK.onDarkBody }}>8月18日 星期二</div>
          <div style={{ font: `600 196px ${F}`, color: INK.onDark, letterSpacing: '-8px', lineHeight: 1 }}>9:41</div>
        </div>
        <div style={{ padding: '54px 56px 0', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ transform: `translateY(${-shift}px)` }}>
            {notifs.map((n, i) => <Notif key={i} t={t} {...n} />)}
          </div>
        </div>
      </div>
      {callAt !== undefined && t >= callAt - 0.1 && <IncomingBanner t={t} at={callAt} />}
    </div>
  );
}

function Noise({ T, variant = 'A' }) {
  const out = Easing.easeInCubic ? Easing.easeInCubic(clamp((T - 3.05) / 0.42, 0, 1)) : Easing.easeInOutCubic(clamp((T - 3.05) / 0.42, 0, 1));
  const push = Easing.easeInOutSine(clamp(T / 3.2, 0, 1));
  const cut = 1.62;
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden', textAlign: 'left',
      opacity: 1 - out * out, transform: `translateY(${-260 * out}px) scale(${(1 + 0.042 * push) * (1 - 0.05 * out)})`,
      transformOrigin: '540px 960px'
    }}>
      {variant === 'B' && <LockScreen t={T} notifs={NOTIFS} callAt={2.5} />}
      {variant === 'A' && <IvrScreen t={T} lines={IVR_FULL} pressAt={1.72} />}
      {variant === 'C' && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <Shot from={0} to={cut}>
            <LockScreen t={T} notifs={NOTIFS.slice(0, 4)} focus={0.7} />
          </Shot>
          <Shot from={cut} to={99}>
            <IvrScreen t={T - cut} lines={IVR_SHORT} pressAt={0.5} label="自动语音 · 第 3 层菜单" held0={502} />
          </Shot>
        </div>
      )}
    </div>
  );
}

function Hook({ T, K, variant }) {
  const a = MOTION.enter(T, 3.24, 0.7), aOut = MOTION.slide(T, 5.1, 5.5);
  const b = MOTION.enter(T, 5.5, 0.7), bOut = MOTION.slide(T, K.ask - 0.35, K.ask + 0.1);
  const drift = 1 + 0.015 * clamp(T - 3.24, 0, 3.5);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 100 }}>
      <Noise T={T} variant={variant} />
      <div style={{ position: 'absolute', opacity: a.opacity * (1 - aOut), transform: `${a.transform} translateY(${-40 * aOut}px) scale(${drift})`, font: `900 104px/1.24 ${F}`, color: INK.text, letterSpacing: '-2px', maxWidth: 820 }}>
        没人喜欢<br />打客服电话
      </div>
      <div style={{ position: 'absolute', opacity: b.opacity * (1 - bOut), transform: `${b.transform} scale(${drift})`, font: `900 104px/1.3 ${F}`, color: INK.text, letterSpacing: '-2px', maxWidth: 880 }}>
        所以让 <span style={{ background: INK.lime, borderRadius: 22, padding: '4px 20px', whiteSpace: 'nowrap' }}>Mynah</span><br />替你打
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
      <div style={{ ...MOTION.enter(T, K.end + 0.15), font: `500 42px ${F}`, color: INK.body, marginTop: 18 }}>打电话的事 交给助理</div>
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

  // 字幕不带标点：句读靠空格断，末尾不收句号 —— 竖版短片上更干净。
  const captions = [
    { at: K.ask + 0.5, until: K.dial - 0.4, text: '一句话说清就行' },
    { at: K.dial + 0.3, until: K.dial + 1.5, text: bilingual ? '英文语音菜单 它自己过' : '语音菜单 它自己过' },
    { at: K.dial + 1.6, until: K.call + 0.3, text: '排队等着的是它 不是你' },
    { at: K.call + 0.8, until: K.call + 4.4, text: bilingual ? '英文通话 中文字幕跟着走' : '每句话 实时显示' },
    { at: K.call + 4.6, until: K.call + 7.2, text: '想补一句 随时插话' },
    { at: K.call + 7.4, until: K.done + 0.5, text: '细节都替你记下来' },
    { at: K.done + 0.9, until: K.done + 3.4, text: '办完了 你一次都没拿起电话' }
  ];

  return (
    <div style={{ position: 'absolute', inset: 0, background: INK.canvas, fontFamily: F, overflow: 'hidden' }}>
      <Shot from={0} to={K.ask + 0.5}><Hook T={T} K={K} variant={tweaks.opening || 'A'} /></Shot>
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
        <TweakSection label="开场" />
        <TweakRadio label="开场版本" value={t.opening} options={['A', 'B', 'C']} onChange={v => setTweak('opening', v)} />
        <TweakSection label="内容" />
        <TweakRadio label="对方说什么语言" value={t.callLanguage} options={['中文热线', '英文热线']} onChange={v => setTweak('callLanguage', v)} />
      </TweaksPanel>
    </div>
  );
}
window.MynahAd = MynahAd;
