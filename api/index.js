// api/index.js
const app = require('../server/flowServer.cjs');
module.exports = app;        // CJS
module.exports.default = app; // por si Vercel lo importa como ESM