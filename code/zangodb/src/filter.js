const Fields = require('./lang/fields.js');

module.exports = (next, pred) => (cb) => {
    (function iterate() {
        next((error, doc, idb_cur, source) => {
            if (!doc) { cb(error, undefined, undefined, source); }
            else if (pred.run(new Fields(doc))) {
                cb(null, doc, idb_cur, source);
            } else { iterate(); }
        });
    })();
};
