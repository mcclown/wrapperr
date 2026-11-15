// The statistics page drawn as a treasure map, when the admin turns it on (get_log_map). Between the sections a
// stretch of sketched chart: a trail that draws itself down the page as you scroll, past islands and the voyage's
// sea creatures, to each section, laid on the chart like a sheet of parchment and pinned with a wax seal. The
// chart's layers drift at different speeds as it scrolls (CSS scroll-driven animations, where the browser has
// them). Nothing here changes what the page says, only how it looks.

// The screen width the chart was last drawn for, once it is drawn
var log_map_width = null;

function log_map_on() {
    return typeof functions !== 'undefined' && functions && functions.get_log_map === true;
}

// Marks the sections a loader has just added, so the chart knows what each one is
function log_map_mark(kind) {
    if(!log_map_on()) {
        return;
    }
    document.querySelectorAll('#search_results > .boks:not([data-chapter])').forEach(function(section) {
        section.setAttribute('data-chapter', kind);
    });
}

// What each chapter's stretch of chart shows: its landmark, island, smaller sketches and the creature in the
// near layer. d4 and d5 only fit on a wide screen.
var log_map_stops = {
    movies: { label: 'Cinema Shoals', island: 'palm', s2: 'ship', s3: 'dolphins', d4: 'rocks', d5: 'bottle', near: 'tail' },
    shows: { label: 'Box-set Bay', island: 'atoll', s2: 'bottle', s3: 'serpent', d4: 'ship', d5: 'gulls', near: 'narwhals' },
    music: { label: 'Shanty Sound', island: 'hut', s2: 'turtle', s3: 'gulls', d4: 'whale', d5: 'clam', near: 'albatross' },
    requests: { label: 'Request Reef', island: 'rocks', s2: 'clam', s3: 'whale', d4: 'anchor', d5: 'gulls', near: 'kraken' },
    users: { label: 'Crew’s Cove', island: 'volcano', s2: 'anchor', s3: 'tentacle', d4: 'wreck', d5: 'dolphins', near: 'coils' },
    compare: { label: 'Old Year’s Light', island: 'lighthouse', s2: 'wreck', s3: 'dolphins', d4: 'gulls', d5: 'rocks', near: 'ship' }
};

// The chart at two widths: three trail shapes, each with where its sketches sit (the later legs use them mirrored)
var log_map_layouts = {
    narrow: {
        width: 390, scale: { island: 1, small: 1, extra: 0, wave: 1, compass: 1, label: 17 },
        near: { tail: 1, coils: 1, narwhals: 1.5, kraken: 1.3, albatross: 1.2, ship: 2.8 },
        coast: { left: 'translate(390 0) scale(-1 1)', right: '' },
        bases: [
            { path: 'M195 0C40 90 40 230 170 290S370 420 270 530S110 640 140 690S195 730 195 760',
              island: [296, 180], label: [296, 236], s2: [95, 450], s3: [70, 590], near: [330, 600],
              compass: [300, 760], coastLeft: true, waves: [[240, 70], [30, 390], [290, 650]] },
            { path: 'M195 0C350 100 350 240 210 320S20 440 90 540S280 650 230 710S195 740 195 760',
              island: [92, 200], label: [92, 256], s2: [305, 470], s3: [318, 615], near: [70, 640],
              compass: [90, 800], coastLeft: false, waves: [[50, 70], [250, 400], [40, 690]] },
            { path: 'M195 0C120 80 30 170 80 260S330 330 310 450S130 560 150 640S195 730 195 760',
              island: [290, 190], label: [290, 246], s2: [318, 640], s3: [70, 480], near: [320, 760],
              compass: [310, 420], coastLeft: true, waves: [[230, 70], [40, 380], [40, 660]] }
        ],
        last: { path: 'M195 0C40 90 40 230 170 290S370 420 270 530S150 640 185 676', x: [190, 682], island: [195, 690], islandScale: 1,
                label: [110, 660], ship: [70, 420], gulls: [300, 120], waves: [[40, 160], [280, 330], [50, 520]], tentacles: [[340, 640, 2.4]] }
    },
    wide: {
        width: 1440, scale: { island: 1.6, small: 1.4, extra: 1.2, wave: 1.3, compass: 1.4, label: 24 },
        near: { tail: 1.6, coils: 1.6, narwhals: 2.4, kraken: 2, albatross: 1.9, ship: 4.4 },
        coast: { left: 'scale(-1.4 1) translate(-390 0)', right: 'translate(1440 0) scale(1.4 1) translate(-390 0)' },
        bases: [
            { path: 'M720 0C380 90 300 240 560 300S1160 420 980 540S520 640 620 700S720 740 720 760',
              island: [1100, 190], label: [1100, 272], s2: [230, 470], s3: [1250, 600], d4: [210, 150], d5: [930, 660],
              near: [1290, 640], compass: [1200, 800], coastLeft: true,
              waves: [[1260, 90], [110, 330], [1290, 420], [860, 120], [420, 620]] },
            { path: 'M720 0C1080 100 1160 250 880 320S260 430 420 540S1000 640 840 710S720 745 720 760',
              island: [320, 200], label: [320, 282], s2: [1190, 470], s3: [190, 650], d4: [1250, 140], d5: [560, 700],
              near: [150, 560], compass: [1250, 800], coastLeft: false,
              waves: [[160, 80], [1240, 300], [1000, 560], [520, 90], [1250, 700]] },
            { path: 'M720 0C560 70 320 160 420 260S1040 320 1000 450S560 560 600 650S720 740 720 760',
              island: [1130, 200], label: [1130, 282], s2: [260, 560], s3: [1260, 520], d4: [220, 170], d5: [930, 700],
              near: [1290, 820], compass: [230, 820], coastLeft: true,
              waves: [[860, 90], [160, 380], [1260, 330], [480, 700], [1100, 640]] }
        ],
        last: { path: 'M720 0C380 90 300 240 560 300S1160 420 980 540S640 640 712 672', x: [720, 686], island: [720, 690], islandScale: 1.4,
                label: [500, 676], ship: [300, 420], gulls: [1100, 140], waves: [[200, 160], [1180, 330], [260, 560]], tentacles: [[1260, 660, 3.4], [140, 760, 2.6]] }
    }
};

