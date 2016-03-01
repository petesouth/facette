/*!
 * Facette - Web graphing front-end
 * @author   Vincent Batoufflet <vincent@facette.io>
 * @link     https://facette.io/
 * @license  BSD
 */

$(function () {

/*jshint
    browser: true,
    devel: true,
    jquery: true,
    trailing: true
 */

/*globals
    canvg,
    Highcharts,
    moment
 */

"use strict";

var $head = $(document.head),
    $body = $(document.body),
    $window = $(window);

// Get location path
var locationPath = String(window.location.pathname);

// Get URL prefix
var urlPrefix = $head.find('meta[name=url-prefix]').attr('content') || '',
    readOnly = $head.find('meta[name=read-only]').attr('content') == 'true';

/* Define */

var EVENT_KEY_TAB    = 9,
    EVENT_KEY_ENTER  = 13,
    EVENT_KEY_SHIFT  = 16,
    EVENT_KEY_ESCAPE = 27,
    EVENT_KEY_LEFT   = 37,
    EVENT_KEY_UP     = 38,
    EVENT_KEY_RIGHT  = 39,
    EVENT_KEY_DOWN   = 40,

    OPER_GROUP_TYPE_NONE      = 1,
    OPER_GROUP_TYPE_AVERAGE   = 2,
    OPER_GROUP_TYPE_SUM       = 3,
    OPER_GROUP_TYPE_NORMALIZE = 4,

    GRAPH_TYPE_AREA   = 1,
    GRAPH_TYPE_LINE   = 2,

    STACK_MODE_NONE    = 1,
    STACK_MODE_NORMAL  = 2,
    STACK_MODE_PERCENT = 3,

    PROXY_TYPE_SERIES = 1,
    PROXY_TYPE_GROUP = 2,

    MATCH_TYPE_SINGLE = 1,
    MATCH_TYPE_GLOB   = 2,
    MATCH_TYPE_REGEXP = 3,

    UNIT_TYPE_FIXED  = 1,
    UNIT_TYPE_METRIC = 2,

    CONSOLIDATE_AVERAGE = 1,
    CONSOLIDATE_LAST    = 2,
    CONSOLIDATE_MAX     = 3,
    CONSOLIDATE_MIN     = 4,
    CONSOLIDATE_SUM     = 5,

    GRAPH_DEFAULT_RANGE     = '-1h',
    GRAPH_DRAW_DELAY        = 250,
    GRAPH_LEGEND_ROW_HEIGHT = 24,
    GRAPH_SPACING_SIZE      = 16,

    GRAPH_PLOTLINE_COLORS = [
        '#16a085', '#27ae60', '#2980b9', '#8e44ad',
        '#2c3e50', '#f39c12', '#d35400', '#c0392b'
    ],

    LIST_FETCH_LIMIT = 50,

    PATTERN_TEST_LIMIT = 10,

    TIME_DISPLAY = 'MMMM D YYYY, HH:mm:ss',
    TIME_RFC3339 = 'YYYY-MM-DDTHH:mm:ss.SSSZ';

/* Extend: base */

if (!String.prototype.trim) {
    String.prototype.trim = function () {
        return this.replace(/^\s+|\s+$/g, '');
    };
}

if (!String.prototype.startsWith) {
    String.prototype.startsWith = function (string) {
        return this.substr(0, string.length) === string;
    };
}

if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (string) {
        return this.substr(-(string.length)) === string;
    };
}

if (!String.prototype.matchAll) {
    String.prototype.matchAll = function (regexp) {
        var matches = [],
            match,
            regexpStr,
            index;

        // Force RegExp global flag
        if (!regexp.global) {
            regexpStr = regexp.toString();
            index = regexpStr.lastIndexOf('/');
            regexp = new RegExp(regexpStr.substr(regexpStr.indexOf('/') + 1, index - 1), regexpStr.substr(index + 1) + 'g');
        }

        while ((match = regexp.exec(this))) {
            if (match.length === 0)
                continue;

            matches.push(match[1]);
        }

        return matches;
    };
}

/* Extend: jQuery */

$.event.props.push('dataTransfer');

$.fn.extend({
    inViewport: function () {
        var $element = $(this),
            viewTop = $window.scrollTop(),
            viewBottom = viewTop + $window.height(),
            elementTop = $element.offset().top,
            elementBottom = elementTop + $element.height();

        return elementTop <= viewBottom && elementBottom >= viewTop;
    },

    opts: function (attributeName) {
        if (!this.attr('data-' + attributeName + 'opts'))
            return {};

        return splitAttributeValue(this.attr('data-' + attributeName + 'opts'));
    }
});

/* Highcharts */
if (window.Highcharts) {
    Highcharts.drawTable = function (data) {
        var $container,
            chart = this,
            options = chart.options,
            cellLeft,
            columnKeys = ['min', 'avg', 'max', 'last'],
            groups = {},
            tableLeft = chart.plotLeft,
            tableTop = chart.plotTop + chart.plotHeight + GRAPH_SPACING_SIZE * 2.5,
            groupTimeout = {},
            groupEvent = function (e) {
                var $group = $(e.target).closest('.highcharts-table-group'),
                    series = $group.find('.highcharts-table-series').text();

                if (groupTimeout[series])
                    clearTimeout(groupTimeout[series]);

                groupTimeout[series] = setTimeout(function () {
                    if (e.type == 'mouseover')
                        $group.parent().find('.highcharts-table-action').css('visibility', 'hidden');

                    $group.children('.highcharts-table-action')
                        .css('visibility', e.type == 'mouseover' ? 'visible' : 'hidden');
                }, e.type == 'mouseenter' ? 0 : 500);
            };

        cellLeft = tableLeft;

        $container = $(chart.container);

        // Clean up previous table
        $container.find('.highcharts-table-group').remove();

        // Render custom legend
        $.each(chart.series, function (i, series) {
            var box,
                element,
                keys;

            groups[series.name] = chart.renderer.g()
                .attr({
                    'class': 'highcharts-table-group'
                })
                .add();

            if (!series.visible)
                $(groups[series.name].element).css('opacity', 0.35);

            element = chart.renderer.text('\uf176', tableLeft - GRAPH_LEGEND_ROW_HEIGHT * 0.5, tableTop +
                    i * GRAPH_LEGEND_ROW_HEIGHT + GRAPH_LEGEND_ROW_HEIGHT / 2)
                .attr({
                    'class': 'highcharts-table-action',
                    color: options.plotOptions.area.dataLabels.style.color
                })
                .css({
                    cursor: 'pointer',
                    display: 'none',
                    fontFamily: 'FontAwesome',
                    opacity: 0.25,
                    visibility: 'hidden'
                })
                .add(groups[series.name])
                .element;

            Highcharts.addEvent(element, 'click', function () {
                var $element = $(element),
                    series = chart.get($element.text());

                series.group.toFront();
            });

            Highcharts.addEvent(element, 'mouseenter mouseout', function (e) {
                $(e.target).css('opacity', e.type == 'mouseenter' ? 1 : 0.25);
                groupEvent(e);
            });

            element = chart.renderer.text(getHighchartsSymbol(series.symbol), tableLeft, tableTop +
                    i * GRAPH_LEGEND_ROW_HEIGHT + GRAPH_LEGEND_ROW_HEIGHT / 2)
                .css({
                    'color': series.color,
                })
                .add(groups[series.name])
                .element;

            Highcharts.addEvent(element, 'mouseenter mouseout', groupEvent);

            element = chart.renderer.text(series.name, tableLeft + GRAPH_LEGEND_ROW_HEIGHT, tableTop +
                    i * GRAPH_LEGEND_ROW_HEIGHT + GRAPH_LEGEND_ROW_HEIGHT / 2)
                .attr({
                    'class': 'highcharts-table-series'
                })
                .css({
                    cursor: 'pointer'
                })
                .add(groups[series.name])
                .element;

            Highcharts.addEvent(element, 'click', function () {
                var series = chart.get($(element).text());
                series.setVisible(!series.visible);
            });

            Highcharts.addEvent(element, 'mouseenter mouseout', groupEvent);

            // Update start position
            box = element.getBBox();
            cellLeft = Math.max(cellLeft, box.x + box.width + GRAPH_LEGEND_ROW_HEIGHT);

            // Update column keys list
            if (!data[series.name] || !data[series.name].summary)
                return;

            keys = Object.keys(data[series.name].summary);
            keys.sort();

            $.each(keys, function (i, key) { /*jshint unused: true */
                if (columnKeys.indexOf(key) != -1)
                    return;

                columnKeys.push(key);
            });
        });

        $.each(columnKeys, function (i, key) { /*jshint unused: true */
            var box,
                element,
                keyLeft = cellLeft,
                valueLeft = 0;

            $.each(chart.series, function (i, series) {
                var value,
                    elementOpts;

                // Draw series summary item label
                element = chart.renderer.text(key, keyLeft, tableTop + i * GRAPH_LEGEND_ROW_HEIGHT +
                        GRAPH_LEGEND_ROW_HEIGHT / 2)
                    .attr({
                        'class': 'highcharts-table-label'
                    })
                    .css({
                        color: options.plotOptions.area.dataLabels.style.color
                    })
                    .add(groups[series.name])
                    .element;

                if (valueLeft === 0) {
                    box = element.getBBox();
                    valueLeft = box.x + box.width + GRAPH_LEGEND_ROW_HEIGHT * 0.35;
                }

                // Get summary item value
                value = data[series.name] && data[series.name].summary && data[series.name].summary[key] !== undefined ?
                    data[series.name].summary[key] : null;

                // Generate element options object
                elementOpts = {unit_type: options._opts.unit_type};
                if (data[series.name].options)
                    elementOpts = $.extend(elementOpts, data[series.name].options);

                // Render summary item value
                element = chart.renderer.text(value !== null ? formatValue(value, elementOpts) : 'null',
                        valueLeft, tableTop + i * GRAPH_LEGEND_ROW_HEIGHT + GRAPH_LEGEND_ROW_HEIGHT / 2)
                    .attr({
                        'class': 'highcharts-table-value',
                        'data-name': series.name + '-' + key,
                        'data-value': value
                    })
                    .css({
                        cursor: 'pointer'
                    })
                    .add(groups[series.name])
                    .element;

                // Add item event
                Highcharts.addEvent(element, 'click', function (e) {
                    if (options.chart.events && options.chart.events.togglePlotLine)
                        options.chart.events.togglePlotLine.apply({
                            chart: chart,
                            element: e.target,
                            name: key,
                            series: series,
                            value: parseFloat($(e.target).closest('.highcharts-table-value').attr('data-value')) || null
                        });
                });

                // Calculate future position boundaries
                box = element.getBBox();
                cellLeft = Math.max(cellLeft, box.x + box.width + GRAPH_LEGEND_ROW_HEIGHT);
            });
        });

        // Attach events
        $container.closest('[data-graph]').on('mouseenter mouseleave', function (e) {
            $container.find('.highcharts-table-action').toggle(e.type == 'mouseenter');
        });
    };
}
/* Ajax */

$.ajaxSetup({
    complete: function (xhr) {
        var data = {};

        if (xhr.status < 400)
            return;

        try {
            data = JSON.parse(xhr.responseText);
        } catch (e) {}

        consoleToggle(data.message || $.t('main.mesg_unknown_error'));
    }
});

/* Utils */

function arrayUnique(array) {
    var result = [],
        length = array.length,
        i;

    for (i = 0; i < length; i++) {
        if (result.indexOf(array[i]) != -1)
            continue;

        result.push(array[i]);
    }

    return result;
}

function domFillItem(item, data, formatters) {
    var key;

    formatters = formatters || {};

    for (key in data) {
        if (typeof data[key] == "object")
            continue;

        item.find('.' + key).text(formatters[key] ? formatters[key](data[key]) : data[key]);
    }
}

function formatValue(value, opts) {
    var result;

    opts = opts || {};

    switch (opts.unit_type) {
    case UNIT_TYPE_FIXED:
        result = sprintf(opts.formatter || '%.2f', value);
        break;

    case UNIT_TYPE_METRIC:
        result = humanReadable(value, opts.formatter);
        break;

    default:
        result = value;
    }

    if (opts.unit)
        result += ' ' + opts.unit;

    return result;
}

function getURLParams() {
    var params = {};

    $.each(window.location.search.substr(1).split('&'), function (index, entry) {
        var pos = entry.indexOf('=');

        if (pos == -1)
            params[entry] = undefined;
        else
            params[entry.substr(0, pos)] = entry.substr(pos + 1);
    });

    return params;
}

function humanReadable(number, formatter) {
    var units = ['', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'],
        index;

    if (number === 0)
        return '0';

    index = parseInt(Math.log(Math.abs(number)) / Math.log(1000), 10);
    return sprintf(formatter || '%.2f', number / Math.pow(1000, index)) + (index > 0 ? ' ' + units[index] : '');
}

function parseFloatList(string) {
    return $.map(string.split(','), function (x) { return parseFloat(x.trim()); });
}

function rgbToHex(value) {
    var chunks;

    if (!value)
        return null;

    chunks = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*\d+)?\)$/);

    return '#' +
        ('0' + parseInt(chunks[1], 10).toString(16)).slice(-2) +
        ('0' + parseInt(chunks[2], 10).toString(16)).slice(-2) +
        ('0' + parseInt(chunks[3], 10).toString(16)).slice(-2);
}

function splitAttributeValue(attrValue) {
    var entries = $.map(attrValue.split(';'), $.trim),
        i,
        index,
        key,
        result = {},
        value;

    for (i in entries) {
        index = entries[i].indexOf(':');
        key   = entries[i].substr(0, index).trim();
        value = entries[i].substr(index + 1).trim();

        if ($.isNumeric(value))
            value = parseFloat(value);
        else if (['false', 'true'].indexOf(value.toLowerCase()) != -1)
            value = value.toLowerCase() == 'true';

        result[key] = value;
    }

    return result;
}

function timeToRange(duration) {
    var units = {
            d: 86400000,
            h: 3600000,
            m: 60000,
            s: 1000
        },
        chunks = [],
        count,
        unit,
        seconds,
        result;

    seconds = Math.abs(duration);

    for (unit in units) {
        count = Math.floor(seconds / units[unit]);

        if (count > 0) {
            chunks.push(count + unit);
            seconds %= units[unit];
        }
    }

    result = chunks.join(' ');

    if (duration < 0)
        result = '-' + result;

    return result;
}

function getHighchartsSymbol(symbolText) {
    var symbol;

    switch (symbolText) {
    case 'circle':
        symbol = '●';
        break;
    case 'diamond':
        symbol = '♦';
        break;
    case 'square':
        symbol = '■';
        break;
    case 'triangle':
        symbol = '▲';
        break;
    case 'triangle-down':
        symbol = '▼';
        break;
    }
    return symbol;
}

/* Setup */

var SETUP_CALLBACKS     = {},
    SETUP_CALLBACK_INIT = 0,
    SETUP_CALLBACK_TERM = 1;

function setupExec(callbackType) {
    var $deferreds = [],
        i;

    for (i in SETUP_CALLBACKS[callbackType])
        $deferreds.push(SETUP_CALLBACKS[callbackType][i]());

    return $.when.apply(null, $deferreds);
}

function setupRegister(callbackType, callback) {
    if (!SETUP_CALLBACKS[callbackType])
        SETUP_CALLBACKS[callbackType] = [];

    SETUP_CALLBACKS[callbackType].push(callback);
}

/* Console */

var $console;

function consoleSetupInit() {
    // Get main objects
    $console = $('#console');

    // Register links
    linkRegister('console-close', function () {
        consoleToggle(null);
    });

    consoleToggle(null);
}

function consoleToggle(message) {
    if (message && $console.is(':hidden'))
        $console.show();

    $console.children('.message').text(message);

    $console.animate({top: message ? 0 : $console.outerHeight(true) * -1}, 200, function () {
        if (!message)
            $console.hide();
    });
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, consoleSetupInit);

/* Overlay */

var OVERLAY_TEMPLATES = {},

    $overlay;

function overlayCreate(type, args) {
    var $input,
        $item,
        $select;

    if (!OVERLAY_TEMPLATES[type]) {
        console.error("Unable find `" + type + "' overlay");
        return;
    }

    $item = OVERLAY_TEMPLATES[type].clone().appendTo($overlay.show())
        .data('args', args)
        .on('click', 'button', function (e) {
            var $item,
                args,
                value = null;

            if (['cancel', 'reset', 'validate'].indexOf(e.target.name) == -1)
                return;

            $item = $(e.target).closest('[data-overlay]');
            args  = $item.data('args');

            if (args && args.callbacks) {
                if (type == 'prompt' || type == 'select') {
                    if (e.target.name == 'reset') {
                        value = args.reset;
                        e.target.name = 'validate';
                    } else {
                        value = $item.find('input[name=value]').val();
                    }
                }

                if (args.callbacks[e.target.name])
                    args.callbacks[e.target.name](value);

                if (args.callbacks.terminate)
                    args.callbacks.terminate();
            }

            overlayDestroy($item);
        });

    $body.on('keydown', overlayHandleKey);

    if (args) {
        if (args.message)
            $item.find('.message').html(args.message);

        if (args.labels) {
            $.each(args.labels, function (name, info) {
                var $label = $item.find('button[name=' + name + ']');

                if (info.text)
                    $label.text(info.text);

                if (info.style)
                    $label.addClass(info.style);
            });
        }

        if (type == 'prompt' || type == 'select') {
            if (type == 'select') {
                $select = $item.find('[data-select]');

                if (args.options)
                    $.each(args.options, function (i, value) { /*jshint unused: true */
                        $(document.createElement('option')).appendTo($select)
                            .attr('value', value[1])
                            .text(value[0]);
                    });

                selectInit($select.get(0));
            }

            $input = $item.find('input[type=text]:first');

            if (args.value)
                $input.val(args.value);

            if (args.reset === undefined)
                $item.find('button[name=reset]').remove();

            setTimeout(function () { $input.select(); }, 0);
        }
    }

    return $item;
}

function overlayDestroy(overlay) {
    if (typeof overlay == 'string')
        overlay = overlayMatch(overlay);

    if (overlay.length === 0)
        return;

    overlay.remove();

    if ($overlay.find('[data-overlay]').length === 0)
        $overlay.hide();

    $body.off('keydown', overlayHandleKey);
}

function overlayHandleKey(e) {
    if (e.which != 13 && e.which != 27)
        return;

    $overlay.children('[data-overlay]').each(function () {
        $(this).find('button[name=' + (e.which == 13 || e.which == 27 &&
            this.getAttribute('data-overlay') == 'alert' ? 'validate' : 'cancel') + ']').trigger('click');
    });

    e.preventDefault();
}

function overlayMatch(name) {
    return $overlay.children('[data-overlay=' + name + ']');
}

function overlaySetupInit() {
    // Initialize overlay
    $overlay = $('#overlay').hide();

    $overlay.find('.box, .loader').each(function () {
        var $item = $(this);
        OVERLAY_TEMPLATES[$item.attr('data-overlay')] = $item.detach();
    });
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, overlaySetupInit);

/* List */

var LIST_CALLBACKS = {},
    LIST_TIMEOUTS = {};

function listAppend(list, refNode) {
    var $item;

    if (typeof list == 'string')
        list = listMatch(list);

    // Append new item
    $item = list.data('template').clone()
        .attr('data-listitem', list.attr('data-list') + '-item' + list.data('counter'));

    list.data('counter', list.data('counter') + 1);

    if (refNode)
        $item.insertAfter(refNode);
    else
        $item.appendTo(list.data('container'));

    if ($item.is('[data-list]'))
        listInit($item.get(0));

    $item.find('[data-list]').each(function () {
        listInit(this);
    });

    return $item;
}

function listEmpty(list) {
    if (typeof list == 'string')
        list = listMatch(list);

    list.data({
        counter: 0,
        offset: 0
    });

    listGetItems(list).remove();

    listUpdateCount(list, 0);
}

function listGetCount(list, filter) {
    return listGetItems(list, filter).length;
}

function listGetItems(list, filter) {
    if (typeof list == 'string')
        list = listMatch(list);

    return list.find('[data-listitem^="' + list.attr('data-list') + '-item"]' + (filter || ''));
}

function listInit(element) {
    return $.Deferred(function ($deferred) {
        var $item = $(element),
            $template;

        if (!$.contains(document.documentElement, element)) {
            $deferred.resolve();
            return;
        }

        $template = $item.find('[data-listtmpl="' + element.getAttribute('data-list') + '"]')
            .removeAttr('data-listtmpl');

        $item.data({
            counter: 0,
            offset: 0,
            template: $template,
            container: $template.parent()
        });

        $template.detach();

        // Initialize list content
        listSay($item, null);

        if ($item.opts('list').init) {
            listUpdate($item).then(function () { $deferred.resolve(); });
        } else {
            listSay($item, $.t(($item.opts('list').messages || 'item') + '.mesg_none'), 'info');
            $deferred.resolve();
        }
    }).promise();
}

function listMatch(name, suffix) {
    suffix = suffix || '';
    return $('[data-list' + suffix + '="' + name + '"]');
}

function listNextName(list, attr) {
    var max = -1,
        prefix = attr.substr(5);

    if (typeof list == 'string')
        list = listMatch(list);

    listGetItems(list).each(function () {
        var name = this.getAttribute(attr),
            value;

        if (!name.startsWith(prefix))
            return;

        value = parseInt(name.replace(new RegExp('^' + prefix), ''), 10);

        if (!isNaN(value))
            max = Math.max(max, value);
    });

    return prefix + (max + 1);
}

