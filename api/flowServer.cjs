// Enruta TODO lo que sea /api/* hacia tu app Express
const app = require('../server/flowServer.cjs');
module.exports = app;        // Vercel (Node) usa (req,res) => handler
module.exports.handler = app;
exports.default = app;