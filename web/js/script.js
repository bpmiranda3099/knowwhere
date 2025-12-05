
var elements = [];

// Use event delegation so dynamically inserted components work
document.addEventListener('click', function (e) {
    var li = e.target.closest('.scroll-to-link');
    if (li) {
        e.preventDefault();
        var target = li.dataset.target;
        var elTarget = document.getElementById(target);
        if (elTarget) elTarget.scrollIntoView({ behavior: 'smooth' });
        var elems = document.querySelectorAll('.content-menu ul li');
        [].forEach.call(elems, function (el) { el.classList.remove('active'); });
        li.classList.add('active');
        return false;
    }

    var btn = e.target.closest('#button-menu-mobile');
    if (btn) {
        e.preventDefault();
        document.querySelector('html').classList.toggle('menu-opened');
        return false;
    }

    var closer = e.target.closest('.left-menu .mobile-menu-closer');
    if (closer) {
        e.preventDefault();
        document.querySelector('html').classList.remove('menu-opened');
        return false;
    }
});

function debounce (func) {
    var timer;
    return function (event) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(func, 100, event);
    };
}

function calculElements () {
    var totalHeight = 0;
    elements = [];
    [].forEach.call(document.querySelectorAll('.content-section'), function (div) {
        var section = {};
        section.id = div.id;
        totalHeight += div.offsetHeight;
        section.maxHeight = totalHeight - 25;
        elements.push(section);
    });
    onScroll();
}

function onScroll () {
    var scroll = window.pageYOffset;
    for (var i = 0; i < elements.length; i++) {
        var section = elements[i];
        if (scroll <= section.maxHeight) {
            var elems = document.querySelectorAll(".content-menu ul li");
            [].forEach.call(elems, function (el) {
                el.classList.remove("active");
            });
            var activeElems = document.querySelectorAll(".content-menu ul li[data-target='" + section.id + "']");
            [].forEach.call(activeElems, function (el) {
                el.classList.add("active");
            });
            break;
        }
    }
    if (window.innerHeight + scroll + 5 >= document.body.scrollHeight) { // end of scroll, last element
        var elems = document.querySelectorAll(".content-menu ul li");
        [].forEach.call(elems, function (el) {
            el.classList.remove("active");
        });
        var activeElems = document.querySelectorAll(".content-menu ul li:last-child");
        [].forEach.call(activeElems, function (el) {
            el.classList.add("active");
        });
    }
}

function initCodeTabs () {
    var tabContainers = document.querySelectorAll('.code-tabs');
    [].forEach.call(tabContainers, function (container) {
        // Replace buttons to remove previous listeners, then re-query fresh lists
        var origButtons = container.querySelectorAll('.tab-button');
        [].forEach.call(origButtons, function (button) {
            var newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
        });

        var buttons = container.querySelectorAll('.tab-button');
        var panels = container.querySelectorAll('.tab-panel');

        function activateTab (tabName) {
            // Re-query to ensure we operate on current DOM nodes
            var btns = container.querySelectorAll('.tab-button');
            var pans = container.querySelectorAll('.tab-panel');
            [].forEach.call(btns, function (button) {
                button.classList.toggle('active', button.dataset.tab === tabName);
            });
            [].forEach.call(pans, function (panel) {
                panel.classList.toggle('active', panel.dataset.tabPanel === tabName);
            });
        }

        [].forEach.call(buttons, function (button) {
            button.addEventListener('click', function () {
                activateTab(this.dataset.tab);
            });
        });
    });
}

// Initialize on DOM ready and when components are inserted
document.addEventListener('DOMContentLoaded', function () {
    calculElements();
    initCodeTabs();
});

// Custom event dispatched by component loaders when shared components are inserted
document.addEventListener('componentsLoaded', function () {
    calculElements();
    initCodeTabs();
});
window.addEventListener("resize", debounce(function (e) {
    e.preventDefault();
    calculElements();
}));
window.addEventListener('scroll', function (e) {
    e.preventDefault();
    onScroll();
});