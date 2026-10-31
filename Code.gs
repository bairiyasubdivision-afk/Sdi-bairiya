/**
 * ============================================================
 *  SDI Bairiya Office Toolkit  —  Google Drive Backup  (Apps Script)
 *  "SDI Bairiya Office Toolkit" ऐप का बैकअप अपने Google Drive में सहेजने
 *  वाला छोटा सा Apps Script। यह आपका निजी script है — इसे किसी के साथ
 *  साझा न करें।
 * ============================================================
 *
 *  कैसे लगाएँ (छोटा रास्ता):
 *   1. script.google.com खोलें → "New project"।
 *   2. इस पूरी फ़ाइल का text Code.gs में paste कर दें (जो पहले से लिखा है
 *      उसे हटा दें)।
 *   3. नीचे SECRET_TOKEN की लाइन में अपना कोई भी गुप्त शब्द लिख दें
 *      (जैसे: 'bairiya-rahul-2026-xyz')। इसी टोकन को ऐप में भी डालेंगे।
 *   4. Deploy → New deployment → type: "Web app" →
 *        Execute as : Me
 *        Who has access : Anyone
 *      → Deploy → अनुमति (Authorize) दें → जो "Web app URL" मिले उसे copy
 *      कर लें।
 *   5. ऐप में: Data टैब → Backup & Restore → "Google Drive पर भेजें" कार्ड →
 *      वही URL और वही टोकन भरें → "जाँचें" दबाएँ।
 *
 *  ज़रूरी: script में कोई भी बदलाव करने के बाद फिर से
 *  Deploy → Manage deployments → Edit → Version: "New version" → Deploy
 *  करना पड़ता है, तभी नया बदलाव लागू होता है।
 * ============================================================
 *
 *  ------------------------------------------------------------
 *  🆕 नया (रिपोर्ट भी Drive पर): अब यह script सिर्फ़ बैकअप ही नहीं,
 *  ऐप की बनाई चारों .docx रिपोर्ट भी Drive में सहेज सकता है —
 *    • BO निरीक्षण रिपोर्ट और SO निरीक्षण रिपोर्ट → "Inspection Reports"
 *    • मासिक Tour Diary                          → "Tour Diary"
 *    • TA Bill                                   → "TA Bill"
 *  ये सब-फ़ोल्डर मुख्य "SDI Bairiya" फ़ोल्डर के अंदर बनते हैं।
 *  बैकअप JSON फ़ाइलें पहले की तरह मुख्य "SDI Bairiya" फ़ोल्डर में
 *  ही रहती हैं (कोई बदलाव नहीं) — ताकि पुराना prune/log जैसा था
 *  वैसा ही चलता रहे।
 *
 *  ⚠️ यह नया कोड उसी पुराने प्रोजेक्ट में paste करें और फिर से
 *     Deploy → Manage deployments → ✏️ Edit → Version: "New version"
 *     → Deploy करें। नया version deploy किए बिना रिपोर्ट-भेजना काम
 *     नहीं करेगा (पुराना बैकअप-भेजना चलता रहेगा)।
 *  ------------------------------------------------------------
 */


/* =====================================================================
 *  ★★★ यही एक लाइन आपको बदलनी है ★★★
 *  अपना गुप्त टोकन यहाँ लिखें। यही टोकन ऐप के "Google Drive पर भेजें"
 *  कार्ड में भी डालना है। किसी और को यह टोकन न बताएँ।
 *  ध्यान रखें: टोकन लंबा और अनोखा रखें (कोई आसान शब्द नहीं)।
 * ===================================================================== */
var SECRET_TOKEN = 'sdibairiya2026';


/* ---------------------------------------------------------------------
 *  बाकी सेटिंग (चाहें तो बदल सकते हैं — ज़रूरी नहीं)
 * ------------------------------------------------------------------- */

// Drive में जिस फ़ोल्डर में बैकअप जाएँगे।
var FOLDER_NAME = 'SDI Bairiya';

// कितने सबसे नए बैकअप रखें। इससे पुराने बैकअप अपने-आप trash में चले जाएँगे
// (Drive हमेशा भरता न रहे)।
var KEEP_BACKUPS = 30;

// उसी फ़ोल्डर में इतिहास दिखाने वाली Google Sheet का नाम।
var SHEET_NAME = 'Backup Log';

// बैकअप फ़ाइलों के नाम का ढाँचा — इससे पुरानी फ़ाइलें पहचानी जाती हैं।
var FILE_PREFIX = 'SDI_Bairiya_Backup_';

