/* Game of Life cursor trail.
   Moving the mouse drops gliders into the page margins; they evolve under
   Conway's rules (B3/S23) and are absorbed when they hit the text column. */
(function () {
  'use strict';

  var CELL = 10;              // grid cell size in px
  var STEP_MS = 90;           // time between generations
  var STAMP_EVERY = 60;       // px of pointer travel between stamps
  var COLUMN_PAD = 24;        // keep cells this far from the text column
  var COLOR = '26, 75, 142';  // matches the site's link blue (#1a4b8e)
  var STORAGE_KEY = 'life-cursor';

  // Glider heading down-right; other headings are reflections of this one.
  var GLIDER = [[0, 1, 0], [0, 0, 1], [1, 1, 1]];

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  var canvas, ctx, cols, rows, grid, next, age, column;
  var running = false, lastStep = 0, travel = 0, lastX = null, lastY = null;
  var enabled = readEnabled();

  function readEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'off'; } catch (e) { return true; }
  }
  function saveEnabled(on) {
    try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* storage blocked */ }
  }

  // Return the glider pattern to stamp for a pointer moving by (dx, dy),
  // so the glider flies roughly the way the cursor was going.
  function orientGlider(dx, dy) {
    // Gliders only travel diagonally, so each axis just takes the pointer's sign.
    var g = GLIDER;
    if (dy < 0) g = g.slice().reverse();                                       // fly up
    if (dx < 0) g = g.map(function (row) { return row.slice().reverse(); });   // fly left
    return g;
  }

  function setup() {
    canvas = document.createElement('canvas');
    canvas.className = 'life-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(window.innerWidth / CELL);
    rows = Math.ceil(window.innerHeight / CELL);
    grid = new Uint8Array(cols * rows);
    next = new Uint8Array(cols * rows);
    age = new Uint16Array(cols * rows);
    var r = document.body.getBoundingClientRect();
    column = { left: r.left - COLUMN_PAD, right: r.right + COLUMN_PAD };
  }

  function inColumn(c) {
    var x = c * CELL;
    return x + CELL > column.left && x < column.right;
  }

  function onMove(e) {
    if (!enabled) return;
    if (lastX !== null) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY;
      travel += Math.hypot(dx, dy);
      if (travel >= STAMP_EVERY) {
        travel = 0;
        stamp(orientGlider(dx, dy), Math.floor(e.clientX / CELL) - 1, Math.floor(e.clientY / CELL) - 1);
      }
    }
    lastX = e.clientX; lastY = e.clientY;
  }

  function stamp(pattern, c0, r0) {
    if (inColumn(c0) || inColumn(c0 + pattern[0].length)) return;
    for (var r = 0; r < pattern.length; r++) {
      for (var c = 0; c < pattern[r].length; c++) {
        var cc = c0 + c, rr = r0 + r;
        if (pattern[r][c] && cc >= 0 && rr >= 0 && cc < cols && rr < rows) {
          grid[rr * cols + cc] = 1;
          age[rr * cols + cc] = 0;
        }
      }
    }
    wake();
  }

  function step() {
    var alive = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var n = 0;
        for (var dr = -1; dr <= 1; dr++) {
          var rr = r + dr;
          if (rr < 0 || rr >= rows) continue;
          for (var dc = -1; dc <= 1; dc++) {
            var cc = c + dc;
            if ((dr || dc) && cc >= 0 && cc < cols) n += grid[rr * cols + cc];
          }
        }
        var i = r * cols + c;
        var live = grid[i] ? (n === 2 || n === 3) : n === 3;
        if (live && inColumn(c)) live = false;   // the text column absorbs cells
        next[i] = live ? 1 : 0;
        age[i] = live ? (grid[i] ? Math.min(age[i] + 1, 999) : 0) : 0;
        alive += next[i];
      }
    }
    var t = grid; grid = next; next = t;
    return alive;
  }

  function draw() {
    ctx.clearRect(0, 0, cols * CELL, rows * CELL);
    for (var i = 0; i < grid.length; i++) {
      if (!grid[i]) continue;
      // Newborn cells are bright, long-lived ones settle to a soft tint.
      ctx.fillStyle = 'rgba(' + COLOR + ',' + Math.max(0.25, 0.7 - age[i] * 0.01) + ')';
      ctx.fillRect((i % cols) * CELL + 1, Math.floor(i / cols) * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  function frame(now) {
    if (document.hidden) { running = false; return; }
    if (now - lastStep >= STEP_MS) {
      lastStep = now;
      var alive = step();
      draw();
      if (!alive) { running = false; return; }   // idle until the next stamp
    }
    requestAnimationFrame(frame);
  }

  function wake() {
    if (!running && enabled) { running = true; requestAnimationFrame(frame); }
  }

  function bindToggle() {
    var btn = document.getElementById('life-toggle');
    if (!btn) return;
    var render = function () {
      btn.textContent = 'Life cursor: ' + (enabled ? 'on' : 'off');
      btn.setAttribute('aria-pressed', String(enabled));
    };
    btn.hidden = false;
    render();
    btn.addEventListener('click', function () {
      enabled = !enabled;
      saveEnabled(enabled);
      if (!enabled) { grid.fill(0); draw(); }
      render();
    });
  }

  // Touch screens have no hover trail, and reduced-motion users opted out of animation.
  if (reduced || !finePointer) return;
  setup();
  bindToggle();
})();
