var fs      = require('fs');
var http    = require('http');
var https   = require('https');
var express = require ('express');
var util    = require ('../lib/util.js');
var router  = express .Router();

var credentials = {
  key:  fs.readFileSync ('../ssl/key.pem', 'utf8'),
  cert: fs.readFileSync ('../ssl/cert.pem', 'utf8')
};

var express    = require ('express');
var app        = express ();
var bodyParser = require ('body-parser');

app .set ('views', './views');
app .set ('view engine', 'pug');

app .use (bodyParser.json());
app .use (bodyParser.urlencoded ({extended: true}));
app .use (express.static ('browser'));

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
          if (dbConnections .size == 1)
            module .exports .notifyOtherClients (req .body .database, req .body .sessionId, {sharing: false});
          res .json ({disconnected: true});
          if (connection .response)
            connection .response .json ({disconnected: true});
          return;
        }

        // use this connection for any queued events
        if (connection .queue .length) {
          res .json ({database: req .body .database, upcalls: connection .queue});
          connection .queue = [];
          return;
        }

      } else {

        // do notifications for new connection
        module .exports .notifyOtherClients (req .body .database, req .body .sessionId, {sharing: true});
        if (dbConnections .size > 0) {
          dbConnections .set (req .body .sessionId, {queue: []});
          res .json ({database: req .body .database, upcalls: [{sharing: true}]});
          return;
        }
      }

      if (req .body .disconnect) {
        res .json ({noDisconnectNotConnected: true});
        return;
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

db      = require ('mongodb') .MongoClient;
dbCache = new Map();

function getDB (name) {
  return dbCache .get (name) || dbCache .set (name, db .connect ('mongodb://localhost:27017/' + name)) .get (name);
}

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
      if (req .url .startsWith ('/admin/'))
        database = 'admin';
      req .dbPromise = getDB (database);
      req._getDB     = getDB;
      if (req .body .collection == 'actuals' && ! req .url. startsWith ('/actuals/'))
        req .url = '/transaction/actuals';
      else if (! req .url .startsWith ('/transaction/')) {
        if (req .body .collection == 'transactions' && ! req .url .startsWith ('/find/'))
          req .url = '/transaction' + req.url;
        else if (req .body .collection == 'accountBalance' && req .url == '/find/get')
          req .url = '/transaction/findAccountBalance';
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
  res.status (err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});


var httpServer  = http  .createServer (app);
var httpsServer = https .createServer (credentials, app);

httpServer.listen (3000, () => {
  console.log ('Listening for http on port ' + 3000)
})
httpsServer.listen (3001, () => {
  console.log ('Listening for https on port ' + 3001)
});