function listRegisterItemCallback(name, callback) {
    LIST_CALLBACKS[name] = callback;
}

function listSay(list, text, type) {
    var $listmesg;

    if (typeof list == 'string')
        list = listMatch(list);

    $listmesg = list.find('[data-listmesg="' + list.attr('data-list') + '"]')
        .removeClass('success info warning error')
        .text(text || '')
        .toggle(text ? true : false);

    if (type)
        $listmesg.addClass(type);
}

function listSetupFilterInit() {
    var $filters;

    $filters = $('[data-listfilter]').each(function () {
        this.setAttribute('autocomplete', 'off');
        this._lastValue = '';

        // Get associated list
        this._list = $body.find('[data-list="' + this.getAttribute('data-listfilter') + '"]').get(0);
    });

    if ($filters.length > 0) {
        $body.on('keyup', '[data-listfilter]', function (e) {
            var listId = e.target.getAttribute('data-listfilter');

            if (e.which == 27)
                e.target.value = '';

            if (!e._force && e.target.value == e.target._lastValue)
                return;

            if (LIST_TIMEOUTS[listId])
                clearTimeout(LIST_TIMEOUTS[listId]);

            // Update list content
            LIST_TIMEOUTS[listId] = setTimeout(function () {
                listUpdate($(e.target._list), e.target.value);
                e.target._lastValue = e.target.value;
            }, 200);
        });
    }
}

function listSetupInit() {
    return $.Deferred(function ($deferred) {
        var $deferreds = [],
            $lists;

        $lists = $('[data-list]').each(function () {
            $deferreds.push(listInit(this));
        });

        $.when.apply(null, $deferreds).then(function () { $deferred.resolve(); });

        if ($lists.length > 0) {
            $body.on('click', '[data-listmesg] a', function (e) {
                var $target = $(e.target),
                    event = {
                        type: 'keyup',
                        _force: true
                    };

                if ($target.attr('href') == "#reset")
                    event.which = 27;
                else if ($target.attr('href') != "#retry")
                    return;

                $('[data-listfilter="' + $target.closest('[data-list]').attr('data-list') + '"]')
                    .trigger(event);

                e.preventDefault();
                e.stopImmediatePropagation();
            });
        }
    }).promise();
}

function listSetupMoreInit() {
    var $more;

    $more = $('[data-listmore]');

    if ($more.length > 0) {
        $body.on('click', '[data-listmore]', function (e) {
            var listId = e.target.getAttribute('data-listmore');
            listUpdate(listId, listMatch(listId, 'filter').val(), listGetCount(listId));
        });
    }
}

function listUpdate(list, listFilter, offset) {
    var query,
        timeout,
        url;

    offset = parseInt(offset, 10) || 0;

    if (typeof list == 'string')
        list = listMatch(list);

    // Set query timeout
    timeout = setTimeout(function () {
        overlayCreate('loader', {
            message: $.t('main.mesg_loading')
        });
    }, 500);

    // Empty list if not appending entries
    if (offset === 0) {
        listEmpty(list);
        listMatch(list.attr('data-list'), 'more').attr('disabled', 'disabled');
    }

    // Request data
    url = list.opts('list').url;

    query = {
        url: urlPrefix + '/api/v1/' + url,
        type: 'GET',
        data: {
            offset: offset,
            limit: LIST_FETCH_LIMIT
        }
    };

    if (listFilter)
        query.data.filter = 'glob:*' + listFilter + '*';

    return $.ajax(query).done(function (data, status, xhr) { /*jshint unused: true */
        var $item,
            name = list.attr('data-list'),
            namespace,
            records = parseInt(xhr.getResponseHeader('X-Total-Records'), 10),
            i;

        if (!data || data instanceof Array && data.length === 0) {
            namespace = list.opts('list').messages || 'item';

            if (listFilter) {
                listSay(list, $.t(namespace + '.mesg_load_nomatch'), 'warning');

                $(document.createElement('a')).appendTo(list.find('[data-listmesg]'))
                    .attr('href', '#reset')
                    .text($.t('list.labl_reset'));
            } else {
                listSay(list, $.t(namespace + '.mesg_none'), 'info');
            }

            return;
        }

        listSay(list, null);

        for (i in data) {
            if (typeof data[i] == 'string') {
                listAppend(list)
                    .attr('data-itemname', data[i])
                    .find('.name').text(data[i]);

                continue;
            }

            $item = listAppend(list)
                .attr('data-itemid', data[i].id);

            $item.find('.name').text(data[i].name);
            $item.find('.desc').text(data[i].description || $.t('main.mesg_no_description'));
            $item.find('.date span').text(moment(data[i].modified).format(TIME_DISPLAY));

            if (!data[i].description)
                $item.find('.desc').addClass('placeholder');

            // Execute item callback if any
            if (LIST_CALLBACKS[name])
                LIST_CALLBACKS[name]($item, data[i]);
        }

        listUpdateCount(list, records);

        if (listGetCount(list) < records)
            listMatch(list.attr('data-list'), 'more').removeAttr('disabled');
        else
            listMatch(list.attr('data-list'), 'more').attr('disabled', 'disabled');
    }).fail(function () {
        listEmpty(list);
        listSay(list, $.t('list.mesg_load_error'), 'error');

        $(document.createElement('a')).appendTo(list.find('[data-listmesg]'))
            .attr('href', '#retry')
            .text($.t('list.labl_retry'));
    }).always(function () {
        if (timeout)
            clearTimeout(timeout);

        overlayDestroy('loader');
    });
}

function listUpdateCount(list, count) {
    if (typeof list == 'string')
        list = listMatch(list);

    // Update list count
    list.find('h1 .count').text((count ? count : listGetCount(list)) || '');
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_TERM, listSetupInit);
setupRegister(SETUP_CALLBACK_TERM, listSetupFilterInit);
setupRegister(SETUP_CALLBACK_TERM, listSetupMoreInit);

/* Tree */

function treeAppend(tree) {
    // Append new item
    return tree.data('template').clone().appendTo(tree.children('.treecntr'));
}

function treeEmpty(tree) {
    tree.children('.treecntr').empty();
}

function treeInit(element) {
    return $.Deferred(function ($deferred) {
        var $item = $(element),
            $template;

        if (!$.contains(document.documentElement, element)) {
            $deferred.resolve();
            return;
        }

        $template = $item.find('.treetmpl:first').removeClass('treetmpl');
        $item.data('template', $template);
        $template.detach();

        $item.children('.placeholder').hide();

        // Initialize tree content
        treeUpdate($item).then(function () { $deferred.resolve(); });
    }).promise();
}

function treeMatch(name) {
    return $('[data-tree=' + name + ']');
}

function treeSetupInit() {
    return $.Deferred(function ($deferred) {
        var $deferreds = [];

        $('[data-tree]').each(function () {
            $deferreds.push(treeInit(this));
        });

        $.when.apply(null, $deferreds).then(function () { $deferred.resolve(); });
    }).promise();
}

function treeUpdate(tree) {
    var opts,
        query = {},
        timeout;

    if (typeof tree == 'string')
        tree = treeMatch(tree);

    // Set query timeout
    timeout = setTimeout(function () {
            overlayCreate('loader', {
            message: $.t('main.mesg_loading')
        });
    }, 500);

    // Request data
    opts = tree.opts('tree');

    if (opts.base)
        query.parent = opts.base;

    return $.ajax({
        url: urlPrefix + '/api/v1/' + opts.url,
        type: 'GET',
        data: query
    }).pipe(function (data) {
        var $item,
            i;

        treeEmpty(tree);
        tree.children('.placeholder').toggle(data.length === 0);

        if (data.length === 0)
            return;

        for (i in data) {
            $item = treeAppend(tree)
                .attr('data-treeitem', data[i].id)
                .attr('title', data[i].name);

            if (data[i].has_children)
                $item.addClass('folded');

            $item.find('.name').text(data[i].name);
        }

        for (i in data) {
            if (data[i].parent === null)
                continue;

            $('[data-treeitem=' + data[i].id + ']').detach()
                .appendTo($('[data-treeitem=' + data[i].parent + ']').children('.treecntr').hide());
        }

        treeUpdatePadding(tree);
    }).fail(function () {
        treeEmpty(tree);
    }).always(function () {
        if (timeout)
            clearTimeout(timeout);

        overlayDestroy('loader');
    });
}

function treeUpdatePadding(tree) {
    var $containers,
        marginBase,
        i = 0;

    if (typeof tree == 'string')
        tree = treeMatch(tree);

    $containers = tree.find('.treecntr');
    marginBase  = Math.abs(parseInt($containers.first().find('.treelabl').css('margin-left'), 10));

    $containers.each(function () {
        var margin = -(marginBase * i);

        $(this).closest('.treeitem').find('.treelabl').css({
            marginLeft: margin,
            marginRight: margin,
            paddingLeft: Math.abs(margin)
        });

        i += 1;
    });
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, treeSetupInit);

/* Tooltip */

var TOOLTIP_ACTIVE    = null,
    TOOLTIP_CALLBACKS = {},

    $tooltipTemplate;

function tooltipCreate(name, toggleCallback) {
    if (toggleCallback)
        TOOLTIP_CALLBACKS[name] = toggleCallback;

    // Remove any prexisting tooltip with the same name
    $('[data-tooltip="' + name + '"]').remove();

    return tooltipToggle($tooltipTemplate.clone().attr('data-tooltip', name), true);
}

function tooltipHandleClick(e) {
    if ($(e.target).closest('[data-tooltip]').length === 0)
        tooltipToggle(null, false);
}

function tooltipHandleKey(e) {
    if (e.which == 27)
        tooltipToggle(null, false);
}

function tooltipMatch(name) {
    return $('[data-tooltip="' + name + '"]');
}

function tooltipSetupInit() {
    // Get main objects
    $tooltipTemplate = $('[data-tooltip=template]').detach();
}

function tooltipToggle(tooltip, state) {
    // Apply on all tooltips if none specified
    if (!tooltip) {
        $('[data-tooltip]').each(function () { tooltipToggle($(this), state); });
        return;
    }

    if (typeof tooltip == 'string')
        tooltip = tooltipMatch(tooltip);

    state = typeof state == 'boolean' ? state : tooltip.is(':hidden');

    if (state) {
        if (!TOOLTIP_ACTIVE) {
            // Attach tooltip events
            $body
                .on('keydown', tooltipHandleKey)
                .on('click', tooltipHandleClick);
        }

        TOOLTIP_ACTIVE = tooltip;
    } else if (TOOLTIP_ACTIVE && tooltip.get(0) == TOOLTIP_ACTIVE.get(0)) {
        TOOLTIP_ACTIVE = null;

        // Detach tooltip events
        $body
            .off('keydown', tooltipHandleKey)
            .off('click', tooltipHandleClick);
    }

    if (TOOLTIP_CALLBACKS[tooltip.attr('data-tooltip')])
        TOOLTIP_CALLBACKS[tooltip.attr('data-tooltip')](state);

    return tooltip.toggle(state);
}

// Attach events
$window
    .on('resize', function () { tooltipToggle(null, false); });

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, tooltipSetupInit);

/* Menu */

var MENU_ACTIVE         = null,
    MENU_SCROLL_LOCKED  = false,
    MENU_SCROLL_TIMEOUT = null,

    $menuTemplate,
    $menuTemplateItem;

function menuAppend(menu) {
    if (typeof menu == 'string')
        menu = menuMatch(menu);

    return $menuTemplateItem.clone().appendTo(menu.find('[data-menucntr]'));
}

function menuCreate(name) {
    return $menuTemplate.clone()
        .attr('data-menu', name)
        .hide();
}

function menuEmpty(menu) {
    if (typeof menu == 'string')
        menu = menuMatch(menu);

    menu.find('[data-menuitem]').remove();
}

function menuHandleClick(e) {
    if ($(e.target).closest('[data-menu], [data-input], [data-select]').length === 0)
        menuToggle(null, false);
}

function menuHandleKey(e) {
    var $item,
        $items,
        $menucntr,
        $selected,
        position;

    // Stop if non-handled key
    if ([EVENT_KEY_ENTER, EVENT_KEY_TAB, EVENT_KEY_DOWN, EVENT_KEY_UP].indexOf(e.which) == -1 || !MENU_ACTIVE) {
        // Hide menu if <Escape> pressed
        if (e.which == EVENT_KEY_ESCAPE)
            menuToggle(MENU_ACTIVE, false);

        return;
    }

    e.preventDefault();

    if (MENU_SCROLL_TIMEOUT)
        clearTimeout(MENU_SCROLL_TIMEOUT);

    // Get current menu and selected item
    $items    = MENU_ACTIVE.find('[data-menuitem]');
    $selected = $items.filter('.selected');

    if (e.which == EVENT_KEY_ENTER || e.which == EVENT_KEY_TAB) {
        if (e.which == EVENT_KEY_TAB && (e.shiftKey || MENU_ACTIVE.closest('[data-input]').length === 0))
            return;

        // Execute action
        $selected.trigger({
            type: 'click',
            which: 1
        });

        menuToggle(MENU_ACTIVE, false);
        return;
    } else if (e.which == EVENT_KEY_UP) {
        MENU_SCROLL_LOCKED = true;

        // Select previous item
        $item = $selected.prevAll('[data-menuitem]:not(.noselect)').first();

        if ($item.length === 0)
            $item = $items.not('.noselect').last();
    } else if (e.which == EVENT_KEY_DOWN) {
        MENU_SCROLL_LOCKED = true;

        // Select next item
        $item = $selected.nextAll('[data-menuitem]:not(.noselect)').first();

        if ($item.length === 0)
            $item = $items.not('.noselect').first();
    }

    $item.addClass('selected').siblings().removeClass('selected');

    // Update scroll position
    position = $item.position();

    if (position) {
        $menucntr = MENU_ACTIVE.find('[data-menucntr]');

        if (position.top + $item.outerHeight(true) > $menucntr.innerHeight()) {
            $menucntr.scrollTop($menucntr.scrollTop() + position.top - $menucntr.innerHeight() +
                $item.outerHeight(true) + ($menucntr.outerHeight() - $menucntr.innerHeight()));
        } else if (position.top < 0) {
            $menucntr.scrollTop($menucntr.scrollTop() + position.top);
        }
    }

    if (MENU_SCROLL_LOCKED) {
        MENU_SCROLL_TIMEOUT = setTimeout(function () {
            MENU_SCROLL_LOCKED = false;
            $body.on('mousemove', '[data-menuitem]', menuHandleMouse);
        }, 200);
    }
}

function menuHandleMouse(e) {
    var $item;

    if (MENU_SCROLL_LOCKED)
        return;

    // Update selection state
    if (e.type == 'mouseenter' || e.type == 'mousemove') {
        $item = $(e.target).closest('[data-menuitem]');

        if (!$item.hasClass('noselect'))
            $item.addClass('selected').siblings().removeClass('selected');

        if (e.type == 'mousemove')
            $body.off('mousemove', '[data-menuitem]', menuHandleMouse);
    } else {
        $(e.target).closest('[data-menu]').find('[data-menuitem].selected')
            .removeClass('selected');
    }
}

function menuMatch(name) {
    return $('[data-menu="' + name + '"]');
}

function menuSay(menu, text, type) {
    if (typeof menu == 'string')
        menu = menuMatch(menu);

    menu.find('[data-menumesg]')
        .attr('data-menumesg', type || 'info')
        .text(text || '')
        .toggle(text ? true : false);

    if (text)
        menuToggle(menu, true);
}

function menuSetupInit() {
    // Get main objects
    $menuTemplate     = $('[data-menu=template]');
    $menuTemplateItem = $menuTemplate.find('[data-menuitem=template]').detach();

    $menuTemplate.detach();
}

function menuToggle(menu, state) {
    // Apply on all menus if none specified
    if (!menu) {
        $('[data-menu]').each(function () { menuToggle($(this), state); });
        return;
    }

    if (typeof menu == 'string')
        menu = menuMatch(menu);

    state = typeof state == 'boolean' ? state : menu.is(':hidden');

    if (state) {
        // Hide current visible menu and set the new one
        if (MENU_ACTIVE && menu.get(0) != MENU_ACTIVE.get(0)) {
            menuToggle(MENU_ACTIVE, false);
        } else if (!MENU_ACTIVE) {
            // Attach menu events
            $body
                .on('keydown', menuHandleKey)
                .on('mouseenter', '[data-menuitem]', menuHandleMouse)
                .on('mouseleave', '[data-menu]', menuHandleMouse);
        }

        MENU_ACTIVE = menu;

        // Unselect previously selected items
        menu.find('[data-menuitem].selected').removeClass('selected');
    } else if (MENU_ACTIVE && menu.get(0) == MENU_ACTIVE.get(0)) {
        MENU_ACTIVE = null;

        // Detach menu events
        $body
            .off('keydown', menuHandleKey)
            .off('mouseenter', '[data-menuitem]', menuHandleMouse)
            .off('mouseleave', '[data-menu]', menuHandleMouse);
    }

    menu.toggle(state);
}

// Attach events
$window
    .on('resize', function () { menuToggle(null, false); });

$body
    .on('click', menuHandleClick);

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, menuSetupInit);

/* Input */

var INPUT_CHECK_CALLBACKS    = {},
    INPUT_COMPLETE_CALLBACKS = {},
    INPUT_REQUESTS           = {},
    INPUT_TIMEOUTS           = {},

    $inputTemplate;

function inputGetSources(input, args) {
    var $field,
        items,
        sources = {};

    args = args || {};

    if (typeof input == 'string')
        input = inputMatch(input);

    $field = input.children(':input');

    // Set filter if any
    if ($field.val())
        args.filter = 'glob:' + $field.val() + '*';

    // Get sources requests
    items = $.map((input.opts('input').sources || '').split(','), $.trim) || [];

    $.each(items, function (i, item) { /*jshint unused: true */
        sources[item] = {
            url: urlPrefix + '/api/v1/' + item,
            type: 'GET',
            data: args
        };
    });

    return sources;
}

function inputHandleClick(e) {
    var $item = $(e.target).closest('[data-menuitem]'),
        $input = $(e.target).closest('[data-input]'),
        value = $item.data('value');

    $input.children(':input')
        .data('value', value)
        .val(value.name)
        .focus();

    menuToggle($input.attr('data-input'), false);
}

function inputHandleFocus(e) {
    var name = $(e.target).closest('[data-input]').attr('data-input');

    // Trigger change if value modified
    if (e.target.value != e.target._lastValue) {
        menuMatch(name).trigger({
            type: 'keydown',
            which: EVENT_KEY_ENTER
        });
    }

    // Reset completion state
    e.target._lastValue = null;

    // Abort current requests
    if (!INPUT_REQUESTS[name])
        return;

    $.each(INPUT_REQUESTS[name], function (i, request) { /*jshint unused: true */
        request.abort();
    });
}

function inputHandleKey(e) {
    var $input = $(e.target).closest('[data-input]');

    if ($input.opts('input').check)
        inputHandleKeyCheck(e);
    else if ($input.opts('input').sources)
        inputHandleKeyComplete(e);
}

function inputHandleKeyCheck(e) {
    var $input = $(e.target).closest('[data-input]'),
        name = $input.attr('data-input');

    if (INPUT_TIMEOUTS[name])
        clearTimeout(INPUT_TIMEOUTS[name]);

    INPUT_TIMEOUTS[name] = setTimeout(function () {
        if (INPUT_CHECK_CALLBACKS[name])
            INPUT_CHECK_CALLBACKS[name]($input);
    }, 1000);
}

function inputHandleKeyComplete(e) {
    var $target = $(e.target),
        $input = $target.closest('[data-input]'),
        $menu,
        inputOpts,
        length,
        name = $input.attr('data-input'),
        value;

    if (e.which == EVENT_KEY_SHIFT) {
        return;
    } else if (e.which == EVENT_KEY_ENTER) {
        // Validate completion
        e.target._lastValue = e.target.value;
        e.target.setSelectionRange(e.target.value.length, e.target.value.length);

        $target.trigger('change');

        return;
    } else if (e.which == EVENT_KEY_TAB) {
        if (!e.target._lastValue)
            return;

        $target.trigger({
            type: 'keyup',
            which: EVENT_KEY_ENTER
        });

        return;
    } else if (e.which == EVENT_KEY_ESCAPE) {
        // Reset completion field
        e.target.value = e.target.value !== e.target._lastValue ? e.target._lastValue : '';
        e.target._lastValue = null;

        $target
            .removeData('value');

        if (!$target.val())
            $target.trigger('change');

        return;
    } else if (e.which == EVENT_KEY_UP || e.which == EVENT_KEY_DOWN) {
        $menu  = menuMatch(name);
        length = e.target._lastValue ? e.target._lastValue.length : 0;
        value  = ($menu.find('[data-menuitem].selected').data('value') || {}).name;

        if (!value)
            return;

        e.target.value = value;
        e.target.setSelectionRange(length, value.length);

        return;
    }

    if (INPUT_TIMEOUTS[name])
        clearTimeout(INPUT_TIMEOUTS[name]);

    if (!e.target.value)
        $target.removeData('value');

    // Stop if ignore pattern found
    inputOpts = $input.opts('input') || {};
    if (inputOpts.ignorepattern && e.target.value.indexOf(inputOpts.ignorepattern) != -1) {
        menuToggle($menu, false);
        return;
    }

    // Stop if value didn't change or empty
    if (!e._autofill) {
        if (e.target.value == e.target._lastValue) {
            return;
        } else if (!e.target.value) {
            e.target._lastValue = null;
            return;
        }
    }

    INPUT_TIMEOUTS[name] = setTimeout(function () {
        var $menu = menuMatch(name),
            items = {},
            sources;

        // Get sources requests
        if (!INPUT_COMPLETE_CALLBACKS[name]) {
            sources = inputGetSources($input) || [];
        } else {
            sources = INPUT_COMPLETE_CALLBACKS[name]($input) || [];
        }

        if (sources.length === 0)
            return;

        INPUT_REQUESTS[name] = [];

        // Prepare menu
        if (!e._autofill) {
            menuSay($menu, 'Loading...');
            menuEmpty($menu);
        }

        // Execute completion requests
        $.each(sources, function (i, source) {
            items[i] = null;

            source.beforeSend = function (xhr) {
                xhr._source = i;
            };

            source.success = function (data, textStatus, xhr) { /*jshint unused: true */
                items[xhr._source] = {
                    data: data,
                    total: parseInt(xhr.getResponseHeader('X-Total-Records'), 10)
                };
            };

            if (e._autofill)
                source.data = $.extend(source.data, {limit: 1});

            INPUT_REQUESTS[name].push($.ajax(source));
        });

        // Call autocomplete callback when all sources have been fetched
        $.when.apply(null, INPUT_REQUESTS[name]).then(function () {
            var entries = [],
                source;

            if (e._autofill) {
                for (source in items) {
                    if (items[source].data.length === 0)
                        continue;

                    entries.push.apply(entries, items[source].data);
                }

                if (entries.length == 1 && items[source].total == 1) {
                    if (typeof entries[0] == 'string') {
                        entries[0] = {
                            name: entries[0],
                            source: source
                        };
                    } else {
                        entries[0].source = source;
                    }

                    $target
                        .data('value', entries[0])
                        .val(entries[0].name)
                        .trigger({
                            type: 'change',
                            _autofill: true
                        });

                    if (!e._init)
                        $target.select();
                }
            } else {
                inputUpdate($input, items);
            }

            delete INPUT_REQUESTS[name];
        });

        // Update completion field
        e.target._lastValue = e.target.value;
    }, 500);
}

