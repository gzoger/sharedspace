# Firebase Config Reference

Use this Firebase project configuration later when wiring the app to Firebase.

```js
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "",
  authDomain: "sharedspace-50c52.firebaseapp.com",
  projectId: "sharedspace-50c52",
  storageBucket: "sharedspace-50c52.firebasestorage.app",
  messagingSenderId: "1034280394799",
  appId: "1:1034280394799:web:8a81acfa4bdd3c5d7e26da"
};

const app = initializeApp(firebaseConfig);
```

Note: Firebase web config values are usually safe to include in frontend code, but database and storage security rules still need to be configured carefully before real use.
