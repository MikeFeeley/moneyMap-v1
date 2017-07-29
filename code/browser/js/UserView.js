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
      .append ($('<input>',  {type: 'text', id: 'username', placeholder: 'Email Address'}));
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
          let confirm  = this._login .find ('#confirm') .val()
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
}

var UserViewEvent = {
  LOGIN: 0,
  SIGNUP_ASK: 1,
  SIGNUP: 2
}
