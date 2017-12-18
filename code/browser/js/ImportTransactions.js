var ImportTransactions_MANUAL_IMPORT_TIME_RESOLUTION = 60 * 60 * 1000;
var ImportTransactionsInstance;

class ImportTransactions extends Observable {

  constructor (accounts, variance) {
    super();
    this._view = new ImportTransactionsView (undefined, undefined, variance);
    this._view .addObserver (this, this._onViewChange);
    this._accounts             = accounts;
    this._transactionModel     = new TransactionModel()
    this._importRulesModel     = new ImportRulesModel();
    this._variance             = variance;
    ImportTransactionsInstance = this;
  }

  delete() {
    this._importRulesModel .delete();
    this._transactionModel .delete();
    this._view .remove();
    if (this._lastImport)
      this._lastImport .delete();
    if (this._attention)
      this._attention .delete();
  }

  _onViewChange (EventType, arg) {
    switch (EventType) {
      case ImportTransactionsViewEvent .DROPPED:
        this._processDroppedFile (arg);
        break;
    }
  }

  async addHtml (toHtml) {
    await this._view .addHtml (toHtml);
    this._view .addText ('_import_status', 'Drag banking files here to import them ...');
    await this .getModelData();
    this._lastImport = new ImportBatchTable (this);
    this._attention  = new NeedsAttentionTable (this);
    if (!this._view || ! this._view .addTable) {console.log('DEBUG', this, this._view)}
    await this._view .addTable (this._attention);
    if (!this._view || ! this._view .addTable) {console.log('DEBUG', this, this._view)}
    await this._view .addTable (this._lastImport);
  }

  async getModelData() {
    if (! this._importRulesModel .entriesHaveBeenFound())
      await this._importRulesModel .find();
  }

  async _importFile (file) {
    var csv = await new Promise ((resolve, reject) => {
      Papa .parse (file, {
        complete: (results) => {resolve (results)},
        error:    (error)   => {reject  (error)}
      })
    })
    var it = this._accounts .parseTransactions (csv .data);
    var st = it .reduce ((m,t) => {return Math .min (m, t .date)}, it [0] .date);
    var en = it .reduce ((m,t) => {return Math .max (m, t .date)}, 0);
    var ct = await this._transactionModel .find ({date: {$gte: st, $lte: en}});
    for (let i of it)
      i .duplicate = ct .filter (c => {
        return c .imported && Object .keys (c .imported) .reduce ((m,f) => {
          return m && i [f] == c .imported [f]
        }, true)
      }) .map (c => {return c._id})
    var dm = it .reduce ((set,i) => {return i .duplicate .reduce ((s,id) => {return s .add (id)}, set)}, new Set());
    for (let i of it)
      i .duplicate = i .duplicate .find (d => {
        var found = dm .has (d);
        dm .delete (d);
        return found;
      });
    var dc = it .filter (t => {return t .duplicate}) .length;
    var ic = it .length - dc;
    this._currentImportTime = (new Date()) .getTime();
    var trans = await this._transactionModel .insertList (it .filter (t => {return ! t .duplicate}) .map (t => {
      delete t .duplicate;
      t .imported   = Object .keys (t) .reduce ((o,f) => {o [f] = t [f]; return o}, {});
      t .importTime = this._currentImportTime;
      t ._seq       = null;
      return t;
    }));
    var async = [];
    for (let t of trans) {
      var rules = this._importRulesModel .getMatchingRules (t);
      if (rules .length)
       async .push (this._importRulesModel .applyRule (rules [0], t));
    }
    for (let a of async)
      await a;
    var is = ic? ic + ' transaction' + (ic>1? 's': '') + ' imported': '';
    var ds = dc? dc + ' duplicate'   + (dc>1? 's': '') + ' skipped' : '';
    var s  = is + (is .length && ds .length? '; ': '') + ds;
    this._view .updateText ('_import_status', 'Last Import: ' + (s .length? s: 'empty file'));
    if (trans .length)
      await this._lastImport .refreshToLatest();
    await this._attention .refreshHtml();
  }

  async _processDroppedFile (file) {
    this._importFile (file);
  }
}



/**
 * TransactionAndRulesTable
 */

