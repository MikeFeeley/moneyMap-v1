class Organize {
  constructor (accounts, variance) {
    this._accounts   = accounts;
    this._variance   = variance;
    this._budget     = this._variance .getBudget();
    this._categories = this._budget .getCategories();
    this._accModel   = new Model ('accounts');
    this._budModel   = new Model ('budgets');
    this._balModel   = new Model ('balanceHistory');
    this._parModel   = new Model ('parameters');
    this._view       = new OrganizeView();
  }

  delete() {
    this._accModel .delete();
    this._budModel .delete();
    this._balModel .delete();
    this._parModel .delete();
  }

  async _addParameters() {
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
    await presenter .addHtml (this._view .getHtml());
  }

  async _addAccounts() {
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
    await accounts .addHtml (this._view .getHtml());
  }

  async _addBalanceHistory() {
    let accFormat = new ViewFormatOptions (
      value => {return (accounts .find (a => {return a._id  == value}) || {}) .name},
      view  => {return (accounts .find (a => {return a.name == view})  || {}) ._id},
      value => {},
      ()    => {return accounts .map  (a => {return a.name})}
    );
    let accounts = this._accounts .getAccounts();
    let history  = (await this._balModel .find()) .sort ((a,b) => {
      return a .start < b .start? -1: a .start > b .start? 1: a .sort < b .sort? -1: a .sort > b .sort ? 1: 0});
    let cols = history
      .reduce ((c, h) => {
        if (c .length == 0 || c [c .length -1] .start != h .start)
          c .push (h);
        return c;
      }, [])
      .map (c => {
        return {
          label: BudgetModel .getLabelForDates (c .start, c .end),
          start: c .start,
          end:   c .end
        }
      })
    let fields = [new ViewLabel ('account', accFormat)];
    let headers = [];
    let columns = [];
    for (let c of cols) {
      let name = 'amount_' + c .label .replace ('/', '');
      fields  .push (new ViewTextbox (name, ViewFormats ('moneyDCZ')));
      headers .push ({name: name, header: c .label});
      columns .push (name);
    }
    headers .unshift ({name: 'account', header: 'Account'});
    columns .unshift ('account');
    let options = {noInsert: true, noRemove: true};
    let view    = new TableView ('_balances', fields, headers, options);
    let table   = new _FoldUpTable (this._balModel, view, undefined, undefined, options, columns, 'account', 'amount');
    this._view .addHeading ('Balances', 'Historic Account Balances');
    await table .addHtml (this._view .getHtml());
  }

  async addHtml (toHtml) {
    this._view .addHtml    (toHtml);
    await this._addAccounts();
    await this._addParameters();
    await this._addBalanceHistory();
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

  async _getModelData() {
    this._ids = new Map();
    this._his = new Map();
    return (await super._getModelData())
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

  async _updateField (id, fieldName, value) {
    if (fieldName .startsWith (this._val + '_')) {
      id        = this._ids .get (id + fieldName);
      fieldName = this._val;
    }
    await super._updateField (id, fieldName, value);
  }
}