function inputInit(element) {
    var $input,
        $element = $(element),
        $menu,
        inputOpts;

    element.value = element._lastValue = '';

    $input = $inputTemplate.clone().insertBefore(element)
        .attr('class', $element.attr('class'))
        .attr('data-input', $element.attr('data-input'))
        .attr('data-inputopts', $element.attr('data-inputopts'));

    $element.detach().appendTo($input)
        .removeAttr('class')
        .removeAttr('data-input')
        .removeAttr('data-inputopts');

    inputOpts = $input.opts('input');

    if (inputOpts.sources) {
        element.setAttribute('autocomplete', 'off');

        // Create new menu
        $menu = menuCreate(element.getAttribute('data-input')).appendTo($input)
            .attr('data-menu', $input.attr('data-input'));

        // Make width consistent
        $menu.css('min-width', $input.width());

        // Try to auto-fill input field
        if (inputOpts.autofill === undefined || inputOpts.autofill) {
            $input.find('input').trigger({
                type: 'keyup',
                _autofill: true
            });
        }
    }
}

function inputMatch(name) {
    return $('[data-input="' + name + '"]');
}

function inputRegisterCheck(name, callback) {
    // Register new check callback
    INPUT_CHECK_CALLBACKS[name] = callback;
}

function inputRegisterComplete(name, callback) {
    // Register new autocomplete callback
    INPUT_COMPLETE_CALLBACKS[name] = callback;
}

function inputSetupInit() {
    // Get main objects
    $inputTemplate = $('[data-input=template]').detach();

    // Initialize input items
    $('[data-input]').each(function () { inputInit(this); });

    // Focus on first autofocus field
    if (!('autofocus' in document.createElement('input')))
        $('[autofocus]:first').select();
}

function inputUpdate(input, data) {
    var $menu,
        count,
        field,
        name;

    if (typeof input == 'string')
        input = inputMatch(input);

    name  = input.attr('data-input');
    $menu = menuMatch(name);

    menuSay($menu, null);

    count = 0;

    $.each(data, function (source, entries) {
        if (!entries.data)
            return;

        $.each(entries.data, function (i, entry) { /*jshint unused: true */
            if (typeof entry == 'string') {
                entry = {
                    name: entry,
                    source: source
                };
            } else {
                entry.source = source;
            }

            menuAppend($menu)
                .attr('data-menuitem', name + count)
                .attr('data-menusource', source)
                .attr('title', entry.name)
                .data('value', entry)
                .text(entry.name);

            count++;
        });
    });

    menuToggle($menu, true);

    if ($menu.find('[data-menuitem]').length === 0) {
        menuSay($menu, $.t('main.mesg_nomatch'), 'warn');
    } else {
        field = input.children(':input').get(0);

        // Select first item from menu
        input.trigger({target: field, type: 'keydown', which: EVENT_KEY_DOWN});
        input.trigger({target: field, type: 'keyup', which: EVENT_KEY_DOWN});
    }
}

// Attach events
$body
    .on('click', '[data-input] [data-menuitem]', inputHandleClick)
    .on('focusout', '[data-input] :input', inputHandleFocus)
    .on('keyup', '[data-input] :input', inputHandleKey);

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, inputSetupInit);

/* Select */

var $selectTemplate;

function selectHandleChange(e) {
    var $target,
        $select;

    if (e._select)
        return;

    $target = $(e.target);
    $select = $target.closest('[data-select]');

    // Set current item
    $select.find('[data-menuitem="' + $target.val() + '"]').trigger({
        type: 'click',
        _init: e._init || false
    });
}

function selectHandleClick(e) {
    var $target = $(e.target),
        $item = $target.closest('[data-menuitem]'),
        $select = $target.closest('[data-select]');

    if ($item.length === 0) {
        menuToggle($select.attr('data-select'));
    } else {
        $select.find('[data-selectlabel]')
            .text($item.text());

        $select.children('select')
            .val($item.data('value'))
            .trigger({
                type: 'change',
                _init: e._init || false,
                _select: true
            });

        menuToggle($select.attr('data-select'), false);
    }
}

function selectHandleFocus(e) {
    // Toggle menu display
    if (e.type == 'focusin') {
        $body.on('keydown keyup', selectHandleKey);
    } else {
        $body.off('keydown keyup', selectHandleKey);
    }
}

function selectHandleKey(e) {
    var $select;

    if (e.type == 'keydown') {
        if ([EVENT_KEY_UP, EVENT_KEY_LEFT, EVENT_KEY_DOWN, EVENT_KEY_RIGHT].indexOf(e.which) != -1)
            e.preventDefault();

        return;
    }

    $select = $('[data-selectlabel]:focus').closest('[data-select]');

    if (menuMatch($select.attr('data-select')).is(':visible'))
        return;

    if (e.which == EVENT_KEY_UP || e.which == EVENT_KEY_LEFT)
        $select.find('[data-menuitem="' + $select.children('select').val() + '"]')
            .prev('[data-menuitem]').trigger('click');
    else if (e.which == EVENT_KEY_DOWN || e.which == EVENT_KEY_RIGHT)
        $select.find('[data-menuitem="' + $select.children('select').val() + '"]')
            .next('[data-menuitem]').trigger('click');
}

function selectInit(element) {
    var $element = $(element),
        $menu,
        $select;

    $select = $selectTemplate.clone().insertBefore(element)
        .attr('data-select', $element.attr('data-select'));

    // Create new menu
    $menu = menuCreate(element.getAttribute('data-select')).appendTo($select)
        .attr('data-menu', $select.attr('data-select'));

    $element.detach().appendTo($select)
        .removeAttr('data-select')
        .hide();

    // Set label focusable
    $select.find('[data-selectlabel]')
        .attr('tabindex', 0);

    selectUpdate(element);
}

function selectUpdate(element) {
    var $element = $(element),
        $select = $element.closest('[data-select]'),
        $menu = $select.find('[data-menu]');

    menuEmpty($menu);

    $element.children('option').each(function () {
        menuAppend($menu)
            .attr('data-menuitem', this.value)
            .data('value', this.value)
            .text($(this).text());
    });

    $element.trigger({
        type: 'change',
        _init: true
    });

    // Make width consistent
    if ($menu.width() > $select.width())
        $select.width($menu.width());
    else
        $menu.css('min-width', $select.width());
}

function selectSetupInit() {
    // Get main objects
    $selectTemplate = $('[data-select=template]').detach();

    // Initialize select items
    $('[data-select]').each(function () { selectInit(this); });
}

// Attach events
$body
    .on('change', '[data-select] select', selectHandleChange)
    .on('click', '[data-select] .selectlabel, [data-select] [data-menuitem]', selectHandleClick)
    .on('focusin focusout', '[data-select]', selectHandleFocus);

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, selectSetupInit);

/* Link */

var LINK_CALLBACKS = {};

function linkRegister(fragments, callback) {
    $.each($.map(fragments.split(' '), $.trim), function (i, fragment) { /*jshint unused: true */
        LINK_CALLBACKS[fragment] = callback;
    });
}

function linkHandleClick(e) {
    var fragment;

    for (fragment in LINK_CALLBACKS) {
        if (!e.target.href || !e.target.href.endsWith('#' + fragment))
            continue;

        if (e.target.getAttribute('disabled') != 'disabled')
            LINK_CALLBACKS[fragment](e);

        e.preventDefault();
    }
}

// Attach events
$body
    .on('click', 'a', linkHandleClick);

/* Admin */

var ADMIN_PANES         = {},
    ADMIN_FIELD_TIMEOUT = null;

function adminHandleFieldType(e) {
    if (ADMIN_FIELD_TIMEOUT)
        clearTimeout(ADMIN_FIELD_TIMEOUT);

    ADMIN_FIELD_TIMEOUT = setTimeout(function () {
        $(e.target).trigger({
            type: 'change',
            _typing: true
        });
    }, 200);
}

function adminHandlePaneStep(e, name) {
    name = $(e.target).closest('[data-pane]').attr('data-pane');

    if (e.target.name == 'step-ok')
        paneGoto(name, ADMIN_PANES[name].last);
    else if (e.target.name == 'step-prev' && ADMIN_PANES[name].active > 1)
        paneGoto(name, ADMIN_PANES[name].active - 1);
    else if (e.target.name == 'step-next' && ADMIN_PANES[name].active < ADMIN_PANES[name].count)
        paneGoto(name, ADMIN_PANES[name].active + 1);
}

function adminItemHandlePaneList(itemType) {
    var paneSection = paneMatch(itemType + '-list').opts('pane').section;

    // Register links
    linkRegister('show-info', function (e) {
        var $target = $(e.target),
            $item = $target.closest('[data-listitem]'),
            $tooltip;

        $tooltip = tooltipCreate('info', function (state) {
            $target.toggleClass('active', state);
            $item.toggleClass('action', state);
        }).appendTo($body)
            .css({
                top: $target.offset().top,
                left: $target.offset().left
            });

        $tooltip.html('<span class="label">id:</span> ' + $item.attr('data-itemid'));
    });

    linkRegister('show-' + itemType, function (e) {
        window.location = urlPrefix + '/browse/' + paneSection + '/' +
            $(e.target).closest('[data-itemid]').attr('data-itemid');
    });

    linkRegister('edit-' + itemType, function (e) {
        var $item = $(e.target).closest('[data-itemid]'),
            location;

        location = urlPrefix + '/admin/' + paneSection + '/' + $item.attr('data-itemid');
        if ($item.data('params'))
            location += '?' + $item.data('params');

        window.location = location;
    });

    linkRegister('clone-' + itemType, function (e) {
        var $item = $(e.target).closest('[data-itemid]');

        overlayCreate('prompt', {
            message: $.t(itemType + '.labl_' + itemType + '_name'),
            value: $item.find('.name').text() + ' (clone)',
            callbacks: {
                validate: function (data) {
                    if (!data)
                        return;

                    itemSave($item.attr('data-itemid'), paneSection, {
                        name: data
                    }, true).then(function () {
                        listUpdate(
                            $item.closest('[data-list]'),
                            $item.closest('[data-pane]').find('[data-listfilter=' + paneSection + ']').val()
                        );
                    });
                }
            },
            labels: {
                validate: {
                    text: $.t(itemType + '.labl_clone')
                }
            }
        });
    });

    linkRegister('remove-' + itemType, function (e) {
        var $item = $(e.target).closest('[data-itemid]');

        overlayCreate('confirm', {
            message: $.t(itemType + '.mesg_delete', {name: '<strong>' + $item.find('.name').text() + '</strong>'}),
            callbacks: {
                validate: function () {
                    itemDelete($item.attr('data-itemid'), paneSection)
                        .then(function () {
                            listUpdate($item.closest('[data-list]'),
                                $item.closest('[data-pane]').find('[data-listfilter=' + paneSection + ']').val());
                        })
                        .fail(function () {
                            overlayCreate('alert', {
                                message: $.t(itemType + '.mesg_delete_fail')
                            });
                        });
                }
            },
            labels: {
                validate: {
                    text: $.t(itemType + '.labl_delete'),
                    style: 'danger'
                }
            }
        });
    });
}

function adminItemHandlePaneSave(pane, itemId, itemType, callback) {
    var $item,
        paneSection = pane.opts('pane').section,
        paneParams = pane.data('redirect-params');

    $item = pane.find('input[name=' + itemType + '-name]');

    if (!$item.val()) {
        $item.closest('[data-input], textarea')
            .attr('title', $.t('main.mesg_field_mandatory'))
            .addClass('error');

        $item.focus();

        return;
    }

    itemSave(itemId, paneSection, callback(), null)
        .then(function () {
            PANE_UNLOAD_LOCK = false;
            window.location = urlPrefix + '/admin/' + paneSection + '/' + (paneParams ? '?' + paneParams : '');
        })
        .fail(function () {
            overlayCreate('alert', {
                message: $.t(itemType + '.mesg_save_fail')
            });
        });
}

function adminItemHandleReorder(e) {
    var $target = $(e.target),
        $item = $target.closest('[data-listitem]'),
        $itemNext;

    if (e.target.href.endsWith('#move-up')) {
        $itemNext = $item.prevAll('[data-listitem]:first');

        if ($itemNext.length === 0)
            return;

        $item.detach().insertBefore($itemNext);
    } else {
        $itemNext = $item.nextAll('[data-listitem]:first');

        if ($itemNext.length === 0)
            return;

        $item.detach().insertAfter($itemNext);
    }
}

function adminCollectionCreateGraph(value) {
    var $list = listMatch('step-1-graphs'),
        $item,
        id;

    $item = listAppend($list)
        .attr('data-graph', value.id)
        .data('value', value);

    domFillItem($item, value);

    $item.find('.toggle a[href=#hide-options]').hide();
    $item.find('.options').hide();

    // Make checkbox id unique
    id = 'graph-shown-item' + (listGetCount($list) - 1);

    $item.find('input[name=graph-shown]')
        .attr('id', id);
    $item.find('label[for=graph-shown]')
        .attr('for', id);

    return $item;
}

function adminCollectionGetData() {
    var $pane = paneMatch('collection-edit'),
        data = {
            name: $pane.find('input[name=collection-name]').val(),
            description: $pane.find('textarea[name=collection-desc]').val(),
            parent: ($pane.find('input[name=collection-parent]').data('value') || {id: null}).id,
            entries: []
        },
        refresh_interval = $pane.find('input[name=collection-refresh-interval]').val();

    if (refresh_interval)
        data.options = {refresh_interval: parseInt(refresh_interval, 10)};

    listGetItems('step-1-graphs').each(function () {
        var $item = $(this),
            $range = $item.find('input[name=graph-range]'),
            $title = $item.find('input[name=graph-title]'),
            options,
            value;

        options = {
            title: $title.val() || null,
            range: $range.val() || null,
            constants: $item.find('input[name=graph-constants]').val(),
            percentiles: $item.find('input[name=graph-percentiles]').val(),
            enabled: $item.find('input[name=graph-shown]').is(':checked')
        };

        options.constants = parseFloatList(options.constants);
        options.percentiles = parseFloatList(options.percentiles);

        value = $item.find('input[name=graph-sample]').val();
        if (value)
            options.sample = parseInt(value, 10);

        value = $item.find('input[name=graph-refresh-interval]').val();
        if (value)
            options.refresh_interval = parseInt(value, 10);

        data.entries.push({
            id: $item.attr('data-graph'),
            options: options
        });
    });

    return data;
}

function adminCollectionUpdatePlaceholder(item) {
    item.find('input[name=graph-title]').attr('placeholder', item.find('.name').text());
}

function adminCollectionSetupTerminate() {
    // Register admin panes
    paneRegister('collection-list', function () {
        adminItemHandlePaneList('collection');
    });

    paneRegister('collection-edit', function () {
        var collectionId = paneMatch('collection-edit').opts('pane').id || null;

        // Register completes and checks
        if ($('[data-input=graph]').length > 0) {
            inputRegisterComplete('graph', function (input) {
                return inputGetSources(input, {});
            });
        }

        if ($('[data-input=collection]').length > 0) {
            inputRegisterComplete('collection', function (input) {
                return inputGetSources(input, {
                    exclude: $(input).opts('input').exclude
                });
            });
        }

        if ($('[data-input=collection-name]').length > 0) {
            inputRegisterCheck('collection-name', function (input) {
                var value = input.find(':input').val();

                if (!value)
                    return;

                itemList({
                    filter: value
                }, 'collections').pipe(function (data) {
                    if (data.length > 0 && data[0].id != collectionId) {
                        input
                            .attr('title', $.t('collection.mesg_exists'))
                            .addClass('error');
                    } else {
                        input
                            .removeAttr('title')
                            .removeClass('error');
                    }
                });
            });
        }

        // Register pane steps
        paneStepRegister('collection-edit', 1, function () {
            if (collectionId)
                listSay('step-1-graphs', null);

            setTimeout(function () { $('[data-step=1] fieldset input:first').trigger('change').select(); }, 0);
        });

        paneStepRegister('collection-edit', 2, function () {
            setTimeout(function () { $('[data-step=2] :input:first').select(); });
        });

        // Register links
        linkRegister('edit-graph', function (e) {
            var $item = $(e.target).closest('[data-graph]'),
                location;

            location = urlPrefix + '/admin/graphs/' + $item.attr('data-graph');
            if ($item.data('params'))
                location += '?' + $item.data('params');

            window.location = location;
        });

        linkRegister('move-up move-down', adminItemHandleReorder);

        linkRegister('remove-graph', function (e) {
            var $target = $(e.target),
                $list = $target.closest('[data-list]');

            $target.closest('[data-listitem]').remove();

            listUpdateCount($list);

            if (listGetCount($list) === 0)
                listSay($list, $.t('graph.mesg_none'), 'info');

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('show-options hide-options', function (e) {
            var $item = $(e.target).closest('[data-listitem]');

            $item.find('.toggle a').toggle();
            $item.find('.options').toggle();
        });

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $fieldset,
                    $graph,
                    $item,
                    $list,
                    $target = $(e.target),
                    name;

                switch (e.target.name) {
                case 'graph-add':
                    if (e.target.disabled)
                        return;

                    $fieldset = $target.closest('fieldset');
                    $list     = listMatch('step-1-graphs');
                    $graph    = $fieldset.find('input[name=graph]');

                    if (!$graph.data('value')) {
                        if (!e._retry) {
                            $.ajax({
                                url: urlPrefix + '/api/v1/library/graphs/',
                                type: 'GET',
                                data: {
                                    filter: $graph.val()
                                },
                                dataType: 'json'
                            }).pipe(function (data) {
                                if (data)
                                    $graph.data('value', data[0]);

                                $target.trigger({
                                    type: 'click',
                                    _retry: true
                                });
                            });

                            return;
                        }

                        overlayCreate('alert', {
                            message: $.t('graph.mesg_unknown'),
                            callbacks: {
                                validate: function () {
                                    setTimeout(function () { $graph.select(); }, 0);
                                }
                            }
                        });

                        return;
                    }

                    $item = adminCollectionCreateGraph({
                        id: $graph.data('value').id,
                        name: $graph.val()
                    });

                    if ($graph.data('value').link)
                        $item.data('params', 'linked=1');

                    $item.find('input[name=graph-shown]').attr('checked', 'checked');

                    adminCollectionUpdatePlaceholder($item);

                    listSay($list, null);
                    listUpdateCount($list);

                    $graph.val('');

                    $graph
                        .trigger('change')
                        .focus();

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'step-cancel':
                    window.location = urlPrefix + '/admin/collections/';
                    break;

                case 'step-save':
                    adminItemHandlePaneSave($target.closest('[data-pane]'), collectionId, 'collection',
                        adminCollectionGetData);
                    break;

                case 'step-ok':
                case 'step-prev':
                case 'step-next':
                    adminHandlePaneStep(e, name);
                    break;
                }
            })
            .on('change', '[data-step=1] fieldset input', function (e) {
                var $target = $(e.target),
                    $fieldset = $target.closest('fieldset'),
                    $button = $fieldset.find('button[name=graph-add]');

                if (!$fieldset.find('input[name=graph]').val())
                    $button.attr('disabled', 'disabled');
                else
                    $button.removeAttr('disabled');

                // Select next item
                if (!e._typing && !e._autofill && $target.val())
                    $target.closest('[data-input]').nextAll('button:first').focus();
            })
            .on('change', '[data-step=1] .scrollarea input[type=checkbox]', function (e) {
                var $target = $(e.target);
                $target.closest('[data-listitem]').toggleClass('hidden', !$target.is(':checked'));
            })
            .on('change', '[data-step=1] .scrollarea :input, [data-step=2] :input', function (e) {
                PANE_UNLOAD_LOCK = true;

                if (e.target.name == 'graph-range')
                    adminCollectionUpdatePlaceholder($(e.target).closest('[data-graph]'));
            })
            .on('keyup', '[data-step=1] fieldset input', adminHandleFieldType);

        // Load collection data
        if (collectionId === null)
            return;

        itemLoad(collectionId, 'collections').pipe(function (data) {
            var $item,
                $listGraphs,
                $pane,
                i,
                query = {};

            $listGraphs = listMatch('step-1-graphs');

            for (i in data.entries) {
                $item = adminCollectionCreateGraph(data.entries[i]);
                $item.find('input[name=graph-title]').val(data.entries[i].options.title || '');
                $item.find('input[name=graph-range]').val(data.entries[i].options.range || '');
                $item.find('input[name=graph-sample]').val(data.entries[i].options.sample || '');
                $item.find('input[name=graph-constants]').val(data.entries[i].options.constants || '');
                $item.find('input[name=graph-percentiles]').val(data.entries[i].options.percentiles || '');

                if (data.entries[i].options.enabled)
                    $item.find('input[name=graph-shown]').attr('checked', 'checked');
                else
                    $item.addClass('hidden');

                if (data.entries[i].options.refresh_interval)
                    $item.find('input[name=graph-refresh-interval]').val(data.entries[i].options.refresh_interval);
            }

            $pane = paneMatch('collection-edit');

            $pane.find('input[name=collection-name]').val(data.name);
            $pane.find('textarea[name=collection-desc]').val(data.description);

            if (data.options && data.options.refresh_interval)
                $pane.find('input[name=collection-refresh-interval]').val(data.options.refresh_interval);

            if (data.parent) {
                itemLoad(data.parent, 'collections').pipe(function (data) {
                    $pane.find('input[name=collection-parent]')
                        .data('value', data)
                        .val(data.name);
                });
            }

            if ($listGraphs.data('counter') === 0)
                listSay($listGraphs, $.t('graph.mesg_none'));

            listUpdateCount($listGraphs);

            // Load missing graph data
            if (collectionId)
                query.collection = collectionId;

            itemList(query, 'graphs').pipe(function (data) {
                var info = {},
                    i;

                for (i in data)
                    info[data[i].id] = data[i];

                $listGraphs.find('[data-graph]').each(function () {
                    var $item = $(this),
                        id = $item.attr('data-graph');

                    if (!info[id]) {
                        $item.addClass('unknown');
                        info[id] = {name: $.t('graph.mesg_unknown')};
                    }

                    if (info[id].link)
                        $item.data('params', 'linked=1');

                    domFillItem($item, info[id]);
                    adminCollectionUpdatePlaceholder($item);
                });
            });
        });
    });
}