class TransactionAndRulesTable extends TransactionTable {
  constructor (
    query,
    title,
    parent      = ImportTransactionsInstance,
    name        = '_ImportTransactionsTable',
    columns     = ['rules', 'date','payee','debit','credit','account','category','description'],
    view,
    options     = {}
  )
  {
    name = '_TransactionAndRulesTable ' + name;
    let sort = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};
    if (! view)
      view = new ImportedTransactionTableView (name, columns, options, parent ._accounts, parent ._variance, e => {this._toggleRule (e)});
    super (name, query, sort, options, columns, parent ._accounts, parent ._variance, view);
    this._title            = title;
    this._hasTitle         = title != null;
    this._importRulesModel = parent ._importRulesModel;
    this._openRule;
    this._importRulesModelObserver = this._importRulesModel .addObserver (this, this._onRulesModelChange);
    this._accounts = parent._accounts;
    this._variance = parent._variance;
    this._parent   = parent;
  }

  delete() {
    this._importRulesModel .deleteObserver (this._importRulesModelObserver);
    super .delete();
  }

  _onRulesModelChange (event, doc, arg, source) {
    this .updateRules();
  }

  _updateModelData (doc) {
    doc .rules = this._importRulesModel .getMatchingRules (doc) .length > 0;
  }

  updateRules() {
    for (let tran of this._view .getTuples()) {
      this._updateModelData (tran);
      this._view .updateField (tran._id, 'rules', tran .rules);
    }
  }

  _onViewChange (eventType, arg) {
    if (eventType == TupleViewEvent .INSERT && ! arg .insert .importTime) {
      if (arg .pos && arg .pos .inside)
        arg .insert .importTime = this._parent._transactionModel .refine (t => {return t._id == arg .pos .id}) [0] .importTime;
      else {
        var now = (new Date()) .getTime();
        if (! this._parent._currentImportTime || (now - this._parent._currentImportTime) > ImportTransactions_MANUAL_IMPORT_TIME_RESOLUTION) {
          this._parent._currentImportTime = now;
        }
        arg .insert .importTime = this._parent._currentImportTime;
      }
    }
    super._onViewChange (eventType, arg);
  }

  _onModelChange (eventType, doc, arg, source) {
    if (eventType == ModelEvent .INSERT) {
      this._updateModelData (doc);
      if (! doc .imported && this._parent._lastImport)
        this._parent._lastImport .newBatch (doc .importTime)
    }
    if (this._openRule && this._openRule .id == doc._id) {
      if (eventType == ModelEvent .UPDATE)
        this._openRule .rule .updateTran (doc);
      else if (eventType == ModelEvent .REMOVE) {
        this._openRule .rule .close();
        this._openRule = null;
      }
    }
    super._onModelChange (eventType, doc, arg, source);
  }

  async _getModelData() {
    await this._parent .getModelData();
    return (await super._getModelData()) .map (t => {
      this._updateModelData (t);
      return t;
    });
  }

  _setTitle() {
    if (this._hasTitle)
      this._view .updateText ('_title', this._title);
  }

  _toggleRule (id) {
    let close = (cid, onClose) => {
      let finish = () => {
        this._view .removeRuleBox (rulebox, field);
        this._view .updateField   (cid, 'rules', this._importRulesModel .getMatchingRules (tran) .length > 0)
      }
      let tran = this._model .refine (t => {return t._id == cid}) [0];
      let [rulebox, field] = this._view .getRuleBox (cid);
      this._openRule .rule .delete (finish);
      this._openRule = null;
      if (onClose)
        onClose();
    }
    let open = () => {
      let tran = this._model .refine (t => {return t._id == id}) [0];
      this._view .updateField (tran._id, 'rules', true);
      let rulebox = this._view .addRuleBox (tran._id);
      this._openRule = {id: tran._id, rule: new ImportRules (this._importRulesModel, tran, this._accounts, this._variance, () => {close (id)})};
      this._openRule .rule .addHtml (tran, rulebox);
    }
    if (this._openRule && this._openRule .id == id)
      close (id);
    else if (this._openRule) {
      let [rulebox, field] = this._view .getRuleBox (this._openRule .id);
      close (this._openRule .id, open);
    } else
      open();
  }

  async addHtml (toHtml) {
    this._view .addHtml (toHtml);
    if (this._hasTitle)
      this._view .addText ('_title', this._title);
    await super .addHtml (toHtml);
  }

  async refreshHtml() {
    await super .refreshHtml();
  }
}


