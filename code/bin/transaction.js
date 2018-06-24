'use strict';

const express  = require ('express');
const app      = require ('./app');
const router   = express.Router();
const ObjectID = require('mongodb').ObjectID;
const tranMeta = require ('../lib/TransactionDBMeta');

async function insertOne (req, res, next) {
  try {
    if (! req .body .insert)
      throw 'Missing insert';
    var tran = await tranMeta .insert (await req .dbPromise, req .body .insert, req);
    res .json ({_id: tran._id, _seq: tran._seq});
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, insert: tran});
  } catch (e) {
    console .log ('transactions insertOne: ', e, req .body);
    next (e);
  }
}

async function insertList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var trans = [];
    for (let tran of req .body .list)
      trans .push (await tranMeta .insert (await req .dbPromise, tran, req));
    res .json (trans);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, insertList: trans});
  } catch (e) {
    console .log ('transactions insertList: ', e, req .body);
    next (e);
  }
}

async function updateOne (req, res, next) {
  try {
    if (! req .body .id || ! req .body .update)
      throw 'Missing id or update';
    await tranMeta .update (await req .dbPromise, req .body .id, req .body .update, req);
    res .json (true);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, id: req .body .id, update: req .body .update});
  } catch (e) {
    console .log ('transactions updateOne: ', e, req .body);
    next (e);
  }
}

async function updateList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    for (let item of req .body .list) {
      if (! item .id || ! item .update)
        throw 'Missing id or update';
      await tranMeta .update (await req .dbPromise, item .id, item .update, req);
    }
    res .json (true);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, updateList: req .body .list});
  } catch (e) {
    console .log ('transactions updateList: ', e, req .body);
    next (e);
  }
}

async function removeOne (req, res, next) {
  try {
    if (! req .body .id)
      throw 'Missing id';
    res .json (await tranMeta .remove (await req .dbPromise, req .body .id, req));
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, remove: req .body .id});
  } catch (e) {
    console .log ('transactions removeOne: ', e, req .body);
  }
}

async function removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var results = []
    for (let id of req .body .list) {
      results .push (await tranMeta .remove (await req .dbPromise, id, req));
    }
    res .json (results);
    app .notifyOtherClients (req .body .database, req .body .sessionId, {collection: req .body .collection, removeList: req .body .list});
  } catch (e) {
    console .log ('transactions removeList: ', e, req .body);
  }
}

async function findAccount (req, res, next) {
  try {
    res .json (await tranMeta .findAccountAndRollForward (await req .dbPromise, req .body .query, req));
  } catch (e) {
    console .log ('transactions findAccountBalance: ', e, req .body);
  }
}

async function getActuals (req, res, next) {
  try {
    res .json (await tranMeta .getActuals (await req .dbPromise, req .body .query, req));
  } catch (e) {
    console .log ('transactions getActuals: ', e, req .body);
  }
}

router .post ('/insert/one', function (req, res, next) {
  (async () => {try {await insertOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/insert/list', function (req, res, next) {
  (async () => {try {await insertList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/update/one', function (req, res, next) {
  (async () => {try {await updateOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/update/list', function (req, res, next) {
  (async () => {try {await updateList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/remove/one', function (req, res, next) {
  (async () => {try {await removeOne (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/remove/list', function (req, res, next) {
  (async () => {try {await removeList (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/findAccount', function (req, res, next) {
  (async () => {try {await findAccount (req, res, next)} catch (e) {console .log (e)}}) ();
})

router .post ('/actuals', (req, res, next) => {
  (async () => {try {await getActuals (req, res, next)} catch (e) {console .log (e)}}) ();
})

module .exports = router;
