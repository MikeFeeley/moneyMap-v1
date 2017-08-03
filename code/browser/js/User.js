class User extends Observable {

  constructor() {
    super();
    this._view = new UserView();
    this._view .addObserver (null, (e,a) => {async (this, this._onViewChange) (e,a)});
  }

  *_onViewChange (eventType, arg) {
  
    switch (eventType) {
      case UserViewEvent .LOGIN:
        let login = yield* Model .login (arg .username, arg .password);
        if (login .noUser)
          this._view .loginError ('No user exists with that email');
        else if (login .badPassword)
          this._view .loginError ('Incorrect password');
        else {
          let user = login .user;
          this._uid        = user._id;
          this._accessCap  = user .accessCap;
          this._username   = user .username;
          this._name       = user .name;
          this._cid        = user .curConfiguration;
          this._setModelsForConfig();
          let config       = (yield* this._configModel .find ({_id: user .curConfiguration})) [0];
          this._configName = config .name;
          this._bid        = config .curBudget;
          this._addCookie();
          this._view .removeLogin();
          this._notifyObservers (UserEvent .NEW_CONFIGURATION);
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
          let signup = yield* Model .signup ({username: arg .username, password: arg .password, name: arg .name});
          if (signup .alreadyExists)
            this._view .loginError ('User already exists with that email');
          else {
            this._uid       = signup._id;
            this._accessCap = signup .accessCap;
            this._username  = arg .username;
            this._name      = arg .name;
            this._setModelsForConfig();
            this._configName = this._name;
            let config = yield* this._configModel .insert ({user: this._uid, name: 'Default'});
            this._cid = config._id;
            yield* Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
            this._setModelsForConfig();
            yield* this._initConfig();
            this._addCookie();
            this._view .removeLogin();
            this._notifyObservers (UserEvent .NEW_CONFIGURATION);
          }
        }
        break;
    }
  }

  newConfigurationAccepted() {
    this._addCookie();
  }

  _addCookie() {
    const pickle = ['_uid', '_accessCap', '_username', '_name', '_cid', '_bid', '_configName'];
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

  _tryCookie() {
    let cookie = document .cookie .split (';') .find (c => {return c .startsWith ('user={')});
    if (cookie) {
      let cv = JSON .parse (cookie .slice (5));
      for (let p in cv)
        this [p] = cv [p];
      this._setModelsForConfig();
      this._deleteCookie()
      this._notifyObservers (UserEvent .NEW_CONFIGURATION);
      return true;
    } else
      return false;
  }

  _deleteCookie() {
    document .cookie = 'user=; expires=Thu, 01 Jan 1970 00:00:00 UTC'
  }

  *_initConfig() {
    yield* this._initBudget();
    yield* this._configModel .update (this._cid, {curBudget: this._bid});
  }

  *_initBudget() {
    let y  = Types .date._year (Types .date .today());
    let b  = yield* this._budgetModel .insert({
      name:             'Default',
      start:            Types .date._date (y,  1,  1),
      end:              Types .date._date (y, 12, 31),
      startCashBalance: 0,
    });
    let cm = new Model ('categories', this .getDatabaseName());
    let exp = yield* cm .insert ({
      name: 'Spending',
      parent: null,
      sort: 1,
      budgets: [b._id]
    })
    let sav = yield* cm .insert ({
      name: 'Savings',
      parent: null,
      sort: 2,
      budgets: [b._id],
      goal: true
    })
    let inc = yield* cm .insert({
      name: 'Income',
      parent: null,
      sort: 3,
      budgets: [b._id],
      credit: true,
      goal: true
    })
    let sus = yield* cm .insert ({
      name: 'Suspense',
      parent: null,
      sort: 4,
      budgets: [b._id]
    })
    yield* this._budgetModel .update (b._id, {
      incomeCategory:   inc._id,
      savingsCategory:  sav._id,
      expenseCategory:  exp._id,
      suspenseCategory: sus._id
    })
    this._bid = b._id;
  }

  login () {
    if (!this._tryCookie ())
      this._view .addLogin ($('body'));
  }

  logout() {
    this._deleteCookie();
    this._uid = null;
    this._notifyObservers (UserEvent .LOGOUT);
  }

  getDatabaseName() {
    return 'config_' + this._cid + '_' + this._accessCap;
  }

  getLabel (onChange) {
    if (onChange)
      this._onLabelChange = onChange;
    return this._name;
  }

  getBudgetId() {
    return this._bid;
  }

  _addMenuItem (name, action) {
    this._view .addMenuItem (name, () => {this._view .removeMenu(); action()});
  }

  showMenu (toHtml) {
    let html = $('body');
    this._view .addMenu (html, {top: 48, right: 10}, toHtml, {top: 0, right: 10});
    this._addMenuItem ('Account', () => {async (this, this._showAccountEdit) ()});
    this._addMenuItem ('Logout',  () => {this .logout()});
  }

  _setModelsForConfig() {
    if (this._configModel)
      this._configModel .delete();
    if (this._budgetModel)
      this._budgetModel .delete();
    this._configModel = new Model ('configurations', 'user_' + this._uid + '_' + this .accessCap);
    this._budgetModel = new Model ('budgets',        this .getDatabaseName());
  }

  *_addAccountEdit() {
    let ae = this._view .addAccountEdit();
    this._addUserEdit   (ae);
    yield* this._addConfigEdit (ae);
  }

  _addUserEdit (ae) {
    let ag = this._view .addGroup ('Account', ae);
    let email    = this._view .addLine (ag);
    let password = this._view .addLine (ag);
    let name     = this._view .addLine (ag);
    let update   = this._view .addLine (ag);
    this._view .addLabel  ('Email',            email);
    this._view .addLabel  ('Password',         password);
    this._view .addLabel  ('Name',             name);
    this._view .addInput  ('Email',            this._username, email);
    this._view .addInput  ('Old Password',     '', password, 'password');
    this._view .addInput  ('New Password',     '', password, 'password');
    this._view .addInput  ('Confirm Password', '', password, 'password');
    this._view .addInput  ('Name',              this._name, name);
    this._view .addButton ('Update Account',   async (this, this._updateAccount), update);
    this._accountEditError = this._view .addLabel ('', update, '_errorMessage');
  }

  *_addConfigEdit (ae) {
    let configGroup = this._view .addGroup ('Configurations', ae, '_dark');
    let configs = yield* this._configModel .find ({});
    let configTabs = this._view .addTabGroup (configGroup);
    for (let c of configs) {
      let configTab = this._view .addTab (configTabs);
      this._view .addField (new ViewTextbox ('c_name', ViewFormats ('string'), '', '', 'Config Name'), c._id, c .name, configTab .tab);
      if (c._id == this._cid)
        this._view .setSelectedTab (configTab);
      let budgetContentGroup = this._view .addTabContentGroup ('Budgets', configTab .content);
      let budgetTabs = this._view .addTabGroup (budgetContentGroup);
      this._view .addButton ('Delete Configuration', () => {}, this._view .addLine (configTab .content));
      let budgets = yield* this._budgetModel .find ({})
      for (let b of budgets) {
        let budgetTab = this._view .addTab (budgetTabs);
        this._view .addField (
          new ViewTextbox ('b_name',  ViewFormats ('string'), '', '',  'Budget Name'),
          b._id, b .name, budgetTab .tab
        );
        let line = this._view .addLine (budgetTab .content);
        this._view .addField (
          new ViewTextbox ('b_start', ViewFormats ('dateDMY'), '', '', 'Start Date'),
          b._id, b .start, line, 'Start'
        );
        this._view .addField (
          new ViewTextbox ('b_end',   ViewFormats ('dateDMY'), '', '', 'End Date'),
          b._id, b .end, line, 'End'
        );
        this._view .addButton ('Delete Budget', () => {}, this._view .addLine (budgetTab .content));
        if (b._id == this._bid)
          this._view .setSelectedTab (budgetTab);
      }
      let budgetTab = this._view .addTab (budgetTabs, '_add', true, 'Add');
    }
    let configTab = this._view .addTab (configTabs, '_add', true, 'Add');
  }

  *_updateAccount(values) {
    let [email, oldPassword, newPassword, confirmPassword, name] = values;
    email = email .toLowerCase();
    let update   = {username: email == this._username? undefined: email, name: name};
    let password = undefined;
    if (newPassword) {
      if (newPassword != confirmPassword) {
        this._view .setLabel (this._accountEditError, 'Account not updated &mdash; New and confirm passwords do not match');
        return;
      } else {
        password         = oldPassword;
        update .password = newPassword;
      }
    }
    let result = yield* Model .updateUser (this._uid, this._accessCap, update, password);
    if (result .passwordMismatch)
      this._view .setLabel (this._accountEditError, 'Account not updated &mdash; Old password does not match');
    else if (result .alreadyExists)
      this._view .setLabel (this._accountEditError, 'Account not updated &mdash; Another user with that email already exists');
    if (result .ok) {
      this._username = email;
      this._name     = name;
      if (this._onLabelChange)
        this._onLabelChange (this .getLabel())
      this._updateCookie();
      this._view .setLabel (this._accountEditError, 'Account Updated');
    }
  }

  *_showAccountEdit() {
    yield* this._addAccountEdit();
  }
}

UserEvent = {
  NEW_USER: 0,
  NEW_CONFIGURATION: 1,
  LOGOUT: 0
}
