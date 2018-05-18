/**
 * Config model
 *    user
 *    name
 *    curBudget
 *    type
 *    keyTest
 */

const ConfigType = {
  CLOUD_UNENCRYPTED: 0,
  CLOUD_ENCRYPTED:   1,
  LOCAL:             2
}

const ConfigDesc = ['Cloud Unencrypted', 'Cloud Encrypted', 'Local'];
const ConfigExp  = [
  'Your data is accessible from anywhere and you have no private password to remember.  ' +
  'We keep your data secure.  It is encrypted in transit to/from the cloud, but is not protected by a local password.',

  'Your data is accessible from anywhere and encrypted on your computer to ensure absolute privacy. ' +
  'You must remember your password.  It is not stored in the cloud.  It can not be recovered.  ' +
  'If you forget it, your data will be permanently unreadable.',

  'Your data is stored on and never leaves your computer, but is only accessible from that device.'
]

const ConfigKeyTest = 'EncryptionKeyIsCorrect';

var User_DB_Crypto;

/**
 * User model
 *    username
 *    password
 *    accessCap
 *    name
 *    curConfiguration
 */

class User extends Observable {

  constructor() {
    super();
    this._view = new UserView();
    this._view .addObserver (this, this._onViewChange);
  }

  _getConfigTab (id) {
    let tabs = this._configTabs .find ('> ._tabGroupTabs > ._tab');
    let i    = id && tabs .find ('> ._field') .toArray() .findIndex (fh => {let f = $(fh) .data ('field'); return f && f._id == id});
    return $(tabs [i || 0]);
  }

  _getBudgetTab (id) {
    let tabs = this._getBudgetTabs() .find ('> ._tabGroupTabs > ._tab');
    let i    = id && tabs .find ('> ._field') .toArray() .findIndex (fh => {let f = $(fh) .data ('field'); return f && f._id == id});
    return $(tabs [i || 0]);
  }

  _getBudgetTabs() {
    let tabs = this._configTabs .find ('> ._tabGroupTabs > ._tab');
    let i    = tabs .find ('> ._field') .toArray() .findIndex (fh => {let f = $(fh) .data ('field'); return f && f._id == this._cid});
    return $(this._configTabs .find ('> ._tabGroupContents > ._content') .toArray() [i]) .find ('> ._contentGroup > ._tabGroup');
  }

  /**
   * Config Model Change Handler
   */
  async _onConfigModelChange (eventType, doc, arg) {
    if (this._configTabs) {
      let tab = this._getConfigTab (doc._id);
      if (eventType == ModelEvent .INSERT && tab .length)
        eventType = ModelEvent .UPDATE;
      if (eventType == ModelEvent .UPDATE && arg .deleted)
        eventType = ModelEvent .REMOVE;
      switch (eventType) {
        case ModelEvent .INSERT:
          await this._addConfig (doc, true);
          break;
        case ModelEvent .REMOVE:
          if (tab)
            this._view .removeTab (tab);
          break;
        case ModelEvent .UPDATE:
          let c = this._configs .find (c => {return c._id == doc._id});
          if (c && arg && arg .name) {
            c .name = arg .name;
            if (this._onLabelChange)
              this._onLabelChange (this .getLabel());
          }
          break;
      }
    }
  }

  /**
   * Budget Model Change Handler
   */
  async _onBudgetModelChange (eventType, doc, arg) {
    if (this._configTabs) {
      let tab = this._getBudgetTab (doc._id);
      if (eventType == ModelEvent .INSERT && tab .length)
        eventType = ModelEvent .UPDATE;
      switch (eventType) {
        case ModelEvent .INSERT:
          await this._addBudget (doc, true);
          break;
        case ModelEvent .REMOVE:
          if (tab)
            this._view .removeTab (tab);
          break;
        case ModelEvent .UPDATE:
          if (arg) {
            let b = this._budgets .find (b => {return b._id == doc._id});
            if (b) {
              for (let f in arg)
                if (! f .startsWith ('_'))
                  b [f] = doc [f];
            }
            this._updateCookie();
            if (arg .name) {
              if (this._onLabelChange)
                this._onLabelChange (this .getLabel())
            }
          }
          break;
      }
    }
  }

  _sortByName (collection) {
    return collection .sort ((a, b) => {return a .name < b .name? -1: a .name == b .name? 0: 1});
  }

