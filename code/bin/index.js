var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('app', {
    title: 'moneyMap',
    jss: [
      'ui',
      'util',
      'DBAdaptor',
      'LocalDBAdaptor',
      'RemoteDBAdaptor',
      'Model',
      'View',
      'Presenter',
      'AccountsModel',
      'AccountBalanceModel',
      'ActualsModel',
      'BudgetModel',
      'VarianceModel',
      'CategoriesModel',
      'SchedulesModel',
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
      'TransactionTable',
      'TransactionTableView',
      'ImportRulesModel',
      'ImportRules',
      'ImportRulesView',
      'ImportTransactions',
      'ImportTransactionsView',
      'TransactionHUD',
      'ScheduleEntryView',
      'ScheduleEntry',
      'IndexedScheduleEntry',
      'Navigate',
      'NavigateView',
      'Organize',
      'OrganizeView',
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
      'nouislider'
    ],
    libjss:     [
      'jquery',
      'jquery-ui',
      'jquery.mjs.nestedSortable',
      'Chart',
      'papaparse',
      'nouislider'
    ],
    initScript: "var __DATABASE__ = '" + (req .body .database?  req .body .database: '') + "';"
  });
});

module.exports = router;
