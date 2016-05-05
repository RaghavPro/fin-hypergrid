// ComboBox.js - A combo-box is a combination of a text-box and a drop-down.
// User may type into it and/or select an item from the drop-down (by clicking on the triangle at the right).
// The drop-down has sections which are toggled from a control area between the text-box and the drop-down.

/* eslint-env browser */

'use strict';

var Textfield = require('./Textfield');
var prototype = require('./Simple').prototype;
var onTransitionEnd = require('../lib/queueless');
var elfor = require('../lib/elfor');

/*********************************/
/* eslint-disable no-unused-vars */
/*********************************/

var TOGGLE_MODE_PREFIX = 'toggle-mode-';

/**
 * A combo box is a text box that also has a drop-down containing options. The drop-down consists of an actual drop-down list (a `<select>` list) plus a _control area_ above it containing toggles. The toggles control the visibility of the various "mode lists."
 * @constructor
 */
var ComboBox = Textfield.extend('ComboBox', {

    initialize: function() {
        var el = this.el;

        this.input = el.querySelector('input');
        this.dropper = el.querySelector('span');
        this.options = el.querySelector('div');
        this.controls = this.options.querySelector('div');
        this.dropdown = this.options.querySelector('select');

        this.transit = onTransitionEnd(this.options, 'options', this);

        // wire-ups
        this.dropper.addEventListener('mousedown', toggleDropDown.bind(this));
        this.dropdown.addEventListener('mousewheel', function(e) { e.stopPropagation(); });
        this.dropdown.addEventListener('change', insertText.bind(this));
        el.onblur = null; // void this one, set by super's initialize
    },

    template: function() {
/*
    <div class="hypergrid-input" title="">
        <input>
        <span title="Click for options"></span>
        <div>
            <div></div>
            <select size="12"></select>
        </div>
    </div>
*/
    },

    /**
     * When there's only one mode defined here, the control area portion of the UI is hidden.
     */
    modes: [

    ],

    showEditor: function() {
        var menuModesSource = this.menuModesSource,
            menuModes = this.menuModes = {};

        // build the proxy
        this.modes.forEach(function(mode) {
            var modeName = mode.name;
            if (modeName in menuModesSource) {
                menuModes[modeName] = menuModesSource[modeName];
            }
        });

        // wire-ups
        this.controls.addEventListener('click', onModeIconClick.bind(this));

        // set the initial state of the mode toggles
        this.modes.forEach(function(mode) {
            // create a toggle
            var toggle = document.createElement('span');
            toggle.className = TOGGLE_MODE_PREFIX + mode.name;
            toggle.title = 'Toggle ' + (mode.label || mode.name).toLowerCase();
            toggle.textContent = mode.symbol;
            this.controls.appendChild(toggle);

            // create and label a new optgroup
            if (mode.label) {
                var optgroup = document.createElement('optgroup');
                optgroup.label = mode.label;
                optgroup.className = 'submenu-' + mode.name;
                optgroup.style.backgroundColor = mode.backgroundColor;
                this.dropdown.add(optgroup);
            }

            var className = '.' + TOGGLE_MODE_PREFIX + mode.name,
                ctrl = this.controls.querySelector(className),
                modeState = menuModes[mode.name];

            setModeIconAndOptgroup.call(this, ctrl, mode.name, modeState);
        }.bind(this));

        prototype.showEditor.call(this);
    },

    hideEditor: function() {
        // this is where you would persist this.menuModes
        prototype.hideEditor.call(this);
    },

    keyup: function(e) {
        if (e) {
            prototype.keyup.call(this, e);

            if (this.grid.isFilterRow(this.getEditorPoint().y)) {
                if (this.grid.resolveProperty('filteringMode') === 'immediate') {
                    this.saveEditorValue();
                    this._moveEditor();
                }
            }
        }
    }
});

var stateToActionMap = {
    hidden: slideDown,
    visible: slideUp
};

function onModeIconClick(e) {
    var ctrl = e.target;

    if (ctrl.tagName === 'SPAN') {
        // extract the mode name from the toggle control's class name
        var modeClassName = Array.prototype.find.call(ctrl.classList, function(className) {
                return className.indexOf(TOGGLE_MODE_PREFIX) === 0;
            }),
            modeName = modeClassName.substr(TOGGLE_MODE_PREFIX.length);

        // toggle mode in the filter
        var modeState = this.menuModes[modeName] ^= 1;

        setModeIconAndOptgroup.call(this, ctrl, modeName, modeState);
    }
}

function setModeIconAndOptgroup(ctrl, name, state) {
    var style, optgroup, sum, display,
        mode = this.modes.find(function(mode) { return mode.name === name; }); // eslint-disable-line no-shadow

    // set icon state (color)
    ctrl.classList.toggle('active', !!state);

    // empty the optgroup if hiding; rebuild it if showing
    if (state) { // rebuild it
        // show progress cursor for (at least) 1/3 second
        style = this.el.style;
        style.cursor = 'progress';
        setTimeout(function() { style.cursor = null; }, 333);

        if (mode.selector) {
            optgroup = this.dropdown.querySelector(mode.selector);
            sum = mode.appendOptions.call(this, optgroup);

            // update sum
            optgroup.label = optgroup.label.replace(/ \(\d+\)$/, ''); // remove old sum
            optgroup.label += ' (' + sum + ')';
        } else {
            mode.appendOptions.call(this);
        }

        display = null;
    } else {
        display = 'none';
    }

    // hide/show the group
    elfor.each(
        mode.selector || ':scope>option,:scope>optgroup:not([class])',
        function iteratee(el) { el.style.display = display; },
        this.dropdown
    );

    // TODO: Reset the width of this.options to the natural width of this.dropdown. To do this, we need to remove the latter's "width: 100%" from the CSS and then set an explicit this.options.style.width based on the computed width of this.dropdown. This is complicated by the fact that it cannot be done before it is in the DOM.
}

function toggleDropDown() {
    var transitionInProgress = this.transit();

    if (!transitionInProgress) {
        var state = window.getComputedStyle(this.dropdown).visibility;
        stateToActionMap[state].call(this);
    }
}

function slideDown() {
    // preserve the text box's current text selection, which is about to be lost
    this.selectionStart = this.input.selectionStart;
    this.selectionEnd = this.input.selectionEnd;

    // clean up the select list from last usage
    this.dropdown.style.selectedIndex = -1; // be kind (remove previous selection)
    this.dropdown.style.scrollTop = 0; // rewind

    // show the drop-down slide down effect
    this.options.style.visibility = 'visible';
    var dropDownHeight = this.dropdown.size * 15;
    this.options.style.height = 2 + 15 + dropDownHeight + 2 + 'px'; // starts the slide down effect

    // while in drop-down, listen for clicks in text box which means abprt
    this.input.addEventListener('mousedown', this.slideUpBound = slideUp.bind(this));

    // schedule the transition flag
    this.transit(null);
}

function slideUp() {
    // stop listening to input clicks
    this.input.removeEventListener('mousedown', this.slideUpBound);

    // start the slide up effect
    this.options.style.height = 0;

    // schedule the hide to occur after the slide up effect
    this.transit(function(el) {
        el.style.visibility = 'hidden';
    });
}

function insertText(e) {
    // insert the text at the insertion point or over the selected text
    this.input.focus();
    this.input.setRangeText(this.dropdown.value, this.selectionStart, this.selectionEnd, 'end');

    // close the drop-down
    toggleDropDown.call(this);
}


module.exports = ComboBox;