function adminGraphGetData(link) {
    var $pane,
        data;

    link = typeof link == 'boolean' ? link : false;

    if (link) {
        $pane = paneMatch('graph-link-edit');

        // Create linked graph structure
        data = {
            name: $pane.find('input[name=graph-name]').val(),
            link: $pane.find('input[name=graph]').data('value').id,
            attributes: {}
        };

        $pane.find('.graphattrs [data-listitem]').each(function () {
            var $item = $(this);
            data.attributes[$item.find('.key :input').val()] = $item.find('.value :input').val();
        });
    } else {
        $pane = paneMatch('graph-edit');

        // Create standard graph structure
        data = {
            name: $pane.find('input[name=graph-name]').val(),
            description: $pane.find('textarea[name=graph-desc]').val(),
            title: $pane.find('input[name=graph-title]').val(),
            type: parseInt($pane.find('select[name=graph-type]').val(), 10),
            stack_mode: parseInt($pane.find('select[name=stack-mode]').val(), 10),
            unit_legend: $pane.find('input[name=unit-legend]').val(),
            unit_type: parseInt($pane.find('input[name=unit-type]:checked').val(), 10),
            groups: adminGraphGetGroups()
        };

        // Append graph arguments if template
        if ($pane.data('template')) {
            data.template = true;

            // Set extra pane redirection parameters
            $pane.data('redirect-params', 'templates=1');
        }
    }

    return data;
}

function adminGraphGetGroup(entry) {
    var group,
        value;

    if (entry.attr('data-group')) {
        group = $.extend({
            series: [],
            options: {}
        }, adminGraphGetValue(entry));

        listMatch('step-2-groups').find('[data-group="' + entry.attr('data-group') + '"] .groupentry')
            .each(function () {
                group.series.push(adminGraphGetValue($(this)));
            });
    } else {
        value = $.extend({}, adminGraphGetValue(entry));

        group = {
            name: value && value.name || entry.attr('data-series'),
            type: OPER_GROUP_TYPE_NONE,
            series: [],
            options: $.extend({}, value.options)
        };

        delete value.options;
        group.series.push(value);
    }

    return group;
}

function adminGraphGetGroups() {
    var $listSeries = listMatch('step-stack-series'),
        $listStacks = listMatch('step-stack-groups'),
        count = 0,
        groups = [];

    // Retrieve defined stacks
    listGetItems($listStacks).each(function () {
        var $item = $(this);

        $item.find('.groupentry').each(function () {
            groups.push($.extend(adminGraphGetGroup($(this)), {stack_id: count}));
        });

        count++;
    });

    // Create new stack with remaining items
    listGetItems($listSeries, ':not(.linked)').each(function () {
        groups.push($.extend(adminGraphGetGroup($(this)), {stack_id: count}));
    });

    return groups;
}

function adminGraphGetValue(item) {
    if (item.data('source')) {
        if (item.hasClass('expand'))
            return item.data('source').data('expands')[item.attr('data-series')];
        else
            return item.data('source').data('value');
    } else {
        return item.data('value');
    }
}

function adminGraphCreateSeries(name, value) {
    var $item,
        $list = listMatch('step-1-metrics');

    // Set defaults
    if (!name)
        name = listNextName($list, 'data-series');

    if (!value.name)
        value.name = name;

    // Create new series
    $item = listAppend($list)
        .attr('data-series', name)
        .data({
            expands: {},
            proxies: [],
            renamed: false,
            value: value
        });

    domFillItem($item, value);

    return $item;
}

function adminGraphCreateGroup(name, value) {
    var $item,
        $list = listMatch('step-2-groups'),
        type;

    // Set defaults
    if (!name)
        name = listNextName($list, 'data-group');

    if (!value.name)
        value.name = name;

    // Create new group
    $item = listAppend($list)
        .attr({
            'data-group': name,
            'data-list': name
        })
        .data({
            proxies: [],
            value: value
        });

    $item.find('[data-listtmpl]')
        .attr('data-listtmpl', name);

    if (value.type == OPER_GROUP_TYPE_AVERAGE)
        type = 'average';
    else if (value.type == OPER_GROUP_TYPE_SUM)
        type = 'sum';
    else if (value.type == OPER_GROUP_TYPE_NORMALIZE)
        type = 'normalize';
    else
        type = '';

    // Update group
    domFillItem($item, {
        name: value.name,
        type: type
    });

    if (value.options) {
        if (value.options.color)
            $item.find('.color')
                .removeClass('auto')
                .css('color', value.options.color);

        if (value.options.scale)
            $item.find('a[href=#set-scale]').text(value.options.scale.toPrecision(3));

        if (value.options.unit)
            $item.find('a[href=#set-unit]').text(value.options.unit);

        $item.find('a[href=#set-consolidate]').text(adminGraphGetConsolidateLabel(value.options.consolidate ||
            CONSOLIDATE_AVERAGE));

        if (value.options.formatter)
            $item.find('a[href=#set-formatter]').text(value.options.formatter);
    }

    return $item;
}

function adminGraphCreateStack(value) {
    var $item,
        $list = listMatch('step-stack-groups'),
        name;

    // Set defaults
    name = listNextName($list, 'data-stack');

    if (!value.name)
        value.name = name;

    $item = listAppend($list)
        .attr({
            'data-stack': value.name,
            'data-list': value.name
        })
        .data('value', value);

    $item.find('[data-listtmpl]')
        .attr('data-listtmpl', name);

    domFillItem($item, {
        name: value.name,
    });

    return $item;
}

function adminGraphCreateProxy(type, item, list) {
    var $item,
        attr,
        name,
        value;

    switch (type) {
    case PROXY_TYPE_SERIES:
        attr = 'data-series';
        break;

    case PROXY_TYPE_GROUP:
        attr = 'data-group';
        break;

    default:
        console.error("Unknown `" + type + "' proxy type");
        return;
    }

    name = item.attr(attr);

    $item = listAppend(list)
        .attr(attr, name)
        .data('source', item);

    if ($item.attr('data-list') !== undefined)
        $item.attr('data-list', name).find('[data-listtmpl]').attr('data-listtmpl', name);

    item.data('proxies').push($item);

    // Update proxy
    value = $.extend({}, item.data('value'));

    if (type == PROXY_TYPE_GROUP) {
        if (value.type == OPER_GROUP_TYPE_AVERAGE)
            value.type = 'avg';
        else if (value.type == OPER_GROUP_TYPE_SUM)
            value.type = 'sum';
        else
            delete value.type;
    }

    domFillItem($item, value);

    if (value.options) {
        if (value.options.color)
            $item.find('.color')
                .removeClass('auto')
                .css('color', value.options.color);

        if (value.options.scale)
            $item.find('a[href=#set-scale]').text(value.options.scale.toPrecision(3));

        if (value.options.unit)
            $item.find('a[href=#set-unit]').text(value.options.unit);

        $item.find('a[href=#set-consolidate]').text(adminGraphGetConsolidateLabel(value.options.consolidate ||
            CONSOLIDATE_AVERAGE));

        if (value.options.formatter)
            $item.find('a[href=#set-formatter]').text(value.options.formatter);
    }

    return $item;
}

function adminGraphHandleSeriesDrag(e) {
    var $group,
        $item,
        $itemSrc,
        $listSeries,
        $target = $(e.target),
        chunks;

    if (['dragstart', 'dragend'].indexOf(e.type) == -1) {
        $group = $target.closest('.groupitem');

        if ($group.length !== 0) {
            $target = $group;
        } else if (e.target.tagName != 'A' || !$target.attr('href').replace(/\-[^\-]+$/, '').endsWith('#add')) {
            $target = null;
        }
    }

    switch (e.type) {
    case 'dragstart':
        if ($target.hasClass('linked') || !$target.attr('data-series') && !$target.attr('data-group'))
            return;

        $target.addClass('dragged');

        if ($target.attr('data-group'))
            e.dataTransfer.setData('text/plain', 'data-group=' + $target.attr('data-group'));
        else
            e.dataTransfer.setData('text/plain', 'data-series=' + $target.attr('data-series'));

        break;

    case 'dragend':
        e.preventDefault();
        $target.removeClass('dragged');
        break;

    case 'dragover':
        e.preventDefault();

        if ($target === null || !e.dataTransfer.getData('text/plain').startsWith('data-'))
            return;

        $target.addClass('dragover');
        e.dataTransfer.dropEffect = 'move';

        break;

    case 'dragleave':
        if ($target === null)
            return;

        $target.removeClass('dragover');

        break;

    case 'drop':
        e.preventDefault();

        if ($target === null)
            return;

        $target.removeClass('dragover');

        // Set item linked
        if (ADMIN_PANES['graph-edit'].active == 'stack')
            $listSeries = listMatch('step-stack-series');
        else
            $listSeries = listMatch('step-2-series');

        $listSeries.find('[' + e.dataTransfer.getData('text/plain') + ']')
            .addClass('linked');

        if (listGetCount($listSeries, ':not(.linked)') === 0)
            listSay($listSeries, $.t('graph.mesg_no_series'));

        // Handle drop'n'create
        if (e.target.tagName == 'A') {
            $target.trigger('click');
            $target = listMatch('step-' + ADMIN_PANES['graph-edit'].active + '-groups').find('.groupitem:last');
        }

        chunks = e.dataTransfer.getData('text/plain').split('=');

        if (chunks[0] == 'data-series') {
            $itemSrc = listMatch('step-2-series').find('[' + e.dataTransfer.getData('text/plain') + ']');

            $item = adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSrc.data('source'), $target);

            if ($itemSrc.hasClass('expand')) {
                $item.attr('data-series', chunks[1]);
                domFillItem($item, $itemSrc.data('source').data('expands')[chunks[1]]);
            }
        } else {
            $itemSrc = listMatch('step-stack-series').find('[' + e.dataTransfer.getData('text/plain') + ']');

            adminGraphCreateProxy(PROXY_TYPE_GROUP, $itemSrc.data('source'), $target);
        }

        // Remove item from stack
        if (ADMIN_PANES['graph-edit'].active != 'stack')
            listMatch('step-stack-groups').find('[' + e.dataTransfer.getData('text/plain') + '] a[href=#remove-item]')
                .trigger('click');

        break;
    }
}

function adminGraphRestorePosition() {
    var $parent = null,
        items = [];

    listGetItems('step-2-series').each(function () {
        var $item = $(this);

        if (!$parent)
            $parent = $item.parent();

        items.push([$item.detach(), adminGraphGetValue($item).position]);
    });

    items.sort(function (x, y) {
        return x[1] - y[1];
    });

    $.each(items, function (i, item) { /*jshint unused: true */
        item[0].appendTo($parent);
    });
}

function adminGraphAutoNameSeries(force) {
    var $items = listGetItems('step-1-metrics'),
        refCounts = {
            origin: [],
            source: [],
            metric: {}
        },
        refs = [],
        prefix,
        prefixLen,
        i;

    force = typeof force == 'boolean' ? force : false;

    $items.each(function () {
        var $item = $(this),
            value = adminGraphGetValue($item),
            fullName = value.origin+'/'+value.source+'/'+value.metric;

        if (refCounts.origin.indexOf(value.origin) == -1)
            refCounts.origin.push(value.origin);

        if (refCounts.source.indexOf(value.source) == -1)
            refCounts.source.push(value.source);

        if (!refCounts.metric[fullName]) {
            refCounts.metric[fullName] = {current: 1, count: 1};
        } else {
            refCounts.metric[fullName].current++;
            refCounts.metric[fullName].count++;
        }
    });

    $items.each(function (i) {
        var $item = $(this),
            value,
            fullName,
            matchLen;

        value = adminGraphGetValue($item);
        fullName = value.origin+'/'+value.source+'/'+value.metric;

        value.name = value.metric;

        if (refCounts.origin.length > 1) {
            value.name = value.origin + '/' + value.source + '/' + value.name;
        } else if (refCounts.source.length > 1) {
            value.name = value.source + '/' + value.name;
        }

        if (refCounts.metric[fullName].count > 1) {
            value.name += ' (' + (refCounts.metric[fullName].count - refCounts.metric[fullName].current) + ')';
            refCounts.metric[fullName].current--;
        }

        if (i === 0) {
            prefix = value.name;
            prefixLen = prefix.length;
        } else {
            matchLen = 0;

            while (++matchLen < prefixLen && matchLen < value.name.length) {
                if (value.name.charAt(matchLen) != prefix.charAt(matchLen))
                    break;
            }

            prefixLen = matchLen;
        }

        refs.push([$item, value]);
    });

    // Substract trailing word characters
    if (prefix && prefixLen)
        prefixLen -= (prefix.substr(0, prefixLen).match(/\w+$/) || '').length;

    for (i in refs) {
        if (refs[i][0].data('renamed') && !force)
            return;
        else if (force)
            refs[i][0].data('renamed', false);

        if (prefixLen > 1 && refs.length > 1)
            refs[i][1].name = refs[i][1].name.substr(prefixLen);

        domFillItem(refs[i][0], refs[i][1]);
    }
}

function adminGraphGetConsolidateLabel(type) {
    switch (type) {
        case CONSOLIDATE_AVERAGE:
            return 'avg';
        case CONSOLIDATE_LAST:
            return 'last';
        case CONSOLIDATE_MAX:
            return 'max';
        case CONSOLIDATE_MIN:
            return 'min';
        case CONSOLIDATE_SUM:
            return 'sum';
        default:
            return '';
    }
}

function adminGraphGetTemplatable(groups) {
    var $pane = paneMatch('graph-edit'),
        result = [],
        regexp,
        series,
        i, j;

    regexp = /\{\{\s*\.([a-z0-9]+)\s*\}\}/i;

    for (i in groups) {
        for (j in groups[i].series) {
            series = groups[i].series[j];
            result = result.concat((series.origin + '\x1e' + series.source + '\x1e' + series.metric).matchAll(regexp));
        }
    }

    if ($pane.data('template')) {
        result = result.concat($pane.find('textarea[name=graph-desc]').val().matchAll(regexp));
        result = result.concat($pane.find('input[name=graph-title]').val().matchAll(regexp));
    }

    result.sort();

    return arrayUnique(result);
}

function adminGraphUpdateAttrsList() {
    var $pane = paneMatch('graph-edit'),
        $listAttrs,
        $item,
        attrs,
        attrsData,
        i;

    // Generate graph arguments list
    $listAttrs = listMatch('step-3-attrs');

    attrs = adminGraphGetTemplatable(adminGraphGetGroups());

    if (attrs.length === 0) {
        listSay($listAttrs, $.t('graph.mesg_no_template_attr'), 'warning');
        $listAttrs.next('.mesgitem').hide();
        return;
    } else {
        $listAttrs.next('.mesgitem').show();
    }

    listSay($listAttrs, null);
    listEmpty($listAttrs);

    attrsData = $pane.data('attrs-data') || {};

    for (i in attrs) {
        $item = listAppend($listAttrs);
        $item.find('.key input').val(attrs[i]);

        if (attrsData[attrs[i]] !== undefined)
            $item.find('.value input').val(attrsData[attrs[i]]);
    }
}

