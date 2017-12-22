class TransactionTable extends Table {
  async _addModelData () {
    return super._addModelData ();
  }
  constructor (name, query, sort, options, columns, accounts, variance, view) {
    var _sort = (a,b) => {
      var getSeq = t => {return t .leader || t._seq};
      var s = sort && sort (a,b) || 0;
      if (s == 0) {
        var as = getSeq (a);
        var bs = getSeq (b);
        s = as < bs? -1: as == bs? 0: 1;
        if (s == 0) {
          var as = a .sort || 0;
          var bs = b .sort || 0;
          s = as < bs? -1: 1;
        }
      }
      return s;
    }
    query = query || {};
    if (! options .noGrouping)
      (query .$options = query .$options || {}) .groupBy = 'group';
    super (
      new TransactionModel(), view, query, _sort, options, columns
    );
    this._accounts          = accounts;
    this._variance          = variance;
    this._accountsObserver  = this._accounts                                   .addObserver (this, this._accountsModelChange);
    this._schedulesObserver = this._variance .getBudget() .getSchedulesModel() .addObserver (this, this._schedulesModelChange);
  }

  static newInstance (name, query, sort, options, columns, accounts, variance) {
    return new TransactionTable (
      name, query, sort, options, columns, accounts, variance,
      new TransactionTableView (name, columns, options, accounts, variance)
    );
  }

  delete() {
    this._model .delete();
    this._view  .delete();
    this._accounts                                   .deleteObserver (this._accountsObserver);
    this._variance .getBudget() .getSchedulesModel() .deleteObserver (this._schedulesObserver);
    super .delete();
  }  

  _resetIfChanged (eventType, doc, arg, fieldName) {
    if (eventType == ModelEvent .UPDATE && arg .name)
      for (let tran of this._view .getTuples() || [])
        if (tran [fieldName] == doc ._id)
          this._view .resetField (tran._id, fieldName);
  }

  _accountsModelChange (eventType, doc, arg, source) {
    this._resetIfChanged (eventType, doc, arg, 'account')
  }

  _schedulesModelChange (eventType, doc, arg, source) {
    this._resetIfChanged (eventType, doc, arg, 'category')
  }

  _getTupleOptions (doc, group) {
    return {
      isGroup:  doc .group,
      isLeader: doc .group && doc .group == doc._id,
      isLast:   group .reduce ((m,t) => {return Math .max (m, t .sort)}, 0) == doc .sort
    }
  }

  _getGroup (doc) {
    return doc .group? this._model .refine (t => {return t .group == doc .group}) .sort ((a,b) => {return a .sort < b .sort? -1: 1}): [];
  }

  _getTran (id) {
    return this._model .refine (t => {return t._id == id}) [0];
  }

  _addTuple (doc, pos) {
    this._view .addTuple (this._getTupleData (doc), pos, this._getTupleOptions (doc, this._getGroup (doc)));
  }

  _updateTuple (doc) {
    let group = this._getGroup (doc);
    for (let d of group || [doc])
      this._view .updateTuple (d._id, this._getTupleOptions (d, group));
  }

  _onModelChange (eventType, doc, arg, source) {
    this._updateTuple    (doc);
    super._onModelChange (eventType, doc, arg, source);
  }

  _onViewChange (eventType, arg) {
    if (eventType == TupleViewEvent .UPDATE) {
      if (arg .fieldName == 'category') {
        let categories = this._variance .getBudget() .getCategories();
        let cat = categories .get (arg .value);
        if (cat && cat .children && cat .children .length) {
          this._view .showFieldTip (
            ['Consider a more specific category.','Edit again and move arrow to the right.'],
            arg .id, arg .fieldName
          );
        }
      }
      else if (['debit', 'credit'] .includes (arg .fieldName)) {
        if (arg.value > 0)
          this .updateField (arg.id, arg.fieldName == 'debit'? 'credit': 'debit', 0);
        else if (arg.value < 0) {
          var cancelEvent = true;
          this .updateField (arg.id, 'debit',  arg.fieldName == 'credit'? -arg.value: 0);
          this .updateField (arg.id, 'credit', arg.fieldName == 'debit'?  -arg.value: 0);
        }
      }
    }
    if (!cancelEvent)
      super._onViewChange (eventType, arg);
  }

  async _redistributeGroupAmount (tran, delta) {
    var siblings   = this._getGroup (tran) .filter (t => {return t._id != tran ._id});
    var newAmounts = [];
    for (let s of siblings) {
      var ca = (s .debit || 0) - (s .credit || 0);
      var na = Math [ca > 0? 'max': 'min'] (0, ca + delta);
      delta -= (na - ca);
      newAmounts .push (na);
    }
    if (delta)
      newAmounts [0] = delta;
    var updates = [];
    for (let i = 0; i < siblings .length; i ++) {
      var s  = siblings   [i];
      var a  = newAmounts [i];
      var c = - Math.min (0, a);
      var d = Math .max  (0, a);
      if (c != (s .credit || 0) || d != (s .debit || 0))
        updates .push (this._model .update (s._id, {credit: c, debit: d}))
    }
    for (let u of updates)
      await u;
  }

  async _updateField (id, fieldName, value) {
    if (['debit', 'credit'] .includes (fieldName)) {
      var tran  = this._getTran (id);
      if (tran .group && tran [fieldName] != value)
        await this._redistributeGroupAmount (tran, ((tran .debit || 0) - (tran .credit || 0)) - value * (fieldName == 'credit'? -1: 1));
    }
    if (['date', 'payee', 'account'] .includes (fieldName)) {
      var tran = this._getTran (id);
      if (tran .group && tran .group == tran ._id) {
        var updateList = this._getGroup (tran)
          .map    (t => {var o = {id: t._id, update: {}}; o .update [fieldName] = value; return o})
        await this._model .updateList (updateList);
      }
    }
    await super._updateField (id, fieldName, value);
  }

  async _insert (insert, pos) {
    insert ._seq = null;
    var tran = pos && this._getTran (pos .id);
    if (pos && pos .inside) {
      if (! tran .group) {
        await this._model .update (tran._id, {group: tran._id, sort: 0});
        tran .group = tran._id;
        tran .sort  = 0;
      }
      var group = this._getGroup (tran);
      for (let f of ['group', 'date', 'payee', 'account'])
        insert [f] = tran [f];
      insert .sort   = tran .sort + (pos .before && tran .sort > 0? 0: 1);
      insert .leader = group [0]._seq;
      var sortAdjust = group
        .filter (t => {return t .sort >= insert .sort})
        .map    (t => {return {id: t._id, update: {sort: t .sort + 1}}})
      await this._model .updateList (sortAdjust);
    } else if (tran && tran .group) {
      var group = this._getGroup (tran);
      pos .id = (pos .before? group [0]: group [group .length - 1]) ._id;
    }
    await super._insert (insert, pos);
  }

  async _remove (id) {
    var tran = this._getTran (id);
    if (tran .group) {
      if (tran .group == tran._id) {
        await super._removeList (this._getGroup (tran) .map (s => {return s._id}));
        return;
      }
      await this._redistributeGroupAmount (tran, (tran .debit - tran .credit) || 0);
      var group = this._getGroup (tran);
      if (group .length == 2)
        await this._model .update (group [0]._id, {group: null});
    }
    await super._remove (id);
  }
}