// 🆕 सब-फ़ोल्डर: हर तरह की फ़ाइल अपनी जगह पर रहे। ऐप kind भेजता है
// ('inspection' / 'tour' / 'ta') — उसके अनुसार सब-फ़ोल्डर चुना जाता है।
var SUBFOLDERS = {
  inspection: 'Inspection Reports',
  tour: 'Tour Diary',
  ta: 'TA Bill',
  other: 'Other Files'
};

// 🆕 सुरक्षा-सीमा: इससे बड़ी फ़ाइल कभी नहीं लिखी जाएगी (15 MB).
// (बैकअप पर असर नहीं — यह जाँच सिर्फ़ फ़ाइल-भेजने पर लगती है।)
var FILE_MAX_BYTES = 15 * 1024 * 1024;


/**
 * =====================================================================
 *  doPost — ऐप जब "अभी Drive पर भेजें" (या ऑटो-भेजें) करता है, तब यह चलता है।
 *  ऐप एक JSON string POST करता है जिसमें token + पूरा बैकअप होता है।
 *  हमेशा JSON ही लौटाते हैं (कभी unhandled error नहीं)।
 * =====================================================================
 */
function doPost(e) {
  try {
    // 1) body पढ़ें
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    if (!raw) {
      return jsonOut_({ ok: false, error: 'empty body' });
    }

    var body;
    try {
      body = JSON.parse(raw);
    } catch (parseErr) {
      return jsonOut_({ ok: false, error: 'invalid JSON body' });
    }

    // 2) टोकन जाँचें — v7.53: टोकन अब POST body में ही आता है (URL में नहीं)
    if (!tokenOk_(body && body.token)) {
      return jsonOut_({ ok: false, error: 'invalid token' });
    }

    // 2b) 🆕 v7.53 — ऐप का "🔌 जाँचें" बटन अब यही POST भेजता है
    //     ({ token, type:'ping' }) — टोकन query string में नहीं जाता।
    if (body && body.type === 'ping') {
      return statusPayload_();
    }

    // 2a) 🆕 अगर यह कोई फ़ाइल है (रिपोर्ट आदि) तो अलग रास्ते से सहेजें।
    //     पुराना बैकअप-रास्ता बिलकुल नहीं छूते।
    if (body && body.type === 'file') {
      return handleFile_(body);
    }

    // 3) बैकअप का असली हिस्सा निकालें (ऐप body.data में पूरा envelope भेजता है)
    var payload = (body && body.data) ? body.data : body;
    var payloadStr = JSON.stringify(payload);

    // 4) फ़ोल्डर लें/बनाएँ
    var folder = getOrCreateFolder_(FOLDER_NAME);

    // 5) फ़ाइल का नाम तय करें
    var stamp = formatStamp_(new Date());
    var fname = sanitizeName_(body && body.filename) || (FILE_PREFIX + stamp + '.json');
    if (fname.indexOf(FILE_PREFIX) !== 0) fname = FILE_PREFIX + fname;

    // 6) फ़ाइल सहेजें
    var file = folder.createFile(Utilities.newBlob(payloadStr, 'application/json', fname));

    // 7) इतिहास की एक पंक्ति Sheet में जोड़ें
    var logNote = '';
    try {
      logNote = appendLog_(folder, fname, payloadStr.length,
        (body && body.backupType) || (payload && payload.backupType) || 'full',
        (body && body.counts) || null);
    } catch (logErr) {
      logNote = 'log failed: ' + logErr;   // log न बने तो भी बैकअप तो सुरक्षित है
    }

    // 8) पुराने बैकअप हटाएँ (सिर्फ़ नए KEEP_BACKUPS रखें)
    var removed = 0;
    try { removed = pruneOldBackups_(folder, KEEP_BACKUPS); } catch (pruneErr) {}

    return jsonOut_({
      ok: true,
      file: fname,
      fileId: file.getId(),
      folder: FOLDER_NAME,
      size: payloadStr.length,
      removedOld: removed,
      log: logNote,
      time: new Date().toISOString()
    });

  } catch (err) {
    // कभी भी कच्ची error client तक न जाए
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


/**
 * =====================================================================
 *  🆕 handleFile_ — ऐप की बनाई फ़ाइल (जैसे .docx रिपोर्ट) सहेजें।
 *  body: { type:'file', token, kind, name, mime, base64 }
 *  कभी throw नहीं करता — हमेशा छोटा JSON लौटाता है।
 * =====================================================================
 */
function handleFile_(body) {
  try {
    // 1) नाम / MIME / content पढ़ें
    var name = sanitizeFileName_(body && body.name);
    if (!name) name = 'file_' + formatStamp_(new Date());

    var mime = String((body && body.mime) || '').trim() || 'application/octet-stream';
    if (mime.length > 120) mime = 'application/octet-stream';

    var b64 = String((body && body.base64) || '');
    if (!b64) return jsonOut_({ ok: false, error: 'empty file content' });

    // 2) बहुत बड़ी फ़ाइल कभी न लिखें (अंदाज़न decoded आकार)
    var approx = Math.floor(b64.length * 3 / 4);
    if (approx > FILE_MAX_BYTES) {
      return jsonOut_({ ok: false, error: 'file too large' });
    }

    // 3) base64 → bytes
    var bytes;
    try {
      bytes = Utilities.base64Decode(b64);
    } catch (decErr) {
      return jsonOut_({ ok: false, error: 'invalid base64' });
    }
    if (!bytes || !bytes.length) return jsonOut_({ ok: false, error: 'empty file content' });

    // 4) kind के अनुसार सब-फ़ोल्डर चुनें (न हो तो बना दें)
    var kind = String((body && body.kind) || '').trim();
    var subName = SUBFOLDERS[kind] || SUBFOLDERS.other;
    var root = getOrCreateFolder_(FOLDER_NAME);
    var folder = getOrCreateSubfolder_(root, subName);

    // 5) फ़ाइल सहेजें — नाम और MIME वैसे ही जैसे ऐप ने भेजे
    var file = folder.createFile(Utilities.newBlob(bytes, mime, name));

    // 6) इतिहास (न बने तो भी फ़ाइल सुरक्षित है)
    var logNote = '';
    try {
      logNote = appendLog_(root, name, bytes.length, 'file (' + (kind || 'other') + ')',
        { folder: subName });
    } catch (logErr) {
      logNote = 'log failed: ' + logErr;
    }

    return jsonOut_({
      ok: true,
      file: name,
      fileId: file.getId(),
      folder: FOLDER_NAME + '/' + subName,
      size: bytes.length,
      kind: kind,
      log: logNote,
      time: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


/**
 * =====================================================================
 *  doGet — पुराना "जाँचें (Test)" रास्ता (टोकन query string में)।
 *  v7.53: नया ऐप यह रास्ता नहीं इस्तेमाल करता — वह POST body में टोकन भेजता
 *  है (doPost का type:'ping')। यह फंक्शन पुराने ऐप/पुराने लिंक के लिए
 *  बिलकुल पहले जैसा चलता रहता है।
 * =====================================================================
 */
function doGet(e) {
  try {
    var token = (e && e.parameter && e.parameter.token) ? e.parameter.token : '';
    if (!tokenOk_(token)) {
      return jsonOut_({ ok: false, error: 'invalid token' });
    }
    return statusPayload_();
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * दोनों रास्तों (doGet और doPost type:'ping') का साझा जवाब।
 */
function statusPayload_() {
  try {
    var count = 0;
    var reportCount = 0;   // 🆕 सब-फ़ोल्डरों में सहेजी गई रिपोर्ट/फ़ाइलें
    var folderName = FOLDER_NAME;
    try {
      var it = DriveApp.getFoldersByName(FOLDER_NAME);
      if (it.hasNext()) {
        var f = it.next();
        folderName = f.getName();
        var files = f.getFiles();
        while (files.hasNext()) {
          var fl = files.next();
          if (fl.getName().indexOf(FILE_PREFIX) === 0) count++;
        }
        // 🆕 हर सब-फ़ोल्डर की फ़ाइलें गिनें
        var subs = f.getFolders();
        while (subs.hasNext()) {
          var sf = subs.next();
          try {
            var sfiles = sf.getFiles();
            while (sfiles.hasNext()) { sfiles.next(); reportCount++; }
          } catch (subErr) {}
        }
      }
    } catch (countErr) {}

    return jsonOut_({
      ok: true,
      status: 'connected',
      app: 'SDI Bairiya Office Toolkit',
      folder: folderName,
      backups: count,
      reports: reportCount,
      keep: KEEP_BACKUPS,
      time: new Date().toISOString()
    });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}


/* =====================================================================
 *  नीचे के छोटे helper — इन्हें छूने की ज़रूरत नहीं।
 * =================================================================== */

/** टोकन की जाँच — placeholder या खाली टोकन कभी स्वीकार नहीं। */
function tokenOk_(given) {
  var g = String(given == null ? '' : given);
  if (!g) return false;
  if (!SECRET_TOKEN || SECRET_TOKEN.indexOf('CHANGE_ME') === 0) return false;
  // साधारण तुलना (लंबाई सहित)
  if (g.length !== SECRET_TOKEN.length) return false;
  var diff = 0;
  for (var i = 0; i < g.length; i++) {
    diff |= (g.charCodeAt(i) ^ SECRET_TOKEN.charCodeAt(i));
  }
  return diff === 0;
}

/** JSON output लपेटें — यही client को लौटता है। */
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** फ़ोल्डर ढूँढें, न मिले तो बनाएँ। */
function getOrCreateFolder_(name) {
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

/** तारीख़ को SDI_Bairiya_Backup_2026-10-21_09-30 जैसे ढाँचे में बदलें। */
function formatStamp_(d) {
  var tz = Session.getScriptTimeZone() || 'Asia/Kolkata';
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd_HH-mm');
}

/** फ़ाइल-नाम साफ़ करें (कोई ख़तरनाक अक्षर न रहे)। */
function sanitizeName_(n) {
  var s = String(n == null ? '' : n).trim();
  if (!s) return '';
  s = s.replace(/[\\\/:*?"<>|\r\n\t]+/g, '_');
  if (s.length > 120) s = s.substring(0, 120);
  if (!/\.json$/i.test(s)) s += '.json';
  return s;
}

/**
 * 🆕 फ़ोल्डर ढूँढें, न मिले तो बनाएँ — मुख्य फ़ोल्डर के अंदर (सब-फ़ोल्डर)।
 */
function getOrCreateSubfolder_(parent, name) {
  try {
    var it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
  } catch (findErr) {}
  return parent.createFolder(name);
}

/**
 * 🆕 फ़ाइल-नाम साफ़ करें — ध्यान दें: यह .json ज़बरदस्ती नहीं जोड़ता
 * (रिपोर्ट .docx अपने नाम से ही सहेजी जाए)।
 */
function sanitizeFileName_(n) {
  var s = String(n == null ? '' : n).trim();
  if (!s) return '';
  s = s.replace(/[\\\/:*?"<>|\r\n\t]+/g, '_');
  if (s.length > 120) s = s.substring(0, 120);
  return s;
}

/**
 * उसी फ़ोल्डर की "Backup Log" Sheet में एक पंक्ति जोड़ें।
 * Sheet न हो तो बना देते हैं। (इतिहास एक नज़र में दिख जाए।)
 */
function appendLog_(folder, fname, size, backupType, counts) {
  var ss = getOrCreateLogSheet_(folder);
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(['तारीख़/समय', 'फ़ाइल', 'आकार (bytes)', 'प्रकार', 'बीओ/कार्यालय']);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  var boInfo = '';
  if (counts && typeof counts === 'object') {
    try { boInfo = JSON.stringify(counts); } catch (x) {}
  }
  sh.appendRow([new Date(), fname, size, backupType, boInfo]);
  return 'logged';
}

/** "Backup Log" Spreadsheet ढूँढें/बनाएँ और उसे इसी फ़ोल्डर में रखें। */
function getOrCreateLogSheet_(folder) {
  var files = folder.getFilesByName(SHEET_NAME);
  while (files.hasNext()) {
    var f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
      return SpreadsheetApp.openById(f.getId());
    }
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  DriveApp.getFileById(ss.getId()).moveTo(folder);
  return ss;
}

/**
 * सिर्फ़ सबसे नए `keep` बैकअप रखें; बाकी (पुराने) trash कर दें।
 * सिर्फ़ FILE_PREFIX वाली फ़ाइलों पर लागू — Sheet और बाकी कुछ नहीं छेड़ते।
 */
function pruneOldBackups_(folder, keep) {
  var arr = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var f = files.next();
    if (f.getName().indexOf(FILE_PREFIX) === 0) {
      arr.push({ file: f, time: f.getDateCreated().getTime() });
    }
  }
  // नए पहले
  arr.sort(function (a, b) { return b.time - a.time; });
  var removed = 0;
  for (var i = keep; i < arr.length; i++) {
    try { arr[i].file.setTrashed(true); removed++; } catch (x) {}
  }
  return removed;
}


/**
 * (वैकल्पिक) Apps Script editor में "Run" दबाकर एक बार जाँच लें कि सब ठीक है।
 */
function testSetup() {
  var folder = getOrCreateFolder_(FOLDER_NAME);
  Logger.log('Folder OK: ' + folder.getName());
  Logger.log('Token set: ' + (SECRET_TOKEN.indexOf('CHANGE_ME') !== 0));
  Logger.log('Keeping last ' + KEEP_BACKUPS + ' backups.');
  Logger.log('Report sub-folders: ' + SUBFOLDERS.inspection + ' / ' + SUBFOLDERS.tour + ' / ' + SUBFOLDERS.ta);
}
