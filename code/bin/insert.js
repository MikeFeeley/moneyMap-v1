'use strict';

var express  = require ('express');
var assert   = require ('assert');
var async    = require ('../lib/async.js');
var app      = require ('./app.js');
var router   = express.Router();
var ObjectID = require('mongodb').ObjectID

function* handleSeq (db, id, insert) {
  if (insert._seq === null)
    insert._seq = (
      yield db .collection ('counters')
        .findOneAndUpdate ({_id: id}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})
    ) .value .seq;
}

function* insertOne (req, res, next) {
  try {
    if (! req .body .insert || ! req .body .insert._id)
      (req.body.insert = req.body.insert || {}) ._id = new ObjectID() .toString();
    yield* handleSeq (yield req .dbPromise, req .body .collection, req .body .insert);
    var doc = yield (yield req .dbPromise) .collection (req .body .collection) .insert (req .body .insert);
    res.json ({_id: doc .ops [0] ._id, _seq: doc .ops [0] ._seq});
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, insert: doc .ops [0]});
  } catch (e) {
    console .log ('insertOne: ', e, req.body);
    next (e);
  }
}

function* insertList (req, res, next) {
  var db = yield req .dbPromise;
  try {
    if (! req .body .list)
      throw 'No list in body';
    var ids = [], docs = [];
    for (let item of req .body .list) {
      if (! item._id)
        item._id = new ObjectID() .toString();
      yield* handleSeq (db, req .body .collection, item);
      var doc = yield db .collection (req .body .collection) .insert (item);
      ids .push ({_id: doc .ops [0] ._id, _seq: doc .ops [0] ._seq});
      docs .push (doc .ops [0]);
    }
    res .json (ids);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, insertList: docs});
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
