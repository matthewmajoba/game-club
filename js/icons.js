// Pixel icons from Pixelarticons by Gerrit Halfmann (MIT license, https://pixelarticons.com).
// Only the icons the site uses, copied in so nothing loads from outside. Add more with the same shape.
const P = {
  "angry": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 7h2v2H7zm2 2h2v2H9zm6-2h2v2h-2zm-2 2h2v2h-2zm-6 6h2v2H7zm2-2h6v2H9zm6 2h2v2h-2z",
  "annoyed": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 8h3v2H7zm7 0h3v2h-3zm-7 6h10v2H7z",
  "bug": "M2 5h2v4H2zm20 0h-2v4h2zM4 9h2v2H4zm16 0h-2v2h2zM2 13h4v2H2zm20 0h-4v2h4zM4 17h2v2H4zm16 0h-2v2h2zM2 19h2v2H2zm20 0h-2v2h2zM6 11h12v2H6z M6 7h2v12H6zm10 0h2v12h-2zM8 19h8v2H8zM8 5h8v2H8z M11 15h2v6h-2zM8 1h2v6H8zm6 0h2v6h-2z",
  "cancel": "M6 2h12v2H6zm0 18h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zm-2-2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2H8zm-2 2h2v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4z",
  "check": "M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z",
  "clapperboard": "M4 3h16v2H4zm0 6h16v2H4zM2 5h2v14H2zm18 0h2v14h-2zM4 19h16v2H4zM18 7h-2v2h2zm-8 0H8v2h2zm6-2h-2v2h2zM8 5H6v2h2z",
  "crown": "M3 3h2v12H3zm16 0h2v12h-2zm-8 0h2v2h-2zM9 5h2v2H9zM5 5h2v2H5z M3 3h2v2H3zm4 4h2v2H7zm6-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zM5 15h14v2H5zm-2 4h18v2H3z",
  "door-closed": "M3 19h18v2H3zM5 5h2v14H5zm2-2h10v2H7zm10 2h2v14h-2zm-8 6h2v2H9z",
  "external-link": "M11 5H5v2h6V5ZM5 7H3v12h2V7Zm12 12H5v2h12v-2Zm2-6h-2v6h2v-6Zm-8 0H9v2h2v-2Zm2-2h-2v2h2v-2Zm2-2h-2v2h2V9Zm2-2h-2v2h2V7Zm2-2h-2v2h2V5Zm2-2h-2v8h2V3Z M21 3h-8v2h8V3Z",
  "eye": "M16 20H8v-2h8v2Zm-8-2H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 16H2v-2h2v2Zm10-6h-2v2h2v-2h2v4h-2v2h-4v-2H8v-4h2V8h4v2Zm8 6h-2v-2h2v2ZM2 14H0v-4h2v4Zm22 0h-2v-4h2v4ZM4 10H2V8h2v2Zm18 0h-2V8h2v2ZM8 8H4V6h4v2Zm12 0h-4V6h4v2Zm-4-2H8V4h8v2Z",
  "fire": "M9 2h2v4H9zM7 6h2v2H7zM5 8h2v2H5zm8 2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v6h-2zM3 10h2v8H3zm8-4h2v4h-2zm6 12h2v2h-2zM7 20h10v2H7zm-2-2h2v2H5zm4-2h6v4H9z M11 14h2v3h-2z",
  "gamepad": "M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z",
  "hand": "M21 7h2v5h-2zm-4-2h2v7h-2zm-4-2h2v8h-2zM9 3h2v8H9zM5 5h2v8H5zm14 0h2v2h-2zm-4-2h2v2h-2zm-4-2h2v2h-2zM7 3h2v2H7zm-4 8h2v2H3zm-2 2h2v2H1zm0 2h2v2H1zm2 2h2v2H3zm2 2h2v2H5zm2 2h12v2H7zm12-2h2v2h-2zm2-7h2v7h-2zM5 13h2v2H5zm2 2h2v2H7z",
  "heart": "M13 22h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 16H5v-2h2v2Zm12 0h-2v-2h2v2ZM5 14H3v-2h2v2Zm16 0h-2v-2h2v2ZM3 12H1V6h2v6Zm20 0h-2V6h2v6ZM13 8h-2V6h2v2ZM5 6H3V4h2v2Zm6 0H9V4h2v2Zm4 0h-2V4h2v2Zm6 0h-2V4h2v2ZM9 4H5V2h4v2Zm10 0h-4V2h4v2Z",
  "joystick": "M4 14h16v2H4zm0 6h16v2H4zm-2-4h2v4H2zm18 0h2v4h-2zM10 2h4v2h-4zM8 4h2v4H8zm6 0h2v4h-2zm-4 4h4v2h-4zm1 2h2v4h-2zm-4 2h2v2H7z",
  "laugh": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 14h2v2H7zm0-2h10v2H7zm2 4h6v2H9zm6-2h2v2h-2zM8 8h2v2H8zm6 0h2v2h-2z",
  "login": "M2 11h14v2H2zm10-2h2v2h-2z M10 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v5H4zm0 11h2v5H4zM18 4h2v16h-2z",
  "logout": "M8 11h12v2H8zm8-2h2v2h-2z M14 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v16H4zm14 0h2v3h-2zm0 13h2v3h-2z",
  "meh": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 14h10v2H7zm1-6h2v2H8zm6 0h2v2h-2z",
  "message": "M20 2H4v2h16zm0 14H6v2h14zm2-12h-2v12h2zM4 4H2v18h2zm2 14H4v2h2z",
  "play": "M15 11h-2V9h2zm0 4h-2v-2h2zm-2 2h-2v-2h2zm0-8h-2V7h2zm-2-2H9V5h2zM9 21H7V3h2zm6-8h2v-2h-2zm-6 4h2v2H9z",
  "scroll-vertical": "M21 8h-2V4h2zM5 8H3V4h2zm16 6h-2v-4h2zM5 14H3v-4h2zm16 6h-2v-4h2zM5 20H3v-4h2zm10-2H9v2h6z M13 2h-2v20h2z M17 16H7v2h10zM15 6H9V4h6zm2 2H7V6h10z",
  "settings-cog": "M4 20h3v-2h4v4h2v-4h4v2h-2v4H9v-4H7v2H2v-5h2v3Zm18 2h-5v-2h3v-3h2v5ZM6 11H2v2h4v4H4v-2H0V9h4V7h2v4Zm14-2h4v6h-4v2h-2v-4h4v-2h-4V7h2v2Zm-6 7h-4v-2h4v2Zm-4-2H8v-4h2v4Zm6 0h-2v-4h2v4Zm-2-4h-4V8h4v2ZM7 4H4v3H2V2h5v2Zm8 0h2V2h5v5h-2V4h-3v2h-4V2h-2v4H7V4h2V0h6v4Z",
  "smile": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 13h2v2H7zm2 2h6v2H9zm6-2h2v2h-2zM8 8h2v2H8zm6 0h2v2h-2z",
  "snowflake-solid": "M13 24h-2v-2h2v2Zm-2-2H9v-2H7v2H2v-5h2v3h3v-2h2v-2h2v6Zm4-4h2v2h-2v2h-2v-6h2v2Zm7 4h-5v-2h3v-3h2v5ZM8 15H6v2H4v-2H2v-2h6v2Zm14 0h-2v2h-2v-2h-2v-2h6v2Zm-8-1h-4v-4h4v4ZM2 13H0v-2h2v2Zm22 0h-2v-2h2v2ZM6 9h2v2H2V9h2V7h2v2Zm14 0h2v2h-6V9h2V7h2v2Zm-9-1H9V6H7V4h2V2h2v6Zm4-4h2V2h5v5h-2V4h-3v2h-2v2h-2V2h2v2ZM7 4H4v3H2V2h5v2Zm6-2h-2V0h2v2Z",
  "snowflake": "M13 24h-2v-2h2v2Zm-2-2H9v-2H7v2H2v-5h2v3h3v-2h2v-2h2v6Zm4-4h2v2h-2v2h-2v-6h2v2Zm7 4h-5v-2h3v-3h2v5ZM4 15H2v-2h6v2H6v2H4v-2Zm18 0h-2v2h-2v-2h-2v-2h6v2ZM2 13H0v-2h2v2Zm22 0h-2v-2h2v2ZM6 9h2v2H2V9h2V7h2v2Zm14 0h2v2h-6V9h2V7h2v2Zm-9-1H9V6H7V4h2V2h2v6Zm4-4h2V2h5v5h-2V4h-3v2h-2v2h-2V2h2v2ZM7 4H4v3H2V2h5v2Zm6-2h-2V0h2v2Z",
  "sparkle": "M11 1h2v4h-2zm0 22h2v-4h-2zM9 5h2v4H9zm0 14h2v-4H9zm4-14h2v4h-2zm0 14h2v-4h-2zM5 9h4v2H5zm14 0h-4v2h4zM1 11h4v2H1zm22 0h-4v2h4zM5 13h4v2H5zm14 0h-4v2h4z",
  "sparkles": "M11 1h2v4h-2zm0 22h2v-4h-2zM9 5h2v4H9zm0 14h2v-4H9zm4-14h2v4h-2zm0 14h2v-4h-2zM5 9h4v2H5zm14 0h-4v2h4zM1 11h4v2H1zm22 0h-4v2h4zM5 13h4v2H5zm14 0h-4v2h4zm0-12h2v6h-2z M17 3h6v2h-6zM3 17h2v2H3zm-2 2h2v2H1zm2 2h2v2H3zm2-2h2v2H5z",
  "spotlight": "M19 2H5v2h14V2Zm0 18H5v2h14v-2ZM5 4H3v16h2V4Zm16 0h-2v16h2V4Zm-8 2H7v2h6V6Zm-4 4H7v8h2v-8Zm8 0h-2v8h2v-8Zm-8 0h6v2H9zm0 6h6v2H9z",
  "star": "M5 20H8V22H3V16H5V20ZM21 22H16V20H19V16H21V22ZM10 20H8V18H10V20ZM16 20H14V18H16V20ZM14 18H10V16H14V18ZM7 16H5V13H7V16ZM19 16H17V13H19V16ZM5 13H3V11H5V13ZM21 13H19V11H21V13ZM9 9H3V11H1V7H9V9ZM23 11H21V9H15V7H23V11ZM11 7H9V3H11V7ZM15 7H13V3H15V7ZM13 3H11V1H13V3Z",
  "sun-solid": "M13 22h-2v-3h2v3Zm-6-3H5v-2h2v2Zm12 0h-2v-2h2v2ZM15 9h2v6h-2v2H9v-2H7V9h2V7h6v2ZM5 13H2v-2h3v2Zm17 0h-3v-2h3v2ZM7 7H5V5h2v2Zm12 0h-2V5h2v2Zm-6-2h-2V2h2v3Z",
  "sunglasses": "M15 10h5v2h-5zM4 10h5v2H4zm16 2h2v5h-2zM9 12h2v5H9zm4 0h2v5h-2zM2 12h2v5H2zm13 5h5v2h-5zM4 17h5v2H4zm7-5h2v2h-2zM2 6h2v6H2zm18 0h2v6h-2zM4 4h2v2H4zm14 0h2v2h-2zM6 12h3v2H6zm11 0h3v2h-3zM4 14h2v3H4zm11 0h2v3h-2zm-9 2h3v1H6zm11 0h3v1h-3zm-9-2h1v2H8zm11 0h1v2h-1z",
  "thermometer": "M9 2h6v2H9zm0 18h6v2H9zm2-4h2v2h-2zM7 4h2v16H7zm8 0h2v16h-2z M5 16h4v2H5zM5 6h4v2H5zm0 5h4v2H5z",
  "trophy": "M16 17H13V19H15V21H9V19H11V17H8V15H16V17ZM18 5H22V11H20V7H18V11H20V13H18V15H16V5H8V15H6V13H4V11H6V7H4V11H2V5H6V3H18V5Z",
  "zap": "M4 13h8v6h2v2h-2v2h-2v-8H2v-4h2v2Zm12 6h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2v-2h2v2Zm-6-6h8v4h-2v-2h-8V5h-2V3h2V1h2v8Zm-8 2H4V9h2v2Zm2-2H6V7h2v2Zm2-2H8V5h2v2Z"
};
const NS = "http://www.w3.org/2000/svg";
// icon("fire") -> a 1em pixel icon that takes the text color; pass a class for extra styling
export function icon(name, cls = "") {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", ("pi pi-" + name + " " + cls).trim());
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", P[name] || "");
  svg.append(p);
  return svg;
}

// emoji that show up in saved text (chat system lines, the log) -> pixel icon
const EMOJI = { "🎮": "gamepad", "✅": "check", "🏆": "trophy", "🕹️": "joystick", "🕹": "joystick", "😤": "angry", "🚫": "cancel", "🔥": "fire", "👋": "hand", "🚪": "door-closed" };
const RE = /(🕹️|🕹|🎮|✅|🏆|😤|🚫|🔥|👋|🚪)/u;
// split a saved string into text + icons, so old messages match the new look
export function withIcons(text) {
  return String(text).split(RE).filter((x) => x !== "").map((x) => (EMOJI[x] ? icon(EMOJI[x], "em-" + EMOJI[x]) : x));
}
