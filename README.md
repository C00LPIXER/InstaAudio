# InstaAudio Downloader

> 🎙 Download & play voice messages from Instagram DM chats — right from your browser.

![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![Version](https://img.shields.io/badge/version-3.0-green)

## Features

- ✅ **Auto-captures** voice messages when you open an Instagram DM chat
- ▶️ **Play audio** directly in the extension popup — no need to open Instagram
- ⬇️ **Download** individual voice messages or all at once
- 🔁 **Auto-detects** when you switch chats and refreshes the list
- 🔒 **100% private** — no data leaves your browser, no accounts needed
- 📊 **Badge counter** shows how many voice messages are in the current chat
- 🎨 Beautiful dark-themed UI

## How It Works

1. Install the extension
2. Open an Instagram DM conversation that has voice messages
3. Click the InstaAudio icon in your toolbar
4. Play ▶ or Download ⬇ any voice message!

## Screenshots

*(Add screenshots of the popup showing voice messages with play/download buttons)*

## Installation

### From Chrome Web Store
1. Visit the [Chrome Web Store listing](#) *(link coming soon)*
2. Click **Add to Chrome**

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `InstaAudio` folder
5. Navigate to Instagram DM and start downloading!

## Permissions

| Permission | Reason |
|---|---|
| `webRequest` | Detect voice message URLs from network requests |
| `downloads` | Save audio files to your computer |
| `activeTab` + `tabs` | Match captured audio to the correct tab |
| CDN host permissions | Fetch audio for in-popup playback |

## Privacy

We take your privacy seriously. This extension:
- ❌ Does NOT collect any user data
- ❌ Does NOT send data to external servers
- ❌ Does NOT access your Instagram account
- ❌ Does NOT use analytics or tracking
- ✅ Operates 100% locally in your browser

Read our full [Privacy Policy](PRIVACY_POLICY.md).

## Support the Project

If you find InstaAudio useful, consider supporting development:

☕ [Buy Me a Coffee](https://buymeacoffee.com/amalkrishnap)

## Tech Stack

- Chrome Manifest V3
- Vanilla JavaScript (no frameworks, no dependencies)
- Service Worker for background processing

## License

MIT License — see [LICENSE](LICENSE) for details.

---

*InstaAudio is not affiliated with, endorsed by, or connected to Instagram or Meta Platforms, Inc.*
