# Demo video script (target 2:50, hard limit 3:00)

**Setup before recording**
- Run `npm run seed` **within 10 minutes of recording**, because the `NM-2203` request is built to expire about 15 minutes after seeding.
- Two browser windows side by side: **left = donor** (phone-sized, DevTools device mode, test key = `DONOR_KEY`); **right = hospital desk** (test key = `HOSPITAL_1_KEY`).
- Keep a tab open on the Tiramisu explorer, plus the WhatsApp Web share dialog (or just the `wa.me` preview).
- Free recorder: OBS Studio or the Windows Game Bar (Win+G) / macOS (Cmd+Shift+5). Edit in Clipchamp (free) or upload raw.

| Time | Screen | Voice-over (say roughly this) |
|---|---|---|
| 0:00–0:20 | Phone screenshot of a typical "URGENT O-ve blood needed, call 98xxxxxxx" forward (make your own mock, no real numbers) | "In India, blood requests travel as WhatsApp forwards. They keep circulating for weeks after the need is over, they leak the family's phone number to scammers who ask for 'donor travel money', and you can't tell a real request from a fake one." |
| 0:20–0:35 | App home, language switch EN → हिन्दी → ಕನ್ನಡ | "Rakt Relay fixes three things: requests expire when the need does, only verified blood centres can post, and there's no phone number to leak. It's a static site. All the data lives on Arkiv, the Web3 database. In English, Hindi and Kannada." |
| 0:35–1:05 | Donor window: group O-, Bengaluru, 25 km, Search. Expand "Arkiv query sent by this page" | "I'm an O-negative donor in Bengaluru. This is one Arkiv query: compatible blood groups as an OR, urgency as a numeric range, a lat/long bounding box, and only entities whose on-chain creator is a steward-verified hospital." |
| 1:05–1:30 | Open the O- request page. Point at the ✓ badge, "Go to Blood Centre counter", slip number, "Disappears in", the "Why you can trust this page" box with explorer links | "No patient name, no phone. I walk to the counter and quote the slip number. Here's the proof: the request's creator wallet, the steward attestation, and when Arkiv will expire it." |
| 1:30–1:50 | Donor taps "I'm going to donate" → toast with tx link. **Right window** (hospital desk) shows the pledge appear live | "I pledge. The hospital desk updates instantly. That's an Arkiv WebSocket event subscription, not a refresh loop. Pledges expire after six hours, so this count never lies." |
| 1:50–2:15 | Hospital clicks "Confirm donation" → toast → donor window "My donations" shows the receipt with ✓ issued by verified centre and next-eligible date | "When I've donated, the hospital confirms it in one atomic batch: it creates a read-only receipt, bumps the units counter and transfers the receipt to my wallet. I own it, and anyone can verify who issued it." |
| 2:15–2:35 | Open the imposter link `#/r/<fakeRequest>` → red "NOT from a verified blood centre". Then the NM-2203 link → "This request has ended. Please stop forwarding it." | "Here's a scammer who copied every field. Same attributes, wrong creator, so it's rejected. And this request's deadline has passed. Arkiv expired it, so the forwarded link now tells people to stop forwarding." |
| 2:35–2:50 | Hospital clicks "Still needed: extend 12h" → toast. End card: repo URL, live URL | "A hospital can renew a still-open request. That's an Arkiv lifetime extension, driven by a human check. Rakt Relay: verified blood requests that disappear when the need does. Open source, MIT, on Arkiv." |

**Rules:** keep it under 3:00 (judges enforce this), show only synthetic data, and do not show `.env` or any private key on screen. When pasting test keys into the app, do it off-camera.
