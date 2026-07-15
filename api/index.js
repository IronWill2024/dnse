const path = require('path');

// eval('require') bypasses Vercel's ncc bundler static analysis.
// NestJS uses reflect-metadata and decorators which ncc cannot bundle properly.
// This forces the require to happen at runtime from the pre-built dist/ folder.
const load = eval('require');

let handler;

module.exports = async (req, res) => {
  if (!handler) {
    const modulePath = path.join(__dirname, '..', 'dist', 'src', 'serverless');
    handler = load(modulePath).default;
  }
  return handler(req, res);
};