function log_map_at(point, scale) {
    return 'translate(' + point[0] + ' ' + point[1] + ') scale(' + scale + ')';
}

function log_map_use(symbol, transform) {
    return '<use href="#log-map-' + symbol + '" transform="' + transform + '"></use>';
}

// How the chart fits the screen: the layout for its width, scaled down to fit a desktop window narrower than the
// wide chart, and how far in the chart's strip sits on a screen wider than it (in the chart's own units)
function log_map_fit() {
    var width = document.documentElement.clientWidth;
    var layout = width >= 1000 ? log_map_layouts.wide : log_map_layouts.narrow;
    var scale = Math.min(1, width / layout.width);
    var units = width / scale;
    return { width: width, layout: layout, scale: scale, units: units, inset: (units - layout.width) / 2 };
}

// A layer in the centred strip the chart is drawn in, scaled to fit
function log_map_layer(fit, kind, height, top) {
    var width = fit.layout.width * fit.scale;
    return '<svg class="log-map-layer log-map-' + kind + '" viewBox="0 0 ' + fit.layout.width + ' ' + height + '" style="width: ' + width + 'px; height: ' +
        (height * fit.scale) + 'px; top: ' + (top * fit.scale) + 'px; margin-left: calc(50% - ' + (width / 2) + 'px)">';
}

// The chart's far layer, across the whole screen: paper grain, lines of latitude, a coast down one edge and a
// compass rose
function log_map_far(fit, base, flip) {
    var layout = fit.layout;
    var units = fit.units;
    var html = '<svg class="log-map-layer log-map-far" viewBox="0 0 ' + units + ' 1000" style="width: 100%; height: ' + (1000 * fit.scale) + 'px; top: ' + (-120 * fit.scale) + 'px">';
    html += '<rect width="' + units + '" height="1000" filter="url(#log-map-paper)"></rect>';
    html += '<path d="M0 220H' + units + 'M0 520H' + units + 'M0 820H' + units + '" stroke="#7a5a35" fill="none" stroke-width="0.7" stroke-dasharray="2 6" opacity="0.4"></path>';
    if(base) {
        // The coast at the screen's own edge, on the side the leg puts it
        var left = base.coastLeft !== flip;
        var coast = left ? layout.coast.left : 'translate(' + (units - layout.width) + ' 0) ' + (layout.coast.right || '');
        html += '<g transform="' + coast + '" filter="url(#log-map-sketch)">' + log_map_use('coast', '') + '</g>';
        var x = fit.inset + (flip ? layout.width - base.compass[0] : base.compass[0]);
        html += '<g filter="url(#log-map-sketch)">' + log_map_use('compass', log_map_at([x, base.compass[1]], layout.scale.compass)) + '</g>';
        html += '<text x="' + x + '" y="' + (base.compass[1] - 46 * layout.scale.compass) + '" text-anchor="middle" class="log-map-north">N</text>';
    }
    return html + '</svg>';
}

function log_map_leg_open(fit, extra) {
    return '<div class="log-map-leg' + (extra || '') + '" aria-hidden="true" style="height: ' + (760 * fit.scale) + 'px">';
}

// One stretch of chart before a chapter
function log_map_leg(fit, index, stop) {
    var layout = fit.layout;
    var base = layout.bases[index % layout.bases.length];
    var flip = index >= layout.bases.length;
    var width = layout.width;
    var flipT = flip ? 'translate(' + width + ' 0) scale(-1 1)' : '';
    var scale = layout.scale;

    var html = log_map_leg_open(fit);
    html += log_map_far(fit, base, flip);

    html += log_map_layer(fit, 'mid', 760, 0);
    html += '<g transform="' + flipT + '" filter="url(#log-map-sketch)">';
    base.waves.forEach(function(wave) {
        html += log_map_use('waves', log_map_at(wave, scale.wave));
    });
    html += log_map_use(stop.island, log_map_at(base.island, scale.island));
    html += log_map_use(stop.s2, log_map_at(base.s2, scale.small));
    html += log_map_use(stop.s3, log_map_at(base.s3, scale.small));
    if(scale.extra && base.d4) {
        html += log_map_use(stop.d4, log_map_at(base.d4, scale.extra));
        html += log_map_use(stop.d5, log_map_at(base.d5, scale.extra));
    }
    html += '</g>';
    var labelX = flip ? width - base.label[0] : base.label[0];
    html += '<text x="' + labelX + '" y="' + base.label[1] + '" text-anchor="middle" class="log-map-label" style="font-size: ' + scale.label + 'px">' + stop.label + '</text>';
    html += '</svg>';

    html += log_map_layer(fit, 'near', 1080, -160);
    html += '<g transform="' + flipT + '" opacity="0.5" filter="url(#log-map-sketch)">';
    html += log_map_use(stop.near, log_map_at(base.near, layout.near[stop.near] || 1));
    html += '</g></svg>';

    html += log_map_layer(fit, 'trail', 760, 0);
    html += '<g transform="' + flipT + '"><path class="log-map-dots" d="' + base.path + '"></path></g>';
    html += '</svg>';

    return html + '</div>';
}

