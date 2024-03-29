const UI_TOOL_TIP_WAIT_MS      = 200;
const UI_TOOL_TIP_FADE_MS      = 120;
const UI_TOOL_TIP_DURATION_MS  = 8000;
const UI_FIELD_TIP_DURATION_MS = 5000;
const UI_FIELD_TIP_FADE_OUT_MS = 1000;
const UI_RULE_SLIDE_MS         = 300;

var UI_BANNER_HEIGHT; // set by tab constructor

var ui = {

  isResponsive: true,
  whenResponsiveMap: new Map(),

  setResponsive (isResponsive) {
    const wasResponsive = ui .isResponsive;
    ui .isResponsive = isResponsive;
    if (! wasResponsive) {
      for (const updater of ui .whenResponsiveMap .values())
        updater();
      ui .whenResponsiveMap .clear();
    }
  },

  whenResponsive (view, updater) {
    if (! ui .isResponsive)
      ui .whenResponsiveMap .set (view, updater);
  },

  getScrollParent: node => {
    if (node === null || node == document .documentElement || window .getComputedStyle (node) .overflowY == 'scroll') {
      return node;
    } else
      return ui .getScrollParent (node.parentNode);
  },

  /**
   * Scroll the minimum amount needed so that either
   *     (a) if the entire element is shown, if it fits
   *     (b) that as much of the element, including upper left corner is shown, if it does not fit
   */
  scrollIntoView: (e, DEPRICATED = false, options = {}) => {
    setTimeout (() => {
      // use timeout to ensure that this code doesn't run until after html has reappeared and thus has computed height
      e = e [0];
      let sp = ui .getScrollParent (e);
      if (sp) {

        // tabbed is surrogate for body for scrolling entire page (on safari; for firefox and chrome its documentElement)
        if (sp == $('body > .tabbed') .get(0))
          sp = (isFirefox || isChrome)? document .documentElement: document .body;
        else if (!isChrome && !isFirefox && sp == document .documentElement)
          sp = document .body;
        let bannerSkip = (sp == document .body || sp == document .documentElement)? UI_BANNER_HEIGHT: 0;

        let topOffset = 0;

        // get scroll area boundaries
        let maxHeight       = sp .clientHeight;
        let maxWidth        = sp .clientWidth;
        let scrollBottom    = sp .scrollTop  + maxHeight;
        let scrollRight     = sp .scrollLeft + maxWidth;

        // get position of e relative to scrollParent
        let calcPosition = e => {
          let top  = e .offsetTop;
          let left = e .offsetLeft;
          if (e != sp && e .offsetParent) {
            let [pt,pl] = calcPosition (e .offsetParent);
            top  += pt;
            left += pl;
          }
          return [top, left]
        }
        let [eTop, eLeft] = calcPosition (e);
        let eBottom = eTop  + e .offsetHeight + e .clientTop;
        let eRight  = eLeft + e .offsetWidth + e .clientLeft;
        if (options .topBuffer)
          eTop -= options .topBuffer;

        // calculate scroll delta
        let scrollY = Math .max (sp .offsetTop + sp .clientTop, eBottom - scrollBottom);
        if (eTop < sp .scrollTop + scrollY + bannerSkip)
          scrollY = eTop - sp .scrollTop - bannerSkip;
        scrollY -= sp .offsetTop + sp .clientTop;

        let scrollX = Math .max (sp .offsetLeft + sp .clientLeft, eRight - scrollRight);
        if (eLeft < sp .scrollLeft + scrollX)
          scrollX = eLeft - sp .scrollLeft;
        scrollX -= sp .offsetLeft + sp .clientLeft;

        // scroll
        if (scrollY != 0 || scrollX != 0)
          $(sp) .animate ({
            scrollTop: (sp .scrollTop + scrollY),
            scrollLeft: (sp .scrollLeft + scrollX)
          }, 200);
      }
    }, 0);
  },

  calcPosition (element, relativeToElement, position = {top: 0, left: 0}, DEPRICATED = 0, minLeft) {
    let ep = element .offset();
    let rp = relativeToElement .offset();
    let cp = {top: position .top  + ep .top  - rp .top + relativeToElement .scrollTop()}
    if (position .left !== undefined)
      cp .left  = ep .left - rp .left + position .left;
    if (minLeft !== undefined)
      cp .left = Math .max (cp .left, minLeft);
    if (position .right !== undefined)
      cp .right = (document .body .clientWidth - ep .left) + position .right;
    return cp
  },

  ModalStack: class {

    static _onMouseDown (e) {
      if (! ui .ModalStack._isBlocked) {
        ui .ModalStack._stopRemainingMouseEvents = false;
        ui .ModalStack._handleClick (e);
      }
    }

    static _onClick (e) {
      if (! ui .ModalStack._isBlocked && ui .ModalStack._stopRemainingMouseEvents) {
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
      if (! ui .ModalStack .isBlocked) {
        ui .ModalStack._stopRemainingMouseEvents = true;
        ui .ModalStack._handleClick (e)
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
        ui._modalStack .splice (index, ui._modalStack .length - index);
    }

    static clear() {
      const keys = Object.keys (ui._modalStack || []);
      for (let i = keys.length - 1; i >= 0; i --) {
        const entry = ui._modalStack [i];
        entry .action();
      }
      ui._modalStack = ui._modalStack && ui._modalStack .filter (entry => {return ! entry .remove});
    }

    static init() {
      $('html') [0] .addEventListener ('mousedown',            e => {ui .ModalStack._onMouseDown (e)},         true);
      $('html') [0] .addEventListener ('webkitmouseforcedown', e => {ui .ModalStack._onForceClick (e)},        true);
      $('html') [0] .addEventListener ('click',                e => {ui .ModalStack._onClick (e)},             true);
    }

    static setBlocked (isBlocked) {
      ui .ModalStack._isBlocked = isBlocked;
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
      var clickable    = false;
      var pendingClick;
      var tabMap = new Map();
      UI_BANNER_HEIGHT = $('body > .tabbed > .tabs') .height();

      Object.assign (this, {

        addTool (name, onClick) {
          return $('<div>', {html: name}) .appendTo (rightMatter) .on ('click', onClick);
        },

        addIconTool (icon) {
          return $('<div>', {class: icon}) .appendTo (rightMatter);
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

        async setTab (name, addContent, addNow) {
          let t = tabMap .get (name);
          if (t) {
            let content = t .tab .data ('content');
            content .empty();
            content .data({hidden: null, visible: null});
            if (addNow || ! t .tab .hasClass ('background')) {
              await addContent (content);
              addContent = null;
            }
            tabMap .set (name, {tab: t .tab, addContent: addContent});
          }
        },

        setClickable (isClickable) {
          clickable = isClickable;
        },

        clear() {
          for (const [name, tab] of tabMap)
            tabMap .set (name, {tab: tab .tab});
        },

        setHidden (tabNames) {
          const tabs     = Array .from ($('body') .find ('.tabbed > .tabs > div:not(._nonTab)'));
          const contents = Array .from ($('body') .find ('.tabbed > .contents > div > div'));
          for (const [name, tab] of Array .from (tabMap .entries()) .map (e => [e[0], e[1] .tab [0]])) {
            const hide = tabNames .includes (name);
            tab .classList [hide? 'add': 'remove'] ('_hiddenTab');
            if (hide) {
              tab .classList                                        .add ('background');
              contents [tabs .findIndex (t => t == tab)] .classList .add ('background');
            }
          }
          if (! contents .find (c => ! c .classList .contains ('background'))) {
            const i = tabs .findIndex (t => ! t .classList .contains ('_hiddenTab'));
            tabs     [i] .classList .remove ('background');
            contents [i] .classList .remove ('background');
          }
        },

        addTab (name, hide) {

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
          if (hide) {
            tab .addClass ('_hiddenTab');
            content .addClass ('background');
          }
          tabMap .set (name, {tab: tab});

          tab .on ('click', e => {

            function click() {
              let prevContent = contents .find ('> :not(.background)');
              prevContent .data ('_scrollTop', $('body') .scrollTop());
              let scrollTop = tab .data ('content') .data ('_scrollTop');
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
              setTimeout (() => {
                handleClick();
                pendingClick = null;
                $('body') .scrollTop (scrollTop || 0)
                }, 0);
            }

            if (clickable)
              click();
            else
              pendingClick = click;
          });

          if (tabs .children('div:not(._nonTab):not(._hiddenTab)') .length > 1)
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
