const fs      = require('fs');
const http    = require('http');
const https   = require('https');
const express = require ('express');
const path    = require ('path');
const util    = require ('../lib/util.js');
const crypto  = require ('crypto');
const router  = express .Router();

const ADMIN_PASSWORD = JSON .parse (fs .readFileSync ('config.json', 'utf8')) .adminPassword;

const credentials = {
  key:  fs.readFileSync ('ssl/key.pem', 'utf8'),
  cert: fs.readFileSync ('ssl/cert.pem', 'utf8')
};

const app        = express ();
const bodyParser = require ('body-parser');

app .use (bodyParser.json({limit: '100mb'}));
app .use (express.static ('code/browser'));

var connections = new Map();
var count = 0;

app .post ('/upcall', function (req, res) {
  try {
    if (req .body .respondImmediately)
      res .json ({ack: true});

   else if (req .body .database && req .body .sessionId) {

      let dbConnections = connections   .get (req .body .database) || connections .set (req .body .database, new Map()) .get(req .body .database);
      let connection    = dbConnections .get (req .body .sessionId);

      if (connection) {

        // clear existing timeouts; this call resets them
        if (connection .response)
          clearTimeout (connection .timeoutId);
        clearTimeout (connection .disconnectTimeoutId);

        if (req .body .disconnect) {
          dbConnections .delete (req .body .sessionId);
          if (dbConnections .size == 1) {
            module .exports .notifyOtherClients (req .body .database, req .body .sessionId, {sharing: false});
          }
          res .json ({disconnected: true});
          if (connection .response)
            connection .response .json ({disconnected: true});
          return;
        }

        // use this connection for any queued events
        if (connection .queue .length) {
          res .json ({database: req .body .database, upcalls: connection .queue});
          res = null;
          connection .queue = [];
        }

      } else {

        if (req .body .disconnect) {
          res .json ({noDisconnectNotConnected: true});
          return;
        }

        // do notifications for new connection
        module .exports .notifyOtherClients (req .body .database, req .body .sessionId, {sharing: true});
        if (dbConnections .size > 0) {
          dbConnections .set (req .body .sessionId, {queue: []});
          res .json ({database: req .body .database, upcalls: [{sharing: true}]});
          res = null;
        }
      }

      // set sessions disconnect timer
      let disconnectTimeoutId = setTimeout (() => {
        let connection = dbConnections .get (req .body .sessionId);
        if (connection && connection .timeoutId)
          clearTimeout (connection .timeoutId);
        dbConnections .delete (req .body .sessionId);
        if (dbConnections .size == 1) {
          module .exports .notifyOtherClients (req .body .database, req .body .sessionId, {sharing: false});
        }
      }, util .SERVER_DISCONNECT_THRESHOLD);

      // set client keep-alive timer
      let timeoutId = setTimeout(() => {
        let connection = dbConnections .get (req .body .sessionId);
        if (connection && connection .response) {
          connection .response .json ({timeout: true});
          connection .response = null;
        }
      }, util .SERVER_HEART_BEAT_INTERVAL);

      // save connection
      dbConnections .set (req .body .sessionId, {
        response:            res,
        timeoutId:           timeoutId,
        disconnectTimeoutId: disconnectTimeoutId,
        queue:               []
      });

    }
  } catch (e) {
    console .trace (e);
  }
});

module .exports = {
  notifyOtherClients: (database, thisSessionId, event) => {
    let dbConnections = connections .get (database);
    if (dbConnections)
      for (let [sessionId, connection] of dbConnections .entries()) {
        if (sessionId != thisSessionId) {
          if (connection .response) {
            clearTimeout (connection .timeoutId);
            connection .response .json ({database: database, upcalls: [event]});
            connection .response = null;
          } else
            connection .queue .push (event);
        }
      }
   }
}

const db      = require ('mongodb') .MongoClient .connect ('mongodb://localhost:27017');
const dbCache = new Map();

async function getDB (name) {
  return dbCache .get (name) || dbCache .set (name, (await db) .db (name)) .get (name);
}

const cryptoKeyCache = new Map();
const cryptoRules    = new Map();
const cryptoAlgoritm = 'aes-128-cbc';
const cryptoSalt     = 'MichaelLindaCaitlinLiamJosephKayMarieSeamus';
cryptoRules .set ('accounts',     {fields: ['balance']});
cryptoRules .set ('actuals',      {fields: ['amount', 'count', 'pendingTransactions.update.debit', 'pendingTransactions.update.credit']});
cryptoRules .set ('transactions', {fields: ['credit', 'debit']});
cryptoRules .set ('users',        {fields: ['username', 'name', 'password', 'passwordHint']});

function getCryptoKey (password) {
  return cryptoKeyCache .get (password) || cryptoKeyCache .set (password, crypto .pbkdf2Sync  (password, cryptoSalt, 1000, 16, 'sha256')) .get (password);
}

