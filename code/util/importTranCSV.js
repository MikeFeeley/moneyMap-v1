'use strict';

var fs          = require ('fs');
var csvParser   = require ('csv-parse');
var ObjectID    = require('mongodb').ObjectID
var util        = require ('../lib/util.js');

var argFilename = process .argv [2];
var argIsUpdate = process .argv [3] == 'update'

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var db = require ('mongodb') .MongoClient .connect (URL + DB_NAME);
var accounts, cats;

function parseCSV (file) {
  return new Promise (function (resolve, reject) {
    fs .createReadStream (file) .pipe (csvParser ({delimiter: ','}, (err, data) => {
      return err? reject(err) : resolve (data);
    }));
  })
}

function exists (file) {
  return new Promise (function (resolve) {
    fs .stat (file, err => {
      resolve (err == null);
    });
  })
}

function* getCSV (file) {
  var rows = [];
  if (yield exists (file)) {
    var csv = yield parseCSV (file);
    var cols = csv[0] .map (function (c) {return c.trim().toLowerCase()});
    csv .slice (1) .forEach (function (r) {
      var row = {};
      r .forEach (function (v, i) {
        row [cols [i]] = v.trim();
      });
      rows.push (row);
    })
  }
  return rows;
}

async function readCSV (filename) {
  let rows = []
  let csv  = await parseCSV (filename);
  let head = csv [0] .map (c => {return c.toLowerCase() .split (' ') .join('_') .split ('-') .join ('_')});
  return csv .slice (1) .map (row => {
    return row .reduce ((o,_,i) => {
      o [head [i]] = row [i];
      return o;
    }, {})
  })
}

function getAccount (name) {
  return accounts .get (name .toLowerCase());
}

function getCategory (name) {
  let match = cats .get (name .toLowerCase());
  if (match) {
    if (match .length > 1)
      match = match .sort ((a,b) => {return a .depth < b .depth? -1: a .depth == b .depth? 0: 1});
    return match[0]._id;
  } else
    return name;
}

function expandRanges (trans) {
  let expanded = [];
  for (let tran of trans) {
    if (tran .until !== undefined) {
      tran .start = tran .date;
      tran .end   = tran .until? tran .until: tran .start;
    }
    if (tran .start) {
      let start = Number (tran .start .replace (/\-/g,''));
      let end   = tran.end? Number (tran .end   .replace (/\-/g,'')): start;
      for (let date = start; date <= end; date = util .Types .date .addMonthStart (date, 1)) {
        let dateString = String (date);
        dateString = dateString .slice (0,4) + '-' + dateString .slice (4,6) + '-' + dateString .slice (6,8);
        let amount = Math .floor (Number (tran .amount .replace (/[\$,\,]/g,'')) * 100);
        let catLC  = tran .category .toLowerCase();
        expanded .push ({
          date:        dateString,
          payee:       tran .description,
          debit:       util .Types .moneyDCZ .toString (amount < 0? -amount: 0),
          credit:      util .Types .moneyDCZ .toString (amount > 0? amount: 0),
          account:     'visa',
          category:    tran .category,
          description: ''
        })
      }
    } else {
      expanded .push (tran);
    }
  }
  return expanded;
}

async function importTranCSVFile (filename) {
  let tm = db .collection ('transactions');
  if (await exists (filename)) {
    let trans = expandRanges (await readCSV (filename));
    let unAcc = new Set();
    let unCat = new Set();
    for (let tran of trans) {
      if (! accounts .get (tran .account .toLowerCase()))
        unAcc .add (tran .account);
      if (! cats .get (tran .category .toLowerCase()))
        unCat .add (tran .category);
    }
    let printed;
    for (let name of unAcc) {
      if (! printed) {
        console .log ('Unmatched Accounts:');
        printed = true;
      }
      console .log ('   ' + name);
    }
    printed = false;
    for (let name of unCat) {
      if (! printed) {
        console .log ('Unmatched Categories:')
        printed = true;
      }
      console .log ('   ' + name);
    }
    if (argIsUpdate) {
      let promises = [];
      for (let tran of trans) {
        let description = tran .description;
        if (tran .subcategory)
          description = (tran .subcategory + (description .length? '; ': '')) + description;
        if (tran .account .toLowerCase() == 'line of credit')
          description = description + (description .length? '; ': '') + 'Line of Credit';
        promises .push (tm .insert ({
          _id:         new ObjectID() .toString(),
          date:        Number (tran .date .replace (/\-/g,'')),
          payee:       tran .payee,
          debit:       Math .floor (Number (tran .debit  .replace (/[\$,\,]/g,'')) * 100),
          credit:      Math .floor (Number (tran .credit .replace (/[\$,\,]/g,'')) * 100),
          account:     getAccount (tran .account),
          description: description,
          category:    getCategory (tran .category)
        }))
      }
      await Promise .all (promises);
    }
  } else
    console.log ('Import file not found: ' + filename)
}

function addAccountAliases() {
  let aliases = [
    ['savings',        'chequing'],
    ['line of credit', 'chequing'],
    ['cash',           'cash mike'],
    ['visa linda',     'visa'],
    ['visa mike',      'visa'],
    ['',               'chequing']
  ];
  for (let a of aliases)
    accounts .set (a[0], accounts .get (a[1]));
}

function addCategoryAliases() {
  let aliases = [
    ['goods',             'household'],
    ['home',              'housing'],
    ['services',          'household'],
    ['auto',              'transportation'],
    ['salary linda',      'linda'],
    ['salary mike',       'mike'],
    ['reimbursement',     'reimbursed'],
    ['long-term savings', 'investing'],
    ['home  improvement', 'home improvement'],
    ['investments',       'investing']
  ];
  for (let a of aliases)
    cats .set (a[0], cats .get (a[1]));
}

async function addCategories() {
  let cm  = db .collection ('categories');
  let add = [
      ['Investing', 'Savings'],
      ['Childcare', 'Spending'],
      ['Education', 'Spending']
  ];
  for (let a of add) {
    if ((await cm .find ({name: a[0]}) .toArray()) .length == 0) {
      let parent = await cm .findOne ({name: a[1]});
      await cm .insert ({_id: new ObjectID() .toString(), name: a[0], parent: parent._id, budgets: []});
    }
  }
}

async function main() {
  try {
    db   = await db;
    accounts = (await db .collection ('accounts') .find() .toArray()) .reduce ((map,acc) => {
      return map .set (acc .name .toLowerCase(), acc._id);
    }, new Map());
    addAccountAliases();
    if (argIsUpdate)
      await addCategories();
    cats = await db .collection ('categories') .find () .toArray();
    let catMap = cats .reduce ((map, cat) => {return map .set (cat._id, cat)}, new Map());
    let getPathDepth = (cat, depth=0) => {
      return cat .parent? getPathDepth (catMap .get (cat .parent), depth + 1): depth;
    }
    cats = cats
      .reduce ((map, cat) => {
        cat .depth = getPathDepth (cat);
        let lcName = cat .name .toLowerCase()
        map .set (lcName, (map .get (lcName) || []) .concat (cat));
        return map
      }, new Map());
    addCategoryAliases();
    await importTranCSVFile (argFilename);
    if (argIsUpdate)
      await db .collection ('actualsMeta') .removeOne ({type: 'isValid'});
  } catch (e) {
    console.log (e);
  } finally {
    db .close();
  }
}

main();
