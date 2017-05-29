'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var router   = express.Router();

function* checkUpdate (collection, id, update) {
  if (collection == 'categories' && update .budgets) {
    var db = yield dbPromise;
    var category = (yield db .collection ('categories') .findOne ({_id: id}));
    if (category)
      for (let bid of category .budgets .filter (b => {return ! update .budgets .includes (b)})) {
        var budget = yield db .collection ('budgets')      .findOne ({_id: bid});
        var trans  = yield db .collection ('transactions') .findOne ({$and: [{date: {$gte: budget .start}}, {date: {$lte: budget .end}}], category: id});
        if (trans)
          return false;
      }
    else
      return true;
    return true;
  } else
    return true;
}

function checkRemoveInstead (collection, id, update) {
  // this was proactive garbage collection, but doesn't work with undo: client thinks it updated and so undoes update even if it was a remove
  return collection == 'categories' && update .budgets && update .budgets .length == 0;
}

function* updateOne (req, res, next) {
  try {
    if (!req.body.update)
      throw 'No update in body';
    if (yield* checkUpdate (req .body .collection, req .body .id, req .body .update))
      var result = yield (yield dbPromise) .collection (req.body.collection) .update ({_id: req.body.id}, {$set: req.body.update});
    else
      var result = false;
    res.json (result && result .result .ok);
  } catch (e) {
    console .log ('updateOne: ', e, req.body);
    next (e);
  }
}

function* checkUpdateList (req, res, next) {
  try {
    if (!req.body.list)
      throw 'No list in body';
    var allOkay = true;
    for (let item of req .body .list) {
      if (! (yield* checkUpdate (req .body .collection, item .id, item .update))) {
        allOkay = false;
        break;
      }
    }
    res.json (allOkay);
  } catch (e) {
    console .log ('checkUpdateList: ', e, req.body);
    next (e);
  }
}

function* updateList (req, res, next) {
  try {
    if (!req.body.list)
      throw 'No list in body';
    var allOkay = true;
    for (let item of req .body .list)
      if (! (yield* checkUpdate (req .body .collection, item .id, item .update))) {
        allOkay = false;
        break;
      }
    if (allOkay)
      for (let item of req.body.list) {
        if (!item .update)
          throw 'No update in list';
        var result = yield (yield dbPromise) .collection (req.body.collection) .update ({_id: item .id}, {$set: item .update});
        allOkay &= result && result .result .ok;
      }
    res.json (allOkay);
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

router.post ('/checkList', function(req, res, next) {
  async (checkUpdateList) (req, res, next);
});

module.exports = router;

if (!Array.prototype.includes) {
  Array.prototype.includes = function(searchElement /*, fromIndex*/) {
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