function adminGraphSetupTerminate() {
    // Register admin panes
    paneRegister('graph-list', function () {
        listRegisterItemCallback('graphs', function (item, entry) {
            if (entry.template)
                item.find('a[href=#show-graph]').remove();
            else
                item.find('a[href=#add-graph]').remove();

            if (!entry.link)
                return;

            item.data('params', 'linked=1');

            item.find('.name')
                .attr('title', $.t('graph.mesg_linked'))
                .addClass('linked');
        });

        adminItemHandlePaneList('graph');

        // Register links
        linkRegister('add-graph', function (e) {
            window.location = urlPrefix + '/admin/graphs/add?linked=1&from=' +
                $(e.target).closest('[data-itemid]').attr('data-itemid');
        });
    });

    paneRegister('graph-edit', function () {
        var $pane = paneMatch('graph-edit'),
            graphId = $pane.opts('pane').id || null;

        // Register completes and checks
        if ($('[data-input=source]').length > 0) {
            inputRegisterComplete('source', function (input) {
                var $origin = input.closest('fieldset').find('input[name=origin]'),
                    params = {},
                    opts;

                opts = $origin.closest('[data-input]').opts('input');
                if (!opts.ignorepattern || $origin.val().indexOf(opts.ignorepattern) == -1)
                    params.origin = $origin.val();

                return inputGetSources(input, params);
            });
        }

        if ($('[data-input=metric]').length > 0) {
            inputRegisterComplete('metric', function (input) {
                var $fieldset = input.closest('fieldset'),
                    $origin = $fieldset.find('input[name=origin]'),
                    $source = $fieldset.find('input[name=source]'),
                    params = {},
                    opts;

                opts = $origin.closest('[data-input]').opts('input');
                if (!opts.ignorepattern || $origin.val().indexOf(opts.ignorepattern) == -1)
                    params.origin = $origin.val();

                opts = $source.closest('[data-input]').opts('input');
                if (!opts.ignorepattern || $source.val().indexOf(opts.ignorepattern) == -1)
                    params.source = ($source.data('value') && $source.data('value').source.endsWith('groups/') ?
                        'group:' : '') + $source.val();

                return inputGetSources(input, params);
            });
        }

        if ($('[data-input=graph-name]').length > 0) {
            inputRegisterCheck('graph-name', function (input) {
                var value = input.find(':input').val();

                if (!value)
                    return;

                itemList({
                    filter: value
                }, 'graphs').pipe(function (data) {
                    if (data.length > 0 && data[0].id != graphId) {
                        input
                            .attr('title', $.t('graph.mesg_exists'))
                            .addClass('error');
                    } else {
                        input
                            .removeAttr('title')
                            .removeClass('error');
                    }
                });
            });
        }

        // Register pane steps
        paneStepRegister('graph-edit', 1, function () {
            var $fieldset = $('[data-step=1] fieldset');

            $pane.find('button[name=auto-name]').show();

            $fieldset.find('button[name=metric-update], button[name=metric-cancel]').hide();

            if (graphId)
                listSay('step-1-metrics', null);

            setTimeout(function () { $fieldset.find('input:first').trigger('change').select(); }, 0);
        });

        paneStepRegister('graph-edit', 2, function () {
            var $items = listGetItems('step-1-metrics'),
                $listOpers,
                $listSeries,
                expand = false,
                expandQuery = [];

            $pane.find('button[name=auto-name]').hide();

            if ($items.length === 0) {
                overlayCreate('alert', {
                    message: $.t('metric.mesg_missing'),
                    callbacks: {
                        validate: function () {
                            setTimeout(function () { $('[data-step=1] fieldset input:first').select(); }, 0);
                        }
                    }
                });
                return false;
            }

            // Initialize list
            $listSeries = listMatch('step-2-series');
            $listOpers  = listMatch('step-2-groups');

            listEmpty($listSeries);

            $items.each(function () {
                var $item,
                    $itemSrc = $(this),
                    value = $itemSrc.data('value');

                $item = adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSrc, $listSeries);

                if (value.source.startsWith('group:') || value.metric.startsWith('group:')) {
                    expandQuery.push([value.origin, value.source, value.metric]);
                    expand = true;
                    $item.addClass('expandable');
                }

                if ($listOpers.find('[data-series="' + $itemSrc.attr('data-series') + '"]').length > 0)
                    $item.addClass('linked');
            });

            adminGraphRestorePosition();

            if (listGetCount($listSeries, ':not(.linked)') > 0)
                listSay($listSeries, null);

            // Retrieve expanding information
            if (expand) {
                $.ajax({
                    url: urlPrefix + '/api/v1/library/expand',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify(expandQuery)
                }).pipe(function (data) {
                    if (!data)
                        return;

                    listGetItems($listSeries).each(function (index) {
                        var $item = $(this);

                        if (!$item.hasClass('expandable')) {
                            $item.find('.count').remove();
                            $item.find('a[href$=#expand-series], a[href$=#collapse-series]').remove();
                            return;
                        }

                        if (data[index] && data[index].length > 0) {
                            $item.find('.count').text(data[index].length);

                            if (data[index].length > 1) {
                                $item.data('expand', data[index]);
                                $item.find('a[href$=#collapse-series]').remove();
                            }
                        } else {
                            $item.find('.count').text(0);
                            $item.find('a[href$=#expand-series], a[href$=#collapse-series]').remove();
                        }

                        // Restore expanded state
                        if (!$.isEmptyObject(listMatch('step-1-metrics').find('[data-series="' +
                                $item.attr('data-series') + '"]').data('expands')))
                            $item.find('a[href$=#expand-series]').trigger('click');
                    });
                });
            } else {
                $listSeries.find('.count').remove();
                $listSeries.find('a[href$=#expand-series], a[href$=#collapse-series]').remove();
            }
        });

        paneStepRegister('graph-edit', 3, function () {
            var $step = $('[data-step=3]');

            $pane.find('button[name=auto-name]').hide();

            $step.find('select:last').trigger('change');

            setTimeout(function () {
                selectUpdate($step.find('select[name=graph-unit]').get(0));
                $step.find(':input:first').select();
            });

            // Check for template
            $pane.find('.tmplattrs').toggle($pane.data('template'));

            if (!$pane.data('template'))
                return;

            // Generate graph arguments list
            adminGraphUpdateAttrsList();
        });

        paneStepRegister('graph-edit', 'stack', function () {
            var $listSeries = listMatch('step-stack-series'),
                $listStacks = listMatch('step-stack-groups');

            $pane.find('button[name=auto-name]').hide();

            listEmpty($listSeries);

            if (parseInt($('[data-step=3] select[name=stack-mode]').val(), 10) === STACK_MODE_NONE)
                listEmpty($listStacks);

            // Retrieve defined groups
            listGetItems('step-2-groups').each(function () {
                var $item,
                    $itemSrc = $(this);

                $item = adminGraphCreateProxy(PROXY_TYPE_GROUP, $itemSrc, $listSeries);

                if ($listStacks.find('[data-group="' + $itemSrc.attr('data-group') + '"]').length > 0)
                    $item.addClass('linked');

                $itemSrc.find('.groupentry').each(function () {
                    adminGraphCreateProxy(PROXY_TYPE_SERIES, $(this).data('source'), $item);
                });
            });

            // Create groups for each remaining items
            listGetItems('step-2-series').each(function () {
                var $item,
                    $itemMain,
                    $itemSrc = $(this),
                    value;

                if ($itemSrc.hasClass('linked')) {
                    $listStacks.find('[data-series="' + $itemSrc.attr('data-series') + '"]').remove();
                    return;
                }

                $itemMain = adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSrc.data('source'), $listSeries)
                    .attr('data-series', $itemSrc.attr('data-series'));

                if ($listStacks.find('[data-series="' + $itemSrc.attr('data-series') + '"]').length > 0)
                    $itemMain.addClass('linked');

                $item = adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSrc.data('source'), $itemMain);

                if ($itemSrc.hasClass('expand')) {
                    value = $itemSrc.data('source').data('expands')[$itemSrc.attr('data-series')];
                    $itemMain.find('.name:first').text(value.name);
                } else {
                    value = $itemSrc.data('source').data('value');
                }

                domFillItem($item, value);

                if ($itemSrc.hasClass('expand'))
                    $itemMain.addClass('expand');
            });

            if (listGetCount($listSeries, ':not(.linked)') > 0)
                listSay($listSeries, null);
        });

        // Register links
        linkRegister('add-average add-sum add-normalize add-stack', function (e) {
            var operGroupType;

            if (e.target.href.endsWith('-stack')) {
                // Add stack group
                adminGraphCreateStack({});
            } else {
                if (e.target.href.endsWith('-average'))
                    operGroupType = OPER_GROUP_TYPE_AVERAGE;
                else if (e.target.href.endsWith('-sum'))
                    operGroupType = OPER_GROUP_TYPE_SUM;
                else if (e.target.href.endsWith('-normalize'))
                    operGroupType = OPER_GROUP_TYPE_NORMALIZE;
                else
                    return;

                adminGraphCreateGroup(null, {type: operGroupType});
            }

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('collapse-series', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series]'),
                $series,
                collapse,
                name = $item.attr('data-series').split('-')[0];

            // Collapse expanded series
            $series = listMatch('step-2-groups').find('[data-series^="' + name + '-"]');

            collapse = function () {
                $item.data('source').data('expands', {});

                $item.siblings('[data-series="' + name + '"]').removeClass('linked');
                $item.siblings('[data-series^="' + name + '-"]').andSelf().remove();

                $series.remove();

                PANE_UNLOAD_LOCK = true;
            };

            if ($series.length > 0) {
                overlayCreate('confirm', {
                    message: $.t('graph.mesg_collapse'),
                    callbacks: {
                        validate: collapse
                    },
                    labels: {
                        validate: {
                            text: $.t('graph.labl_collapse'),
                            style: 'danger'
                        }
                    }
                });
            } else {
                collapse();
            }
        });

        linkRegister('expand-series', function (e) {
            var $target = $(e.target),
                $item,
                $itemSrc = $target.closest('[data-series]'),
                $itemRef = $itemSrc,
                $listSeries = $itemSrc.closest('[data-list]'),
                data = $itemSrc.data('expand'),
                expands = $itemSrc.data('source').data('expands'),
                i,
                name = $itemSrc.attr('data-series'),
                seriesName;

            // Expand series
            for (i in data) {
                seriesName = name + '-' + i;

                $item = adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSrc.data('source'), $listSeries)
                    .attr('data-series', seriesName)
                    .addClass('expand');

                $item.detach().insertAfter($itemRef);

                if (!expands[seriesName]) {
                    expands[seriesName] = {
                        name: (adminGraphGetValue($itemSrc).name || name) + ' (' + i + ')',
                        origin: data[i][0],
                        source: data[i][1],
                        metric: data[i][2]
                    };
                }

                domFillItem($item, expands[seriesName]);

                if (expands[seriesName].options) {
                    if (expands[seriesName].options.color)
                        $item.find('.color')
                            .removeClass('auto')
                            .css('color', expands[seriesName].options.color);

                    if (expands[seriesName].options.scale !== 0)
                        $item.find('a[href=#set-scale]').text(expands[seriesName].options.scale);

                    if (expands[seriesName].options.unit !== 0)
                        $item.find('a[href=#set-unit]').text(expands[seriesName].options.unit);

                    if (expands[seriesName].options.consolidate !== 0)
                        $item.find('a[href=#set-consolidate]').text(expands[seriesName].options.consolidate);

                    if (expands[seriesName].options.formatter !== 0)
                        $item.find('a[href=#set-formatter]').text(expands[seriesName].options.formatter);
                }

                $item.find('.count').remove();
                $item.find('a[href$=#expand-series]').remove();

                if (parseInt(i, 10) === 0)
                    $itemSrc.addClass('linked');

                $itemRef = $item;
            }

            adminGraphRestorePosition();

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('move-up move-down', function (e) {
            var $target = $(e.target),
                $item = $target.closest('.listitem, .groupitem, .groupentry'),
                $itemNext;

            if (e.target.href.endsWith('#move-up')) {
                $itemNext = $item.prevAll('.listitem, .groupitem, .groupentry').filter(':not(.linked):first');

                if ($itemNext.length === 0)
                    return;

                $item.detach().insertBefore($itemNext);
            } else {
                $itemNext = $item.nextAll('.listitem, .groupitem, .groupentry').filter(':not(.linked):first');

                if ($itemNext.length === 0)
                    return;

                $item.detach().insertAfter($itemNext);
            }

            // Save positions
            if (ADMIN_PANES['graph-edit'].active == 'stack' || !$item.hasClass('listitem'))
                return;

            listGetItems('step-2-series').each(function () {
                var $item = $(this);
                adminGraphGetValue($item).position = $item.index();
            });
        });

        linkRegister('remove-group', function (e) {
            var $item,
                $target = $(e.target),
                data,
                i;

            // Remove operation group item
            $item = $target.closest('.groupitem');
            $item.find('.groupentry a[href=#remove-item]').trigger('click');

            // Remove proxy items
            data = $item.data('proxies');

            for (i in data)
                data[i].remove();

            $item.remove();

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('remove-item', function (e) {
            var $target = $(e.target),
                $entry = $target.closest('.groupentry'),
                $item;

            // Remove item from group
            if ($entry.attr('data-group'))
                $item = $target.closest('[data-step]').find('[data-group="' + $entry.attr('data-group') + '"]')
                    .removeClass('linked');
            else
                $item = $target.closest('[data-step]').find('[data-series="' + $entry.attr('data-series') + '"]')
                    .removeClass('linked');

            listSay(ADMIN_PANES['graph-edit'].active == 'stack' ? 'step-stack-series' : 'step-2-series', null);

            $target.parent().remove();

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('remove-metric', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-listitem]'),
                $list = $target.closest('[data-list]'),
                data,
                i;

            // Unselect active item before removal
            if ($item.hasClass('active'))
                $item.trigger('click');

            // Remove proxy items
            data = $item.data('proxies');

            for (i in data)
                data[i].remove();

            $item.remove();

            listUpdateCount($list);

            if (listGetCount($list) === 0)
                listSay($list, $.t('metric.mesg_none'), 'info');

            adminGraphAutoNameSeries();

            PANE_UNLOAD_LOCK = true;

            $('[data-step=1] fieldset input[name=origin]').focus();
        });

        linkRegister('rename-series rename-group rename-stack', function (e) {
            var $target = $(e.target),
                $input,
                $item,
                $overlay,
                attrName,
                seriesName,
                value;

            if (e.target.href.endsWith('#rename-stack'))
                attrName = 'data-stack';
            else if (e.target.href.endsWith('#rename-group'))
                attrName = 'data-group';
            else
                attrName = 'data-series';

            $item     = $target.closest('[' + attrName + ']');
            seriesName = $item.attr(attrName);

            value = adminGraphGetValue($item).name;

            $overlay = overlayCreate('prompt', {
                message: $.t(attrName == 'data-stack' ? 'graph.labl_stack_name' : 'graph.labl_series_name'),
                callbacks: {
                    validate: function (data) {
                        if (!data)
                            return;

                        adminGraphGetValue($item).name = data;

                        paneMatch('graph-edit').find('[' + attrName + '="' + seriesName + '"]').each(function () {
                            $(this).find('.name:first').text(data);
                        });

                        if (attrName == 'data-series') {
                            $item.data('source').data('renamed', true);
                            $pane.find('button[name=auto-name]').removeAttr('disabled');
                        }

                        PANE_UNLOAD_LOCK = true;
                    }
                }
            });

            $input = $overlay.find('input[type=text]')
                .attr({
                    'data-input': 'rename-item',
                    'data-inputopts': 'check: true'
                });

            inputInit($input.get(0));

            $input.val(value);

            inputRegisterCheck('rename-item', function (input) {
                var valueNew = input.find(':input').val(),
                    values = [];

                listGetItems('step-1-metrics').add(listGetItems('step-2-groups')).each(function () {
                    var $item = $(this),
                        seriesName;

                    values.push($(this).data('value').name);

                    if (!$item.data('expands'))
                        return;

                    for (seriesName in $item.data('expands'))
                        values.push($item.data('expands')[seriesName].name);
                });

                if (values.indexOf(valueNew) != -1) {
                    input
                        .attr('title', $.t('graph.mesg_item_exists'))
                        .addClass('error');

                    $overlay.find('button[name=validate]')
                        .attr('disabled', 'disabled');
                } else {
                    input
                        .removeAttr('title')
                        .removeClass('error');

                    $overlay.find('button[name=validate]')
                        .removeAttr('disabled');
                }
            });
        });

        linkRegister('set-color', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series], [data-group]'),
                $color = $item.find('.color'),
                $overlay;

            $overlay = overlayCreate('prompt', {
                message: $.t('graph.labl_color'),
                callbacks: {
                    validate: function (data) {
                        var value;

                        PANE_UNLOAD_LOCK = true;

                        value = adminGraphGetValue($item);

                        if (!data) {
                            $color
                                .addClass('auto')
                                .removeAttr('style');

                            if (value.options)
                                delete value.options.color;

                            return;
                        }

                        $color
                            .removeClass('auto')
                            .css('color', data);

                        value.options = $.extend(value.options || {}, {
                            color: data
                        });
                    }
                },
                labels: {
                    reset: {
                        text: $.t('main.labl_reset_default')
                    },
                    validate: {
                        text: $.t('graph.labl_color_set')
                    }
                },
                reset: ''
            });

            $overlay.find('input[name=value]')
                .attr('type', 'color')
                .val(!$color.hasClass('auto') ? rgbToHex($color.css('color')) : '#ffffff');
        });

        linkRegister('set-scale', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series], [data-group]'),
                $scale = $item.find('a[href=#set-scale]'),
                value = adminGraphGetValue($item);

            $.ajax({
                url: urlPrefix + '/api/v1/library/scales/values',
                type: 'GET'
            }).pipe(function (data) {
                var $input,
                    $overlay,
                    options = [],
                    scaleValue = value.options && value.options.scale ? value.options.scale : '';

                $.each(data, function (i, entry) { /*jshint unused: true */
                    options.push([entry.name, entry.value]);
                });

                $overlay = overlayCreate('select', {
                    message: $.t('graph.labl_scale'),
                    value: scaleValue,
                    callbacks: {
                        validate: function (data) {
                            data = parseFloat(data);

                            value.options = $.extend(value.options || {}, {
                                scale: data
                            });

                            $scale.text(data ? data.toPrecision(3) : '');
                        }
                    },
                    labels: {
                        validate: {
                            text: $.t('graph.labl_scale_set')
                        }
                    },
                    reset: 0,
                    options: options
                });

                $input = $overlay.find('input[name=value]');

                $overlay.find('select')
                    .on('change', function (e) {
                        if (e.target.value)
                            $input.val(e.target.value);
                    })
                    .val(scaleValue)
                    .trigger({
                        type: 'change',
                        _init: true
                    });
            });
        });

        linkRegister('set-unit', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series], [data-group]'),
                $unit = $item.find('a[href=#set-unit]'),
                value = adminGraphGetValue($item);

            $.ajax({
                url: urlPrefix + '/api/v1/library/units/labels',
                type: 'GET'
            }).pipe(function (data) {
                var $input,
                    $overlay,
                    options = [],
                    unitValue = value.options && value.options.unit ? value.options.unit : '';

                $.each(data, function (i, entry) { /*jshint unused: true */
                    options.push([entry.name, entry.label]);
                });

                $overlay = overlayCreate('select', {
                    message: $.t('graph.labl_unit'),
                    value: unitValue,
                    callbacks: {
                        validate: function (data) {
                            value.options = $.extend(value.options || {}, {
                                unit: data
                            });

                            $unit.text(data || '');
                        }
                    },
                    labels: {
                        validate: {
                            text: $.t('graph.labl_unit_set')
                        }
                    },
                    reset: 0,
                    options: options
                });

                $input = $overlay.find('input[name=value]');

                $overlay.find('select')
                    .on('change', function (e) {
                        if (e.target.value)
                            $input.val(e.target.value);
                    })
                    .val(unitValue)
                    .trigger({
                        type: 'change',
                        _init: true
                    });
            });
        });

        linkRegister('set-consolidate', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series], [data-group]'),
                $input,
                $overlay,
                value = adminGraphGetValue($item),
                consolidateValue = value.options && value.options.consolidate ?
                    value.options.consolidate : CONSOLIDATE_AVERAGE;

            $overlay = overlayCreate('select', {
                message: $.t('graph.labl_consolidate'),
                value: consolidateValue,
                callbacks: {
                    validate: function (data) {
                        data = parseInt(data, 10);

                        value.options = $.extend(value.options || {}, {
                            consolidate: data
                        });

                        $item.find('a[href=#set-consolidate]').text(adminGraphGetConsolidateLabel(data));
                    }
                },
                labels: {
                    validate: {
                        text: $.t('graph.labl_consolidate_set')
                    }
                },
                reset: 0,
                options: [
                    [$.t('graph.labl_consolidate_average'), CONSOLIDATE_AVERAGE],
                    [$.t('graph.labl_consolidate_last'), CONSOLIDATE_LAST],
                    [$.t('graph.labl_consolidate_max'), CONSOLIDATE_MAX],
                    [$.t('graph.labl_consolidate_min'), CONSOLIDATE_MIN],
                    [$.t('graph.labl_consolidate_sum'), CONSOLIDATE_SUM],
                ]
            });

            $overlay.find('button[name=reset]').hide();

            $overlay.find('.select')
               .addClass('full')
               .find('.menu .menuitem:first').remove();

            $input = $overlay.find('input[name=value]').hide();

            $overlay.find('select')
                .on('change', function (e) {
                    if (e.target.value)
                        $input.val(e.target.value);
                })
                .val(consolidateValue)
                .trigger({
                    type: 'change',
                    _init: true
                });
        });

        linkRegister('set-formatter', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-series], [data-group]'),
                $formatter = $item.find('a[href=#set-formatter]'),
                value = adminGraphGetValue($item);

            overlayCreate('prompt', {
                message: $.t('graph.labl_formatter'),
                callbacks: {
                    validate: function (data) {
                        value.options = $.extend(value.options || {}, {
                            formatter: data
                        });

                        $formatter.text(data || '');
                    }
                },
                labels: {
                    validate: {
                        text: $.t('graph.labl_formatter_set')
                    }
                },
                reset: ''
            });
        });

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $entry,
                    $entryActive,
                    $fieldset,
                    $list,
                    $metric,
                    $source,
                    $origin,
                    name,
                    metricName;

                // Find closest button for browsers triggering event from children element
                if (e.target.tagName != 'BUTTON')
                    e.target = $(e.target).closest('button').get(0);

                switch (e.target.name) {
                case 'auto-name':
                    if (e.target.disabled)
                        return;

                    adminGraphAutoNameSeries(true);
                    $pane.find('button[name=auto-name]').attr('disabled', 'disabled');

                    break;

                case 'metric-add':
                case 'metric-update':
                    if (e.target.disabled)
                        return;

                    $list = listMatch('step-1-metrics');

                    $fieldset = $(e.target).closest('fieldset');
                    $metric   = $fieldset.find('input[name=metric]');
                    $source   = $fieldset.find('input[name=source]');
                    $origin   = $fieldset.find('input[name=origin]');

                    // Set template mode
                    if ($origin.val().indexOf('{{') != -1 || $source.val().indexOf('{{') != -1 ||
                        $metric.val().indexOf('{{') != -1) {
                        $pane.data('template', true);
                        $pane.find('button[name=step-save]').children().hide().filter('.template').show();
                    } else if (e.target.name == 'metric-update' && listGetCount($list) == 1) {
                        $pane.data('template', false);
                        $pane.find('button[name=step-save]').children().hide().filter('.default').show();
                    }

                    if (e.target.name == 'metric-update')
                        $entryActive = listGetItems($list, '.active');

                    metricName = ($metric.data('value') && $metric.data('value').source.endsWith('groups/') ?
                        'group:' : '') + $metric.val();

                    name = $entryActive && $entryActive.attr('data-series') || null;

                    $entry = adminGraphCreateSeries(name, {
                        name: name || metricName,
                        origin: $origin.val(),
                        source: ($source.data('value') && $source.data('value').source.endsWith('groups/') ?
                            'group:' : '') + $source.val(),
                        metric: metricName
                    });

                    if ($entryActive) {
                        $entry.insertBefore($entryActive);
                        $entryActive.find('a[href=#remove-metric]').trigger('click');
                    }

                    listSay($list, null);
                    listUpdateCount($list);

                    $metric.data('value', null).val('');

                    $metric
                        .trigger('change')
                        .focus();

                    $fieldset.find('button[name=metric-add]').show();
                    $fieldset.find('button[name=metric-update], button[name=metric-cancel]').hide();

                    adminGraphAutoNameSeries();

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'metric-cancel':
                    listMatch('step-1-metrics').find('[data-listitem^=step-1-metrics-item].active').trigger('click');

                    $(e.target).closest('fieldset').find('input[name=origin]')
                        .focus();

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'stack-config':
                    paneGoto('graph-edit', 'stack');
                    break;

                case 'step-cancel':
                    window.location = urlPrefix + '/admin/graphs/';
                    break;

                case 'step-save':
                    adminItemHandlePaneSave($(e.target).closest('[data-pane]'), graphId, 'graph', adminGraphGetData);
                    break;

                case 'step-ok':
                case 'step-prev':
                case 'step-next':
                    adminHandlePaneStep(e, name);
                    break;
                }
            })
            .on('click', '[data-step=1] [data-listitem]', function (e) {
                var $fieldset,
                    $item,
                    $target = $(e.target),
                    active,
                    fieldValue,
                    value;

                if ($target.closest('.actions').length > 0)
                    return;

                $fieldset = $('[data-step=1] fieldset');
                $item     = $target.closest('[data-listitem]');
                value     = $item.data('value');

                $item
                    .toggleClass('active')
                    .siblings().removeClass('active');

                active = $item.hasClass('active');

                $fieldset.find('button[name=metric-add]').toggle(!active);
                $fieldset.find('button[name=metric-update], button[name=metric-cancel]').toggle(active);

                $fieldset.find('input[name=origin]')
                    .data('value', {
                        name: value.origin,
                        source: 'catalog/origins'
                    })
                    .val(active ? value.origin : '');

                if (value.source.startsWith('group:'))
                    fieldValue = {name: value.source.substr(6), source: 'library/sourcegroups/'};
                else
                    fieldValue = {name: value.source, source: 'catalog/sources/'};

                $fieldset.find('input[name=source]')
                    .data('value', fieldValue)
                    .val(active ? fieldValue.name : '');

                if (value.metric.startsWith('group:'))
                    fieldValue = {name: value.metric.substr(6), source: 'library/metricgroups/'};
                else
                    fieldValue = {name: value.metric, source: 'catalog/metrics/'};

                $fieldset.find('input[name=metric]')
                    .data('value', fieldValue)
                    .val(active ? fieldValue.name : '')
                    .trigger('change');
            })
            .on('change', '[data-step=1] fieldset input', function (e) {
                var $buttons,
                    $target = $(e.target),
                    $fieldset = $target.closest('fieldset'),
                    $next;

                if (!$fieldset.find('input[name=origin]').val())
                    $fieldset.find('input[name=source]')
                        .val('')
                        .attr('disabled', 'disabled');
                else
                    $fieldset.find('input[name=source]')
                        .removeAttr('disabled');

                if (!$fieldset.find('input[name=source]').val())
                    $fieldset.find('input[name=metric]')
                        .val('')
                        .attr('disabled', 'disabled');
                else
                    $fieldset.find('input[name=metric]')
                        .removeAttr('disabled');

                $buttons = $fieldset.find('button[name=metric-add], button[name=metric-update]');

                if (!$fieldset.find('input[name=origin]').val() || !$fieldset.find('input[name=source]').val() ||
                        !$fieldset.find('input[name=metric]').val()) {
                    $buttons.attr('disabled', 'disabled');
                } else {
                    $buttons.removeAttr('disabled');
                }

                // Select next item
                if (!e._typing && $target.val()) {
                    $next = $target.closest('[data-input]').nextAll('[data-input], button:visible').first();

                    if ($next.attr('data-input') !== undefined)
                        $next = $next.children('input');

                    if (!e._autofill || $next.prop("tagName") != 'BUTTON')
                        $next.focus();
                }
            })
            .on('change', '[data-step=3] select, [data-step=3] input[type=radio]', function (e) {
                var $target = $(e.target),
                    data;

                if (e._init || !e._select && e.target.tagName == 'SELECT')
                    return;

                if (e.target.name == 'stack-mode') {
                    $target.closest('[data-step]').find('button[name=stack-config]')
                        .toggle(parseInt(e.target.value, 10) !== STACK_MODE_NONE);

                    paneGoto('graph-edit', 'stack', true);
                }

                data = adminGraphGetData();

                if ($pane.data('template')) {
                    data.attributes = {};

                    $pane.find('.graphattrs [data-listitem]').each(function () {
                        var $item = $(this);
                        data.attributes[$item.find('.key :input').val()] = $item.find('.value :input').val();
                    });

                    // Save attributes data for pane-switch restoration
                    $pane.data('attrs-data', data.attributes);
                }

                graphDraw($target.closest('[data-step]').find('[data-graph]'), false, 0, data);
            })
            .on('change', '[data-step=3] :input', function (e) {
                if (e._init || !e._select)
                    return;

                PANE_UNLOAD_LOCK = true;
            })
            .on('keydown', '[data-step=1] fieldset input', function (e) {
                $(e.target).nextAll('input')
                    .attr('disabled', 'disabled')
                    .val('');
            })
            .on('keyup', '[data-step=1] fieldset input', adminHandleFieldType)
            .on('keypress', '[data-step=3] :input[name=graph-desc], [data-step=3] :input[name=graph-title]',
                function (e) {

                var $target = $(e.target),
                    $step = $target.closest('[data-step]');

                if ($step.data('attrs-timeout')) {
                    clearTimeout($step.data('attrs-timeout'));
                    $step.removeData('attrs-timeout');
                }

                $step.data('attrs-timeout', setTimeout(adminGraphUpdateAttrsList, 500));
            })
            .on('keypress', '[data-step=3] .graphattrs :input', function (e) {
                var $target,
                    $attrs;

                if (!$pane.data('template'))
                    return;

                $target = $(e.target);
                $attrs = $target.closest('.graphattrs');

                if ($attrs.data('timeout')) {
                    clearTimeout($attrs.data('timeout'));
                    $attrs.removeData('timeout');
                }

                // Trigger graph redraw
                $attrs.data('timeout', setTimeout(function () {
                    $pane.find('[data-step=3] select:first').trigger('change');
                }, 1000));
            })
            .on('dragstart dragend dragover dragleave drop', '.dragarea', adminGraphHandleSeriesDrag);

        // Set default panel save button
        $pane.find('button[name=step-save]').children().hide().filter('.default').show();

        // Load graph data
        if (graphId === null)
            return;

        itemLoad(graphId, 'graphs').pipe(function (data) {
            var $itemOper,
                $itemSeries,
                $listMetrics,
                $listOpers,
                $listSeries,
                stacks = {},
                i,
                j;

            $listMetrics = listMatch('step-1-metrics');
            $listOpers   = listMatch('step-2-groups');
            $listSeries  = listMatch('step-stack-series');

            for (i in data.groups) {
                if (!stacks[data.groups[i].stack_id]) {
                    stacks[data.groups[i].stack_id] = data.stack_mode !== STACK_MODE_NONE ? adminGraphCreateStack({
                        name: 'stack' + data.groups[i].stack_id
                    }) : null;
                }

                $itemOper = data.groups[i].type !== OPER_GROUP_TYPE_NONE ? adminGraphCreateGroup(null, {
                    name: data.groups[i].name,
                    type: data.groups[i].type,
                    options: data.groups[i].options
                }) : null;

                for (j in data.groups[i].series) {
                    if (data.groups[i].type === OPER_GROUP_TYPE_NONE && !data.groups[i].series[j].options)
                        data.groups[i].series[j].options = data.groups[i].options;


                    if (data.groups[i].series[j].origin.indexOf('{{') != -1 ||
                        data.groups[i].series[j].source.indexOf('{{') != -1 ||
                        data.groups[i].series[j].metric.indexOf('{{') != -1) {
                        $pane.data('template', true);
                    } else {
                        $pane.data('template', false);
                    }

                    $itemSeries = adminGraphCreateSeries(null, data.groups[i].series[j])
                        .data('renamed', true);

                    if ($itemOper)
                        adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSeries, $itemOper);
                    else if (stacks[data.groups[i].stack_id])
                        adminGraphCreateProxy(PROXY_TYPE_SERIES, $itemSeries, stacks[data.groups[i].stack_id]);
                }

                if ($itemOper && stacks[data.groups[i].stack_id])
                    adminGraphCreateProxy(PROXY_TYPE_GROUP, $itemOper, stacks[data.groups[i].stack_id]);
            }

            if ($pane.data('template'))
                $pane.find('button[name=step-save]').children().hide().filter('.template').show();

            $pane.find('input[name=graph-name]').val(data.name);
            $pane.find('textarea[name=graph-desc]').val(data.description);

            $pane.find('input[name=graph-title]').val(data.title);

            $pane.find('select[name=graph-type]').val(data.type).trigger({
                type: 'change',
                _init: true
            });

            $pane.find('input[name=unit-legend]').val(data.unit_legend);
            $pane.find('input[name=unit-type][value=' + data.unit_type + ']').prop('checked', true);

            $pane.find('select[name=stack-mode]').val(data.stack_mode).trigger({
                type: 'change',
                _init: true
            });

            if ($listMetrics.data('counter') === 0)
                listSay($listMetrics, $.t('metric.mesg_none'));

            if ($listSeries.data('counter') === 0)
                listSay($listSeries, $.t('graph.mesg_no_series'));

            listUpdateCount($listMetrics);
        });
    });

    paneRegister('graph-link-edit', function () {
        var $pane = paneMatch('graph-link-edit'),
            graphId = $pane.opts('pane').id || null;

        // Register checks
        if ($('[data-input=graph-name]').length > 0) {
            inputRegisterCheck('graph-name', function (input) {
                var value = input.find(':input').val();

                if (!value)
                    return;

                itemList({
                    filter: value
                }, 'graphs').pipe(function (data) {
                    if (data.length > 0 && data[0].id != graphId) {
                        input
                            .attr('title', $.t('graph.mesg_exists'))
                            .addClass('error');
                    } else {
                        input
                            .removeAttr('title')
                            .removeClass('error');
                    }
                });
            });
        }
        // Register pane steps
        paneStepRegister('graph-link-edit', 1, function () {
            var linkSource;

            if (!graphId)
                listSay('step-1-attrs', $.t('graph.mesg_no_template_selected'), 'info');

            linkSource = getURLParams().from;
            if (linkSource) {
                itemLoad(linkSource, 'graphs').pipe(function (data) {
                    inputMatch('graph').find(':input')
                        .data('value', {
                            id: data.id,
                            name: data.name,
                            description: data.description,
                            modified: data.modified,
                            template: data.template,
                            source: 'library/graphs/?type=template'
                        })
                        .val(data.name)
                        .trigger('change');

                    $('button[name=graph-ok]').trigger('click');
                });
            }

            setTimeout(function () { $('[data-step=1] input').trigger('change').filter(':first').select(); }, 0);
        });

        // Register links
        linkRegister('edit-template', function () {
            window.location = urlPrefix + '/admin/graphs/' + $pane.find('input[name=graph]').data('value').id;
        });

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $graph,
                    $list,
                    $target = $(e.target);

                switch (e.target.name) {
                case 'graph-ok':
                    if (e.target.disabled)
                        return;

                    $list = listMatch('step-1-attrs');
                    $graph = $pane.find('input[name=graph]');

                    $.ajax({
                        url: urlPrefix + '/api/v1/library/graphs/' + $graph.data('value').id,
                        type: 'GET',
                        dataType: 'json'
                    }).pipe(function (data) {
                        var $item,
                            attrs = adminGraphGetTemplatable(data.groups),
                            attrsData = $pane.data('attrs-data'),
                            i;

                        // Restore field name if needed (useful for linked graph edition)
                        if (!$graph.val())
                            $graph.val(data.name);

                        if (attrs.length === 0) {
                            listSay($list, $.t('graph.mesg_no_template_attr'), 'error');
                            $pane.find('button[name=step-save]').attr('disabled', 'disabled');
                            return;
                        } else {
                            $pane.find('button[name=step-save]').removeAttr('disabled');
                        }

                        listSay($list, null);
                        listEmpty($list);

                        for (i in attrs) {
                            $item = listAppend($list);
                            $item.find('.key input').val(attrs[i]);

                            if (attrsData && attrsData[attrs[i]] !== undefined)
                                $item.find('.value input').val(attrsData[attrs[i]]);
                        }

                        // Trigger first graph preview
                        listGetItems($list, ':first').find('.value input').trigger('keypress');

                        if (e._init)
                            return;

                        listGetItems($list, ':first').find('.value input').focus();
                    });

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'step-cancel':
                    window.location = urlPrefix + '/admin/graphs/';
                    break;

                case 'step-save':
                    if (!$pane.find('input[name=graph]').data('value')) {
                        overlayCreate('alert', {
                            message: $.t('graph.mesg_missing_template'),
                            callbacks: {
                                validate: function () {
                                    setTimeout(function () { $pane.find('[data-input=graph] input').select(); }, 0);
                                }
                            }
                        });
                        return false;
                    }

                    adminItemHandlePaneSave($target.closest('[data-pane]'), graphId, 'graph', function() {
                        return adminGraphGetData(true);
                    });

                    break;
                }
            })
            .on('change', '[data-step=1] [data-input=graph] input', function (e) {
                var $target = $(e.target),
                    $button = $target.closest('[data-input]').nextAll('button:first');

                if (!$target.val())
                    $button.attr('disabled', 'disabled');
                else
                    $button.removeAttr('disabled');

                // Select button
                if ($target.val())
                    $button.focus();
            })
            .on('keypress', '[data-step=1] .graphattrs :input', function (e) {
                var $target = $(e.target);

                if ($target.data('timeout')) {
                    clearTimeout($target.data('timeout'));
                    $target.removeData('timeout');
                }

                $target.data('timeout', setTimeout(function () {
                    graphDraw($target.closest('[data-step]').find('[data-graph]'), false, 0, adminGraphGetData(true));
                }, 1000));
            });

        // Load graph data
        if (graphId === null)
            return;

        itemLoad(graphId, 'graphs').pipe(function (data) {
            var $graph;

            $pane.find('input[name=graph-name]').val(data.name).select();

            $pane.data('attrs-data', data.attributes);

            $graph = $pane.find('input[name=graph]').data('value', {id: data.link});

            $graph.closest('[data-input]').nextAll('button:first')
                .removeAttr('disabled')
                .trigger({
                    type: 'click',
                    _init: true
                });

            PANE_UNLOAD_LOCK = false;
        });
    });
}