/**
 * ImportBatchTable
 */

class ImportBatchTable extends TransactionAndRulesTable {

  constructor (parent) {
    super ({$options: {updateDoesNotRemove: true}}, '', parent);
    this._transactionModel = parent._transactionModel;;
  }

  _onViewChange (eventType, arg) {
    if (eventType == TupleViewEvent .INSERT && ! arg .insert .importTime && this._batch)
      arg .insert .importTime = this._batch;
    super._onViewChange (eventType, arg);
  }

  _setTitle() {
    this._title = this._batch? 'Transactions Added on ' + Types .timeLongHM .toString (this._batch): 'Transactions Appear Here After They are Imported ...';
    super._setTitle();
  }

  _setBatch (older) {
    var trans = this._transactionModel .refine (t => {return t .importTime});
    if (this._batch) {
      var batch = trans .reduce ((b,t) => {
        var candidate = (older && t .importTime < this._batch) || (! older && t .importTime > this._batch);
        return (candidate && (!b || (older && t .importTime > b) || (! older && t .importTime < b)))? t .importTime: b;
      }, false)
    } else
      var batch = trans .reduce ((b,t) => {return Math .max (b, t .importTime)}, 0);
    this._batch             = batch;
    this._query .importTime = this._batch;
    this._hasOlder          = false;
    this._hasNewer          = false;
    for (let t of trans) {
      if (t .importTime < this._batch)
        this._hasOlder = true;
      if (t .importTime > this._batch)
        this._hasNewer = true;
      if (this._hasOlder && this._hasNewer)
        break;
    }
  }

  newBatch (batch) {
    if (! this._hasNewer && (! this._batch || batch > this._batch)) {
      this._hasNewer = true;
      this._updateButtons();
    }
  }

  _updateButtons() {
    this._view .updateButton ('_older_button', this._hasOlder);
    this._view .updateButton ('_newer_button', this._hasNewer);
  }

  async addHtml (toHtml) {
    this._query .date = {$gte: Types .date .addMonthStart (Types .date .today(), -3), $lte: this._variance .getBudget() .getEndDate()};
    await this._transactionModel .find ({date: this._query .date});
    this._setBatch();
    this._view .addHtml (toHtml);
    this._view .addButton ('_older_button', 'lnr-chevron-left', this._hasOlder, () => {this._setBatch (true);  (async () => {await this .refresh()}) ()});
    this._view .addButton ('_newer_button', 'lnr-chevron-right', this._hasNewer, () => {this._setBatch (false); (async () => {await this .refresh()}) ()});
    await super .addHtml (toHtml);
    this._setTitle();
  }

  async refreshToLatest() {
    this._batch = undefined;
    this._setBatch();
    await this .refresh();
  }

  async refresh() {
    this._setTitle();
    this._updateButtons();
    await this .refreshHtml();
  }
}


/**
 * NeedsAttentionTable
 */

class NeedsAttentionTable extends TransactionAndRulesTable {
  constructor (parent) {
    var nameSuffix = '_needsAttention';
    var name    = '_ImportTransactionsTable _TransactionAndRulesTable' + (nameSuffix? ' ' + nameSuffix: '');
    var query = {$or: [{category: null}, {category: ''}, {description: {$regex: '[?]\s*$'}}], $options: {updateDoesNotRemove: true}};
    var title = 'Transactions that Require Attention';
    var columns = ['rules', 'date','payee','debit','credit','account','category','description','importTime'];
    var options = {};
    var view  = new NeedsAttentionTableView (name, columns, options, parent ._accounts, parent ._variance, e => {this._toggleRule (e)});
    super (query, title, parent, nameSuffix, columns, view);
  }

  _addButtonPressed() {
    this._view._setFocus();
    this._onViewChange (TupleViewEvent .INSERT, {insert: {}});
  }

  async addHtml (toHtml) {
    this._view .addHtml   (toHtml);
    this._view .addButton ('_insert_buttom',  'lnr-plus-circle', true, () => {this._addButtonPressed()});
    this._view .addButton ('_refresh_button', 'lnr-sync',  true, () => {(async () => {await this .refreshHtml()}) ()});
    await super .addHtml (toHtml);
    this._setTitle();
  }
}