// The last stretch, to the treasure and the X, before the farewell
function log_map_last_leg(fit) {
    var layout = fit.layout;
    var last = layout.last;

    var html = log_map_leg_open(fit, ' log-map-leg-last');
    html += log_map_far(fit, null, false);

    html += log_map_layer(fit, 'mid', 760, 0);
    html += '<g filter="url(#log-map-sketch)">';
    last.waves.forEach(function(wave) {
        html += log_map_use('waves', log_map_at(wave, layout.scale.wave));
    });
    html += log_map_use('gulls', log_map_at(last.gulls, layout.scale.small));
    html += log_map_use('ship', log_map_at(last.ship, layout.scale.small * 1.1));
    html += log_map_use('treasure', log_map_at(last.island, last.islandScale));
    html += '</g>';
    html += '<text x="' + last.label[0] + '" y="' + last.label[1] + '" text-anchor="middle" class="log-map-label" style="font-size: ' + layout.scale.label + 'px">X marks the spot</text>';
    html += '</svg>';

    html += log_map_layer(fit, 'near', 1080, -160);
    html += '<g opacity="0.5" filter="url(#log-map-sketch)">';
    last.tentacles.forEach(function(tentacle) {
        html += log_map_use('tentacle', log_map_at([tentacle[0], tentacle[1]], tentacle[2]));
    });
    html += '</g></svg>';

    var size = 18 * last.islandScale;
    html += log_map_layer(fit, 'trail', 760, 0);
    html += '<path class="log-map-dots" d="' + last.path + '"></path>';
    html += '<path class="log-map-x" d="M' + (last.x[0] - size) + ' ' + (last.x[1] - size) + 'L' + (last.x[0] + size) + ' ' + (last.x[1] + size) +
            'M' + (last.x[0] + size) + ' ' + (last.x[1] - size) + 'L' + (last.x[0] - size) + ' ' + (last.x[1] + size) + '"></path>';
    html += '</svg>';

    return html + '</div>';
}

// The torn edge of a sheet of parchment, top or bottom
function log_map_edge(position) {
    var points = [];
    for(var x = 0; x <= 100; x += 2.5) {
        // A fixed ragged line, so the same section always tears the same way
        points.push(x + ',' + (6 + 5 * Math.sin(x * 1.7) + 3 * Math.sin(x * 4.3 + 1)).toFixed(1));
    }
    var path = position === 'top' ? 'M0,20 L' + points.join(' L') + ' L100,20 Z' : 'M0,0 L' + points.map(function(point) {
        var parts = point.split(',');
        return parts[0] + ',' + (20 - parts[1]);
    }).join(' L') + ' L100,0 Z';
    return '<svg class="log-map-edge log-map-edge-' + position + '" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="' + path + '"></path></svg>';
}

var log_map_numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// The sketches the introduction and the farewell show in place of their illustrations: setting sail, and the
// anchor dropped at journey's end
var log_map_sketches = {
    intro: log_map_use('compass', 'translate(-80 -40) scale(0.8)') + log_map_use('waves', 'translate(-110 72) scale(1.6)') +
           log_map_use('waves', 'translate(40 80) scale(1.6)') + log_map_use('gulls', 'translate(70 -60) scale(1.4)') +
           log_map_use('ship', 'translate(10 50) scale(3)'),
    outro: log_map_use('gulls', 'translate(-80 -60) scale(1.4)') + log_map_use('waves', 'translate(-110 -10) scale(1.6)') +
           log_map_use('waves', 'translate(40 -2) scale(1.6)') + log_map_use('anchor', 'translate(0 40) scale(1.9)')
};

function log_map_sketch(section, kind) {
    var illustration = section.querySelector('img');
    if(!log_map_sketches[kind] || !illustration || section.querySelector('.log-map-sketch')) {
        return;
    }
    illustration.insertAdjacentHTML('beforebegin', '<svg class="log-map-sketch" viewBox="-130 -100 260 200" role="img" aria-label="' +
        (kind === 'intro' ? 'A ship setting sail' : 'An anchor dropped') + '"><g filter="url(#log-map-sketch)">' + log_map_sketches[kind] + '</g></svg>');
    illustration.style.display = 'none';
}

