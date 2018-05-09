var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('app', {
    title: 'moneyMap',
    jss: [
      'ui',
      'util',
      'Crypto',
      'DBAdaptor',
      'LocalDBAdaptor',
      'RemoteDBAdaptor',
      'Model',
      'View',
      'Presenter',
      'TaxTables',
      'AccountsModel',
      'ActualsModel',
      'BudgetModel',
      'VarianceModel',
      'CategoriesModel',
      'SchedulesModel',
      'TransactionModel',
      'BudgetYearGraph',
      'BudgetProgressGraph',
      'BudgetProgressHUD',
      'BudgetProgressHUDView',
      'CategoryPicker',
      'CategoryPickerView',
      'TupleView',
      'TuplePresenter',
      'SortedTupleView',
      'SortedTuplePresenter',
      'TableView',
      'Table',
      'ListView',
      'List',
      'IndexedListView',
      'IndexedList',
      'AccountBalance',
      'AccountBalanceView',
      'Accounts',
      'AccountsView',
      'TransactionTable',
      'TransactionTableView',
      'ImportRulesModel',
      'ImportRules',
      'ImportRulesView',
      'ImportTransactions',
      'ImportTransactionsView',
      'TransactionHUD',
      'Preferences',
      'PreferencesView',
      'ScheduleEntryView',
      'ScheduleEntry',
      'IndexedScheduleEntry',
      'Navigate',
      'NavigateView',
      'UserView',
      'User',
      'App'
      ],
    jsurls: [],
    csss: [
      'budget',
      'ui',
      'ScheduleEntry',
      'TransactionTable'
    ],
    libcsss:    [
      'jquery-ui',
      'nouislider',
      'lnr-icons'
    ],
    libjss:     [
      'jquery',
      'jquery-ui',
      'jquery.mjs.nestedSortable',
      'Chart',
      'papaparse',
      'nouislider',
    ],
    initScript: "var __DATABASE__ = '" + (req .body .database?  req .body .database: '') + "';"
  });
});

module.exports = router;
