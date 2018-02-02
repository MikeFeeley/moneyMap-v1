'use strict';

var ObjectID = require('mongodb').ObjectID


/**
 * Convert accounts from pre Nov 2017 version
 */

const URL     = 'mongodb://localhost:27017/';
const DB_NAME = 'config_598f8d9dea4ca56c04ecafbd_72918055392801760';

var db = require ('mongodb') .MongoClient .connect (URL + DB_NAME);

async function main() {
  try {
    db = await db;
    let sort = 1;
    let group = [];
    for (let account of await db .collection ('accounts') .find() .toArray())
      await db .collection ('accounts') .updateOne ({_id: account._id}, {$set: {form: account .cashFlow? 0: 1}, $unset: {cashFlow: true}});
    await db .collection ('accounts') .insert ({type: 0, form: 2, name: 'UBC', sort: 0});
  } catch (e) {
    console .log(e);
  } finally {
    db .close();
  }
}

main();