// Draws the chart into the loaded page: the stretches between the sections, the sheets and their seals
function log_map_draw() {
    if(!log_map_on()) {
        return;
    }
    document.body.classList.add('log-map');
    if(!document.getElementById('log-map-symbols')) {
        document.body.insertAdjacentHTML('afterbegin', log_map_symbols);
    }

    var fit = log_map_fit();
    log_map_width = fit.width;

    document.querySelectorAll('.log-map-leg').forEach(function(leg) {
        leg.remove();
    });

    var sections = document.querySelectorAll('#search_results > .boks');
    var chapter = 0;
    sections.forEach(function(section, index) {
        var kind = section.getAttribute('data-chapter');
        if(!section.classList.contains('log-map-sheet')) {
            section.classList.add('log-map-sheet');
            section.insertAdjacentHTML('afterbegin', log_map_edge('top'));
            section.insertAdjacentHTML('beforeend', log_map_edge('bottom'));
            log_map_sketch(section, kind);
        }

        if(kind === 'intro' || index === 0) {
            return;
        }
        if(kind === 'outro') {
            section.insertAdjacentHTML('beforebegin', log_map_last_leg(fit));
            return;
        }

        var stop = log_map_stops[kind] || log_map_stops.movies;
        section.insertAdjacentHTML('beforebegin', log_map_leg(fit, chapter, stop));
        if(!section.querySelector('.log-map-seal')) {
            section.querySelector('.log-map-edge-top').insertAdjacentHTML('afterend', '<div class="log-map-seal" aria-hidden="true">' + (log_map_numerals[chapter] || chapter + 1) + '</div>');
        }
        chapter++;
    });

    log_map_track();
}

// Draws each stretch's trail down to a point just above the middle of the screen as it scrolls past, and keeps
// what is drawn: scrolling back up never rubs it out. Over the last screen of the page that point slides down to
// the bottom, so the trail reaches the X as the page ends.
function log_map_track() {
    var height = window.innerHeight;
    var top = window.scrollY;
    var remaining = document.documentElement.scrollHeight - top - height;
    var near_end = Math.max(0, Math.min(1, 1 - remaining / (height * 0.6)));
    var front = top + height * (0.45 + 0.55 * near_end) + (remaining <= 1 ? height : 0);

    document.querySelectorAll('.log-map-leg').forEach(function(leg) {
        var start = leg.getBoundingClientRect().top + top;
        var part = Math.max(0, Math.min(1, (front - start) / leg.offsetHeight));
        var drawn = parseFloat(leg.getAttribute('data-drawn') || '0');
        if(part > drawn + 0.005) {
            leg.setAttribute('data-drawn', part);
            leg.querySelector('.log-map-trail').style.clipPath = 'inset(0 0 ' + ((1 - part) * 100).toFixed(1) + '% 0)';
        }
    });
}

var log_map_frame = false;
window.addEventListener('scroll', function() {
    if(log_map_width === null || log_map_frame) {
        return;
    }
    log_map_frame = true;
    requestAnimationFrame(function() {
        log_map_frame = false;
        log_map_track();
    });
}, { passive: true });

// Redraws the chart to fit when the screen's width changes (a phone turned on its side, a window resized)
var log_map_resize = null;
window.addEventListener('resize', function() {
    if(log_map_width === null) {
        return;
    }
    clearTimeout(log_map_resize);
    log_map_resize = setTimeout(function() {
        if(document.documentElement.clientWidth !== log_map_width) {
            log_map_draw();
        }
    }, 150);
});

