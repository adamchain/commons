import{g as e,l as t,m as n,r,t as i}from"./jsx-runtime-BrqDuk8R.js";import{t as a}from"./wordmark-CwgHH3D2.js";import{G as o,M as s,_t as c,bt as l,mt as u,n as d,q as f,r as p,s as m,st as h,t as g,w as _}from"./index-CwPHKYvA.js";import{t as v}from"./app-store-badge-SD5fs4pt.js";var y=e(n(),1),b=i();function x(e){let t=e.trim(),n=t.replace(/\D/g,``);return t.startsWith(`+`)||n.length===11&&n.startsWith(`1`)?`+${n}`:n.length===10?`+1${n}`:`+${n}`}var S={bell:(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`path`,{d:`M18 8a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8Z`}),(0,b.jsx)(`path`,{d:`M10 20h4`})]}),plus:(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(`path`,{d:`M12 5v14M5 12h14`})}),search:(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`circle`,{cx:`10.5`,cy:`10.5`,r:`6.5`}),(0,b.jsx)(`path`,{d:`m16 16 4 4`})]}),heart:(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(`path`,{d:`M20.8 5.8a5.5 5.5 0 0 0-7.8 0L12 6.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z`})}),comment:(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(`path`,{d:`M21 11.5a8.4 8.4 0 0 1-9 8.5 9.6 9.6 0 0 1-4-.9L3 21l1.7-4.4A8.5 8.5 0 1 1 21 11.5Z`})}),send:(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`path`,{d:`m22 2-7 20-4-9-9-4Z`}),(0,b.jsx)(`path`,{d:`M22 2 11 13`})]}),bookmark:(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(`path`,{d:`M6 3h12v19l-6-4-6 4Z`})}),more:(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`circle`,{cx:`5`,cy:`12`,r:`1`,fill:`currentColor`}),(0,b.jsx)(`circle`,{cx:`12`,cy:`12`,r:`1`,fill:`currentColor`}),(0,b.jsx)(`circle`,{cx:`19`,cy:`12`,r:`1`,fill:`currentColor`})]}),close:(0,b.jsx)(b.Fragment,{children:(0,b.jsx)(`path`,{d:`m6 6 12 12M18 6 6 18`})}),spark:(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`path`,{d:`m12 2 1.3 5.1L18 9l-4.7 1.9L12 16l-1.3-5.1L6 9l4.7-1.9Z`}),(0,b.jsx)(`path`,{d:`m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7Z`})]})};function C({name:e,size:t=22,filled:n=!1}){return(0,b.jsx)(`svg`,{"aria-hidden":`true`,viewBox:`0 0 24 24`,width:t,height:t,fill:n?`currentColor`:`none`,stroke:`currentColor`,strokeWidth:`1.8`,strokeLinecap:`round`,strokeLinejoin:`round`,children:S[e]})}var w=[{name:`Golden hour walk`,when:`Tonight · 6pm`,video:`/videos/moment-1.mp4`,badge:`G`},{name:`Sunrise flow`,when:`Sat · 7am`,video:`/videos/moment-2.mp4`,badge:`S`},{name:`Gallery night`,when:`Fri · 8pm`,video:`/videos/moment-3.mp4`,badge:`N`},{name:`Coffee run`,when:`Wed · 9am`,video:`/videos/moment-4.mp4`,badge:`C`}],T=[{src:`/landing/shots/community-bucks.png`,alt:`Bucks Co Girls Club community`},{src:`/landing/shots/post-kristen.png`,alt:`A last-minute plan shared in a group`},{src:`/landing/shots/profile.png`,alt:`A Commons member profile`},{src:`/landing/shots/post-wfh.png`,alt:`Work-from-home group conversation`},{src:`/landing/shots/friendsgiving.png`,alt:`A Commons Friendsgiving plan`},{src:`/landing/shots/community-wfh.png`,alt:`Philly Work-From-Home Girls community`},{src:`/landing/shots/share.png`,alt:`Sharing a plan with friends`}];function E(){let e=t(),n=()=>e(`/onboarding`),[i,S]=(0,y.useState)(null),[E,O]=(0,y.useState)(``),k=e=>{O(e),window.setTimeout(()=>O(``),2200)},{setUser:A}=h(),[j,M]=(0,y.useState)(`phone`),[N,P]=(0,y.useState)(``),[F,I]=(0,y.useState)(``),[L,R]=(0,y.useState)(``),[z,B]=(0,y.useState)(!1),[V,H]=(0,y.useState)(!1),[U,W]=(0,y.useState)(``);return(0,b.jsxs)(`div`,{className:`commons-landing`,children:[(0,b.jsx)(`style`,{children:D}),(0,b.jsxs)(`div`,{className:`cl-shell`,children:[(0,b.jsxs)(`main`,{className:`cl-main`,children:[(0,b.jsx)(`header`,{className:`cl-topbar`,children:(0,b.jsx)(`img`,{className:`cl-wordmark`,src:a,alt:`Commons`})}),(0,b.jsx)(`div`,{className:`cl-feed-header`,children:(0,b.jsx)(`div`,{children:(0,b.jsxs)(`h1`,{children:[`What's the `,(0,b.jsx)(`em`,{children:`plan?`})]})})}),(0,b.jsxs)(`section`,{className:`cl-stories`,"aria-labelledby":`cl-plans-heading`,children:[(0,b.jsxs)(`div`,{className:`cl-heading`,children:[(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`h2`,{id:`cl-plans-heading`,children:`Fresh moments`}),(0,b.jsx)(`span`,{children:`Catch them before they're gone`})]}),(0,b.jsx)(`button`,{onClick:()=>k(`Showing every moment`),children:`View all`})]}),(0,b.jsx)(`div`,{className:`cl-stories-row`,children:w.map(e=>(0,b.jsxs)(`button`,{className:`cl-story`,onClick:()=>S(e),children:[(0,b.jsx)(`video`,{src:e.video,muted:!0,loop:!0,autoPlay:!0,playsInline:!0,preload:`metadata`,"aria-label":`${e.name} moment`}),(0,b.jsx)(`span`,{className:`cl-story-shade`}),(0,b.jsx)(`span`,{className:`cl-story-badge`,children:e.badge}),(0,b.jsx)(`strong`,{children:e.name}),(0,b.jsx)(`small`,{children:e.when})]},e.name))})]}),(0,b.jsxs)(`section`,{className:`cl-feed`,children:[(0,b.jsxs)(`div`,{className:`cl-heading cl-compact`,children:[(0,b.jsxs)(`div`,{children:[(0,b.jsx)(`h2`,{children:`Inside Commons`}),(0,b.jsx)(`span`,{children:`Real communities, real plans`})]}),(0,b.jsxs)(`button`,{className:`cl-filter`,onClick:n,children:[(0,b.jsx)(`span`,{children:`Join in`}),`→`]})]}),(0,b.jsxs)(`div`,{className:`cl-gallery`,children:[(0,b.jsx)(`div`,{className:`cl-col`,children:T.filter((e,t)=>t%2==0).map(e=>(0,b.jsx)(`button`,{className:`cl-shot`,onClick:n,children:(0,b.jsx)(`img`,{src:e.src,alt:e.alt,loading:`lazy`})},e.src))}),(0,b.jsx)(`div`,{className:`cl-col`,children:T.filter((e,t)=>t%2==1).map(e=>(0,b.jsx)(`button`,{className:`cl-shot`,onClick:n,children:(0,b.jsx)(`img`,{src:e.src,alt:e.alt,loading:`lazy`})},e.src))})]})]})]}),(0,b.jsx)(`aside`,{className:`cl-panel`,children:(0,b.jsxs)(`div`,{className:`cl-login`,children:[j===`phone`?(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`h2`,{className:`cl-login-title`,children:`Log in or sign up`}),(0,b.jsx)(`p`,{className:`cl-login-sub`,children:`Enter your number and we'll text you a code. New here? This creates your account.`}),(0,b.jsxs)(`form`,{className:`cl-login-form`,onSubmit:async e=>{if(e.preventDefault(),W(``),!s(N)){W(`Enter a valid phone number.`);return}H(!0);try{let e=await u(`/api/auth/request-code`,{method:`POST`,body:JSON.stringify({phoneNumber:x(N)})});R(e.phoneNumber),B((e.authMode??(e.smsConfigured?`verify`:`dev`))===`dev`),I(``),M(`code`)}catch(e){W(c(e))}finally{H(!1)}},children:[(0,b.jsxs)(`label`,{children:[(0,b.jsx)(`span`,{children:`Phone number`}),(0,b.jsx)(`input`,{type:`tel`,inputMode:`tel`,autoComplete:`tel`,value:N,onChange:e=>P(_(e.target.value)),placeholder:`(555) 123-4567`,required:!0})]}),U&&(0,b.jsx)(`p`,{className:`cl-login-err`,children:U}),(0,b.jsx)(`button`,{className:`cl-login-submit`,type:`submit`,disabled:V,children:V?`Sending…`:`Continue`})]})]}):(0,b.jsxs)(b.Fragment,{children:[(0,b.jsx)(`h2`,{className:`cl-login-title`,children:`Enter your code`}),(0,b.jsxs)(`p`,{className:`cl-login-sub`,children:[`We texted a 6-digit code to `,_(L),`.`,z?` (dev mode — use 999999)`:``]}),(0,b.jsxs)(`form`,{className:`cl-login-form`,onSubmit:async t=>{t.preventDefault(),W(``);let n=F.replace(/\D/g,``);if(n.length<6){W(`Enter the 6-digit code.`);return}H(!0);try{let t=await u(`/api/auth/verify-code`,{method:`POST`,body:JSON.stringify({phoneNumber:L,code:n,attribution:m()})});t.token&&await l(t.token),A(t),g(t)&&p(),e(f(t)?`/onboarding`:`/`,{replace:!0})}catch(e){W(c(e).includes(`401`)?`That code didn't match. Try again.`:c(e))}finally{H(!1)}},children:[(0,b.jsxs)(`label`,{children:[(0,b.jsx)(`span`,{children:`Verification code`}),(0,b.jsx)(`input`,{inputMode:`numeric`,autoComplete:`one-time-code`,value:F,onChange:e=>I(e.target.value.replace(/\D/g,``).slice(0,6)),placeholder:`123456`,required:!0})]}),U&&(0,b.jsx)(`p`,{className:`cl-login-err`,children:U}),(0,b.jsx)(`button`,{className:`cl-login-submit`,type:`submit`,disabled:V,children:V?`Verifying…`:`Verify & continue`})]}),(0,b.jsxs)(`div`,{className:`cl-login-alt`,children:[(0,b.jsx)(`button`,{className:`cl-forgot`,onClick:async()=>{W(``),H(!0);try{await u(`/api/auth/request-code`,{method:`POST`,body:JSON.stringify({phoneNumber:L})}),k(`Code sent again`)}catch(e){W(c(e))}finally{H(!1)}},disabled:V,children:`Resend code`}),(0,b.jsx)(`button`,{className:`cl-forgot`,onClick:()=>{M(`phone`),I(``),W(``)},children:`Use a different number`})]})]}),(0,b.jsx)(`a`,{className:`cl-appstore`,href:o,target:`_blank`,rel:`noopener noreferrer`,onClick:()=>d(),children:(0,b.jsx)(`img`,{src:v,alt:`Download on the App Store`})}),(0,b.jsxs)(`p`,{className:`cl-terms`,children:[`By continuing, you agree to our`,` `,(0,b.jsx)(r,{to:`/legal/terms`,children:`Terms`}),` and `,(0,b.jsx)(r,{to:`/legal/privacy`,children:`Privacy Policy`}),`.`]})]})})]}),(0,b.jsxs)(`footer`,{className:`cl-footer`,children:[(0,b.jsxs)(`nav`,{className:`cl-foot-links`,children:[[`About`,`Communities`,`Plans`,`Guidelines`,`Safety`,`Support`,`Contact`].map(e=>(0,b.jsx)(`button`,{className:`cl-foot-link`,onClick:()=>k(`Coming soon`),children:e},e)),(0,b.jsx)(r,{to:`/legal/privacy`,className:`cl-foot-link`,children:`Privacy`}),(0,b.jsx)(r,{to:`/legal/terms`,className:`cl-foot-link`,children:`Terms`})]}),(0,b.jsx)(`p`,{className:`cl-foot-copy`,children:`© 2026 Commons`})]}),i&&(0,b.jsx)(`div`,{className:`cl-backdrop`,onClick:()=>S(null),children:(0,b.jsxs)(`div`,{className:`cl-story-viewer`,onClick:e=>e.stopPropagation(),children:[(0,b.jsx)(`video`,{src:i.video,autoPlay:!0,controls:!0,playsInline:!0,"aria-label":`${i.name} moment`}),(0,b.jsxs)(`div`,{className:`cl-story-viewer-top`,children:[(0,b.jsx)(`span`,{className:`cl-story-badge`,children:i.badge}),(0,b.jsx)(`strong`,{children:i.name}),(0,b.jsx)(`small`,{children:i.when}),(0,b.jsx)(`button`,{onClick:()=>S(null),"aria-label":`Close`,children:(0,b.jsx)(C,{name:`close`})})]}),(0,b.jsxs)(`div`,{className:`cl-story-join`,children:[(0,b.jsx)(`input`,{placeholder:`Say you're coming to ${i.name}…`}),(0,b.jsx)(`button`,{"aria-label":`Send`,children:(0,b.jsx)(C,{name:`send`})})]})]})}),E&&(0,b.jsxs)(`div`,{className:`cl-toast`,children:[(0,b.jsx)(C,{name:`spark`,size:16}),E]})]})}var D=`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700&display=swap');

.commons-landing {
  --ink: #141130;
  --muted: rgba(20,17,48,0.5);
  --paper: #EBE4DA;
  --panel: #F3EEE6;
  --card: #ffffff;
  --accent: #BF2B2B;
  --line: rgba(20,17,48,0.10);
  --D: 'Plus Jakarta Sans', sans-serif;
  --B: 'Poppins', sans-serif;

  min-height: 100vh;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--B);
}
.commons-landing *, .commons-landing *::before, .commons-landing *::after { box-sizing: border-box; }
.commons-landing button { cursor: pointer; font: inherit; }
.commons-landing input { font: inherit; }
.commons-landing img { display: block; max-width: 100%; }
.commons-landing ::selection { background: var(--accent); color: #fff; }
.commons-landing h1, .commons-landing h2 { margin: 0; font-family: var(--D); font-weight: 800; }

.cl-wordmark { height: 26px; width: auto; }

.cl-shell { display: grid; grid-template-columns: 55fr 45fr; min-height: 100vh; }

/* ---------- Left feed ---------- */
.cl-main { min-width: 0; padding: 34px clamp(28px, 4.5vw, 72px) 100px; border-right: 1px solid var(--line); }
.cl-topbar { display: flex; align-items: center; padding-bottom: 30px; }

.cl-feed-header { display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.cl-feed-header h1 { font-size: clamp(30px, 3.4vw, 44px); line-height: 1.04; letter-spacing: -0.045em; }
.cl-feed-header h1 em { color: var(--accent); font-style: normal; }

.cl-stories { margin-top: 36px; }
.cl-heading { display: flex; align-items: end; justify-content: space-between; margin-bottom: 16px; }
.cl-heading h2 { font-size: 17px; letter-spacing: -0.03em; }
.cl-heading span { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; }
.cl-heading > button { border: 0; background: transparent; color: var(--accent); font-size: 11px; font-weight: 600; }
.cl-stories-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.cl-story { position: relative; height: 240px; overflow: hidden; padding: 0; border: 0; border-radius: 18px; background: #ddd; color: #fff; text-align: left; transition: transform .2s, box-shadow .2s; }
.cl-story:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(20,17,48,.14); }
.cl-story img, .cl-story video { width: 100%; height: 100%; object-fit: cover; }
.cl-story-shade { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 35%, rgba(13,12,20,.62) 100%); }
.cl-story strong { position: absolute; left: 13px; bottom: 22px; right: 10px; font-size: 12px; font-family: var(--D); }
.cl-story small { position: absolute; left: 13px; bottom: 9px; font-size: 9px; opacity: .85; }
.cl-story-badge { position: absolute; top: 11px; left: 11px; width: 29px; height: 29px; display: grid; place-items: center; border: 2px solid #fff; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 800; font-family: var(--D); }

.cl-feed { margin-top: 36px; }
.cl-compact { margin-bottom: 14px; }
.cl-filter { display: flex; gap: 6px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--ink); font-size: 11px; }

/* Masonry gallery of real in-app screenshots — flows at natural height so no
   screenshot is ever clipped; the page scrolls to reveal them all while the
   login panel on the right stays pinned. */
.cl-gallery { display: flex; gap: 14px; }
.cl-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.cl-shot { display: block; width: 100%; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 16px; overflow: hidden; background: var(--card); box-shadow: 0 10px 30px rgba(20,17,48,.06); transition: transform .2s, box-shadow .2s; }
.cl-shot:hover { transform: translateY(-3px); box-shadow: 0 16px 38px rgba(20,17,48,.12); }
.cl-shot img { width: 100%; height: auto; display: block; }

/* ---------- Right login panel ---------- */
.cl-panel { position: sticky; top: 0; height: 100vh; padding: 40px clamp(24px, 3.5vw, 56px) 96px; background: var(--panel); overflow-y: auto; }
.cl-login { min-height: calc(100vh - 136px); max-width: 400px; margin: 0 auto; display: flex; flex-direction: column; justify-content: center; }
.cl-login-title { font-size: 27px; letter-spacing: -0.03em; margin-bottom: 8px; }
.cl-login-sub { margin: 0 0 24px; color: var(--muted); font-size: 13px; line-height: 1.6; }
.cl-login-err { margin: 0; color: var(--accent); font-size: 12px; font-weight: 600; }
.cl-login-alt { display: flex; align-items: center; justify-content: center; gap: 20px; margin-top: 14px; }
.cl-login-form { display: grid; gap: 13px; }
.cl-login-form label { display: grid; gap: 7px; color: #45425a; font-size: 11px; font-weight: 600; }
.cl-login-form input { width: 100%; padding: 14px 15px; border: 1px solid #d9d3ca; border-radius: 12px; outline: none; background: #fff; color: var(--ink); font-size: 13px; transition: border-color .2s, box-shadow .2s; }
.cl-login-form input::placeholder { color: #b0adb4; }
.cl-login-form input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(191,43,43,.12); }
.cl-login-submit { margin-top: 4px; padding: 14px; border: 0; border-radius: 12px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; transition: transform .2s, background .2s; }
.cl-login-submit:hover { background: #a62525; transform: translateY(-1px); }
.cl-forgot { padding: 4px; border: 0; background: transparent; color: var(--ink); font-size: 12px; font-weight: 600; }
.cl-forgot:disabled { color: #b7b3bb; }
.cl-appstore { display: block; margin: 24px auto 0; line-height: 0; }
.cl-appstore img { height: 46px; width: auto; }
.cl-terms { margin: 20px auto 0; max-width: 260px; color: #a9a4ac; font-size: 10px; line-height: 1.55; text-align: center; }
.cl-terms a { color: #77727f; text-decoration: underline; }

/* ---------- Story viewer modal ---------- */
.cl-backdrop { position: fixed; z-index: 50; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(20,17,48,.72); backdrop-filter: blur(8px); animation: cl-appear .2s ease; }
@keyframes cl-appear { from { opacity: 0; } }
.cl-story-viewer { position: relative; width: min(400px, 100%); height: min(700px, 88vh); overflow: hidden; border-radius: 22px; background: #111; color: #fff; }
.cl-story-viewer > img, .cl-story-viewer > video { width: 100%; height: 100%; object-fit: cover; }
.cl-story-viewer::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.42), transparent 26%, transparent 68%, rgba(0,0,0,.68)); pointer-events: none; }
.cl-story-viewer-top { position: absolute; z-index: 3; top: 20px; left: 16px; right: 16px; display: flex; align-items: center; gap: 10px; }
.cl-story-viewer-top .cl-story-badge { position: static; width: 34px; height: 34px; }
.cl-story-viewer-top strong { font-size: 13px; font-family: var(--D); }
.cl-story-viewer-top small { flex: 1; opacity: .7; font-size: 10px; }
.cl-story-viewer-top button { padding: 4px; border: 0; background: transparent; color: #fff; }
.cl-story-join { position: absolute; z-index: 3; left: 18px; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 8px; }
.cl-story-join input { flex: 1; padding: 13px 16px; border: 1px solid rgba(255,255,255,.55); border-radius: 30px; outline: 0; background: rgba(0,0,0,.2); color: #fff; font-size: 12px; }
.cl-story-join input::placeholder { color: rgba(255,255,255,.75); }
.cl-story-join button { padding: 6px; border: 0; background: transparent; color: #fff; }

/* ---------- Toast ---------- */
.cl-toast { position: fixed; z-index: 80; left: 50%; bottom: 28px; display: flex; align-items: center; gap: 8px; padding: 12px 17px; border-radius: 11px; background: var(--ink); color: #fff; box-shadow: 0 12px 35px rgba(0,0,0,.25); font-size: 12px; font-weight: 600; transform: translateX(-50%); animation: cl-toast-in .25s ease; }
.cl-toast svg { color: var(--accent); }
@keyframes cl-toast-in { from { opacity: 0; transform: translate(-50%, 10px); } }

/* ---------- Footer (sticky to the bottom of the viewport, fully centered) ---------- */
.cl-footer { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-top: 1px solid var(--line); padding: 13px 24px 14px; background: var(--paper); box-shadow: 0 -6px 24px rgba(20,17,48,.06); text-align: center; }
.cl-foot-links { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px 20px; }
.cl-foot-link { padding: 0; border: 0; background: transparent; color: var(--muted); font-size: 12px; font-weight: 500; text-decoration: none; }
.cl-foot-link:hover { color: var(--ink); text-decoration: underline; }
.cl-foot-copy { margin: 0; color: var(--muted); font-size: 12px; }

/* ---------- Responsive ---------- */
@media (max-width: 980px) {
  .cl-shell { grid-template-columns: 1fr; }
  /* Stacked: let the whole page scroll naturally instead of pinning the feed. */
  .cl-main { height: auto; overflow: visible; display: block; border-right: 0; padding: 30px clamp(20px, 5vw, 48px) 48px; }
  .cl-feed { display: block; }
  .cl-gallery { overflow: visible; min-height: 0; padding: 2px 0 0; }
  .cl-panel { position: static; height: auto; border-top: 1px solid var(--line); }
  .cl-login { min-height: 0; padding: 44px 0; }
  /* Inline, stacked footer on mobile — a fixed bar would eat too much of a small screen. */
  .cl-footer { position: static; box-shadow: none; gap: 14px; padding: 30px 24px 36px; }
}
@media (max-width: 560px) {
  .cl-main { padding: 22px 18px 40px; }
  .cl-stories-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; scrollbar-width: none; }
  .cl-stories-row::-webkit-scrollbar { display: none; }
  .cl-story { flex: 0 0 150px; height: 200px; }
}
`;export{E as NewLandingPage};