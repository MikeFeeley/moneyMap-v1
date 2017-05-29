'use strict';

var express  = require ('express');
var async    = require ('../lib/async.js');
var router   = express.Router();
var ObjectID = require('mongodb').ObjectID

function* handleSeq (id, insert) {
  if (insert._seq === null)
    insert._seq = (yield (yield dbPromise) .collection ('counters') .findOneAndUpdate (
      {_id:  id},
      {$inc: {seq: 1}}
    )) .value .seq;
}

function* newUID() {
  return (yield (yield dbPromise) .collection ('counters') .findOneAndUpdate (
    {_id:  'transactions'},
    {$inc: {uid: 1}}
  )) .value .uid;
}

function* apply (pt, accId) {
  var db           = yield dbPromise;
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
        yield* apply              (tpt, tpt .update. account);
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
      console .log ('Duplicate insert ignored', e, pt);
    }
  } else if (pt .remove) {
    try {
      var prev = (yield transactions .findOneAndDelete ({_id: pt._id})) .value;
      amount = -((prev .debit || 0) - (prev .credit || 0));
    } catch (e) {
      console .log ('Duplicate remove ignored', e, pt);
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

function* findAccountAndRollForward (query) {
  var accounts = (yield dbPromise) .collection ('accounts');
  for (let acc of yield accounts .find (query) .toArray())
    for (let pt of (acc && acc .pendingTransactions) || [])
      yield* apply (pt, acc._id);
  return yield accounts .find (query) .toArray();
}

function* insert (tran) {
  var db           = yield dbPromise;
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  tran._id = tran._id || new ObjectID() .toString();
  yield* handleSeq ('transactions', tran);
  if (tran .account != null && (tran .debit != null || tran .credit != null)) {
    var pt = {
      uid:    yield* newUID(),
      insert: tran
    }
    yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    yield* apply              (pt, tran .account);
  } else
    yield transactions .insertOne (tran);
  return tran;
}

function* update (id, update) {
  var db           = yield dbPromise;
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  if (update .debit != null || update .credit != null || update .account != null) {
    var tran = yield transactions .findOne ({_id: id});
    if (!tran)
      throw 'Update transaction not found ' + id;
    if (tran .account) {
      var pt = {
        uid:    yield* newUID(),
        _id:    id,
        update: update,
      }
      pt._master = update .account != null;
      yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
      yield* apply              (pt, tran .account);
      return true;
    } else if (update .account) {
      var pt = {
        uid:     yield* newUID(),
        _master: true,
        _id:     id,
        update:  update
      }
      yield accounts .updateOne ({_id: update .account}, {$push: {pendingTransactions: pt}});
      yield* apply              (pt);
    }
  }
  yield transactions .updateOne ({_id: id}, {$set: update});
  return true;
}

function* remove (id) {
  var db           = yield dbPromise;
  var accounts     = db .collection ('accounts');
  var transactions = db .collection ('transactions');
  var tran = yield transactions .findOne ({_id: id});
  if (!tran)
    throw 'Remove Transaction not found';
  if (tran .account) {
    var pt = {
      uid:    yield* newUID(),
      _id:    id,
      remove: true
    }
    yield accounts .updateOne ({_id: tran .account}, {$push: {pendingTransactions: pt}});
    yield* apply              (pt, tran .account);
    return true;
  }
  return (yield transactions .deleteOne ({_id: id})) .deletedCount == 1;
}


function* insertOne (req, res, next) {
  try {
    if (! req .body .insert)
      throw 'Missing insert';
    var tran = yield* insert (req .body .insert);
    res .json ({_id: tran._id, _seq: tran._seq});
  } catch (e) {
    console .log ('insertOne: ', e, req .body);
    next (e);
  }
}

function* insertList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var trans = [];
    for (let tran of req .body .list)
      trans .push (yield* insert (tran));
    res .json (trans);
  } catch (e) {
    console .log ('insertList: ', e, req .body);
    next (e);
  }
}

function* updateOne (req, res, next) {
  try {
    if (! req .body .id || ! req .body .update)
      throw 'Missing id or update';
    yield* update (req .body .id, req .body .update);
    res .json (true);
  } catch (e) {
    console .log ('updateOne: ', e, req .body);
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
      yield* update (item .id, item .update);
    }
    res .json (true);
  } catch (e) {
    console .log ('updateList: ', e, req .body);
    next (e);
  }
}

function* removeOne (req, res, next) {
  try {
    if (! req .body .id)
      throw 'Missing id';
    res .json (yield* remove (req .body .id));
  } catch (e) {
    console .log ('removeOne: ', e, req .body);
  }
}

function* removeList (req, res, next) {
  try {
    if (! req .body .list)
      throw 'Missing list';
    var results = []
    for (let id of req .body .list)
      results .push (yield* remove (id));
    res .json (results);
  } catch (e) {
    console .log ('removeList: ', e, req .body);
  }
}

function* findAccountBalance (req, res, next) {
  try {
    res .json (yield* findAccountAndRollForward (req .body .query));
  } catch (e) {
    console .log ('findAccountBalance: ', e, req .body);
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
