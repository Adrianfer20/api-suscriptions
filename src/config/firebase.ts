// The Firebase client SDK was removed from server-side initialization to
// avoid exposing client credentials and to keep clear separation between
// backend (Admin SDK) and frontend (Client SDK). If you need client SDK
// functionality, initialize it in the frontend or a dedicated client process.

console.info('[firebase] Client SDK initialization disabled on server.');

const firebaseApp: null = null;
export default firebaseApp;
