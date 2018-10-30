var express = require('express');
var router = express.Router();

router.get ('/', function(req, res, next) {
  const head = '<title>moneyMap</title>' +
    '<meta name="description" content="Simple, powerful, secure and free personal financial tracking, budgeting, and planning.  Spreadsheet-like power for the serious planner.">' +
    '<meta author="Mike Feeley">' +
    '<meta charset="UTF-8">'+
    '<script src="js/Init.js"></script>';
  const html = '<!DOCTYPE html><html><head>' + head + '</head></html>';
  res .format ({
    'text/html': () => res .send (html)
  });
});

module.exports = router;
