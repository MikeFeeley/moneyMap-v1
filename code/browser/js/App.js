window.addEventListener ("error",              e => {console .log (e .error)});
window.addEventListener ("unhandledrejection", e => {console .log (e .reason)});

$(document) .ready (() => {
  let app = new App();
  (async () => {await app .start()}) ();
});

class App {

  async start() {
    ui .ModalStack .init();
    this._user = new User();
    this._user .addObserver (this, this._configurationChange);
    this._user .login();
  }

  _deleteModels() {
    for (let model of this._models || [])
      model .delete();
    this._models = [];
  }

  async _configurationChange (eventType) {

    let handleNameClick = e => {
      this._prefs .showMenu ($(e .target));
    }
  
    if (eventType == UserEvent .NEW_USER) {

      this._tabs = new ui.Tabs ($('body'), handleNameClick);
      this._proT = this._tabs .addTab  ('Progress');
      this._traT = this._tabs .addTab  ('Transactions');
      this._actT = this._tabs .addTab  ('Activity');
      this._budT = this._tabs .addTab  ('Budget');
      this._plaT = this._tabs. addTab  ('Plan');
      this._perT = this._tabs .addTab  ('Perspective');
      this._weaT = this._tabs .addTab  ('Wealth');
      this._accT = this._tabs .addTab  ('Accounts');
      let tl = this._tabs .addTool (this._user .getLabel (l => {
        this._tabs .changeToolName (tl, l);
      }), e => {this._user .showMenu ($(e .target))})
    }

    if (eventType == UserEvent .NEW_USER || eventType == UserEvent .NEW_CONFIGURATION) {

      /* models */
      Model .setDatabase (this._user .getDatabaseName());
      this._deleteModels();
      this._budModel = new BudgetModel   ();
      this._accModel = new AccountsModel ();
      this._actModel = new ActualsModel  (this._budModel, this._accModel);
      this._varModel = new VarianceModel (this._budModel, this._actModel);
      this._prefs    = new Preferences();
      this._models   = [this._budModel, this._actModel, this._varModel, this._accModel, this._prefs];

      /* queries */
      this._accounts = this._accModel .find();
      await this._budModel .find (this._user .getBudgetId(), this._actModel);
      await this._actModel .findCurrent();
      await this._accModel .find();
      await this._prefs    .init();

      /* presenters */
      if (this._it) {
        this._it .delete();
        this._na .delete();
        this._se .delete();
        this._ac .delete();
      }
      this._it = new ImportTransactions   (this._accModel, this._varModel);
      this._na = new Navigate             (this._accModel, this._varModel);
      this._na .prime();
      this._se = new IndexedScheduleEntry ('_CategoryMenu', '_ScheduleEntry', this._accModel, this._varModel);
      this._ac = new Accounts             (this._accModel, this._budModel);

      /* tabs */
      this._tabs .setTab  (this._proT, html => {this._na .addProgressHtml     (html)});
      this._tabs .setTab  (this._traT, html => {this._it .addHtml             (html)}, true);
      this._tabs .setTab  (this._actT, html => {this._na .addRealityHtml      (html)});
      this._tabs .setTab  (this._budT, html => {this._na .addPlanHtml         (html)});
      this._tabs. setTab  (this._plaT, html => {this._se .addHtml             (html)});
      this._tabs .setTab  (this._perT, html => {this._na .addPerspectiveHtml  (html)});
      this._tabs .setTab  (this._weaT, html => {this._na .addNetWorthHtml     (html)});
      this._tabs .setTab  (this._accT, html => {this._ac .addHtml             (html)});

      this._user .newConfigurationAccepted();

   } else if (eventType == UserEvent .LOGOUT) {
     $('body') .empty();
     (async () => {await this._user .login()}) ();
   }
  }
}

