const APP_VERSION_HASH   = '470ee95';
const APP_VERSION_STRING = '1.0.0-beta (' + APP_VERSION_HASH + ')';

const INIT_browserIsCompatible = navigator .appCodeName .includes ('Mozilla') && Number (navigator .appVersion .split (' ') [0]) >= 5.0;

const INIT = {
  version: APP_VERSION_HASH,
  cacheResources: false,
  resources: {
     'lib/css':    [
      'jquery-ui',
      'nouislider.min',
      'lnr-icons'
    ],
    css: [
      'budget',
      'ui',
      'ScheduleEntry',
      'TransactionTable'
    ],
    'lib/js':     [
      'jquery',
      'jquery-ui',
      'jquery.mjs.nestedSortable',
      'Chart',
      'papaparse',
      'nouislider.min',
      'jszip.min'
    ],
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
      'PinnedCategories',
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
      'ImportFormatView',
      'ImportFormat',
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
    ]
  }
};

const INIT_cacheIsValid = INIT .cacheResources && localStorage .getItem ('INIT_version') == INIT .version;

async function INIT_loadFile (url, binary) {
  return new Promise ((resolve, reject) => {
    const request = new XMLHttpRequest();
    request .open ('GET', url);
    request .responseType = 'text';
    request .onload = () => {
      if (request .status == 200) {
        if (binary) console.log(request);
        if (INIT .cacheResources)
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
  const script = document .createElement ('SCRIPT');
  if (INIT .cacheResources) {
    const text = (INIT_cacheIsValid && localStorage .getItem (url)) || await INIT_loadFile (url);
    script .text = text;
  } else {
    script .src   = url;
    script .async = false;
  }
  document .head .appendChild (script);
}

async function INIT_loadStyle (url) {
  if (INIT .cacheResources) {
    const text = (INIT_cacheIsValid && localStorage .getItem (url)) || await INIT_loadFile (url);
    const style = document .createElement ('STYLE');
    style .appendChild (document .createTextNode (text));
    style .type = 'text/css';
    document .head .appendChild (style);
  } else {
    const link = document .createElement ('LINK');
    link .rel = 'stylesheet';
    link .href = url;
    document .head .appendChild (link);
  }
}

(async function () {
    for (const step of Object .keys (INIT .resources))
      for (const file of INIT .resources [step])
        try {
          if (step .includes ('js'))
            await INIT_loadScript (step + '/' + file + '.js');
          else if (step .includes ('css'))
            await INIT_loadStyle (step + '/' + file + '.css');
        } catch (e) {
          console .log ('Error while loading ' + url + '.  ' + e);
          throw (e);
        }
  if (INIT .cacheResources)
      localStorage .setItem ('INIT_version', INIT .version);
    else
      localStorage .removeItem ('INIT_version');
}) ();

