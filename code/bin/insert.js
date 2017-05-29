'use strict';

var express  = require ('express');
var assert   = require ('assert');
var async    = require ('../lib/async.js');
var router   = express.Router();
var ObjectID = require('mongodb').ObjectID

function* handleSeq (id, insert) {
  if (insert._seq === null)
    insert._seq = (yield (yield dbPromise) .collection ('counters') .findAndModify ({_id: id}, [], {$inc: {seq: 1}})) .value .seq;
}

function* insertOne (req, res, next) {
  try {
    if (! req .body .insert || ! req .body .insert._id)
      (req.body.insert = req.body.insert || {}) ._id = new ObjectID() .toString();
    yield* handleSeq (req .body .collection, req .body .insert);
    var doc = yield (yield dbPromise) .collection (req.body.collection) .insert (req.body.insert);
    res.json ({_id: doc .ops [0] ._id, _seq: doc .ops [0] ._seq});
  } catch (e) {
    console .log ('insert: ', e, req.body);
    next (e);
  }
}

function* insertList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'No list in body';
    var ids = [];
    for (let item of req .body .list) {
      if (! item._id)
        item._id = new ObjectID() .toString();
      yield* handleSeq (req .body .collection, item);
      var doc = yield (yield dbPromise) .collection (req .body .collection) .insert (item);
      ids .push ({_id: doc .ops [0] ._id, _seq: doc .ops [0] ._seq});
    }
    res .json (ids);
  } catch (e) {
    console .log ('insert: ', e, req.body);
    next (e);
  }
}

router.post ('/one', function(req, res, next) {
  async (insertOne) (req, res, next);
});

router.post ('/list', function(req, res, next) {
  async (insertList) (req, res, next);
});

module.exports = router;
