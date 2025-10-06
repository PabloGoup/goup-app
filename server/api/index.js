// api/index.js
const app = require('../server/flowServer.cjs');

// Vercel usará esta función como Serverless Function.
// Express apps son (req,res) => ..., así que basta delegar:
module.exports = (req, res) => app(req, res);