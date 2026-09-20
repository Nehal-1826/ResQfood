'use strict';

const app = require('../src/server');

module.exports = (req, res) => {
  return app(req, res);
};