  /**
   * View Change Handler
   */
  async _onViewChange (eventType, arg) {
  
    switch (eventType) {
      case UserViewEvent .LOGIN:
        let login = await Model .login (arg .username, arg .password);
        if (login .noUser)
          this._view .loginError ('No user exists with that email');
        else if (login .badPassword)
          this._view .loginError ('Incorrect password');
        else {
          let user         = login .user;
          this._uid        = user._id;
          this._accessCap  = user .accessCap;
          this._username   = user .username;
          this._name       = user .name;
          this._cid        = user .curConfiguration;
          if (arg .remember)
            this._addCookie();
          this._setModelsForConfig();
          this._view .removeLogin();
          try {
            await this._init();
          } catch (e) {
            this .logout();
            break;
          }
          this._notifyObservers (UserEvent .NEW_USER);
        }
        break;

      case UserViewEvent .SIGNUP_ASK:
        this._view .addSignup();
        break;

      case UserViewEvent .SIGNUP:
        if (arg .username .length == 0)
          this._view .loginError ('Email can not be blank');
        else if (arg .name .length == 0)
          this._view .loginError ('Name can not be blank');
        else if (arg .password .length == 0)
          this._view .loginError ('Password can not be blank');
        else if (arg .password != arg .confirm)
          this._view .loginError ('Passwords do not match');
        else {
          arg .username = arg .username .toLowerCase();
          let signup = await Model .signup ({username: arg .username, password: arg .password, name: arg .name});
          if (signup .alreadyExists)
            this._view .loginError ('User already exists with that email');
          else {
            this._uid       = signup._id;
            this._accessCap = signup .accessCap;
            this._username  = arg .username;
            this._name      = arg .name;
            this._setModelsForConfig();
            await this._createEmptyConfig (ConfigType .LOCAL, '', 'Default');
            this._configs = this._sortByName (await this._configModel .find({deleted: null}));
            if (arg .remember)
              this._addCookie();
            this._view .removeLogin();
            this._notifyObservers (UserEvent .NEW_USER);
          }
        }
        break;

      case UserViewEvent .TAB_CLICK:
        if (arg .tab) {
          this._view .selectTab (arg .tab);
          let field = arg .tab .find ('._field') .data('field');
          if (field._name .startsWith ('c_')) {
            await this._selectConfig (field._id);
            this._view .selectTab (this._getBudgetTab (this._bid));
          } else
            await this._selectBudget (field._id);
          this._notifyApp();
        } else
          /* ADD */
          switch (arg .name) {
            case 'configurations':
              this._view .addConfigAddPopup (arg .target, this._configs);
              break;
            case 'budgets':
              this._view .addBudgetAddPopup (arg .target, this._budgets);
              break;
          }
        break;

      case UserViewEvent .BUDGET_EMPTY:
        await this._createEmptyBudget (true);
        break;

      case UserViewEvent .BUDGET_COPY:
        await this._createBudgetCopy (arg .from);
        break;

      case UserViewEvent .BUDGET_ROLLOVER:
        await this._createRolloverBudget (arg .from);
        break;

      case UserViewEvent .CONFIG_EMPTY:
        await this._createEmptyConfig (arg .type, arg .encryptionPassword);
        break;

      case UserViewEvent .CONFIG_COPY:
        await this._copyConfig (arg .type, arg .encryptionPassword, arg .from);
        break;

      case ViewEvent .UPDATE:
        if (arg .id && arg .value) {
          let model  = arg .fieldName .startsWith ('c_')? this._configModel: this._budgetModel;
          let update = {}
          update [arg .fieldName .slice (2)] = arg .value;
          await model .update (arg.id, update);
          this._notifyApp();
        }
        break;

      case UserViewEvent .DELETE_CONFIRMED:
        switch (arg .type) {
          case 'configuration':
            await this._deleteConfig (arg .id);
            break;
          case 'budget':
            await this._deleteBudget (arg .id);
            break;
        }
        break;
    }
  }

  newConfigurationAccepted() {
    if (this._hasCookie) {
      this._addCookie();
      this._hasCookie = false;
    }
  }

  _addCookie() {
    const pickle = ['_uid', '_accessCap', '_username', '_name', '_cid'];
    let   expiry = new Date();
    expiry .setTime (expiry .getTime() + (1000 * 24 * 60 * 60 * 1000));
    document .cookie =
      'user='    + JSON .stringify (pickle .reduce ((o,p) => {o [p] = this [p]; return o}, {})) + '; ' +
      'expires=' + expiry .toUTCString()
  }

