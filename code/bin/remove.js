'use strict';

var express  = require ('express');
var assert   = require ('assert');
var async    = require ('../lib/async.js');
var router  = express.Router();

function* remove (req, collection, id) {
  var db = yield req .dbPromise;
//  if (collection == 'categories') {
//    var categories   = db .collection ('categories');
//    var transactions = db .collection ('transactions');
//    var cat          = yield categories .findOne ({_id: id});
//    if (cat && cat .parent) {
//      var as   = [];
//      for (let t of yield transactions .find ({category: id}) .toArray())
//        as .push (transactions .update ({_id: t._id, category: id}, {$set: {
//          category:    cat .parent,
//          description: t .description? cat .name + ': ' + t .description: cat .name
//        }}))
//      for (let a of as)
//        yield a;
//    } else
//      return false;
//  }
  yield db .collection (collection) .remove ({_id: id});
  return true;
}

function* removeOne (req, res, next) {
  try {
    res.json (yield* remove (req, req .body .collection, req .body .id));
  } catch (e) {
    console .log ('removeOne: ', e, req.body);
    next (e);
  }
}

function* removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw ('No list in body')
    var results = [];
    for (let id of req .body .list)
      results .push (yield* remove (req, req .body .collection, id))
    res.json (results);
  } catch (e) {
    console .log ('removeList: ', e, req.body);
    next (e);
  }
}

router.post ('/one', function(req, res, next) {
  async (removeOne) (req, res, next);
});

router.post ('/list', function(req, res, next) {
  async (removeList) (req, res, next);
});

module.exports = router;
