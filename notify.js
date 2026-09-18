// Called by an external scheduler (e.g. cron-job.org) at 4pm and 10pm West
// Africa Time (WAT, UTC+1) — see the setup steps for the exact UTC times to
// schedule, since WAT has no daylight saving so this offset never changes.
//
// Reads today's data from Firestore, checks whether the relevant group
// (habits or to-dos) is fully done, and if not, sends a real push notification
// via Firebase Cloud Messaging. This is the piece a static site cannot do on
// its own — it needs to run on a server on a schedule, independent of whether
// anyone has the app open.

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
    const deadline = (req.query.deadline || '').toString();

    if (!syncCode) {
      return res.status(500).json({ error: 'SYNC_CODE env var not set' });
    }
    if (deadline !== 'habits' && deadline !== 'todos') {
      return res.status(400).json({ error: 'pass ?deadline=habits or ?deadline=todos' });
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

    let title = '';
    let body = '';
    if (deadline === 'habits') {
      if (habitsAllDone) return res.status(200).json({ skipped: 'habits already done' });
      title = 'Habits not done';
      body = "It's 4pm — your habits for today aren't all checked yet.";
    } else {
      if (todosAllDone) return res.status(200).json({ skipped: 'to-dos already done' });
      title = 'To-dos not done';
      body = "It's 10pm — your to-do list for today isn't finished yet.";
    }

    await admin.messaging().send({
      token,
      notification: { title, body },
    });

    res.status(200).json({ sent: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
