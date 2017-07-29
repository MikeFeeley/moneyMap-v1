var fs    = require('fs');
var http  = require('http');
var https = require('https');
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
app .use ((req, res, next) => {
  // XXX Compensating for what might be a Safari Technology Preview bug
  if (!req.url.startsWith ('/css/') && req.url.endsWith ('.css.map'))
    req.url = '/css'.concat (req.url);
  next();
});
app .use (express.static ('browser'));

db        = require ('mongodb') .MongoClient;
dbPromise = undefined;
dbName    = undefined;

app.get ('/debug', function (req, res, next) {
  req .url = '/';
  req .body .database = 'debug';
  next();
})

app.use ('/', require ('./index'));

app.use(function (req, res, next) {
  var database = req .body .database;
  if (database == 'admin') {
    var err     = new Error ('Direct access to Admin database not permitted');
    err .status = 403;
    next (err);
  } else {
    if (req .url .startsWith ('/admin/'))
      database = 'admin';
    if (!dbPromise || dbName != database) {
      dbPromise = db .connect ('mongodb://localhost:27017/' + database);
      dbName    = database;
    }
    if (! req.url .startsWith ('/transaction/')) {
      if ((req .body .collection == 'transactions' && req .url != '/find'))
        req .url = '/transaction' + req.url;
      else if (req .body .collection == 'accountBalance' && req .url == '/find')
        req .url = '/transaction/findAccountBalance';
    }
    next();
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
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

app.use(function(err, req, res, next) {
  res.status(err.status || 500);
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
