const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_cid', 'mc_eid'
]);

function trimTrailingPunctuation(value) {
  return value.replace(/[),.;!?\]}]+$/g, '');
}

export function normalizeResourceUrl(rawUrl) {
  const url = new URL(trimTrailingPunctuation(rawUrl.trim()));
  url.hash = '';

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }

  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')) {
    url.port = '';
  }

  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  const sortedParams = [...url.searchParams.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey.localeCompare(bKey) || aValue.localeCompare(bValue));
  url.search = '';
  for (const [key, value] of sortedParams) {
    url.searchParams.append(key, value);
  }

  return url.toString();
}

function parseMessageHeader(line) {
  const patterns = [
    /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+-\s+([^:]+):\s?(.*)$/,
    /^\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\]?\s+([^:]+):\s?(.*)$/
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      return {
        date: match[1],
        time: match[2],
        sender: match[3].trim(),
        text: match[4] || ''
      };
    }
  }
  return null;
}

function parseSpanishDate(date, time) {
  const [day, month, rawYear] = date.split('/').map(Number);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const [hours, minutes] = time.split(':').map(Number);
  const value = new Date(year, month - 1, day, hours, minutes);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

export function extractWhatsAppLinks(chatText) {
  const messages = [];
  let current = null;

  for (const line of chatText.replace(/\r\n/g, '\n').split('\n')) {
    const header = parseMessageHeader(line);
    if (header) {
      if (current) messages.push(current);
      current = {
        senderName: header.sender,
        sharedAt: parseSpanishDate(header.date, header.time),
        messageText: header.text
      };
    } else if (current) {
      current.messageText += `\n${line}`;
    }
  }
  if (current) messages.push(current);

  const seen = new Map();
  for (const message of messages) {
    const urls = message.messageText.match(URL_PATTERN) || [];
    for (const originalUrl of urls) {
      try {
        const normalizedUrl = normalizeResourceUrl(originalUrl);
        const existing = seen.get(normalizedUrl);
        if (existing) {
          existing.occurrences += 1;
          continue;
        }
        seen.set(normalizedUrl, {
          originalUrl: trimTrailingPunctuation(originalUrl),
          normalizedUrl,
          senderName: message.senderName,
          sharedAt: message.sharedAt,
          messageText: message.messageText.trim(),
          occurrences: 1
        });
      } catch {
        // Las URL mal formadas se ignoran en la extracción inicial.
      }
    }
  }

  return [...seen.values()];
}

export async function readWhatsAppExport(file) {
  if (!(file instanceof File)) {
    throw new TypeError('Se esperaba un archivo de exportación de WhatsApp.');
  }
  if (!file.name.toLowerCase().endsWith('.txt')) {
    throw new Error('La primera versión solo admite exportaciones .txt sin multimedia.');
  }
  return extractWhatsAppLinks(await file.text());
}
