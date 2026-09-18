// Called repeatedly by an external scheduler (e.g. cron-job.org) throughout
// the day — every call just checks what's still outstanding today and sends
// ONE combined push if anything is. Once everything's done, every later call
// this same day is a silent no-op — that's what makes this "persistent until
// finished" rather than a single one-shot reminder.
//
// This is the piece a static site cannot do on its own — it needs to run on
// a server on a schedule, independent of whether anyone has the app open.

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
}

const HABIT_KEYS = ['laybed', 'prayer', 'hygiene', 'workout', 'bible', 'music'];
const TZ_OFFSET_HOURS = 1; // Lagos / WAT — fixed, no DST

function localDateStr(date, tzOffsetHours) {
  const shifted = new Date(date.getTime() + tzOffsetHours * 3600000);
  return shifted.toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  try {
    const syncCode = process.env.SYNC_CODE;
    if (!syncCode) {
      return res.status(500).json({ error: 'SYNC_CODE env var not set' });
    }

    const db = admin.firestore();
    const doc = await db.collection('trackers').doc(syncCode).get();
    if (!doc.exists) {
      return res.status(200).json({ skipped: 'no synced data yet' });
    }
    const data = doc.data();
    const token = data.fcmToken;
    if (!token) {
      return res.status(200).json({ skipped: 'no notification token registered yet' });
    }

    const todayStr = localDateStr(new Date(), TZ_OFFSET_HOURS);
    const start = new Date(data.startDate + 'T00:00:00Z');
    const today = new Date(todayStr + 'T00:00:00Z');
    const dayIndex = Math.round((today - start) / 86400000);
    const day = (data.days || [])[dayIndex];

    if (!day) {
      return res.status(200).json({ skipped: 'today is out of the current 30-day range' });
    }

    const habitsAllDone = HABIT_KEYS.every((k) => day.habits && day.habits[k]);
    const todosAllDone = Array.isArray(day.todos) && day.todos.length > 0 && day.todos.every((t) => t.done);
    const hourAllDone = Array.isArray(day.quarters) && day.quarters.length === 4 && day.quarters.every((q) => q === true);
    // "Journeying" — today's area picked and that area's note actually written.
    const journalDone = !!(day.area && day.notes && (day.notes[day.area] || '').trim().length > 0);

    const outstanding = [];
    if (!habitsAllDone) outstanding.push('Habits');
    if (!hourAllDone) outstanding.push('Deep-focus hour');
    if (!todosAllDone) outstanding.push('To-do list');
    if (!journalDone) outstanding.push('Journal entry');

    if (outstanding.length === 0) {
      return res.status(200).json({ skipped: 'everything done today' });
    }

    const title = outstanding.length === 4 ? 'Nothing logged yet today' : 'Still open today';
    const body = outstanding.join(' · ');

    await admin.messaging().send({
      token,
      notification: { title, body },
    });

    res.status(200).json({ sent: true, outstanding });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