  _updateCookie() {
    if (document .cookie .split (';') .find (c => {return c .startsWith ('user={')}))
      this._addCookie();
  }

  async _tryCookie() {
    let cookie = document .cookie .split (';') .find (c => {return c .trim() .startsWith ('user={')});
    if (cookie) {
      let cv = JSON .parse (cookie .trim() .slice (5));
      for (let p in cv)
        this [p] = cv [p];
      this._setModelsForConfig();
      try {
        await this._init();
      } catch (e) {
        return false;
      }
      if (! this._cid || ! this._bid)
        return false;
      this._hasCookie = true;
      this._deleteCookie()
      this._notifyObservers (UserEvent .NEW_USER);
      return true;
    } else
      return false;
  }

  async _init() {
    this._configs = this._sortByName (await this._configModel .find({deleted: null}));
    this._budgets = this._sortByName (await this._budgetModel .find());
    this._bid     = (this._configs .find (c => {return c._id == this._cid}) || {}) .curBudget;
    if (! this._budgets .find (b => {return b._id == this._bid}))
      this._bid = this._budgets && this._budgets .length > 0 && this._budgets [0]._id;
    let config = this._configs .find (c => {return c._id == this._cid});
    if (config .type == ConfigType .CLOUD_ENCRYPTED) {
      let encryptionPassword = localStorage .getItem ('encryptionPassword_' + this._cid);
      if (! encryptionPassword) {
        let verifyPassword = async pwd => {
          User_DB_Crypto = new Crypto (pwd);
          let c = await this._configModel .find ({_id: config._id});
          return c [0] .keyTest == ConfigKeyTest;
        }
        encryptionPassword = await this._view .getConfigEncryptionPassword (config .name, verifyPassword);
        localStorage .setItem ('encryptionPassword_' + this._cid, encryptionPassword);
      } else {
        User_DB_Crypto = new Crypto (encryptionPassword);
      }
   } else
      User_DB_Crypto = null;
  }

  _deleteCookie() {
    document .cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 UTC'
  }

  async login () {
    if (! (await this._tryCookie ()))
      this._view .addLogin ($('body'));
  }

  logout() {
    this._deleteCookie();
    this._uid     = null;
    this._configs = null;
    this._budgets = null;
    this._notifyObservers (UserEvent .LOGOUT);
  }

  getDatabaseName (cid = this._cid) {
    return 'config_' + cid + '_' + this._accessCap;
  }

  getLabel (onChange) {
    if (onChange)
      this._onLabelChange = onChange;
    if (this._configs) {
      let label = this._configs .length == 1? this._name: this._configs .find (c => {return c._id == this._cid}) .name;
      if (this._budgets .length > 1)
        label = this._budgets .find (b => {return b._id == this._bid}) .name + '&nbsp;&nbsp;&nbsp;&nbsp;' + label;
      return label;
    } else
      return '';
  }

  getBudgetId() {
    return this._bid;
  }

  _addMenuItem (name, action) {
    this._view .addMenuItem (name, () => {this._view .removeMenu(); action()});
  }

  /**
   * Select a specified configuration by:
   *   (a) setting cid
   *   (b) updating the cookie
   *   (c) changing to the new config's model
   *   (d) initializing configs and budgets lists and setting bid
   *   (e) updating the user model to set its concurrent config
   * Should be call only after the new configuration's model is fully updated
   */
  async _selectConfig (cid) {
    let old = this._cid;
    this._cid = cid;
    this._updateCookie();
    this._setModelsForConfig();
    try {
      await this._init();
    } catch (e) {
      this._cid = old;
      this._updateCookie();
      this._setModelsForConfig();
      try {
        await this._init();
      } catch (e) {
        this .logout();
      }
      return;
    }
    if (this._onLabelChange)
      this._onLabelChange (this .getLabel());
    await Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
  }

  /**
   * Select specified budget by:
   *   (a) setting bid
   *   (b) updating the cookie
   *   (c) notifying observer that change has occurred
   *   (d) updating the user model to set its current budget
   */
  async _selectBudget (bid) {
    this._bid = bid;
    this._updateCookie();
    await this._configModel .update (this._cid, {curBudget: this._bid});
  }

  async _notifyApp() {
    if (this._onLabelChange)
      this._onLabelChange (this .getLabel());
    await this._notifyObserversAsync (UserEvent .NEW_CONFIGURATION);
  }

