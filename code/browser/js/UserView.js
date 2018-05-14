class UserView extends View {

  constructor() {
    super();
    $(window) .resize (e => {this .removeMenu()});
  }

  addLogin (toHtml) {
    this._login = $('<div>', {class: '_login_dialogue'}) .appendTo (toHtml);
    $('<div>', {class: '_login_heading'})       .appendTo (this._login)
      .append ($('<span>', {text: 'money'}))
      .append ($('<span>', {text: 'Map'}));
    let body = $('<div>', {class: '_login_body'}) .appendTo (this._login);
    $('<div>') .appendTo (body)
      .append ($('<span>', {text: 'Login'}))
      .append ($('<span>', {text: ' or Signup'}));
    $('<div>') .appendTo (body)
      .append ($('<input>',  {type: 'text', id: 'username', placeholder: 'Email'}));
    $('<div>') .appendTo (body)
      .append ($('<input>',  {type: 'password', id: 'password', placeholder: 'Password'}));
    this._loginErr = $('<div>', {class: '_loginError'}) .appendTo (body);
    $('<label>') .appendTo ($('<div>', {class: '_remember'}) .appendTo(body))
      .append ($('<input>', {type: 'checkbox', id: 'remember'})
        .change (e => {
          let input = e .target;
          $(input) .closest ('label') .find ('span') [input .checked? 'addClass': 'removeClass'] ('_checked');
        })
      )
      .append ($('<span>',  {text: 'Remember me on this computer'}))
    $('body')
      .keypress (e => {
        if (e .originalEvent .key == 'Enter') {
          this .loginError ('');
          let username = this._login .find ('#username') .val();
          let password = this._login .find ('#password') .val();
          let remember = this._login .find ('#remember') [0] .checked;
          this._notifyObservers (UserViewEvent .LOGIN, {username: username, password: password, remember: remember});
        }
      })
    body.find ('> div > span:nth-child(2)')
      .click( e => {
        this._convertLoginToSignup();
      })
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

  removeLogin (toHtml) {
    this._login .remove();
    $('body') .off ('keypress');
  }

  loginError (err) {
    if (err && err .length > 0)
      this._loginErr .text (err);
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

  addReadOnlyField (value, toHtml, label) {
    if (label) {
      toHtml = $('<div>', {class: '_labeledField'}) .appendTo (toHtml);
      $('<div>', {class: '_label', text: label}) .appendTo (toHtml);
    }
    $('<div>', {class: '_readOnlyField', text: value}) .appendTo (toHtml);
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

  addConfirmDelete (positionTarget, id, type) {
    let parent  = this._accountEdit .find ('> div');
    let popup   = $('<div>', {class: '_popupContainer'}) .appendTo (parent);
    let content = $('<div>', {class: '_addPopup'}) .appendTo (popup);
    popup .css (ui .calcPosition (positionTarget, parent, {top: -40, left: 0}));
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
      e  => {return e && $.contains (document .body, e .target) && ! $.contains (popup .get (0), e .target)},
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
      let e = $('<div>', {class: '_dataStorageChoice'}) .appendTo (tf);
      let l = $('<label>') .appendTo (e)
        .append ($('<input>', {type: 'radio', name: 'dataStore', value: i, prop: {checked: false}}))
        .append ($('<span>',  {text: d}));
      if (i == ConfigType .CLOUD_ENCRYPTED)
        l .append ($('<input>', {type: 'text', name: 'encryptionPassword', placeholder: 'Encryption Password'}));
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
      e  => {return e && $.contains (document .body, e .target) && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
    ui .scrollIntoView (popup)
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
      e  => {return e && $.contains (document .body, e .target) && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
    ui .scrollIntoView (popup)
  }

  async getConfigEncryptionPassword (name, isValidPassword) {
    return new Promise ((resolve, reject) => {
      let container = $('<div>', {class: '_getConfigEncryptionPassword'}) .appendTo ($('body'));
      let panel     = $('<div>') .appendTo (container);
      $('<div>', {text: 'Enter Your Private Cloud Encryption Password for ' + name + ' Configuration'}) .appendTo (panel);
      let form = $('<form>') .appendTo (panel);
      let input = $('<input>', {type: 'text', placeholder: 'Password'}) .appendTo (form);
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
      })
      let button = $('<button>', {text: 'Cancel'}) .appendTo (panel) .click (() => {
        container .remove();
        reject();
      });
    });
  }
}


var UserViewEvent = {
  LOGIN: 0,
  SIGNUP_ASK: 1,
  SIGNUP: 2,
  TAB_CLICK: 3,
  CONFIG_EMPTY: 4,
  CONFIG_COPY: 5,
  BUDGET_EMPTY: 6,
  BUDGET_COPY: 7,
  BUDGET_ROLLOVER: 8,
  DELETE_CONFIRMED: 9
}
