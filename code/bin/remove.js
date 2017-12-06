'use strict';

var express  = require ('express');
var assert   = require ('assert');
var async    = require ('../lib/async.js');
var app      = require ('./app.js');
var router  = express.Router();

function* remove (req, collection, id) {
  var db = yield req .dbPromise;
  yield db .collection (collection) .remove ({_id: id});
  return true;
}

function* removeOne (req, res, next) {
  try {
    res.json (yield* remove (req, req .body .collection, req .body .id));
    app .notifyOtherClients (req .body .sessionId, {database: req .body .database, collection: req .body .collection, remove: req .body .id});
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
    app .notifyOtherClients (req .body .sessionId, {database: req .body .database, collection: req .body .collection, removeList: req .body .list});
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
