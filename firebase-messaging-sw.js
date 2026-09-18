// This file must sit at the site root (same level as index.html) — its scope
// covers the whole site, which is required for Firebase web push to work.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBWFAoDV6r4QD0usdkWyFD0ClNhgfQyp9Y",
  authDomain: "days-38ed3.firebaseapp.com",
  projectId: "days-38ed3",
  storageBucket: "days-38ed3.firebasestorage.app",
  messagingSenderId: "388777828141",
  appId: "1:388777828141:web:1c6131e05247e956ef3da4"
});

const messaging = firebase.messaging();

// Fires when a push arrives while the app is closed or in the background —
// this is what makes the notification show up even when you're not looking at it.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || '30 Hours / 30 Days';
  const body = (payload.notification && payload.notification.body) || 'Check your progress';
  self.registration.showNotification(title, {
    body,
    icon: '/icon-192.png'
  });
});