  /**
   * Add the User menu to toHtml
   */
  showMenu (toHtml) {
    let html = $('body');
    this._view .addMenu (html, {top: UI_BANNER_HEIGHT, right: 10}, toHtml, {top: 0, right: 10});
    this._addMenuItem ('Edit Profile', () => {(async () => {await this._addAccountEdit()}) ()});
    if (this._configs .length > 1) {
      let items = this._configs
        .filter (c => {return c._id != this._cid})
        .map (c => {return {
          name:   c .name,
          action: e => {
            this._view .removeMenu();
            (async () => {await this._selectConfig (c._id); await this._notifyApp()})();
          }
        }})
      this._view .addSubMenu ('Change Configuration', items);
    }
    if (this._budgets .length > 1) {
      let items = this._budgets
        .filter (b => {return b._id != this._bid})
        .map (b => {return {
          name:   b .name,
          action: e => {
            this._view .removeMenu();
            (async () => {await this._selectBudget (b._id); await this._notifyApp()})();
          }
        }})
      this._view .addSubMenu ('Change Budget', items);
    }
    this._addMenuItem ('Logout',  () => {this .logout()});
  }

  _setModelsForConfig() {
    if (this._configModel)
      this._configModel .delete();
    if (this._budgetModel)
      this._budgetModel .delete();
    this._configModel = new Model ('configurations', 'user_' + this._uid + '_' + this._accessCap);
    this._budgetModel = new Model ('budgets',        this .getDatabaseName());
    this._configModel .addObserver (this, this._onConfigModelChange);
    this._budgetModel .addObserver (this, this._onBudgetModelChange);
    this._configModel .observe();
    this._budgetModel .observe();
  }

  async _disconnectApp() {
    await this._notifyObserversAsync (UserEvent .DISCONNECT);
  }

  /**
   * Add Profile / Configurations edit to the view
   */
  async _addAccountEdit() {
    let ae = this._view .addAccountEdit();
    this._addUserEdit   (ae);
    await this._addConfigEdit (ae);
  }

  /**
   * Add Profile edit to the view
   */
  _addUserEdit (ae) {
    let ag = this._view .addGroup ('Profile', ae);
    let email    = this._view .addLine (ag);
    let password = this._view .addLine (ag);
    let name     = this._view .addLine (ag);
    let update   = this._view .addLine (ag);
    this._view .addLabel    ('Email',            email);
    this._view .addLabel    ('Password',         password);
    this._view .addLabel    ('Name',             name);
    let em = this._view .addInput    ('Email',            this._username, email);
    let op = this._view .addInput    ('Old Password',     '', password, 'password');
    let np = this._view .addInput    ('New Password',     '', password, 'password');
    let cp = this._view .addInput    ('Confirm Password', '', password, 'password');
    let nm = this._view .addInput    ('Name',             this._name, name);
    this._view .addButton   ('Update Profile',   (async () => {
      await this._updateAccount ([em, op, np, cp, nm] .map (f => {return f.val()}))
    }), update);
    this._accountEditError = this._view .addLabel ('', update, '_errorMessage');
  }

  /**
   * Add specified config to view
   */
  async _addConfig (config, select) {
    let [configTab, configContent] = this._view .addTab (this._configTabs);
    this._view .addField (new ViewScalableTextbox ('c_name', ViewFormats ('string'), '', '', 'Config Name'), config._id, config .name, configTab);

    this._view .addLabel ('Configuration', configContent, '_heading');
    let configLine = this._view .addLine (configContent, '_line _configTypeLine');
    this._view .addReadOnlyField ('type', config._id, ConfigDesc [config .type || 0], configLine, 'Data Storage');
    if (config .type == ConfigType .CLOUD_ENCRYPTED) {
      let ep = localStorage .getItem ('encryptionPassword_' + config._id);
      this._view .addReadOnlyField ('encryptionPassword', config._id, ep || '<unknown>', configLine, 'Private Encryption Password');
    }

    let budgetContentGroup = this._view .addTabContentGroup ('Budgets', configContent);
    let budgetTabs         = this._view .addTabGroup ('budgets', budgetContentGroup);
    this._view .addButton ('Delete Configuration', () => {
      if (this._configs .length > 1) {
        let html = this._configTabs .find ('> ._tabGroupContents > ._content._selected > ._line > button');
        this._view .addConfirmDelete (html, config._id, 'configuration', {top: -70, left: -70})
      }
    }, this._view .addLine (configContent));
    this._view .setButtonDisabled (this._configTabs, this._configs .filter (c => {return c._id != config._id}) .length == 0);
    let bm = new Model ('budgets', this .getDatabaseName (config._id));
    let budgets = this._sortByName (await bm .find ({}));
    bm .delete();
    let [budgetTab, budgetContent] = this._view .addTab (budgetTabs, '_add', true, 'Add');
    for (let b of budgets)
      this._addBudget (b, b._id == this._bid);
    if (select)
      this._view .selectTab (configTab);
  }

