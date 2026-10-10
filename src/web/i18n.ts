// Minimal UI strings in English, Hindi and Kannada. Donor-facing strings are translated;
// hospital/steward consoles stay in English (staff tooling). Translations were drafted for the
// hackathon and should be reviewed by native speakers before real use.

export type Lang = "en" | "hi" | "kn"

const S = {
  tagline: {
    en: "Verified blood requests that disappear when the need does.",
    hi: "सत्यापित रक्त अनुरोध, जो ज़रूरत ख़त्म होते ही अपने‑आप हट जाते हैं।",
    kn: "ಅಗತ್ಯ ಮುಗಿದಾಗ ತಾನಾಗಿಯೇ ಮಾಯವಾಗುವ ಪರಿಶೀಲಿತ ರಕ್ತ ವಿನಂತಿಗಳು.",
  },
  tabFeed: { en: "Needed near me", hi: "मेरे पास ज़रूरत", kn: "ನನ್ನ ಹತ್ತಿರ ಅಗತ್ಯ" },
  tabDonations: { en: "My donations", hi: "मेरे दान", kn: "ನನ್ನ ದಾನಗಳು" },
  tabHospital: { en: "Hospital desk", hi: "अस्पताल डेस्क", kn: "ಆಸ್ಪತ್ರೆ ಡೆಸ್ಕ್" },
  tabSteward: { en: "Steward", hi: "स्टीवर्ड", kn: "ಸ್ಟೀವರ್ಡ್" },
  tabAbout: { en: "How it works", hi: "यह कैसे काम करता है", kn: "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ" },
  myGroup: { en: "My blood group", hi: "मेरा ब्लड ग्रुप", kn: "ನನ್ನ ರಕ್ತದ ಗುಂಪು" },
  anyGroup: { en: "Any (show all)", hi: "कोई भी (सब दिखाएँ)", kn: "ಯಾವುದಾದರೂ (ಎಲ್ಲಾ)" },
  area: { en: "Area", hi: "क्षेत्र", kn: "ಪ್ರದೇಶ" },
  useLocation: { en: "Use my location", hi: "मेरी लोकेशन", kn: "ನನ್ನ ಸ್ಥಳ" },
  radius: { en: "Within", hi: "दूरी", kn: "ಅಂತರ" },
  urgencyFilter: { en: "Urgency", hi: "तात्कालिकता", kn: "ತುರ್ತು" },
  all: { en: "All", hi: "सभी", kn: "ಎಲ್ಲಾ" },
  critical: { en: "Critical", hi: "गंभीर", kn: "ತೀವ್ರ" },
  urgent: { en: "Urgent", hi: "तत्काल", kn: "ತುರ್ತು" },
  planned: { en: "Planned", hi: "नियोजित", kn: "ಯೋಜಿತ" },
  search: { en: "Search", hi: "खोजें", kn: "ಹುಡುಕಿ" },
  noResults: {
    en: "No open, verified requests match. That is good news.",
    hi: "कोई खुला सत्यापित अनुरोध नहीं मिला। यह अच्छी ख़बर है।",
    kn: "ಯಾವುದೇ ತೆರೆದ ಪರಿಶೀಲಿತ ವಿನಂತಿ ಇಲ್ಲ. ಇದು ಒಳ್ಳೆಯ ಸುದ್ದಿ.",
  },
  pledge: { en: "I'm going to donate", hi: "मैं दान करने जा रहा/रही हूँ", kn: "ನಾನು ದಾನ ಮಾಡಲು ಹೋಗುತ್ತಿದ್ದೇನೆ" },
  share: { en: "Share on WhatsApp", hi: "WhatsApp पर भेजें", kn: "WhatsApp ನಲ್ಲಿ ಹಂಚಿ" },
  open: { en: "Open", hi: "खोलें", kn: "ತೆರೆಯಿರಿ" },
  units: { en: "units", hi: "यूनिट", kn: "ಯೂನಿಟ್" },
  neededBy: { en: "Needed by", hi: "कब तक चाहिए", kn: "ಬೇಕಾದ ಸಮಯ" },
  endsIn: { en: "Disappears in", hi: "हटने में बाकी", kn: "ಮಾಯವಾಗಲು" },
  verifiedBy: { en: "Verified blood centre", hi: "सत्यापित ब्लड सेंटर", kn: "ಪರಿಶೀಲಿತ ರಕ್ತ ಕೇಂದ್ರ" },
  goTo: { en: "Go to", hi: "यहाँ जाएँ", kn: "ಇಲ್ಲಿಗೆ ಹೋಗಿ" },
  quoteRef: { en: "Quote this slip number at the counter", hi: "काउंटर पर यह स्लिप नंबर बताएं", kn: "ಕೌಂಟರ್‌ನಲ್ಲಿ ಈ ಸ್ಲಿಪ್ ಸಂಖ್ಯೆ ತಿಳಿಸಿ" },
  noMoney: {
    en: "Never pay anyone for blood or a donor. Donate only at the blood centre named here.",
    hi: "रक्त या डोनर के लिए कभी किसी को पैसे न दें। केवल यहाँ बताए ब्लड सेंटर पर ही दान करें।",
    kn: "ರಕ್ತ ಅಥವಾ ದಾನಿಗಾಗಿ ಯಾರಿಗೂ ಹಣ ಕೊಡಬೇಡಿ. ಇಲ್ಲಿ ತಿಳಿಸಿದ ರಕ್ತ ಕೇಂದ್ರದಲ್ಲಿ ಮಾತ್ರ ದಾನ ಮಾಡಿ.",
  },
  ended: {
    en: "This request has ended. Please STOP forwarding it.",
    hi: "यह अनुरोध समाप्त हो चुका है। कृपया इसे आगे फ़ॉरवर्ड न करें।",
    kn: "ಈ ವಿನಂತಿ ಮುಗಿದಿದೆ. ದಯವಿಟ್ಟು ಇದನ್ನು ಮುಂದೆ ಕಳುಹಿಸಬೇಡಿ.",
  },
  fulfilled: {
    en: "Fulfilled. Thank you! Please stop forwarding.",
    hi: "ज़रूरत पूरी हुई। धन्यवाद! कृपया फ़ॉरवर्ड करना बंद करें।",
    kn: "ಅಗತ್ಯ ಪೂರೈಸಲಾಗಿದೆ. ಧನ್ಯವಾದಗಳು! ದಯವಿಟ್ಟು ಮುಂದೆ ಕಳುಹಿಸಬೇಡಿ.",
  },
  unverified: {
    en: "NOT from a verified blood centre. Do not act on it and do not forward it.",
    hi: "यह सत्यापित ब्लड सेंटर से नहीं है। इस पर भरोसा न करें, फ़ॉरवर्ड न करें।",
    kn: "ಇದು ಪರಿಶೀಲಿತ ರಕ್ತ ಕೇಂದ್ರದಿಂದ ಅಲ್ಲ. ನಂಬಬೇಡಿ, ಮುಂದೆ ಕಳುಹಿಸಬೇಡಿ.",
  },
  pledges: { en: "donors on the way", hi: "डोनर रास्ते में", kn: "ದಾನಿಗಳು ದಾರಿಯಲ್ಲಿ" },
  connect: { en: "Connect wallet", hi: "वॉलेट जोड़ें", kn: "ವಾಲೆಟ್ ಸಂಪರ್ಕಿಸಿ" },
  eligibleAgain: { en: "You may be eligible again from", hi: "आप फिर से दान कर सकते हैं", kn: "ಮತ್ತೆ ದಾನ ಮಾಡಬಹುದು" },
} as const

export type Key = keyof typeof S
let lang: Lang = (localStorage.getItem("rr_lang") as Lang) || "en"

export function t(k: Key): string {
  return S[k][lang] ?? S[k].en
}
export function getLang(): Lang {
  return lang
}
export function setLang(l: Lang) {
  lang = l
  localStorage.setItem("rr_lang", l)
  document.documentElement.lang = l
}
