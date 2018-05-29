var express  = require ('express');
var ObjectID = require ('mongodb').ObjectID
var router  = express.Router();

async function login (req, res, next) {
  try {
    var u = await (await req .dbPromise) .collection ('users') .find ({username: req .body .username}) .toArray();
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

async function signup (req, res, next) {
  try {
    var u = await (await req .dbPromise) .collection ('users') .find ({username: req .body .username}) .toArray();
    if (u .length != 0)
      res .json ({alreadyExists: true})
    else {
      var doc = await (await req .dbPromise) .collection ('users') .insert ({
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
    console .log ('signup: ', e, req.body);
    next (e);
  }
}

async function updateUser (req, res, next) {
  try {
    if (!req .body .update)
      throw 'Update missing';
    else {
      var query = {_id: req .body .id, accessCap: req .body .accessCap};
      if (req .body .update .password) {
        var user = await (await req .dbPromise) .collection ('users') .find (query) .toArray();
        if (! user)
          throw 'Invalid user update attempted';
        else user = user [0];
        if (user .password != req .body .password) {
          res .json ({passwordMismatch: true});
          return;
        }
      }
      if (req .body .update .username) {
        var u = await (await req .dbPromise) .collection ('users') .find ({username: req .body .update .username}) .toArray();
        if (u) {
          res .json ({alreadyExists: true});
          return;
        }
      }
      var result = await (await req .dbPromise) .collection ('users') .update (query, {$set: req .body .update});
      if (!result || !result .result .ok)
        throw 'Invalid user update attempted';
      res.json ({ok: true});
    }
  } catch (e) {
    console .log ('updateUser: ', e, req.body);
    next (e);
  }
}

async function copyDatabase (req, res, next) {
  try {
    let fromDB = await req._getDB (req .body .from);
    let toDB   = await req._getDB (req .body .to);
    console.log('copy from ' + req.body.from + ' to ' + req.body.to);
    for (let fromCollection of await fromDB .collections()) {
      let toCollection = await toDB .collection (fromCollection .collectionName);
      let fromDocs     = await fromCollection .find();
      let promises = [];
      while (await fromDocs .hasNext())
        promises .push (toCollection .insert (await fromDocs .next()));
      await Promise.all (promises);
    }
    res.json ({ok: true});
  } catch (e) {
    console .log ('copyDatabase: ', e);
    next (e);
  }
}

async function copyBudget (req, res, next) {
  try {
    let db = await req .dbPromise;
    let budget = await db .collection ('budgets') .findOne ({_id: req .body .from});
    if (budget) {
      budget .name = 'Copy of ' + budget .name;
      budget._id   = new ObjectID() .toString();
      let ins = await db .collection ('budgets') .insert (budget);
      if (ins .result .ok) {
        budget = ins .ops [0];
        await db .collection ('categories') .updateMany ({budgets: req .body .from}, {$addToSet: {budgets: budget._id}});
        let scheds = await db .collection ('schedules') .find ({budget: req .body .from});
        let promises = []
        while (await scheds .hasNext()) {
          sched = await scheds .next();
          sched._id     = new ObjectID() .toString();
          sched .budget = budget._id;
          promises .push (db .collection ('schedules') .insert (sched));
        }
        await Promise .all (promises);
        res.json(budget);
      }
    }
  } catch (e) {
    console .log ('copyBudget: ', e);
    next (e);
  }
}

async function removeBudget (req, res, next) {
  try {
    let db = await req .dbPromise;
    await db .collection ('budgets') .remove ({_id: req .body .id});
    let noBudgetCats = (await db .collection ('categories') .find ({budgets: [req .body .id]}) .toArray()) .map (c => {return c._id});
    await db .collection ('categories') .updateMany ({budgets: req .body .id}, {$pull: {budgets: req .body .id}});
    await db .collection ('schedules') .remove ({budget: req .body .id});
    let inUse = (await db .collection ('transactions') .find ({category: {$in: noBudgetCats}}) .toArray())
      .reduce ((s,t) => {s .add (t .category); return s}, new Set());
    let cids = Array .from (inUse .keys());
    while (cids .length) {
      cids = (await db .collection ('categories') .find ({_id: {$in: cids}}) .toArray())
        .map    (cat => {return cat .parent})
        .filter (cid => {return cid});
      cids .forEach (cid => {inUse .add (cid)})
    }
    let deleteCats = noBudgetCats .filter (c => {return ! inUse .has (c)});
    await db .collection ('categories') .remove ({_id: {$in: deleteCats}});
    res.json({okay: true});
  } catch (e) {
    console .log ('removeBudget: ', e);
    next (e);
  }
}

async function removeConfiguration (req, res, next) {
  if (req .body .database .startsWith ('config_'))
    await (await req .dbPromise) .dropDatabase();
  res .json ({okay: true});
}

router.post ('/login', function(req, res, next) {
  (async () => {try {await login (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post ('/signup', function(req, res, next) {
  (async () => {try {await signup (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post ('/updateUser', function(req, res, next) {
  (async () => {try {await updateUser (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post('/copyDatabase', function(req, res, next) {
  (async () => {try {await copyDatabase (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post('/copyBudget', function (req, res, next) {
  (async () => {try {await copyBudget (req, res, next)} catch (e) {console .log (e)}}) ();
});

router.post('/removeBudget', function (req, res, next) {
  (async () => {try {await removeBudget (req, res, next)} catch (e) {console .log (e)}}) ();
})

router.post('/removeConfiguration', function (req, res, next) {
  (async () => {try {await removeConfiguration (req, res, next)} catch (e) {console .log (e)}}) ();
})


module.exports = router;