  /**
   * Add specified budget to budgetTabs view
   */
  _addBudget (budget, select) {
    let budgetTabs = this._getBudgetTabs();
    let [budgetTab, budgetContent] = this._view .addTab (budgetTabs);
    this._view .addField (
      new ViewScalableTextbox ('b_name',  ViewFormats ('string'), '', '',  'Budget Name'),
      budget._id, budget .name, budgetTab
    );
    let line = this._view .addLine (budgetContent);
    this._view .addField (
      new ViewTextbox ('b_start', ViewFormats ('dateDMY'), '', '', 'Start Date'),
      budget._id, budget .start, line, 'Start'
    );
    this._view .addField (
      new ViewTextbox ('b_end',   ViewFormats ('dateDMY'), '', '', 'End Date'),
      budget._id, budget .end, line, 'End'
    );
    this._view .addButton ('Delete Budget', () => {
      if (this._budgets .length > 1) {
        let html = this._configTabs .find ('> ._tabGroupContents > ._content._selected > ._contentGroup > ._tabGroup > ._tabGroupContents > ._content._selected');
        this._view .addConfirmDelete (html, budget._id, 'budget', {left: -50})
      }
    }, this._view .addLine (budgetContent));
    this._view .setButtonDisabled (budgetTabs, this._budgets .filter (b => {return b._id != budget._id}) .length == 0);
    if (select)
      this._view .selectTab (budgetTab);
  }

  /**
   * Add Configurations Edit (config and budget) to the view
   */
  async _addConfigEdit (ae) {
    let configGroup = this._view .addGroup ('Configurations', ae, '_dark');
    this._configs = this._sortByName (await this._configModel .find ({deleted: null}));
    this._configTabs = this._view .addTabGroup ('configurations', configGroup);
    this._view .addTab (this._configTabs, '_add', true, 'Add');
    let cid = this._cid;
    for (let c of this._configs) {
      this._cid = c._id
      this._setModelsForConfig();
      await this._addConfig (c, c._id == cid);
    }
    this._cid = cid;
    this._setModelsForConfig();

  }

  /**
   * Update profile model based on user input and "Update Profile" button click
   */
  async _updateAccount (values) {
    let [email, oldPassword, newPassword, confirmPassword, name] = values;
    email = email .toLowerCase();
    let update   = {username: email == this._username? undefined: email, name: name};
    let password = undefined;
    if (newPassword) {
      if (newPassword != confirmPassword) {
        this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; New and confirm passwords do not match');
        return;
      } else {
        password         = oldPassword;
        update .password = newPassword;
      }
    }
    let result = await Model .updateUser (this._uid, this._accessCap, update, password);
    if (result .passwordMismatch)
      this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; Old password does not match');
    else if (result .alreadyExists)
      this._view .setLabel (this._accountEditError, 'Profile not updated &mdash; Another user with that email already exists');
    if (result .ok) {
      this._username = email;
      this._name     = name;
      if (this._onLabelChange)
        this._onLabelChange (this .getLabel())
      this._updateCookie();
      this._view .setLabel (this._accountEditError, 'Profile Updated');
    }
  }

