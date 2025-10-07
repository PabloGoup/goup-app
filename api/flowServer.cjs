// api/flowServer.cjs
// Puente para que Vercel trate a todo Express como una Serverless Function.
const app = require('../server/flowServer.cjs');
module.exports = app;         // CJS (Vercel)
module.exports.handler = app; // compat
exports.default = app;        // ESM default