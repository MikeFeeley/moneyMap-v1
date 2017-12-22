'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var app      = require ('./app.js');
var router   = express.Router();

function* updateOne (req, res, next) {
  try {
    if (!req.body.update)
      throw 'No update in body';
    var result = yield (yield req .dbPromise) .collection (req.body.collection) .update ({_id: req.body.id}, {$set: req.body.update});
    res.json (result && result .result .ok);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, id: req .body .id, update: req .body .update});
  } catch (e) {
    console .log ('updateOne: ', e, req.body);
    next (e);
  }
}

function* updateList (req, res, next) {
  try {
    if (!req.body.list)
      throw 'No list in body';
    var allOkay = true;
    for (let item of req.body.list) {
      if (!item .update)
        throw 'No update in list';
      var result = yield (yield req .dbPromise) .collection (req.body.collection) .update ({_id: item .id}, {$set: item .update});
      allOkay &= result && result .result .ok;
    }
    res.json (allOkay);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, updateList: req .body .list});
  } catch (e) {
    console .log ('updateList: ', e, req.body);
    next (e);
  }
}

router.post ('/one', function(req, res, next) {
  async (updateOne) (req, res, next);
});

router.post ('/list', function(req, res, next) {
  async (updateList) (req, res, next);
});

module.exports = router;

if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement /*, fromIndex */) {
    'use strict';
    if (this == null) {
      throw new TypeError('Array.prototype.includes called on null or undefined');
    }

    var O = Object(this);
    var len = parseInt(O.length, 10) || 0;
    if (len === 0) {
      return false;
    }
    var n = parseInt(arguments[1], 10) || 0;
    var k;
    if (n >= 0) {
      k = n;
    } else {
      k = len + n;
      if (k < 0) {k = 0;}
    }
    var currentElement;
    while (k < len) {
      currentElement = O[k];
      if (searchElement === currentElement ||
        (searchElement !== searchElement && currentElement !== currentElement)) { // NaN !== NaN
          return true;
        }
      k++;
    }
    return false;
  };
}
