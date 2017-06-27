$(document) .ready (() => {
  async (main) ();
});

function* main() {
  Model .setDatabase (__DATABASE__ || 'production');

  // Models
  var budModel;
  var actModel;
  var varModel;
  var accModel;

  // Queries
  var accounts;

  // Presenters
  var na, se, it, or;
  var cols = ['date','payee','debit','credit','account','category','description'];
  var tsort = (a,b) => {return a .date < b .date? -1: a .date == b .date? 0: 1};

  var tabs;

  var setBudget = function* (budget) {

    ui .ModalStack .init();
  
    for (let e of [budModel, accModel, varModel, accModel, accounts, na, se, it])
      if (e && e .delete)
        e .delete();

    budModel = new BudgetModel   ();
    actModel = new ActualsModel  (budModel);
    varModel = new VarianceModel (budModel, actModel);
    accModel = new AccountsModel ();

    // Queries
    accounts = accModel .find ();
    yield* budModel .find ({name: budget});
    yield* actModel .find ();
    yield* accModel .find ();

    // Presenters
    na = new Navigate (accModel, varModel);
    se = new IndexedScheduleEntry ('_CategoryMenu', '_ScheduleEntry', accModel, varModel);
    it = new ImportTransactions (accModel, varModel);
    or = new Organize (accModel, varModel);

// this exists for changing budgets ... will redo soon
//    if (tabs) {
//      tabs .updateTab ('Navigate', html => {
//        async (na, na .addHtml) (html);
//      });
//      tabs .updateTab ('Categorize', html => {
//        async (it, it.addHtml) (html);
//      })
//      tabs. updateTab ('Plan', html => {
//        se .addHtml (html);
//      });
//      tabs .updateTab ('Organize', html => {
//        async (or, or .addHtml) (html);
//      })
//    }
  }

  yield* setBudget ('2016/7');

  // Tabs
  tabs = new ui.Tabs ($('body'));

  tabs .addTab ('Progress', html => {
    na .addProgressHtml (html);
  })

  tabs .addTab ('Transactions', html => {
    async (it, it.addHtml) (html);
  }, true);

  tabs .addTab ('Activity', html => {
    na .addRealityHtml (html);
  })

  tabs .addTab ('Budget', html => {
    na .addPlanHtml (html);
  })

  tabs. addTab ('Plan', html => {
    se .addHtml (html);
  });

  tabs .addTab ('Perspective', html => {
    async (na, na .addPerspectiveHtml) (html);
  })

  tabs .addTab ('Wealth', html => {
    async (na, na .addNetWorthHtml) (html);
  })

  tabs .addTab ('Settings', html => {
    async (or, or .addHtml) (html);
  });

  var budgetSetter = $('<span>', {text: '2016/7'}) .click (e => {
    if (budgetSetter .text() == '2015/6')
      budgetSetter .text ('2016/7');
    else
      budgetSetter .text ('2015/6');
    async (null, setBudget) (budgetSetter .text());
  })
  tabs .addTool (budgetSetter);
}

