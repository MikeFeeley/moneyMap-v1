class CategoryPicker {
  constructor (accounts, variance) {
    this._view              = new CategoryPickerView();
    this._variance          = variance;
    this._budget            = this._variance .getBudget();
    this._categories        = this._budget .getCategories();
    this._budgetProgressHUD = new BudgetProgressHUD (accounts, this._variance, {isNotModal: true, topBuffer: 20}, this);
    this._observer          = this._budget .addObserver (this, this._onModelChange);
  }

  delete() {
    this._budget .deleteObserver (this._observer);
    this._budgetProgressHUD .delete();
  }

  _onModelChange (eventType, doc, arg) {
    this._show (this._id);
  }

  _show (id, inColumn) {

    const cat = this._categories .get (id);
    const roots = this._categories .getRoots() .reduce ((map, root) => map .set (root .name, [root]), new Map());
    const path = [{children: roots}] .concat (this._categories .getPath (cat) .map (pathCat => ({
      _id: pathCat._id,
      ids: [pathCat._id],
      name: pathCat .name,
      children: (pathCat .children || []) .concat (this._includeZombies? pathCat .zombies || []: [])
        .reduce ((map, child) => {
          (map .get (child .name) || map .set (child .name, []) .get (child .name)) .push (child);
          return map;
        }, new Map())
    })));
    if (this._includeZombies) {
      for (let i = 1; i < path .length; i++) {
        for (const homonym of path [i - 1] .children .get (path [i] .name) || [])
          if (homonym._id != path [i]._id)
            for (const hChild of (homonym .children || []) .concat (homonym .zombies || []))
              (path[i] .children .get (hChild .name) || path[i] .children .set (hChild .name, []) .get (hChild .name)) .push (hChild)
      }
    }
    this._cols = [];
    const leafSelected = [... path [path .length - 1] .children .keys()] .length == 0
    const first = Math .max (0, inColumn != undefined? path .length - 2 - inColumn: path .length - (leafSelected? 4: 3));
    const last  = path .length - (leafSelected? 2: 1);
    for (let i = first; i <= last; i++) {
      const entries = [... path [i] .children]
        .map  (([name, cats]) => [name, cats, cats .reduce ((m, c) => Math .max (m, c .sort || 0), 0)])
        .sort ((a,b) => a[2] < b[2]? -1: a[2] == b[2]? (a[0] < b[0]? -1: a[0] == b[0]? 0: 1): 1);
      this._cols .push (entries .map (([name, cats, _]) => ({
        name:     name,
        id:       (cats .find (c => c .budgets .includes (this._budget .getId())) || cats [0]) ._id,
        selected: i < path .length - 1 && name == path [i+1] .name,
        isLeaf:   ! cats .find (c => (c .children && c .children .length) || (this._includeZombies && c.zombies && c .zombies .length))
      })));
    }
    this._selCol = this._cols .findIndex (c => ! c .find (r => r .selected)) - 1;
    if (this._selCol == -2)
      this._selCol = this._cols .length - 1;
    else if (this._selCol == -1)
      this._selCol = 0;
    this._selRow = this._cols .length > 0? this._cols [this._selCol] .findIndex (r => r .selected): -1;
    this._view .reset();
    this._id = id;
    for (let i=0; i < this._cols .reduce ((m,c) => {return Math .max (m, c.length)}, 0); i++) {
      let row = [];
      for (let col of this._cols .slice (0, 3))
        row .push (col [i] || {name: ''});
      row [this._selCol] .isLast = true;
      this._view .addRow (row);
    }
    this._view .updateHeight();
  }

  _select (id, showInColumn) {
    if (id) {
      this._show                      (id, showInColumn);
      this._budgetProgressHUD .update (id);
      this._onSelect                  (id);
    }
  }

  pick (id) {
    this._show (id);
    this._onSelect (id);
  }

  contains (target) {
    return this._budgetProgressHUD .contains (target);
  }

  show (id, date, debit, credit, toHtml, onSelect, includeZombies) {
    if (id == null || id != this._id) {
      this._onSelect       = onSelect;
      this._includeZombies = includeZombies;
      this._show (id);
      this._view .addHtml (toHtml, (id) => {this._select (id)});
      this._view .show();
      this._budgetProgressHUD .show (id, date, debit, credit, toHtml, {right: 130});
      this._view .updateHeight();
    }
  }

  filter (value) {
    let id;
    if (value .length)
      id = (this._categories .findBestMatch (value .split(':') .map (s => {return s.trim()}), this._includeZombies) || {}) ._id;
    this._show (id);
    if (this._filterTimeout) {
      clearTimeout (this._filterTimeout);
      this._filterTimeout = null;
    }
    this._filterTimeout = setTimeout (() => {
      this._budgetProgressHUD .update (id);
      this._filterTimeout = null;
    }, 200);
  }

  hide() {
    this._id = undefined;
    var selected = this._cols
      .map    (c => {return c.find (r => {return r.selected})})
      .filter (c => {return c});
    this._onSelect ((selected.length && selected.slice (- 1) [0].id) || '');
    this._view .hide();
    this._budgetProgressHUD .hide();
    if (this._filterTimeout) {
      clearTimeout (this._filterTimeout);
      this._filterTimeout = null;
    }
  }

  moveUp() {
    if (this._selRow > 0) {
      this._select (this._cols [this._selCol] [this._selRow-1] .id, this._selCol);
      this._oldSelRow = undefined;
    }
  }

  moveDown() {
    if (this._selRow+1 < this._cols [this._selCol] .length) {
      this._select (this._cols [this._selCol] [this._selRow+1] .id, this._selCol);
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
