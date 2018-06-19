const APP_VERSION_HASH   = 'cd94979';
const APP_VERSION_STRING = '1.0.0-beta (' + APP_VERSION_HASH + ')';

const INIT_browserIsCompatible = navigator .appCodeName .includes ('Mozilla') && Number (navigator .appVersion .split (' ') [0]) >= 5.0;

const INIT = {
  version: APP_VERSION_HASH,
  cacheAssets: false,
  js: [
    'ui',
    'util',
    'Crypto',
    'LocalDB',
    'DBAdaptor',
    'TransactionDBMeta',
    'LocalDBAdaptor',
    'RemoteDBAdaptor',
    'Model',
    'CSVConverter',
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
  css: [
    'budget',
    'ui',
    'ScheduleEntry',
    'TransactionTable'
  ],
  'lib/css':    [
    'jquery-ui',
    'nouislider.min',
    'lnr-icons'
  ],
  'lib/js':     [
    'jquery',
    'jquery-ui',
    'jquery.mjs.nestedSortable',
    'Chart',
    'papaparse',
    'nouislider.min',
    'jszip.min'
  ]
};

const INIT_loadSteps = ['lib/js', 'lib/css', 'css', 'js'];

const INIT_cacheIsValid = INIT .cacheAssets && localStorage .getItem ('INIT_version') == INIT .version;

async function INIT_loadFile (url) {
  return new Promise ((resolve, reject) => {
    const request = new XMLHttpRequest();
    request .open ('GET', url);
    request .responseType = 'text';
    request .onload = () => {
      if (request .status == 200) {
        if (INIT .cacheAssets)
          localStorage .setItem (url, request .responseText);
        else
          localStorage .removeItem (url);
        resolve (request .responseText);
      } else
        reject ('Status ' + request .status + ': ' + request .statusText + (request .responseText? ' -- ' + request .responseText: ''));
    }
    request .onerror = e => reject (e);
    request .send();
  })
}

async function INIT_loadScript (url) {
  const text = (INIT_cacheIsValid && localStorage .getItem (url)) || await INIT_loadFile (url);
  const script = document .createElement ('SCRIPT');
  script .text = text;
  document .getElementsByTagName ('head') [0] .appendChild (script);
}

const mmm = new Map();

async function INIT_loadStyle (url) {
  const text = (INIT_cacheIsValid && localStorage .getItem (url)) || await INIT_loadFile (url);
  const style = document .createElement ('STYLE');
  style .appendChild (document .createTextNode (text));
  style .type = 'text/css';
  document .getElementsByTagName ('head') [0] .appendChild (style);
}

(async function () {
    for (const step of INIT_loadSteps)
      for (const file of INIT [step])
        if (step .includes ('js')) {
          const url = step + '/' + file + '.js';
          try {
            await INIT_loadScript (url);
          } catch (e) {
            console .log ('Error while loading ' + url + '.  ' + e);
            throw (e);
          }
        } else if (step .includes ('css')) {
          const url = step + '/' + file + '.css';
          try {
            await INIT_loadStyle (url);
          } catch (e) {
            console .log ('Error while loading ' + url + '.  ' + e);
            throw (e);
          }
        }
    if (INIT .cacheAssets)
      localStorage .setItem ('INIT_version', INIT .version);
    else
      localStorage .removeItem ('INIT_version');
}) ();

