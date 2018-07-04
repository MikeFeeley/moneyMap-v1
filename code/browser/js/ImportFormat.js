class ImportFormat {

  constructor (accounts) {
    this._accounts = accounts;
    this._cashFlowAccounts = this._accounts .getAccounts()
      .filter (a => a .form == AccountForm .CASH_FLOW && a .type == AccountType .ACCOUNT)
      .sort ((a,b) => a .name < b .name? -1: a .name == b .name? 0: 1)
    this._view = new ImportFormatView();
    this._view .addObserver (this, this._onViewChange);
  }

  async _onViewChange (e, arg) {
    switch (e) {

      case ImportFormatViewEvent .FILE_LOADED:
        this._loadFile (arg);
        break;

      case ImportFormatViewEvent .COLUMN_SELECTED:
        const updateAccount =
          (this._importColumns && this._importColumns .account !== undefined && this._importColumns .account == arg .column) ||
          (arg .importColumns .account !== undefined && arg .importColumns .account == arg .column);
        if (updateAccount)
          if (arg .importColumns .account !== undefined)
            this._addAccounts (arg .importColumns);
          else {
            this._numbers = null;
            this._selectedAccounts = null;
            this._view .removeAccounts();
          }
        this._importColumns = arg .importColumns;
        const promises = [];
        for (const account of this._selectedAccounts || [])
          promises .push (this._accounts .getModel() .update (account._id, {importColumns: this._importColumns}));
        await Promise .all (promises);
        break;

      case ImportFormatViewEvent .ACCOUNT_SELECTED:
        const oldSelected = (this._selectedAccounts || []) .findIndex (a => a .number == arg .number && a != arg .account);
        if (oldSelected != -1) {
          await this._accounts .getModel() .update (this._selectedAccounts [oldSelected]._id, {number: null});
          this._selectedAccounts .splice (oldSelected, 1);
        }
        if (arg .account) {
          this._selectedAccounts = (this._selectedAccounts || []) .concat (arg .account);
          await this._accounts .getModel() .update (arg .account._id, {number: arg .number, importColumns: this._importColumns});
        } else {
          const i = this._selectedAccounts .indexOf (arg .account);
          if (i != -1)
            this._selectedAccounts .splice (i, 1);
        }
        break;
    }
  }

  _addAccounts (importColumns) {
    this._importColumns = importColumns;
    this._numbers = [... this._data .reduce ((s, d) => s .add (d [importColumns .account]), new Set())]
      .filter (n => n)
      .sort();
    this._view .addAccounts (this._numbers, this._cashFlowAccounts);
    this._selectedAccounts = this._cashFlowAccounts .filter (a => this._numbers .find (n => n == a .number));
  }

  async _loadFile (file) {
    try {
      this._data = (await new Promise ((resolve, reject) => {
        Papa .parse (file, {
          complete: (results) => resolve (results),
          error:    (error)   => reject  (error)
        })
      })) .data;
      let importColumns;
      outermost: for (const item of this._data)
        for (const account of this._cashFlowAccounts)
          if (account .importColumns && account .importColumns .account !== undefined)
            if (item [account .importColumns .account] == account .number) {
              importColumns = account .importColumns;
              break outermost;
            }
      if (this._data .length)
        this._view .addTable (this._data, importColumns);
      if (importColumns)
        this._addAccounts (importColumns);
    } catch (e) {
      this._view .error ('File format error');
      throw e;
    }
  }

  add() {
    this._view .addHtml();
  }

  static show (accounts) {
    (new ImportFormat (accounts)) .add();
  }
}