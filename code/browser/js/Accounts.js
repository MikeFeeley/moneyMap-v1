class Accounts extends Observable {

  constructor (accountsModel, budget) {
    super();
    this._accountsModel       = accountsModel;
    this._model               = accountsModel .getModel();
    this._modelObserver       = this._model .addObserver (this, this._onModelChange);
    this._budget              = budget;
    this._paramModel          = new Model ('parameters');
    this._paramObserver       = this._paramModel .addObserver (this, this._onParamModelChange);
    this._balanceHistoryModel = new Model ('balanceHistory');
    this._view                = new AccountsView();
    this._view .addObserver (this, this._onViewChange);
    this._dateType            = new DateType ('DMY', true);
    this._dateViewFormat      =  new ViewFormat (
      (value => {return this._dateType .toString   (value)}),
      (view  => {return this._dateType .fromString (view)})
    )
    this._models = [];
  }

  delete() {
    this._model .deleteObserver (this._modelObserver);
    this._paramModel .delete();
    this._balanceHistoryModel .delete();
    for (let model of this._models)
      model .delete();
  }

  createModel (name) {
    let model = new Model (name);
    this._models .push (model);
    return model;
  }

  async _onModelChange (eventType, acc, arg, source) {
    if (this._accountsModel .getAccounts()) {
      if (! this._view .isVisible())
        this._view .resetHtml();
      else {
        switch (eventType) {
          case ModelEvent .UPDATE:
            if (arg .sort)
              this._view .updateSort (acc._id, arg .sort)
            else {
              let fieldName = Array .from (Object .keys (arg)) [0];
              let account   = this._accountsModel .getAccount (acc._id);
              this._view .updateField (acc._id, fieldName, arg [fieldName]);
              account [fieldName] = arg [fieldName];
              let schModel = this._budget .getSchedulesModel();
              if (fieldName == 'name') {
                for (let cid of [account .category, account .disCategory, account .intCategory, account .incCategory])
                  if (cid)
                    await schModel .update (cid, {name: account .getCategoryName (cid)})
              }
            }
            if (acc .type == AccountType .ACCOUNT && acc .form == AccountForm .ASSET_LIABILITY && arg .creditBalance !== undefined) {
              this._removeAssetLiabilityPartOfAccount (acc);
              this._addAssetLiabilityPartOfAccount (acc);
            } else if (acc .form == AccountForm .INCOME_SOURCE && arg .taxType !== undefined) {
              this._removeIncomeTaxFields    (acc);
              await this._addIncomeTaxFields (acc);
            }
            break;
          case ModelEvent .INSERT:
            if (acc .type == AccountType .GROUP)
              this._addSubgroup (acc, source == this);
            else
              this._addAccount (acc, source == this);
            break;
          case ModelEvent .REMOVE:
            this._view .remove (acc._id, source == this);
            break;
        }
      }
    }
    if (eventType == ModelEvent .UPDATE && arg .balance && acc .form == AccountForm .ASSET_LIABILITY && this .creditBalance) {
      // asset balances are updated by user to current date
      await this._model .update (acc._id, {balanceDate: Types .date .today()});
    }
  }

  async _onParamModelChange (eventType, acc, arg, source) {
    if (eventType == ModelEvent .UPDATE && arg .apr !== undefined)
      this._view .resetHtml();
  }

  async _onViewChange (eventType, arg, skipNewUndoGroup) {
    switch (eventType) {

     case ViewEvent .UPDATE: {
        if (arg .fieldName == 'balance' && arg .value == null)
          arg .value = 0;
        if (['category', 'disCategory', 'intCategory', 'incCategory'] .includes (arg .fieldName)) {
          if (!skipNewUndoGroup)
            Model .newUndoGroup();
          let categories = this._budget   .getCategories();
          let schModel   = this._budget   .getSchedulesModel();
          let account    = this._accountsModel .getAccount (arg .id);
          if (arg .value) {
            // add category
            let name = account .name, update;
            if (account .isLiabilityAccount()) {
              if (arg .fieldName == 'category')
                name += ' Principal'
              else if (arg .fieldName == 'intCategory' && account .category)
                name += ' Interest'
            } else if (account .form == AccountForm .INCOME_SOURCE && arg .fieldName == 'intCategory' && arg .value)
              name += ' Taxes'
            let type = [['category', 'disCategory', 'intCategory', 'incCategory'] .indexOf (arg .fieldName)];
            let root = this ._budget ['get' + ['Savings', 'Withdrawals', 'Expense', 'Income'] [type] + 'Category'] ();
            let cat  = (root .children || []) .find (c => {return c .name == name});
            if (! cat)
              cat = categories .get ((await schModel .insert ({name: name}, {inside: true, id: root._id})) [0]);
            await this._model .update (account._id, {[arg .fieldName]: cat._id});
            account[arg.fieldName] = cat._id;
            await schModel .update (cat._id, {account: account._id});
          } else {
            // remove category
            let cat = categories .get (account [arg .fieldName]);
            if (cat) {
              let removeCat = false;
              if (categories .hasType (cat, ScheduleType .NOT_NONE, true)) {
                this._view .showFieldTip (arg .id, arg .fieldName, [
                  'This category has scheduled budget amounts.',
                  'It was not removed from your budget.'
                ]);
              } else if (await schModel .hasTransactions (cat)) {
                this._view .showFieldTip (arg .id, arg .fieldName, [
                  'Current-year transactions use this category.',
                  'It was not removed from your budget.'
                ]);
              } else
                removeCat = true;
              await this._model .update (account._id, {[arg .fieldName]: null});
              await schModel .update (cat._id, {account: null});
              if (removeCat)
                await schModel .remove (cat._id);
            }
          }
          if (account .isLiabilityAccount()) {
            if (arg .fieldName == 'intCategory' && ! arg .value && account .category) {
              this._view .updateField (account._id, 'category', false);
              await this._onViewChange (ViewEvent .UPDATE, {id: account._id, fieldName: 'category', value: false}, true)
            } else if (arg .fieldName == 'category' && arg .value && ! account .intCategory) {
              this._view .updateField (account._id, 'intCategory', true);
              await this._onViewChange (ViewEvent .UPDATE, {id: account._id, fieldName: 'intCategory', value: true}, true)
            }
          }
        } else
          await this._model .update (arg .id, {[arg .fieldName]: arg .value}, this);
        break;
      }

      case AccountsViewEvent .MOVE: {
        Model .newUndoGroup();
        let sort = 0, targetSort, updateList = [];
        let siblings = (await (
          arg .groupNum
            ? this._model .find ({form: GROUP_TO_FORM [arg .groupNum], type: AccountType .GROUP})
            : this._model .find ({group: arg .subgroupId})
        ))
          .sort ((a,b) => {return a .sort < b .sort? -1: a .sort == b .sort? 0: 1});
        for (let account of siblings) {
          if (arg .before == account._id) {
            targetSort = account .sort;
            sort       = account .sort;
          }
          if (account .sort <= sort) {
            updateList .push ({id: account._id, update: {sort: ++sort}})
          } else
            sort = account .sort;
        }
        let update = {sort: targetSort || ++sort};
        if (arg .subgroupId)
          update .group = arg .subgroupId;
        updateList .push ({id: arg .id, update: update});
        this._model .updateList (updateList, this);
        break;
      }

      case AccountsViewEvent .REMOVE: {
        Model .newUndoGroup();
        let target    = this._accountsModel .getAccount (arg .id);
        let isSibling = target .type == AccountType .GROUP
          ? a => {return a .type == AccountType .GROUP && a .form == target .form}
          : a => {return a .group == target .group}
        let siblings = Array .from (this._accountsModel .getAccounts() .values()) .filter (isSibling);
        if (target .type == AccountType .GROUP) {
          if (siblings .length == 1) {
            this._view .showFieldTip (arg .id, 'name', ['You can not delete the last group']);
            break;
          }
          if (Array .from (this._accountsModel .getAccounts() .values()) .find (a => {return a .group == arg .id})) {
            this._view .showFieldTip (arg .id, 'name', ['You can not delete a group that has accounts']);
            break;
          }
        }
        if (target .type == AccountType .ACCOUNT) {
          let schModel   = this._budget .getSchedulesModel();
          let categories = this._budget .getCategories();
          for (let cid of [target .category, target .disCategory, target .intCategory, target .incCategory]) {
            if (cid) {
              let cat = categories .get (cid);
              if (cat) {
                await schModel .update (cid, {account: null});
                if (! categories .hasType (cat, ScheduleType .NOT_NONE) && ! (await schModel .hasTransactions (cat)))
                  await schModel .remove (cid);
              }
            }
          }
        }
        await this._balanceHistoryModel .removeList ((await this._balanceHistoryModel .find({account: arg .id})) .map (h => {return h._id}));
        await this._model .remove (arg .id, this);
        break;
      }

      case AccountsViewEvent .INSERT: {
        Model .newUndoGroup();
        let target = this._accountsModel .getAccount (arg .id), promises = [];
        if (target .type == AccountType .GROUP && ! arg .inside) {
          let sort           = arg .before? target .sort: target .sort + 1;
          let sortUpdateList = Array .from (this._accountsModel .getAccounts() .values())
            .filter (a => {return a .type == AccountType .GROUP && a .form == target .form && a .sort >= sort})
            .map    (a => {return {id: a._id, update: {sort: a .sort + 1}}});
          if (sortUpdateList .length)
            promises .push (this._model .updateList (sortUpdateList, this));
          promises .push (this._model .insert ({
            type: AccountType .GROUP,
            form: target .form,
            sort: sort
          }, this))
        } else {
          let group    = target .type == AccountType .ACCOUNT? target .group: target._id;
          let siblings = Array .from (this._accountsModel .getAccounts() .values())
            .filter (a =>     {return a .group == group})
            .sort   ((a,b) => {return a .sort < b .sort? -1: 1})
          let sort;
          if (target .type == AccountType .ACCOUNT)
            sort = arg .before? target .sort: target .sort + 1;
          else
            sort = siblings .length? siblings [arg .before? 0: siblings .length - 1] .sort + (arg .before? 0: 1): 1;
          let sortUpdateList = [];
          sortUpdateList = siblings
            .filter (a => {return a .sort >= sort})
            .map    (a => {return {id: a._id, update: {sort: a .sort + 1}}})
          if (sortUpdateList .length)
            promises .push (this._model .updateList (sortUpdateList, this));
          let acc = (await this._model .insert ({
            type:  AccountType .ACCOUNT,
            group: group,
            sort:  sort,
            form:  target .form,
          }, this));
        }
        await Promise.all (promises);
        break;
      }
    }
  }

  async _addBalanceHistory (account, entry) {
    let fields  = [
      new ViewTextbox ('date',   this._dateViewFormat,   '', '', 'Date'),
      new ViewTextbox ('amount', ViewFormats ('moneyDCZ'), '', '', 'Balance')
    ];
    let headers = [];
    let options = {keepOneEntry: true};
    let view    = new TableView ('_balanceHistoryTable', fields, headers, options);
    let query   = {account: account._id};
    let sort    = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};
    let columns = ['date', 'amount'];
    let table = new AccountsAuxTable (account._id, this .createModel ('balanceHistory'), view, query, sort, options, columns);
    await table .addHtml ($('<div>') .appendTo (entry));
    this._view .scrollRightToBottom (entry);
  }

  async _addRateFuture (account, entry) {
    let fields  = [
      new ViewTextbox ('date', this._dateViewFormat,   '', '', 'Date'),
      new ViewTextbox ('rate', ViewFormats ('percent2Z'), '', '', 'Rate')
    ];
    let headers = [];
    let options = {keepOneEntry: true};
    let view    = new TableView ('_rateFutureTable', fields, headers, options);
    let query   = {account: account._id};
    let sort    = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};
    let columns = ['date', 'rate'];
    let table = new AccountsAuxTable (account._id, this .createModel ('rateFuture'), view, query, sort, options, columns);
    await table .addHtml ($('<div>') .appendTo (entry));
    this._view .scrollRightToBottom (entry);
  }

  async _addAccount (account, setFocus) {
    const CASH_FLOW_OPTIONS     = [['Deposit', true], ['Credit',    false]];
    const NON_CASH_FLOW_OPTIONS = [['Asset',   true], ['Liability', false]];
    let entry = this._view .addEntry (account._id, account .group, account .sort);
    let line;

    if ([AccountForm .CASH_FLOW, AccountForm .ASSET_LIABILITY] .includes (account .form)) {
      line = this._view .addLine (entry);
      this._view .addField (
        new ViewTextbox ('name', ViewFormats ('string'), '', '', 'Name'),
        account._id, account .name, line, 'Name'
      )
      this._view .addField (
        new ViewTextbox ('number', ViewFormats ('string'), '', '', 'Number'),
        account._id, account .number, line, 'Institution Account Number'
      )
      line = this._view .addLine (entry);
      this._view .addField (
        new ViewSelect ('creditBalance', new ViewFormatOptionList (account .form == AccountForm .CASH_FLOW? CASH_FLOW_OPTIONS: NON_CASH_FLOW_OPTIONS), '', '', 'Type'),
        account._id, account .creditBalance, line, 'Type'
      )
      this._view .addField (
        new ViewTextbox ('balance', ViewFormats ('moneyDCZ'), '', '', 'Balance'),
        account._id, account .balance, line, 'Current Balance'
      )
      if (account .form == AccountForm .ASSET_LIABILITY)
        await this._addAssetLiabilityPartOfAccount (account, entry);

    } else if (account .form == AccountForm .INCOME_SOURCE) {
      line = this._view .addLine (entry);
      this._view .addField (
        new ViewTextbox ('name', ViewFormats ('string'), '', '', 'Name'),
        account._id, account .name, line, 'Name'
      )
      const taxTypes = [
        ['None',       AccountsTaxType .NONE],
        ['Percentage', AccountsTaxType .PERCENTAGE],
        ['Tax Table',  AccountsTaxType .TABLE]
      ];
      this._view .addField (
        new ViewSelect ('taxType', new ViewFormatOptionList (taxTypes)),
        account._id, account .taxType, line, 'Tax Calculation'
      )
      await this._addIncomeTaxFields (account, entry);

      let catLine = this._view .addLine (entry);
      this._view .addField (
        new ViewCheckbox ('incCategory', ['Not Budgeted', 'Budgeted']),
        account._id, account .incCategory != null, catLine, 'Income'
      )
      this._view .addField (
        new ViewCheckbox ('intCategory', ['Withheld at Source', 'Budgeted Separately from Income']),
        account._id, account .intCategory != null, catLine, 'Income Taxes'
      )
    }

    if (setFocus)
      this._view .setFocus (entry);
  }

  async _addIncomeTaxFields (account, entry = this._view .getEntry (account._id)) {
    let line = this._view .getLine (entry, 0);

    if (account .taxType == AccountsTaxType .PERCENTAGE) {
      this._view .addField (
        new ViewTextbox ('taxRate', ViewFormats ('percent2Z'), '', '', 'Rate'),
        account._id, account .taxRate, line, 'Tax Rate'
      )

    } else if (account .taxType == AccountsTaxType .TABLE) {

      this._view .addField (
        new ViewSelect ('taxTable', new ViewFormatOptionList (TAX_TABLES .map (t => {return [t .name, t._id]}))),
        account._id, account .taxTable, line, 'Tax Table'
      )

      let bottom = this._view .addBottom ('Monthly Deductions, Benefits and Tax Parameters', entry);
      let fields = [
        new ViewTextbox ('date',                this._dateViewFormat,   '', '',   'Date'),
        new ViewTextbox ('beforeTaxDeductions', ViewFormats ('moneyDCZ'), '', '', 'Amount'),
        new ViewTextbox ('afterTaxDeductions',  ViewFormats ('moneyDCZ'), '', '', 'Amount'),
        new ViewTextbox ('taxableBenefits',     ViewFormats ('moneyDCZ'), '', '', 'Amount'),
        new ViewTextbox ('federalClaim',        ViewFormats ('moneyDCZ'), '', '', 'Amount'),
        new ViewTextbox ('provincialClaim',     ViewFormats ('moneyDCZ'), '', '', 'Amount')
      ]
      let headers = [
        {name: 'date',                header: 'Starting Date'},
        {name: 'beforeTaxDeductions', header:' Pre-Tax Deductions'},
        {name: 'afterTaxDeductions',  header: 'After-Tax Deductions'},
        {name: 'taxableBenefits',     header: 'Taxable Benefits'},
        {name: 'federalClaim',        header: 'Federal Claim'},
        {name: 'provincialClaim',     header: 'Provincial/State Claim'}
      ];
      let options = {keepOneEntry: true};
      let view    = new TableView ('_taxDeductionTable', fields, headers, options);
      let query   = {account: account._id};
      let sort    = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};
      let columns = headers .map (h => {return h .name});
      let table   = new AccountsAuxTable (account._id, this .createModel ('taxParameters'), view, query, sort, options, columns);
      await table .addHtml ($('<div>', {class: '_taxDeductionTableContainer'}) .appendTo (bottom));
    }
  }

  _removeIncomeTaxFields (account) {
    let entry = this._view .getEntry (account._id);
    this._view .removeField   ('taxRate', entry);
    this._view .removeField   ('taxTable', entry);
    this._view .removeBottom  (entry);
  }

  _removeAssetLiabilityPartOfAccount (account) {
    let entry = this._view .getEntry (account._id);
    this._view .removeField ('accruedInterest',  entry);
    this._view .removeField ('balanceDate',      entry);
    this._view .removeField ('liquid',           entry);
    this._view .removeField ('apr',              entry);
    this._view .removeField ('rateType',         entry);
    this._view .removeField ('category',         entry);
    this._view .removeField ('disCategory',      entry);
    this._view .removeField ('intCategory',      entry);
    this._view .removeField ('paymentFrequency', entry);
    this._view .removeField ('disTaxRate',       entry);
    this._view .removeRight (entry);
    this._view .removeLine  (entry, 3);
  }

  async _addAssetLiabilityPartOfAccount (account, entry = this._view .getEntry (account._id)) {
    let line1 = this._view .getLine (entry, 1);
    let line2 = this._view .addLine (entry);

    if (account .creditBalance) {
      this._view .addField (
        new ViewTextbox ('balanceDate', this._dateViewFormat, '', '', 'Date'),
        account._id, account .balanceDate, line1, 'Balance Date'
      )
      this._view .addField (
        new ViewCheckbox ('liquid', ['Not Liquid', 'Liquid']),
        account._id, account .liquid, line1, 'Liquid Asset'
      )
      this._view .addField (
        new ViewTextbox ('apr', ViewFormats ('percent2Z'), '', '', Types .percent2Z .toString (this._defaultRate)),
        account._id, account .apr, line1, 'Rate'
      )
      this._view .addField (
        new ViewCheckbox ('category', ['Not Budgeted', 'Budgeted']),
        account._id, account .category != null, line2, 'Contributions'
      )
      this._view .addField (
        new ViewCheckbox ('disCategory', ['Not Budgeted', 'Budgeted']),
        account._id, account .disCategory != null, line2, 'Disbursals'
      )
      this._view .addField (
        new ViewTextbox ('disTaxRate', ViewFormats ('percent2Z'), '', '', 'Rate'),
        account._id, account .disTaxRate, line2, 'Disbursal Tax Rate'
      )
      await this._addBalanceHistory (account, this._view .addRight ('Balance History', entry));


    } else {
      if (! account .creditBalance)
        this._view .addField (
          new ViewTextbox ('accruedInterest', ViewFormats ('moneyDCZ'), '', '', 'Amount'),
          account._id, account .accruedInterest, line1, 'Accrued Interest'
        )
      this._view .addField (
        new ViewTextbox ('balanceDate', this._dateViewFormat, '', '', 'Date'),
        account._id, account .balanceDate, line1, 'Balance Date'
      )
      this._view .addField (
        new ViewTextbox ('apr', ViewFormats ('percent2Z'), '', '', Types .percent2Z .toString (this._defaultRate)),
        account._id, account .apr, line2, 'Rate'
      )
      this._view .addField (
        new ViewSelect ('rateType',
          new ViewFormatOptionList (
            [['Simple Interest', RateType .SIMPLE], ['Canadian Mortgage', RateType .CANADIAN_MORTGAGE]]
          ), '', '', 'Rate Type'),
        account._id, account .rateType, line2, 'Rate Type'
      )
      this._view .addField (
        new ViewSelect ('paymentFrequency',
          new ViewFormatOptionList (
            [
              ['Monthly',      PaymentFrequency .MONTHLY],
              ['Semi-Monthly', PaymentFrequency .SEMI_MONTHLY],
              ['Bi-Weekly',    PaymentFrequency .BI_WEEKLY],
              ['Weekly',       PaymentFrequency .WEEKLY]
            ]
          ), '', '', 'Payment Frequency'),
        account._id, account .paymentFrequency, line2, 'Payment Frequency'
      );
      let line3 = this._view .addLine (entry);
      this._view .addField (
        new ViewCheckbox ('intCategory', ['Not Budgeted', 'Budgeted']),
        account._id, account .intCategory != null, line3, 'Payments'
      )
      this._view .addField (
        new ViewCheckbox ('category', ['Not Budgeted', 'Budgeted']),
        account._id, account .category != null, line3, 'Payments to Principal'
      )
      this._view .addField (
        new ViewCheckbox ('disCategory', ['Not Budgeted', 'Budgeted']),
        account._id, account .disCategory != null, line3, 'Advances'
      )
      await this._addBalanceHistory (account, this._view .addRight ('Balance History', entry));
      await this._addRateFuture     (account, this._view .addRight ('Rate Future', entry));
    }
  }

  _addSubgroup (account, setFocus) {
    let groupNum = FORM_TO_GROUP [account .form];
    this._view .addSubGroup (
      new ViewTextbox ('name', ViewFormats ('string'), '', '', 'Give this group a name'),
      account._id, account .name, this._group [groupNum], groupNum,  account .sort, setFocus
    );
  }

  async addHtml (toHtml) {
    let build = async () => {
      this._defaultRate = (await this._paramModel .find ({name: 'rates'})) [0] .apr;
      await this._view .addHtml (toHtml, build);
      this._group = [];
      let hasAccount;
      for (let groupNum of Array .from (Object .keys (GROUP_TO_FORM))) {
        this._group [groupNum] = this._view .addGroup (
          ['Cash Flow Accounts', 'Asset and Liability Accounts', 'Income Sources'] [groupNum]
        );
        for (let group of this._accountsModel .getAccounts())
          if (group .form == GROUP_TO_FORM [groupNum] && group .type == AccountType .GROUP) {
            this._addSubgroup (group);
            for (let account of this._accountsModel .getAccounts())
              if (account .type == AccountType .ACCOUNT && account .group == group._id) {
                hasAccount = true;
                await this._addAccount (account);
              }
          }
        }
        if (! hasAccount)
          this._view .addHelpTable (
            ['There are three types of accounts: '+
              'Cash-Flow accounts for bank accounts whose transactions you track, '+
              'Asset and Liability that determine your net worth shown on the Wealth page, and '+
              'Income Source accounts project your after-tax income.',
            'Within each type, accounts are organized into groups.', 'Get started ...'],
            [
              ['Add an account group', 'CMD + ALT + ENTER'],
              ['Add a group',          'CMD + ENTER'],
              ['Delete',               'CMD + DELETE']
              ]
          );
    }
    await build();
  }
}

class AccountsAuxTable extends Table {
  constructor (accountId, model, view, query, sort, options, columns) {
    super (model, view, query, sort, options, columns);
    this._accountId = accountId;
  }

  async _insert (insert, pos) {
    insert .account = this._accountId;
    return await super._insert (insert, pos);
  }
}

const GROUP_TO_FORM = {
  '0': AccountForm .CASH_FLOW,
  '1': AccountForm .ASSET_LIABILITY,
  '2': AccountForm .INCOME_SOURCE
}

const FORM_TO_GROUP = {
  [AccountForm .CASH_FLOW]:       0,
  [AccountForm .ASSET_LIABILITY]: 1,
  [AccountForm .INCOME_SOURCE]:   2
}

