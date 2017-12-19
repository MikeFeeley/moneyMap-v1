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

var upcalls = new Map();

app .post ('/upcall', function (req, res) {
  if (req .body .respondImmediately)
    res .json ({ack: true});
  else {
    let timeoutId = setTimeout(() => {
      let u = upcalls .get (req .body .sessionId);
      if (u && u .response == res) {
        res .json ({timeout: true});
        upcalls .delete (req .body .sessionId);
      }
    }, util .SERVER_KEEP_ALIVE_INTERVAL);
    if (! upcalls .get (req .body .sessionId)) {
      module .exports .notifyOtherClients (req .body .sessionId, {sharing: true}); // TODO: need better, more stable list of connected clients
    }
    upcalls .set (req .body .sessionId, {
      response:  res,
      timeoutId: timeoutId
    })
  }
});

module .exports = {
  notifyOtherClients: (thisSessionId, event) => {
    for (let [sessionId, upcall] of upcalls .entries())
      if (sessionId != thisSessionId) {
        clearTimeout (upcall .timeoutId);
        upcall .response .json (event);
        upcalls .delete (sessionId);
      }
  }
}

db      = require ('mongodb') .MongoClient;
dbCache = new Map();

function getDB (name) {
  return dbCache .get (name) || dbCache .set (name, db .connect ('mongodb://localhost:27017/' + name)) .get (name);
}

app.get ('/debug', function (req, res, next) {
  req .url = '/';
  req .body .database = 'debug';
  next();
})

app.use ('/', require ('./index'));

app.use(function (req, res, next) {
  try {
    var database = req .body .database;
    if (database == 'admin') {
      var err     = new Error ('Direct access to Admin database not permitted');
      err .status = 403;
      next (err);
    } else {
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
    }
  } catch (e) {
    console .log (e);
  }
})

app.use ('/transaction', require ('./transaction'))
app.use ('/find',        require ('./find'));
app.use ('/update',      require ('./update'));
app.use ('/insert',      require ('./insert'));
app.use ('/remove',      require ('./remove'));
app.use ('/admin',       require ('./admin'));

app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error 500a', {
      message: err.message,
      error: err
    });
  });
}

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error 500b', {
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
