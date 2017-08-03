$(document) .ready (() => {
  let app = new App();
  app .start();
});

class App {

  start() {
    ui .ModalStack .init();
    this._user = new User();
    this._user .addObserver (null, e => {async (this, this._configurationChange) (e)});
    this._user .login();
  }

  _deleteModels() {
    for (let model of this._models || [])
      model .delete();
    this._models = [];
  }

  *_configurationChange (eventType) {
    if (eventType == UserEvent .NEW_CONFIGURATION) {

      /* models */
      Model .setDatabase (this._user .getDatabaseName());
      this._deleteModels();
      this._budModel = new BudgetModel   ();
      this._actModel = new ActualsModel  (this._budModel);
      this._varModel = new VarianceModel (this._budModel, this._actModel);
      this._accModel = new AccountsModel ();
      this._models   = [this._budModel, this._actModel, this._varModel, this._accModel];

      /* queries */
      this._accounts = this._accModel .find();
      yield* this._budModel .find (this._user .getBudgetId());
      yield* this._actModel .find ();
      yield* this._accModel .find ();

      /* presenters */
      let it = new ImportTransactions   (this._accModel, this._varModel);
      let na = new Navigate             (this._accModel, this._varModel);
      let se = new IndexedScheduleEntry ('_CategoryMenu', '_ScheduleEntry', this._accModel, this._varModel);
      let or = new Organize             (this._accModel, this._varModel);

      /* tabs */
      let tabs = new ui.Tabs ($('body'));
      tabs .addTab  ('Progress',                         html => {na .addProgressHtml     (html)});
      tabs .addTab  ('Transactions',                     html => {async (it, it.addHtml)  (html)}, true);
      tabs .addTab  ('Activity',                         html => {na .addRealityHtml      (html)});
      tabs .addTab  ('Budget',                           html => {na .addPlanHtml         (html)});
      tabs. addTab  ('Plan',                             html => {se .addHtml             (html)});
      tabs .addTab  ('Perspective',                      html => {na .addPerspectiveHtml  (html)});
      tabs .addTab  ('Wealth',                           html => {na .addNetWorthHtml     (html)});
      tabs .addTab  ('Settings',                         html => {async (or, or .addHtml) (html)});
      let tl = tabs .addTool (this._user .getLabel (l => {
        tabs .changeToolName (tl, l);
      }), e => {this._user .showMenu    ($(e .target))})

      this._user .newConfigurationAccepted();

   } else if (eventType == UserEvent .LOGOUT) {
     $('body') .empty();
     this._user .login();
   }
  }
}//