function adminGroupCreateItem(value) {
    var $item = listAppend(listMatch('step-1-items'))
        .attr('data-item', value.id)
        .data('value', value);

    domFillItem($item, value);

    return $item;
}

function adminGroupGetData() {
    var $pane = paneMatch('group-edit'),
        data = {
            name: $pane.find('input[name=group-name]').val(),
            description: $pane.find('textarea[name=group-desc]').val(),
            entries: []
        };

    listGetItems('step-1-items').each(function () {
        data.entries.push($(this).data('value'));
    });

    return data;
}

function adminGroupSetupTerminate() {
    var completionCallbacks;

    // Register admin panes
    paneRegister('group-list', function () {
        adminItemHandlePaneList('group');
    });

    paneRegister('group-edit', function () {
        var groupId = paneMatch('group-edit').opts('pane').id || null,
            groupType = paneMatch('group-edit').opts('pane').section;

        // Register completes and checks
        completionCallbacks = function (input) {
            var $fieldset = input.closest('fieldset');

            if (parseInt($fieldset.find('select[name=type]').val(), 10) != 1)
                return [];

            return inputGetSources(input, {
                origin: $fieldset.find('input[name=origin]').val()
            });
        };

        if ($('[data-input=source]').length > 0)
            inputRegisterComplete('source', completionCallbacks);

        if ($('[data-input=metric]').length > 0)
            inputRegisterComplete('metric', completionCallbacks);

        if ($('[data-input=group-name]').length > 0) {
            inputRegisterCheck('group-name', function (input) {
                var value = input.find(':input').val();

                if (!value)
                    return;

                itemList({
                    filter: value
                }, groupType).pipe(function (data) {
                    if (data.length > 0 && data[0].id != groupId) {
                        input
                            .attr('title', $.t('group.mesg_exists'))
                            .addClass('error');
                    } else {
                        input
                            .removeAttr('title')
                            .removeClass('error');
                    }
                });
            });
        }

        // Register pane steps
        paneStepRegister('group-edit', 1, function () {
            var $fieldset = $('[data-step=1] fieldset');

            $fieldset.find('button[name=item-update], button[name=item-cancel]').hide();

            if (groupId)
                listSay('step-1-items', null);

            setTimeout(function () { $fieldset.find('input:first').trigger('change').select(); }, 0);
        });

        paneStepRegister('group-edit', 2, function () {
            if (listGetCount('step-1-items') === 0) {
                overlayCreate('alert', {
                    message: $.t('item.mesg_missing'),
                    callbacks: {
                        validate: function () {
                            setTimeout(function () { $('[data-step=1] fieldset input:first').select(); }, 0);
                        }
                    }
                });
                return false;
            }

            setTimeout(function () { $('[data-step=2] :input:first').select(); });
        });

        // Register links
        linkRegister('move-up move-down', adminItemHandleReorder);

        linkRegister('remove-item', function (e) {
            var $target = $(e.target),
                $list = $target.closest('[data-list]');

            $target.closest('[data-listitem]').remove();

            listUpdateCount($list);

            if (listGetCount($list) === 0)
                listSay($list, $.t('item.mesg_none'), 'info');

            PANE_UNLOAD_LOCK = true;
        });

        linkRegister('test-pattern', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-listitem]');

            $.ajax({
                url: urlPrefix + '/api/v1/catalog/' + (groupType == 'sourcegroups' ? 'sources' : 'metrics') + '/',
                type: 'GET',
                data: {
                    origin: $item.data('value').origin,
                    source: $item.data('value').source,
                    filter: $item.data('value').pattern,
                    limit: PATTERN_TEST_LIMIT
                }
            }).done(function (data, status, xhr) { /*jshint unused: true */
                var $tooltip,
                    records = parseInt(xhr.getResponseHeader('X-Total-Records'), 10);

                $tooltip = tooltipCreate('info', function (state) {
                    $target.toggleClass('active', state);
                    $item.toggleClass('action', state);
                }).appendTo($body)
                    .css({
                        top: $target.offset().top,
                        left: $target.offset().left
                    });

                $tooltip.html('<span class="label">' + $.t('item.labl_matching') + '</span><br>');

                if (data.length === 0) {
                    $tooltip.append($.t('main.mesg_nomatch'));
                } else {
                    $.each(data, function (i, entry) { /*jshint unused: true */
                        $tooltip.append(entry + '<br>');
                    });
                }

                if (records > data.length)
                    $tooltip.append('…<br><span class="label">' + $.t('item.labl_total') + '</span> ' + records);
            });
        });

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $entry,
                    $entryActive,
                    $fieldset,
                    $item,
                    $list,
                    $select,
                    $origin,
                    name,
                    type,
                    isPattern;

                switch (e.target.name) {
                case 'item-add':
                case 'item-update':
                    if (e.target.disabled)
                        return;

                    $fieldset = $(e.target).closest('fieldset');
                    $list     = listMatch('step-1-items');
                    $item     = $fieldset.find('input[name=item]');
                    $origin   = $fieldset.find('select[name=origin]');
                    $select   = $fieldset.find('select[name=type]');

                    if (e.target.name == 'item-update')
                        $entryActive = listGetItems('step-1-items', '.active');

                    type = $select.children('option:selected').text().toLowerCase();
                    isPattern = parseInt($select.val(), 10) !== MATCH_TYPE_SINGLE;

                    $entry = adminGroupCreateItem({
                        pattern: (isPattern ? type + ':' : '') + $item.val(),
                        origin: $origin.val()
                    });

                    $entry.find('.type').text(type);

                    if (!isPattern)
                        $entry.find('a[href=#test-pattern]').remove();

                    if ($entryActive)
                        $entryActive.replaceWith($entry);

                    listSay($list, null);
                    listUpdateCount($list);

                    $item.val('');

                    $item
                        .trigger('change')
                        .focus();

                    $fieldset.find('button[name=item-add]').show();
                    $fieldset.find('button[name=item-update], button[name=item-cancel]').hide();

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'item-cancel':
                    listGetItems('step-1-items', '.active').trigger('click');

                    $(e.target).closest('fieldset').find('input[name=item]')
                        .focus();

                    PANE_UNLOAD_LOCK = true;

                    break;

                case 'step-cancel':
                    window.location = urlPrefix + '/admin/' + groupType + '/';
                    break;

                case 'step-save':
                    adminItemHandlePaneSave($(e.target).closest('[data-pane]'), groupId, 'group', adminGroupGetData);
                    break;

                case 'step-ok':
                case 'step-prev':
                case 'step-next':
                    adminHandlePaneStep(e, name);
                    break;
                }
            })
            .on('click', '[data-step=1] [data-listitem]', function (e) {
                var $fieldset,
                    $item,
                    $target = $(e.target),
                    active,
                    value;

                if ($target.closest('.actions').length > 0)
                    return;

                $fieldset = $('[data-step=1] fieldset');
                $item     = $target.closest('[data-listitem]');
                value     = $item.data('value');

                $item
                    .toggleClass('active')
                    .siblings().removeClass('active');

                active = $item.hasClass('active');

                if (value.pattern.startsWith('glob:'))
                    value = {origin: value.origin, type: MATCH_TYPE_GLOB, item: value.pattern.substr(5)};
                else if (value.pattern.startsWith('regexp:'))
                    value = {origin: value.origin, type: MATCH_TYPE_REGEXP, item: value.pattern.substr(7)};
                else
                    value = {origin: value.origin, type: MATCH_TYPE_SINGLE, item: value.pattern};

                $fieldset.find('button[name=item-add]').toggle(!active);
                $fieldset.find('button[name=item-update], button[name=item-cancel]').toggle(active);

                $fieldset.find('select[name=origin]')
                    .val(active ? value.origin : '')
                    .trigger('change');

                $fieldset.find('select[name=type]')
                    .val(active ? value.type : 0)
                    .trigger('change');

                $fieldset.find('input[name=item]')
                    .val(active ? value.item : '');
            })
            .on('change', '[data-step=1] fieldset input', function (e) {
                var $target = $(e.target),
                    $fieldset = $target.closest('fieldset'),
                    $button = $fieldset.find('button[name=item-add]');

                if (!$fieldset.find('input[name=item]').val())
                    $button.attr('disabled', 'disabled');
                else
                    $button.removeAttr('disabled');

                // Select next item
                if (!e._typing && !e._autofill && $target.val())
                    $target.closest('[data-input]').nextAll('button:first').focus();
            })
            .on('change', '[data-step=2] :input', function () {
                PANE_UNLOAD_LOCK = true;
            })
            .on('keyup', '[data-step=1] fieldset input', adminHandleFieldType);

        // Load group data
        if (groupId === null)
            return;

        itemLoad(groupId, groupType).pipe(function (data) {
            var $item,
                $listItems,
                $pane,
                i;

            $listItems = listMatch('step-1-items');

            for (i in data.entries) {
                $item = adminGroupCreateItem(data.entries[i]);

                if (!data.entries[i].pattern.startsWith('glob:') && !data.entries[i].pattern.startsWith('regexp:'))
                    $item.find('a[href=#test-pattern]').remove();
            }

            $pane = paneMatch('group-edit');

            $pane.find('input[name=group-name]').val(data.name);
            $pane.find('textarea[name=group-desc]').val(data.description);

            if ($listItems.data('counter') === 0)
                listSay($listItems, $.t('item.mesg_none'));

            listUpdateCount($listItems);
        });
    });
}

