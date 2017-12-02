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
  }

  async _onParamModelChange (eventType, acc, arg, source) {
    if (eventType == ModelEvent .UPDATE && arg .apr !== undefined)
      this._view .resetHtml();
  }

  async _onViewChange (eventType, arg) {
    switch (eventType) {

      case ViewEvent .UPDATE: {
        if (['category', 'disCategory'] .includes (arg .fieldName)) {
          Model .newUndoGroup();
          let categories = this._budget .getCategories();
          let schModel   = this._budget .getSchedulesModel();
          let account  = this._accounts .get (arg .id);
          if (arg .value) {
            // add category
            let root = arg .fieldName == 'category'? this._budget .getSavingsCategory(): this._budget .getWithdrawalsCategory();
            let cat  = (root .children || []) .find (c => {return c .name == account .name});
            if (! cat)
              cat = categories .get ((await schModel .insert ({name: account .name, account: account._id}, {inside: true, id: root._id})) [0]);
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
        } else
          await this._model .update (arg .id, {[arg .fieldName]: arg .value}, this);
        break;
      }

      case AccountsViewEvent .MOVE: {
        Model .newUndoGroup();
        let sort = 0, targetSort, updateList = [];
        let siblings = (await (
          arg .groupNum
            ? this._model .find ({cashFlow: arg .groupNum, type: AccountType .GROUP})
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
          ? a => {return a .type == AccountType .GROUP && a .cashFlow == target .cashFlow}
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
            .filter (a => {return a .type == AccountType .GROUP && a .cashFlow == target .cashFlow && a .sort >= sort})
            .map    (a => {return {id: a._id, update: {sort: a .sort + 1}}});
          if (sortUpdateList .length)
            promises .push (this._model .updateList (sortUpdateList, this));
          promises .push (this._model .insert ({
            type:     AccountType .GROUP,
            cashFlow: target .cashFlow,
            sort:     sort
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
            type:     AccountType .ACCOUNT,
            group:    group,
            sort:     sort,
            cashFlow: target .cashFlow,
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
      new ViewTextbox ('date',   ViewFormats ('dateDMY'),   '', '', 'Date'),
      new ViewTextbox ('amount', ViewFormats ('moneyDCZ'), '', '', 'Balance')
    ];
    let headers = [];
    let options = {keepOneEntry: true};
    let view    = new TableView ('_balanceHistoryTable', fields, headers, options);
    let query   = {account: account._id};
    let sort    = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};
    let columns = ['date', 'amount'];
    let table = new AccountsBalanceHistoryTable (account._id, new Model ('balanceHistory'), view, query, sort, options, columns);
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
      new ViewSelect ('creditBalance', new ViewFormatOptionList (account .cashFlow? CASH_FLOW_OPTIONS: NON_CASH_FLOW_OPTIONS), '', '', 'Type'),
      account._id, account .creditBalance, line, 'Type'
    )
    this._view .addField (
      new ViewTextbox ('balance', ViewFormats ('moneyDCZ'), '', '', 'Balance'),
      account._id, account .balance, line, 'Current Balance'
    )
    if (! account .cashFlow) {
      line = this._view .addLine (entry);
      this._view .addField (
        new ViewTextbox ('apr', ViewFormats ('percent2Z'), '', '', Types .percent2Z .toString (this._defaultRate)),
        account._id, account .apr, line, 'Rate'
      )
      this._view .addField (
        new ViewCheckbox ('liquid', ['Not Liquid', 'Liquid']),
        account._id, account .liquid, line, 'Liquidity'
      )
      this._view .addField (
        new ViewCheckbox ('category', ['Not Budgeted', 'Budgeted']),
        account._id, account .category != null, line, 'Contributions'
      )
      this._view .addField (
        new ViewCheckbox ('disCategory', ['Not Budgeted', 'Budgeted']),
        account._id, account .disCategory != null, line, 'Disbursals'
      )
      await this._addBalanceHistory (account, this._view .addRight ('Balance History', entry));
    }
    if (setFocus)
      this._view .setFocus (entry);
  }

  _addSubgroup (account, setFocus) {
    this._view .addSubGroup (
      new ViewTextbox ('name', ViewFormats ('string'), '', '', 'Give this group a name'),
      account._id, account .name, account .cashFlow? this._cashFlowGroup: this._nonCashFlowGroup, account .cashFlow, account .sort,
      setFocus
    );
  }

  async addHtml (toHtml) {
    let build = async () => {
      this._defaultRate = (await this._paramModel .find ({name: 'rates'})) [0] .apr;
      await this._view .addHtml (toHtml, build);
      this._accounts = (await this._model .find()) .sort ((a,b) => {return a .sort < b .sort? -1: 1});
      for (let cashFlow of [true, false]) {
        if (cashFlow)
          this._cashFlowGroup = this._view .addGroup ('Cash Flow Accounts');
        else
          this._nonCashFlowGroup = this._view .addGroup ('Asset and Liability Accounts');
        for (let group of this._accounts)
          if (group .cashFlow == cashFlow && group .type == AccountType .GROUP) {
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

class AccountsBalanceHistoryTable extends Table {
  constructor (accountId, model, view, query, sort, options, columns) {
    super (model, view, query, sort, options, columns);
    this._accountId = accountId;
  }

  async _insert (insert, pos) {
    insert .account = this._accountId;
    await super._insert (insert, pos);
  }
}