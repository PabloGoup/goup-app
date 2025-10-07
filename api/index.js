// Adaptador para Vercel: expone la app de Express
const app = require('../server/flowServer.cjs');

// Vercel necesita que exportemos como handler (req, res)
module.exports = app;
module.exports.handler = app;
exports.default = app;