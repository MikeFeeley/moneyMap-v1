var express  = require ('express');
var async    = require ('../lib/async.js');
var ObjectID = require ('mongodb').ObjectID
var router  = express.Router();

function* login (req, res, next) {
  try {
    var u = yield (yield dbPromise) .collection ('users') .find ({username: req .body .username}) .toArray();
    if (u .length == 0)
      res .json ({noUser: true})
    else if (u [0] .password != req .body .password)
      res .json ({badPassword: true})
    else
      res.json ({ok: true, user: u [0]});
  } catch (e) {
    console .log ('login: ', e, req.body);
    next (e);
  }
}

function* signup (req, res, next) {
  try {
    var u = yield (yield dbPromise) .collection ('users') .find ({username: req .body .username}) .toArray();
    if (u .length != 0)
      res .json ({alreadyExists: true})
    else {
      var doc = yield (yield dbPromise) .collection ('users') .insert ({
        _id:       new ObjectID() .toString(),
        username:  req .body .username,
        password:  req .body .password,
        accessCap: Math .floor (Math .random() * 100000000000000000),
        name:      req .body .name
      })
      return res.json ({
        ok:        true,
        _id:       doc .ops [0] ._id,
        accessCap: doc .ops [0] .accessCap
      });
    }
  } catch (e) {
    console .log ('login: ', e, req.body);
    next (e);
  }
}

function* updateUser (req, res, next) {
  try {
    if (!req .body .update)
      throw 'Update missing';
    else {
      var result = yield (yield dbPromise) .collection ('users')
        .update (
          {_id: req .body .id, accessCap: req .body .accessCap},
          {$set: req .body .update}
        );
      if (!result || !result .result .ok)
        throw 'Invalid user update attempted';
      res.json ({ok: true});
    }
  } catch (e) {
    console .log ('login: ', e, req.body);
    next (e);
  }
}


router.post ('/login', function(req, res, next) {
  async (login) (req, res, next);
});

router.post ('/signup', function(req, res, next) {
  async (signup) (req, res, next);
});

router.post ('/updateUser', function(req, res, next) {
  async (updateUser) (req, res, next);
});

module.exports = router;
