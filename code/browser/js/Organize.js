class Organize {
  constructor (accounts, variance) {
    this._accounts   = accounts;
    this._variance   = variance;
    this._budget     = this._variance .getBudget();
    this._categories = this._budget .getCategories();
    this._accModel   = new Model ('accounts');
    this._budModel   = new Model ('budgets');
    this._hisModel   = new Model ('history');
    this._balModel   = new Model ('balanceHistory');
    this._parModel   = new Model ('parameters');
    this._view       = new OrganizeView();
  }

  delete() {
    this._accModel .delete();
    this._budModel .delete();
    this._hisModel .delete();
    this._balModel .delete();
    this._parModel .delete();
  }

  *_addParameters() {
    var fields = [
      new ViewTextbox  ('apr',       ViewFormats ('percent2')),
      new ViewTextbox  ('inflation', ViewFormats ('percent2')),
      new ViewCheckbox ('presentValue')
    ]
    var columns = {
      apr:          'Default Rate',
      inflation:    'Inflation',
      presentValue: 'Show Present Value'
    }
    var headers = Object .keys (columns) .map (k => {return {name: k, header: columns [k]}});
    var columns = Object .keys (columns);
    var view  = new TableView ('_parameters', fields, headers, options);
    var query = {name: 'rates'}
    var sort  = undefined;
    var options = {noInsert: true, noRemove: true};
    var presenter = new Table (this._parModel, view, query, sort, options, columns);
    this._view .addHeading ('Parameters', 'Rates and Other Parameters');
    this._view .addText    ('When Projecting Future Account Balances');
    yield* presenter .addHtml (this._view .getHtml());
  }

  *_addAccounts() {
    var types = [
      ['Deposit',     AccountType .DEPOSIT],
      ['Credit Card', AccountType .CREDIT_CARD],
      ['Cash',        AccountType .CASH],
      ['Pension',     AccountType .PENSION],
      ['RRSP',        AccountType .RRSP],
      ['TFSA',        AccountType .TFSA],
      ['RESP',        AccountType .RESP],
      ['Investment',  AccountType .INVESTMENT],
      ['Mortgage',    AccountType .MORTGAGE],
      ['Home',        AccountType .HOME],
    ];
    var categories = [['', null]]
      .concat (this._categories .getDescendants (this._budget .getSavingsCategory())
        .map (c => {
          var pathname = this._categories .getPathname (c);
          if (pathname .length <= 3)
            return [this._categories .getPathname (c) .slice (1) .join (' > '), c._id]
          else
            return null
        })
        .filter (e => {return e})
      );
    var disCategories = [['', null]]
      .concat (this._categories .getDescendants (this._budget .getIncomeCategory())
        .map (c => {
          var pathname = this._categories .getPathname (c);
          if (pathname .length <= 3)
            return [this._categories .getPathname (c) .slice (1) .join (' > '), c._id]
          else
            return null
        })
        .filter (e => {return e})
      );
    var fields = [
      new ViewTextbox  ('name', ViewFormats    ('string')),
      new ViewTextbox  ('number', ViewFormats  ('string')),
      new ViewSelect   ('type', new ViewFormatOptionList (types)),
      new ViewSelect   ('category', new ViewFormatOptionList (categories)),
      new ViewSelect   ('disCategory', new ViewFormatOptionList (disCategories)),
      new ViewTextbox  ('balance', ViewFormats ('moneyDCZ')),
      new ViewCheckbox ('creditBalance'),
      new ViewCheckbox ('trackBalance'),
      new ViewTextbox  ('apr', ViewFormats ('percent2'))
    ];
    var columns = {
      name:          'Name',
      number:        'Account Number',
      trackBalance:  'Imports',
      type:          'Type',
      category:      'Contributions',
      disCategory:   'Distributions',
      balance:       'Balance',
      creditBalance: 'Credit Balance',
      apr:           'Rate'
    }
    var headers = Object .keys (columns) .map (k => {return {name: k, header: columns [k]}});
    var columns = Object .keys (columns);
    var options;
    var view    = new TableView ('_accounts', fields, headers, options);
    var query;
    var sort = undefined;
    var accounts = new Table (this._accModel, view, query, sort, options, columns);
    this._view .addHeading ('Accounts', 'Accounts and Balances');
    yield* accounts .addHtml (this._view .getHtml());
  }

  *_addHistory() {
    var catFormat = new ViewFormatOptions (
      value => {var cat = this._categories .get (value); return cat? cat.name: value},
      view  => {return view},
      value => {return this._categories .getPathname (this._categories .get (value)) .join (' > ')},
      ()    => {return this._categories .getRoots() .map (c => {return c .name})}
    );
    var roots = [this._budget .getIncomeCategory(), this._budget .getSavingsCategory(), this._budget .getExpenseCategory()];
    var rows  = roots
      .reduce ((l,r) => {
        return l .concat (r .children || []) .concat (r .zombies || [])
      }, [])
      .map (c => {
        return {_id: c._id, name: c .name, sort: c .sort}
      });
    var cols = (yield* this._budModel .find ({hasTransactions: {$ne: true}})) .map (b => {
      return {_id: b._id, name: b .name, start: b .start}
    });
    if (cols .length) {
      var query = {$and: [{budget: {$in: cols .map (c => {return c._id})}}, {category: {$in: rows .map (r => {return r._id})}}]};
      var his   = yield* this._hisModel .find (query);
      var ins   = [];
      for (let cat of rows .map (r => {return r._id}))
        for (let bud of cols .map (c => {return c._id}))
          if (! his .find (h => {return h .category == cat && h .budget == bud}))
            ins .push (this._hisModel .insert({
              category: cat,
              budget:   bud,
              amount:   0
            }));
      for (let i of ins)
        yield* i;
      if (ins .length)
        his = yield* this._hisModel .find (query);
      his = his .sort ((a,b) => {
        var aCatSort = rows .find (r => {return r._id == a .category}) .sort;
        var bCatSort = rows .find (r => {return r._id == b .category}) .sort;
        var aBudSort = cols .find (c => {return c._id == a .budget})   .start;
        var bBudSort = cols .find (c => {return c._id == b .budget})   .start;
        return aCatSort < bCatSort? -1: aCatSort > bCatSort? 1: aBudSort < bBudSort? -1: aBudSort > bBudSort? 1: 0;
      })
      var sort = 0;
      yield* this._hisModel .updateList (his .map (h => {return {id: h._id, update: {sort: sort++}}}));
      var fields  = [new ViewLabel ('category', catFormat)];
      var headers = [];
      var columns = [];
      for (let c of cols) {
        var name = 'amount_' + c .name .replace ('/','');
        fields  .push (new ViewTextbox (name, ViewFormats ('moneyDCZ')));
        headers .unshift ({name: name, header: c .name});
        columns .unshift (name);
      }
      headers .unshift ({name: 'category', header: 'Category'});
      columns .unshift ('category');
      var options = {noInsert: true, noRemove: true};
      var view = new TableView ('_history', fields, headers, options);
      var sort = undefined;
      var history = new _FoldUpTable (this._hisModel, view, query, sort, options, columns, 'category', 'amount');
      this._view .addHeading ('Transactions',  'Historical Transaction Amounts');
      yield* history .addHtml (this._view .getHtml());
    }
  }

  *_addBalanceHistory() {
    var accFormat = new ViewFormatOptions (
      value => {return (accounts .find (a => {return a._id  == value}) || {}) .name},
      view  => {return (accounts .find (a => {return a.name == view})  || {}) ._id},
      value => {},
      ()    => {return accounts .map  (a => {return a.name})}
    );
    var accounts = this._accounts .getAccounts();
    var budgets = (yield* this._budModel .find ({end: {$lt: this._budget .getStartDate()}}))
      .map  (b     => {return {_id: b._id, name: b .name, start: b .start}})
      .sort ((a,b) => {return a .name > b .name? -1: a .name == b .name? 0: 1})

    if (budgets .length) {
      var query = {account: {$in: accounts .map(a => {return a._id})}, budget: {$in: budgets .map (b => {return b._id})}};
      var his   = yield* this._balModel .find(query);
      var ins   = [];
      for (let a of accounts)
        for (let b of budgets)
          if (! his .find (h => {return h .account == a._id && h .budget == b._id}))
            ins .push (this._balModel .insert ({account: a._id, budget: b._id, amount: 0}))
      for (let i of ins)
        yield* i;
      if (ins .length)
        his = yield* this._balModel .find (query);
      his = his .sort ((x,y) => {
        var xAccSort = accounts .find (a => {return a._id == x .account});
        var yAccSort = accounts .find (a => {return a._id == y .account});
        xAccSort = xAccSort .sort || xAccSort .name;
        yAccSort = yAccSort .sort || yAccSort .name;
        var xBudSort = budgets  .find (b => {return b._id == x .budget})  .start;
        var yBudSort = budgets  .find (b => {return b._id == y .budget})  .start;
        return xAccSort < yAccSort? -1: xAccSort > yAccSort? 1: xBudSort < yBudSort? -1: xBudSort > yBudSort? 1: 0;
      })
      var sort = 0;
      if (! his .reduce ((x,h) => {return x? (x .sort <= h .sort? h: false): false}))
        yield* this._balModel .updateList (his .map (h => {return {id: h._id, update: {sort: sort++}}}));
      var fields  = [new ViewLabel ('account', accFormat)];
      var headers = [];
      var columns = [];
      for (let b of budgets) {
        var name = 'amount_' + b .name .replace ('/','');
        fields  .push (new ViewTextbox (name, ViewFormats ('moneyDCZ')));
        headers .unshift ({name: name, header: b .name});
        columns .unshift (name);
      }
      headers .unshift ({name: 'account', header: 'Account'});
      columns .unshift ('account');
      var options = {noInsert: true, noRemove: true};
      var view = new TableView ('_balances', fields, headers, options);
      var sort = undefined;
      var balances = new _FoldUpTable (this._balModel, view, query, sort, options, columns, 'account', 'amount');
      this._view .addHeading ('Balances', 'Historic Account Balances');
      yield* balances .addHtml (this._view .getHtml());
    }
  }

  *_addBudgets() {
    var catFormat = new ViewFormatOptions (
      value => {var cat = this._categories .get (value); return cat? cat.name: value},
      view  => {var cat = this._categories .findBestMatch (view); return cat? cat._id: view},
      value => {return this._categories .getPathname (this._categories .get (value)) .join (' > ')},
      ()    => {return this._categories .getRoots() .map (c => {return c .name})}
    );
    var fields = [
      new ViewTextbox              ('name',             ViewFormats ('string')),
      new ViewTextbox              ('start',            ViewFormats ('dateDMY')),
      new ViewTextbox              ('end',              ViewFormats ('dateDMY')),
      new ViewCheckbox             ('hasTransactions'),
      new ViewSelect               ('incomeCategory',   catFormat),
      new ViewSelect               ('savingsCategory',  catFormat),
      new ViewSelect               ('expenseCategory',  catFormat),
      new ViewSelect               ('suspenseCategory', catFormat),
      new ViewTextbox              ('startCashBalance', ViewFormats ('moneyDCZ'))
    ];
    var columns = {
      name:             'Name',
      start:            'Start',
      end:              'End',
      hasTransactions:  'Has Transactions',
      incomeCategory:   'Income',
      savingsCategory:  'Savings',
      expenseCategory:  'Expense',
      suspenseCategory: 'Suspense',
      startCashBalance: 'Starting Cash'
    };
    var headers = Object .keys (columns) .map (k => {return {name: k, header: columns [k]}});
    var columns = Object .keys (columns);
    var options;
    var view    = new TableView ('_budgets', fields, headers, options);
    var query;
    var sort = (a,b) => {return a.name < b.name? -1: a .name == b .name? 0: 1};
    var budgets = new Table (this._budModel, view, query, sort, options, columns);
    this._view .addHeading ('Budgets', 'Budgets');
    yield* budgets .addHtml (this._view .getHtml());
  }
  
  *addHtml (toHtml) {
    this._view .addHtml    (toHtml);
    yield* this._addAccounts();
    yield* this._addParameters();
    yield* this._addHistory();
    yield* this._addBalanceHistory();
    yield* this._addBudgets();
  }
}