  /**
   * Create a new empty configuration
   */
  async _createEmptyConfig (type, encryptionPassword, name = 'Untitled') {
    await this._disconnectApp();
    User_DB_Crypto = type == ConfigType .CLOUD_ENCRYPTED && new Crypto (encryptionPassword);
    this._cid = (await this._configModel .insert ({
      user:    this._uid,
      name:    name,
      type:    type,
      keyTest: type == ConfigType .CLOUD_ENCRYPTED && ConfigKeyTest
    }))._id;
    if (type == ConfigType .CLOUD_ENCRYPTED) {
      localStorage .setItem ('encryptionPassword_' + this._cid, encryptionPassword);
      this._view .updateConfigEncryptionPassword (this._cid, encryptionPassword);
    }
    await Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
    this._setModelsForConfig();

    let pm = new Model ('parameters', this .getDatabaseName());
    let am = new Model ('accounts',   this .getDatabaseName());
    await pm .insert ({name: 'rates', apr: 575, inflation: 225, presentValue: true, futureYears: 40});
    await am .insert ({type: AccountType .GROUP, name: 'Bank Accounts', form: AccountForm .CASH_FLOW, sort: 1});
    await am .insert ({type: AccountType .GROUP, name: 'Credit Cards', form: AccountForm .CASH_FLOW, sort: 2});
    await am .insert ({type: AccountType .GROUP, name: 'Cash', form: AccountForm .CASH_FLOW, sort: 3});
    await am .insert ({type: AccountType .GROUP, name: 'Investments', form: AccountForm .ASSET_LIABILITY, sort: 4});
    await am .insert ({type: AccountType .GROUP, name: 'Home Equity', form: AccountForm .ASSET_LIABILITY, sort: 5});
    await am .insert ({type: AccountType .GROUP, name: 'Salary', form: AccountForm .INCOME_SOURCE, sort: 6});
    pm .delete();
    am .delete();

    this._budgets = [];
    await this._createEmptyBudget();
    await this._selectConfig (this._cid);
    await this._notifyApp();
  }

  /**
   * Create a new config by copying from specified config
   */
  async _copyConfig (type, encryptionPassword, from) {
    await this._disconnectApp();
    let fromConfig = this._configs .find (c => {return c._id == from});
    let to = (await this._configModel .insert ({
      user:    this._uid,
      name:    'Copy of ' + fromConfig .name,
      type:    type
    })) ._id;
    let ec = localStorage .getItem ('encryptionPassword_' + from);
    let okayToCopyAtServer =
      (fromConfig .type != ConfigType .CLOUD_ENCRYPTED && type != ConfigType .CLOUD_ENCRYPTED) ||
      (fromConfig .type == ConfigType .CLOUD_ENCRYPTED && type == ConfigType .CLOUD_ENCRYPTED && encryptionPassword == ec);

    this._view .addPleaseWait();

    if (okayToCopyAtServer) {
      await Model .copyDatabase (this .getDatabaseName (from), this .getDatabaseName (to));
      this._cid = to;
      this._setModelsForConfig();
      await this._configModel .find({});

    } else {
      const tables = [
        'accounts', 'actuals', 'actualsMeta', 'balanceHistory', 'budgets', 'categories', 'counters',
        'importRules', 'parameters', 'rateFuture', 'schedules', 'taxParameters', 'transactions'
      ];
      this._cid = from;
      this._setModelsForConfig();
      let data = await Promise .all (tables .map (async t => {
        let m = new Model (t, this .getDatabaseName());
        let d = await m .find();
        m .delete();
        return {table: t, data: d};
      }));
      User_DB_Crypto = type == ConfigType .CLOUD_ENCRYPTED && new Crypto (encryptionPassword);
      this._cid = to;
      this._setModelsForConfig();
      for (let d of data) {
        let m = new Model (d .table + '$RAW', this .getDatabaseName());
        await m .insertList (d .data);
        m .delete();
      }
    }

    if (type == ConfigType .CLOUD_ENCRYPTED) {
      await this._configModel .update (this._cid, {keyTest: ConfigKeyTest});
      localStorage .setItem ('encryptionPassword_' + this._cid, encryptionPassword);
      this._view .updateConfigEncryptionPassword (this._cid, encryptionPassword);
    }

    await Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
    await this._selectConfig (this._cid);
    for (let budget of this._budgets)
      await this._onBudgetModelChange (ModelEvent .INSERT, budget);
    this._selectBudget (this._budgets [0]._id);
    this._view .removePleaseWait();
    await this._notifyApp();
  }

