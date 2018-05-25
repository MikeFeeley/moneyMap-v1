class UserView extends View {

  constructor() {
    super();
    $(window) .resize (e => {this .removeMenu()});
  }

  addLanding (toHtml, isNotNew) {
    let landing = $('<div>', {class: '_landing'}) .appendTo (toHtml);
    let banner  = $('<div>', {class: '_landingBanner'}) .appendTo (landing);
    let main    = $('<div>', {class: '_landingMain'}) .appendTo (landing);
    let bullets = $('<div>', {class: '_landingBullets'}) .appendTo (landing);
    let go      = $('<div>', {class: '_landingGo'}) .appendTo (landing);
    let table   = $('<div>', {class: '_landingTable'}) .appendTo (landing);
    let privacy = $('<div>', {class: '_landingPrivacy'}) .appendTo (landing);

    $('<div>', {text: 'money'}) .appendTo (banner);
    $('<div>', {text: 'Map'})   .appendTo (banner);

    $('<div>') .appendTo (main)
      .append ($('<div>', {text: 'Track, budget, plan.'}))
      .append ($('<div>', {text: 'Get a hold of your finances.'}))
      .append ($('<div>', {html: 'Start simple &mdash; gradually unleash your planning power.'}))
    .append ($('<div>', {text: 'Keep your information private and secure.'}))
    $('<div>') .appendTo (main)
      .append ($('<img>', {src: 'images/screen.jpeg'}));
    $('<ul>') .appendTo (bullets)
      .append ($('<li>', {html: 'Use, full-featured, on one computer for <b>free</b>.'}))
      .append ($('<li>', {text: 'Or upgrade to share across all of your devices.'}))
      .append ($('<li>', {html: 'Data is encrypted <b>on your computer</b> using a password only you know.'}))
      .append ($('<li>', {html: 'NO ads &mdash; NO data sharing.'}))
      .append ($('<li>', {text: 'Export your data to Excel or Numbers at anytime.'}));
    $('<button>', {text: 'Get Started'}) .appendTo (go) .click (e => {
      this._notifyObservers (UserViewEvent .GET_STARTED);
    });
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/rule.jpeg'}))
      )
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Categorize Your Spending'}))
        .append ($('<div>', {text:
          'Import transactions from your bank or enter them directly.  Create rules to automatically assign categories to ' +
          'transactions.  Create new categories and sub-categories as you go, as you gain new insights into your spending.'}))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Begin to Track Where Your Money Goes'}))
        .append ($('<div>', {html:
          'Once you start categorizing your transactions, <em>money</em><b>Map</b>, lets you see where your money is ' +
          'going each using graphs and spread-sheet like tables.  Clicking on any category lets you dig deeper to look ' +
          'at subcategories, to compare spending by where you shop, or to see the individual transactions behind the graph.'}))
      )
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/activity.jpeg'}))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/plan.jpeg'}))
      )
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Create a Budget'}))
        .append ($('<div>', {html:
          'Then, when you are ready, you can start to create a budget by listing spending amounts for categories for ' +
          'particular months or the entire year.  Each time you add an anticipated expense, can indicate whether this ' +
          'is something that will continue for the next few years, which then gives you the chance to start planning ahead. ' +
          'You do the same for your income and savings.'}))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Track Your Progress'}))
        .append ($('<div>', {html:
          'Now you can track your progress each month to see how your actual spending compares to your plan.  You will ' +
          'know when you are starting to spend too much or when you have a little extra for something else.'}))
      )
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/prog.jpeg'}))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/ma.jpeg'}))
      )
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Dig Deeper'}))
        .append ($('<div>', {html:
          'You can dig deeper into any category or subcategory to look at the entire year month by month, to see ' +
          'exactly where your money is going and how your spending pattern compares to your budget.' }))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {text: 'Adjust and Refine Your Budget'}))
        .append ($('<div>', {html:
          'As you learn more about your spending patterns and as unanticipated things happen, you will need to ' +
          'adjust your budget, which is quick and easy, just a click away from any graph or table.' }))
    )
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/hud.jpeg'}))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableImage'})
        .append ($('<img>', {src: 'images/future.jpeg'}))
      )
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {html: 'See the Past &mdash; Plan for the Future'}))
        .append ($('<div>', {html:
          'The longer you use <em>money</em><b>Map</b> the more you will know.  You will be able to compare current ' +
          'spending to the past to see long-term trends or changes in lifestyle.  And, ' +
          'Once you know where you are spending money today, you will be able to start planning future spending by ' +
          'indicating which of your current expenses will recur and by entering anticipated changes for in future ' +
          'years.  Now you can plan for buying your first home, having kids, or retirement. ' }))
      )
    $('<div>') .appendTo (table)
      .append ($('<div>', {class: '_landingTableText'})
        .append ($('<div>', {html: 'Watch Your Money Grow'}))
        .append ($('<div>', {html:
          'When you control your spending, you control what you save.  Using your past activity and your future plans, ' +
          '<em>money</em><b>Map</b> shows you how your savings is growing and how much you will have saved at key ' +
          'moments in your future.  ' }))
      )
    .append ($('<div>', {class: '_landingTableImage'})
      .append ($('<img>', {src: 'images/wealth.jpeg'}))
    )
    $('<div>', {text: 'Privacy and Security of your Financial Data'}) .appendTo (privacy);
    $('<div>', {html:
      'When you start using <em>money</em><b>Map</b> your data is stored on your own computer.  No information of ' +
      'any kind leaves your computer.  You can continue to use it this way as long as you like.  Note that ' +
      'your data is only accessible on a single computer and web browser (e.g., data created in Firefox can not be accessed '+
      'from Chrome).  You can, however, export your data to CSV format and then import this data into <em>money</em><b>Map</b> ' +
      'on another browser or computer.'
    }) .appendTo (privacy)
    $('<div>', {text:
      'If you elect to store your data in the cloud, so that you can access your data from multiple devices, we use several strategies to ensure that your data can only ' +
      'be accessed by you. '
    }) .appendTo (privacy)
   $('<div>', {text:
      'First all data sent between your browser and the cloud is encrypted while it is in the network.  '
    }) .appendTo (privacy)
   $('<div>', {text:
      'Second, all information other than amounts, balances and transaction dates is encrypted on your ' +
      'computer using a password that only you know using 128-bit AES-CBC.  This password never leaves your computer and so ' +
      'no one other than you can decrypt this data. '
    }) .appendTo (privacy)
   $('<div>', {text:
      'Third, we handle amounts and balances differently so that the cloud database ' +
      'can update balances based on transaction amounts.  These values are encrypted on our cloud server as soon as we receive them using a password generated on your computer from your secret password.  We never store this password and so once your ' +
      'data is stored in the cloud, only you can decrypt these values.  Dates are stored unencrypted so that we can handle your ' +
      'transaction searches efficiently.'
    }) .appendTo (privacy)
    $('<div>', {text:
      'Our privacy policy is simple.  Your financial data is your property.  Unlike some competing services, ' +
      'we will never use your data to generate revenue by providing information about you (or aggregated from your data) to advertisers or anyone else. ' +
      'We enforce this policy using industry-standard encryption techniques and a password that only you know.'
    }) .appendTo (privacy)
    if (isNotNew)
      this .addLogin (toHtml, false);
  }

  removeLanding() {
    this .removeLogin();
    $('body') .empty();
  }

  addLogin (toHtml, showMini) {
    this._login  = $('<div>', {class: '_whiteout'})       .appendTo (toHtml);
    let popup    = $('<div>', {class: '_popupContainer'}) .appendTo (this._login);
    let content  = $('<div>', {class: '_loginPopup' + (showMini? ' _miniLogin': '')}) .appendTo (popup);
    let form;

    let addLoginSignup = (sw) => {
      let tryLogin = () => {
        this._notifyObservers (UserViewEvent .LOGIN_CLOUD, {
          username: form .find ('#email')    .val(),
          password: form .find ('#password') .val(),
          remember: form .find ('#remember') [0] .checked
        })
      }
      $('<div>', {text: sw? 'Login': 'Welcome Back'}) .appendTo (content);
      form = $('<form>') .appendTo (content) .submit (() => {return false});
      $('<input>',  {type: 'text', id: 'email', placeholder: 'Email'}) .appendTo (form);
      $('<input>',  {type: 'password', id: 'password', placeholder: 'Password'}) .appendTo (form);
      $('<label>') .appendTo ($('<div>', {class: '_remember'}) .appendTo (form))
        .append ($('<input>', {type: 'checkbox', id: 'remember'}))
        .append ($('<span>',  {text: 'Remember me on this computer'}))
        .find ('input') .click (e => {
          $(e .target) .parent() .find ('span') [e .target .checked? 'addClass': 'removeClass'] ('_checked');
        })
      $('<div>', {class: '_loginError'}) .appendTo (form);
      let buttons = $('<div>', {class: '_loginButtons'}) .appendTo (form);
      $('<button>', {text: 'Login'})  .appendTo (buttons) .click (() => {tryLogin()});
      $('<button>', {text: 'Signup'}) .appendTo (buttons) .click (() => {});
      $('<button>', {text: 'Cancel'}) .appendTo (buttons) .click (() => {this .removeLogin()});
    }

    if (showMini) {
      $('<div>', {text: 'Welcome'}) .appendTo (content);
      $('<div>', {html: 'New to <em>money</em><b>Map</b>?'}) .appendTo (content);
      $('<div>', {text: 'Get started by storing your data on this computer without signing up.  Be sure that you ' +
        'trust this computer to store your financial data.  You can use this local version as long as you like for free. '}) .appendTo (content);
      $('<div>', {text: 'You can move your data to the cloud at any time if you decide you want to access it on other devices. ' +
        'You can also export your data to load it into a spreadsheet or another financial tool.'}) .appendTo (content);
      form = $('<form>') .appendTo (content);
      $('<label>') .appendTo (form)
        .append ($('<input>', {type: 'radio', name: 'mode', value: 'local'}))
        .append ($('<span>', {text: 'Store financial data on this computer'}))
      $('<label>') .appendTo (form)
        .append ($('<input>', {type: 'radio', name: 'mode', value: 'cloud'}))
        .append ($('<span>',  {text: 'Login or signup to use cloud storage'}))
      form .on ('click', 'input', e=> {
        let mode = e .originalEvent .currentTarget .value;
        if (mode == 'cloud') {
          content .empty();
          content .removeClass ('_miniLogin');
          addLoginSignup (true);
        } else
          this._notifyObservers (UserViewEvent .LOGIN_LOCAL);
      })

    } else {
      addLoginSignup (false);
    }

    this._loginModal = this._menuModalEntry = ui .ModalStack .add (
      e  => {return e && ! $.contains (popup [0], e .target) && popup [0] != e .target},
      () => {this .removeLogin()},
      true
    );
  }

  setLoginError (text) {
    this._login .find ('._loginError') .text (text);
  }

  removeLogin() {
    if (this._login) {
      this._login .remove();
      this._login = null;
      if (this._loginModal) {
        ui .ModalStack .delete (this._loginModal);
        this._loginModal = null;
      }
    }
  }

  _convertLoginToSignup() {
    this._login .find ('._login_body > div:first-child > span:nth-child(1)') .text ('Signup');
    this._login .find ('._login_body > div:first-child > span:nth-child(2)') .remove();
    $('<div>') .insertAfter (this._login .find ('._login_body div:nth-child(2)'))
      .append ($('<input>', {type: 'text', id: 'name', placeholder: 'Name'}));
    $('<div>') .insertAfter (this._login .find ('._login_body div:nth-child(4)'))
      .append ($('<input>', {type: 'password', id: 'confirm', placeholder: 'Re-Enter Password'}));
    $('body')
      .off ('keypress')
      .on  ('keypress', e => {
        if (e .originalEvent .key == 'Enter') {
          this .loginError ('');
          let username = this._login .find ('#username') .val();
          let name     = this._login .find ('#name')     .val();
          let password = this._login .find ('#password') .val();
          let confirm  = this._login .find ('#confirm')  .val()
          this._notifyObservers (UserViewEvent .SIGNUP, {username: username, name: name, password: password, confirm: confirm, remember: remember});
        }
      })
  }

  addMenu (toHtml, position, menuButton, menuButtonPosition) {
    this._menuHead = $('<div>', {class: '_user_menu_head', text: menuButton .text()}) .appendTo (toHtml);
    this._menuHead .css (menuButtonPosition);
    this._menu = $('<div>', {class: '_user_menu'}) .appendTo (toHtml);
    this._menu .css (position);
    this._menuModalEntry = ui .ModalStack .add (
      e  => {return e && ! $.contains (this._menu [0], e .target) && this._menu [0] != e .target},
      () => {this._menu .remove(); this._menuHead .remove(); this._menu = null},
      true
    );
    this._menuButton = menuButton;
  }

  addSubMenu (name, items) {
    let inSubMenu, subMenu;
    let subMenuHead = $('<div>', {text: name}) .appendTo (this._menu)
      .on ('mouseover', e => {
        subMenuHead .addClass ('_selected');
        subMenu = $('<div>', {class: '_subMenu'})
          .on ('mouseout',  e => {
            if (! $.contains (subMenu [0], e .originalEvent .toElement)) {
              subMenu .remove();
            }
          })
          .appendTo (this._menu)
          .css      ({top: $(e .originalEvent .target) .position() .top, right: 222});
        for (let item of items) {
          let i = $('<div>', {text: item .name}) .appendTo (subMenu)
            .on ('click',     e => {item .action (e)})
            .on ('mouseover', () => {i .addClass    ('_selected')})
            .on ('mouseout',  () => {i .removeClass ('_selected')})
        }
      })
      .on ('mouseout',  e => {
        if (! $.contains (subMenu [0], e .originalEvent .toElement))
          subMenu .remove();
        subMenuHead .removeClass ('_selected');
      })
  }

  removeMenu() {
    if (this._menu) {
      this._menu     .remove();
      this._menuHead .remove();
      this._menu = null;
      ui .ModalStack .delete (this._menuModalEntry);
    }
  }

  addMenuItem (name, action, addClass='') {
    let item = $('<div>', {text: name, class: addClass}) .appendTo (this._menu)
      .on ('click', e => {action(); e .stopPropagation(); return false})
      .on ('mouseover', () => {item .addClass    ('_selected')})
      .on ('mouseout',  () => {item .removeClass ('_selected')})

  }

  addAccountEdit() {
    this._tabs           = $('body') .find ('> .tabbed > .tabs');
    this._tabbedContents = $('body') .find ('> .tabbed > .contents > div');
    this._tabs .find           ('> div:not(._nonTab):not(.background)') .addClass ('background');
    this._tabbedContents .find ('> :not(.background)') .addClass ('background');
    if (this._accountEdit)
      this._accountEdit .remove();
    this._accountEdit = $('<div>')                          .appendTo (this._tabbedContents);
    let content       = $('<div>', {class: '_profileEdit'}) .appendTo (this._accountEdit);
    return content;
  }

  addGroup (title, toHtml, additionalClass = '') {
    let g = $('<div>', {class: '_group'})                     .appendTo (toHtml);
    $('<div>', {class: '_title', text: title})                .appendTo (g);
    return $('<div>', {class: '_content ' + additionalClass}) .appendTo (g);
  }

  addLine (toGroup, type = '_line') {
    return $('<div>', {class: type}) .appendTo (toGroup);
  }

  addLabel (text, toLine, type) {
    return $('<div>', {text: text, class: type}) .appendTo (toLine);
  }

  addField (field, id, value, toHtml, label) {
    let f = field .newInstance (id);
    if (label) {
      toHtml = $('<div>', {class: '_labeledField'}) .appendTo (toHtml);
      $('<div>', {class: '_label', text: label}) .appendTo (toHtml);
    }
    f .addHtml (value, this, toHtml);
  }

  addReadOnlyField (fieldName, id, value, toHtml, label) {
    if (label) {
      toHtml = $('<div>', {class: '_labeledField'}) .appendTo (toHtml);
      $('<div>', {class: '_label', text: label}) .appendTo (toHtml);
    }
    $('<div>', {class: '_readOnlyField _field_' + fieldName + ' _id_' + id, text: value}) .appendTo (toHtml);
  }

  setLabel (label, text) {
    label .html (text);
  }

  addInput (name, value, toLine, type = 'text') {
    return $('<input>', {type: type, value: value, placeholder: name}) .appendTo (toLine);
  }

  addButton (text, onClick, toLine) {
    let b = $('<button>', {text: text}) .appendTo (toLine) .click (() => {
      onClick ((b .closest ('._group') .find ('input') .toArray()) .map (v => {return $(v) .val()}))
    });
    return b;
  }

  setButtonDisabled (tab, isDisabled) {
    tab .find ('> ._tabGroupContents > ._content > ._line > button') [isDisabled? 'addClass': 'removeClass'] ('_disabled');
  }

  addTabGroup (name, toHtml) {
    let g = $('<div>', {class: '_tabGroup', data: {name: name}}) .appendTo (toHtml);
    let f = $('<div>', {class: '_filler', html: '&nbsp;'});
    f .click (e => {this._notifyObservers (UserViewEvent .TAB_CLICK, {name: name, target: $(e .target)})});
    return g
      .append ($('<div>', {class: '_tabGroupTabs'}) .append (f))
      .append ($('<div>', {class: '_tabGroupContents'}))
  }

  addTab (toGroup, subType='', noContent, text='') {
    let sib = toGroup .find ('> ._tabGroupTabs > div');
    let ib  = $(sib [sib .length - Math .min (2, sib .length)]);
    let t  = $('<div>', {class: '_tab ' + subType, text: text}) .insertBefore (ib);
    let c  = ! noContent && $('<div>', {class: '_content'})     .appendTo     (toGroup .find ('> ._tabGroupContents'));
    let r  = noContent? {name: toGroup .data ('name')} : {tab: t};
    t .click (e => {r .target = $(e .target); this._notifyObservers (UserViewEvent .TAB_CLICK, r)})
    return [t, c]
  }

  removeTab (tab) {
    let tabs     = tab .parent() .find ('> ._tab')                                        .toArray();
    let contents = tab .closest ('._tabGroup') .find ('> ._tabGroupContents > ._content') .toArray();
    let i = tabs .indexOf (tab [0]);
    $(tabs [i])     .remove();
    $(contents [i]) .remove();

  }

  selectTab (tab) {
    if (! tab .hasClass ('_selected')) {
      let groupTabs     = tab .closest  ('._tabGroupTabs');
      let groupContents = tab .closest  ('._tabGroup') .find ('> ._tabGroupContents');
      let content      = $(groupContents .children() [groupTabs .children() .index (tab)]);
      for (let fieldHtml of groupTabs .find ('> ._tab._selected ._field')) {
        let field = $(fieldHtml) .data ('field');
        if (field)
          field .setSelected (false);
      }
      groupTabs     .find ('> ._tab')     .removeClass ('_selected');
      groupContents .find ('> ._content') .removeClass ('_selected');
      let field = tab .find ('> ._field') .data('field');
      if (field)
        field .setSelected (true);
      tab     .addClass ('_selected');
      content .addClass ('_selected');
    }
  }

  addTabContentGroup (heading, toHtml) {
    $('<div>', {class: '_heading', text: heading}) .appendTo (toHtml);
    return $('<div>', {class: '_contentGroup'})    .appendTo (toHtml);
  }

  showAccountEdit() {
    this._tabs .find               ('> div:not(._nonTab):not(.background)') .addClass ('background');
    this._tabbedContents .find     ('> :not(.background)') .addClass ('background');
    this._accountEdit .removeClass ('background');
  }

  addConfirmDelete (positionTarget, id, type, positionOffset = {}) {
    let parent  = this._accountEdit .find ('> div');
    let popup   = $('<div>', {class: '_popupContainer'}) .appendTo (parent);
    let content = $('<div>', {class: '_addPopup'}) .appendTo (popup);
    popup .css (ui .calcPosition (positionTarget, parent, {top: -40 + (positionOffset .top || 0), left: 0 + (positionOffset .left || 0)}));
    $('<div>', {text: 'Do you really want to delete this ' + type + '?'}) .appendTo (content);
    $('<div>', {text: 'This action can not be undone.'}) .appendTo (content);
    $('<div>') .appendTo (content)
    .append (
      $('<button>', {text: 'Delete'})
      .click (() => {
        this._notifyObservers (UserViewEvent .DELETE_CONFIRMED, {id: id, type: type});
        ui .ModalStack .delete (modal);
        popup .remove();
      })
    )
    .append (
      $('<button>', {text: 'Cancel'})
      .click (() => {
        ui .ModalStack .delete (modal);
        popup .remove();
      })
    )
    let modal = ui .ModalStack .add (
      e  => {return e && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
    ui .scrollIntoView (popup);
  }

  addConfigAddPopup (positionTarget, configs) {
    let parent  = this._accountEdit .find ('> div');
    let popup   = $('<div>', {class: '_popupContainer'}) .appendTo (parent);
    let content = $('<div>', {class: '_addPopup'}) .appendTo (popup);
    popup .css (ui .calcPosition (positionTarget, parent, {top: -40, left: 0}));
    $('<div>', {text: 'Add New Configuration'}) .appendTo (content);
    $('<form>') .appendTo (content)
      .append ($('<div>') .append ($('<label>')
        .append ($('<input>', {type: 'radio', name: 'how', value: 'empty', prop: {checked: true}}))
        .append ($('<span>',  {text: 'Create empty configuration'}))
      ))
      .append ($('<div>') .append ($('<label>')
        .append ($('<input>', {type: 'radio', name: 'how', value: 'copy', prop: {checked: false}}))
        .append ($('<span>',  {text: 'Copy configuration from '}))
        .append ($('<select>'))
      ));

    $('<div>', {text: 'With Data Storage Type'}) .appendTo (content);
    let tf = $('<form>') .appendTo (content);
    for (let d of ConfigDesc) {
      let i = ConfigDesc .indexOf (d);
      if (!this._uid && i != 2)
        continue;
      let e = $('<div>', {class: '_dataStorageChoice'}) .appendTo (tf);
      let l = $('<label>') .appendTo (e)
        .append ($('<input>', {type: 'radio', name: 'dataStore', value: i, prop: {checked: ! this._uid}}))
        .append ($('<span>',  {text: d}));
      if (i == ConfigType .CLOUD_ENCRYPTED) {
        let pw = $('<input>', {type: 'text', name: 'encryptionPassword', placeholder: 'Encryption Password'}) .appendTo (l);
        $(l .children ('input') [0]) .on ('click', e => {pw .focus()});
      }
      e .append ($('<div>', {text: ConfigExp [i]}));
    }
    let error = $('<div>', {class:'_errorMessage'}) .appendTo (content);
    tf .on ('submit', () => {return false});

    $('<div>') .appendTo (content)
    .append (
      $('<button>', {text: 'Add'})
      .click (() => {
        let ds = content .find ('input[name="dataStore"]:checked') .val(), ep;
        if (ds == undefined)
          error .text ('Select a data storage type for the new configuration.');
        else {
          ep = ds == ConfigType .CLOUD_ENCRYPTED && content .find ('input[name="encryptionPassword"]') .val();
          if (ep !== false && ep .length < 6)
            error .text ('Private encryption password must be a least 6 characters long.');
          else {
            let arg = {type: ds, encryptionPassword: ep}
            switch (content .find ('input[name="how"]:checked') .val()) {
              case 'empty':
                this._notifyObservers (UserViewEvent .CONFIG_EMPTY, arg);
                break;
              case 'copy':
                arg .from = content .find ('select') .val();
                this._notifyObservers (UserViewEvent .CONFIG_COPY, arg);
                break;
            }
            ui .ModalStack .delete (modal);
            popup .remove();
          }
        }
      })
    )
    .append (
      $('<button>', {text: 'Cancel'})
      .click (() => {
        ui .ModalStack .delete (modal);
        popup .remove();
      })
    )
    for (let select of content .find ('select') .toArray())
      for (let config of configs)
        $('<option>', {value: config._id, text: config .name}) .appendTo (select);
    let modal = ui .ModalStack .add (
      e  => {return e && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
    ui .scrollIntoView (popup)
  }

  updateConfigEncryptionPassword (cid, pwd) {
    this._accountEdit .find ('._field_encryptionPassword._id_' + cid) .text (pwd);
  }

  addBudgetAddPopup (positionTarget, budgets) {
    let parent  = this._accountEdit .find ('> div');
    let popup   = $('<div>', {class: '_popupContainer'}) .appendTo (parent);
    let content = $('<div>', {class: '_addPopup'}) .appendTo (popup);
    popup .css (ui .calcPosition (positionTarget, parent, {top: -40, left: 0}));
    $('<div>', {text: 'Add New Budget'}) .appendTo (content);
    $('<form>') .appendTo (content)
      .append ($('<div>') .append ($('<label>')
        .append ($('<input>', {type: 'radio', name: 'how', value: 'empty', prop: {checked: true}}))
        .append ($('<span>',  {text: 'Create empty budget'}))
      ))
      .append ($('<div>') .append ($('<label>')
        .append ($('<input>', {type: 'radio', name: 'how', value: 'copy', prop: {checked: false}}))
        .append ($('<span>',  {text: 'Copy existing budget'}))
        .append ($('<select>'))
      ))
      .append ($('<div>') .append ($('<label>')
        .append ($('<input>', {type: 'radio', name: 'how', value: 'rollover', prop: {checked: false}}))
        .append ($('<span>',  {text: 'Rollover to next year from budget'}))
        .append ($('<select>'))
      ))
    $('<div>') .appendTo (content)
      .append (
        $('<button>', {text: 'Add'})
          .click (() => {
            switch (content .find ('input[name="how"]:checked') .val()) {
              case 'empty':
                this._notifyObservers (UserViewEvent .BUDGET_EMPTY);
                break;
              case 'copy':
                this._notifyObservers (UserViewEvent .BUDGET_COPY, {from: content .find ('select') .val()})
                break;
              case 'rollover':
                this._notifyObservers (UserViewEvent .BUDGET_ROLLOVER, {from: content .find ('select') .val()})
                break;
            }
            ui .ModalStack .delete (modal);
            popup .remove();
          })
      )
      .append (
        $('<button>', {text: 'Cancel'})
          .click (() => {
            ui .ModalStack .delete (modal);
            popup .remove();
          })
      )
    for (let select of content .find ('select') .toArray())
      for (let budget of budgets)
        $('<option>', {value: budget._id, text: budget .name}) .appendTo (select);
    let modal = ui .ModalStack .add (
      e  => {return e && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
    ui .scrollIntoView (popup)
  }

  async getConfigEncryptionPassword (name, isValidPassword) {
    return new Promise ((resolve, reject) => {
      let container = $('<div>', {class: '_getConfigEncryptionPassword'}) .appendTo ($('body'));
      let panel     = $('<div>') .appendTo (container);
      $('<div>', {text: 'Enter Private Cloud Encryption Password for ' + name + ' Configuration'}) .appendTo (panel);
      let form = $('<form>') .appendTo (panel);
      let input = $('<input>', {type: 'text', placeholder: 'Password'}) .appendTo (form);
      input.focus();
      let error = $('<span>') .appendTo (form);
      form .on ('submit', () => {
        (async () => {
          let pwd = input .val();
          if (await isValidPassword (pwd)) {
            container .remove();
            resolve (pwd);
          } else
            error .text ('Incorrect password');
        }) ();
        return false;
      });
      let confirm = $('<div>', {class: '_confirm'}) .appendTo (panel);
      $('<button>', {text: 'Cancel'}) .appendTo (confirm) .click (() => {
        container .remove();
        reject();
      });
      $('<button>', {text: 'Select a Different Configuration'}) .appendTo (confirm) .click (() => {
        // TODO popup to select different config
      });
     });
  }

  addPleaseWait() {
    let pw = $('<div>', {class: '_pleaseWait'}) .appendTo ($('body'));
    $('<div>', {text: 'Copy in progress ...'}) .appendTo (pw);
    pw .on ('keypress', e => {
      e .preventDefault();
      e .stopPropagation();
      return false;
    })
  }

  removePleaseWait() {
    $('body > ._pleaseWait') .remove();
  }
}


var UserViewEvent = {
  GET_STARTED: 0,
  LOGIN_LOCAL: 1,
  LOGIN_CLOUD: 2,
  SIGNUP: 3,
  TAB_CLICK: 4,
  CONFIG_EMPTY: 5,
  CONFIG_COPY: 6,
  BUDGET_EMPTY: 7,
  BUDGET_COPY: 8,
  BUDGET_ROLLOVER: 9,
  DELETE_CONFIRMED: 10
}
