import { config } from './config.js'

/**
 * The published terms, privacy policy and account-deletion page.
 *
 * These are written against what the code in this repository actually does —
 * which tables exist, which third parties see what, what is on by default —
 * rather than assembled from a template. If the behaviour changes, these change
 * with it; a policy that describes a different program is worse than none.
 *
 * They have NOT been reviewed by a lawyer. Read them before publishing, and
 * make sure the Play Console Data safety form says the same things.
 */

export const LAST_UPDATED = { en: '9 August 2026', zh: '2026年8月9日' }

/** Renders as a visible gap rather than silently disappearing. */
const missing = (en) => `<mark class="todo">[${en}]</mark>`

const entity = () => config.legalEntity || missing('set LEGAL_ENTITY in .env')
const email = () =>
  config.legalContactEmail
    ? `<a href="mailto:${config.legalContactEmail}">${config.legalContactEmail}</a>`
    : missing('set LEGAL_CONTACT_EMAIL in .env')
const jurisdiction = () => config.legalJurisdiction || missing('set LEGAL_JURISDICTION in .env')

const DOCS = {
  terms: {
    en: () => ({
      title: 'Terms of Service',
      sections: [
        ['What Mynah does', [
          `Mynah places telephone calls on your behalf and runs an automated voice agent on the line. You describe a task in your own words; the agent dials the number you gave, speaks to whoever answers, and reports back what happened.`,
          `The service is operated by ${entity()}.`,
        ]],
        ['You are responsible for the calls you ask for', [
          `Every call is made because you asked for it, to a number you supplied. You are responsible for what you ask the agent to do and for the consequences of the call.`,
          `Do not use Mynah for marketing or sales calls, for calls to emergency services, for automated dialling of numbers you do not have a reason to contact, for harassment, or for anything unlawful where you or the person you are calling are located.`,
        ]],
        ['Telling people they are talking to a machine', [
          `The agent identifies itself as an AI assistant when it is asked, and says that it is calling on your behalf. Some places require more than that — a few require disclosure at the start of every call, and some restrict automated calling outright.`,
          `Meeting those rules is your responsibility, not ours. If you are unsure what applies where you are calling, do not place the call.`,
        ]],
        ['Recording', [
          `Call recording is off by default and stays off unless the server operator turns it on. Transcription is always on, because the agent cannot hold a conversation without it.`,
          `Where you or the other party are located, recording or transcribing a call may require one party's consent, both parties' consent, or a spoken announcement. That is your responsibility to establish before you place the call.`,
        ]],
        ['The agent gets things wrong', [
          `Mynah is built on a large language model and on automatic speech recognition. Both misunderstand things. The agent may mishear a name, book the wrong time, agree to something you did not intend, or report an outcome that is not quite what was said.`,
          `Treat every result as a claim to check, not a fact. Do not use Mynah for anything where an error would be expensive or dangerous — medical decisions, legal deadlines, financial instructions, or anything irreversible.`,
        ]],
        ['Your account', [
          `You need an account to place calls. Keep your sign-in details to yourself; anything done through your account is treated as done by you.`,
          `You can delete your account at any time from Settings in the app, or by writing to ${email()}. Deleting it removes your calls and transcripts as well — see the privacy policy for exactly what goes.`,
        ]],
        ['Cost', [
          `Calls cost real money on the telephone network, and the language model is metered too. The cost of each call is shown against it once the carrier has rated it, usually a few minutes after the call ends.`,
        ]],
        ['No warranty, and what we are liable for', [
          `The service is provided as it is. We do not promise it will be available, that a call will connect, or that the agent will achieve what you asked.`,
          `Nothing here limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot lawfully be limited. Subject to that, we are not liable for indirect or consequential loss, for lost profit or opportunity, or for the outcome of any call.`,
        ]],
        ['Ending it', [
          `You can stop using Mynah and delete your account whenever you like. We may suspend or close an account that is being used for any of the things listed above, or in a way that puts the service or the telephone numbers behind it at risk.`,
        ]],
        ['Changes', [
          `If these terms change in a way that matters, the change will be shown in the app before it takes effect. Continuing to use the service after that means you accept the new terms.`,
        ]],
        ['Law', [
          `These terms are governed by the law of ${jurisdiction()}, and its courts have jurisdiction. If you are a consumer, this does not take away rights you have under the law of the country you live in.`,
        ]],
        ['Contact', [`Write to ${email()}.`]],
      ],
    }),
    zh: () => ({
      title: '用户条款',
      sections: [
        ['Mynah 是做什么的', [
          `Mynah 代你拨打电话，并在通话中运行一个自动语音助理。你用自己的话描述要办的事，助理拨打你给的号码，与接听的人对话，然后把结果回报给你。`,
          `本服务由 ${entity()} 运营。`,
        ]],
        ['你要为自己发起的通话负责', [
          `每一通电话都是因为你发起、并且拨向你提供的号码。你要为交给助理去做的事，以及这通电话带来的后果负责。`,
          `不得将 Mynah 用于营销或推销电话、拨打紧急服务号码、批量拨打你没有正当理由联系的号码、骚扰他人，或在你或对方所在地属于违法的任何用途。`,
        ]],
        ['告知对方正在与机器通话', [
          `被问到时，助理会表明自己是 AI 助理，并说明是代你致电。有些地区的要求不止于此——少数地区要求每通电话开头就主动告知，还有些地区直接限制自动外呼。`,
          `遵守这些规定是你的责任，不是我们的。如果不确定拨打地适用什么规则，就不要拨。`,
        ]],
        ['录音', [
          `通话录音默认关闭，除非服务器运营者主动开启，否则一直关闭。转写始终开启——不转写助理就无法对话。`,
          `在你或对方所在地，录音或转写通话可能需要单方同意、双方同意，或需要口头告知。拨打之前确认这一点是你的责任。`,
        ]],
        ['助理会出错', [
          `Mynah 建立在大语言模型和自动语音识别之上，两者都会理解错。助理可能听错名字、订错时间、答应了你本不想答应的事，或把结果转述得与对方原话有出入。`,
          `请把每一个结果都当作"需要核实的说法"，而不是既成事实。凡是出错代价高昂或有危险的场合都不要用——医疗决定、法律时限、资金指令，以及任何不可撤销的事。`,
        ]],
        ['你的账号', [
          `发起通话需要账号。请自行保管登录凭据；通过你账号做的一切都视为你本人所为。`,
          `你随时可以在 App 的"设置"里删除账号，或写信到 ${email()}。删除账号会一并删除你的通话记录和转写内容——具体删除哪些，见隐私政策。`,
        ]],
        ['费用', [
          `电话在运营商网络上是真金白银，语言模型也是按量计费的。每通电话的费用会在运营商完成计费后显示在该通话上，通常是挂断后几分钟。`,
        ]],
        ['不作保证，以及责任范围', [
          `本服务按现状提供。我们不保证服务持续可用、不保证电话一定能接通，也不保证助理一定能办成你交待的事。`,
          `本条款不排除因疏忽导致的死亡或人身伤害责任、欺诈责任，以及依法不得排除的其他责任。在此前提下，我们不对间接或后果性损失、利润或机会损失，以及任何通话的结果承担责任。`,
        ]],
        ['终止', [
          `你随时可以停止使用并删除账号。若账号被用于上述任一情形，或以危及本服务及其背后电话号码的方式使用，我们可能暂停或关闭该账号。`,
        ]],
        ['条款变更', [
          `条款如有实质性变更，会在生效前于 App 内告知。变更后继续使用即视为接受新条款。`,
        ]],
        ['适用法律', [
          `本条款适用 ${jurisdiction()} 法律，并由其法院管辖。若你是消费者，这不影响你依所在国法律享有的权利。`,
        ]],
        ['联系方式', [`写信到 ${email()}。`]],
      ],
    }),
  },

  privacy: {
    en: () => ({
      title: 'Privacy Policy',
      sections: [
        ['Who holds your data', [
          `${entity()} operates Mynah and is the controller of the personal data described here. Contact: ${email()}.`,
        ]],
        ['What is stored, and why', [
          `<b>Your account.</b> Your email address, and your name if Google gave us one. If you signed up with a password, only a scrypt hash of it is stored — never the password itself. Sessions are rows in the database with a 90-day expiry, so signing out actually revokes them.`,
          `<b>Who the assistant calls for.</b> The name you want the assistant to give when a booking needs one, and your own phone number. Your number is used for one thing: ringing you when the agent hits something it must not handle alone and has to hand the call over.`,
          `<b>Every call you place.</b> The number dialled, the business name, the task you described, any constraints, the full transcript of both sides, the summary and the outcome the agent extracted, the language, timestamps, and the cost and duration the carrier reports back.`,
          `<b>Recordings.</b> Audio recording is off by default. If the operator of this server has turned it on, recordings are held by Twilio under their retention settings, not in this database.`,
        ]],
        ['Who else sees it', [
          `<b>Twilio</b> places the call and does the speech-to-text and text-to-speech. Everything said on the call passes through Twilio.`,
          `<b>Runware</b> hosts the language model that decides what the agent says, and does the transcript translation. The conversation text is sent there while the call is running.`,
          `<b>Google</b> is involved only if you sign in with Google, and only sees that a sign-in happened. Separately: dictation in the app uses Android's own speech recogniser, which on most phones sends what you say to Google. If you would rather it did not, type the task instead of holding the mic.`,
          `Nothing is sold, and nothing is shared for advertising.`,
        ]],
        ['Your contacts stay on your phone', [
          `The app has no contacts permission. When you pick someone from your contacts, Android shows you its own picker and hands back the single number you chose — the app never reads your contact list.`,
        ]],
        ['The other party on the call', [
          `A call has someone else on it, and their words end up in a transcript on this server. They did not agree to that with us — you are the one who placed the call, which is why the terms make the legality of recording and transcribing your responsibility.`,
        ]],
        ['How long it is kept', [
          `Calls and transcripts are kept until you delete them or delete your account. Sessions expire after 90 days and are cleared on the next server start. There is no automatic expiry on call history — if you want it gone, delete it.`,
        ]],
        ['Deleting your account', [
          `Settings › Delete account, in the app. It removes your account row, your profile, every session, and every call and transcript belonging to you, immediately and irreversibly.`,
          `What it cannot reach: anything already held by Twilio or Runware under their own retention, and server log lines. Ask ${email()} if you need those chased.`,
        ]],
        ['Your rights', [
          `You can ask for a copy of your data, ask for it to be corrected, or ask for it to be deleted — write to ${email()}. Most of it you can see in the app already, and deletion is a button.`,
          `If you are in the UK or EU, the legal basis is the contract between us: we cannot place a call for you without the number, the task, and somewhere to put the result. You can complain to your data protection authority if you think we have got this wrong.`,
        ]],
        ['Security', [
          `Everything between the app and the server is over HTTPS. Passwords are scrypt-hashed with a per-user salt. No Twilio or model provider credentials are ever stored on your phone — the app is a remote control, and the keys live on the server.`,
        ]],
        ['Children', [`Mynah is not for anyone under 16.`]],
        ['Changes', [
          `If this policy changes in a way that matters, the change will be shown in the app before it takes effect.`,
        ]],
      ],
    }),
    zh: () => ({
      title: '隐私政策',
      sections: [
        ['谁持有你的数据', [
          `Mynah 由 ${entity()} 运营，也是本文所述个人数据的控制者。联系方式：${email()}。`,
        ]],
        ['存了什么，为什么存', [
          `<b>你的账号。</b>邮箱地址，以及 Google 提供的名字（如果用 Google 登录）。若用密码注册，只存 scrypt 哈希，绝不存密码原文。会话是数据库里的一行记录，90 天过期，所以"退出登录"是真的把它吊销掉。`,
          `<b>助理代谁打电话。</b>订位需要报名字时用的名字，以及你自己的手机号。你的号码只用于一件事：助理遇到不该自己处理的事、必须转接时回拨你。`,
          `<b>你发起的每一通电话。</b>拨打的号码、对方名称、你描述的任务、附加条件、双方完整转写、助理提取的摘要与结果、语言、时间戳，以及运营商回报的费用和时长。`,
          `<b>录音。</b>音频录制默认关闭。若本服务器运营者开启了它，录音由 Twilio 按其保留策略持有，不存在本数据库中。`,
        ]],
        ['还有谁能看到', [
          `<b>Twilio</b> 负责拨打电话以及语音转文字、文字转语音。通话中说的每一句都会经过 Twilio。`,
          `<b>Runware</b> 托管决定助理如何应答的语言模型，也负责转写翻译。通话进行期间，对话文本会发送到那里。`,
          `<b>Google</b> 只在你使用 Google 登录时参与，且只知道发生了一次登录。另外单独说明：App 里的语音输入用的是 Android 自带的语音识别，在多数手机上会把你说的话发给 Google。若不希望如此，请改用键盘输入任务，不要按住话筒。`,
          `不出售任何数据，也不为广告目的共享任何数据。`,
        ]],
        ['通讯录不出手机', [
          `App 没有申请通讯录权限。你从联系人选号码时，是 Android 弹出它自己的选择器，只把你选中的那一个号码交回来——App 从头到尾读不到你的通讯录。`,
        ]],
        ['通话对方', [
          `通话里还有另一个人，他说的话会变成转写存在这台服务器上。他并没有就此与我们达成任何约定——发起通话的是你，所以条款里把录音与转写的合法性划为你的责任。`,
        ]],
        ['保留多久', [
          `通话与转写一直保留，直到你删除它们或删除账号。会话 90 天过期，服务器下次启动时清理。通话记录没有自动过期机制——想让它消失，就去删掉。`,
        ]],
        ['删除账号', [
          `在 App 里：设置 › 删除账号。会立即且不可撤销地删除你的账号记录、个人资料、全部会话，以及属于你的每一通电话和转写。`,
          `它管不到的部分：Twilio 与 Runware 依其自身保留策略已持有的内容，以及服务器日志。需要一并追查请联系 ${email()}。`,
        ]],
        ['你的权利', [
          `你可以要求获取数据副本、更正数据或删除数据——写信到 ${email()}。其中大部分你在 App 里本来就看得到，删除也只是一个按钮。`,
          `若你在英国或欧盟，处理的法律依据是我们之间的合同：没有号码、任务和存放结果的地方，我们无法替你打这通电话。若你认为我们处理不当，可向你所在地的数据保护机构投诉。`,
        ]],
        ['安全', [
          `App 与服务器之间全程 HTTPS。密码用 scrypt 加每用户独立盐值哈希。Twilio 和模型服务商的凭据从不存在你手机上——App 只是遥控器，钥匙都在服务器上。`,
        ]],
        ['未成年人', [`Mynah 不面向 16 岁以下人士。`]],
        ['政策变更', [`本政策如有实质性变更，会在生效前于 App 内告知。`]],
      ],
    }),
  },

  'delete-account': {
    en: () => ({
      title: 'Deleting your Mynah account',
      sections: [
        ['In the app', [
          `Open Mynah, go to <b>Settings</b>, scroll to the bottom and tap <b>Delete account</b>. You will be asked to confirm. It happens immediately.`,
        ]],
        ['Without the app', [
          `Write to ${email()} from the address the account is registered to, and ask for it to be deleted.`,
        ]],
        ['What is deleted', [
          `Your account and sign-in details, your saved name and phone number, every session, and every call you placed together with its transcript, summary and result. All of it, immediately, with no way to get it back.`,
        ]],
        ['What is not', [
          `Anything Twilio or the model provider already hold under their own retention periods, and server log lines. Ask ${email()} if you need those chased up.`,
        ]],
      ],
    }),
    zh: () => ({
      title: '删除你的 Mynah 账号',
      sections: [
        ['在 App 里删除', [
          `打开 Mynah，进入<b>设置</b>，滑到底部点<b>退出登录</b>上方的<b>删除账号</b>，确认即可。立即生效。`,
        ]],
        ['没有 App 时', [`用注册所用的邮箱写信到 ${email()}，说明要删除账号。`]],
        ['会删除什么', [
          `你的账号与登录凭据、保存的名字和手机号、全部会话，以及你发起的每一通电话连同其转写、摘要和结果。全部立即删除，无法恢复。`,
        ]],
        ['不会删除什么', [
          `Twilio 与模型服务商依其自身保留期已持有的内容，以及服务器日志。需要一并追查请联系 ${email()}。`,
        ]],
      ],
    }),
  },
}