  /**
   * Create and initialize an empty budget
   *    XXX UNRESOLVED: What happens when you create a new budget for an existing period
   *    and there are transactions for that period with categories that are not part of
   *    default list?  These transactions will not be part of actuals.  There is a related
   *    problem with changing budget dates.
   */
  async _createEmptyBudget (notifyApp) {
    await this._disconnectApp();
    let y  = Types .date._year (Types .date .today());
    let b  = await this._budgetModel .insert({
      name:             this._budgets && this._budgets .length? 'Untitled': 'Default',
      start:            Types .date._date (y,  1,  1),
      end:              Types .date._date (y, 12, 31),
    });
    this._budgets = this._sortByName (await this._budgetModel .find());
    let cm = new Model ('categories', this .getDatabaseName());
    let sm = new Model ('schedules',  this .getDatabaseName());
    let roots = [
      ['Spending',    false, false],
      ['Savings',     true,  false],
      ['Income',      true,  true],
      ['Withdrawals', false, true],
      ['Suspense',    false, false]
    ]
    let rootCats = await Promise .all (roots .map (async (root, index) => {
      let cat = await cm .find ({name: root[0], parent: null})
      if (cat .length > 0) {
        cat = cat [0];
        await cm .update (cat._id, {budgets: cat .budgets .concat (b._id)})
      } else
        cat = await cm .insert({
          name:    root[0],
          goal:    root[1],
          credit:  root[2],
          parent:  null,
          budgets: [b._id],
          sort:    index + 1,
        })
      return cat;
    }));
    await this._budgetModel .update (b._id, {
      expenseCategory:     rootCats [0]._id,
      savingsCategory:     rootCats [1]._id,
      incomeCategory:      rootCats [2]._id,
      withdrawalsCategory: rootCats [3]._id,
      suspenseCategory:    rootCats [4]._id
    });
    let defaultCategories = [
      {parent: rootCats [0]._id, list: [
        'Food', 'Alcohol', 'Housing', 'Utilities', 'Household', 'Children', 'Health & Personal', 'Transportation', 'Subscriptions',
        'Gifts', 'Recreation', 'Travel', 'Furniture & Equipment', 'Home Improvement'
      ]},
      {parent: rootCats [2]._id, list: [
        'Salary', 'Other Income'
      ]},
      {parent: rootCats [4]._id, list: [
        'Transfer', 'Reimbursed'
      ]}
    ]
    for (let group of defaultCategories) {
      let sort = 0;
      group .cats = []
      for (let name of group .list) {
        let cat = await cm .find ({name: name, parent: group .parent, budgets: b._id});
        if (cat .length > 0) {
          cat = cat [0];
          await cm .update (cat._id, {budgets: cat .budgets .concat (b._id)});
        } else
          cat = await cm .insert ({name: name, parent: group .parent, sort: sort++, budgets: [b._id]})
        group .cats .push (cat);
      }
    }
    let cats = defaultCategories .reduce ((cats, group) => {return cats .concat (group .cats)}, [])
      .concat (defaultCategories .map (group => {return group .parent}));
    for (let cat of cats)
      await sm .insert ({category: cat._id, budget: b._id});
    cm .delete();
    sm .delete();
    this._selectBudget (b._id);
    if (notifyApp)
      await this._notifyApp();
  }

  /**
   * Add a new budget that is copied from specified budget
   */
  async _createBudgetCopy (from) {
    await this._disconnectApp();
    let newBudget = await Model .copyBudget (from);
    this._budgets .push (newBudget);
    await this._onBudgetModelChange (ModelEvent .INSERT, newBudget);
    this._selectBudget (newBudget._id);
    await this._notifyApp();
  }

