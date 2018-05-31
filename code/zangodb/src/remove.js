const { getIDBError } = require('./util.js');

module.exports = (cur, cb) => {
    let orig = [];
    (function iterate() {
        cur._next((error, doc, idb_cur) => {
            if (!doc) { return cb(error, orig); }

            orig .push (JSON .parse (JSON .stringify (doc)));

            const idb_req = idb_cur.delete();

            idb_req.onsuccess = iterate;
            idb_req.onerror = e => cb(getIDBError(e));
        });
    })();
};
