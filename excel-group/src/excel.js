// Reads contacts out of an .xlsx/.xls/.csv file using the bundled SheetJS.
//
// It looks for a phone column and a name column by header (Persian or English
// aliases); if there are no recognisable headers it falls back to "first
// column that looks like phone numbers". Iranian numbers are normalised to the
// 98XXXXXXXXXX form Rubika's addAddressBook expects.
(() => {
  const RXG = (globalThis.RXG = globalThis.RXG || {});

  const PHONE_HEADERS = ['phone', 'mobile', 'tel', 'number', 'موبایل', 'شماره', 'تلفن', 'همراه'];
  const NAME_HEADERS = ['name', 'first', 'fullname', 'نام', 'اسم'];
  const LAST_HEADERS = ['last', 'family', 'surname', 'نام خانوادگی', 'خانوادگی', 'فامیل'];

  // Maps Persian/Arabic-Indic digits onto ASCII so "۰۹۱۲" parses like "0912".
  function toAsciiDigits(text) {
    return String(text).replace(/[۰-۹٠-٩]/g, (d) => {
      const code = d.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    });
  }

  function normalisePhone(raw) {
    let d = toAsciiDigits(raw).replace(/[^\d+]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    if (d.startsWith('0098')) d = d.slice(4);
    else if (d.startsWith('98') && d.length === 12) d = d.slice(2);
    if (d.startsWith('0')) d = d.slice(1);
    if (!/^9\d{9}$/.test(d)) return null; // Iranian mobile: 9 + 9 digits
    return `98${d}`;
  }

  function headerIndex(header, aliases) {
    return header.findIndex((cell) => {
      const h = String(cell || '').trim().toLowerCase();
      return h && aliases.some((a) => h.includes(a));
    });
  }

  function parseRows(rows) {
    if (!rows.length) return { contacts: [], skipped: 0 };

    const header = rows[0].map((c) => String(c == null ? '' : c));
    let phoneCol = headerIndex(header, PHONE_HEADERS);
    let nameCol = headerIndex(header, NAME_HEADERS);
    let lastCol = headerIndex(header, LAST_HEADERS);
    let body = rows.slice(1);

    if (phoneCol === -1) {
      // No usable header row: pick the column with the most phone-like cells.
      const width = Math.max(...rows.map((r) => r.length));
      let best = -1;
      let bestHits = 0;
      for (let c = 0; c < width; c++) {
        const hits = rows.filter((r) => normalisePhone(r[c] || '')).length;
        if (hits > bestHits) {
          bestHits = hits;
          best = c;
        }
      }
      phoneCol = best;
      nameCol = phoneCol === 0 ? 1 : 0;
      lastCol = -1;
      body = rows;
    }

    const contacts = [];
    const seen = new Set();
    let skipped = 0;
    let autoIndex = 1;

    for (const row of body) {
      const phone = phoneCol >= 0 ? normalisePhone(row[phoneCol] || '') : null;
      if (!phone) {
        if (row.some((c) => String(c || '').trim())) skipped++;
        continue;
      }
      if (seen.has(phone)) continue;
      seen.add(phone);

      const first = (nameCol >= 0 ? String(row[nameCol] || '') : '').trim();
      const last = (lastCol >= 0 ? String(row[lastCol] || '') : '').trim();
      contacts.push({
        phone,
        firstName: first || `مخاطب ${autoIndex++}`,
        lastName: last,
      });
    }
    return { contacts, skipped };
  }

  async function readFile(file) {
    const XLSX = globalThis.XLSX;
    if (!XLSX) throw new Error('کتابخانه اکسل بارگذاری نشده است');
    const buffer = await file.arrayBuffer();
    const book = XLSX.read(buffer, { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    if (!sheet) throw new Error('شیت خالی است');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
    return parseRows(rows);
  }

  RXG.excel = { normalisePhone, toAsciiDigits, parseRows, readFile };
})();
