importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// ⚠️ Replace these with your exact Firebase Config details!
const firebaseConfig = {
    apiKey: "AIzaSyCgs1XEForas7sCQvyvth6oB75GOu1k4c4",
    projectId: "theftguard-iot",
    messagingSenderId: "466492128446", // Paste the Sender ID from Step 1
    appId: "1:466492128446:web:bbdc92edfe4141736df2ef"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// This code catches the notification when your app is in the background or closed
messaging.onBackgroundMessage((payload) => {
    console.log('Background message received: ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon.png' // Optional: path to your app's logo
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});