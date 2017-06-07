var ui = {

  scrollIntoView: (e, includeMargin = false) => {
    var getScrollParent = node => {
      if (node === null)
        return null;
      else if (window .getComputedStyle (node) .overflowY == 'scroll' && node .scrollHeight > node .clientHeight) {
        return node;
      } else
        return getScrollParent (node.parentNode);
    }
    window .setTimeout (() => {
      // use timeout to ensure that this code doesn't run until after html has reappeared and thus has computed height
      let sp = $(getScrollParent (e [0], includeMargin));
      let st = sp .scrollTop();
      let sc = e .offset() .top + e .outerHeight (includeMargin) - document .documentElement .clientHeight;
      if (sc > 0)
        sp .animate ({scrollTop: (st + sc)}, 200);
      }, 0);
  },

  ModalStack: class {

    static _onMouseDown (e) {
      ui .ModalStack._stopRemainingMouseEvents = false;
      ui .ModalStack._handleClick (e);
    }

    static _onClick (e) {
      if (ui .ModalStack._stopRemainingMouseEvents) {
        e .stopPropagation()
        e .stopImmediatePropagation();
        e .preventDefault();
      }
    }

    static _handleClick (e) {
      while (ui._modalStack && ui._modalStack .length) {
        var m = ui._modalStack [ui._modalStack .length - 1];
        if (m .guard (e)) {
          m .action();
          if (m .remove) {
            var index = ui._modalStack .indexOf (m);
            if (index >= 0)
              ui._modalStack .splice (index, 1);
          }
          var matched = true;
        } else
          break;
      }
      if (matched) {
        e .stopPropagation()
        e .stopImmediatePropagation();
        e .preventDefault();
        ui .ModalStack._stopRemainingMouseEvents = true;
      }
    }

    static _onForceClick (e) {
      ui .ModalStack._stopRemainingMouseEvents = true;
      ui .ModalStack._handleClick (e)
    }

    static _onMouseUp (e) {
      if (ui .ModalStack._stopRemainingMouseEvents) {
        e .stopPropagation()
        e .stopImmediatePropagation();
        e .preventDefault();
      }
    }

    static add (guard, action, remove) {
      if (! ui._modalStack)
        ui._modalStack = [];
      var entry = {guard: guard, action: action, remove: remove};
      ui._modalStack .push (entry);
      return entry;
    }

    static delete (entry) {
      var index = (ui._modalStack || []) .indexOf (entry);
      if (index >= 0)
        ui._modalStack .splice (index, 1);
    }

    static init() {
      $('body') [0] .addEventListener ('mousedown',            e => {ui .ModalStack._onMouseDown (e)},         true);
      $('body') [0] .addEventListener ('webkitmouseforcedown', e => {ui .ModalStack._onForceClick (e)},        true);
      $('body') [0] .addEventListener ('click',                e => {ui .ModalStack._onClick (e)},             true);
      $('body') [0] .addEventListener ('mouseup',              e => {ui .ModalStack._onMouseUp (e)},           true);
    }
  },

  Tabs: class {
    constructor (toElement) {
      var html         = $('<div>', {class: 'tabbed'})                          .appendTo (toElement);
      var tabs         = $('<div>', {class: 'tabs'})                            .appendTo (html);
      var contents     = $('<div>') .appendTo ($('<div>',  {class: 'contents'}) .appendTo (html));
      $('<div>', {class: '_appName _nonTab'})
        .append ($('<span>', {text: 'money'}))
        .append ($('<span>', {text: 'Map'}))
        .appendTo (tabs);
      var rightMatter = $('<div>', {class: '_login _nonTab'}) .appendTo (tabs);
      var db = Model .getDatabase();
      var production  = $('<span>', {text: db=='production'? '': db}) .appendTo (rightMatter);
      $('<span>', {text: 'login'})  .appendTo (rightMatter);
      $('<span>', {text: 'signup'}) .appendTo (rightMatter);
      var clickable    = true;
      var pendingClick;
      var tabMap = new Map();

      Object.assign (this, {

        addTool (content) {
          content .insertAfter (rightMatter .children() .get (0));
        },

        updateTab (name, addContent) {
          var t = tabMap .get (name);
          var background = t .tab .hasClass ('background');
          var content    = t .tab .data ('content');
          content .empty();
          if (background)
            t .addContent = addContent;
          else
            addContent (content);
        },

        addTab (name, addContent, addNow) {

          function handleClick() {

            var t = tabMap .get (name);

            if (t .addContent) {
              clickable = false;
              t .addContent (content);
              if (pendingClick) {
                pendingClick();
                pendingClick = null;
              }
              clickable  = true;
              t .addContent = null;
            }
          }

          var content = $('<div>')                                                                .appendTo (contents);
          var tab     = $('<div>', {data: {content: content}}) .append ($('<div>', {text: name})) .appendTo (tabs);
          if (addNow) {
            addContent (content);
            addContent = null;
          }
          tabMap .set (name, {tab: tab, addContent: addContent});

          tab .on ('click', e => {

            function click() {
              for (let d of [tabs, contents])
                d .children() .each ((_,c) => {$(c) .addClass ('background')});
              for (let d of [tab, tab .data ('content')])
                d .removeClass ('background');
              let visible = tab .data ('content') .data ('visible');
              if (visible)
                visible();
              handleClick();
              pendingClick = null;
            }

            if (clickable)
              click();
            else
              pendingClick = click;
          });

          if (tabs .children() .length > 3)
            for (let d of [tab, content])
              d .addClass ('background');
          else
            handleClick();
        },

        selectTab (name) {
          var tab = tabMap .get (name);
          console.log ('xxx', tab);  // XXX  maybe
        }

      })
    }
  }

}