function adminScaleGetData() {
    var $pane = paneMatch('scale-edit');

    return {
        name: $pane.find('input[name=scale-name]').val(),
        description: $pane.find('textarea[name=scale-desc]').val(),
        value: parseFloat($pane.find('input[name=scale-value]').val())
    };
}

function adminScaleSetupTerminate() {
    // Register admin panes
    paneRegister('scale-list', function () {
        adminItemHandlePaneList('scale');
    });

    paneRegister('scale-edit', function () {
        var scaleId = paneMatch('scale-edit').opts('pane').id || null;

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $target = $(e.target);

                switch (e.target.name) {
                case 'step-cancel':
                    window.location = urlPrefix + '/admin/scales/';
                    break;

                case 'step-save':
                    adminItemHandlePaneSave($target.closest('[data-pane]'), scaleId, 'scale', adminScaleGetData);
                    break;
                }
            });

        // Load scale data
        if (scaleId === null)
            return;

        itemLoad(scaleId, 'scales').pipe(function (data) {
            var $pane = paneMatch('scale-edit');

            $pane.find('input[name=scale-name]').val(data.name);
            $pane.find('textarea[name=scale-desc]').val(data.description);
            $pane.find('input[name=scale-value]').val(data.value);
        });
    });
}

function adminUnitGetData() {
    var $pane = paneMatch('unit-edit');

    return {
        name: $pane.find('input[name=unit-name]').val(),
        description: $pane.find('textarea[name=unit-desc]').val(),
        label: $pane.find('input[name=unit-label]').val(),
        type: parseInt($pane.find('input[name=unit-type]:checked').val(), 10)
    };
}

function adminUnitSetupTerminate() {
    // Register admin panes
    paneRegister('unit-list', function () {
        adminItemHandlePaneList('unit');
    });

    paneRegister('unit-edit', function () {
        var unitId = paneMatch('unit-edit').opts('pane').id || null;

        // Attach events
        $body
            .on('click', 'button', function (e) {
                var $target = $(e.target);

                switch (e.target.name) {
                case 'step-cancel':
                    window.location = urlPrefix + '/admin/units/';
                    break;

                case 'step-save':
                    adminItemHandlePaneSave($target.closest('[data-pane]'), unitId, 'unit', adminUnitGetData);
                    break;
                }
            });

        // Load unit data
        if (unitId === null)
            return;

        itemLoad(unitId, 'units').pipe(function (data) {
            var $pane = paneMatch('unit-edit');

            $pane.find('input[name=unit-name]').val(data.name);
            $pane.find('textarea[name=unit-desc]').val(data.description);
            $pane.find('input[name=unit-label]').val(data.label);
            $pane.find('input[name=unit-type][value=' + data.type + ']').prop('checked', true);
        });
    });
}

function adminCatalogSetupTerminate() {
    // Register admin panes
    paneRegister('catalog-list', function () {
        // Register links
        linkRegister('show-info', function (e) {
            var $target = $(e.target),
                $item = $target.closest('[data-itemname]'),
                type = $target.closest('[data-list]').attr('data-list'),
                name = $item.attr('data-itemname');

            $.ajax({
                url: urlPrefix + '/api/v1/catalog/' + type + '/' + name,
                type: 'GET'
            }).pipe(function (data) {
                var $tooltip = tooltipCreate('info', function (state) {
                    $item.toggleClass('action', state);
                }).appendTo($body)
                    .css({
                        top: $target.offset().top,
                        left: $target.offset().left
                    });

                switch (type) {
                    case 'origins':
                        $tooltip.html(
                            '<span class="label">' + $.t('main.labl_connector') + '</span> ' +
                                data.connector
                        );

                        break;

                    case 'sources':
                        $tooltip.html(
                            '<span class="label">' + $.t('main.labl_origins') + '</span> ' +
                                data.origins.join(', ')
                        );

                        break;

                    case 'metrics':
                        $tooltip.html(
                            '<span class="label">' + $.t('main.labl_origins') + '</span> ' +
                                data.origins.join(', ') + '<br>' +
                            '<span class="label">' + $.t('main.labl_sources') + '</span> ' +
                                data.sources.join(', ')
                        );

                        break;
                }
            });
        });
    });
}

function adminSetupInit() {
    // Hide pane steps
    $('[data-step]').hide();
}

if (String(window.location.pathname).startsWith(urlPrefix + '/admin/')) {
    // Register setup callbacks
    setupRegister(SETUP_CALLBACK_INIT, adminSetupInit);
    setupRegister(SETUP_CALLBACK_TERM, adminCollectionSetupTerminate);
    setupRegister(SETUP_CALLBACK_TERM, adminGraphSetupTerminate);
    setupRegister(SETUP_CALLBACK_TERM, adminGroupSetupTerminate);
    setupRegister(SETUP_CALLBACK_TERM, adminScaleSetupTerminate);
    setupRegister(SETUP_CALLBACK_TERM, adminUnitSetupTerminate);
    setupRegister(SETUP_CALLBACK_TERM, adminCatalogSetupTerminate);
}

/* Browse */

function browsePrint() {
    // Force graphs load then trigger print
    graphHandleQueue(true).then(function () {
        window.print();
    });
}

function browseSetRange(e) {
    var $target = $(e.target),
        $overlay,
        href = $target.attr('href');

    // Prevent event from being triggered from a graph item
    if ($target.closest('[data-graph]').length > 0)
        return;

    if (href == '#set-global-range') {
        $target.next('.menu').toggle();
    } else if (href == '#range-custom') {
        $overlay = overlayCreate('time', {
            callbacks: {
                validate: function () {
                    $('[data-graph]').each(function () {
                        var $item = $(this);

                        $.extend($item.data('options'), {
                            time: moment($overlay.find('input[name=time]').val()).format(TIME_RFC3339),
                            range: $overlay.find('input[name=range]').val()
                        });

                        graphDraw($item, !$item.inViewport());
                    });
                }
            }
        });

        $overlay.find('input[name=time]').appendDtpicker({
            closeOnSelected: true,
            current: null,
            firstDayOfWeek: 1,
            minuteInterval: 10,
            todayButton: false
        });

        $('a[href=#set-global-range] + .menu').hide();

        e.stopImmediatePropagation();
    } else if (href && href.indexOf('#range-') === 0) {
        $('[data-graph]').each(function () {
            var $item = $(this);

            $.extend($item.data('options'), {range: '-' + href.substr(7)});
            delete $item.data('options').time;

            graphDraw($item, !$item.inViewport());
        });

        $target.closest('.menu').hide();
    } else if ($target.closest('.menu').length === 0) {
        $('a[href=#set-global-range] + .menu').hide();
        return;
    } else {
        return;
    }

    e.preventDefault();
    e.stopPropagation();
}

function browseSetRefresh(e) {
    overlayCreate('prompt', {
        message: $.t('main.labl_refresh_interval'),
        callbacks: {
            validate: function (data) {
                if (!data)
                    return;

                data = parseInt(data, 10);
                if (isNaN(data)) {
                    consoleToggle($.t('main.mesg_invalid_refresh_interval'));
                    return;
                }

                $('[data-graph]').each(function () {
                    var $item = $(this);
                    $.extend($item.data('options'), {refresh_interval: data});
                    graphDraw($item, !$item.inViewport());
                });

                // Set refresh interval UI display
                $(e.target)
                    .addClass('value')
                    .html('<span>' + data + '</span>');
            }
        }
    });
}

function browseToggleLegend(e) {
    $(e.target).toggleClass('icon-toggle-off icon-toggle-on active');
    $('[data-graph] a[href=#toggle-legend]').trigger('click');
}

function browseCollectionHandleTree(e) {
    var $target = $(e.target),
        $item = $target.closest('[data-treeitem]');

    if ($target.closest('.icon').length === 0 || !$item.hasClass('folded') && !$item.hasClass('unfolded')) {
        window.location = urlPrefix + '/browse/collections/' + $item.attr('data-treeitem');
    } else {
        $item.toggleClass('folded unfolded')
            .children('.treecntr').toggle();
    }

    // Save new tree state
    browseCollectionSaveTreeState();

    e.preventDefault();
    e.stopPropagation();
}

function browseCollectionResoreTreeState() {
    var state;

    if (!localStorage)
        return;

    try {
        state = JSON.parse(localStorage.getItem('collections-tree'));

        // Toggle previously unfolded tree items
        $('[data-tree=collections] [data-treeitem]').each(function () {
            var $item = $(this);

            if (!state[$item.attr('data-treeitem')])
                return;

            $item.toggleClass('folded unfolded')
                .children('.treecntr').toggle();
        });
    } catch (e) {}
}

function browseCollectionSaveTreeState() {
    var state;

    if (!localStorage)
        return;

    // Save tree items states
    state = {};

    $('[data-tree=collections] [data-treeitem]').each(function () {
        var $item = $(this);
        state[$item.attr('data-treeitem')] = $item.hasClass('unfolded');
    });

    localStorage.setItem('collections-tree', JSON.stringify(state));
}

function browseCollectionSetupTerminateTree() {
    // Restore saved tree state
    browseCollectionResoreTreeState();

    // Attach events
    $body.on('click', '[data-tree=collections] a', browseCollectionHandleTree);
}

function browseCollectionSetupTerminate() {
    $('[data-treeitem=' + paneMatch('collection-show').opts('pane').id + ']')
        .addClass('current')
        .parentsUntil('[data-tree]').show();

    // Register links
    linkRegister('edit-collection', function (e) {
        // Go to Administration Panel
        window.location = urlPrefix + '/admin/collections/' + $(e.target).closest('[data-pane]').opts('pane').id;
    });

    linkRegister('set-global-range', browseSetRange);
    $('a[href=#set-global-range] + .menu .menuitem a').on('click', browseSetRange);
    $body.on('click', browseSetRange);

    linkRegister('set-global-refresh', browseSetRefresh);

    linkRegister('toggle-legends', browseToggleLegend);
}

function browseGraphSetupTerminate() {
    // Register links
    linkRegister('edit-graph', function (e) {
        var opts = $(e.target).closest('[data-pane]').opts('pane'),
            location;

        // Go to Administration Panel
        location = urlPrefix + '/admin/graphs/' + opts.id;
        if (opts.linked === true)
            location += '?linked=1';

        window.location = location;
    });

    linkRegister('set-global-range', browseSetRange);
    $('a[href=#set-global-range] + .menu .menuitem a').on('click', browseSetRange);
    $body.on('click', browseSetRange);

    linkRegister('set-global-refresh', browseSetRefresh);

    linkRegister('toggle-legends', browseToggleLegend);
}

if (locationPath.startsWith(urlPrefix + '/browse/')) {
    // Register links
    linkRegister('print', browsePrint);

    // Register setup callbacks
    setupRegister(SETUP_CALLBACK_TERM, browseCollectionSetupTerminateTree);

    if (locationPath.startsWith(urlPrefix + '/browse/collections/'))
        setupRegister(SETUP_CALLBACK_TERM, browseCollectionSetupTerminate);

    if (locationPath.startsWith(urlPrefix + '/browse/graphs/'))
        setupRegister(SETUP_CALLBACK_TERM, browseGraphSetupTerminate);
}

/* Item */

function itemDelete(id, itemType) {
    return $.ajax({
        url: urlPrefix + '/api/v1/library/' + itemType + '/' + id,
        type: 'DELETE'
    });
}

function itemList(query, itemType) {
    return $.ajax({
        url: urlPrefix + '/api/v1/library/' + itemType + '/',
        type: 'GET',
        data: query,
        dataType: 'json'
    });
}

function itemLoad(id, itemType) {
    return $.ajax({
        url: urlPrefix + '/api/v1/library/' + itemType + '/' + id,
        type: 'GET',
        dataType: 'json'
    });
}

function itemSave(id, itemType, query, clone) {
    var url = '/api/v1/library/' + itemType + '/',
        method = 'POST';

    clone = typeof clone == 'boolean' ? clone : false;

    if (clone) {
        url += '?inherit=' + id;
    } else if (id !== null) {
        url += id;
        method = 'PUT';
    }

    return $.ajax({
        url: urlPrefix + url,
        type: method,
        contentType: 'application/json',
        data: JSON.stringify(query)
    });
}

/* Graph */

var GRAPH_DRAW_PARENTS  = [],
    GRAPH_DRAW_QUEUE    = [],
    GRAPH_DRAW_TIMEOUTS = {},

    GRAPH_CONTROL_LOCK    = false,
    GRAPH_CONTROL_TIMEOUT = null,

    $graphTemplate;

function graphDraw(graph, postpone, delay, preview) {
    var graphNew;

    postpone = typeof postpone == 'boolean' ? postpone : false;
    delay    = delay || 0;
    preview  = preview || null;

    if (graph.length > 1) {
        console.error("Can't draw multiple graph.");
        return;
    }

    if (!graph.data('setup')) {
        // Replace node with graph template
        if ($graphTemplate.length > 0) {
            graphNew = $graphTemplate.clone();

            $.each(graph.prop("attributes"), function () {
                graphNew.attr(this.name, this.value);
            });

            graph.replaceWith(graphNew);
            graph = graphNew;

            graph.data({
                options: graph.opts('graph'),
                setup: true
            });

            graph.find('.graphctrl .ranges').hide();

            if (readOnly)
                graph.find('.graphctrl .edit').hide();

            graph.find('.placeholder').text(graph.data('options').title || 'N/A');
        }
    }

    // Clear previous refresh timeout
    if (graph.data('timeout')) {
        clearTimeout(graph.data('timeout'));
        graph.removeData('timeout');
    }

    // Postpone graph draw
    if (postpone) {
        graphEnqueue(graph.get(0));
        return;
    }

    return $.Deferred(function ($deferred) {
        setTimeout(function () {
            var graphOpts,
                query,
                location,
                args;

            graph.find('.placeholder').text($.t('main.mesg_loading'));

            // Parse graph options
            graphOpts = graph.data('options') || graph.opts('graph');

            if (typeof graphOpts.zoom == 'undefined')
                graphOpts.zoom = true;

            if (typeof graphOpts.expand == 'undefined')
                graphOpts.expand = true;

            if (typeof graphOpts.legend == 'undefined')
                graphOpts.legend = false;

            if (graphOpts.sample)
                graphOpts.sample = parseInt(graphOpts.sample, 10);
            else
                delete graphOpts.sample;

            if (!graphOpts.range)
                graphOpts.range = GRAPH_DEFAULT_RANGE;

            if (typeof graphOpts.percentiles != 'undefined') {
                switch (typeof graphOpts.percentiles) {
                case 'number':
                    graphOpts.percentiles = [graphOpts.percentiles];
                    break;

                case 'string':
                    graphOpts.percentiles = parseFloatList(graphOpts.percentiles);
                    break;
                }
            }

            if (typeof graphOpts.constants != 'undefined') {
                switch (typeof graphOpts.constants) {
                case 'number':
                    graphOpts.constants = [graphOpts.constants];
                    break;

                case 'string':
                    graphOpts.constants = parseFloatList(graphOpts.constants);
                    break;
                }
            }

            // Update URL on show
            if (locationPath.startsWith(urlPrefix + '/show/')) {
                location = String(window.location.pathname);

                args = [];
                if (graphOpts.time)
                    args.push('time=' + graphOpts.time.replace('+', '%2B'));
                if (graphOpts.range)
                    args.push('range=' + graphOpts.range);
                if (graphOpts.refresh_interval)
                    args.push('refresh=' + graphOpts.refresh_interval);

                if (args.length > 0)
                    location += '?' + args.join('&');

                if (location != (window.location.pathname + window.location.search))
                    history.replaceState(null, document.title, location);
            }

            // Set graph options
            graph.data('options', graphOpts);

            // Render graph plots
            query = {
                time: graphOpts.time,
                range: graphOpts.range,
                sample: graphOpts.sample,
                percentiles: graphOpts.percentiles
            };

            if (preview) {
                query.graph = preview;

                graphOpts.legend = false;
            } else {
                query.id = graph.attr('data-graph');
            }

            return $.ajax({
                url: urlPrefix + '/api/v1/plots',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(query),
                dataType: 'json'
            }).pipe(function (data) {
                var $container,
                    graphTableUpdate,
                    highchart,
                    highchartOpts,
                    startTime,
                    endTime,
                    seriesData = {},
                    seriesIndexes = [],
                    seriesVisibility = {},
                    seriesPlotlines = [],
                    i,
                    j;

                if (data.message || !data.series) {
                    graph.children('.graphctrl')
                        .attr('disabled', 'disabled')
                        .find('a:not([href="#edit"], [href="#refresh"], [href="#reset"]), .legend')
                            .attr('disabled', 'disabled');

                    graph.find('.placeholder')
                        .addClass('icon icon-warning')
                        .text(data.message ? data.message : $.t('graph.mesg_empty_series'))
                        .show();

                    graph.children('.graphcntr').empty();

                    $deferred.resolve();

                    return;
                } else {
                    graph.children('.graphctrl')
                        .removeAttr('disabled')
                        .find('a:not([href="#edit"], [href="#refresh"], [href="#reset"]), .legend')
                            .removeAttr('disabled');

                    graph.find('.placeholder')
                        .removeClass('icon icon-warning')
                        .hide();
                }

                startTime = moment(data.start);
                endTime   = moment(data.end);

                graphTableUpdate = function () {
                    if (graphOpts.legend)
                        Highcharts.drawTable.apply(this, [seriesData]);
                };

                highchartOpts = {
                    chart: {
                        borderRadius: 0,
                        events: {
                            load: graphTableUpdate,
                            redraw: graphTableUpdate,
                            togglePlotLine: function () {
                                var $element,
                                    regexp = new RegExp('(^| +)active( +|$)'),
                                    name;

                                $element = $(this.element);

                                name = 'plotline-' + this.series.name + '-' + this.name;

                                // Remove existing plot line
                                this.chart.yAxis[0].removePlotLine(name);

                                if ($element.attr('class') && $element.attr('class').match(regexp)) {
                                    $element.css({
                                        color: 'inherit',
                                        fill: 'inherit'
                                    }).attr('class', $element.attr('class').replace(regexp, ''));

                                    return;
                                }

                                // Set element active
                                if (!this.chart.options._data.plotlines[name])
                                    this.chart.options._data.plotlines[name] = GRAPH_PLOTLINE_COLORS[Object.keys(this
                                        .chart.options._data.plotlines).length % GRAPH_PLOTLINE_COLORS.length];

                                $element
                                    .css({
                                        color: this.chart.options._data.plotlines[name],
                                        fill: this.chart.options._data.plotlines[name]
                                    })
                                    .attr('class', $element.attr('class') + ' active');

                                // Draw new plot line
                                this.chart.yAxis[0].addPlotLine({
                                    id: name,
                                    color: this.chart.options._data.plotlines[name],
                                    value: this.value,
                                    width: 1.5,
                                    zIndex: 3
                                });
                            }
                        },
                        spacingBottom: GRAPH_SPACING_SIZE * 2,
                        spacingLeft: GRAPH_SPACING_SIZE,
                        spacingRight: GRAPH_SPACING_SIZE,
                        spacingTop: GRAPH_SPACING_SIZE,
                    },
                    credits: {
                        enabled: false
                    },
                    exporting: {
                        enabled: false
                    },
                    legend: {
                        enabled: false
                    },
                    plotOptions: {},
                    series: [],
                    title: {
                        text: null
                    },
                    tooltip: {
                        formatter: function () {
                            var tooltip = '<strong>' + moment(this.x).format(TIME_DISPLAY) + '</strong>',
                                stacks = {},
                                i,
                                stackName,
                                total;

                            for (i in this.points) {
                                if (!stacks[this.points[i].series.stackKey])
                                    stacks[this.points[i].series.stackKey] = [];

                                stacks[this.points[i].series.stackKey].push({
                                    name: this.points[i].series.name,
                                    value: this.points[i].y,
                                    color: this.points[i].series.color,
                                    symbol: getHighchartsSymbol(this.points[i].series.symbol)
                                });
                            }

                            for (stackName in stacks) {
                                tooltip += '<div class="highcharts-tooltip-block">';

                                total = 0;

                                for (i in stacks[stackName]) {
                                    tooltip += '<div><span style="color: ' + stacks[stackName][i].color + '">' +
                                        stacks[stackName][i].symbol +'</span> ' + stacks[stackName][i].name +
                                        ': <strong>' + (stacks[stackName][i].value !== null ?
                                        formatValue(stacks[stackName][i].value, {unit_type: data.unit_type}) : 'null') +
                                        '</strong></div>';

                                    if (stacks[stackName][i].value !== null)
                                        total += stacks[stackName][i].value;
                                }

                                if (stacks[stackName].length > 1) {
                                    tooltip += '<div class="highcharts-tooltip-total">Total: <strong>' +
                                        (total !== null ? formatValue(total, {unit_type: data.unit_type}) : 'null') +
                                        '</strong></div>';
                                }
                            }

                            return tooltip;
                        },
                        shared: true,
                        useHTML: true
                    },
                    xAxis: {
                        max: endTime.valueOf(),
                        min: startTime.valueOf(),
                        type: 'datetime'
                    },
                    yAxis: {
                        labels: {
                            formatter: function () {
                                return formatValue(this.value, {unit_type: data.unit_type});
                            }
                        },
                        plotLines: [],
                        title: {
                            text: null
                        }
                    },
                    _data: {
                        plotlines: {}
                    },
                    _opts: data
                };

                // Set type-specific options
                switch (data.type) {
                case GRAPH_TYPE_AREA:
                    highchartOpts.chart.type = 'area';
                    break;
                case GRAPH_TYPE_LINE:
                    highchartOpts.chart.type = 'line';
                    break;
                default:
                    console.error("Unknown `" + data.type + "' chart type");
                    break;
                }

                highchartOpts.plotOptions[highchartOpts.chart.type] = {
                    animation: false,
                    lineWidth: 1.5,
                    marker: {
                        enabled: false
                    },
                    states: {
                        hover: {
                            lineWidth: 2.5
                        }
                    },
                    threshold: 0
                };

                // Enable full features when not in preview
                if (preview) {
                    highchartOpts.plotOptions[highchartOpts.chart.type].enableMouseTracking = false;

                    graph.children('.graphctrl').remove();
                } else {
                    highchartOpts.title = {
                        text: data.title || data.name
                    };

                    highchartOpts.subtitle = {
                        text: startTime.format(TIME_DISPLAY) + ' — ' + endTime.format(TIME_DISPLAY)
                    };

                    if (data.unit_legend)
                        highchartOpts.yAxis.title.text = data.unit_legend;

                    if (graphOpts.zoom) {
                        highchartOpts.chart.events.selection = function (e) {
                            if (e.xAxis) {
                                graphUpdateOptions(graph, {
                                    time: moment(e.xAxis[0].min).format(TIME_RFC3339),
                                    range: timeToRange(moment.duration(moment(e.xAxis[0].max)
                                        .diff(moment(e.xAxis[0].min))))
                                });

                                graphDraw(graph);
                            }

                            e.preventDefault();
                        };

                        highchartOpts.chart.zoomType = 'x';
                    }
                }

                // Set stacking options
                switch (data.stack_mode) {
                case STACK_MODE_NORMAL:
                    highchartOpts.plotOptions[highchartOpts.chart.type].stacking = 'normal';
                    break;
                case STACK_MODE_PERCENT:
                    highchartOpts.plotOptions[highchartOpts.chart.type].stacking = 'percent';
                    break;
                default:
                    highchartOpts.plotOptions[highchartOpts.chart.type].stacking = null;
                    break;
                }

                // Check for previous series visibility
                $container = graph.children('.graphcntr');

                highchart = $container.highcharts();
                if (highchart) {
                    $.each(highchart.series, function () {
                        seriesVisibility[this.name] = this.visible;
                    });
                    $.each(highchart.yAxis[0].plotLinesAndBands, function () {
                        seriesPlotlines.push(this.id);
                    });
                }

                // Append series data
                seriesIndexes = graphGetSeriesIndexes(data.series);

                for (i in data.series) {
                    // Transform unix epochs to Date objects
                    for (j in data.series[i].plots)
                        data.series[i].plots[j] = [data.series[i].plots[j][0] * 1000, data.series[i].plots[j][1]];

                    highchartOpts.series.push({
                        id: data.series[i].name,
                        name: data.series[i].name,
                        stack: 'stack' + data.series[i].stack_id,
                        data: data.series[i].plots,
                        color: data.series[i].options ? data.series[i].options.color : null,
                        visible: typeof seriesVisibility[data.series[i].name] !== undefined ?
                            seriesVisibility[data.series[i].name] : true,
                        zIndex: seriesIndexes.indexOf(data.series[i].name)
                    });

                    seriesData[data.series[i].name] = {
                        summary: data.series[i].summary,
                        options: data.series[i].options
                    };
                }

                // Prepare legend spacing
                if (graphOpts.legend) {
                    highchartOpts.chart.spacingBottom = highchartOpts.series.length * GRAPH_LEGEND_ROW_HEIGHT +
                        highchartOpts.chart.spacingBottom;

                    if (graph.data('toggled-legend') && graphOpts.expand) {
                        $container.height($container.outerHeight() + highchartOpts.series.length *
                            GRAPH_LEGEND_ROW_HEIGHT);

                        graph.data('toggled-legend', false);
                    }
                } else {
                    highchartOpts.chart.spacingBottom = GRAPH_SPACING_SIZE * 2;

                    if (graph.data('toggled-legend') && graphOpts.expand) {
                        $container.height($container.outerHeight() - highchartOpts.series.length *
                            GRAPH_LEGEND_ROW_HEIGHT);

                        graph.data('toggled-legend', false);
                    }
                }

                highchart = $container.highcharts(highchartOpts).highcharts();

                // Draw constants plot lines
                for (i in graphOpts.constants) {
                    highchart.yAxis[0].addPlotLine({
                        color: '#d00',
                        value: graphOpts.constants[i],
                        width: 1,
                        zIndex: 3
                    });
                }

                // Re-apply plotlines if any
                if (seriesPlotlines.length > 0) {
                    $.each(seriesPlotlines, function(i, name) {
                        if (name.startsWith('plotline-'))
                            name = name.substr(9);

                        graph.find('.graphcntr .highcharts-table-value[data-name="' + name + '"]').trigger('click');
                    });
                }

                // Set next refresh if needed
                if (graphOpts.refresh_interval) {
                    graph.data('timeout', setTimeout(function () {
                        graphDraw(graph, !graph.inViewport());
                    }, graphOpts.refresh_interval * 1000));
                }

                $deferred.resolve();
            }).fail(function () {
                graph.children('.graphctrl')
                    .attr('disabled', 'disabled')
                    .find('a:not([href="#edit"], [href="#refresh"], [href="#reset"]), .legend')
                        .attr('disabled', 'disabled');

                graph.find('.placeholder')
                    .addClass('icon icon-warning')
                    .html($.t('graph.mesg_load_failed', {name: '<strong>' + (graphOpts.title ||
                        graph.attr('data-graph')) + '</strong>'}));

                $deferred.resolve();
            });
        }, delay);
    }).promise();
}

