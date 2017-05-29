var express = require('express');
var router = express.Router();

router.get('/', function(req, res, next) {
  res.render('app', {
    title: 'moneyMap',
    jss: [
      'async',
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
      'TransactionHUD',
      'ScheduleEntryView',
      'ScheduleEntry',
      'IndexedScheduleEntry',
      'ImportRulesModel',
      'ImportRules',
      'ImportRulesView',
      'ImportTransactions',
      'ImportTransactionsView',
      'Navigate',
      'NavigateView',
      'Organize',
      'OrganizeView',
      'app'
      ],
    jsurls: [],
    csss: [
      'budget',
      'ui',
      'ScheduleEntry',
      'TransactionTable'
    ],
    libcsss:    ['jquery-ui'],
    libjss:     [
      'jquery',
      'jquery-ui',
      'jquery.mjs.nestedSortable',
      'Chart',
      'papaparse'
    ],
    initScript: "var __DATABASE__ = '" + (req .body .database?  req .body .database: '') + "';"
  });
});

module.exports = router;
