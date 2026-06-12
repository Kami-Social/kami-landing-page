# Invite page — Play Store / App Store CTA (archived)

Restore this when Google Play and iOS listings are live. Replace the temporary `/#download` hero CTA in `invite/index.html` with the snippets below, and wire up referral-code deep linking in the script section.

## Hero HTML (Google Play badge)

```html
<div class="store-row">
  <a class="google-play" href="https://play.google.com/store/apps/details?id=com.kami.mvp" aria-label="Get Kami on Google Play">
    <span class="play-triangle"></span>
    <span class="store-copy"><span class="small">Get it on</span><span class="big">Google Play</span></span>
  </a>
</div>
```

## Hero CSS

```css
.store-row { display:flex; gap:18px; flex-wrap:wrap; margin:30px 0 24px; }
.google-play {
  display:inline-flex;align-items:center;gap:14px;min-width:245px;min-height:78px;border-radius:12px;padding:13px 20px;
  border:1px solid rgba(216,180,254,.82);background:rgba(0,0,0,.66);color:#fff;text-decoration:none;
  box-shadow:0 0 32px rgba(139,92,246,.16);transition:transform .18s ease,box-shadow .18s ease;
}
.google-play:hover{transform:translateY(-2px);box-shadow:0 12px 44px rgba(139,92,246,.24)}
.play-triangle{width:34px;height:34px;background:conic-gradient(from 210deg,#00d1ff,#35d46b,#ffd54a,#ff3f80,#00d1ff);clip-path:polygon(0 0,100% 50%,0 100%);filter:saturate(1.1)}
.store-copy .small{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.02em;opacity:.86}
.store-copy .big{display:block;font-size:28px;font-weight:750;letter-spacing:-.045em;line-height:1.05}
```

Mobile override:

```css
@media(max-width:560px){
  .google-play{min-width:100%;justify-content:center}
}
```

## Nav / footer Play Store links (pre-temporary CTA)

```html
<a href="https://play.google.com/store/apps/details?id=com.kami.mvp" class="btn nav-download">Download Kami</a>
<!-- mobile menu -->
<a href="https://play.google.com/store/apps/details?id=com.kami.mvp" class="btn mobile-download">Download Kami</a>
<!-- footer -->
<a class="btn footer-download" href="https://play.google.com/store/apps/details?id=com.kami.mvp">Download Kami</a>
```

## Planned JS — referral-aware store links

When listings are live, set store URLs from the invite `code` (already read by `readInviteCode()` in `invite/index.html`). Example pattern:

```javascript
const PLAY_STORE_BASE = "https://play.google.com/store/apps/details?id=com.kami.mvp";
const APP_STORE_BASE = "https://apps.apple.com/app/idXXXXXXXXX"; // fill when live

function buildPlayStoreUrl(inviteCode) {
  const url = new URL(PLAY_STORE_BASE);
  if (inviteCode) url.searchParams.set("referrer", `invite_code=${encodeURIComponent(inviteCode)}`);
  return url.toString();
}

function buildAppStoreUrl(inviteCode) {
  // Use App Store campaign / custom product page params when available
  return inviteCode ? `${APP_STORE_BASE}?invite=${encodeURIComponent(inviteCode)}` : APP_STORE_BASE;
}

const playLink = document.querySelector(".google-play");
if (playLink) playLink.href = buildPlayStoreUrl(code);
// Repeat for iOS badge and nav/footer download links as needed.
```

`kami://invite/${code}` deep link for “Already have the app?” is unchanged and remains active.
