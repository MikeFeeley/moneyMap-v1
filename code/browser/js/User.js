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
          this._view .loginError ('No user exists with that email address');
        else if (login .badPassword)
          this._view .loginError ('Incorrect password');
        else {
          let user = login .user;
          if (this._configModel)
            this._configModel .delete()
          this._configModel = new Model ('configurations', 'user_' + user._id + '_' + user .accessCap);
          let config       = (yield* this._configModel .find ({_id: user .curConfiguration})) [0];
          this._uid        = user._id;
          this._accessCap  = user .accessCap;
          this._username   = user .username;
          this._name       = user .name;
          this._cid        = user .curConfiguration;
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
          this._view .loginError ('Email address can not be blank');
        else if (arg .name .length == 0)
          this._view .loginError ('Name can not be blank');
        else if (arg .password .length == 0)
          this._view .loginError ('Password can not be blank');
        else if (arg .password != arg .confirm)
          this._view .loginError ('Passwords do not match');
        else {
          let signup = yield* Model .signup ({username: arg .username, password: arg .password, name: arg .name});
          if (signup .alreadyExists)
            this._view .loginError ('User already exists with that email address');
          else {
            this._uid       = signup._id;
            this._accessCap = signup .accessCap;
            this._username  = arg .username;
            this._name      = arg .name;
            if (this._configModel)
              this._configModel .delete();
            this._configModel = new Model ('configurations', 'user_' + signup._id + '_' + signup .accessCap);
            this._configName = this._name;
            let config = yield* this._configModel .insert ({user: this._uid, name: this._configName});
            this._cid = config._id;
            yield* this._initConfig();
            yield* Model .updateUser (this._uid, this._accessCap, {curConfiguration: this._cid});
            this._addCookie();
            this._view .removeLogin();
            this._notifyObservers (UserEvent .NEW_CONFIGURATION);
          }
        }
        break;
    }
  }

  _addCookie() {
    const pickle = ['_uid', '_accessCap', '_username', '_name', '_cid', '_bid', '_configName'];
    let   expiry = new Date();
    expiry .setTime (expiry .getTime() + (1000 * 24 * 60 * 60 * 1000));
    document .cookie =
      'user='    + JSON .stringify (pickle .reduce ((o,p) => {o [p] = this [p]; return o}, {})) + '; ' +
      'expires=' + expiry .toUTCString()
  }

  _tryCookie() {
    let cookie = document .cookie .split (';') .find (c => {return c .startsWith ('user={')});
    if (cookie) {
      let cv = JSON .parse (cookie .slice (5));
      for (let p in cv)
        this [p] = cv [p];
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
    let bm = new Model ('budgets', this .getDatabaseName());
    let y  = Types .date._year (Types .date .today());
    let b  = yield* bm .insert({
      name:             this._username,
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
    yield* bm .update (b._id, {
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

  getConfigurationName() {
    return this._configName;
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
    this._addMenuItem ('Account', () => {});
    this._addMenuItem ('Logout',  () => {this .logout()});
  }

  addAccountEdit (toHtml) {

  }
}

UserEvent = {
  NEW_USER: 0,
  NEW_CONFIGURATION: 1,
  LOGOUT: 0
}