function graphEnqueue(graph) {
    var $parent = $(graph).offsetParent(),
        parent = $parent.get(0),
        index = GRAPH_DRAW_PARENTS.indexOf(parent);

    if (index == -1) {
        GRAPH_DRAW_PARENTS.push(parent);
        GRAPH_DRAW_QUEUE.push([]);
        index = GRAPH_DRAW_PARENTS.length - 1;

        $parent.on('scroll', graphHandleQueue);
    }

    if (GRAPH_DRAW_QUEUE[index].indexOf(graph) == -1)
        GRAPH_DRAW_QUEUE[index].push(graph);
}

function graphExport(graph) {
    var canvas = document.createElement('canvas'),
        svg = graph.find('.graphcntr').highcharts().getSVG();

    canvas.setAttribute('width', parseInt(svg.match(/width="([0-9]+)"/)[1], 10));
    canvas.setAttribute('height', parseInt(svg.match(/height="([0-9]+)"/)[1], 10));

    if (canvas.getContext && canvas.getContext('2d')) {
        canvg(canvas, svg);

        window.location.href = canvas.toDataURL('image/png')
            .replace('image/png', 'image/octet-stream');

    } else {
        console.error("Your browser doesn't support mandatory Canvas feature");
    }
}

function graphGetSeriesIndexes(series) {
    var ordered = series.slice(0),
        indexes = [];

    ordered.sort(function (a, b) {
        if (!a.summary || !b.summary || !a.summary.avg || !b.summary.avg)
            return 0;

        return b.summary.avg - a.summary.avg;
    });

    $.each(ordered, function (index, entry) {
        indexes.push(entry.name);
    });

    return indexes;
}

function graphHandleActions(e) {
    var $target = $(e.target),
        $graph = $target.closest('[data-graph]'),
        $overlay,
        graphObj,
        delta,
        location,
        args = [],
        options,
        range;

    if (e.target.getAttribute('disabled') == 'disabled') {
        e.preventDefault();
        return;
    }

    if (e.target.href.endsWith('#edit')) {
        options = $graph.data('options');

        // Go to Administration Panel
        location = urlPrefix + '/admin/graphs/' + $(e.target).closest('[data-graph]').attr('data-graph');
        if (options.linked === true)
            location += '?linked=1';

        window.location = location;
    } else if (e.target.href.endsWith('#reframe-all')) {
        // Apply current options to siblings
        $graph.siblings('[data-graph]').each(function () {
            var $item = $(this),
                options = $graph.data('options');

            graphUpdateOptions($item, {
                time: options.time || null,
                range: options.range || null
            });

            graphDraw($item, !$item.inViewport());
        });

        graphDraw($graph);
    } else if (e.target.href.endsWith('#refresh')) {
        // Refresh graph
        graphDraw($graph, false);
    } else if (e.target.href.endsWith('#reset')) {
        // Reset graph timerange
        graphUpdateOptions($graph, {
            time: null,
            range: null
        });

        graphDraw($graph);
    } else if (e.target.href.endsWith('#embed')) {
        options = $graph.data('options');
        if (options.time)
            args.push('time=' + options.time.replace('+', '%2B'));
        if (options.range)
            args.push('range=' + options.range);
        if (options.refresh_interval)
            args.push('refresh=' + options.refresh_interval);

        // Open embeddable graph
        location = urlPrefix + '/show/graphs/' + $(e.target).closest('[data-graph]').attr('data-graph');
        if (args.length > 0)
            location += '?' + args.join('&');

        window.open(location);
    } else if (e.target.href.endsWith('#export')) {
        graphExport($graph);
    } else if (e.target.href.endsWith('#set-range')) {
        // Toggle range selector
        $(e.target).closest('.graphctrl').find('.ranges').toggle();
    } else if (e.target.href.endsWith('#set-time')) {
        options = $graph.data('options');

        $overlay = overlayCreate('time', {
            callbacks: {
                validate: function () {
                    graphUpdateOptions($graph, {
                        time: moment($overlay.find('input[name=time]').val()).format(TIME_RFC3339),
                        range: $overlay.find('input[name=range]').val()
                    });

                    graphDraw($graph);
                }
            }
        });

        $overlay.find('input[name=time]').appendDtpicker({
            closeOnSelected: true,
            current: options.time ? moment(options.time).format('YYYY-MM-DD HH:mm') : null,
            firstDayOfWeek: 1,
            minuteInterval: 10,
            todayButton: false
        });

        $overlay.find('input[name=range]').val(options.range || '');
    } else if (e.target.href.substr(e.target.href.lastIndexOf('#')).startsWith('#range-')) {
        range = e.target.href.substr(e.target.href.lastIndexOf('-') + 1);

        // Set graph range
        graphUpdateOptions($graph, {
            time: null,
            range: '-' + range
        });

        graphDraw($graph);
    } else if (e.target.href.endsWith('#step-backward') || e.target.href.endsWith('#step-forward')) {
        graphObj = $graph.children('.graphcntr').highcharts();

        delta = (graphObj.xAxis[0].max - graphObj.xAxis[0].min) / 4;

        if (e.target.href.endsWith('#step-backward'))
            delta *= -1;

        graphUpdateOptions($graph, {
            time: moment(graphObj.xAxis[0].min).add(delta).format(TIME_RFC3339),
            range: $graph.data('options').range.replace(/^-/, '')
        });

        graphDraw($graph);
    } else if (e.target.href.endsWith('#toggle-legend')) {
        var graphOpts = $graph.data('options') || $graph.opts('graph');

        $target.toggleClass('icon-fold icon-unfold');

        $graph.data('toggled-legend', true);

        graphUpdateOptions($graph, {
            legend: typeof graphOpts.legend == 'boolean' ? !graphOpts.legend : true
        });

        graphDraw($graph);
    } else if (e.target.href.endsWith('#zoom-in') || e.target.href.endsWith('#zoom-out')) {
        graphObj = $graph.children('.graphcntr').highcharts();

        delta = graphObj.xAxis[0].max - graphObj.xAxis[0].min;

        if (e.target.href.endsWith('#zoom-in')) {
            range = timeToRange(delta / 2);
            delta /= 4;
        } else {
            range = timeToRange(delta * 2);
            delta = (delta / 2) * -1;
        }

        graphUpdateOptions($graph, {
            time: moment(graphObj.xAxis[0].min).add(delta).format(TIME_RFC3339),
            range: range
        });

        graphDraw($graph);
    } else {
        return;
    }

    e.preventDefault();
}

function graphHandleMouse(e) {
    var $target = $(e.target),
        $graph = $target.closest('[data-graph]'),
        $control = $graph.children('.graphctrl'),
        offset;

    // Handle control lock
    if (e.type == 'mouseup' || e.type == 'mousedown') {
        GRAPH_CONTROL_LOCK = e.type == 'mousedown';
        return;
    }

    // Stop if graph has no control or is disabled
    if (GRAPH_CONTROL_LOCK || $control.length === 0 || $control.attr('disabled'))
        return;

    if (e.type != 'mousemove') {
        // Check if leaving graph
        if ($target.closest('.step, .actions').length === 0) {
            $graph.find('.graphctrl .ranges').hide();
            return;
        }

        if (GRAPH_CONTROL_TIMEOUT)
            clearTimeout(GRAPH_CONTROL_TIMEOUT);

        // Apply mask to prevent SVG events
        if (e.type == 'mouseenter')
            $control.addClass('active');
        else
            GRAPH_CONTROL_TIMEOUT = setTimeout(function () { $control.removeClass('active'); }, 1000);

        return;
    }

    // Handle steps display
    offset = $graph.offset();

    if ($target.closest('.actions').length === 0) {
        if (e.pageX - offset.left <= GRAPH_SPACING_SIZE * 2) {
            $control.find('.step a[href$=#step-backward]').addClass('active');
            return;
        } else if (e.pageX - offset.left >= $graph.width() - GRAPH_SPACING_SIZE * 2) {
            $control.find('.step a[href$=#step-forward]').addClass('active');
            return;
        }
    }

    $control.find('.step a').removeClass('active');
}

function graphHandleQueue(force) {
    var $deferreds = [];

    force = typeof force == 'boolean' ? force : false;

    if (GRAPH_DRAW_TIMEOUTS.draw)
        clearTimeout(GRAPH_DRAW_TIMEOUTS.draw);

    if (GRAPH_DRAW_TIMEOUTS.mesg)
        clearTimeout(GRAPH_DRAW_TIMEOUTS.mesg);

    return $.Deferred(function ($deferred) {
        GRAPH_DRAW_TIMEOUTS.draw = setTimeout(function () {
            var $graph,
                count = 0,
                delay = 0,
                i,
                j;

            GRAPH_DRAW_TIMEOUTS.mesg = setTimeout(function () {
                overlayCreate('loader', {
                    message: $.t('graph.mesg_loading')
                });
            }, 1000);

            for (i in GRAPH_DRAW_QUEUE) {
                for (j in GRAPH_DRAW_QUEUE[i]) {
                    if (!GRAPH_DRAW_QUEUE[i][j]) {
                        count += 1;
                        continue;
                    }

                    $graph = $(GRAPH_DRAW_QUEUE[i][j]);

                    if (force || $graph.inViewport()) {
                        $deferreds.push(graphDraw($graph, false, delay));
                        GRAPH_DRAW_QUEUE[i][j] = null;

                        if (force)
                            delay += GRAPH_DRAW_DELAY;
                    }
                }

                if (count == GRAPH_DRAW_QUEUE[i].length) {
                    GRAPH_DRAW_PARENTS.splice(i, 1);
                    GRAPH_DRAW_QUEUE.splice(i, 1);
                    $(GRAPH_DRAW_PARENTS[i]).off('scroll', graphHandleQueue);
                }
            }

            $.when.apply(null, $deferreds).then(function () {
                if (GRAPH_DRAW_TIMEOUTS.mesg)
                    clearTimeout(GRAPH_DRAW_TIMEOUTS.mesg);

                overlayDestroy('loader');
                $deferred.resolve();
            });
        }, 200);
    }).promise();
}

function graphSetupTerminate() {
    var $graphs = $('[data-graph]');

    // Get graph template
    $graphTemplate = $('.graphtmpl').removeClass('graphtmpl').detach();

    // Draw graphs
    $graphs.each(function () {
        var $item,
            id = this.getAttribute('data-graph');

        if (!id)
            return;

        $item = $(this);
        graphDraw($item, !$item.inViewport());
    });

    if ($graphs.length > 0) {
        Highcharts.setOptions({
            global : {
                useUTC : false
            }
        });
    }

    // Attach events
    $window
        .on('resize', graphHandleQueue);

    $body
        .on('mouseup mousedown mousemove mouseleave', '[data-graph]', graphHandleMouse)
        .on('mouseenter mouseleave', '.graphctrl .step, .graphctrl .actions', graphHandleMouse)
        .on('click', '[data-graph] a', graphHandleActions)
        .on('click', '.graphlist a', graphHandleQueue);
}

function graphUpdateOptions(graph, options) {
    var key;

    options = $.extend(graph.data('options'), options);

    for (key in options) {
        if (typeof options[key] != 'boolean' && !options[key])
            delete options[key];
    }

    graph.data('options', options);
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_TERM, graphSetupTerminate);

/* Pane */

var PANE_UNLOAD_LOCK = false;

function paneGoto(pane, step, initOnly) {
    var $item,
        numeric;

    initOnly = typeof initOnly == 'boolean' ? initOnly : false;

    if (ADMIN_PANES[pane].active === null)
        ADMIN_PANES[pane].callbacks.init();

    if (!step || ADMIN_PANES[pane].callbacks['step-' + step]() === false || initOnly)
        return;

    $item = paneMatch(pane);

    $item.find('[data-step=' + step + ']')
        .show()
        .siblings('[data-step]').hide();

    numeric = !isNaN(parseInt(step, 10));

    $item.find('button[name^=step-]').toggle(numeric);
    $item.find('button[name=step-ok]').toggle(!numeric);

    if (parseInt(step, 10) == 1)
        $item.find('button[name=step-prev]').attr('disabled', 'disabled');
    else
        $item.find('button[name=step-prev]').removeAttr('disabled');

    if (parseInt(step, 10) == ADMIN_PANES[pane].count) {
        $item.find('button[name=step-next]').attr('disabled', 'disabled');
        $item.find('button[name=step-save]').removeAttr('disabled');
    } else {
        $item.find('button[name=step-next]').removeAttr('disabled');
        $item.find('button[name=step-save]').attr('disabled', 'disabled');
    }

    if (ADMIN_PANES[pane].count == 1)
        $item.find('button[name=step-prev], button[name=step-next]').hide();

    ADMIN_PANES[pane].last   = ADMIN_PANES[pane].active;
    ADMIN_PANES[pane].active = step;
}

function paneMatch(name) {
    return $('[data-pane=' + name + ']');
}

function paneRegister(pane, callback) {
    ADMIN_PANES[pane] = {
        count: 0,
        active: null,
        last: null,
        callbacks: {
            init: callback
        }
    };

    $('[data-pane=' + pane + '] [data-step]').each(function () {
        var step = parseInt(this.getAttribute('data-step'), 10);

        if (!isNaN(step) && step > ADMIN_PANES[pane].count)
            ADMIN_PANES[pane].count = step;
    });
}

function paneSetupTerminate() {
    // Initialize panes
    $('[data-pane]').each(function () {
        var name = this.getAttribute('data-pane');

        if (ADMIN_PANES[name] && ADMIN_PANES[name].active === null)
            paneGoto(name, ADMIN_PANES[name].count > 0 ? 1 : null);
    });
}

function paneStepRegister(pane, step, callback) {
    if (!ADMIN_PANES[pane]) {
        console.error("Unable to find `" + pane + "' registered pane");
        return;
    }

    ADMIN_PANES[pane].callbacks['step-' + step] = callback;
}

// Attach events
$window.on('beforeunload', function () {
    if (PANE_UNLOAD_LOCK)
        return $.t('main.mesg_unsaved_changes');
});

// Register setup callbacks
setupRegister(SETUP_CALLBACK_TERM, paneSetupTerminate);

/* i18n */

function i18nSetupInit() {
    // Load messages resource and initialize i18n support
    return $.ajax({
        url: urlPrefix + '/static/messages.json',
        type: 'GET',
    }).pipe(function (data) {
        $.i18n.init({
            lng: 'en',
            resStore: {
                en: {
                    translation: data
                }
            }
        });
    });
}

// Register setup callbacks
setupRegister(SETUP_CALLBACK_INIT, i18nSetupInit);

// Execute setup callbacks
setupExec(SETUP_CALLBACK_INIT).then(function () {
    setupExec(SETUP_CALLBACK_TERM);
});

});
