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
    let content       = $('<div>', {class: '_accountEdit'}) .appendTo (this._accountEdit);
    return content;
  }

  addGroup (title, toHtml, additionalClass) {
    let g = $('<div>', {class: '_group'})                     .appendTo (toHtml);
    $('<div>', {class: '_title', text: title})                .appendTo (g);
    return $('<div>', {class: '_content ' + additionalClass}) .appendTo (g);
  }

  addLine (toGroup) {
    return $('<div>', {class: '_line'}) .appendTo (toGroup);
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

  addTabGroup (name, toHtml) {
    let g = $('<div>', {class: '_tabGroup', data: {name: name}}) .appendTo (toHtml);
    let f = $('<div>', {class: '_filler', html: '&nbsp;'});
    f .click (e => {this._notifyObservers (UserViewEvent .TAB_CLICK, {name: name, target: $(e .target)})});
    return g
      .append ($('<div>', {class: '_tabGroupTabs'}) .append (f))
      .append ($('<div>', {class: '_tabGroupContents'}))
  }

  addTab (toGroup, subType='', noContent, text = '') {
    let sib = toGroup .find ('> ._tabGroupTabs > div');
    let ib  = $(sib [sib .length - Math .min (2, sib .length)])
    let t = $('<div>', {class: '_tab ' + subType, text: text}) .insertBefore (ib);
    let c = ! noContent && $('<div>', {class: '_content'})     .appendTo     (toGroup .find ('> ._tabGroupContents'));
    let r = noContent? {name: toGroup .data ('name')} : {tab: t, content: c};
    t .click (e => {r .target = $(e .target); this._notifyObservers (UserViewEvent .TAB_CLICK, r)})
    return {tab: t, content: c}
  }

  selectTab (tab) {
    if (! tab .tab .hasClass ('_selected')) {
      let tabGroup = tab .tab .closest  ('._tabGroup');
      let cs = tabGroup .find ('> ._tabGroupTabs > ._tab._selected ._field') .data ('field');
      if (cs)
        cs .setSelected (false);
      tab .tab .find ('._field') .data('field') .setSelected (true);
      tabGroup .find ('> ._tabGroupTabs > ._tab, > ._tabGroupContents > ._content') .removeClass ('_selected');
      tab .tab     .addClass ('_selected');
      tab .content .addClass ('_selected');
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

  addBudgetAddPopup (positionTarget, budgets) {
    let popup = $('<div>', {class: '_addPopup'}) .appendTo (this._accountEdit .find ('> div'));
    popup .css (ui .calcPosition (positionTarget, this._accountEdit, {top: 40, left: 0}));
    $('<div>', {text: 'Add New Budget'}) .appendTo (popup);
    $('<form>') .appendTo (popup)
      .append ($('<label>')
        .append ($('<input>', {type: 'radio', prop: {checked: true}}))
        .append ($('<span>',  {text: 'Rollover to next year from budget'}))
        .append ($('<select>'))
      )
    $('<div>') .appendTo (popup)
      .append (
        $('<button>', {text: 'Add'})
          .click (() => {
            this._notifyObservers (UserViewEvent .BUDGET_ROLLOVER, {from: popup .find ('select') .val()})
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
    for (let select of popup .find ('select') .toArray())
      for (let budget of budgets)
        $('<option>', {value: budget._id, text: budget .name}) .appendTo (select);
    let modal = ui .ModalStack .add (
      e  => {return e && $.contains (document .body, e .target) && ! $.contains (popup .get (0), e .target)},
      () => {popup .remove();},
      true
    );
  }
}

var UserViewEvent = {
  LOGIN: 0,
  SIGNUP_ASK: 1,
  SIGNUP: 2,
  TAB_CLICK: 3,
  BUDGET_ROLLOVER: 4
}
