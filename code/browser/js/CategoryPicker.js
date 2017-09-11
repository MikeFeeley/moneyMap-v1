class CategoryPicker {
  constructor (accounts, variance) {
    this._view              = new CategoryPickerView();
    this._variance          = variance;
    this._budget            = this._variance .getBudget();
    this._categories        = this._budget .getCategories();
    this._budgetProgressHUD = new BudgetProgressHUD (accounts, this._variance, {isNotModal: true});
    this._observer          = this._budget .addObserver (this, this._onModelChange);
  }

  delete() {
    this._budget .deleteObserver (this._observer);
    this._budgetProgressHUD .delete();
  }

  _onModelChange (eventType, doc, arg) {
    this._show (this._id);
  }

  _show (id) {
    this._view .reset();
    this._id = id;
    var cat  = this._categories .get (id);
    var path = [];
    if (cat)
      for (let c = cat; c; c = c.parent)
        path .unshift (c);
    this._cols = [];
    for (let c of path) {
      var col = []
      for (let sib of this._categories .getSiblingsAndSelf (c))
        col .push ({name: sib.name, id: sib._id, selected: sib==c});
      this._cols   .push (col);
    }
    this._selCol = Math .max (0, this._cols .length - 1);
    this._selRow = this._cols .length > 0? this._cols [this._selCol] .findIndex (r => {return r.selected}): -1;
    var children = cat? cat.children: this._categories.getRoots();
    if (children)
      this._cols .push (children .map (c => {return {name: c.name, id: c._id, selected: false}}));
    var remove = this._cols .length - 3;
    if (remove > 0) {
      this._selCol -= remove;
      this._cols    = this._cols .slice (remove);
    }
    for (let i=0; i < this._cols .reduce ((m,c) => {return Math.max (m, c.length)}, 0); i++) {
      let row = [];
      for (let col of this._cols)
        row .push (col [i] || {name: ''});
      this._view .addRow (row);
    }
    this._view .updateHeight();
  }

  _select (id) {
    if (id) {
      this._show                      (id);
      this._budgetProgressHUD .update (id);
      this._onSelect                  (id);
    }
  }

  contains (target) {
    return this._budgetProgressHUD .contains (target);
  }

  show (id, date, debit, credit, toHtml, onSelect) {
    if (id != this._id) {
      this._onSelect = onSelect;
      this._show (id);
      this._view .addHtml (toHtml, (id) => {this._select (id)});
      this._view .show();
      this._budgetProgressHUD .show (id, date, debit, credit, toHtml, {right: 130});
      this._view .updateHeight();
    }
  }

  filter (value) {
    if (value .length)
      var id = (this._categories .findBestMatch (value .split(':') .map (s => {return s.trim()})) || {}) ._id;
    this._show (id);
    if (this._filterTimeout) {
      window .clearTimeout (this._filterTimeout);
      this._filterTimeout = null;
    }
    this._filterTimeout = window .setTimeout (() => {
      this._budgetProgressHUD .update (id);
      this._filterTimeout = null;
    }, 200);
  }

  hide() {
    this._id = undefined;
    var selected = this._cols
      .map    (c => {return c.find (r => {return r.selected})})
      .filter (c => {return c});
    this._onSelect (selected.length && selected .slice (-1) [0] .id || '');
    this._view .hide();
    this._budgetProgressHUD .hide();
  }

  moveUp() {
    if (this._selRow > 0) {
      this._select (this._cols [this._selCol] [this._selRow-1] .id);
      this._oldSelRow = undefined;
    }
  }

  moveDown() {
    if (this._selRow+1 < this._cols [this._selCol] .length) {
      this._select (this._cols [this._selCol] [this._selRow+1] .id);
      this._oldSelRow = undefined;
    }
  }

  moveRight() {
    if (this._selCol+1 < this._cols.length) {
      this._select (this._cols [this._selCol+1] [(this._oldSelRow || []) .pop() || 0] .id);
    }
  }

  moveLeft() {
    if (this._selCol > 0) {
      (this._oldSelRow = this._oldSelRow || []) .push (this._selRow);
      this._select (this._cols [this._selCol-1] .find (r => {return r.selected}) .id);
    }
  }
}
