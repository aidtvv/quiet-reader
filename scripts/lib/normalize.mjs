const LETTER = /[A-Za-z]/;

export function expandHeadword(name) {
  const source = String(name ?? "").trim();
  if (!source) return [];

  const out = new Set();
  for (const rawPart of source.split("/")) {
    const part = rawPart.trim();
    if (!part) continue;

    const stripped = part.replace(/\(([^)]*)\)/g, "").trim();
    const expanded = part.replace(/\(([^)]*)\)/g, "$1").trim();

    if (LETTER.test(stripped) && !stripped.includes("(")) out.add(stripped);
    if (LETTER.test(expanded) && !expanded.includes(")")) out.add(expanded);
  }

  return [...out];
}

export function normalizeEntries(raw) {
  const map = new Map();
  const order = [];

  for (const item of raw ?? []) {
    const trans = Array.isArray(item.trans)
      ? item.trans.filter((line) => typeof line === "string" && line.trim())
      : [];
    for (const variant of expandHeadword(item.name)) {
      const key = variant.toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        for (const line of trans) {
          if (!existing.trans.includes(line)) existing.trans.push(line);
        }
        if (!existing.usphone && item.usphone) existing.usphone = item.usphone;
        if (!existing.ukphone && item.ukphone) existing.ukphone = item.ukphone;
        continue;
      }
      const entry = {
        name: variant,
        trans: [...trans],
        ...(item.usphone ? { usphone: item.usphone } : {}),
        ...(item.ukphone ? { ukphone: item.ukphone } : {}),
      };
      map.set(key, entry);
      order.push(key);
    }
  }

  return order.map((key) => map.get(key));
}

export function parseLemmaFile(text, headwords) {
  const result = {};
  const freqByVariant = new Map();
  const heads = headwords instanceof Set ? headwords : new Set(headwords);

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";")) continue;

    const match = line.match(/^([^/]+?)(?:\/(\d+))?\s*->\s*(.+)$/);
    if (!match) continue;

    const lemma = match[1].trim().toLowerCase();
    const freq = Number(match[2] ?? 0);
    if (!LETTER.test(lemma) || !heads.has(lemma)) continue;

    for (const rawVariant of match[3].split(",")) {
      const variant = rawVariant.trim().toLowerCase();
      if (!variant || !LETTER.test(variant)) continue;
      if (heads.has(variant)) continue;

      const previous = freqByVariant.get(variant);
      if (previous && previous.freq >= freq) continue;
      freqByVariant.set(variant, { freq, lemma });
      result[variant] = lemma;
    }
  }

  return result;
}