  /**
   * Add a new budget and related categories and schedules to model by rolling specified budget over to new year
   */
  async _createRolloverBudget (from) {
    // TODO this could move to server, unclear if necessary / better
    await this._disconnectApp();
    let b = Object .assign ({}, this._budgets .find (b => {return b._id == from}));
    b .start = Types .date .addYear (b .start, 1);
    b .end   = Types .date .addYear (b .end,   1);
    b .name  = BudgetModel .getLabelForDates (b .start, b .end);
    b._id    = undefined;
    b = await this._budgetModel .insert (b);
    this._budgets = this._sortByName (await this._budgetModel .find())
    let cm = new Model ('categories', this .getDatabaseName());
    let sm = new Model ('schedules',  this .getDatabaseName());
    let fc = (await cm .find ({budgets: from})) .reduce ((m,c) => {m .set (c._id, c); return m}, new Map());
    for (let c of fc .values()) {
      let parent = c .parent && fc .get (c .parent);
      if (parent)
        parent .children = (parent .children || []) .concat (c);
    }
    let fs = await sm .find ({budget: from});

    // get new schedule
    let ts = [];
    for (let sch of fs || []) {

      if (! Types .date .isBlank (sch .start) && fc .get (sch .category)) {
        let fy  = Types .date .isYear (sch .start)? sch.start: Types .dateFY._fiscalYear (sch .start, b .start, b .end);
        let c   = Types .date._year (b .start) - fy;
        sch._id = undefined;

        if (c <= 0) {
          ts .push (sch);

        } else if (Types .date .isYear (sch .start)) {
          if (sch .repeat && (! sch .limit || sch .limit >= c)) {
            sch .start += c;
            if (sch .limit) {
              sch .limit -= c;
              sch .repeat = sch .limit > 0;
            }
            ts .push (sch);
          }

        } else if (Types .date .isInfinity (sch .end)) {
          sch .start = b .start;
          ts .push (sch);


        } else {
          if ((sch .repeat && (! sch .limit || sch .limit >= c)) || (sch .end >= b .start)) {
            sch .start = Types .date .addYear (sch .start, c);
            if (Types .date .isMonth (sch .end) && (sch .repeat && (! sch .limit || sch .limit >= c)))
              sch .end = Types .date .addYear (sch .end,   c);
            if (sch .limit) {
              sch .limit -= c;
              sch .repeat = sch .limit > 0;
            }
            ts .push (sch)
          }
        }
       }
    }

    // get new categories
    let tc = new Set();
    let addCat = id => {
      if (id) {
        tc .add (id);
        addCat (fc .get (id) .parent);
      }
    }
    let addCatAndDescendants = id => {
      addCat (id);
      for (let c of fc .get (id) .children || [])
        addCatAndDescendants (c._id);
    }
    for (let sch of ts || [])
      addCat (sch .category);

    // add no-budget categories descendants
    let bc = fs .filter (s => {return ! Types .date .isBlank (s .start)}) .reduce ((s, sch) => {s .add (sch .category); return s}, new Set());
    let hasNoBudget = cats => {
      return ((cats || []) .length == 0) || (! cats .find (cat => {return bc .has (cat._id) || (! hasNoBudget (cat .children))}))

    }
    for (let cid of tc) {
      for (let cat of fc .get (cid) .children || [])
        if (hasNoBudget ([cat]))
          addCatAndDescendants (cat._id);
    }

    // ensure that all categories have a schedule
    let tsc = ts .reduce ((s,sch) => {s .add (sch .category); return s}, new Set());
    for (let cid of tc .keys())
      if (! tsc .has (cid))
        ts .push ({
          amount:   0,
          category: cid,
          limit:    0,
          repeat:   true,
          sort:     0,
          start:    ''
        });

    // set budget for schedules
    for (let sch of ts)
      sch .budget = b._id;

    // update the models
    let updateList = []
    for (let cid of Array .from (tc .keys()))
      updateList .push ({
        id:     cid,
        update: {
          budgets: fc .get (cid) .budgets .concat (b._id)
        }
      })
    let catUpdate = cm .updateList (updateList);
    let schInsert = sm .insertList (ts);
    await catUpdate;
    await schInsert;

    // finish
    cm .delete();
    sm .delete();
    await this._selectBudget (b._id);
    await this._notifyApp();
  }

  /**
   * Delete specified configuration
   */
  async _deleteConfig (id) {
    await this._disconnectApp();
    await this._configModel .update (id, {deleted: Types .date .today()});
    let psn = this._configs .findIndex (c => {return c._id == id});
    this._configs .splice (psn, 1);
    await this._selectConfig (this._configs [Math .max (0, psn - 1)] ._id);
    this._view .selectTab (this._getConfigTab (this._cid));
    this._view .selectTab (this._getBudgetTab (this._bid));
    this._view .setButtonDisabled (this._configTabs, this._configs .length == 1);
    await this._notifyApp();
  }

  /**
   * Delete specified budget and related categories and schedules from model
   */
  async _deleteBudget (id) {
    await this._disconnectApp();
    await Model .removeBudget (id);
    let psn = this._budgets .findIndex (b => {return b._id == id});
    this._budgets .splice (psn, 1);
    await this._onBudgetModelChange (ModelEvent .REMOVE, {_id: id});
    this._selectBudget (this._budgets [Math .max (0, psn - 1)] ._id);
    this._view .selectTab (this._getBudgetTab (this._bid));
    this._view .setButtonDisabled (this._getBudgetTabs(), this._budgets .length == 1);
    await this._notifyApp();
  }
}


UserEvent = {
  NEW_USER: 0,
  DISCONNECT: 1,
  NEW_CONFIGURATION: 2,
  LOGOUT: 3
}
