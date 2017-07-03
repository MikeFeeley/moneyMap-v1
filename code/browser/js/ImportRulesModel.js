class ImportRulesModel extends Observable {
  constructor() {
    super();
    this._model     = new Model ('importRules');
    this._tranModel = new Model ('transactions');
    this._model .addObserver (this, this._onModelChange);
  }

  delete() {
    this._model     .delete();
    this._tranModel .delete();
  }

  getTransactionModel() {
    return this._tranModel;
  }

  _compare (a,b) {
    return a.type < b.type? -1: a.type > b.type? 1: a.sort < b.sort? -1: 1;
  }

  _onModelChange (eventType, doc, arg, source) {
    switch (eventType) {
      case ModelEvent .UPDATE:
        var e = this._entries .get (doc._id);
        for (let f of Object .keys (arg))
          e [f] = arg [f];
        if (arg .sort && e .predicate)
          e .parent .children = (e .parent .children || []) .sort ((a,b) => {return this._compare (a,b)});
        break;
      case ModelEvent .INSERT:
        this._entries .set (doc._id, doc);
        if (doc .type == ImportRulesModelType .PREDICATE)
          this._rules .set (doc._id, doc);
        else {
          doc .parent           = this._rules .get (doc .predicate);
          doc .parent .children = ((doc .parent .children || []) .concat (doc))
            .sort ((a,b) => {return this._compare (a,b)});
        }
        break;
      case ModelEvent .REMOVE:
        if (doc .type == ImportRulesModelType .PREDICATE) {
          for (let c of this._rules .get (doc._id) .children || [])
            this._entries .delete (c ._id);
          this._rules .delete (doc._id);
        } else {
          var e = this._entries .get (doc._id);
          e .parent .children .splice (e .parent .children .indexOf (e), 1);
        }
        this._entries .delete (doc._id);
        break;
    }
    this._notifyObservers (eventType, doc, arg, source);
  }

  *find() {
    if (!this._entries) {
      this._entries   = new Map();
      this._rules     = new Map();
    } else {
      this._entries .clear();
      this._rules   .clear();
    }
    for (let r of yield* this._model .find()) {
      this._entries .set (r._id, r);
      if (r .type == ImportRulesModelType .PREDICATE)
        this._rules .set (r._id, r);
    }
    for (let r of this._entries .values())
      if (r .predicate) {
        r .parent            = this._rules .get (r .predicate);
        r .parent .children  = (r .parent .children || []) .concat (r);
      }
    for (let r of this._rules .values())
      if (r .children)
        r .children .sort ((a,b) => {return this._compare (a,b)})
  }

  entriesHaveBeenFound() {
    return this._entries != null;
  }

  *update (id, update, source) {
    return yield* this._model .update (id, update, source);
  }

  *updateList (list, source) {
    return yield* this._model .updateList (list, source);
  }

  *insert (insert, source) {
    return yield* this._model .insert (insert, source);
  }

  *insertList (list, source) {
    return yield* this._model .insertList (list, source);
  }

  *remove (id, source) {
    var rule = this._rules .get (id);
    if (rule)
      yield* this._model .removeList ((rule .children || []) .map (c => {return c._id}))
    return yield* this._model .remove (id, source);
  }

  get (id) {
    return this._entries .get (id);
  }

  isMatch (rule, tran) {
    var allMatch;
    for (let f of ['date', 'payee', 'credit', 'debit', 'description']) {
      var match = true;
      var r0        = rule [f + '_op0'] || '';
      var r1        = rule [f + '_op1'] || '';
      var tranField = tran [f] || '';
      if (f == 'date')
        tranField = Types .date ._day (tranField);
      switch (rule [f + '_fn']) {
        case 'eq':
          match = tranField == r0;
          break;
        case 'sw':
          match = tranField .startsWith (r0);
          break;
        case 'ew':
          match = tranField .endsWith (r0);
          break;
        case 'co':
          match = tranField .includes (r0);
          break;
        case 'lt':
          match = tranField < r0;
          break;
        case 'le':
          match = tranField <= r0;
          break;
        case 'ge':
          match = tranField >= r0;
          break;
        case 'gt':
          match = tranField > r0;
          break;
        case 'be':
          match = tranField > r0 && tranField < r1;
          break;
        case 'bi':
          match = tranField >= r0 && tranField <= r1;
          break;
      }
      allMatch = (typeof allMatch == 'undefined'? true: allMatch) & match;
    }
    return allMatch;
  }

  getMatchingRules (tran) {
    var matches = [];
    for (let rule of this._rules .values())
      if (this .isMatch (rule, tran))
        matches .push (rule);
    return matches;
  }

  getMatchingTransactions (rule, trans) {
    return trans .filter (t => {return this .isMatch (rule, t)})
  }

  _computeAmount (spec, value, remaining) {
    if (spec && typeof spec == 'string' && spec .endsWith ('%'))
      return Math .round (Number ((spec .slice (0, -1) / 100 * value)))
    else if (spec == 'Remaining')
      return remaining
    else
      return Number (spec);
  }

  *applyRule (rule, tran) {
    var async     = [];
    var sort      = this._tranModel
      .refine (t     => {return (t .leader || t._seq) == tran._seq})
      .reduce ((m,t) => {return Math .max (m, t .sort || 0)}, 0);
    var total     = tran .debit + tran .credit
    var remaining = total;
    for (let action of rule .children || [])
      if (action .type == ImportRulesModelType .SPLIT && action .debit != 'Remaining' && action .credit != 'Remaining') {
        let d = this._computeAmount (action .debit   || 0, total, remaining);
        let c = this._computeAmount (action .credit  || 0, total, remaining)
        remaining = Math .max (0, remaining - (d + c))
      }
    for (let action of rule .children || [])
      switch (action .type) {
        case ImportRulesModelType .UPDATE:
          let update = {};
          for (let f of ['payee', 'credit', 'debit', 'account', 'category', 'description'])
            if (action [f + 'Update'])
              update [f] = ['credit', 'debit'] .includes (f)? this. _computeAmount (action [f], tran [f], 0): action [f] || null;
          if (Object .keys (update) .length)
            async .push (this._tranModel .update (tran._id, update));
          break;
        case ImportRulesModelType .SPLIT:
          var data = {
            group:       tran._id,
            sort:        ++sort,
            debit:       this._computeAmount (action .debit  || 0, total, remaining),
            credit:      this._computeAmount (action .credit || 0, total, remaining),
            category:    action .category    || null,
            description: action .description || ''
          }
          if (! hasSplit) {
            var hasSplit = true;
            yield* this._tranModel .update (tran._id, data);
          } else {
            data ._seq        = null;
            data .leader      = tran._seq;
            data .importTime  = tran .importTime;
            data .date        = tran .date;
            data .payee       = tran .payee;
            data .account     = tran .account;
            data .description = data .description;
            async .push (this._tranModel .insert (data));
          }
          break;
        case ImportRulesModelType .ADD:
          var insert = yield* this._tranModel .insert ({
            _seq:        null,
            leader:      tran   ._seq,
            sort:        ++sort,
            importTime:  tran   .importTime,
            date:        tran   .date,
            payee:       action .payee || '',
            debit:       this._computeAmount (action .debit  || 0, total, total),
            credit:      this._computeAmount (action .credit || 0, total, total),
            account:     action .account || null,
            description: action .description || ''
          });
          if (action .category)
            async .push (this._tranModel .update(insert._id, {category: action .category}));
          break;
      }
    for (let a of async)
      yield* a;
  }
}

var ImportRulesModelType = {
  PREDICATE: 0,
  UPDATE:    1,
  SPLIT:     2,
  ADD:       3
}