function encrypt (password, text) {
  const iv = crypto .randomBytes (16);
  const c  = crypto .createCipheriv (cryptoAlgoritm, getCryptoKey (password), iv);
  return {
    ct: c .update (JSON .stringify (text), 'utf8', 'latin1') + c .final ('latin1'),
    iv: iv .toString ('latin1')
  }
}

function decrypt (password, cypherText) {
  if (cypherText && typeof cypherText == 'object') {
    const  d  = crypto .createDecipheriv (cryptoAlgoritm, getCryptoKey (password), Buffer .from (cypherText .iv, 'latin1'));
    return JSON .parse (d .update (cypherText .ct, 'latin1', 'utf8') + d .final ('utf8'));
  } else
    return cypherText;
}

function cryptoDoc (cryptoOp, password, docs, table) {

  const hasField = (docs, path) =>
    !! (Array .isArray (docs)? docs: [docs]) .find (doc =>
      Object .entries (doc) .find (([docField, docValue]) => {
        if (docField .startsWith ('$'))
          return hasField (docValue, path);
        const dotPos = path .indexOf ('.');
        const field  = dotPos == -1? path: path .slice (0, dotPos);
        if (field == docField)
          return dotPos == -1 || hasField (docValue, path .slice (dotPos + 1))
      })
    );

  const cryptoFields = (docs, path) => {
    const dotPos = path .indexOf ('.');
    const field  = dotPos == -1? path: path .slice (0, dotPos);
    for (const doc of Array .isArray (docs)? docs: [docs])
      for (const d of [doc, doc .$set || {}, doc .$push || {}])
        if (d [field]) {
          if (dotPos == -1)
            d [field] = cryptoOp (password, d [field]);
          else
            cryptoFields (d [field], path .slice (dotPos + 1))
        }
  };

  const rule = cryptoRules .get (table);
  if (rule) {
    const isArray = Array .isArray (docs);
    const outDocs = (isArray? docs: [docs]) . map (doc => rule .fields .find (field  => hasField (doc, field))? JSON .parse (JSON .stringify (doc)): doc);
    for (const field of rule .fields)
      cryptoFields (outDocs, field);
    return isArray? outDocs: outDocs [0];
  } else
    return docs;

}



app .use ('/images', (req, res) => {
  res .sendFile (path .join (__dirname, 'code/browser/images', req .url));
})

app.use ('/', require ('./index'));

app.use(function (req, res, next) {
  try {
    var database = req .body .database;
    if (database == 'admin') {
      let err     = new Error ('Direct access to Admin database not permitted');
      err .status = 403;
      res .status(err.status || 500);
      res .render('error', {
        message: err.message,
        error: err
      });
    } else if (req .body) {
      if (req .url .startsWith ('/admin/') && ! ['/admin/copyBudget', '/admin/removeBudget', '/admin/removeConfiguration'] .includes (req.url)) {
        database = 'admin';
        req .body .cryptoPassword = ADMIN_PASSWORD;
      }
      req .dbPromise = getDB (database);
      req._getDB     = getDB;
      for (let op of [encrypt, decrypt])
        req [op .name] = (doc, table) => req .body .cryptoPassword? cryptoDoc (op, req .body .cryptoPassword, doc, table || req .body .collection): doc;
      if (req .body .collection == 'actuals' && ! req .url. startsWith ('/actuals/'))
        req .url = '/transaction/actuals';
      else if (! req .url .startsWith ('/transaction/')) {
        if (req .body .collection == 'transactions' && ! req .url .startsWith ('/find/'))
          req .url = '/transaction' + req.url;
        else if (req .body .collection == 'account' && req .url == '/find/get')
          req .url = '/transaction/findAccount';
      }
      if (req .body .collection) {
        let raw = req .body .collection .indexOf ('$RAW');
        if (raw != -1)
          req .body .collection = req .body .collection .slice (0, raw);
      }
      next();
    } else {
      console.log ('XXX Empty body');
      throw 'XXX Empty body';
    }
  } catch (e) {
    console .log (e);
  }
});

app.use ('/transaction', require ('./transaction'))
app.use ('/find',        require ('./find'));
app.use ('/update',      require ('./update'));
app.use ('/insert',      require ('./insert'));
app.use ('/remove',      require ('./remove'));
app.use ('/admin',       require ('./admin'));

app.use(function(req, res, next) {
  console.log ('Error Not Found', req .url, req .body);
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

app.use(function(err, req, res, next) {
  res.status (err.status || 500) .send ('error: ' + err .message);
});


var httpServer  = http  .createServer (app);
var httpsServer = https .createServer (credentials, app);

// httpServer.listen (3000, () => {
//   console.log ('Listening for http on port ' + 3000)
// })
httpsServer.listen (3001, () => {
  console.log ('Listening for https on port ' + 3001)
});

