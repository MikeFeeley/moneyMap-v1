'use strict';

var fs        = require ('fs');
var csvParser = require ('csv-parse');

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var db     = require ('mongodb') .MongoClient .connect (URL + DB_NAME);

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

async function importTranCSVFile (filename, update) {
  if (await exists (filename)) {
    let trans = await readCSV (filename);
    console.log (trans);
  } else
    console.log ('Import file not found: ' + filename)
}

async function main() {
  try {
    db = await db;
    await importTranCSVFile (process .argv [2], process .argv [3] == 'update');
  } catch (e) {
    console.log (e);
  } finally {
    db .close();
  }
}

main();
