// Stable version stamp set once when the Node process starts.
// Render restarts the process on every deploy, so this value always
// changes after a new build is released.
export const SERVER_START_VERSION = Date.now().toString();
