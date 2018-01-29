class Accounts extends Observable {

  constructor (accountsModel, budget) {
    super();
    this._model               = accountsModel .getModel();
    this._modelObserver       = this._model .addObserver (this, this._onModelChange);
    this._budget              = budget;
    this._paramModel          = new Model ('parameters');
    this._paramObserver       = this._paramModel .addObserver (this, this._onParamModelChange);
    this._balanceHistoryModel = new Model ('balanceHistory');
    this._view                = new AccountsView();
    this._view .addObserver (this, this._onViewChange);
    this._accounts            = null;
    this._dateType            = new DateType ('DMY', true);
    this._dateViewFormat      =  new ViewFormat (
      (value => {return this._dateType .toString   (value)}),
      (view  => {return this._dateType .fromString (view)})
    )
  }

  delete() {
    this._model .deleteObserver (this._modelObserver);
    this._paramModel .delete();
    this._balanceHistoryModel .delete();
  }

  async _onModelChange (eventType, acc, arg, source) {
    if (this._accounts) {
      if (! this._view .isVisible())
        this._view .resetHtml();
      else {
        switch (eventType) {
          case ModelEvent .UPDATE:
            if (arg .sort)
              this._view .updateSort (acc._id, arg .sort)
            else {
              let fieldName = Array .from (Object .keys (arg)) [0];
              let account   = this._accounts .get (acc._id);
              this._view .updateField (acc._id, fieldName, arg [fieldName]);
              account [fieldName] = arg [fieldName];
              let schModel = this._budget .getSchedulesModel();
              if (fieldName == 'name') {
                for (let cid of [account .category, account .disCategory])
                  if (cid)
                    await schModel .update (cid, {name: arg [fieldName]})
              }
            }
            if (acc .type == AccountType .ACCOUNT && acc .form == AccountForm .ASSET_LIABILITY && arg .creditBalance !== undefined) {
              this._removeAssetLiabilityPartOfAccount (acc);
              this._addAssetLiabilityPartOfAccount (acc);
            }
            break;
          case ModelEvent .INSERT:
            if (acc .type == AccountType .GROUP)
              this._addSubgroup (acc, source == this);
            else
              this._addAccount (acc, source == this);
            this._accounts .set (acc._id, acc);
            break;
          case ModelEvent .REMOVE:
            this._view .remove (acc._id, source == this);
            this._accounts .delete (acc._id);
            break;
        }
      }
    }
    if (eventType == ModelEvent .UPDATE && arg .balance)
      await this._model .update (acc._id, {balanceDate: Types .date .today()});
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
        if (['category', 'disCategory', 'intCategory'] .includes (arg .fieldName)) {
          if (!skipNewUndoGroup)
            Model .newUndoGroup();
          let categories = this._budget   .getCategories();
          let schModel   = this._budget   .getSchedulesModel();
          let account    = this._accounts .get (arg .id);
          if (arg .value) {
            // add category
            let name = account .name, update;
            if (account .isLiabilityAccount()) {
              if (arg .fieldName == 'category')
                name += ' Principal';
              else if (arg .fieldName == 'intCategory' && account .category)
                name += ' Interest';
            }
            let type = [['category', 'disCategory', 'intCategory'] .indexOf (arg .fieldName)];
            let root = this ._budget ['get' + ['Savings', 'Withdrawals', 'Expense'] [type] + 'Category'] ();
            let cat  = (root .children || []) .find (c => {return c .name == name});
            if (! cat)
              cat = categories .get ((await schModel .insert ({name: name, account: account._id}, {inside: true, id: root._id})) [0]);
            else if (! cat .account)
              await schModel .update (cat._id, {account: account._id});
            await this._model .update (account._id, {[arg .fieldName]: cat._id});
          } else {
            // remove category
            let cat = categories .get (account [arg .fieldName]);
            if (cat) {
              let removeCat = false;
              if (categories .hasType (cat, ScheduleType .NOT_NONE)) {
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
              if (removeCat)
                await schModel .remove (cat._id);
              else
                await schModel .update (cat._id, {account: null});
              await this._model .update (account._id, {[arg .fieldName]: null});
            }
          }
          if (arg .fieldName == 'intCategory' && ! arg .value && account .category) {
            this._view .updateField (account._id, 'category', false);
            await this._onViewChange (ViewEvent .UPDATE, {id: account._id, fieldName: 'category', value: false}, true)
          } else if (arg .fieldName == 'category' && arg .value && ! account .intCategory) {
            this._view .updateField (account._id, 'intCategory', true);
            await this._onViewChange (ViewEvent .UPDATE, {id: account._id, fieldName: 'intCategory', value: true}, true)
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
        let target    = this._accounts .get (arg .id);
        let isSibling = target .type == AccountType .GROUP
          ? a => {return a .type == AccountType .GROUP && a .form == target .form}
          : a => {return a .group == target .group}
        let siblings = Array .from (this._accounts .values()) .filter (isSibling);
        if (target .type == AccountType .GROUP) {
          if (siblings .length == 1) {
            this._view .showFieldTip (arg .id, 'name', ['You can not delete the last group']);
            break;
          }
          if (Array .from (this._accounts .values()) .find (a => {return a .group == arg .id})) {
            this._view .showFieldTip (arg .id, 'name', ['You can not delete a group that has accounts']);
            break;
          }
        }
        if (target .type == AccountType .ACCOUNT) {
          let schModel   = this._budget .getSchedulesModel();
          let categories = this._budget .getCategories();
          for (let cid of [target .category, target .disCategory]) {
            if (cid) {
              let cat = categories .get (cid);
              if (cat) {
                if (categories .hasType (cat, ScheduleType .NON_NONE) || await schModel .hasTransactions (cat))
                  await schModel .update (cid, {account: null});
                else
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
        let target = this._accounts .get (arg .id), promises = [];
        if (target .type == AccountType .GROUP && ! arg .inside) {
          let sort           = arg .before? target .sort: target .sort + 1;
          let sortUpdateList = Array .from (this._accounts .values())
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
          let siblings = Array .from (this._accounts .values())
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
          promises .push (this._balanceHistoryModel .insert ({account: acc._id}))
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
    let table = new AccountsAuxTable (account._id, new Model ('balanceHistory'), view, query, sort, options, columns);
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
    let table = new AccountsAuxTable (account._id, new Model ('rateFuture'), view, query, sort, options, columns);
    await table .addHtml ($('<div>') .appendTo (entry));
    this._view .scrollRightToBottom (entry);
  }

  async _addAccount (account, setFocus) {
    const CASH_FLOW_OPTIONS     = [['Deposit', true], ['Credit',    false]];
    const NON_CASH_FLOW_OPTIONS = [['Asset',   true], ['Liability', false]];
    let entry = this._view .addEntry (account._id, account .group, account .sort);
    let line;
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
    if (setFocus)
      this._view .setFocus (entry);
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
      this._accounts = (await this._model .find()) .sort ((a,b) => {return a .sort < b .sort? -1: 1});
      this._group = [];
      for (let groupNum of Array .from (Object .keys (GROUP_TO_FORM))) {
        this._group [groupNum] = this._view .addGroup (
          ['Cash Flow Accounts', 'Asset and Liability Accounts', 'Income Sources', 'Tax Tables'] [groupNum]
        );
        for (let group of this._accounts)
          if (group .form == GROUP_TO_FORM [groupNum] && group .type == AccountType .GROUP) {
            this._addSubgroup (group);
            for (let account of this._accounts)
              if (account .type == AccountType .ACCOUNT && account .group == group._id)
                await this._addAccount (account);
          }
        }
      this._accounts = this._accounts .reduce ((m,a) => {return m .set (a._id, a)}, new Map());
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
  '2': AccountForm .INCOME_SOURCE,
  '3': AccountForm .TAX_TABLE
}

const FORM_TO_GROUP = {
  [AccountForm .CASH_FLOW]: 0,
  [AccountForm .ASSET_LIABILITY]: 1,
  [AccountForm .INCOME_SOURCE]: 2,
  [AccountForm .TAX_TABLE]: 3
}