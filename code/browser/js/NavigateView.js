class NavigateView extends Observable  {
  constructor (accounts, variance) {
    super();
    this._name = '_Navigate';
    this._shortColors = [
      [26,101,202],
      [73, 167,46],
      [235,205,32],
      [255,113,19],
      [255,37,14],
      [113,64,158],
      [128,128,128],
    ];
    this._longColors = this._shortColors .concat ([
      [168,36,168],
      [47,177,210]
    ]);
    this._idSeq    = 0;
    this._accounts = accounts;
    this._variance = variance;
  }

  remove() {
    if (this._html) {
      this._html .remove();
      this._html = null;
    }
  }

  async addHtml (toHtml, buildHtml) {
    this._toHtml    = toHtml;
    this._buildHtml = buildHtml;
    this._createHtml();
  }

  resetHtml() {
    if (this._html) {
      this._html .remove();
      this._html = null;
      this._progressGraphs = null;
    }
    this._idSeq = 0;
    if (this._budgetYearGraph) {
      this._budgetYearGraph .delete();
      this._budgetYearGraph = null;
    }
  }

  async _createHtml () {
    if (this._toHtml) {
      this._html    = $('<div>', {class: this._name }) .appendTo (this._toHtml);
      this._content = $('<div>', {class: '_list'})  .appendTo (this._html);
      this._toHtml .data ('visible', () => {
        if (this._html == null && this._toHtml)
          this._createHtml()
      });
      if (this._buildHtml)
        this._buildHtml();
    }
  }

  _resetColors() {
    this._colorIndex = 0;
  }

  _getColor (alpha, useLong=false) {
    let colors = useLong? this._longColors: this._shortColors;
    return 'rgba(' + (colors [this._colorIndex] .concat (alpha)) .join (',') + ')'
  }

  isVisible() {
    return this._toHtml && ! this._toHtml .hasClass ('background');
  }

  _nextColor (useLong=false) {
    let colors = useLong? this._longColors: this._shortColors;
    this._colorIndex = (this._colorIndex + 1) % colors .length;
  }

  addHeading (text, name='', toHtml = this._content) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_heading ' + name, text: text, attr: {id: id}}) .appendTo (toHtml);
    return content;
  }

  addHelp (text) {
    let help = $('<div>') .appendTo ($('<div>', {class: '_helpInline'}) .appendTo (this._content));
    $('<div>', {text: 'TIP'}) .appendTo (help);
    for (let t of text)
      $('<div>', {text: t}) .appendTo (help);
  }

  addContainer (name='', toHtml = this._content) {
    return $('<div>', {class: name}) .appendTo (toHtml);
  }

  addSlider (options, toHtml) {
    $('<div>', {class: '_sliderFill', text: ' '}) .appendTo (toHtml);
    let slider = $('<div>', {class: '_slider'}) .appendTo (toHtml) [0];
    slider .addEventListener ('webkitmouseforcedown', e => {e .preventDefault(); e .stopPropagation(); e .stopImmediatePropagation(); return false}, true);
    let so = {
      range:   {min: 0, max: 0},
      start:   [],
      connect: true,
      step:    1
    };
    let values = [];
    if (options .left) {
      so .range .min = options .left .min;
      so .range .max = options .left .max;
      so .start .push (options .left .start);
    }
    if (options .right) {
      if (options .right .min)
        so .range .min = so .range .min? Math .min (so .range .min, options .right .min): options .right .min;
      if (options .right .max)
        so .range .max = so .range .max? Math .max (so .range .max, options .right .max): options .right .max;
      so .start .push (options .right .start);
    }
    noUiSlider .create (slider, so);
    let lastValues = {
      left:  options .left .start,
      right: options .right .start
    }
    slider .noUiSlider .on ('update', (values, handle) => {
      values = values .map (v => {return Number (v)});
      if (values [0] != lastValues .left) {
        if ((options .keep .value && values [0] > options .keep .value [0]) || lastValues .right - values [0] < options .keep .count) {
          if (options .keep .value)
            lastValues .left = Math .min (options .keep .value [0], lastValues .right - options .keep .count + 1);
          else
            lastValues .left = lastValues .right - options .keep .count + 1;
          slider .noUiSlider .set ([lastValues .left, lastValues .right]);
          return;
        }
        lastValues .left = values [0];
      }
      if (values [0] == lastValues .left && values [1] != lastValues .right) {
        if ((options .keep .value && values [1] < options .keep .value [1]) || values [1] - lastValues .left < options .keep .count) {
          if (options .keep .value)
            lastValues .right = Math .max (options .keep .value [1], lastValues .left + options .keep .count - 1);
          else
            lastValues .right = lastValues .left + options .keep .count - 1;
          slider .noUiSlider .set ([lastValues .left, lastValues .right]);
          return;
        }
        lastValues .right = values [1];
      }
      options .onChange (values, handle)
    });
  }

  addSubHeading (text, name = '', toHtml = this._content) {
    var id      = this._name + '_' + this._idSeq++;
    var anchors = [];
    var content = $('<div>', {class: '_text', html: text, attr: {id: id}}) .appendTo (toHtml);
    return content;
  }

  addProgressSidebar() {
    this._html .parent() .addClass ('_progressContents');
    this._content .remove();
    this._content = this._html;
    this._progressSidebar = $('<div>', {class: '_progressSidebar _sidebar_right'}) .appendTo (this._content);
    this._hideButton      = $('<button>', {class: '_sidebar_right_hide_botton lnr-cross', click: () => {
      this._progressSidebar .hide();
      this._showButton      .show();
    }}) .appendTo (this._progressSidebar);
  }

  _addTooltip (element, text) {
    var tt;
    if (text) {
      element .hover (
        e => {
          let toHtml = element .closest ('._progressSidebar');
          tt = $('<div>', {
            class: '_toolTipNoPosition',
            text: text,
          }) .appendTo (toHtml);
          window .setTimeout (() => {
            if (tt) {
              tt .css (ui .calcPosition (element, toHtml, {top: -18, left: -4}, tt .width(), 0)) .fadeIn (UI_TOOL_TIP_FADE_MS);
            }
          })
        },
        e => {
          tt .remove();
      });
    }
  }

  addProgressSidebarGroup (name, tooltip, flag) {

    const shortListLength = 6;
    const categories      = this._variance .getBudget() .getCategories();
    var isShowingMore     = false;
    var table;
    var list              = [];
    var group             = $('<div>', {class: '_sidebar_group ' + (flag || '')}) .appendTo (this._progressSidebar);
    let heading           = $('<div>', {class: '_heading', text: name}) .appendTo (group);
    if (tooltip && tooltip .length)
      this._addTooltip (heading, tooltip);

    var buildTable = () => {
      if (table)
        table .remove();
      if (list .filter (e => {return e .amount != 0}) .length == 0)
        group. css ('display', 'none');
      else {
        table = $('<table>') .appendTo (group);
        table [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true);
        for (let i = 0; i < Math .min (isShowingMore? list .length: shortListLength, list .length); i++) {
          let item = list [i];
          let tr = $ ('<tr>') .appendTo (table)
          this._addTooltip (tr, item .tooltip);
          if (item .id)
            tr .on ('click webkitmouseforcedown', e => {
              let html = $(this._progressGraphs .find ('._progressGraph') [0]);
              let st = $('body') .scrollTop();
              let target = $(e .target);
              let scrollParent = target .closest ('._progressSidebar');
              let tp  = ui .calcPosition (target, scrollParent)
              let top = Math .min (
                document .documentElement .clientHeight - 546,
                tp .top - scrollParent .scrollTop() + scrollParent.offset() .top - st - 200
              );
              let pos = {top: st + top, left: 50};
              this._notifyObservers (NavigateViewEvent .PROGRESS_SIDEBAR_CLICK, {
                id:       item .id,
                html:     html,
                position: pos,
                view:     this,
                altClick: e .originalEvent .webkitForce > 1 || e .originalEvent .altKey
              });
              e .stopPropagation();
              return false;
            })
          this._addTooltip ($('<td>', {text: item .name}) .appendTo (tr), item .nameTooltip);
          if (item .amount !== undefined) {
            this._addTooltip ($('<td>', {
              text: Types .moneyDZ .toString (item .amount),
              class: item .amount < 0? 'negative': ''
            })  .appendTo (tr), item .amountTooltip)
          } else if (list [i] .percent)
            this._addTooltip ($('<td>', {text: Types .percent .toString (item .percent)}) .appendTo (tr), item .amountTooltip);
        }
        if (list .length > shortListLength)
          $('<td>', {class: '_showMoreLess', html: isShowingMore? 'Show Less&#133;': 'Show More&#133;'}) .appendTo ($('<tr>') .appendTo (table)) .after ($('<td>'))
            .click (e => {
              isShowingMore = ! isShowingMore;
              table .remove();
              buildTable();
              e .stopPropagation();
              return false;
            })
      }
    }

    return (update) => {
      list = update;
      buildTable();
    }
  }

  addProgressGraph (to, popup, position, onClose) {
    if (!this._progressGraphs) {
      this._progressGraphs = $('<div>', {class: '_progressGraphs'}) .appendTo (this._content);
      this._showButton     = $('<button>', {class: '_sidebar_right_show_button lnr-menu', click: e => {
        this._progressSidebar .show();
        this._showButton      .hide();
        e .stopPropagation();
        return false;
      }}) .appendTo (this._progressGraphs);
      this._container = $('<div>', {class: '_container'}) .appendTo (this._progressGraphs);
    }
    var container = to || this._container;
    if (container .length) {
      var graph = $('<div>', {class: '_progressGraph' + (popup? ' _popup fader': '')}) .appendTo (container) .append ($('<div>', {class: '_popupContent'}));
      if (popup) {
        graph .css (position);
        ui .ModalStack .add (
          e  => {return e && $.contains (document .body, e .target) && ! $.contains (graph .get (0), e .target)},
          () => {graph .removeClass ('fader_visible') .one ('transitionend', () => {graph .remove(); onClose()})},
          true
        );
        setTimeout (() => {graph .addClass ('fader_visible')}, 0);
      }
      return graph;
    }
  }

  addHeadingToProgressGraph (progressGraph, heading) {
    if (progressGraph)
      $('<div>', {class: '_heading', text: heading}) .appendTo (progressGraph .children('._popupContent'));
  }

  addToProgressGraph (progressGraph, heading, data, labelWidth) {
    if (progressGraph) {
      if (heading) {
        var head = $('<div>', {class: '_text', text: heading})
          .appendTo (progressGraph .children('._popupContent'))
          .on ('click webkitmouseforcedown', e => {
            this._notifyObservers (NavigateViewEvent .PROGRESS_GRAPH_TITLE_CLICK, {
              data:     data,
              html:     progressGraph,
              position: {top: 50, left: 50},
              view:     this
            });
            e .stopPropagation();
            return false;
          })
        head [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
      }
      var isPopup = progressGraph .hasClass ('_popup');
      if (isPopup)
        progressGraph .removeClass ('hidden');
      var graph = new BudgetProgressGraph (
        '', progressGraph .children('._popupContent'), true, false,
        {barThickness: 24, barPercentage: .85, labelWidth: labelWidth}
      );
      graph .addObserver (this, (eventType, arg) => {
        if (eventType == BudgetProgressGraphEvent .GRAPH_CLICK) {
          arg .title = arg .target .closest ('div') .prev ('._text') .text();
          arg .data  = data;
          arg .view  = this;
          this._notifyObservers (NavigateViewEvent .PROGRESS_GRAPH_CLICK, arg);
        }
      });
      graph .add (data);
      if (isPopup)
        ui .scrollIntoView (progressGraph, false);
      return (data, labelWidth, heading) => {
        if (heading)
          head .text (heading);
        graph .update (data, labelWidth);
      }
    }
  }

  emptyProgressGraph (progressGraph) {
    if (progressGraph)
      progressGraph .children ('._popupContent') .empty();
    if (progressGraph .hasClass ('_popup'))
      progressGraph .addClass ('hidden');
  }

  addBudgetYearGraph (budget, toHtml = this._content) {
    if (this._budgetYearGraph)
      this._budgetYearGraph .delete();
    this._budgetYearGraph = new BudgetYearGraph (budget, toHtml)
    this._budgetYearGraph .add();
  }

  addMonthsGraph (name, dataset, popup, position, onClose, toHtml, startColor=0) {
    return this._addBudgetGraph (name, dataset, popup, position, onClose, toHtml, startColor);
  }

  addHistoryGraph (dataset, popup, position, onClose, toHtml, startColor=0) {
    return this._addBudgetGraph ('_budgetHistoryGraph', dataset, popup, position, onClose, toHtml, startColor, false);
  }

  /**
   * Add a budget graph
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:     name for this row
   *         id:       category id for this row
   *         isCredit: true iff this is a credit amount
   *         amounts:  array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */

  _addBudgetGraph (name, dataset, popup, position, onClose, toHtml, startColor=0, hasPrevNext=true) {
    var startCol, endCol;
    dataset  = JSON .parse (JSON .stringify (dataset));
    startCol = 0;
    endCol   = dataset .cols .length - 1;

    let processData = (data, name, multipleGroups, stackPosition) => {
      stackPosition = stackPosition || [0,0];
      const backgroundAlphas = [0.5, 0.075];
      const borderAlphas     = [1,   0.55];
      if (data .type == 'line') {
        data .borderColor     = 'rgba(221,0,0,1)';
        data .backgroundColor = 'rgba(0,0,0,0)';
        data .pointBackgroundColor = 'rgba(221,0,0,1)';
      } else {
        data .backgroundColor      = this._getColor (multipleGroups? backgroundAlphas [stackPosition [1]]:       0.3,       true);
        data .hoverBackgroundColor = this._getColor (multipleGroups? backgroundAlphas [stackPosition [1]] + 0.0: 0.3 + 0.0, true);
        data .borderColor          = this._getColor (borderAlphas [stackPosition [1]], true);
        data .stack                = stackPosition [0];
        data .colorIndex           = this._colorIndex;
      }
      data .borderWidth = 1;
      data .stackPosition = stackPosition;
      if (name != data .label)
        data .label = name + ':' + data .label;
      if (data .type != 'line' && data .data .find (a => {return a != 0}))
        this._nextColor (true);
      return data;
    }

    var processDataset = () => {
      labels = dataset .cols;
      data   = dataset .groups;
      var groups = data .map (g => {
        return g .rows .map (c => {
          return {
            label:       c .name,
            id:          c .id,
            data:        c .amounts .map (a => {return a .value}),
            gross:       c .amounts .map (a => {return a .gross}),
            borderWidth: 1,
            type:        c .type
          }
        })
      });
      let   stacks = [];
      for (let g of groups) {
        let idx = groups .indexOf (g);
        let stackPosition = dataset .groups [idx] .stackPosition || [0,0];
        this._resetColors();
        for (let i = 0; i < startColor || 0; i ++)
          this._nextColor (true);
        for (let d of g) {
          processData (d, data [idx] .name, groups .length > 1, stackPosition);
        }
        if (stackPosition [1])
          stacks [stackPosition [0]] = (stacks [stackPosition [0]] || []) .concat (g)
        else
          stacks [stackPosition [0]] = g .concat (stacks [stackPosition [0]] || []);
      }
      datasets = [];
      for (let stack of stacks)
        for (let group of stack)
          datasets = datasets .concat (group);
      if (data .length >= 1) {
        var height = [[],[]];
        for (let i = 0; i < labels .length; i++)
          for (let ds of datasets) {
            if (ds .stack)
              height [ds .stack - 1] [i] = (height [ds .stack - 1] [i] || 0) + ds .data [i];
            else
              height [0] [i] = (height [0] [i] || 0) + ds .data [i];
          }
        let max = height .reduce ((m,h) => {return Math .max (m, h .reduce ((m,v) => {return Math .max (m, v)}, 0))}, 0);
        let minResolution = max / 50;
        for (let ds of datasets)
          ds .data = ds .data .map (d => {return d < 0 && -d < minResolution? 0: d});
      }
    }

    var setDataset = () => {
      config .data .labels   = labels;
      config .data .datasets = datasets;
    }

    var datasets;
    var labels;
    var data;
    if (toHtml)
      var container = toHtml
    else
      var container = this._content .find ('.' + name + 's');
    if (container .length == 0) {
      var container = $('<div>', {class: name + 's'});
      container .appendTo (this._content);
    }
    var graph  = $('<div>', {class: name + (popup? ' _popup fader': '')}) .appendTo (container) .append ($('<div>', {class: '_popupContent'}));
    processDataset();
    if (popup) {
      if (data .length >= 1) {
        let top  = $('<div>', {class: '_topRow'})  .appendTo (graph .children('._popupContent'));
        let head = $('<div>', {class: '_heading'}) .appendTo (top);
        let icons = $('<div>', {class: '_icons'})  .appendTo (top);
        let iconClick = force => {
          let html     = container .closest ('div:not(._popup)');
          let position = ui .calcPosition (graph, html, {top: 50, left: 50});
          this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_TITLE_CLICK, {
            name:     name,
            id:       Array .from (data .reduce ((s,d) => {return [] .concat (d .id) .reduce((s,i) => {return s .add (i)},s)}, new Set())),
            data:     data,
            position: position,
            html:     html,
            view:     this,
            altClick: force,
            date:     dataset .dates && dataset .dates [0],
          });
          return false;
        }
        let getHUD =  dataset .groups .length == 1 && $('<div>', {class: 'lnr-map'}) .appendTo (icons) .click (() => {iconClick (false)});
        let goUp   = $('<div>', {class: 'lnr-exit-up'}) .appendTo (icons) .click (() => {iconClick (true)});
        if (data [0] .id .includes ('_')) {
          if (getHUD)
            getHUD .addClass ('_disabled');
          goUp   .addClass ('_disabled');
        }
        else if (dataset .groups [0] .hasNoParent)
          goUp .addClass ('_disabled');
        let goPrevNext = prev => {
          this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_PREV_NEXT, {
            name:     name,
            id:       Array .from (data .reduce ((s,d) => {return [] .concat (d .id) .reduce((s,i) => {return s .add (i)},s)}, new Set())),
            dates:    dataset .dates,
            prev:     prev,
            update:   update
          })
        }
        if (hasPrevNext) {
          if (dataset .groups .length == 1) {
            $('<div>', {class:'_prevButton lnr-calendar-full'}) .appendTo (icons) .click (e => {
              let html     = container .closest ('div:not(._popup)');
              let position = ui .calcPosition (graph, html, {top: 50, left: 50});
              this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_GET_HISTORY, {
                id:       Array .from (data .reduce ((s,d) => {return [] .concat (d .id) .reduce((s,i) => {return s .add (i)},s)}, new Set())),
                position: position,
                html:     html,
                view:     this,
              })
              e .stopPropagation();
              return false;
            });
          }
          let prev = $('<div>', {class:'_prevButton lnr-chevron-left'}) .appendTo (icons) .click (e => {
            goPrevNext (true);
            e .stopPropagation();
            return false;
          });
          let next = $('<div>', {class:'_nextButton lnr-chevron-right'}) .appendTo (icons) .click (e => {
            goPrevNext (false);
            e .stopPropagation();
            return false;
          });
        }
        head [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true);
        $('<div>', {class: '_heading', text: [] .concat (dataset .note? dataset .note: data [0] .name)}) .appendTo (head);
        if (!dataset .note && data [0] .note)
          $('<span>', {class: '_subheading', text: data [0] .note}) .appendTo (head);
      }
      if (position)
        graph .css (position)
        ui .ModalStack .add (
          e  => {return e && ! $.contains (graph .get (0), e .target) && graph .get (0) != e .target},
          () => {graph .removeClass ('fader_visible') .one ('transitionend', () => {graph .remove(); onClose()})},
          true
        );
      setTimeout (() => {graph .addClass ('fader_visible')}, 0);
    }
    var canvas = $('<canvas>') .appendTo (graph .children('._popupContent'));
    var chart;
    var config = {
      type: 'bar',
      options: {
        legend: {display: false},
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
        onClick: (e, elements) => {
          let element = chart .getElementAtEvent (e);
          if (element .length) {
            let html     = $(container .closest ('div:not(._popup)') [0]);
            let position = ui .calcPosition (graph, html, {top: 50, left: 50});
            this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_CLICK, {
              name:         name,
              id:           datasets [element [0] ._datasetIndex] .id,
              label:        labels   [element [0] ._index],
              labelIndex:   element [0] ._index,
              colorIndex:   datasets [element [0] ._datasetIndex] .colorIndex,
              data:         data,
              date:         Object .assign ({}, dataset .dates && dataset .dates [element [0] ._index + startCol]),
              position:     position,
              html:         html,
              altClick:     e .webkitForce > 1 || e .altKey,
              view:         this
            })
          } else {
            let pos = Chart .helpers .getRelativePosition (e, chart);
            if (pos .y > chart .chartArea .bottom) {
              let html     = $(container .closest ('div:not(._popup)') [0]);
              let position = ui .calcPosition (graph, html, {top: 50, left: 50});
              let xax      = chart .scales ['x-axis-0'];
              this._notifyObservers (NavigateViewEvent .BUDGET_GRAPH_CLICK, {
                name:         name + '_months',
                id:           dataset .groups .reduce ((l,g) => {return l .concat (g .id)}, []),
                date:         Object .assign ({}, dataset .dates [Math .floor ((pos .x - xax .left) / (xax .width / xax .ticks .length)) + startCol]),
                position:     position,
                html:         html,
                altClick:     e .webkitForce > 1 || e .altKey,
                view:         this
              });
            }
          }
          e .stopPropagation();
          return false;
        },
        tooltips: {
          backgroundColor: 'rgba(0,0,0,0.6)',
          callbacks: {
            label: (t, d) => {
              let gross = d .datasets [t .datasetIndex] .gross [t .index];
              return d .datasets [t .datasetIndex] .label + ': ' +Types .moneyDZ .toString (t .yLabel)
                + (gross? ' --- Before Tax: ' + Types .moneyDZ .toString (gross): '');
            }
          }
        },
        scales: {
          yAxes: [{
            stacked: true,
            ticks: {
              beginAtZero: true,
              userCallback: (value, index, values) => {
                return Types .moneyDZ .toString (value);
              }
            }
          }]
        }
      },
      data: {}
    };
    if (dataset .highlight != null) {
      var updating, needRedraw;
      var drawHighlightBox = (percent) => {
        let ctx          = chart .ctx;
        let chartArea    = chart .chartArea;
        let scale        = chart .scales ['x-axis-0'];
        let tickWidth    = scale .width / scale .ticks .length;
        let gco          = ctx .globalCompositeOperation;
        let margin       = 4;
        let boxWidth     = (tickWidth - margin * 2);
        let startX       = scale .left + dataset .highlight * tickWidth + (tickWidth/2) - boxWidth/2;
        if (startX > chartArea .left && startX < chartArea .right) {
          ctx .beginPath();
          ctx .rect (startX, 0, boxWidth, scale .bottom);
          ctx .lineWidth   = 4;
          ctx .strokeStyle = 'rgba(255,0,0,'+(percent * 0.3)+')';
          ctx .globalCompositeOperation = 'destination-over';
          ctx .stroke();
          ctx .globalCompositeOperation = gco;
          needRedraw       = false;
        }
      }
      config .options .animation = {
        onProgress: (ani) => {
          if (updating) {
            const start = 0.3;
            let   percent = ani .currentStep / ani .numSteps;
            if (percent > start)
              drawHighlightBox (Math .min (1, (percent - start) / (1 - start)));
          }
        },
        onComplete: () => {
          updating = false;
        }
      };
      config .plugins = [{
        beforeDatasetsUpdate: () => {updating = true},
        afterDatasetsDraw: (chart, complete) => {
          if (! updating)
            drawHighlightBox (1);
        },
        resize: () => {
          needRedraw = true;
        },
        afterDraw: () => {
          if (needRedraw) {
            drawHighlightBox (1);
            needRedraw = false;
          }
        }
      }];
    }
    setDataset();
    chart = new Chart (canvas .get (0) .getContext ('2d'), config);
    if (popup)
      ui .scrollIntoView (graph, false);
    var highlightCopy, colsCopy, datasetsCopy;
    var filter = (start, end) => {
      if (colsCopy == null) {
        highlightCopy = dataset .highlight;
        colsCopy      = dataset .cols .map (c => {return c});
        datasetsCopy  = datasets .map (ds => {
          ds = Object .assign ({}, ds);
          ds .data = ds .data .map (d => {return d});
          ds .gross = ds .gross .map (d => {return d});
          return ds;
        });
        startCol = 0;
        endCol   = dataset .cols .length - 1;
      }
      if (highlightCopy != null)
        dataset .highlight = highlightCopy - start;
      if (start > startCol) {
        /* remove from front */
        config .data .labels .splice (0, start - startCol);
        for (let ds of config .data .datasets) {
          ds .data .splice (0, start - startCol);
          ds .gross .splice (0, start - startCol);
        }
      } else
        /* add to front */
        for (let c = startCol - 1; c >= start; c--) {
          config .data .labels .splice (0, 0, colsCopy [c]);
          for (let i = 0; i < config .data .datasets .length; i++) {
            config .data .datasets [i] .data  .splice (0, 0, datasetsCopy [i] .data  [c]);
            config .data .datasets [i] .gross .splice (0, 0, datasetsCopy [i] .gross [c]);
          }
        }
      if (end < endCol) {
        /* remove from end */
        let deleteCount = endCol - end;
        let spliceStart = config .data .labels .length - deleteCount;
        config .data .labels .splice (spliceStart, deleteCount);
        for (let ds of config .data .datasets) {
          ds .data  .splice (spliceStart, deleteCount);
          ds .gross .splice (spliceStart, deleteCount);
        }
      } else
        /* add to end */
        for (let c = endCol + 1; c <= end; c++) {
          config .data .labels .push (colsCopy [c]);
          for (let i = 0; i < config .data .datasets .length; i++) {
            config .data .datasets [i] .data  .push (datasetsCopy [i] .data  [c]);
            config .data .datasets [i] .gross .push (datasetsCopy [i] .gross [c]);
          }
        }
      startCol = start;
      endCol   = end;
    }

    let findMatch = (list, ids) => {
      let cleanse = id => {
        if (id .startsWith ('leaf_'))
          return id .slice (5);
        else
          return id;
      }
      let cleanIds = [] .concat (ids) .map (id => {return cleanse (id)});
      return list .find (l => {
        return [] .concat (l .id) .find (id => {return cleanIds .includes (cleanse (id))})
      });
    };

    let updateOne = (update, upsert) => {
      let ds = findMatch (config .data .datasets, update .id);
      if (! ds && upsert) {
        ds = processData ({
          label: update .name,
          id:    update .id,
          data:  update .amounts .map (a => {return a.value}),
          gross: [],
          type:  update .type
        }, update .name, update .multipleGroups, update .stackPosition);
        let gt     = (a,b) => {return a[0] > b[0]? true: a[0] < b[0]? false: a[1] > b[1]? true: false};
        let insPos = update .stackPosition? chart .data .datasets .findIndex (d => {return gt (d .stackPosition, update .stackPosition)}): -1;
        if (insPos > 0)
          chart .data .datasets .splice (insPos, 0, ds);
        else
          chart .data .datasets .push (ds);
      }
      if (ds) {
        if (update .amounts) {
          if (datasetsCopy) {
            let dsc = findMatch (datasetsCopy, update .id);
            if (dsc) {
              dsc .data = update .amounts .map (a => {return a .value});
              ds  .data = dsc .data .slice (startCol, endCol + 1);
              dsc .gross = update .amounts .map (a => {return a .gross});
              ds  .gross = dsc .gross .slice (startCol, endCol + 1);
            }
          } else {
            ds .data  = update .amounts .map (a => {return a .value});
            ds .gross = update .amounts .map (a => {return a .gross});
          }
        }
        if (update .name != null)
          ds .label = update .name;
      }
      if (update .note !== undefined) {
        let head = graph .find ('div._heading');
        if (update .id .length > 1) {
          if (update .note)
            head .find ('> div._heading') .text (update .note);
        } else {
          if (update .name)
            head .find ('> div._heading') .text (update .name);
          let sub = head .find ('> span._subheading');
          if (sub .length && ! update .note)
            sub.remove();
          if (update .note) {
            if (sub .length == 0)
              sub = $('<span>', {class: '_subheading'}) .appendTo (head);
            sub .text (update .note);
          }
        }
      }
    };

    let update = updates => {
      for (let update of updates || [])
        if (update .dates)
          dataset .dates = update .dates;
        else if (update .highlight !== undefined)
          dataset .highlight = update .highlight? update .highlight: undefined;
        else if (update .name)
          name = update .name;

        else if (update .updateAll) {
          for (let u of update .updateAll)
            updateOne (u .update, true);
          let updIds = update .updateAll .map (u => {return {id: u .update .id}});
          let del = []
          for (let ds of chart .data .datasets)
            if (! findMatch (updIds, ds .id)) {
              if (ds .type == 'line')
                del .push (ds);
              else {
                for (let i=0; i < ds .data .length; i++)
                  ds .data [i] = 0;
              }
            }
          for (let d of del)
            chart .data .datasets .splice (chart .data .datasets .indexOf (d), 1);
        } else if (update .update)
          updateOne (update .update, false)

        else if (update .filterCols) {
          filter (update .filterCols .start, update .filterCols .end);

        } else if (update .replace) {
          dataset  = Object .assign ({}, update .replace);
          if (popup && dataset .groups .length)
            graph .find ('span._heading') .text (dataset .groups [0] .name);
          processDataset();
          setDataset();
          colsCopy = null;
          filter (startCol, endCol);
        }
      chart .update();
    }
    return update;
  }

  addGroup (name, toHtml) {
    var group = $('<div>', {class: name});
    if (toHtml)
      group .insertAfter (toHtml);
    else
      group .appendTo (this._content);
  }


  /**
   * addDoughnut
   */
  addDoughnut (data, name, popup, position, direction, onClose) {

    var setDataset = () => {
      labels   = data .cats .map (c => {return c .name});
      datasets = [{
        data:                 data .cats .map (c => {return Math .abs (c .amount)}),
        backgroundColor:      backgroundColors,
        hoverBackgroundColor: hoverBackgroundColors
      }];
      config .data .labels   = labels;
      config .data .datasets = datasets;
      config .centerLabel = [
        data .name,
        Types .moneyD .toString (data .cats .reduce ((s,c) => {
          return s + (! c .blackout? c .amount: 0)
        }, 0))
      ]
    }

    this._resetColors();
    var backgroundColors = data .cats .map (c => {
      if (c .amount != 0 && ! c .blackout) {
        var c = this._getColor (c .amount < 0? 0.2: c .isSecondary? 0.2: 0.5, true);
        if (c .amount != 0)
          this._nextColor (true);
      } else
        c = 'rgba(128,128,128,0.1)';
      return c;
    });
    this._resetColors();
    var hoverBackgroundColors = data .cats .map (c => {
      if (c .amount != 0 && ! c .blackout) {
        var c = this._getColor (c .isSecondary? 0.6: 0.9, true);
          this._nextColor (true);
      } else
        c = 'rgba(128,128,128,0.1)';
      return c;
    });
    var container = $('<div>', {class: '_' + data .name + (popup? ' _popup _popupNoContainer fader': '') }) .appendTo (this._html .find ('.' + name + 's'));
    if (popup) {
      if (position)
        container .css (position);
      ui .ModalStack .add (
        e  => {return e && ! $.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .removeClass ('fader_visible') .one ('transitionend', () => {container .remove(); onClose()})},
        true
      );
      setTimeout (() => {container .addClass ('fader_visible')}, 0);
    }
    var labels;
    var datasets;
    var canvas = $('<canvas>', {prop: {height: 200, width: 200}}) .appendTo (container);
    var config = {
      type: 'doughnut',
      options: {
        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'webkitmouseforcedown'],
        maintainAspectRatio: false,
        legend: {display: false},
        onClick: (e, elements) => {
          var index = elements .length? elements [0] ._index: undefined;
          var position = container .position();
          var aWidth   = container .width();
          var pWidth   = 200;
          var cWidth   = this._content .width();
          if (!direction || position .left + direction * 80 < 0 || position .left + direction * 80 + pWidth > cWidth)
            direction = position .left > cWidth / 2? -1: 1;
          position .left += 80 * direction + (aWidth - pWidth) / 2;
          position .top  += 40;
          if (index != null)
            this._notifyObservers (NavigateViewEvent .BUDGET_CHART_CLICK, {
              name:      name,
              id:        data .cats [index] .id,
              position:  position,
              html:      container .closest ('div:not(._popup)'),
              direction: direction,
              altClick:  e .webkitForce > 1 || e .altKey,
              view:      this
            });
          e .stopPropagation();
          return false;
        },
        tooltips: {
          backgroundColor: 'rgba(0,0,0,0.6)',
          callbacks: {
            title: (t, d) => {
              return d .labels [t [0] .index];
            },
            label: (t, d) => {
              return Types .moneyD .toString (d .datasets [0] .data [t.index]);
            }
          }
        }
      },
      data: {}
    }
    setDataset();
    var chart = new Chart (canvas .get (0). getContext ('2d'), config);
    return updates => {
      for (let update of updates || [])
        if (update .update) {
          var ds = data .cats .find (d => {return d .id == update .update .id});
          if (ds) {
            var idx = data .cats .indexOf (ds);
            if (update .update .name != null)
              config .data .labels [idx] = update .update .name;
            if (update .update .amounts != null) {
              data .cats [idx] .amount               = update .update .amounts [0] .value;
              config .data .datasets [0] .data [idx] = update .update .amounts [0] .value;
              config .centerLabel [1]                = Types .moneyD .toString (data .cats .reduce ((s,c) => {
                return s + (! c .blackout? c .amount: 0)
              }, 0))
            }
          }
        } else if (update .replace) {
        } else if (update .replace) {
          data = update .replace;
          setDataset();
        }
      chart .update();
    }
  }

  addHistoryTable (dataset, skipHead, skipFoot, popup, position, onClose, toHtml) {
    return this .addBudgetTable ('_budgetHistoryTable', dataset, skipHead, skipFoot, popup, position, toHtml, onClose, false);
  }

  /**
   * Add a budget table
   *   returns {
   *     cols:   array of column headers
   *     months: number of months (for computing average)
   *     income: total income
   *     highlight: column number to highlight
   *     groups: [{
   *       name: name for this group
   *       rows: [{
   *         name:    name for this row
   *         id:      category id for this row
   *         isCredit: true iff this is a credit amount
   *         amounts: array of (id, value) pairs, one for each column
   *       }]
   *     }]
   *   }
   */
  addBudgetTable (name, dataset, skipHead, skipFoot, popup, position, toHtml, onClose = () => {}, totalRows, title = '') {

    var table, tableTitle;
    var groupTrs = [];
    var rowMap   = new Map();
    var tfoot ;

    var updateFoot = () => {
      if (! skipFoot) {
        var totals = dataset .groups .reduce ((total, group) => {
          var groupTotal = group .rows .reduce ((groupTotal, row) => {
            return row .amounts .map ((a,i) => {
              return a .value * (row .isCredit? 1: -1) + (groupTotal [i] || 0);
            })
          }, []);
          return groupTotal .map ((a,i) => {
            return a + (total [i] || 0)
          })
        }, []);
        var curBal = ([] .concat (dataset .startBal)) [0] || 0;
        var balance = totals .map (a => {curBal += a; return curBal});
        var grandTotal = totals .reduce ((s,a) => {return s + a}, 0);
        totals = totals .concat (totalRows? [grandTotal / dataset .months, grandTotal]: []);
        var feet = [
          ['Net Cash Flow'] .concat (totals  .map (a => {return Types .moneyD .toString (a)})),
          ['Cash Balance']  .concat (balance .map (a => {return Types .moneyD .toString (a)}))
        ]
        tfoot .empty();
        for (let foot of feet) {
          var tr = $('<tr>') .appendTo (tfoot);
          for (let i=0; i<foot.length; i++)
            $('<td>', {
              text:  foot [i],
              class: (foot [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
            }) .appendTo (tr);
        }
      }
    }

    var updateGroup = group => {
      if (group) {
        var tr = groupTrs [dataset .groups .indexOf (group)];
        if (tr) {
          var totals = group .rows .reduce ((total, row) => {
            return row .amounts .map ((a,i) => {
              return a .value + (total [i] || 0)
            })
          },[]);
          if (totals .length == 0)
            totals = dataset .cols .map (c => {return ''})
          var grandTotal = totals .reduce ((s,a) => {return s + a}, 0);
          var vm = totals
            .concat (totalRows? [grandTotal / dataset .months, grandTotal]: [])
            .map (a => {return Types .moneyD .toString (a)});
          var values = [group .name]
            .concat (vm)
            .concat (totalRows? (dataset .income? Types .percent .toString (grandTotal / dataset .income): ['']): [])
          tr .empty();
          for (let i=0; i<values.length; i++)
            $('<td>', {
              text: values [i],
              class: (values [i] && values [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
            }) .appendTo (tr);
        }
      }
    }

    var updateIncome = income => {
      dataset .income = income;
      for (let group of dataset .groups) {
        var tr = groupTrs [dataset .groups .indexOf (group)];
        if (tr) {
          let tds = tr .children ('td');
          let totals = group .rows .reduce ((total, row) => {
            return row .amounts .map ((a,i) => {
              return a .value + (total [i] || 0)
            })
          },[]);
          if (totals .length == 0)
            totals = dataset .cols .map (c => {return ''})
          let grandTotal = totals .reduce ((s,a) => {return s + a}, 0);
          $(tds [tds .length -1]) .text (Types .percent .toString (grandTotal / dataset .income));
        }
      }
    }

    var updateRow = row => {
      var tr = rowMap .get (row .id);
      if (tr) {
        var isCredit = row .isCredit;
        var rowTotal = row .amounts .reduce ((s,a) => {return s + a .value}, 0);
        var vm = row .amounts
          .concat (totalRows? [{value: rowTotal / dataset .months}, {value: rowTotal}] : [])
          .map    (a => {return Types .moneyD .toString (a .value)})
        var vs = [row .name]
          .concat (vm)
          .concat (totalRows? (dataset .income? Types .percent .toString (rowTotal / dataset .income): ['']) : [])
        tr .empty();
        for (let i=0; i< vs.length; i++) {
          let td = $('<td>', {
            text: vs [i] || '',
            class: (vs [i] && vs [i] .charAt (0) == '-'? 'negative': '') + (dataset .highlight == i - 1? ' _highlight': '')
          }) .appendTo (tr);
          if (i > 0 && row .amounts [i-1] && row .amounts [i-1] .gross) {
            let tt;
            td .hover (
              e => {
                tt = $('<div>', {
                  class: '_toolTipNoPosition',
                  text: 'Before Tax: ' + Types .moneyDZ .toString (row .amounts [i-1] .gross),
                }) .appendTo (td);
                window .setTimeout (() => {
                  if (tt) {
                    tt .css (ui .calcPosition (td, td .offsetParent(), {top: -20, left: 8})) .fadeIn (UI_TOOL_TIP_FADE_MS);
                  }
                })
              },
              e => {
                tt .remove();
              });
          }
       }
      }
    }

    var addTable = () => {
      groupTrs  = [];
      rowMap    = new Map();
      if (title && popup)
        tableTitle = $('<div>', {class: '_tableTitle', text: title}) .appendTo (container .children());
      table = $('<table>', {class: name}) .appendTo (container .children());
      var thead = $('<thead>') .appendTo (table)
        .on ('click webkitmouseforcedown', e => {
          let target = $(e .originalEvent .target);
          let html   = target .offsetParent();
          this._notifyObservers (NavigateViewEvent .BUDGET_TABLE_TITLE_CLICK, {
            name:     name,
            date:     dataset .dates && dataset .dates [target .index() - 1],
            html:     html,
            position: {top: 20, left: 20},
            view:     this
          })
        })
      var tbody = $('<tbody>') .appendTo (table);
      tfoot = $('<tfoot>') .appendTo (table);
      table [0] .addEventListener ('webkitmouseforcewillbegin', e => {e .preventDefault()}, true)
      table .on ('click webkitmouseforcedown', 'tr', e => {
        let id       = $(e .currentTarget) .data ('id');
        let target   = e .target;
        let col      = target && target .cellIndex - 1;
        if (col == -1 && dataset .cols .length <= 1) {
          col    = 0;
          target = $(target) .next() [0];
        }
        target = $(target);
        let html     = target .offsetParent();
        let padding  = target.css ('padding-left');
        let position = ui .calcPosition (target, html, {top: 12, left: -8 + Number (padding .slice (0, padding .indexOf ('px')))})
        if (dataset .cols .length && (col == -1 || col >= dataset .cols .length)) {
          let prev = target .closest ('div.' + name);
          position .left = (prev .length? prev .position() .left + (prev .hasClass ('_popup')? 8: 0): 0) + 12;
        }
        if (id)
          this._notifyObservers (NavigateViewEvent .BUDGET_TABLE_CLICK, {
            name:     name,
            id:       id,
            date:     dataset .dates && (col >= 0 && col < dataset .dates .length? dataset .dates [col]: col >= 0 && col < dataset .cols .length? []: null),
            html:     html,
            position: position,
            altClick: e .originalEvent && (e .originalEvent .webkitForce > 1 || e .originalEvent .altKey),
            view:     this,
            dataset:  dataset
          })
          e .stopPropagation();
          return false;
      });
      var headTr = $('<tr>') .appendTo (thead);
      var cols   = ['Category'] .concat (dataset .cols) .concat (totalRows? ['Ave','Total','%Inc'] : []);
      if (! skipHead)
        for (let i=0; i<cols.length; i++)
          $('<th>', {text: cols [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (headTr);
      for (let group of dataset .groups) {
        if (!skipHead) {
          groupTrs .push ($('<tr>', {class: '_subtotal'}) .appendTo (tbody));
          updateGroup (group);
        }
        for (let row of group .rows) {
          rowMap .set (row .id, $('<tr>', {data: {id: row .id}}) .appendTo (tbody));
          updateRow (row);
        }
      }
      updateFoot();
      if (popup)
        ui .scrollIntoView (container);
    }

    /* addBudgetTable main */
    if (! toHtml || toHtml .length == 0) {
      toHtml = this._content .find ('.' + name + 's');
      if (toHtml .length == 0)
        toHtml = $('<div>', {class: name + 's'}) .appendTo ($('<div>', {class: '_budgetTableContainer'}) .appendTo (this._content));
    }
    var container = $('<div>', {class: name + (popup? ' _popup fader': '')}) .appendTo (toHtml) .append ('<div>');
    if (popup && position) {
      container .css (position);
      ui .ModalStack .add (
        e  => {return e && !$.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .removeClass ('fader_visible') .one ('transitionend', () => {container .remove(); onClose()})},
        true
      );
      setTimeout (() => {container .addClass ('fader_visible')}, 0);
    }
    addTable ();
    return updates => {
      for (let update of updates || [])
        if (update .update) {
          let group, row;
          outerLoop: for (let g of dataset .groups)
            for (let r of g .rows)
              if ([] .concat (r .id) .find (i => {return [] .concat (update .update .id) .includes (i)})) {
                if (update .update .name != null)
                  r .name    = update .update .name;
                if (update .update .amounts != null)
                  r .amounts = update .update .amounts;
                group = g;
                row   = r;
                break outerLoop;
              }
          if (group)
            updateGroup (group);
          if (row)
            updateRow   (row);
          if (group || row)
            updateFoot();
        } else if (update .updateIncome) {
          updateIncome (update .updateIncome);
        } else if (update .replace) {
          dataset = update .replace;
          table .remove();
          if (tableTitle)
            tableTitle .remove();
          addTable();
        }
    }
  }


  /**
   * addNetWorthGraph
   */
  addNetWorthGraph (dataset, toHtml, onClose) {
    var options = {
      legend: {display: true},
      tooltips: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        callbacks: {
          label: (t, d) => {
            return d .datasets [t .datasetIndex] .label + ': ' +Types .moneyD .toString (t .yLabel);
          }
        }
      },
      scales: {
        yAxes: [{
          stacked: true,
          ticks: {
            userCallback: (value, index, values) => {
              return Types .moneyD .toString (value);
            }
          }
        }]
      }
    }
    this._resetColors();this._nextColor();this._nextColor();this._nextColor();this._nextColor();
    var data = {
      labels:   dataset .cols,
      datasets: dataset .rows .map (r => {
        var ds = {
          label: r .name,
          data:  r .amounts,
          backgroundColor: this._getColor (0.05),
          borderColor: this._getColor (.5),
          borderWidth: 3,
          pointRadius: 0,
          pointHoverRadius: 0,
          pointHitRadius: 10
        }
        this._nextColor();
        return ds;
      })
    }
    var container = $('<div>', {class: '_netWorthGraphContainer'});
    if (toHtml)
      container .insertAfter (toHtml)
    else
      container .appendTo (this._content);
    var canvas = $('<canvas>', {class: '_netWorthGraph'}) .appendTo (container)
    var config = {
      type:    'line',
      data:    data,
      options: options
    };
    if (dataset .highlight != null) {
      var updating, needRedraw;
      var drawHighlightBox = (percent) => {
        let hColumn      = dataset .highlight .column != null? dataset .highlight .column: dataset .highlight;
        let hScale       = dataset .highlight .column != null? dataset .highlight .percentComplete : 1;
        let ctx          = chart .ctx;
        let chartArea    = chart .chartArea;
        let scale        = chart .scales ['x-axis-0'];
        let tickWidth    = scale .width / (scale .ticks .length - 1);
        let gco          = ctx .globalCompositeOperation;
        let startX       = scale .left + hColumn * tickWidth - tickWidth * (1 - hScale);
        ctx .beginPath();
        ctx .moveTo (startX, 0);
        ctx .lineTo (startX, scale .bottom);
        ctx .lineWidth   = 4;
        ctx .strokeStyle = 'rgba(255,0,0,'+(percent * 0.3)+')';
        ctx .globalCompositeOperation = 'destination-over';
        ctx .stroke();
        ctx .globalCompositeOperation = gco;
        needRedraw       = false;
      }
      config .options .animation = {
        onProgress: (ani) => {
          if (updating) {
            const start = 0.3;
            let   percent = ani .currentStep / ani .numSteps;
            if (percent > start)
              drawHighlightBox (Math .min (1, (percent - start) / (1 - start)));
          }
        },
        onComplete: () => {
          updating = false;
        }
      };
      config .plugins = [{
        beforeDatasetsUpdate: () => {updating = true},
        afterDatasetsDraw: (chart, complete) => {
          if (! updating)
            drawHighlightBox (1);
        },
        resize: () => {
          needRedraw = true;
        },
        afterDraw: () => {
          if (needRedraw) {
            drawHighlightBox (1);
            needRedraw = false;
          }
        }
      }];
    }
    var chart = new Chart (canvas .get (0). getContext ('2d'), config);
    var cur   = $('<div>', {class: '_curNetWorth'}) .appendTo (container);
    $('<div>', {text: Types .dateLong .toString (Types .date .today()), class:'_text'}) .appendTo (cur);
    var table = $('<table>') .appendTo (cur)
    var tfoot = $('<tfoot>') .appendTo (table);
    var tbody = $('<tbody>') .appendTo (table);
    for (let c of dataset .rows) {
      var tr = $('<tr>') .appendTo (tbody);
      $('<td>', {text: c .name})                             .appendTo (tr);
      $('<td>', {text: Types .moneyD .toString (c .curBal)}) .appendTo (tr);
    }
    var fvs = [
      ['Liquid', Types .moneyD .toString (dataset .rows .filter (r => {return r .liquid}) .reduce ((s,r) => {return s + r .curBal}, 0))],
      ['TOTAL',  Types .moneyD .toString (dataset .rows                                   .reduce ((s,r) => {return s + r .curBal}, 0))]
    ];
    for (let fv of fvs) {
      var tr = $('<tr>') .appendTo (tfoot);
      for (let v of fv)
        $('<td>', {text: v}) .appendTo (tr);
    }
    var startCol = 0;
    var endCol   = dataset .cols .length - 1;
    var highlightCopy, colsCopy, datasetsCopy;
    return updates => {
      for (let update of updates || []) {
        if (update .filterCols) {
          if (colsCopy == null) {
            highlightCopy = dataset .highlight .column != null? Object .assign ({}, dataset .highlight): dataset .highlight;
            colsCopy      = dataset .cols .map (c => {return c});
            datasetsCopy  = data. datasets .map (ds => {
              ds = Object .assign ({}, ds);
              ds .data = ds .data .map (d => {return d});
              return ds;
            });
          }
          if (highlightCopy != null) {
            if (highlightCopy .column)
              dataset .highlight .column = highlightCopy .column - update .filterCols .start;
            else
              dataset .highlight = highlightCopy - update .filterCols .start;
          }
          let config = chart .config;
          if (update .filterCols .start > startCol) {
            /* remove from front */
            config .data .labels .splice (0, update .filterCols .start - startCol);
            for (let ds of config .data .datasets)
              ds .data .splice (0, update .filterCols .start - startCol);
          } else
            /* add to front */
            for (let c = startCol - 1; c >= update .filterCols .start; c--) {
              config .data .labels .splice (0, 0, colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++) {
                config .data .datasets [i] .data .splice (0, 0, datasetsCopy [i] .data [c]);
              }
            }
          if (update .filterCols .end < endCol) {
            /* remove from end */
            let deleteCount = endCol - update .filterCols .end;
            let spliceStart = config .data .labels .length - deleteCount;
            config .data .labels .splice (spliceStart, deleteCount);
            for (let ds of config .data .datasets)
              ds .data .splice (spliceStart, deleteCount);
          } else
            /* add to end */
            for (let c = endCol + 1; c <= update .filterCols .end; c++) {
              config .data .labels .push (colsCopy [c]);
              for (let i = 0; i < config .data .datasets .length; i++)
                config .data .datasets [i] .data .push (datasetsCopy [i] .data [c]);
            }
          startCol = update .filterCols .start;
          endCol   = update .filterCols .end;
        }
      }
      chart .update();
    }
  }

  addNetWorthTable (dataset, popup, html, position, onClose) {

    let addSubTablePopup = (e, row) => {
      let target = $(e .target);
      let html   = target .offsetParent();
      this._notifyObservers (NavigateViewEvent .NETWORTH_TABLE_ROW_CLICK, {
        id:       row .id,
        view:     this,
        html:     html,
        position: ui .calcPosition (target, html, {top: 12, left: 0})
      });
    };

    let addPopup = (e, detail, isCredit) => {
      let target   = $(e .target);
      let column   = target .index();
      let html     = target .closest ('._list');
      let padding  = target.css ('padding-left');
      let position = ui .calcPosition (target, html, {top: 12, left: -103 + Number (padding .slice (0, padding .indexOf ('px')))});
      let popup;
      if (detail .intAmt || detail .addAmt || detail .subAmt || detail .infAmt) {
        popup = $('<div>', {class: '_popup _netWorthTable fader'})
          .appendTo (html)
          .append   ($('<div>', {class: '_popupContent'}))
          .click    (e => {
            e .stopPropagation();
          })
        let table = $('<table>') .appendTo (popup.children('._popupContent'));
        if ([detail .intAmt, detail .infAmt, detail .addAmt, detail .subAmt] .filter (v => {return v}) .length > 1) {
          let net = detail .intAmt + detail .infAmt + detail .addAmt + detail .subAmt;
          let row = $('<tr>') .appendTo ($('<tfoot>') .appendTo (table))
           .append ($('<td>', {text: 'Net ' + (net>=0 && !isCredit? 'Increase': 'Decrease')}))
           .append ($('<td>', {text: Types .moneyD .toString (net)}))
         if (net < 0)
           row .children ('td:nth-child(2)') .addClass ('negative');
        }
        let tbody = $('<tbody>') .appendTo (table);
        if (detail .intAmt)
          tbody .append ($('<tr>')
          .append ($('<td>', {text: isCredit? 'Interest': 'Earnings'}))
          .append ($('<td>', {text: Types .moneyD .toString (detail .intAmt)})));
        if (detail .infAmt)
          tbody .append ($('<tr>')
          .append ($('<td>', {text: 'Inflation'}))
          .append ($('<td>', {text: Types .moneyD .toString (detail .infAmt)})));
        let handleCellClick = (e, ids, cats) => {
          let target = $(e .target);
          let html   = target .offsetParent();
          this._notifyObservers (NavigateViewEvent .NETWORTH_TABLE_CLICK, {
            ids:       ids,
            cats:      cats,
            label:     dataset .cols [column - 1],
            column:    column,
            highlight: dataset .highlight,
            view:      this,
            html:      html,
            position:  ui .calcPosition (target, html, {top: 12, left: 0})
          })
        }
        if (detail .addAmt)
          $('<tr>')
            .appendTo (tbody)
            .append ($('<td>', {text: isCredit? 'Payments': 'Contributions'}))
            .append ($('<td>', {text: Types .moneyD .toString (detail .addAmt)}))
            .click  (ce => {handleCellClick (ce, detail .ids, detail .addCat)})
        if (detail .subAmt)
          $('<tr>')
            .appendTo (tbody)
            .append ($('<td>', {text: 'Withdrawals'}))
            .append ($('<td>', {text: Types .moneyD .toString (detail .subAmt), class: 'negative'}))
            .click  (ce => {handleCellClick (ce, detail .ids, detail .subCat)})
        popup .css (position);
        ui .ModalStack .add (
          e  => {return e && !$.contains (popup .get (0), e .target) && popup .get (0) != e .target},
          () => {popup .removeClass ('fader_visible') .one ('transitionend', () => {popup .remove()})},
          true
        );
        setTimeout (() => {popup .addClass ('fader_visible')},  UI_TOOL_TIP_FADE_MS);
        ui .scrollIntoView (popup);
      }
      e .stopPropagation();
      return  popup;
    }

    /** main code **/

    let table = $('<table>', {class: '_netWorthTable'});
    if (popup) {
      let container = $('<div>', {class: '_netWorthTable _popup fader'}) .appendTo (html) .append ($('<div>', {class: '_popupContent'}) .append (table))
      container .css (position);
      ui .ModalStack .add (
        e  => {return e && !$.contains (container .get (0), e .target) && container .get (0) != e .target},
        () => {container .removeClass ('fader_visible') .one ('transitionend', () => {container .remove(); onClose()})},
        true
      );
      setTimeout (() => {container .addClass ('fader_visible')});
    } else
      table .appendTo ($('<div>', {class: '_netWorthTableContainer' + (popup? ' _popup': '')}) .appendTo (this._content));
    let showHeadFoot = dataset .cols .length > 1;
    var buildTable = () => {
      table.empty();
      var thead = $('<thead>') .appendTo (table);
      var tbody = $('<tbody>') .appendTo (table);
      var tfoot = $('<tfoot>') .appendTo (table);
      if (showHeadFoot) {
        var tr    = $('<tr>') .appendTo (thead);
        var cols  = ['Account'] .concat (dataset .cols);
        for (let i=0; i<cols.length; i++)
          $('<th>', {text: cols [i], class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr);
      }
      var liquid = [];
      var net    = [];
      for (let row of dataset .rows) {
        var tr = $('<tr>') .appendTo (tbody);
        let vs = [row .name] .concat (
          row .amounts .map (a => {return Types .moneyK .toString (a)})
        )
        net = row .amounts .map ((a,i) => {return a + (net [i] || 0)});
        if (row .liquid)
          liquid = row .amounts .map ((a,i) => {return a + (liquid [i] || 0)});
        for (let i=0; i<vs.length; i++) {
          $('<td>', {html: vs [i]+'&nbsp;', class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr)
            .click (e => {
              if (i == 0)
                addSubTablePopup (e, row);
              else
                addPopup (e, row .detail [i-1], vs[i-1] .startsWith ('-'));
            })
         }
      }
      if (showHeadFoot) {
        var vss = [
          ['Liquid'] .concat (liquid .map (a => {return Types .moneyK .toString (a)})),
          ['TOTAL']  .concat (net    .map (a => {return Types .moneyK .toString (a)}))
        ]
        for (let vs of vss) {
          var tr = $('<tr>') .appendTo (tfoot);
          if (vs .slice (1) .find (v => {return v != ''}))
            for (let i = 0; i < cols .length; i++) {
              let td = $('<td>', {text: vs [i] || '', class: dataset .highlight == i - 1? '_highlight': ''}) .appendTo (tr);
              if (i > 0)
                td .click (e => {
                  let total = dataset .rows .reduce ((t, r) => {
                    if (vss .indexOf (vs) == 1 || r .liquid) {
                      for (let p of ['intAmt', 'addAmt', 'subAmt', 'infAmt'])
                        t [p] += r .detail [i-1] [p];
                    }
                    return t;
                  }, {addAmt: 0, subAmt: 0, intAmt: 0, infAmt: 0})
                  addPopup (e, total);
                });
             }
        }
      }
    }
    buildTable();
    return updates => {
      for (let update of updates || []) {
        if (update .replace) {
          dataset = update .replace;
          buildTable();
        }
      }
    }
  }
}

var NavigateViewEvent = Object.create (ViewEvent,{
  PROGRESS_GRAPH_CLICK:       {value: 201},
  BUDGET_CHART_CLICK:         {value: 202},
  BUDGET_GRAPH_CLICK:         {value: 203},
  BUDGET_GRAPH_TITLE_CLICK:   {value: 204},
  BUDGET_TABLE_CLICK:         {value: 205},
  BUDGET_TABLE_TITLE_CLICK:   {value: 206},
  PROGRESS_GRAPH_TITLE_CLICK: {value: 207},
  PROGRESS_SIDEBAR_CLICK:     {value: 208},
  NETWORTH_TABLE_CLICK:       {value: 209},
  NETWORTH_TABLE_ROW_CLICK:   {value: 210},
  BUDGET_GRAPH_PREV_NEXT:     {value: 211},
  BUDGET_GRAPH_GET_HISTORY:   {value: 212}
});



/*******************************/
/***** CHART JS EXTENSIONS *****/

var baseDoughnutController = Chart .controllers .doughnut;

Chart .controllers .doughnut = Chart .controllers .doughnut .extend ({

  draw: function() {
    baseDoughnutController .prototype .draw .apply (this, arguments);
    this._drawLabel (this .chart);
  },

  _drawLabel: function (thisChart) {
    var chart        = thisChart .chart;
    var ctx          = chart .ctx;
    var centerLabel  = thisChart .config .centerLabel;
    if (centerLabel && centerLabel [1]) {
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.font         = '20px Helvetica';
      ctx.fillStyle    = '#666666';
      ctx.fillText (centerLabel [0], chart .width / 2 , chart .height / 2 - 8);
      ctx.font         = '14px Helvetica';
      ctx.fillStyle    = '#888888';
      ctx.fillText (
        centerLabel [1],
        chart .width / 2 ,
        chart .height / 2 + 10
      );
    }
  }
});



