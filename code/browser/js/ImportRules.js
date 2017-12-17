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
      if (entry .type == ImportRulesModelType .SPLIT) {
        for (let s of this._model .get (entry .predicate || entry._id) .children || [])
          if (s .type == ImportRulesModelType .SPLIT)
            for (let a of ['debit', 'credit'])
              if (!arg || arg [a]) {
                var f = this._view._getField (s._id, a);
                if (f && f .hasError())
                  f .update();
              }
      }
    }
  }

  async _onViewChange (eventType, arg) {
    if ([ImportRulesViewEvent .INSERT_KEY, ImportRulesViewEvent .REMOVE_KEY] .includes (eventType)) {
      var entry = this._model .get ((arg .pos && arg .pos .id) || arg);
      if ([ImportRulesModelType .PREDICATE, ImportRulesModelType .UPDATE] .includes (entry .type))
        return;
      else
        if (eventType == ImportRulesViewEvent .INSERT_KEY)
          eventType = ImportRulesViewEvent .INSERT
        else
          eventType = ImportRulesViewEvent .REMOVE
    }
    if (eventType == TupleViewEvent .UPDATE) {
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
    var mayNeedToValidate = eventType == ImportRulesViewEvent .REMOVE ||
      (eventType == ImportRulesViewEvent .UPDATE && ['debit', 'credit'] .includes (arg .fieldName))
    if (mayNeedToValidate) {
      var entry  = this._model .get ((arg .pos && arg .pos .id) || arg .id || arg);
      if (entry && entry .type == ImportRulesModelType .SPLIT) {
        var splits = (entry .parent .children || []) .filter (c => {
          return c .type == ImportRulesModelType .SPLIT && (eventType != ImportRulesViewEvent .REMOVE || c._id != arg)
        })
        var amounts = splits .map (s => {
          return ['debit', 'credit'] .reduce ((r,a) => {
            var f = this._view._getField (s._id, a);
            var v = eventType == ImportRulesViewEvent .UPDATE && s._id == arg .id? arg .value: f .hasError()? f .get(): s [a]
            return r? r: v;
          }, '')
        })
        var [isOkay, errMessage] = this._isSplitValid (amounts);
        if (!isOkay) {
          if (eventType == ImportRulesViewEvent .UPDATE)
            this._view .setFieldError (arg .id, arg .fieldName, errMessage);
          else
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
    var rule  = this._model .get (id);
    var trans = (await this._model .getTransactionModel() .find ({$or: [{category: null}, {category: ''}]}))
      .sort ((a,b) => {return a.date < b.date? -1: a.date == b.date? (a._seq < b.seq? -1: 1): 1});
    this._view .showApplyPopup (id, new ApplyToTable (this._model .getMatchingTransactions (rule, trans), this, (ids) => {
      (async () => {await handleSelect (ids)}) ();
    }));
  }

  _isSplitValid (amounts) {
    if (amounts .length == 0)
      return [true];
    var hasRemaining;
    var hasDuplicateRemaining
    var hasPercent;
    var hasFixed;
    var totalPercent = 0;
    for (let a of amounts)
      if (a == 'Remaining') {
        hasDuplicateRemaining = hasRemaining;
        hasRemaining          = true;
      } else if (typeof a == 'string' && a .endsWith ('%')) {
        hasPercent    = true;
        totalPercent += Number (a .slice (0, -1))
      } else
        hasFixed = true;
    if (hasDuplicateRemaining)
      return [false, 'Only one "Remaining" line allowed.']
    else if (!hasRemaining && hasFixed && hasPercent)
      return [false, 'Percent and fixed amount combined without a "Remaining" line.']
    else if (hasPercent && !hasRemaining && totalPercent != 100)
      return [false, 'Precentages do not total 100% and no "Remaining" line.']
    else if (!hasRemaining && !hasPercent)
      return [false, 'Use percentages or include one "Remaining" line.']
      return [true];
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
        this._view .addSplit (data, before && before._id);
        break;
      case ImportRulesModelType .ADD:
        this._view .addAdd (data, before && before._id);
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
        debit:       this._tran .debit?  'Remaining': '',
        credit:      this._tran .credit? 'Remaining': ''
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

