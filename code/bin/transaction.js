'use strict';

// XXX refactor calls to include req

var express  = require ('express');
var async    = require ('../lib/async.js');
var router   = express.Router();
var ObjectID = require('mongodb').ObjectID

function* handleSeq (db, id, insert) {
  if (insert._seq === null)
    insert._seq = (
      yield db .collection ('counters')
        .findOneAndUpdate ({_id: id}, {$inc: {seq: 1}}, {upsert: true, returnOriginal: false})
    ) .value .seq;
}

function* newUID (db) {
  return (
    yield db .collection ('counters')
      .findOneAndUpdate ({_id:  'transactions'}, {$inc: {uid: 1}}, {upsert: true, returnOriginal: false})
  ) .value .uid;
}

function* apply (db, pt, accId) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  var amount       = 0;
  if (pt .update) {
    if (pt .update .account && pt._master) {
      if (pt .update .account != accId) {
        var tpt = {
          uid:    pt .uid,
          _id:    pt._id,
          update: {account: pt .update .account}
        }
        yield accounts .updateOne ({_id: tpt .update .account, pendingTransactions: {$not: {$elemMatch: {uid: tpt .uid}}}}, {$push: {pendingTransactions: tpt}});
        yield* apply              (db, tpt, tpt .update. account);
      } else
        delete pt .update .account;
    }
    if (Object .keys (pt .update) .length) {
      var prev = (yield transactions .findOneAndUpdate ({_id: pt._id}, {$set: pt .update})) .value;
      if (pt .update .debit != null)
        amount += pt .update .debit - (prev .debit || 0);
      if (pt .update .credit != null)
        amount -= pt .update .credit - (prev .credit || 0);
      if (pt .update .account) {
        if (pt._master)
          amount = - ((prev .debit || 0) - (prev .credit || 0));
        else if (prev .account != accId)
          amount = ((prev .debit || 0) - (prev .credit || 0));
      }
    } else
      amount = 0;
  } else if (pt .insert) {
    try {
      yield transactions .insertOne (pt .insert);
      amount = (pt .insert .debit || 0) - (pt .insert .credit || 0);
    } catch (e) {
      console .log ('Transaction apply: duplicate insert ignored', e, pt);
    }
  } else if (pt .remove) {
    try {
      var prev = (yield transactions .findOneAndDelete ({_id: pt._id})) .value;
      amount = -((prev .debit || 0) - (prev .credit || 0));
    } catch (e) {
      console .log ('Transaction apply: duplicate remove ignored', e, pt);
    }
  }
  if (accId) {
    var creditBalance = (yield accounts .findOne ({_id: accId})) .creditBalance;
    yield accounts .updateOne ({_id: accId, 'pendingTransactions.uid': pt .uid}, {
      $inc:  {balance: amount * (creditBalance? -1: 1)},
      $pull: {pendingTransactions: {uid: pt .uid}}
    })
  }
}

function* findAccountAndRollForward (db, query) {
  var accounts = db .collection ('accounts');
  for (let acc of yield accounts .find (query) .toArray())
    for (let pt of (acc && acc .pendingTransactions) || [])
      yield* apply (db, pt, acc._id);
  return yield accounts .find (query) .toArray();
}

function* insert (db, tran) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  tran._id = tran._id || new ObjectID() .toString();
  yield* handleSeq (db, 'transactions', tran);
  if (tran .account != null && (tran .debit != null || tran .credit != null)) {
    var pt = {
      uid:    yield* newUID (db),
      insert: tran
    }
    yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    yield* apply              (db, pt, tran .account);
  } else
    yield transactions .insertOne (tran);
  return tran;
}

function* update (db, id, update) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  if (update .debit != null || update .credit != null || update .account != null) {
    var tran = yield transactions .findOne ({_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id;
    if (tran .account) {
      var pt = {
        uid:    yield* newUID (db),
        _id:    id,
        update: update,
      }
      pt._master = update .account != null;
      yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
      yield* apply              (db, pt, tran .account);
      return true;
    } else if (update .account) {
      var pt = {
        uid:     yield* newUID (db),
        _master: true,
        _id:     id,
        update:  update
      }
      yield accounts .updateOne ({_id: update .account}, {$push: {pendingTransactions: pt}});
      yield* apply              (db, pt);
    }
  }
  yield transactions .updateOne ({_id: id}, {$set: update});
  return true;
}

function* remove (db, id) {
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  var tran = yield transactions .findOne ({_id: id});
  if (!tran)
    throw 'Remove Transaction not found';
  if (tran .account) {
    var pt = {
      uid:    yield* newUID (db),
      _id:    id,
      remove: true
    }
    yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    yield* apply              (db, pt, tran .account);
    return true;
  }
  return (yield transactions .deleteOne ({_id: id})) .deletedCount == 1;
}


function* insertOne (req, res, next) {
  try {
    if (! req .body .insert)
      throw 'Missing insert';
    var tran = yield* insert (yield req .dbPromise, req .body .insert);
    res .json ({_id: tran._id, _seq: tran._seq});
  } catch (e) {
    console .log ('transactions insertOne: ', e, req .body);
    next (e);
  }
}

function* insertList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var trans = [];
    for (let tran of req .body .list)
      trans .push (yield* insert (yield req .dbPromise, tran));
    res .json (trans);
  } catch (e) {
    console .log ('transactions insertList: ', e, req .body);
    next (e);
  }
}

function* updateOne (req, res, next) {
  try {
    if (! req .body .id || ! req .body .update)
      throw 'Missing id or update';
    yield* update (yield req .dbPromise, req .body .id, req .body .update);
    res .json (true);
  } catch (e) {
    console .log ('transactions updateOne: ', e, req .body);
    next (e);
  }
}

function* updateList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    for (let item of req .body .list) {
      if (! item .id || ! item .update)
        throw 'Missing id or update';
      yield* update (yield req .dbPromise, item .id, item .update);
    }
    res .json (true);
  } catch (e) {
    console .log ('transactions updateList: ', e, req .body);
    next (e);
  }
}

function* removeOne (req, res, next) {
  try {
    if (! req .body .id)
      throw 'Missing id';
    res .json (yield* remove (yield req .dbPromise, req .body .id));
  } catch (e) {
    console .log ('transactions removeOne: ', e, req .body);
  }
}

function* removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var results = []
    for (let id of req .body .list)
      results .push (yield* remove (yield req .dbPromise, id));
    res .json (results);
  } catch (e) {
    console .log ('transactions removeList: ', e, req .body);
  }
}

function* findAccountBalance (req, res, next) {
  try {
    res .json (yield* findAccountAndRollForward (yield req .dbPromise, req .body .query));
  } catch (e) {
    console .log ('transactions findAccountBalance: ', e, req .body);
  }
}

router .post ('/insert/one', function (req, res, next) {
  async (insertOne) (req, res, next);
})

router .post ('/insert/list', function (req, res, next) {
  async (insertList) (req, res, next);
})

router .post ('/update/one', function (req, res, next) {
  async (updateOne) (req, res, next);
})

router .post ('/update/list', function (req, res, next) {
  async (updateList) (req, res, next);
})

router .post ('/remove/one', function (req, res, next) {
  async (removeOne) (req, res, next);
})

router .post ('/remove/list', function (req, res, next) {
  async (removeList) (req, res, next);
})

router .post ('/findAccountBalance', function (req, res, next) {
  async (findAccountBalance) (req, res, next);
})

module .exports = router;
