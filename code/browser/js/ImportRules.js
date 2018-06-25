class ImportRules extends TuplePresenter {
  constructor (model, tran, accounts, variance, onClose) {
    super (model, new ImportRulesView ('_ImportRulesView', tran .date, accounts, variance));
    this._tran      = tran;
    this._accounts  = accounts;
    this._variance  = variance;
    this._rules     = new Set();
    this._onClose  = onClose;
  }

  _onModelChange (eventType, entry, arg, source) {
    if (this._rules .has (entry .predicate || entry._id)) {
      if (entry .type == ImportRulesModelType .ADD)
        this._updateAddTuple (entry);
      super ._onModelChange (eventType, entry, arg, source);
      if (eventType == ModelEvent .UPDATE) {
        if (entry .type == ImportRulesModelType .PREDICATE) {
          this._view .setPredicateIsMatch       (entry._id, this._model .isMatch (entry, this._tran));
          this._view .setPredicateFieldsEnabled (entry);
        } else if (entry .type == ImportRulesModelType .UPDATE) {
          this._view .setUpdateFieldsEnabled (entry);
        }
      } else if (eventType == ModelEvent .REMOVE && entry .type == ImportRulesModelType .PREDICATE)
        this._rules .delete (entry._id);
    }
  }

  async _processAddInsert (entry, insert, pos) {
    insert ._seq = null;
    if (pos && pos .inside) {
      if (! entry .group) {
        await this._model .update (entry._id, {group: entry._id, sort: 0});
        entry .group = entry._id;
        entry .sort  = 0;
      }
      var group = this._getGroup (entry);
      for (let f of ['group', 'date', 'payee', 'account'])
        insert [f] = entry [f];
      insert .sort   = entry .sort + (pos .before && entry .sort > 0? 0: 1);
      insert .leader = group [0]._seq;
      var sortAdjust = group
      .filter (t => {return t .sort >= insert .sort})
      .map    (t => {return {id: t._id, update: {sort: t .sort + 1}}})
      await this._model .updateList (sortAdjust);
    } else if (entry && entry .group) {
      var group = this._getGroup (entry);
      pos .id = (pos .before? group [0]: group [group .length - 1]) ._id;
    }
  }

  async _processAddRemove (id) {
    var entry = this._model .get (id);
    if (entry .group) {
      if (entry .group == entry._id) {
        let removeList = this._getGroup (entry) .filter (s => {return s._id != id}) .map (s => {return s._id});
        if (removeList .length)
          await super._removeList (removeList);
        return;
      }
      await this._redistributeGroupAmount (entry, (entry .debit - entry .credit) || 0);
      var group = this._getGroup (entry);
      if (group .length == 2)
        await this._model .update (group [0]._id, {group: null});
    }
  }

  async _processAddUpdate (entry, fieldName, value) {
    if (['debit', 'credit'] .includes (fieldName)) {
      if (entry .group && entry [fieldName] != value)
        await this._redistributeGroupAmount (entry, ((entry .debit || 0) - (entry .credit || 0)) - value * (fieldName == 'credit'? -1: 1));
    }
    if (['date', 'payee', 'account'] .includes (fieldName)) {
      if (entry .group && entry .group == entry ._id) {
        var updateList = this._getGroup (entry)
        .map    (t => {var o = {id: t._id, update: {}}; o .update [fieldName] = value; return o})
        await this._model .updateList (updateList);
      }
    }
  }

  _getTupleOptions (doc, group) {
    return {
      isGroup:  doc .group,
      isLeader: doc .group && doc .group == doc._id,
      isLast:   group .reduce ((m,t) => {return Math .max (m, t .sort)}, 0) == doc .sort
    }
  }

  _updateAddTuple (doc) {
    let group = this._getGroup (doc);
    for (let d of group .concat (group .find (g => {return g._id == doc._id})? []: doc))
      this._view .updateTuple (d._id, this._getTupleOptions (d, group));
  }

  _getGroup (entry) {
    return entry .group? this._model .refine (e => {return e .group == entry .group}) .sort ((a,b) => {return a .sort < b .sort? -1: 1}): [];
  }

  async _redistributeGroupAmount (entry, delta) {
    var siblings   = this._getGroup (entry) .filter (t => {return t._id != entry ._id});
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

  async _onViewChange (eventType, arg) {
    if ([ImportRulesViewEvent .INSERT_KEY, ImportRulesViewEvent .REMOVE_KEY] .includes (eventType)) {
      var entry = this._model .get ((arg .pos && arg .pos .id) || arg);
      if ([ImportRulesModelType .PREDICATE, ImportRulesModelType .UPDATE] .includes (entry .type))
        return;
      else
        if (eventType == ImportRulesViewEvent .INSERT_KEY) {
          eventType = ImportRulesViewEvent .INSERT;
          if (entry .type == ImportRulesModelType .ADD)
            await this._processAddInsert (entry, arg .insert, arg .pos);
        } else {
          eventType = ImportRulesViewEvent .REMOVE;
          if (entry .type == ImportRulesModelType .ADD)
            await this._processAddRemove (arg);
        }
    }
    if (eventType == TupleViewEvent .UPDATE) {
      var entry = this._model .get (arg .id);
      if (entry .type == ImportRulesModelType .ADD)
        await this._processAddUpdate (entry, arg .fieldName, arg .value);
      if (['debit', 'credit'] .includes (arg .fieldName)) {
        if (isNaN (arg.value) || arg.value > 0)
          this .updateField (arg.id, arg.fieldName == 'debit'? 'credit': 'debit', 0);
        else if (arg.value < 0) {
          this .updateField (arg.id, 'debit',  arg.fieldName == 'credit'? -arg.value: 0);
          this .updateField (arg.id, 'credit', arg.fieldName == 'debit'?  -arg.value: 0);
          eventType = TupleViewEvent .CANCELLED;
        }
      }
    }
    if (eventType == ImportRulesViewEvent .REMOVE) {
      let entry = this._model .get ((arg .pos && arg .pos .id) || arg .id || arg);
      if (entry && entry .type == ImportRulesModelType .SPLIT && this._isSplitRemainingEntry (entry)) {
        let hasOtherSplits = (entry .parent .children || []) .find (c => {
          return c .type == ImportRulesModelType .SPLIT && (eventType != ImportRulesViewEvent .REMOVE || c._id != arg)
        });
        if (hasOtherSplits) {
          this._view .flagTupleError (arg);
          eventType = TupleViewEvent .CANCELLED;
        }
      }
    }
    super._onViewChange (eventType, arg);
    switch (eventType) {
      case ImportRulesViewEvent .CREATE_UPDATE:
        this._createUpdate (arg);
        break;
      case ImportRulesViewEvent .CREATE_SPLIT:
        this._createSplit (arg);
        break;
      case ImportRulesViewEvent .CREATE_ADD:
        this._insert ({type: ImportRulesModelType .ADD, predicate: arg});
        break;
      case ImportRulesViewEvent .DELETED:
        this._onClose();
        break;
      case ImportRulesViewEvent .APPLY:
        this._model .applyRule (this._model .get (arg), this._tran);
        this .close();
        break;
      case ImportRulesViewEvent .APPLY_UNCATEGORIZED:
        this._showApply (arg)
        break;
      case ImportRulesViewEvent .NEW:
        this._createRule()
        break;
      case ImportRulesViewEvent .CLONE:
        this._cloneRule (arg)
       break;
    }
  }

  async _showApply (id) {
    var handleSelect = async ids => {
      var async = []
      for (let tran of trans .filter (t => {return ids .includes (t._id)}))
        async .push (this._model .applyRule (rule, tran));
      for (let a of async)
        await a;
      this .close();
    }
    const rule  = this._model .get (id);
    const trans = this._model .getTransactionModel()
      .refine (t => t .category == null || t .category == '')
      .sort ((a,b) => {return a.date < b.date? -1: a.date == b.date? (a._seq < b.seq? -1: 1): 1});
    this._view .showApplyPopup (id, new ApplyToTable (this._model .getMatchingTransactions (rule, trans), this, (ids) => {
      (async () => {await handleSelect (ids)}) ();
    }));
  }

  updateTran (tran) {
    this._tran = tran;
  }

  close() {
    this._onClose();
  }

  _addRule (rule) {
    this._rules .add (rule._id);
    this._view .addRule (rule._id);
    this._addTuple (rule);
    for (let a of rule .children || [])
      this._addTuple (a);
    this._view .setPredicateIsMatch (rule._id, this._model .isMatch (rule, this._tran));
  }

  _isSplitRemainingEntry (data) {
    return [data .debit, data .credit] .includes ('Remaining');
  }

  _addTuple (data) {
    var before;
    if ([ImportRulesModelType .SPLIT, ImportRulesModelType .ADD] .includes (data .type))
      before = (this._model .get (data .predicate) .children || [])
        .filter (c => {return c .type == data .type && c .sort > data .sort}) [0];
    switch (data .type) {
      case ImportRulesModelType .PREDICATE:
        this._view .addPredicate (data);
        break;
      case ImportRulesModelType .UPDATE:
        this._view .addUpdate (data);
        break;
      case ImportRulesModelType .SPLIT:
        this._view .addSplit (data, before && before._id, this._isSplitRemainingEntry (data));
        break;
      case ImportRulesModelType .ADD:
        this._view .addAdd (data, before && before._id, this._getTupleOptions (data, this._getGroup (data)));
        break;
    }

  }

  async _createRule() {
    var insert = {
      type:            ImportRulesModelType .PREDICATE,
      date_op0:        Types .date ._day (this._tran .date),
      date_op1:        Types .date ._day (this._tran .date),
      payee_fn:        'eq',
      payee_op0:       this._tran .payee,
      debit_op0:       this._tran .debit,
      debit_op1:       this._tran .debit,
      credit_op0:      this._tran .credit,
      credit_op1:      this._tran .credit,
      description_op0: this._tran .description
    }
    await this._insert (insert)
    this._rules .add (insert._id);
    await this._createUpdate (insert._id);
  }

  async _createUpdate (id) {
    await this._insert ({
      type:           ImportRulesModelType .UPDATE,
      predicate:      id,
      categoryUpdate: 1,
      descriptionUpdate: this._tran .description != '',
      payee:          this._tran .payee,
      debit:          this._tran .debit,
      credit:         this._tran .credit,
      account:        this._tran .account,
      category:       this._tran .category,
      description:    this._tran .description
    })
  }

  async _cloneRule (id) {
    var insertList = []
    var clone = rule => {
      return Object .keys (rule) .reduce ((o,f) => {
        if (! ['_id', 'predicate', 'parent', 'children'] .includes (f))
          o [f] = rule [f];
        return o;
      }, {});
    }
    var rule   = this._model .get (id);
    var insert = clone (rule);
    await this._insert (insert);
    this._rules .add (insert._id);
    var children = [];
    for (let child of rule .children || []) {
      child            = clone (child);
      child .predicate = insert._id;
      children .push (child);
    }
    await this._model .insertList (children);
  }

  async _createSplit (id) {
    var insertList = [
      {
        type:        ImportRulesModelType .SPLIT,
        predicate:   id,
        sort:        0,
        debit:       this._tran .debit,
        credit:      this._tran .credit,
        category:    this._tran .category,
        description: this._tran .description
      },
      {
        type:        ImportRulesModelType .SPLIT,
        predicate:   id,
        sort:        1,
        debit:      'Remaining',
        credit:     'Remaining'
      }
    ]
    await this._model .insertList (insertList);
  }

  async _addHtml (tran, toHtml) {
    this._view .addHtml  (toHtml);
    var rules = this._model .getMatchingRules (tran)
    for (let rule of rules)
      this._addRule (rule);
    if (rules .length == 0)
      await this._createRule();
    this._view .show();
  }

  delete (onDelete) {
    this._view .remove (onDelete);
  }

  addHtml (tran, toHtml) {
    (async () => {this._addHtml (tran, toHtml)})();
  }

  async _insert (insert, pos) {
    var ref = pos && pos .id && this._model .get (pos .id);
    if (ref) {
      ref .sort         = ref .sort || 0;
      insert .type      = ref .type;
      insert .predicate = ref .predicate;
      insert .sort      = ref .predicate? (pos .before? ref .sort: ref .sort + 1): 0;
      if (ref .predicate) {
        var rule   = this._model .get (ref .predicate);
        var update = (rule .children || []) .filter (c => {return c .type == insert .type && c .sort >= insert .sort})
        if (update .length)
          await this._model .updateList (update .map (u => {return {id: u._id, update: {sort: (u .sort || 0) + 1}}}))
      }
    } 
    await super._insert (insert, pos);
  }
}


class ApplyToTable extends TransactionTable {

  constructor (trans, parent, onSelect) {
    var name    = '_ApplyToTable';
    var options = {readOnlyFields: ['date','payee','debit','credit','account','category','description']};
    var columns = ['apply', 'date','payee','debit','credit','account','category','description'];
    super (name, '', '', options, columns, parent ._accounts, parent ._variance,
      new ApplyToTableView (name, columns, options, parent ._accounts, parent ._variance));
    this._trans = trans .map (t => {t .apply = 1; return t});
    this._onSelect = onSelect;
  }

  _onViewChange (eventType, arg) {
    if (eventType == ApplyToTableViewEvent .APPLY) {
      this._onSelect (arg);
      this._view .delete();
      this._onClose();
      this. delete();
    } else if (eventType != TupleViewEvent .UPDATE || arg .fieldName != 'apply')
      super ._onViewChange (eventType, arg);
  }

  async _getModelData() {
    return this._trans;
  }

  async addHtml (toHtml, onClose) {
    this._onClose = onClose;
    this._view .addHtml (toHtml);
    await super .addHtml (toHtml);
  }

  async refreshHtml() {
    await super .refreshHtml();
  }
}