class _FoldUpTable extends Table {

  constructor (model, view, query, sort, options, columns, fold, val) {
    super (model, view, query, sort, options, columns);
    this._fold = fold;
    this._val  = val;
  }

  _onModelChange (eventType, doc, arg, source) {
    if (source == this._view) {
      var his                         = this._his .get (doc._id);
      doc._id                         = his [this._fold];
      arg [his .name]                 = arg [this._val];
      arg ['_origional_' + his .name] = arg ['_origional_' + this._val];
      super._onModelChange (eventType, doc, arg, source);
    }
  }

  *_getModelData() {
    this._ids = new Map();
    this._his = new Map();
    return (yield* super._getModelData())
      .sort   ((a,b) => {return a.sort<b.sort? -1: a.sort>b.sort? 1: 0})
      .reduce ((list, item) => {
        var col = {_id: item._id}
        col [this._val] = item [this._val];
        if (list .length && item [this._fold] == list [list .length - 1] [this._fold])
          list [list .length - 1] .cols .push (col);
        else {
          var li = {cols: [col]}
          li [this._fold] = item [this._fold];
          list .push (li)
        }
        return list;
      }, [])
      .map (row => {
        return row .cols .reduce ((r,c,i) => {
          var name = this._columns [i + 1];
          this._ids .set (row [this._fold] + name, c._id);
          var li = {name: name};
          li [this._fold] = row [this._fold];
          this._his .set (c._id, li);
          r [name] = c [this._val];
          return r;
        }, (() => {var li = {_id: row [this._fold]}; li [this._fold] = row [this._fold]; return li})())
      });
  }

  *_updateField (id, fieldName, value) {
    if (fieldName .startsWith (this._val + '_')) {
      id        = this._ids .get (id + fieldName);
      fieldName = this._val;
    }
    yield* super._updateField (id, fieldName, value);
  }
}
