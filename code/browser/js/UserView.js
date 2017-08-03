class UserView extends View {

  constructor() {
    super();
    $(window) .resize (e => {this .removeMenu()});
  }

  _setLoginButtonActions() {
    this._login .find ('#login')
      .off()
      .click (e => {
        this .loginError ('');
        let username = this._login .find ('#username') .val();
        let password = this._login .find ('#password') .val();
        this._notifyObservers (UserViewEvent .LOGIN, {username: username, password: password});
      })
    this._login .find ('#submit')
      .off()
      .click (e => {
        this .loginError ('');
        this._notifyObservers (UserViewEvent .SIGNUP_ASK);
      })
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
    this._loginErr = $('<div>') .appendTo (body);
    this._login .find ('input')
      .keypress (e => {
        if (e .originalEvent .key == 'Enter') {
          this .loginError ('');
          let username = this._login .find ('#username') .val();
          let password = this._login .find ('#password') .val();
          this._notifyObservers (UserViewEvent .LOGIN, {username: username, password: password});
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
    this._login .find ('input')
      .off()
      .keypress (e => {
        if (e .originalEvent .key == 'Enter') {
          this .loginError ('');
          let username = this._login .find ('#username') .val();
          let name     = this._login .find ('#name')     .val();
          let password = this._login .find ('#password') .val();
          let confirm  = this._login .find ('#confirm')  .val()
          this._notifyObservers (UserViewEvent .SIGNUP, {username: username, name: name, password: password, confirm: confirm});
        }
      })
  }

  removeLogin (toHtml) {
    this._login .remove();
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

  removeMenu() {
    if (this._menu) {
      this._menu     .remove();
      this._menuHead .remove();
      this._menu = null;
      ui .ModalStack .delete (this._menuModalEntry);
    }
  }

  addMenuItem (name, action) {
    $('<div>', {text: name}) .appendTo (this._menu) .click (e => {action(); e .stopPropagation(); return false});
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

  addTabGroup (toHtml) {
    return $('<div>', {class: '_tabGroup'}) .appendTo (toHtml)
      .append ($('<div>', {class: '_tabGroupTabs'}) .append ($('<div>', {class: '_filler', html: '&nbsp;'})))
      .append ($('<div>', {class: '_tabGroupContents'}))
  }

  addTab (toGroup, subType='', noContent, text = '') {
    let t = $('<div>', {class: '_tab ' + subType, text: text}) .insertBefore (toGroup .find ('> ._tabGroupTabs > div:last-child'));
    let c = ! noContent && $('<div>', {class: '_content'})     .appendTo     (toGroup .find ('> ._tabGroupContents'));
    return {tab: t, content: c}
  }

  setSelectedTab (tab) {
    let tabGroup = tab .tab .closest  ('._tabGroup');
    tabGroup .find ('div') .removeClass ('_selected');
    tab .tab     .addClass ('_selected');
    tab .content .addClass ('_selected');
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
}

var UserViewEvent = {
  LOGIN: 0,
  SIGNUP_ASK: 1,
  SIGNUP: 2
}