export const DOC_NAMES = Object.keys(DOCS)

/** @returns the rendered HTML page, or null if there is no such document. */
export function renderDoc(name, lang = 'en') {
  const doc = DOCS[name]
  if (!doc) return null
  const language = doc[lang] ? lang : 'en'
  const { title, sections } = doc[language]()
  const other = language === 'en' ? 'zh' : 'en'

  const body = sections
    .map(([heading, paragraphs]) =>
      `<h2>${heading}</h2>${paragraphs.map((p) => `<p>${p}</p>`).join('')}`)
    .join('')

  return shell({
    title,
    lang: language,
    updated: LAST_UPDATED[language],
    updatedLabel: language === 'zh' ? '最后更新' : 'Last updated',
    switchHref: `/legal/${name}?lang=${other}`,
    switchLabel: other === 'zh' ? '中文' : 'English',
    body,
  })
}

/**
 * The Wise palette, so a link out of the app does not land somewhere that looks
 * like a different product. Inline, because one stylesheet request for three
 * static pages is not worth a second round trip.
 */
const shell = ({ title, lang, updated, updatedLabel, switchHref, switchLabel, body }) => `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Mynah</title>
<style>
  :root { color-scheme: light }
  * { box-sizing: border-box }
  body {
    margin: 0; padding: 40px 22px 72px; background: #E8EBE6; color: #0E0F0C;
    font: 400 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  main { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 32px 26px 36px }
  h1 { font-size: 28px; font-weight: 800; letter-spacing: -.4px; margin: 0 0 6px }
  h2 { font-size: 17px; font-weight: 700; letter-spacing: -.2px; margin: 28px 0 8px }
  p { margin: 0 0 12px; color: #454745 }
  b { color: #0E0F0C; font-weight: 600 }
  a { color: #163300 }
  .meta { font-size: 13px; color: #868685; margin: 0 0 4px }
  .switch { display: inline-block; margin-top: 10px; font-size: 14px; font-weight: 600; color: #163300 }
  .todo { background: #FFD11A; color: #4A3B1C; padding: 1px 6px; border-radius: 4px; font-weight: 600 }
  footer { max-width: 680px; margin: 18px auto 0; font-size: 13px; color: #868685; text-align: center }
</style>
</head>
<body>
<main>
  <h1>${title}</h1>
  <p class="meta">${updatedLabel}: ${updated}</p>
  <a class="switch" href="${switchHref}">${switchLabel}</a>
  ${body}
</main>
<footer>Mynah</footer>
</body>
</html>`
