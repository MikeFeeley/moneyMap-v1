var ui = {

  scrollIntoView: (e, includeMargin = false, options = {}) => {
    var getScrollParent = node => {
      if (node === null || node == document)
        return null;
      else if (window .getComputedStyle (node) .overflowY == 'scroll' && node .scrollHeight > node .clientHeight) {
        return node;
      } else
        return getScrollParent (node.parentNode);
    }
    window .setTimeout (() => {
      // use timeout to ensure that this code doesn't run until after html has reappeared and thus has computed height
      let sp = getScrollParent (e [0], includeMargin);
      if (sp) {
        sp = $(sp);
        let st = sp .scrollTop();
        let sl = sp .scrollLeft();
        let sh = Math .max (document .documentElement .clientHeight, e .outerHeight (includeMargin) + sp .offset() .top);
        let sw = Math .max (sp .innerWidth(),                        e .outerWidth  (includeMargin) + sp .offset() .left);
        let sy = Math .max (0, e .outerHeight (includeMargin) + e .offset() .top  - sh);
        if (options .topBuffer) {
          let topOver = sy - (e .offset() .top - sp .offset() .top);
          if (topOver >= 0)
            sy -= Math .max (0, options .topBuffer - topOver);

        }
        let sx = Math .max (0, e .outerWidth  (includeMargin) + e .offset() .left - sw);
        let tp = e .offset() .top;
        let ot = sp .offset() .top;
        if (tp < ot)
          sy = tp - ot;
        let lp = e .offset() .left;
        let ol = sp .offset() .left
        if (lp < ol)
          sx = lp - ol;
        if (sy != 0 || sx != 0)
          sp .animate ({scrollTop: (st + sy), scrollLeft: (sl + sx)}, 200);
      }
    }, 0);
  },

  calcPosition (element, relativeToElement, position, width=0) {
    let ep = element .offset();
    let rp = relativeToElement .offset();
    let cp = {top: position .top  + ep .top  - rp .top + relativeToElement .scrollTop()}
    if (position .left !== undefined)
      cp .left  = ep .left - rp .left + position .left - Math .max (0, ep .left + width - (document .body .clientWidth -8)) + relativeToElement .scrollLeft()
    if (position .right !== undefined)
      cp .right = (document .body .clientWidth - ep .left) - Math .max (0, (document .body .clientWidth - (rp .left + relativeToElement .width())))
    return cp
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
    }
  },

  Tabs: class {
    constructor (toElement, onNameClick) {
      var html         = $('<div>', {class: 'tabbed'})                          .appendTo (toElement);
      var tabs         = $('<div>', {class: 'tabs'})                            .appendTo (html);
      var contents     = $('<div>') .appendTo ($('<div>',  {class: 'contents'}) .appendTo (html));
      $('<div>', {class: '_appName _nonTab'})
        .append ($('<span>', {text: 'money'}))
        .append ($('<span>', {text: 'Map'}))
        .appendTo (tabs)
        .click (onNameClick);
      var rightMatter = $('<div>', {class: '_login _nonTab'}) .appendTo (tabs);
      var clickable    = true;
      var pendingClick;
      var tabMap = new Map();

      Object.assign (this, {

        addTool (name, onClick) {
          return $('<div>', {html: name}) .appendTo (rightMatter) .on ('click', onClick);
        },

        changeToolName (tool, name) {
          tool .html (name);
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

        setTab (name, addContent, addNow) {
          let t       = tabMap .get (name);
          let content = t .tab .data ('content');
          content .empty();
          content .data({hidden: null, visible: null});
          if (addNow || ! t .tab .hasClass ('background')) {
            (async () => {await addContent (content)}) ();
            addContent = null;
          }
          tabMap .set (name, {tab: t .tab, addContent: addContent});
        },

        addTab (name) {

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
          tabMap .set (name, {tab: tab});

          tab .on ('click', e => {

            function click() {
              let prevContent = contents .find ('> :not(.background)');
              for (let d of [tabs, contents])
                d .children() .each ((_,c) => {$(c) .addClass ('background')});
              for (let d of [tab, tab .data ('content')])
                d .removeClass ('background');
              let visible = tab .data ('content') .data ('visible');
              let hidden  = prevContent .data ('hidden');
              if (visible)
                (async() => {await visible()})();
              if (hidden)
                hidden();
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

          return name;
        }
      })

    }
  }

}