// The sketches the chart is drawn from, in the voyage's ink, with a wobble filter for a hand-drawn line
var log_map_symbols = `<svg id="log-map-symbols" width="0" height="0" style="position: absolute" aria-hidden="true"><defs>
<filter id="log-map-sketch" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7"></feTurbulence><feDisplacementMap in="SourceGraphic" scale="4"></feDisplacementMap></filter>
<filter id="log-map-paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"></feTurbulence><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.24  0 0 0 0 0.1  0 0 0 0.22 0"></feColorMatrix></filter>
<pattern id="log-map-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0V6" stroke="#7a5a35" stroke-width="1" opacity="0.55"></path></pattern>
<pattern id="log-map-hatch-sea" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M0 0H9" stroke="#7a5a35" stroke-width="0.7" opacity="0.35"></path></pattern>
<g id="log-map-tree"><path d="M0 0C1 -12 0 -20 -3 -28" stroke="#5a4327" fill="none" stroke-width="2"></path><path d="M-3 -28c-9 -2 -16 2 -18 7M-3 -28c9 -3 16 0 18 6M-3 -28c-3 -8 -10 -10 -16 -9M-3 -28c4 -8 11 -9 16 -6" stroke="#3f6b4f" fill="none" stroke-width="2" stroke-linecap="round"></path></g>
<g id="log-map-waves"><path d="M0 0q7 -6 14 0t14 0t14 0" stroke="#5a4327" fill="none" stroke-width="1.3" opacity="0.75"></path></g>
<g id="log-map-coast"><path d="M390 60C340 110 365 200 322 262S352 382 302 452S344 602 312 702S362 862 390 920Z" fill="url(#log-map-hatch)" stroke="#7a5a35" stroke-width="1.6"></path><path d="M390 60C340 110 365 200 322 262S352 382 302 452S344 602 312 702S362 862 390 920" fill="none" stroke="#7a5a35" stroke-width="0.8" opacity="0.5" transform="translate(-9 3)"></path><path d="M390 60C340 110 365 200 322 262S352 382 302 452S344 602 312 702S362 862 390 920" fill="none" stroke="#7a5a35" stroke-width="0.6" opacity="0.3" transform="translate(-18 6)"></path><path d="M350 330l8 -14l8 14M362 340l7 -12l7 12M352 620l8 -14l8 14" stroke="#7a5a35" fill="none" stroke-width="1.3"></path></g>
<g id="log-map-compass" stroke="#7a5a35" fill="none"><path d="M0 0L0 -500M0 0L360 -360M0 0L500 0M0 0L360 360M0 0L0 500M0 0L-360 360M0 0L-500 0M0 0L-360 -360" stroke-width="0.5" opacity="0.22"></path><circle r="30" stroke-width="1.3"></circle><circle r="24" stroke-width="0.8"></circle><path d="M0 -40L6 -6L40 0L6 6L0 40L-6 6L-40 0L-6 -6Z" fill="#7a5a35" stroke="#5a4327" stroke-width="1" opacity="0.85"></path><path d="M0 -40L6 -6L0 0Z M40 0L6 6L0 0Z M0 40L-6 6L0 0Z M-40 0L-6 -6L0 0Z" fill="#f1e2c0" stroke="none"></path></g>
<g id="log-map-palm"><path d="M-58 8C-62 -4 -50 -16 -30 -18C-20 -30 4 -30 14 -20C34 -24 56 -14 58 0C62 14 40 24 10 22C-12 30 -48 24 -58 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.8"></path><path d="M-58 8C-62 -4 -50 -16 -30 -18C-20 -30 4 -30 14 -20C34 -24 56 -14 58 0C62 14 40 24 10 22C-12 30 -48 24 -58 8Z" fill="none" stroke="#5a4327" stroke-width="0.8" opacity="0.5" transform="translate(2 1.5)"></path><path d="M-70 10C-74 -10 -56 -26 -30 -28M58 -18C76 -8 76 16 50 30" fill="none" stroke="#7a5a35" stroke-width="0.8" opacity="0.6"></path><path d="M-30 -2l9 -16l9 16M-14 -4l8 -13l8 13" stroke="#5a4327" fill="none" stroke-width="1.5"></path><use href="#log-map-tree" transform="translate(26 -14)"></use></g>
<g id="log-map-atoll"><ellipse rx="74" ry="34" fill="none" stroke="#7a5a35" stroke-width="0.8" stroke-dasharray="3 5" opacity="0.6"></ellipse><ellipse rx="62" ry="26" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.6"></ellipse><ellipse rx="44" ry="15" fill="#e3cf9f" stroke="#5a4327" stroke-width="1.2"></ellipse><ellipse rx="44" ry="15" fill="url(#log-map-hatch-sea)"></ellipse><use href="#log-map-tree" transform="translate(-48 -14) scale(0.6)"></use><use href="#log-map-tree" transform="translate(52 -10) scale(0.5)"></use><use href="#log-map-tree" transform="translate(8 24) scale(0.45)"></use></g>
<g id="log-map-rocks"><ellipse cx="0" cy="4" rx="74" ry="26" fill="none" stroke="#7a5a35" stroke-width="0.8" stroke-dasharray="3 5" opacity="0.6"></ellipse><path d="M-52 8L-46 -8L-38 -14L-30 -6L-26 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.5"></path><path d="M-22 8L-14 -22L-4 -28L6 -16L12 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.5"></path><path d="M16 8L22 -6L32 -10L40 2L42 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.5"></path><path d="M-4 -28L-8 -10M6 -16L0 -2M32 -10L30 0" stroke="#5a4327" stroke-width="1" fill="none"></path><path d="M-66 14q8 -5 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path></g>
<g id="log-map-volcano"><path d="M-56 10C-50 -2 -30 -6 -20 -4L-8 -40H10L22 -4C34 -6 52 -2 56 10C30 18 -30 18 -56 10Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.6"></path><path d="M-8 -40C-4 -36 6 -36 10 -40" stroke="#5a4327" fill="none" stroke-width="1.4"></path><path d="M2 -38C4 -28 0 -20 4 -10" stroke="#9b2c22" stroke-width="2" fill="none"></path><path d="M0 -46c-10 -8 4 -16 -4 -26c-8 -10 10 -14 2 -26M8 -46c8 -8 -2 -16 6 -24" stroke="#7a5a35" fill="none" stroke-width="1.4" opacity="0.8"></path><path d="M-70 14C-74 -2 -60 -12 -40 -12M50 -8C72 -4 76 14 60 22" fill="none" stroke="#7a5a35" stroke-width="0.8" opacity="0.6"></path></g>
<g id="log-map-hut"><path d="M-58 8C-62 -4 -50 -16 -30 -18C-20 -30 4 -30 14 -20C34 -24 56 -14 58 0C62 14 40 24 10 22C-12 30 -48 24 -58 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.8"></path><path d="M-28 -10H-8V6H-28Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></path><path d="M-32 -10L-18 -24L-4 -10Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.4"></path><path d="M-20 6V-2H-15V6" fill="none" stroke="#5a4327" stroke-width="1"></path><path d="M12 -8V-42" stroke="#5a4327" stroke-width="1.6"></path><path d="M12 -42L30 -36L12 -30Z" fill="#9b2c22"></path><use href="#log-map-tree" transform="translate(36 -8) scale(0.75)"></use><path d="M54 12H86M60 12V20M70 12V20M80 12V20" stroke="#5a4327" stroke-width="1.4" fill="none"></path></g>
<g id="log-map-lighthouse"><path d="M-40 10L-34 -4L-20 -8L-10 -4L0 -10L14 -6L28 -8L40 10Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.6"></path><path d="M-8 -6L-5 -56H5L8 -6Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></path><path d="M-7.2 -20H7.2L6.6 -30H-6.6Z M-6 -42H6L5.6 -50H-5.6Z" fill="#9b2c22"></path><path d="M-9 -56H9" stroke="#5a4327" stroke-width="2"></path><rect x="-5" y="-66" width="10" height="10" fill="#f2c76b" stroke="#5a4327" stroke-width="1.2"></rect><path d="M-7 -66L0 -74L7 -66Z" fill="#5a4327"></path><path d="M8 -62L48 -74M8 -60L48 -48M-8 -62L-48 -74M-8 -60L-48 -48" stroke="#c8963e" stroke-width="1.6" stroke-dasharray="4 3"></path><path d="M-56 16q8 -5 16 0t16 0t16 0t16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path></g>
<g id="log-map-ship"><path d="M-22 0H22L15 9H-15Z" fill="#5a4327"></path><path d="M0 0V-32M0 -30L17 -6H0ZM0 -24L-14 -6H0Z" stroke="#5a4327" fill="#f1e2c0" stroke-width="1.4"></path><path d="M0 -32L9 -28L0 -24" fill="#9b2c22"></path><path d="M-30 13q6 -4 12 0t12 0M8 13q6 -4 12 0t12 0" stroke="#5a4327" fill="none" stroke-width="1"></path></g>
<g id="log-map-dolphin"><path d="M-26 8C-20 -14 6 -22 24 -8" stroke="#5a4327" stroke-width="9" stroke-linecap="round" fill="none"></path><path d="M-26 8C-20 -14 6 -22 24 -8" stroke="#f1e2c0" stroke-width="5.5" stroke-linecap="round" fill="none"></path><path d="M-4 -15L2 -27L7 -15" fill="#5a4327"></path><path d="M24 -8L33 -4" stroke="#5a4327" stroke-width="3" stroke-linecap="round"></path><path d="M-27 9L-36 4M-27 9L-31 18" stroke="#5a4327" stroke-width="3" stroke-linecap="round"></path><circle cx="18" cy="-11" r="1.3" fill="#5a4327"></circle></g>
<g id="log-map-dolphins"><use href="#log-map-dolphin"></use><use href="#log-map-dolphin" transform="translate(46 12) scale(0.8)"></use><path d="M-46 16q8 -5 16 0t16 0t16 0t16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path><path d="M36 -10l-3 -6M42 -12l0 -7" stroke="#5a4327" stroke-width="1"></path></g>
<g id="log-map-bottle"><g transform="rotate(-25)"><path d="M-18 -8H10C16 -8 18 -4 18 0C18 4 16 8 10 8H-18C-22 8 -24 4 -24 0C-24 -4 -22 -8 -18 -8Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></path><path d="M18 -4H28V4H18" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></path><rect x="28" y="-3" width="6" height="6" fill="#8a5a14" stroke="#5a4327" stroke-width="0.8"></rect><rect x="-16" y="-4" width="26" height="8" rx="3" fill="#e8d3a4" stroke="#5a4327" stroke-width="0.8"></rect><path d="M-3 -4V4" stroke="#9b2c22" stroke-width="1.6"></path></g><path d="M-34 16q7 -5 14 0t14 0t14 0t14 0t14 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path></g>
<g id="log-map-serpent"><g stroke="#2a4fa3" fill="none" stroke-width="2.4" stroke-linecap="round"><path d="M-40 0c6 -20 18 -20 24 0M-10 0c6 -15 16 -15 22 0M18 0c5 -10 12 -10 16 -1"></path><path d="M-40 0c-5 -8 -12 -8 -15 -1" stroke-width="2.8"></path><path d="M-50 -12l-4 -6M-46 -14l0 -7" stroke-width="1.4"></path></g><path d="M-46 4q8 -3 16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none"></path></g>
<g id="log-map-clam"><ellipse cx="0" cy="18" rx="40" ry="8" fill="url(#log-map-hatch-sea)" stroke="#7a5a35" stroke-width="0.8"></ellipse><path d="M-26 6C-24 22 24 22 26 6Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.5"></path><path d="M-14 8L-12 18M0 8V20M14 8L12 18" stroke="#5a4327" stroke-width="0.9"></path><path d="M-24 4C-26 -20 20 -30 26 -10Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.5"></path><circle cx="0" cy="4" r="7" fill="#fff8dc" stroke="#5a4327" stroke-width="1.2"></circle><path d="M-3 2l2 -2" stroke="#5a4327" stroke-width="1"></path><path d="M0 -10V-17M13 -4L18 -8M-13 -4L-18 -8" stroke="#c8963e" stroke-width="1.4"></path></g>
<g id="log-map-whale"><path d="M-50 8C-40 -18 20 -22 44 4C30 2 -20 4 -50 8Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.6"></path><path d="M44 4L58 -8M44 4L60 8" stroke="#5a4327" stroke-width="3" stroke-linecap="round"></path><circle cx="-34" cy="-2" r="1.6" fill="#5a4327"></circle><path d="M-20 -16C-24 -32 -36 -36 -42 -30M-20 -16C-16 -34 -6 -38 2 -32M-20 -16V-42" stroke="#2a4fa3" stroke-width="1.6" fill="none"></path><circle cx="-44" cy="-26" r="1.4" fill="#2a4fa3"></circle><circle cx="4" cy="-28" r="1.4" fill="#2a4fa3"></circle><path d="M-64 14q8 -5 16 0t16 0t16 0t16 0t16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path></g>
<g id="log-map-anchor"><circle cx="0" cy="-30" r="5" fill="none" stroke="#5a4327" stroke-width="2.2"></circle><path d="M0 -25V22" stroke="#5a4327" stroke-width="3"></path><path d="M-14 -16H14" stroke="#5a4327" stroke-width="3" stroke-linecap="round"></path><path d="M-22 6C-20 20 -8 24 0 24C8 24 20 20 22 6" stroke="#5a4327" stroke-width="3" fill="none"></path><path d="M-22 6L-26 -1M-22 6L-15 4M22 6L26 -1M22 6L15 4" stroke="#5a4327" stroke-width="2.4" stroke-linecap="round"></path><path d="M5 -30C20 -26 22 -10 10 -4C-2 2 4 14 14 16" stroke="#8a5a14" stroke-width="1.6" fill="none"></path></g>
<g id="log-map-tentacle"><ellipse cx="0" cy="10" rx="22" ry="6" fill="none" stroke="#7a5a35" stroke-width="0.9" stroke-dasharray="3 3"></ellipse><path d="M0 10C-4 -10 10 -26 2 -40C-4 -50 -16 -48 -14 -38" stroke="#5a4327" stroke-width="8" stroke-linecap="round" fill="none"></path><path d="M0 10C-4 -10 10 -26 2 -40C-4 -50 -16 -48 -14 -38" stroke="#f1e2c0" stroke-width="4.5" stroke-linecap="round" fill="none"></path><circle cx="-5" cy="-6" r="1.4" fill="#5a4327"></circle><circle cx="0" cy="-18" r="1.4" fill="#5a4327"></circle><circle cx="-1" cy="-32" r="1.2" fill="#5a4327"></circle></g>
<g id="log-map-turtle"><ellipse rx="40" ry="10" cy="4" fill="none" stroke="#7a5a35" stroke-width="0.8" stroke-dasharray="3 4" opacity="0.6"></ellipse><path d="M14 -16C26 -30 40 -30 44 -24C34 -22 24 -16 18 -12Z M14 16C26 30 40 30 44 24C34 22 24 16 18 12Z M-18 -14C-26 -24 -34 -24 -36 -20C-30 -18 -24 -14 -20 -10Z M-18 14C-26 24 -34 24 -36 20C-30 18 -24 14 -20 10Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.3"></path><ellipse rx="26" ry="20" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.6"></ellipse><path d="M-8 -8H8L14 0L8 8H-8L-14 0Z M-8 -8L-14 -16M8 -8L14 -16M14 0H26M8 8L14 16M-8 8L-14 16M-14 0H-26" stroke="#5a4327" stroke-width="1" fill="none"></path><ellipse cx="34" cy="0" rx="9" ry="7" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></ellipse><circle cx="37" cy="-2" r="1.3" fill="#5a4327"></circle><circle cx="-4" cy="-14" r="1.2" fill="#7a5a35"></circle><circle cx="10" cy="12" r="1.2" fill="#7a5a35"></circle></g>
<g id="log-map-gulls"><path d="M-20 0q6 -8 12 0q6 -8 12 0M10 -16q5 -6 10 0q5 -6 10 0M-4 -30q4 -5 8 0q4 -5 8 0" stroke="#5a4327" stroke-width="1.6" fill="none" stroke-linecap="round"></path></g>
<g id="log-map-wreck"><g transform="rotate(-16)"><path d="M-34 0H26L18 12H-26Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.6"></path><path d="M26 0L30 -6L34 2L28 6" stroke="#5a4327" stroke-width="1.2" fill="none"></path><path d="M-20 0V-10M-10 0V-14M0 0V-12M10 0V-9" stroke="#5a4327" stroke-width="1.4"></path><path d="M-6 0V-30L0 -38" stroke="#5a4327" stroke-width="2" fill="none"></path><path d="M-6 -28L10 -22L2 -16L8 -10L-6 -12Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1"></path></g><path d="M-48 14q8 -5 16 0t16 0t16 0t16 0t16 0t16 0" stroke="#5a4327" stroke-width="1" fill="none" opacity="0.7"></path></g>
<g id="log-map-tail"><g stroke="#5a4327" fill="#e3cf9f" stroke-width="3" stroke-linejoin="round"><path d="M0 0C-12 -40 -54 -56 -84 -44C-56 -36 -28 -16 -12 14Z"></path><path d="M0 0C12 -40 54 -56 84 -44C56 -36 28 -16 12 14Z"></path><path d="M-12 14C-8 40 -10 60 -16 80M12 14C8 40 10 60 16 80" fill="none"></path><path d="M-70 82q18 -8 36 0t36 0t36 0t36 0" fill="none" stroke-width="2"></path><path d="M-50 -60l-4 -10M-30 -64l0 -12M40 -62l6 -10" fill="none" stroke-width="1.6"></path></g></g>
<g id="log-map-coils"><g stroke="#2a4fa3" fill="none" stroke-width="5" stroke-linecap="round"><path d="M-120 0c16 -60 54 -60 70 0M-36 0c14 -46 46 -46 60 0M38 0c12 -32 36 -32 46 -4"></path><path d="M-120 0c-14 -24 -36 -24 -46 -4"></path><path d="M-150 14q20 -8 40 0t40 0t40 0t40 0t40 0t40 0" stroke="#5a4327" stroke-width="2"></path></g></g>
<g id="log-map-narwhal"><path d="M-40 10C-30 -12 10 -18 34 -4" stroke="#5a4327" stroke-width="12" stroke-linecap="round" fill="none"></path><path d="M-40 10C-30 -12 10 -18 34 -4" stroke="#f1e2c0" stroke-width="8" stroke-linecap="round" fill="none"></path><path d="M34 -4L86 -36" stroke="#5a4327" stroke-width="2.4" stroke-linecap="round"></path><path d="M44 -10l2 4M54 -16l2 4M64 -22l2 4M74 -28l2 4" stroke="#5a4327" stroke-width="1"></path><path d="M-41 11L-53 3M-41 11L-49 23" stroke="#5a4327" stroke-width="4" stroke-linecap="round"></path><circle cx="26" cy="-7" r="1.5" fill="#5a4327"></circle><circle cx="-8" cy="-8" r="1.3" fill="#7a5a35"></circle><circle cx="4" cy="-4" r="1.3" fill="#7a5a35"></circle></g>
<g id="log-map-narwhals"><use href="#log-map-narwhal"></use><use href="#log-map-narwhal" transform="translate(-60 42) scale(0.8)"></use><use href="#log-map-narwhal" transform="translate(64 50) scale(0.7)"></use><path d="M-120 34q14 -7 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0" stroke="#5a4327" stroke-width="1.6" fill="none"></path></g>
<g id="log-map-kraken"><g fill="none" stroke-linecap="round"><path d="M-36 18C-70 10 -96 -30 -78 -60C-66 -80 -44 -70 -52 -56M36 18C70 10 96 -30 78 -60C66 -80 44 -70 52 -56M-20 22C-40 40 -30 70 -60 76M20 22C40 40 30 70 60 76" stroke="#5a4327" stroke-width="10"></path><path d="M-36 18C-70 10 -96 -30 -78 -60C-66 -80 -44 -70 -52 -56M36 18C70 10 96 -30 78 -60C66 -80 44 -70 52 -56M-20 22C-40 40 -30 70 -60 76M20 22C40 40 30 70 60 76" stroke="#f1e2c0" stroke-width="6"></path></g><circle cx="-72" cy="-20" r="2" fill="#5a4327"></circle><circle cx="-80" cy="-42" r="2" fill="#5a4327"></circle><circle cx="72" cy="-20" r="2" fill="#5a4327"></circle><circle cx="80" cy="-42" r="2" fill="#5a4327"></circle><path d="M-40 20C-44 -40 44 -40 40 20Z" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="2.4"></path><ellipse cx="-14" cy="-4" rx="6" ry="4" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></ellipse><ellipse cx="14" cy="-4" rx="6" ry="4" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></ellipse><path d="M-14 -7V-1M14 -7V-1" stroke="#5a4327" stroke-width="2"></path><path d="M-110 20q14 -8 28 0t28 0t28 0t28 0t28 0t28 0t28 0t28 0" stroke="#5a4327" stroke-width="2" fill="none"></path></g>
<g id="log-map-albatross"><path d="M0 0C-24 -10 -70 -14 -110 0C-72 -4 -34 4 -8 8Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="2"></path><path d="M0 0C24 -10 70 -14 110 0C72 -4 34 4 8 8Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="2"></path><path d="M-110 0C-98 -4 -88 -4 -78 -2L-82 2Z M110 0C98 -4 88 -4 78 -2L82 2Z" fill="#5a4327"></path><ellipse cx="0" cy="4" rx="14" ry="7" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.8"></ellipse><circle cx="15" cy="0" r="5" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.6"></circle><path d="M19 -1L30 2L19 4Z" fill="#c8963e" stroke="#5a4327" stroke-width="0.8"></path><path d="M-14 4L-26 8L-14 10Z" fill="#f1e2c0" stroke="#5a4327" stroke-width="1.4"></path></g>
<g id="log-map-treasure"><ellipse rx="96" ry="34" fill="url(#log-map-hatch)" stroke="#5a4327" stroke-width="1.8"></ellipse><ellipse rx="112" ry="44" fill="none" stroke="#7a5a35" stroke-width="0.8" opacity="0.5"></ellipse><use href="#log-map-tree" transform="translate(-60 -10) scale(0.9)"></use><g transform="translate(62 -6)"><path d="M-24 -10H24V12H-24Z" fill="#8a5a14" stroke="#2b1d0e" stroke-width="1.5"></path><path d="M-24 -10C-24 -26 24 -26 24 -10Z" fill="#a8732a" stroke="#2b1d0e" stroke-width="1.5"></path><path d="M-24 -2H24M-11 -22V12M11 -22V12" stroke="#d8b425" stroke-width="2.4"></path></g></g>
</defs></svg>`;
